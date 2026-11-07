// Audio engine: mixer buses + convolution reverb, scored music per mood, layered ambience,
// synthesized foley/SFX, and voice-over playback (pre-rendered clips) with radio/PA processing,
// music ducking and an amplitude envelope for lip-sync. Starts on first user gesture.

export function lineKey(speaker, text) {
  // FNV-1a over UTF-8 — must match tools/generate_voices.py
  const bytes = new TextEncoder().encode(`${speaker}|${text}`);
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('gh_muted') === '1'; } catch {}
    this.voices = {};        // key -> { file, dur }
    this.buffers = new Map();
    this.voiceStyle = {};    // speaker -> 'radio' | 'pa'
    this.surface = 'wet';
    this.mood = 'silent';
  }

  async loadManifest(url = 'voice/manifest.json') {
    try { const r = await fetch(url); if (r.ok) this.voices = await r.json(); } catch {}
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    // master → compressor → slow-motion low-pass → speakers
    this.slowFilter = ctx.createBiquadFilter();
    this.slowFilter.type = 'lowpass';
    this.slowFilter.frequency.value = 20000;
    this.master.connect(comp).connect(this.slowFilter).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.5;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.setReverb(2.4, 0.5);
    const bus = (vol, wet) => {
      const g = ctx.createGain(); g.gain.value = vol; g.connect(this.master);
      const s = ctx.createGain(); s.gain.value = wet; g.connect(s).connect(this.reverb);
      g.send = s;
      return g;
    };
    this.sfxBus = bus(0.9, 0.18);
    this.ambBus = bus(0.7, 0.1);
    this.musicBus = bus(0.42, 0.25);
    this.voiceBus = bus(1.0, 0.12);
    this.duck = ctx.createGain();
    this.musicBus.disconnect();
    this.musicBus.connect(this.duck).connect(this.master);
    this.musicBus.send.connect(this.reverb);
    this.white = this._noise('white', 3);
    this.pink = this._noise('pink', 4);
    this.brown = this._noise('brown', 4);
    this.organWave = ctx.createPeriodicWave(new Float32Array([0, 1, 0.6, 0.35, 0.5, 0.15, 0.2, 0, 0.12]), new Float32Array(9));
    this._buildAmbience();
    this._schedulerT = setInterval(() => this._schedule(), 50);
    if (this.pendingMood) this.setMood(...this.pendingMood);
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('gh_muted', m ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    if (m) this.stopVoice();
  }

  // ---------- building blocks ----------

  _noise(kind, sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
    }
    return b;
  }

  setReverb(seconds, wet) {
    if (!this.ctx) return;
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections + smooth tail
        const er = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) + er) * 0.6;
      }
    }
    this.reverb.buffer = ir;
    this.reverbGain.gain.setTargetAtTime(wet, ctx.currentTime, 0.3);
  }

  _src(buf, { loop = false, rate = 1, offset } = {}) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop; s.playbackRate.value = rate;
    s._offset = offset ?? Math.random() * (buf.duration - 0.5);
    return s;
  }

  _env(g, t, a, peak, d, sustain = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  // noise burst through a filter
  _burst({ t = this.ctx.currentTime, dur = 0.2, vol = 0.3, type = 'bandpass', freq = 1000, q = 1, buf = this.white, freqEnd, attack = 0.003, bus = this.sfxBus, pan = 0 }) {
    const ctx = this.ctx;
    const s = this._src(buf);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    this._env(g, t, attack, vol, dur);
    let out = s.connect(f).connect(g);
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; out = out.connect(p); }
    out.connect(bus);
    s.start(t, s._offset);
    s.stop(t + attack + dur + 0.05);
  }

  _tone({ t = this.ctx.currentTime, freq = 440, freqEnd, dur = 0.3, vol = 0.2, type = 'sine', attack = 0.005, bus = this.sfxBus, wave, detune = 0, release }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    if (release) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.setValueAtTime(vol, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    } else this._env(g, t, attack, vol, dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + attack + dur + (release || 0) + 0.05);
    return o;
  }

  // FM bell (music box, chimes)
  _bell(t, freq, vol, bus = this.musicBus, decay = 1.6) {
    const ctx = this.ctx;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = freq; mod.frequency.value = freq * 3.5;
    mg.gain.setValueAtTime(freq * 2.2, t); mg.gain.exponentialRampToValueAtTime(freq * 0.1, t + decay);
    mod.connect(mg).connect(car.frequency);
    this._env(g, t, 0.002, vol, decay);
    car.connect(g).connect(bus);
    car.start(t); mod.start(t); car.stop(t + decay + 0.1); mod.stop(t + decay + 0.1);
  }

  // ---------- ambience ----------

  _loop(buf, filters, vol, bus = this.ambBus) {
    const s = this._src(buf, { loop: true });
    let node = s;
    for (const [type, freq, q] of filters) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q ?? 0.7; node = node.connect(f); }
    const g = this.ctx.createGain(); g.gain.value = 0;
    node.connect(g).connect(bus);
    s.start(0, s._offset);
    g.target = vol;
    return g;
  }

  // Real-sounding rain: thousands of individual drops (ticks on stone, bloops in puddles) spread
  // across the stereo field, rendered once into a seamlessly looping buffer.
  _renderRain(sec, perSecond) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * sec);
    const buf = this.ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const add = (start, n, pan, gen) => {
      const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
      for (let i = 0; i < n; i++) { const v = gen(i); const j = (start + i) % len; L[j] += v * gl; R[j] += v * gr; }
    };
    for (let d = 0, n = Math.floor(sec * perSecond); d < n; d++) {
      const start = Math.floor(Math.random() * len);
      const pan = Math.random() * 1.8 - 0.9;
      const amp = Math.pow(Math.random(), 3.2) * 0.5 + 0.004;   // mostly faint, a few close and loud
      if (Math.random() < 0.05) {
        // a drop landing in a puddle: short rising "bloop"
        const f0 = 500 + Math.random() * 1100, dur = Math.floor(sr * (0.012 + Math.random() * 0.03));
        let ph = 0;
        add(start, dur, pan, (i) => { const k = i / dur; ph += 2 * Math.PI * f0 * (1 + k * 1.8) / sr; return Math.sin(ph) * Math.sin(k * Math.PI) * Math.exp(-k * 3) * amp * 0.7; });
      } else {
        // a drop on stone, metal or leaves: tiny filtered tick
        const dur = Math.floor(sr * (0.003 + Math.random() * 0.008));
        const bright = Math.random();
        let prev = 0, lp = 0, lp2 = 0;
        const k = 0.1 + bright * 0.32;          // one-pole cutoff ≈ 0.7–3 kHz: soft pats, not fizz
        add(start, dur, pan, (i) => {
          const w = Math.random() * 2 - 1;
          const hp = w - prev * 0.7; prev = w;
          lp += (hp - lp) * k;
          lp2 += (lp - lp2) * k * 1.6;
          return lp2 * Math.exp(-(i / dur) * 5) * amp * 2.2;
        });
      }
    }
    // normalise to a gentle level
    let sum = 0;
    for (let i = 0; i < len; i++) sum += L[i] * L[i] + R[i] * R[i];
    const k = 0.07 / Math.sqrt(sum / (2 * len) || 1);
    for (let i = 0; i < len; i++) { L[i] *= k; R[i] *= k; }
    return buf;
  }

  _buildAmbience() {
    this.rainBuf = this._renderRain(7, 1400);
    const rainDrops = this.ctx.createBufferSource();
    rainDrops.buffer = this.rainBuf;
    rainDrops.loop = true;
    const dropGain = this.ctx.createGain();
    dropGain.gain.value = 0;
    dropGain.target = 0.9;
    const soft = this.ctx.createBiquadFilter();
    soft.type = 'lowpass'; soft.frequency.value = 6500; soft.Q.value = 0.5;
    const lowCut = this.ctx.createBiquadFilter();
    lowCut.type = 'highpass'; lowCut.frequency.value = 120;
    rainDrops.connect(soft).connect(lowCut).connect(dropGain).connect(this.ambBus);
    rainDrops.start();
    this.amb = {
      rainDrops: dropGain,
      // soft wash of distant rain on roofs and the river: dark, never hissy
      rainWash: this._loop(this.pink, [['highpass', 180], ['lowpass', 1400], ['lowpass', 2200]], 0.16),
      rainBody: this._loop(this.brown, [['lowpass', 260]], 0.22),
      wind: this._loop(this.brown, [['bandpass', 420, 1.2]], 0.25),
      room: this._loop(this.pink, [['bandpass', 300, 0.6]], 0.05),
      crowd: this._loop(this.pink, [['bandpass', 650, 2.5], ['peaking', 1200, 1]], 0.08),
      fire: this._loop(this.brown, [['lowpass', 900]], 0.4),
    };
  }

  _setAmb(levels) {
    const t = this.ctx.currentTime;
    for (const [k, g] of Object.entries(this.amb)) g.gain.setTargetAtTime((levels[k] || 0) * g.target, t, 1.2);
  }

  // ---------- music + event scheduler ----------

  // mood: 'rain' | 'carnival' | 'flashback' | 'tense' | 'combat' | 'silent'
  setMood(mood, rain, surface) {
    if (surface) this.surface = surface;
    this.rain = rain;
    if (!this.ctx) { this.pendingMood = [mood, rain, surface]; return; }
    this.pendingMood = null;
    const prev = this.mood;
    this.mood = mood;
    const amb = {
      rain: { rainDrops: rain ? 1 : 0, rainWash: rain ? 1 : 0, rainBody: rain ? 1 : 0, wind: 0.7 },
      carnival: { rainDrops: rain ? 0.8 : 0, rainWash: rain ? 0.8 : 0, rainBody: rain ? 0.7 : 0, wind: 0.9 },
      flashback: { room: 1, crowd: 1 },
      combat: { rainDrops: rain ? 0.75 : 0, rainWash: rain ? 0.6 : 0, rainBody: rain ? 0.6 : 0, wind: 0.4, room: this.surface === 'wood' ? 1 : 0 },
      tense: { rainDrops: rain ? 0.75 : 0, rainWash: rain ? 0.6 : 0, rainBody: rain ? 0.6 : 0, wind: 0.5 },
      silent: {},
    }[mood] || {};
    this._setAmb(amb);
    if (mood === 'flashback') this.setReverb(1.3, 0.45); else this.setReverb(2.8, 0.5);
    if (prev !== mood) { this.bar = 0; this.nextBeat = this.ctx.currentTime + 0.3; }
    this.nextEvent = this.ctx.currentTime + 4;
  }

  fire() { this.setFire(true); setTimeout(() => this.setFire(false), 14000); }

  setFire(on) { if (this.ctx) this.amb.fire.gain.setTargetAtTime(on ? this.amb.fire.target : 0, this.ctx.currentTime, 0.5); }

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const ahead = ctx.currentTime + 0.15;
    const tracks = { rain: this._noir, carnival: this._calliope, flashback: this._musicBox, combat: this._drums, tense: this._heartbeat };
    const tr = tracks[this.mood];
    while (tr && this.nextBeat < ahead) {
      const spb = tr.call(this, this.nextBeat, this.bar || 0);
      this.bar = (this.bar || 0) + 1;
      this.nextBeat += spb;
    }
    // occasional ambient events
    if (ctx.currentTime > this.nextEvent) {
      this.nextEvent = ctx.currentTime + 8 + Math.random() * 14;
      if (this.mood === 'rain' && Math.random() < 0.5) this.siren();
      else if (this.mood === 'carnival') this.creak();
      else if (this.mood === 'flashback' && Math.random() < 0.5) this.applause(0.08);
      if (this.rain) this.drips();
    }
  }

  // Noir: slow minor pad + sparse piano + pizzicato bass. One call = one beat (♩=66).
  _noir(t, beat) {
    const spb = 60 / 66;
    const chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]; // Am F Dm E
    const ch = chords[Math.floor(beat / 8) % 4];
    if (beat % 8 === 0) {
      for (const n of ch) for (const det of [-7, 7]) this._tone({ t, freq: NOTE(n - 12), dur: spb * 7.6, vol: 0.022, type: 'sawtooth', attack: 1.6, bus: this._padBus(), detune: det, release: 1.5 });
      this._tone({ t, freq: NOTE(ch[0] - 24), dur: 0.5, vol: 0.12, type: 'triangle', attack: 0.01 });
    }
    if (beat % 8 === 4) this._tone({ t, freq: NOTE(ch[0] - 24 + 7), dur: 0.45, vol: 0.09, type: 'triangle', attack: 0.01, bus: this.musicBus });
    const motif = [76, null, 74, 72, null, 71, null, null, 72, null, 69, null, 68, null, null, null];
    const m = motif[beat % 16];
    if (m && Math.random() < 0.8) {
      this._tone({ t, freq: NOTE(m), dur: 1.4, vol: 0.05, type: 'triangle', attack: 0.004, bus: this.musicBus });
      this._tone({ t, freq: NOTE(m + 12), dur: 0.6, vol: 0.012, type: 'sine', attack: 0.004, bus: this.musicBus });
    }
    return spb;
  }

  _padBus() {
    if (!this.pad) {
      this.pad = this.ctx.createBiquadFilter();
      this.pad.type = 'lowpass'; this.pad.frequency.value = 900; this.pad.Q.value = 0.5;
      this.pad.connect(this.musicBus);
    }
    return this.pad;
  }

  // Carnival calliope: warped minor waltz, oom-pah-pah. One call = one beat (♩=150, 3/4).
  _calliope(t, beat) {
    const spb = 60 / 150;
    const bar = Math.floor(beat / 3), b = beat % 3;
    const prog = [[57, 60, 64], [52, 56, 59], [57, 60, 64], [50, 53, 57], [53, 57, 60], [52, 56, 59], [57, 60, 64], [52, 56, 59]];
    const ch = prog[bar % 8];
    const warp = 1 + Math.sin(t * 0.7) * 0.012 + Math.sin(t * 3.1) * 0.004;   // tape-wobble
    const v = 0.035;
    if (b === 0) this._tone({ t, freq: NOTE(ch[0] - 24) * warp, dur: spb * 0.8, vol: v * 2, wave: this.organWave, attack: 0.01 });
    else for (const n of ch) this._tone({ t, freq: NOTE(n) * warp, dur: spb * 0.45, vol: v * 0.7, wave: this.organWave, attack: 0.01, detune: (Math.random() - 0.5) * 18 });
    const mel = [76, 75, 76, 72, 71, 72, 69, null, 72, 71, 68, 64, 69, 71, 72, 74, 76, 77, 76, 72, 74, 71, 69, null];
    const n = mel[(bar % 8) * 3 + b];
    if (n) {
      const o = this._tone({ t, freq: NOTE(n) * warp, dur: spb * 0.9, vol: v * 1.3, wave: this.organWave, attack: 0.015, detune: (Math.random() - 0.5) * 25 });
      const vib = this.ctx.createOscillator(), vg = this.ctx.createGain();
      vib.frequency.value = 6; vg.gain.value = 9;
      vib.connect(vg).connect(o.detune); vib.start(t); vib.stop(t + spb);
    }
    return spb;
  }

  // Music box waltz for memories. One call = one eighth note.
  _musicBox(t, step) {
    const spe = 60 / 100 / 2;
    const mel = [72, 76, 79, 76, 77, 74, 72, null, 71, 74, 77, 74, 76, 72, 69, null, 72, 76, 79, 84, 83, 79, 77, 76, 74, 77, 76, 74, 72, null, null, null];
    const n = mel[step % mel.length];
    const slow = 1 - Math.min(0.25, (step % 64) / 64 * 0.0);   // winding-down feel
    if (n) this._bell(t, NOTE(n), 0.05 * slow);
    if (step % 6 === 0) this._bell(t, NOTE([48, 53, 55, 48][Math.floor(step / 6) % 4]), 0.035, this.musicBus, 2.4);
    return spe;
  }

  // Combat: kick/snare/hat + bass ostinato + brass-ish stabs. One call = one 16th (♩=132).
  _drums(t, s) {
    const sp = 60 / 132 / 4;
    const k = s % 16;
    if (k === 0 || k === 6 || k === 10) { this._tone({ t, freq: 120, freqEnd: 42, dur: 0.22, vol: 0.5, bus: this.musicBus }); this._burst({ t, dur: 0.03, vol: 0.12, freq: 3000, type: 'highpass', bus: this.musicBus }); }
    if (k === 4 || k === 12) { this._burst({ t, dur: 0.16, vol: 0.28, freq: 1800, q: 0.6, bus: this.musicBus }); this._tone({ t, freq: 220, freqEnd: 160, dur: 0.08, vol: 0.12, type: 'triangle', bus: this.musicBus }); }
    if (k % 2 === 0) this._burst({ t, dur: k % 4 === 2 ? 0.08 : 0.03, vol: 0.06, freq: 8000, type: 'highpass', bus: this.musicBus });
    const bass = [45, 45, 57, 45, 48, 45, 55, 45, 45, 45, 57, 45, 44, 44, 56, 47];
    if (k % 2 === 0) this._tone({ t, freq: NOTE(bass[(k + (Math.floor(s / 16) % 2) * 0) % 16] - 12), dur: sp * 1.6, vol: 0.13, type: 'sawtooth', bus: this._padBus() });
    if (k === 0 && Math.floor(s / 16) % 2 === 0) for (const n of [57, 60, 64]) this._tone({ t, freq: NOTE(n), dur: 0.18, vol: 0.04, type: 'sawtooth', attack: 0.01, bus: this.musicBus });
    return sp;
  }

  _heartbeat(t, s) {
    const spb = 60 / 72;
    this._tone({ t, freq: 60, freqEnd: 40, dur: 0.15, vol: 0.35, bus: this.musicBus });
    this._tone({ t: t + 0.22, freq: 55, freqEnd: 38, dur: 0.12, vol: 0.22, bus: this.musicBus });
    if (s % 4 === 0) this._tone({ t, freq: NOTE(38), dur: spb * 3.8, vol: 0.05, type: 'sawtooth', attack: 1, bus: this._padBus() });
    return spb;
  }

  // ---------- SFX ----------

  step() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, r = 0.85 + Math.random() * 0.3;
    if (this.surface === 'wood') {
      this._tone({ t, freq: 140 * r, freqEnd: 80, dur: 0.07, vol: 0.12 });
      this._burst({ t, dur: 0.04, vol: 0.08, freq: 2200 * r, q: 2 });
    } else {
      this._tone({ t, freq: 75 * r, freqEnd: 50, dur: 0.05, vol: 0.14 });
      this._burst({ t, dur: 0.06, vol: 0.09, freq: 900 * r, q: 1.2 });
      if (this.rain) this._burst({ t: t + 0.01, dur: 0.12, vol: 0.06, freq: 3500 * r, type: 'highpass' });
    }
  }

  whoosh(heavy) {
    if (!this.ctx) return;
    this._burst({ dur: heavy ? 0.3 : 0.2, vol: heavy ? 0.25 : 0.16, freq: 600, freqEnd: 2600, q: 1.5, buf: this.pink, attack: 0.04 });
  }

  hit(heavy) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, r = 0.9 + Math.random() * 0.2;
    this._tone({ t, freq: (heavy ? 110 : 150) * r, freqEnd: 40, dur: heavy ? 0.22 : 0.14, vol: heavy ? 0.7 : 0.5 });
    this._burst({ t, dur: 0.07, vol: 0.5, freq: 1600 * r, q: 0.9 });
    this._burst({ t, dur: heavy ? 0.25 : 0.15, vol: 0.4, freq: 300, type: 'lowpass', buf: this.brown });
    this._burst({ t, dur: 0.025, vol: 0.25, freq: 5000, type: 'highpass' });
  }

  bodyFall() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.35;
    this._tone({ t, freq: 70, freqEnd: 35, dur: 0.3, vol: 0.5 });
    this._burst({ t, dur: 0.3, vol: 0.45, freq: 250, type: 'lowpass', buf: this.brown });
    if (this.rain) this._burst({ t, dur: 0.35, vol: 0.18, freq: 2500, type: 'highpass' });
  }

  hurt() { this.hit(false); this.effort('nightjar', 'hurt'); }
  blip() { if (this.ctx) this._tone({ freq: 1800, dur: 0.012, vol: 0.012, type: 'square' }); }
  select() { if (!this.ctx) return; this._burst({ dur: 0.05, vol: 0.12, freq: 3000, q: 3 }); this._tone({ freq: 880, dur: 0.06, vol: 0.04, type: 'triangle' }); }
  page() { if (this.ctx) this._burst({ dur: 0.25, vol: 0.12, freq: 1500, freqEnd: 5000, q: 0.8, buf: this.pink, attack: 0.05 }); }

  clue() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [69, 72, 76, 81].forEach((n, i) => this._bell(t + i * 0.09, NOTE(n), 0.08, this.sfxBus, 2));
    this._tone({ t, freq: NOTE(45), dur: 1.4, vol: 0.12, type: 'triangle', attack: 0.02 });
  }

  counter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._burst({ t, dur: 0.12, vol: 0.4, freq: 4000, type: 'highpass' });
    this._tone({ t, freq: 900, freqEnd: 1800, dur: 0.12, vol: 0.06, type: 'triangle' });
    this._bell(t + 0.02, NOTE(88), 0.05, this.sfxBus, 0.6);
  }

  comboTier(n) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7].forEach((iv, i) => this._bell(t + i * 0.06, NOTE(72 + iv + Math.min(12, n)), 0.05, this.sfxBus, 0.9));
  }

  takedown() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone({ t, freq: 70, freqEnd: 28, dur: 0.6, vol: 0.8 });
    this._burst({ t, dur: 0.5, vol: 0.5, freq: 200, type: 'lowpass', buf: this.brown });
    this._burst({ t, dur: 0.9, vol: 0.18, freq: 2000, freqEnd: 300, q: 0.7, buf: this.pink });
  }

  scan() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone({ t, freq: 1400, freqEnd: 700, dur: 0.9, vol: 0.06, type: 'sine', bus: this.sfxBus });
    this._tone({ t: t + 0.25, freq: 1400, freqEnd: 700, dur: 0.9, vol: 0.03, type: 'sine', bus: this.sfxBus });
    this._burst({ t, dur: 0.6, vol: 0.06, freq: 6000, freqEnd: 1500, type: 'bandpass', q: 3, buf: this.pink });
  }

  // slow-motion: everything dips into a low-passed underwater feel
  setSlow(on) {
    if (!this.ctx) return;
    this.slowFilter.frequency.setTargetAtTime(on ? 900 : 20000, this.ctx.currentTime, on ? 0.05 : 0.3);
  }

  sting() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const n of [45, 48, 51, 54]) this._tone({ t, freq: NOTE(n), dur: 1.6, vol: 0.06, type: 'sawtooth', attack: 0.01, bus: this._padBus() });
    this._tone({ t, freq: 60, freqEnd: 30, dur: 1.2, vol: 0.5 });
  }

  thunder() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.15 + Math.random() * 0.4;
    this._burst({ t, dur: 0.35, vol: 0.5, freq: 2500, type: 'highpass', bus: this.ambBus });
    for (let i = 0; i < 5; i++) this._burst({ t: t + i * 0.35 + Math.random() * 0.2, dur: 1.8 + Math.random() * 1.5, vol: 0.55 - i * 0.07, freq: 140 + Math.random() * 60, type: 'lowpass', buf: this.brown, attack: 0.08, bus: this.ambBus });
  }

  smoke() {
    if (!this.ctx) return;
    this._burst({ dur: 0.8, vol: 0.4, freq: 3000, freqEnd: 300, type: 'lowpass', buf: this.pink, attack: 0.02 });
    this._tone({ freq: 90, freqEnd: 40, dur: 0.4, vol: 0.3 });
  }

  siren() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, dur = 6, pan = this.ctx.createStereoPanner(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    pan.pan.value = Math.random() * 1.6 - 0.8; f.type = 'lowpass'; f.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    for (let i = 0; i < dur / 0.6; i++) o.frequency.setValueAtTime(i % 2 ? 640 : 820, t + i * 0.6);
    o.connect(f).connect(g).connect(pan).connect(this.ambBus);
    o.start(t); o.stop(t + dur);
  }

  creak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(110, t + 1.2); o.frequency.linearRampToValueAtTime(60, t + 2);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 12;
    this._env(g, t, 0.3, 0.05, 1.8);
    o.connect(f).connect(g).connect(this.ambBus);
    o.start(t); o.stop(t + 2.2);
  }

  drips() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this._tone({ t: t + Math.random() * 3, freq: 1200 + Math.random() * 1400, freqEnd: 2600, dur: 0.05, vol: 0.02, bus: this.ambBus });
  }

  applause(vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 70; i++) this._burst({ t: t + Math.random() * 2.2, dur: 0.03, vol: vol * Math.random(), freq: 1500 + Math.random() * 2000, q: 1.5, bus: this.ambBus, pan: Math.random() * 2 - 1 });
  }

  static_(dur = 0.25) {
    if (!this.ctx) return;
    this._burst({ dur, vol: 0.12, freq: 2500, q: 0.7, bus: this.voiceBus });
    this._tone({ freq: 1400, dur: 0.06, vol: 0.03, type: 'square', bus: this.voiceBus });
  }

  laugh(id = 'vale') {
    if (this.effort(id, 'laugh')) return;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) { this._tone({ t: t + i * 0.16, freq: 260 - i * 14, freqEnd: 200 - i * 14, dur: 0.12, vol: 0.12, type: 'sawtooth' }); this._burst({ t: t + i * 0.16, dur: 0.1, vol: 0.12, freq: 1800 }); }
  }

  // Short pre-rendered vocal efforts ("Hah!", "Ugh!") if available. Returns true if played.
  effort(speaker, kind) {
    const keys = Object.keys(this.voices).filter((k) => this.voices[k].effort === `${speaker}:${kind}`);
    if (!keys.length || !this.ctx) return false;
    const k = keys[(Math.random() * keys.length) | 0];
    this._playBuffer(k, { vol: kind === 'laugh' ? 0.9 : 0.55, style: this.voiceStyle[speaker] });
    return true;
  }

  // ---------- voice-over ----------

  hasLine(speaker, text) { return !!this.voices[lineKey(speaker, text)]; }

  async _load(key) {
    if (this.buffers.has(key)) return this.buffers.get(key);
    const v = this.voices[key];
    if (!v || !this.ctx) return null;
    const p = fetch(`voice/${v.file}`).then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej))).catch(() => null);
    this.buffers.set(key, p);
    return p;
  }

  preload(lines) {
    if (!this.ctx) return;
    for (const [s, t] of lines) { const k = lineKey(s, t); if (this.voices[k]) this._load(k); }
    for (const k of Object.keys(this.voices)) if (this.voices[k].effort) this._load(k);
  }

  _voiceChain(style) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    let out = input;
    if (style === 'radio' || style === 'pa') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = style === 'radio' ? 450 : 300;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = style === 'radio' ? 3200 : 4200;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1800; pk.gain.value = 6;
      const ws = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      const k = style === 'radio' ? 8 : 4;
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * k) / Math.tanh(k); }
      ws.curve = curve;
      out = out.connect(hp).connect(pk).connect(ws).connect(lp);
      if (style === 'pa') {
        // big outdoor loudspeaker: slap-back echo + heavy reverb
        const d = ctx.createDelay(1); d.delayTime.value = 0.23;
        const fb = ctx.createGain(); fb.gain.value = 0.32;
        out.connect(d); d.connect(fb).connect(d);
        const dg = ctx.createGain(); dg.gain.value = 0.5;
        d.connect(dg).connect(this.voiceBus);
        const send = ctx.createGain(); send.gain.value = 0.6;
        out.connect(send).connect(this.reverb);
      }
    }
    return { input, out };
  }

  async _playBuffer(key, { vol = 1, style } = {}) {
    const buf = await this._load(key);
    if (!buf) return null;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const { input, out } = this._voiceChain(style);
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(input);
    out.connect(g).connect(this.voiceBus);
    s.start();
    return { s, g, buf, out };
  }

  // Plays a dialogue line. Returns { duration, ended: Promise } or null if no clip.
  async playLine(speaker, text) {
    this.stopVoice();
    if (!this.ctx || this.muted) return null;
    const key = lineKey(speaker, text);
    if (!this.voices[key]) return null;
    const style = this.voiceStyle[speaker];
    if (style === 'radio') this.static_(0.18);
    const h = await this._playBuffer(key, { style });
    if (!h) return null;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    h.out.connect(this.analyser);
    this.curVoice = h;
    this.speakingAs = speaker;
    // duck the music while someone is talking
    this.duck.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.08);
    const ended = new Promise((res) => { h.s.onended = () => { if (this.curVoice === h) { this.curVoice = null; this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, 0.4); if (style === 'radio') this.static_(0.12); } res(); }; });
    return { duration: h.buf.duration, ended };
  }

  stopVoice() {
    if (this.curVoice) {
      const h = this.curVoice;
      this.curVoice = null;
      try { h.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03); h.s.stop(this.ctx.currentTime + 0.1); } catch {}
      this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, 0.4);
    }
  }

  // 0..1 loudness of the current voice (drives mouth animation)
  voiceLevel() {
    if (!this.curVoice || !this.analyser) return 0;
    const d = this.levelBuf || (this.levelBuf = new Float32Array(this.analyser.fftSize));
    this.analyser.getFloatTimeDomainData(d);
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[i] * d[i];
    return Math.min(1, Math.sqrt(s / d.length) * 7);
  }
}
