// Fully procedural WebAudio: rain bed, thunder, a minor-key drone, hits and UI blips.
// Starts on first user gesture (browser autoplay rules).

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('gh_muted') === '1'; } catch {}
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this._noise(2);
    this._rainBed();
    this._drone();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('gh_muted', m ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  _noise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _rainBed() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 0.4;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    src.connect(f).connect(this.rainGain).connect(this.master);
    src.start();
  }

  _drone() {
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    this.musicGain.connect(lp).connect(this.master);
    this.droneOsc = [55, 65.4, 82.4].map((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      const g = this.ctx.createGain(); g.gain.value = i === 0 ? 0.08 : 0.12;
      o.connect(g).connect(this.musicGain);
      o.start();
      return o;
    });
    // slow wobbly lfo on filter: unsettling carnival breathing
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 250;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start();
  }

  // mood: 'rain' | 'carnival' | 'flashback' | 'tense' | 'silent'
  setMood(mood, rain) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain ? 0.22 : 0, t, 0.8);
    const vol = { rain: 0.5, carnival: 0.6, flashback: 0.35, tense: 0.8, silent: 0 }[mood] ?? 0.4;
    this.musicGain.gain.setTargetAtTime(vol, t, 1.2);
    const root = { carnival: 58.3, flashback: 73.4, tense: 49 }[mood] || 55;
    this.droneOsc.forEach((o, i) => o.frequency.setTargetAtTime(root * [1, 1.189, 1.498][i], t, 1.5));
    clearInterval(this.musicBox);
    if (mood === 'carnival' || mood === 'flashback') this._musicBox(mood === 'flashback');
  }

  // Detuned music-box waltz, a little off-key on purpose.
  _musicBox(soft) {
    const notes = [0, 3, 7, 12, 10, 7, 3, 5, 8, 12, 8, 5, 2, 7, 11, 14, 11, 7];
    let i = 0;
    this.musicBox = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const n = notes[i++ % notes.length];
      this.tone(440 * Math.pow(2, (n - 9) / 12) * (1 + (Math.random() - 0.5) * 0.012), 0.5, soft ? 0.03 : 0.045, 'sine');
    }, 380);
  }

  tone(freq, dur, vol = 0.1, type = 'square', slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  burst(dur, vol, freq, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur);
  }

  thunder() { this.burst(2.8, 0.7, 180); setTimeout(() => this.burst(1.5, 0.4, 90), 250); }
  hit() { this.burst(0.15, 0.6, 1200); this.tone(110, 0.12, 0.25, 'square', -60); }
  whoosh() { this.burst(0.18, 0.25, 3000, 'highpass'); }
  hurt() { this.tone(160, 0.25, 0.25, 'sawtooth', -90); this.burst(0.2, 0.5, 800); }
  blip() { this.tone(660, 0.06, 0.05, 'square'); }
  select() { this.tone(520, 0.08, 0.08, 'triangle'); setTimeout(() => this.tone(780, 0.1, 0.08, 'triangle'), 70); }
  clue() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 0.07, 'triangle'), i * 90)); }
  laugh() {
    // A synthetic "ha-ha-ha" made of formant-ish bursts.
    for (let i = 0; i < 5; i++) setTimeout(() => { this.tone(300 - i * 18, 0.12, 0.12, 'sawtooth', -40); this.burst(0.1, 0.15, 1800, 'bandpass'); }, i * 150);
  }
  step() { this.burst(0.05, 0.05, 500); }
}
