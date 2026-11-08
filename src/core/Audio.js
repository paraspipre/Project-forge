// Everything you hear is synthesised: a lo-fi Carnatic-flavoured score (raga Mohanam plucks over a
// tanpura drone and soft tabla), city ambience with birds and the morning koel, the never-ending
// horn concerto, scooter hum, UI sounds and "speech" blips for dialogue.

const MOHANAM = [0, 2, 4, 7, 9];   // Sa Ri Ga Pa Dha
const SA = 146.83;                  // D3

// Voice clips are keyed by FNV-1a of "speaker|text" (tools/gen_voices.py uses the same hash).
export function voiceKey(id, text) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(`${id}|${text}`)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// What a line sounds like without its stage directions and emoji.
export function speakable(text) {
  return String(text).replace(/\*[^*]*\*/g, ' ').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = true;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.voiceOn = true;
    this.trafficOn = true;
    this.lastHorn = 0;
    this.voiceSet = new Set();
    this.voiceCache = new Map();
    try {
      this.muted = localStorage.getItem('pb.mute') === '1';
      this.musicOn = localStorage.getItem('pb.music') !== '0';
      this.voiceOn = localStorage.getItem('pb.voice') !== '0';
      this.trafficOn = localStorage.getItem('pb.traffic') !== '0';
    } catch {}
    fetch('voice/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
      if (!m) return;
      this.voiceSet = new Set(m.keys || []);
      this.voiceGroups = m.groups || {};
    }).catch(() => {});
  }

  setTraffic(on) {
    this.trafficOn = on;
    try { localStorage.setItem('pb.traffic', on ? '1' : '0'); } catch {}
  }

  setVoices(on) {
    this.voiceOn = on;
    try { localStorage.setItem('pb.voice', on ? '1' : '0'); } catch {}
    if (!on) this.stopVoice();
  }

  async _voiceBuf(key) {
    if (this.voiceCache.has(key)) return this.voiceCache.get(key);
    const p = fetch(`voice/${key}.mp3`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((b) => this.ctx.decodeAudioData(b)).catch(() => null);
    this.voiceCache.set(key, p);
    if (this.voiceCache.size > 80) this.voiceCache.delete(this.voiceCache.keys().next().value);
    return p;
  }

  // Warm the cache with a character's lines (called when you get near them).
  prefetchVoices(id) {
    if (!this.ctx || !this.voiceOn || !this.voiceGroups?.[id]) return;
    for (const k of this.voiceGroups[id].slice(0, 12)) this._voiceBuf(k);
  }

  hasVoice(id, text) { return this.voiceSet.has(voiceKey(id, text)); }

  // Speak a line: the pre-rendered clip if we have one, else the browser's own voice (Indian English
  // where available). Resolves to { done: Promise, stop() } or null when silent.
  async speak(id, text, { pitch = 1, volume = 1, pan = 0, fallback = true } = {}) {
    if (!this.voiceOn || this.muted) return null;
    const clean = speakable(text);
    if (!clean) return null;
    const key = voiceKey(id, text);
    if (this.ctx && this.voiceSet.has(key)) {
      const buf = await this._voiceBuf(key);
      if (buf) {
        const c = this.ctx;
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.value = 1.15 * volume;
        let node = g;
        if (c.createStereoPanner && pan) { const pn = c.createStereoPanner(); pn.pan.value = pan; g.connect(pn); node = pn; }
        src.connect(g);
        node.connect(this.master);
        this._duck(true);
        const handle = {
          done: new Promise((res) => { src.onended = () => { this._duck(false); res(); }; }),
          stop: () => { try { src.stop(); } catch {} },
        };
        src.start();
        if (volume >= 0.9) this.current = handle;
        return handle;
      }
    }
    if (!fallback || !('speechSynthesis' in window)) return null;
    return this._browserSpeak(clean, pitch, volume);
  }

  _browserSpeak(text, pitch, volume) {
    const ss = window.speechSynthesis;
    const voices = ss.getVoices();
    const pickV = voices.find((v) => /en[-_]IN/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
    const u = new SpeechSynthesisUtterance(text);
    if (pickV) u.voice = pickV;
    u.lang = pickV?.lang || 'en-IN';
    u.pitch = Math.min(2, Math.max(0.5, pitch));
    u.rate = 1.02;
    u.volume = Math.min(1, volume);
    this._duck(true);
    const handle = {
      done: new Promise((res) => { u.onend = u.onerror = () => { this._duck(false); res(); }; setTimeout(res, 2500 + text.length * 120); }),
      stop: () => { try { ss.cancel(); } catch {} },
    };
    ss.cancel();
    ss.speak(u);
    if (volume >= 0.9) this.current = handle;
    return handle;
  }

  stopVoice() { this.current?.stop(); this.current = null; }

  _duck(on) {
    if (!this.ctx) return;
    this._ducks = Math.max(0, (this._ducks || 0) + (on ? 1 : -1));
    if (this.musicOn) this.music.gain.setTargetAtTime(this._ducks ? 0.1 : 0.32, this.ctx.currentTime, 0.25);
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(c.destination);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.32 : 0; this.music.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.5; this.amb.connect(this.master);
    this.club = c.createGain(); this.club.gain.value = 0; this.club.connect(this.music);
    // a soft room for the music
    this.verb = c.createConvolver();
    this.verb.buffer = this._impulse(2.2);
    const vg = c.createGain(); vg.gain.value = 0.35;
    this.verb.connect(vg); vg.connect(this.music);
    this.noise = this._noiseBuf();
    this._ambience();
    this._scooterVoice();
    this.step = 0;
    this.nextT = c.currentTime + 0.2;
    this.timer = setInterval(() => this._schedule(), 100);
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('pb.mute', m ? '1' : '0'); } catch {}
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    try { localStorage.setItem('pb.music', on ? '1' : '0'); } catch {}
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.3);
  }

  _impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    return b;
  }

  _noiseBuf() {
    const c = this.ctx, n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 * 0.5 + w * 0.5; }
    return b;
  }

  _loopNoise(filterType, freq, q, gain, bus) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(bus || this.amb);
    s.start();
    return { s, f, g };
  }

  _ambience() {
    this.cityHum = this._loopNoise('lowpass', 220, 0.5, 0.05);
    this.rainN = this._loopNoise('bandpass', 1800, 0.5, 0);
    this.rainLow = this._loopNoise('lowpass', 500, 0.5, 0);
    this.birdT = 0; this.honkT = 0;
  }

  _scooterVoice() {
    const c = this.ctx;
    this.sc = { o1: c.createOscillator(), o2: c.createOscillator(), g: c.createGain(), f: c.createBiquadFilter() };
    const s = this.sc;
    s.o1.type = 'triangle'; s.o2.type = 'sine';
    s.o1.frequency.value = 90; s.o2.frequency.value = 181;
    s.f.type = 'lowpass'; s.f.frequency.value = 700; s.f.Q.value = 0.5;
    s.g.gain.value = 0;
    s.o1.connect(s.f); s.o2.connect(s.f); s.f.connect(s.g); s.g.connect(this.sfx);
    s.o1.start(); s.o2.start();
  }

  scooter(on) {
    if (!this.ctx) return;
    this.sc.g.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.2);
    this._tone({ f: on ? 300 : 500, f2: on ? 900 : 200, dur: 0.35, type: 'sine', vol: 0.12 });
  }

  scooterSpeed(k) {
    if (!this.ctx) return;
    // only retune when the speed has really changed, and never pile up automation events
    if (Math.abs(k - (this._scK ?? -1)) < 0.04) return;
    this._scK = k;
    const t = this.ctx.currentTime;
    for (const [o, f] of [[this.sc.o1, 90 + k * 90], [this.sc.o2, 181 + k * 180]]) {
      o.frequency.cancelScheduledValues(t);
      o.frequency.setTargetAtTime(f, t, 0.15);
    }
  }

  // env: { night, rain, crowd (0..1 traffic density) }
  updateAmbience(env, dt) {
    if (!this.ctx) return;
    this._ambT = (this._ambT || 0) - dt;
    if (this._ambT <= 0) {
      this._ambT = 0.5;
      const t = this.ctx.currentTime;
      for (const [g, v] of [[this.cityHum.g, this.trafficOn ? 0.03 + (env.crowd || 0) * 0.05 : 0], [this.rainN.g, (env.rain || 0) * 0.16], [this.rainLow.g, (env.rain || 0) * 0.12]]) {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(v, t, 1);
      }
    }
    this.birdT -= dt;
    if (this.birdT < 0) {
      this.birdT = 1.5 + Math.random() * 5;
      if (env.rain < 0.3) {
        if (env.night > 0.6) this._crickets();
        else if (env.morning && Math.random() < 0.35) this._koel();
        else this._chirp();
      }
    }
  }

  // ------------------------------------------------------------- building blocks

  _tone({ f = 440, f2, dur = 0.2, type = 'sine', vol = 0.2, at = 0, attack = 0.005, bus, pan = 0, q }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (q) { const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = q; fl.Q.value = 2; o.connect(fl); node = fl; }
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = pan; node.connect(g); g.connect(p); p.connect(bus || this.sfx); } else { node.connect(g); g.connect(bus || this.sfx); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noise({ dur = 0.2, vol = 0.2, f = 1000, type = 'bandpass', q = 1, at = 0, bus }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // A soft plucked string (veena-ish): a few harmonics with a quick decay and a small slide into
  // the note (a gamaka) for the Carnatic flavour. Plain oscillators, so it is always in tune.
  _pluck(freq, at, vol = 0.18, bright = 3000) {
    const c = this.ctx;
    const t = at, dur = 1.6;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.value = Math.min(bright, freq * 5, 4000);
    lp.connect(out); out.connect(this.music); out.connect(this.verb);
    for (const [mult, type, v] of [[1, 'triangle', 1], [2, 'sine', 0.28], [3, 'sine', 0.1]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * mult * 0.97, t);
      o.frequency.exponentialRampToValueAtTime(freq * mult, t + 0.07);
      const g = c.createGain(); g.gain.value = v;
      o.connect(g); g.connect(lp);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  _drone(at, dur) {
    const c = this.ctx;
    for (const [mult, v] of [[1, 0.03], [1.5, 0.018], [2, 0.014], [0.5, 0.026]]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = SA * mult;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f); f.connect(g); g.connect(this.music);
      o.start(at); o.stop(at + dur + 0.1);
    }
  }

  _tabla(at, kind) {
    const c = this.ctx;
    if (kind === 'dha') {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(70, at + 0.25);
      const g = c.createGain(); g.gain.setValueAtTime(0.32, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      o.connect(g); g.connect(this.music); o.start(at); o.stop(at + 0.4);
    }
    const o2 = c.createOscillator(); o2.type = 'triangle';
    o2.frequency.setValueAtTime(kind === 'na' ? 880 : 620, at);
    const g2 = c.createGain(); g2.gain.setValueAtTime(kind === 'ti' ? 0.05 : 0.09, at); g2.gain.exponentialRampToValueAtTime(0.0001, at + (kind === 'na' ? 0.18 : 0.08));
    o2.connect(g2); g2.connect(this.music); o2.start(at); o2.stop(at + 0.2);
  }

  // Bar-by-bar generative score: 8-beat (adi tala-ish) cycles, gentle phrases over the drone.
  _schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn) { if (c) this.nextT = c.currentTime + 0.2; this.clubN = null; return; }
    this._clubSchedule();
    const clubOn = this._clubLevel() > 0.35;
    const beat = 60 / 84;
    while (this.nextT < c.currentTime + 0.4) {
      const s = this.step;
      const t = this.nextT;
      if (clubOn) { this.step++; this.nextT += beat; continue; }
      const inBar = s % 8;
      if (s % 32 === 0) this._drone(t, beat * 32 + 0.5);
      const pat = ['dha', 'ti', 'na', 'ti', 'dha', 'dha', 'na', 'ti'];
      if (s % 64 >= 8) this._tabla(t, pat[inBar]);
      if (s % 2 === 0 || Math.random() < 0.3) {
        // a wandering melody that leans on Sa and Pa at phrase ends
        if (!this.mel) this.mel = 0;
        this.mel += Math.round((Math.random() - 0.5) * 3);
        this.mel = Math.max(-2, Math.min(9, this.mel));
        if (inBar === 7) this.mel = Math.random() < 0.5 ? 5 : 3;
        const oct = Math.floor(this.mel / 5), deg = ((this.mel % 5) + 5) % 5;
        const f = SA * 2 * Math.pow(2, oct + MOHANAM[deg] / 12);
        if (Math.random() < 0.82) this._pluck(f, t + (Math.random() < 0.2 ? beat / 2 : 0), 0.15);
        if (inBar === 0 && Math.random() < 0.5) this._pluck(f / 2, t, 0.1, 1500);
      }
      this.step++;
      this.nextT += beat;
    }
  }

  // ------------------------------------------------------------- Namma Club
  // House at 118 BPM in the Mohanam scale. The beat grid is tied to the wall clock, so everyone at
  // the club hears the same bar at the same moment (and dance-off notes land on the beat).

  setClub(level) { this.clubLevel = level; }
  clubForce(on) { this.clubForced = on; }
  _clubLevel() { return this.clubForced ? 1 : this.clubLevel || 0; }

  clubDrop() {
    if (!this.ctx) return;
    this._noise({ dur: 1.4, vol: 0.3, f: 500, type: 'lowpass', bus: this.club });
    this._tone({ f: 1200, f2: 90, dur: 1.1, type: 'sawtooth', vol: 0.1, bus: this.club, q: 700 });
  }

  _clubSchedule() {
    const c = this.ctx, lvl = this._clubLevel(), t = c.currentTime;
    if (Math.abs(lvl - (this._clubG ?? -1)) > 0.02) {
      this._clubG = lvl;
      this.club.gain.cancelScheduledValues(t);
      this.club.gain.setTargetAtTime(lvl, t, 0.4);
    }
    if (lvl < 0.01) { this.clubN = null; return; }
    const stepMs = 60000 / 118 / 4;
    const off = t - Date.now() / 1000;
    if (this.clubOff == null || Math.abs(off - this.clubOff) > 0.03) this.clubOff = off;
    if (this.clubN == null) this.clubN = Math.ceil(Date.now() / stepMs);
    for (;;) {
      const at = (this.clubN * stepMs) / 1000 + this.clubOff;
      if (at > t + 0.3) break;
      if (at >= t) this._clubStep(this.clubN, at);
      this.clubN++;
    }
  }

  _clubStep(n, at) {
    const c = this.ctx, bus = this.club;
    const s = n % 16, bar = Math.floor(n / 16), sect = bar % 16;
    const h = (k) => (((n * 2654435761) ^ (k * 40503)) >>> 0) / 4294967296;   // same "random" for everyone
    const env = (node, vol, dur, a = 0.004) => {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      node.connect(g); g.connect(bus);
      return g;
    };
    const osc = (type, f, dur) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at); o.start(at); o.stop(at + dur + 0.05); return o; };
    const breakdown = sect >= 12 && sect < 14;
    // kick
    if (s % 4 === 0 && !breakdown) {
      const o = osc('sine', 150, 0.32);
      o.frequency.exponentialRampToValueAtTime(44, at + 0.12);
      env(o, 0.9, 0.32);
    }
    // clap and hats
    if ((s === 4 || s === 12) && !breakdown) {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.9;
      src.connect(f); env(f, 0.28, 0.16, 0.002); src.start(at, h(1)); src.stop(at + 0.2);
    }
    if (s % 4 === 2 || (s % 2 === 1 && h(2) < 0.4)) {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      src.connect(f); env(f, s % 4 === 2 ? 0.12 : 0.05, s % 4 === 2 ? 0.09 : 0.03, 0.002); src.start(at, h(3)); src.stop(at + 0.12);
    }
    // bass on the off-beats, following a four-chord loop in the scale
    const prog = [0, 0, 9, 9, 7, 7, 4, 2];
    const root = prog[Math.floor(bar / 2) % 8];
    if (s % 4 === 2 || (s === 15 && h(4) < 0.5)) {
      const o = osc('sawtooth', (SA / 2) * Math.pow(2, root / 12), 0.24);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 1;
      o.connect(f); env(f, breakdown ? 0.12 : 0.3, 0.22, 0.01);
    }
    // chord stabs
    if ((s === 0 || s === 6 || s === 10) && bar % 2 === 0) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; f.Q.value = 0.5;
      const g = env(f, 0.07, 0.3, 0.006);
      g.connect(this.verb);
      for (const k of [0, 7, 12, 16]) osc('triangle', SA * Math.pow(2, (root + k) / 12), 0.3).connect(f);
    }
    // a little Mohanam hook on top in the second half of each section
    if (sect % 8 >= 4 && s % 2 === 0 && h(5) < 0.55) {
      const deg = Math.floor(h(6) * 5), oct = h(7) < 0.25 ? 2 : 1;
      const o = osc('square', SA * 2 * oct * Math.pow(2, MOHANAM[deg] / 12), 0.16);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.4;
      o.connect(f);
      const g = env(f, 0.035, 0.16, 0.005);
      g.connect(this.verb);
    }
  }

  // ------------------------------------------------------------- sounds

  _spatial(x, z, max = 120) {
    const dx = x - this.listener.x, dz = z - this.listener.z;
    const d = Math.hypot(dx, dz);
    if (d > max) return null;
    const vol = Math.max(0, 1 - d / max) ** 1.6;
    // listener faces (sin yaw, cos yaw); right is (-cos, sin)
    const right = -Math.cos(this.listener.yaw) * dx + Math.sin(this.listener.yaw) * dz;
    return { vol, pan: Math.max(-1, Math.min(1, right / Math.max(d, 1))) };
  }

  // A horn note: a couple of tones through a gentle low-pass, with soft attack and release.
  _horn(freqs, dur, type, cutoff, vol, pan, at = 0) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.5;
    let node = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    lp.connect(g); node.connect(this.sfx);
    for (const f of freqs) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); }
  }

  horn(x, z, kind) {
    if (!this.ctx || !this.trafficOn) return;
    // the city honks, but not all at once: one horn at a time, only nearby ones
    const now = this.ctx.currentTime;
    if (now - this.lastHorn < (this.hornGap || 2.2)) return;
    const sp = this._spatial(x, z, 60);
    if (!sp || sp.vol < 0.08) return;
    this.lastHorn = now;
    const v = sp.vol * 0.07;
    if (kind === 'auto') {          // the rubber-bulb "pom pom"
      this._horn([392, 588], 0.13, 'sine', 1400, v, sp.pan);
      this._horn([392, 588], 0.15, 'sine', 1400, v, sp.pan, 0.2);
    } else if (kind === 'bus' || kind === 'tanker') {
      this._horn([196, 247], 0.5, 'sawtooth', 700, v * 0.7, sp.pan);
    } else if (kind === 'car') {
      this._horn([415, 523], 0.22, 'triangle', 1500, v, sp.pan);
    } else {                        // scooters: beep-beep
      this._horn([660, 830], 0.09, 'triangle', 1800, v * 0.8, sp.pan);
      this._horn([660, 830], 0.12, 'triangle', 1800, v * 0.8, sp.pan, 0.15);
    }
  }

  myHorn() {
    if (!this.ctx) return;
    this._horn([660, 830], 0.1, 'triangle', 1800, 0.08, 0);
    this._horn([660, 830], 0.18, 'triangle', 1800, 0.08, 0, 0.15);
  }

  _chirp() {
    const base = 2400 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4), pan = Math.random() * 2 - 1;
    for (let i = 0; i < n; i++) this._tone({ f: base, f2: base * (1.2 + Math.random() * 0.3), dur: 0.07, type: 'sine', vol: 0.04, at: i * 0.11, bus: this.amb, pan });
  }

  // the Asian koel — Bengaluru's summer-morning alarm: "ku-OO, ku-OO", rising
  _koel() {
    const pan = Math.random() * 2 - 1;
    for (let i = 0; i < 3; i++) {
      const lift = i * 60;
      this._tone({ f: 700 + lift, f2: 650 + lift, dur: 0.16, type: 'sine', vol: 0.07, at: i * 0.75, bus: this.amb, pan });
      this._tone({ f: 900 + lift, f2: 1150 + lift, dur: 0.32, type: 'sine', vol: 0.08, at: i * 0.75 + 0.2, bus: this.amb, pan });
    }
  }

  _crickets() {
    const pan = Math.random() * 2 - 1;
    for (let i = 0; i < 6; i++) this._tone({ f: 4300, dur: 0.03, type: 'triangle', vol: 0.025, at: i * 0.06, bus: this.amb, pan });
  }

  jump() { this._tone({ f: 300, f2: 620, dur: 0.14, type: 'triangle', vol: 0.12 }); }
  land() { this._noise({ dur: 0.1, vol: 0.12, f: 400, type: 'lowpass' }); }
  bonk() { this._tone({ f: 180, f2: 90, dur: 0.18, type: 'square', vol: 0.15, q: 500 }); this._noise({ dur: 0.12, vol: 0.2, f: 800 }); }
  click() { this._tone({ f: 1200, dur: 0.04, type: 'triangle', vol: 0.08 }); }
  coin() { this._tone({ f: 988, dur: 0.08, type: 'square', vol: 0.07 }); this._tone({ f: 1319, dur: 0.25, type: 'square', vol: 0.07, at: 0.08 }); }
  pickup() { this._tone({ f: 660, f2: 1320, dur: 0.18, type: 'sine', vol: 0.14 }); }
  fail() { this._tone({ f: 330, f2: 160, dur: 0.5, type: 'sawtooth', vol: 0.1, q: 800 }); }
  whoosh() { this._noise({ dur: 0.35, vol: 0.15, f: 1200, q: 0.7 }); }
  chat() { this._tone({ f: 1046, dur: 0.06, type: 'sine', vol: 0.06 }); this._tone({ f: 1568, dur: 0.08, type: 'sine', vol: 0.05, at: 0.06 }); }

  // quest start / complete: a little nadaswaram-ish flourish on Mohanam
  fanfare(big = true) {
    if (!this.ctx) return;
    const notes = big ? [0, 2, 4, 7, 9, 12] : [7, 9, 12];
    notes.forEach((n, i) => {
      const f = SA * 4 * Math.pow(2, n / 12);
      this._tone({ f, dur: 0.22, type: 'sawtooth', vol: 0.06, at: i * 0.1, q: f * 2 });
      this._tone({ f: f * 2, dur: 0.18, type: 'sine', vol: 0.03, at: i * 0.1 });
    });
  }

  // speech blips: each character has a pitch; syllables wobble around it
  blip(pitch = 1, i = 0) {
    if (!this.ctx) return;
    const f = 220 * pitch * (0.85 + ((i * 7919) % 13) / 30);
    this._tone({ f, f2: f * (0.9 + Math.random() * 0.25), dur: 0.06, type: 'triangle', vol: 0.05, q: f * 3 });
  }

  setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }
}
