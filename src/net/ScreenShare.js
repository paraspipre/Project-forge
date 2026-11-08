import { ICE } from './VoiceChat.js';

// One-to-many screen sharing for the Meetup Hall stage: the presenter sends their screen (video
// only, ~10 fps) to each viewer over its own WebRTC connection, signalled through MQTT events
// ('stage:rtc'). Viewers ask for the stream with 'stage:want' when they are in the hall.

const MAX_VIEWERS = 12;

export class ScreenShare {
  constructor(game) {
    this.game = game;
    this.stream = null;        // presenter: my screen
    this.out = new Map();      // presenter: viewer id -> pc
    this.inc = null;           // viewer: { from, pc, pending }
    this.video = null;         // viewer: <video> with the presenter's screen
    this.onVideo = null;       // (video | null) => void
  }

  // ---------------------------------------------------------------- presenter

  async start() {
    if (!navigator.mediaDevices?.getDisplayMedia) { this.game.hud.toast('Screen sharing is not supported on this device. Share a link or slide images instead.', 4500); return false; }
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 10, max: 15 }, width: { max: 1600 }, height: { max: 900 } }, audio: false });
    } catch { return false; }
    const track = this.stream.getVideoTracks()[0];
    track.contentHint = 'detail';
    track.onended = () => this.game.social?.hall?.stopScreen();
    this._localVideo(this.stream);
    return true;
  }

  stop() {
    for (const id of [...this.out.keys()]) this._closeOut(id);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this._setVideo(null);
  }

  async _offer(to) {
    if (!this.stream || this.out.has(to) || this.out.size >= MAX_VIEWERS) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const link = { pc, pending: [] };
    this.out.set(to, link);
    for (const t of this.stream.getVideoTracks()) pc.addTrack(t, this.stream);
    pc.onicecandidate = (e) => { if (e.candidate) this._send(to, { k: 'ice', c: e.candidate.toJSON(), dir: 'out' }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this._closeOut(to); };
    try {
      const o = await pc.createOffer();
      await pc.setLocalDescription(o);
      this._send(to, { k: 'offer', sdp: pc.localDescription.sdp });
    } catch { this._closeOut(to); }
  }

  _closeOut(id) {
    const l = this.out.get(id);
    if (!l) return;
    try { l.pc.close(); } catch {}
    this.out.delete(id);
  }

  // ---------------------------------------------------------------- viewer

  want(presenterId) {
    if (this.inc && this.inc.from === presenterId && performance.now() - this.inc.t < 12000) return;
    if (this.inc && this.inc.from === presenterId && this.inc.ok) return;
    this.game.net?.event('stage:want', { to: presenterId });
    this.inc = this.inc && this.inc.from === presenterId ? { ...this.inc, t: performance.now() } : { from: presenterId, pc: null, pending: [], t: performance.now() };
  }

  dropIncoming() {
    if (this.inc?.pc) try { this.inc.pc.close(); } catch {}
    this.inc = null;
    if (!this.stream) this._setVideo(null);
  }

  // ---------------------------------------------------------------- signalling

  async onNet(peer, type, d) {
    const me = this.game.profile.id;
    if (d.to !== me) return;
    if (type === 'stage:want') { this._offer(peer.id); return; }
    if (type !== 'stage:rtc') return;
    try {
      if (d.k === 'offer') {
        if (this.inc?.pc) try { this.inc.pc.close(); } catch {}
        const pc = new RTCPeerConnection({ iceServers: ICE });
        this.inc = { from: peer.id, pc, pending: [], t: performance.now() };
        const inc = this.inc;
        pc.onicecandidate = (e) => { if (e.candidate) this._send(peer.id, { k: 'ice', c: e.candidate.toJSON(), dir: 'in' }); };
        pc.ontrack = (e) => this._localVideo(e.streams[0] || new MediaStream([e.track]));
        pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') inc.ok = true; if (pc.connectionState === 'failed') { if (this.inc === inc) this.inc = null; } };
        await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        this._send(peer.id, { k: 'answer', sdp: pc.localDescription.sdp });
        for (const c of inc.pending) await pc.addIceCandidate(c).catch(() => {});
        inc.pending = [];
      } else if (d.k === 'answer') {
        const l = this.out.get(peer.id);
        if (!l) return;
        await l.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
        for (const c of l.pending) await l.pc.addIceCandidate(c).catch(() => {});
        l.pending = [];
      } else if (d.k === 'ice') {
        // 'out' candidates come from a presenter (for my incoming link); 'in' from a viewer
        const l = d.dir === 'out' ? (this.inc && this.inc.from === peer.id ? this.inc : null) : this.out.get(peer.id);
        if (!l || !l.pc) return;
        if (l.pc.remoteDescription) await l.pc.addIceCandidate(d.c).catch(() => {});
        else l.pending.push(d.c);
      }
    } catch (e) { console.warn('screen share signal', e); }
  }

  _send(to, msg) { this.game.net?.event('stage:rtc', { to, ...msg }); }

  _localVideo(stream) {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.autoplay = true;
    v.srcObject = stream;
    v.play().catch(() => {});
    this._setVideo(v);
  }

  _setVideo(v) {
    if (this.video && this.video !== v) this.video.srcObject = null;
    this.video = v;
    this.onVideo?.(v);
  }
}
