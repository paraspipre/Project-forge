// The soundtrack: a generative score that follows what you're doing.
//   explore  lo-fi Bengaluru (84 bpm, swung): electric piano, soft drums, bass, bansuri flute in Mohanam
//   drive    upbeat groove (104 bpm) when you're riding or driving fast
//   night    slow pads and sparse piano (68 bpm)
//   tension  tabla, drone and low strings (96 bpm) for chases, fights and timed missions
// All synthesised with Web Audio: FM electric piano, detuned-saw pads, a breathy flute with vibrato
// and slides (gamaka), and drums built from tuned sines and filtered noise. A mood change waits for
// the end of a bar and crossfades.

const MOODS = {
  explore: { bpm: 84, swing: 0.12 },
  drive: { bpm: 104, swing: 0.04 },
  night: { bpm: 68, swing: 0.1 },
  tension: { bpm: 96, swing: 0.06 },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Mohanam on D: Sa Ri Ga Pa Dha = D E F# A B
const SCALE = [62, 64, 66, 69, 71];
// chords as MIDI notes (bass root first)
const PROG = {
  explore: [[38, 62, 66, 69, 73], [35, 62, 66, 69, 71], [31, 59, 62, 66, 71], [33, 62, 64, 67, 69]],     // Dmaj7 Bm7 Gmaj7 A7sus
  drive: [[35, 59, 62, 66, 71], [31, 59, 62, 67, 71], [38, 62, 66, 69, 74], [33, 61, 64, 69, 73]],       // Bm G D A
  night: [[38, 62, 64, 66, 69, 73], [31, 59, 61, 62, 66, 71], [40, 62, 64, 67, 71], [33, 61, 64, 66, 69]], // Dmaj9 Gmaj7#11 Em9 A6
  tension: [[38, 50, 57, 62], [38, 50, 55, 60], [38, 50, 57, 62], [36, 48, 55, 60]],
};

export class Soundtrack {
  constructor(audio) {
    this.a = audio;
    const c = audio.ctx;
    this.c = c;
    this.out = c.createGain(); this.out.gain.value = 1;
    this.out.connect(audio.music);
    this.mood = 'explore';
    this.want = 'explore';
    this.wantSince = 0;
    this.step = 0;           // 16th notes
    this.next = c.currentTime + 0.3;
    this.mel = { deg: 2, oct: 0, rest: 0 };
    this.fluteOn = false;
  }

  setMood(m) {
    if (!MOODS[m]) return;
    if (m !== this.want) { this.want = m; this.wantSince = this.c.currentTime; }
  }

  // called every ~100 ms by Audio
  schedule() {
    const c = this.c;
    if (this.next < c.currentTime - 0.5) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.35) {
      const s = this.step;
      // switch mood on a bar line, after the new mood has been wanted for a few seconds
      if (s % 16 === 0 && this.want !== this.mood && c.currentTime - this.wantSince > (this.want === 'tension' ? 1 : 5)) {
        this.mood = this.want;
        this.out.gain.setValueAtTime(0.0001, this.next);
        this.out.gain.exponentialRampToValueAtTime(1, this.next + 1.2);
        this.step = 0;
      }
      const M = MOODS[this.mood];
      const six = 60 / M.bpm / 4;
      const swing = this.step % 2 === 1 ? six * M.swing : 0;
      this._play(this.mood, this.step, this.next + swing);
      this.next += six;
      this.step++;
    }
  }

  _play(mood, s, t) {
    const bar = Math.floor(s / 16), pos = s % 16, prog = PROG[mood];
    const chord = prog[bar % prog.length];
    const phrase = Math.floor(bar / 4);
    if (mood === 'explore') {
      if (pos === 0) this.keys(chord.slice(1), t, 0.07, 2.2);
      if (pos === 10 && bar % 2 === 1) this.keys(chord.slice(2), t, 0.05, 1.2);
      if (phrase % 4 !== 3) {
        if (pos === 0 || pos === 7) this.kick(t, 0.6);
        if (pos === 4 || pos === 12) this.snare(t, 0.22);
        if (pos % 2 === 0) this.hat(t, pos % 4 === 2 ? 0.05 : 0.035, false);
      } else if (pos % 4 === 0) this.hat(t, 0.03, false);
      if (pos === 0) this.bass(chord[0], t, 0.32, 0.5);
      if (pos === 6) this.bass(chord[0] + 7, t, 0.22, 0.25);
      if (pos === 11) this.bass(chord[0] + 12, t, 0.18, 0.2);
      if (phrase % 2 === 1) this.melody(t, s, 0);
    } else if (mood === 'drive') {
      if (pos % 4 === 0) this.kick(t, 0.75);
      if (pos === 4 || pos === 12) this.clap(t, 0.25);
      if (pos % 4 === 2) this.hat(t, 0.07, true);
      else if (pos % 2 === 1) this.hat(t, 0.025, false);
      if (pos % 2 === 0) this.bass(chord[0] + (pos % 4 === 2 ? 12 : 0), t, 0.26, 0.14);
      if (pos === 2 || pos === 6 || pos === 10 || pos === 14) this.keys(chord.slice(1), t, 0.035, 0.25);
      if (phrase % 2 === 0) this.melody(t, s, 12);
    } else if (mood === 'night') {
      if (pos === 0) this.pad(chord.slice(1), t, (60 / MOODS.night.bpm) * 4 + 0.6, 0.05);
      if (pos === 0) this.bass(chord[0], t, 0.2, 2.5);
      if (Math.random() < 0.18 && pos % 4 === 0) this.keys([chord[1 + Math.floor(Math.random() * (chord.length - 1))] + 12], t, 0.045, 2.5);
      if (pos % 8 === 4) this.hat(t, 0.012, false);
    } else {
      // tension: tabla theka, drone, low string ostinato
      const pat = ['dha', 0, 'ti', 'na', 0, 'dha', 'ti', 0, 'dha', 0, 'ti', 'na', 'tin', 0, 'na', 'ti'];
      if (pat[pos]) this.tabla(t, pat[pos]);
      if (pos === 0 && bar % 2 === 0) this.drone(t, (60 / MOODS.tension.bpm) * 8);
      if (pos % 2 === 0) this.strings(chord[1 + (pos / 2) % (chord.length - 1)] - 12, t, 0.05, 0.22);
      if (pos === 0) this.kick(t, 0.45);
    }
  }

  // ------------------------------------------------------------------ instruments

  _env(g, t, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _send(node, wet = 0.3) {
    node.connect(this.out);
    if (wet > 0) { const w = this.c.createGain(); w.gain.value = wet; node.connect(w); w.connect(this.a.verb); }
  }

  // FM electric piano: a sine carrier modulated at the same frequency, with a bright attack that mellows
  keys(notes, t, vol, dur) {
    const c = this.c;
    const out = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.3;
    lp.connect(out); this._send(out, 0.35);
    out.gain.value = 1;
    for (const n of notes) {
      const f = mtof(n);
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      car.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
      mod.frequency.value = f;
      mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.25, t + 0.5);
      mod.connect(mg); mg.connect(car.frequency);
      this._env(g, t, vol, 0.006, dur);
      car.connect(g); g.connect(lp);
      car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
    }
  }

  pad(notes, t, dur, vol) {
    const c = this.c;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(600, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 1.4); g.gain.setValueAtTime(vol, t + dur - 1.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); this._send(g, 0.6);
    for (const n of notes) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      const og = c.createGain(); og.gain.value = 0.18;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  bass(n, t, vol, dur) {
    const c = this.c, f = mtof(n);
    const g = c.createGain(); this._env(g, t, vol, 0.008, dur + 0.15);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    for (const [type, mul, v] of [['sine', 1, 1], ['triangle', 2, 0.25]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const og = c.createGain(); og.gain.value = v; o.connect(og); og.connect(lp);
      o.start(t); o.stop(t + dur + 0.3);
    }
    lp.connect(g); this._send(g, 0);
  }

  strings(n, t, vol, dur) {
    const c = this.c;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain(); this._env(g, t, vol, 0.04, dur);
    lp.connect(g); this._send(g, 0.3);
    for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
  }

  // bansuri: a breathy sine with a slide into each note and vibrato that blooms
  flute(n, t, dur, vol = 0.07, slideFrom = null) {
    const c = this.c, f = mtof(n);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(slideFrom ? mtof(slideFrom) : f * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(f, t + (slideFrom ? 0.12 : 0.06));
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.value = 5.4; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.6));
    vib.connect(vg); vg.connect(o.frequency);
    const h = c.createOscillator(); h.type = 'triangle'; h.frequency.value = f * 2; const hg = c.createGain(); hg.gain.value = 0.06; h.connect(hg);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.07); g.gain.setValueAtTime(vol, t + Math.max(0.08, dur - 0.12)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(g); hg.connect(g);
    // breath
    const nz = c.createBufferSource(); nz.buffer = this.a.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
    const ng = c.createGain(); ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(vol * 0.08, t + 0.15); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    nz.connect(bp); bp.connect(ng); ng.connect(g);
    this._send(g, 0.45);
    for (const x of [o, vib, h]) { x.start(t); x.stop(t + dur + 0.2); }
    nz.start(t, Math.random()); nz.stop(t + dur + 0.2);
  }

  // a wandering Mohanam line: stepwise, resting on Sa and Pa at phrase ends
  melody(t, s, up) {
    const pos = s % 16, M = this.mel;
    if (M.rest > 0) { M.rest--; return; }
    if (pos % 2 !== 0) return;
    if (Math.random() < 0.3) { M.rest = 1 + Math.floor(Math.random() * 3); return; }
    const prev = 72 + up + SCALE[M.deg] - 62 + M.oct * 12;
    M.deg += Math.random() < 0.5 ? 1 : -1;
    if (Math.random() < 0.15) M.deg += Math.random() < 0.5 ? 2 : -2;
    if (M.deg > 4) { M.deg -= 5; M.oct = Math.min(1, M.oct + 1); }
    if (M.deg < 0) { M.deg += 5; M.oct = Math.max(-1, M.oct - 1); }
    if (pos === 14) { M.deg = Math.random() < 0.5 ? 0 : 3; M.oct = 0; }
    const n = 72 + up + SCALE[M.deg] - 62 + M.oct * 12;
    const six = 60 / MOODS[this.mood].bpm / 4;
    const len = pos === 14 ? six * 6 : six * (Math.random() < 0.4 ? 4 : 2);
    this.flute(n, t, len, up ? 0.05 : 0.065, Math.abs(n - prev) <= 4 && Math.random() < 0.5 ? prev : null);
  }

  kick(t, vol) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = c.createGain(); this._env(g, t, vol, 0.003, 0.32);
    o.connect(g); this._send(g, 0);
    o.start(t); o.stop(t + 0.4);
    this._noiseHit(t, vol * 0.25, 'highpass', 3000, 0.012, 0);
  }

  snare(t, vol) {
    this._noiseHit(t, vol, 'bandpass', 1900, 0.16, 0.25, 0.8);
    const c = this.c, o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g = c.createGain(); this._env(g, t, vol * 0.5, 0.002, 0.09); o.connect(g); this._send(g, 0.2); o.start(t); o.stop(t + 0.15);
  }

  clap(t, vol) { for (let i = 0; i < 3; i++) this._noiseHit(t + i * 0.011, vol * (i === 2 ? 1 : 0.5), 'bandpass', 1400, i === 2 ? 0.14 : 0.02, 0.3, 1.2); }

  hat(t, vol, open) { this._noiseHit(t, vol, 'highpass', 7500, open ? 0.18 : 0.035, 0.08); }

  _noiseHit(t, vol, type, f, dur, wet, q = 0.7) {
    const c = this.c;
    const s = c.createBufferSource(); s.buffer = this.a.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); this._env(g, t, vol, 0.002, dur);
    s.connect(fl); fl.connect(g); this._send(g, wet);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  tabla(t, kind) {
    const c = this.c;
    if (kind === 'dha' || kind === 'tin') {
      // bayan: low drum whose pitch rises as the palm slides
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.18);
      const g = c.createGain(); this._env(g, t, 0.35, 0.004, 0.35); o.connect(g); this._send(g, 0.15); o.start(t); o.stop(t + 0.4);
    }
    if (kind !== 'ti') {
      // dayan: tuned, ringing, with a couple of harmonics
      for (const [m, v] of [[1, 0.16], [2.01, 0.06], [3.02, 0.03]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 587 * m;
        const g = c.createGain(); this._env(g, t, v, 0.002, kind === 'na' ? 0.22 : 0.12); o.connect(g); this._send(g, 0.2); o.start(t); o.stop(t + 0.3);
      }
    }
    if (kind === 'ti') this._noiseHit(t, 0.07, 'bandpass', 2500, 0.05, 0.1, 1.5);
  }

  drone(t, dur) {
    const c = this.c;
    for (const [n, v] of [[38, 0.05], [45, 0.03], [50, 0.025]]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(n);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.8); g.gain.setValueAtTime(v, t + dur - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); this._send(g, 0.3); o.start(t); o.stop(t + dur + 0.1);
    }
  }
}
