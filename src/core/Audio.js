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
    this.voiceSet = new Set();
    this.voiceCache = new Map();
    try {
      this.muted = localStorage.getItem('pb.mute') === '1';
      this.musicOn = localStorage.getItem('pb.music') !== '0';
      this.voiceOn = localStorage.getItem('pb.voice') !== '0';
    } catch {}
    fetch('voice/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
      if (!m) return;
      this.voiceSet = new Set(m.keys || []);
      this.voiceGroups = m.groups || {};
    }).catch(() => {});
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
    this.cityHum = this._loopNoise('lowpass', 280, 0.6, 0.18);
    this.rainN = this._loopNoise('bandpass', 1800, 0.5, 0);
    this.rainLow = this._loopNoise('lowpass', 500, 0.5, 0);
    this.birdT = 0; this.honkT = 0;
  }

  _scooterVoice() {
    const c = this.ctx;
    this.sc = { o1: c.createOscillator(), o2: c.createOscillator(), g: c.createGain(), f: c.createBiquadFilter() };
    const s = this.sc;
    s.o1.type = 'sawtooth'; s.o2.type = 'sine';
    s.o1.frequency.value = 70; s.o2.frequency.value = 140;
    s.f.type = 'lowpass'; s.f.frequency.value = 600;
    s.g.gain.value = 0;
    s.o1.connect(s.f); s.o2.connect(s.f); s.f.connect(s.g); s.g.connect(this.sfx);
    s.o1.start(); s.o2.start();
  }

  scooter(on) {
    if (!this.ctx) return;
    this.sc.g.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.2);
    this._tone({ f: on ? 300 : 500, f2: on ? 900 : 200, dur: 0.35, type: 'sine', vol: 0.12 });
  }

  scooterSpeed(k) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sc.o1.frequency.setTargetAtTime(60 + k * 160, t, 0.1);
    this.sc.o2.frequency.setTargetAtTime(120 + k * 320, t, 0.1);
    this.sc.f.frequency.setTargetAtTime(400 + k * 1800, t, 0.1);
  }

  // env: { night, rain, crowd (0..1 traffic density) }
  updateAmbience(env, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.cityHum.g.gain.setTargetAtTime(0.1 + (env.crowd || 0) * 0.15, t, 1);
    this.rainN.g.gain.setTargetAtTime((env.rain || 0) * 0.25, t, 1);
    this.rainLow.g.gain.setTargetAtTime((env.rain || 0) * 0.18, t, 1);
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

  // Karplus-ish plucked string (veena-like): a short burst through a feedback delay.
  _pluck(freq, at, vol = 0.18, bright = 3000) {
    const c = this.ctx;
    const t = at;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const burst = c.createGain();
    burst.gain.setValueAtTime(1, t); burst.gain.setValueAtTime(0, t + 1 / freq * 2);
    const d = c.createDelay(); d.delayTime.value = 1 / freq;
    const fb = c.createGain(); fb.gain.value = 0.985;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bright;
    const out = c.createGain();
    out.gain.setValueAtTime(vol, t); out.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    s.connect(burst); burst.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
    lp.connect(out); out.connect(this.music); out.connect(this.verb);
    s.start(t); s.stop(t + 0.05);
    setTimeout(() => { try { fb.disconnect(); d.disconnect(); } catch {} }, (t - c.currentTime + 2.5) * 1000);
  }

  _drone(at, dur) {
    const c = this.ctx;
    for (const [mult, v] of [[1, 0.035], [1.5, 0.025], [2, 0.02], [0.5, 0.03]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = SA * mult;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
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
    if (!c || !this.musicOn) { if (c) this.nextT = c.currentTime + 0.2; return; }
    const beat = 60 / 84;
    while (this.nextT < c.currentTime + 0.4) {
      const s = this.step;
      const t = this.nextT;
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

  horn(x, z, kind) {
    if (!this.ctx) return;
    const sp = this._spatial(x, z);
    if (!sp || sp.vol < 0.03) return;
    const v = sp.vol * 0.22;
    if (kind === 'auto') {         // the squeaky rubber-bulb "pom pom"
      this._tone({ f: 520, f2: 470, dur: 0.12, type: 'square', vol: v * 0.6, pan: sp.pan, q: 900 });
      this._tone({ f: 520, f2: 470, dur: 0.14, type: 'square', vol: v * 0.6, at: 0.17, pan: sp.pan, q: 900 });
    } else if (kind === 'bus' || kind === 'tanker') {
      this._tone({ f: 196, dur: 0.6, type: 'sawtooth', vol: v * 0.7, pan: sp.pan, q: 600 });
      this._tone({ f: 247, dur: 0.6, type: 'sawtooth', vol: v * 0.5, pan: sp.pan, q: 700 });
    } else if (kind === 'car') {
      this._tone({ f: 415, dur: 0.25, type: 'square', vol: v * 0.5, pan: sp.pan, q: 1200 });
      this._tone({ f: 523, dur: 0.25, type: 'square', vol: v * 0.4, pan: sp.pan, q: 1200 });
    } else {                        // scooters: beep-beep-beeeep
      for (let i = 0; i < 3; i++) this._tone({ f: 880, dur: i === 2 ? 0.3 : 0.09, type: 'square', vol: v * 0.45, at: i * 0.14, pan: sp.pan, q: 1800 });
    }
  }

  myHorn() {
    if (!this.ctx) return;
    this._tone({ f: 660, dur: 0.12, type: 'square', vol: 0.12, q: 1500 });
    this._tone({ f: 660, dur: 0.25, type: 'square', vol: 0.12, at: 0.16, q: 1500 });
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
