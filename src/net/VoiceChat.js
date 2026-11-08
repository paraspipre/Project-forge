// Proximity voice chat: peer-to-peer WebRTC audio between players in the same room, signalled
// through the game's MQTT channel. Opt-in: your mic is off until you switch it on; listening is on
// unless you switch it off. Voices get quieter with distance and pan left/right; anyone can be muted.
// Connections only exist between players within ~55 m where at least one of them is talking.

export const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // free public relay for networks that block direct connections (best effort)
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];
const NEAR = 55, FAR = 80;

export class VoiceChat {
  constructor(game) {
    this.game = game;
    this.micOn = false;
    this.listenOn = true;
    try { this.listenOn = localStorage.getItem('pb.listen') !== '0'; } catch {}
    this.links = new Map();     // peer id -> link
    this.muted = new Set();
    this.stream = null;
    this.t = 0;
    this.level = 0;
  }

  // 2 = mic on, 4 = listening, 8 = on the Meetup Hall stage (heard through the PA by the whole hall)
  get flags() { return (this.micOn ? 2 : 0) | (this.listenOn ? 4 : 0) | (this.onStage ? 8 : 0); }

  async setMic(on) {
    if (on === this.micOn) return true;
    if (on) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        this.game.hud.toast('Microphone blocked. Allow mic access in the browser to talk.', 4000);
        return false;
      }
      this.micOn = true;
      this.game.audio.unlock();
      const c = this.game.audio.ctx;
      if (c) {
        this.micAnalyser = c.createAnalyser();
        this.micAnalyser.fftSize = 512;
        c.createMediaStreamSource(this.stream).connect(this.micAnalyser);
      }
      for (const l of this.links.values()) l.sender?.replaceTrack(this.stream.getAudioTracks()[0]).catch(() => {});
      this.game.hud.toast('Mic on — players near you can hear you. (V to toggle)', 3000);
    } else {
      this.micOn = false;
      for (const l of this.links.values()) l.sender?.replaceTrack(null).catch(() => {});
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.micAnalyser = null;
      this.level = 0;
    }
    this.game.sendT = 0; // tell everyone right away
    return true;
  }

  setListen(on) {
    this.listenOn = on;
    try { localStorage.setItem('pb.listen', on ? '1' : '0'); } catch {}
    this.game.sendT = 0;
  }

  toggleMute(id) {
    if (this.muted.has(id)) this.muted.delete(id); else this.muted.add(id);
    return this.muted.has(id);
  }

  _wants(r) {
    if (!r.visible || this.muted.has(r.peer.id)) return false;
    const theyMic = !!(r.flags & 2), theyListen = r.flags == null ? true : !!(r.flags & 4);
    return (this.micOn && theyListen) || (theyMic && this.listenOn);
  }

  update(dt) {
    const g = this.game;
    if (!g.net) { if (this.links.size) this.closeAll(); return; }
    this.t -= dt;
    const me = g.player.pos;
    if (this.t <= 0) {
      this.t = 1;
      for (const r of g.remotes.values()) {
        const id = r.peer.id;
        const d = r.pos.distanceTo(me);
        const link = this.links.get(id);
        if (!link && d < NEAR && this._wants(r) && g.profile.id < id) this._open(id, true);
        if (link && (d > FAR || !this._wants(r))) { link.away = (link.away || 0) + 1; if (link.away > 6) this._close(id); }
        else if (link) link.away = 0;
      }
      for (const id of [...this.links.keys()]) if (!g.remotes.has(id)) this._close(id);
    }
    // proximity volume + stereo position, speaking indicators
    const camYaw = g.camRig?.yaw || 0;
    for (const l of this.links.values()) {
      const r = g.remotes.get(l.id);
      if (!r || !l.gain) continue;
      const dx = r.pos.x - me.x, dz = r.pos.z - me.z, d = Math.hypot(dx, dz);
      const hall = g.social?.hall;
      const pa = !!(r.flags & 8) && hall && hall.inside(me) && hall.inside(r.pos);
      const vol = this.listenOn && !this.muted.has(l.id) ? (pa ? 1 : Math.max(0, Math.min(1, 1.15 - d / 45))) : 0;
      l.gain.gain.setTargetAtTime(vol * 1.4, g.audio.ctx.currentTime, 0.1);
      if (l.pan) {
        const right = -Math.cos(camYaw) * dx + Math.sin(camYaw) * dz;
        l.pan.pan.setTargetAtTime(pa ? 0 : Math.max(-0.8, Math.min(0.8, right / Math.max(d, 4))), g.audio.ctx.currentTime, 0.1);
      }
      if (l.analyser) {
        const a = l.buf || (l.buf = new Uint8Array(l.analyser.fftSize));
        l.analyser.getByteTimeDomainData(a);
        let s = 0;
        for (let i = 0; i < a.length; i += 4) { const v = (a[i] - 128) / 128; s += v * v; }
        r.speaking = Math.sqrt(s / (a.length / 4)) > 0.02 && vol > 0;
      }
    }
    if (this.micAnalyser) {
      const a = this._mb || (this._mb = new Uint8Array(this.micAnalyser.fftSize));
      this.micAnalyser.getByteTimeDomainData(a);
      let s = 0;
      for (let i = 0; i < a.length; i += 4) { const v = (a[i] - 128) / 128; s += v * v; }
      this.level = Math.sqrt(s / (a.length / 4));
    }
  }

  _open(id, initiator) {
    const g = this.game;
    g.audio.unlock();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const link = { id, pc, initiator, pending: [] };
    this.links.set(id, link);
    pc.onicecandidate = (e) => { if (e.candidate) this._send(id, { k: 'ice', c: e.candidate.toJSON() }); };
    pc.ontrack = (e) => this._attach(link, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { this._close(id); }
      if (pc.connectionState === 'connected') link.ok = true;
    };
    if (initiator) {
      const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      link.sender = tr.sender;
      if (this.stream) tr.sender.replaceTrack(this.stream.getAudioTracks()[0]);
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => this._send(id, { k: 'offer', sdp: pc.localDescription.sdp })).catch(() => this._close(id));
    }
    return link;
  }

  _attach(link, stream) {
    const c = this.game.audio.ctx;
    if (!c || link.gain) return;
    // Chrome only pulls a remote WebRTC stream into WebAudio if a media element also consumes it
    const el = new Audio();
    el.srcObject = stream; el.muted = true; el.play().catch(() => {});
    link.el = el;
    const src = c.createMediaStreamSource(stream);
    link.gain = c.createGain(); link.gain.gain.value = 0;
    link.analyser = c.createAnalyser(); link.analyser.fftSize = 256;
    src.connect(link.analyser);
    src.connect(link.gain);
    if (c.createStereoPanner) { link.pan = c.createStereoPanner(); link.gain.connect(link.pan); link.pan.connect(this.game.audio.master); }
    else link.gain.connect(this.game.audio.master);
  }

  async onSignal(peer, data) {
    if (data.to !== this.game.profile.id) return;
    const id = peer.id;
    let link = this.links.get(id);
    try {
      if (data.k === 'offer') {
        if (link) this._close(id);
        if (!this.micOn && !this.listenOn) return;
        link = this._open(id, false);
        await link.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        const tr = link.pc.getTransceivers()[0];
        if (tr) { tr.direction = 'sendrecv'; link.sender = tr.sender; if (this.stream) await tr.sender.replaceTrack(this.stream.getAudioTracks()[0]); }
        const ans = await link.pc.createAnswer();
        await link.pc.setLocalDescription(ans);
        this._send(id, { k: 'answer', sdp: link.pc.localDescription.sdp });
        for (const c of link.pending) await link.pc.addIceCandidate(c).catch(() => {});
        link.pending = [];
      } else if (data.k === 'answer' && link) {
        await link.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        for (const c of link.pending) await link.pc.addIceCandidate(c).catch(() => {});
        link.pending = [];
      } else if (data.k === 'ice' && link) {
        if (link.pc.remoteDescription) await link.pc.addIceCandidate(data.c).catch(() => {});
        else link.pending.push(data.c);
      }
    } catch (e) { console.warn('voice signal', e); }
  }

  _send(to, msg) { this.game.net?.event('rtc', { to, ...msg }); }

  _close(id) {
    const l = this.links.get(id);
    if (!l) return;
    try { l.pc.close(); } catch {}
    try { l.gain?.disconnect(); l.pan?.disconnect(); } catch {}
    if (l.el) l.el.srcObject = null;
    const r = this.game.remotes.get(id);
    if (r) r.speaking = false;
    this.links.delete(id);
  }

  closeAll() { for (const id of [...this.links.keys()]) this._close(id); }

  connectedCount() { let n = 0; for (const l of this.links.values()) if (l.ok) n++; return n; }
}
