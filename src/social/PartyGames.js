import * as THREE from 'three';
import { pickQuestions, seeded } from '../data/quiz.js';
import { Avatar, randomLook } from '../actors/Avatar.js';

// Games for everyone at the hangout. Each one is driven by a shared invite (kind, seed, start time),
// so every player sees the same questions / notes / roles; players report their own moves and
// every client scores the game the same way.

const $ = (id) => document.getElementById(id);

export class PartyGame {
  constructor(social, inv) {
    this.s = social;
    this.g = social.game;
    this.inv = inv;
    this.sid = inv.sid;
    this.done = false;
    this.players = new Map();
    const me = this.g.profile;
    this.players.set(me.id, { name: me.name, score: 0, me: true });
    for (const id of inv.players || []) this.addPlayer(id);
    for (const b of inv.bots || []) this.players.set(b.id, { name: b.name, score: 0, bot: b });
    this.result = new Promise((r) => (this._resolve = r));
    this.el = document.createElement('div');
    this.el.className = 'party';
    $('hud').appendChild(this.el);
    document.body.classList.add('partying');
  }
  addPlayer(id, name) {
    if (this.players.has(id)) return this.players.get(id);
    const r = this.g.remotes.get(id);
    const p = { name: name || r?.peer.name || (id === 'bot' ? 'Chor Chikka (bot)' : 'Player'), score: 0 };
    this.players.set(id, p);
    return p;
  }
  board(sortDesc = true, fmt = (s) => s) {
    const list = [...this.players.entries()].sort((a, b) => (sortDesc ? b[1].score - a[1].score : a[1].score - b[1].score));
    return list.map(([id, p], i) => `<div class="pg-row${p.me ? ' me' : ''}"><b>${i + 1}</b><span>${escapeHtml(p.name)}</span><i>${fmt(p.score)}</i></div>`).join('');
  }
  finish(title, sortDesc = true, fmt) {
    if (this.done) return;
    this.done = true;
    const list = [...this.players.values()].sort((a, b) => (sortDesc ? b.score - a.score : a.score - b.score));
    const rank = list.findIndex((p) => p.me) + 1;
    const coins = [0, 60, 40, 25][rank] || 10;
    this.el.innerHTML = `<div class="pg-card"><div class="pg-kicker">${title}</div><h3>${rank === 1 ? 'YOU WIN! 🏆' : `You came #${rank}`}</h3><div class="pg-board">${this.board(sortDesc, fmt)}</div><div class="pg-foot">+${coins} 🪙 · next round at the club soon</div></div>`;
    this.g.addCoins(coins, this.g.player.pos);
    if (rank === 1) { this.g.fx.confetti(this.g.player.pos, 160); this.g.audio.fanfare(true); this.g.player.avatar.play('cheer', 3); }
    setTimeout(() => { this.el.remove(); document.body.classList.remove('partying'); this._resolve({ rank, coins, score: this.players.get(this.g.profile.id).score }); }, 7000);
  }
  dispose() { this.el.remove(); document.body.classList.remove('partying'); this.done = true; this._resolve(null); }
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ============================================================================ Namma Quiz

export class Quiz extends PartyGame {
  constructor(social, inv) {
    super(social, inv);
    this.qs = pickQuestions(inv.seed, 8);
    this.answers = this.qs.map(() => new Map());
    this.OPEN = 12000; this.SLOT = 16000;
    this.el.classList.add('quiz');
    this.fullscreen = true;
    this.cur = -1;
    // bots answer the same way on every screen (seeded)
    (inv.bots || []).forEach((b, bi) => {
      const r = seeded(inv.seed + 977 * (bi + 1));
      this.qs.forEach((qq, qi) => {
        const right = r() < b.skill, ms = 1800 + r() * 8500, wrong = (qq.correct + 1 + Math.floor(r() * 3)) % 4;
        this.answers[qi].set(b.id, { a: right ? qq.correct : wrong, ms });
      });
    });
  }
  onNet(peer, type, d) {
    if (type !== 'quiz:ans' || d.sid !== this.sid) return;
    this.addPlayer(peer.id, peer.name);
    if (!this.answers[d.q].has(peer.id)) this.answers[d.q].set(peer.id, { a: d.a, ms: d.ms });
  }
  answer(i) {
    const q = this.cur;
    if (q < 0 || this.answers[q].has(this.g.profile.id)) return;
    const ms = Date.now() - (this.inv.start + q * this.SLOT);
    if (ms > this.OPEN) return;
    this.answers[q].set(this.g.profile.id, { a: i, ms });
    this.g.net?.event('quiz:ans', { sid: this.sid, q, a: i, ms });
    this.g.audio.click();
    this.render(true);
  }
  score() {
    for (const p of this.players.values()) p.score = 0;
    const now = Date.now();
    this.qs.forEach((qq, qi) => {
      if (now < this.inv.start + qi * this.SLOT + this.OPEN) return;   // only count closed questions
      for (const [id, ans] of this.answers[qi]) {
        const p = this.addPlayer(id);
        if (ans.a === qq.correct) p.score += 100 + Math.round(50 * Math.max(0, 1 - ans.ms / this.OPEN));
      }
    });
  }
  update() {
    if (this.done) return;
    const t = Date.now() - this.inv.start;
    if (t < 0) { this.el.innerHTML = `<div class="pg-card"><div class="pg-kicker">NAMMA QUIZ NIGHT</div><h3>Starting in ${Math.ceil(-t / 1000)}…</h3><p>8 questions about Bengaluru. Faster answers score more.</p></div>`; return; }
    const q = Math.floor(t / this.SLOT);
    if (q >= this.qs.length) { this.score(); this.finish('NAMMA QUIZ NIGHT'); this.s.postScore('quiz', this.players.get(this.g.profile.id).score); return; }
    if (q !== this.cur) { this.cur = q; this.render(false); this.g.audio.click(); }
    this.render(true);
  }
  render(soft) {
    const q = this.cur, qq = this.qs[q];
    const t = Date.now() - (this.inv.start + q * this.SLOT);
    const open = t < this.OPEN;
    const mine = this.answers[q].get(this.g.profile.id);
    this.score();
    const left = Math.max(0, (this.OPEN - t) / 1000);
    const answered = [...this.answers[q].values()].filter((a) => a.ms <= t).length;
    const key = `${q}|${open}|${mine ? mine.a : -1}|${Math.ceil(left)}|${answered}|${this.players.size}`;
    if (soft && key === this._key) return;
    this._key = key;
    const opts = qq.opts.map((o, i) => {
      let cls = 'pg-opt';
      if (!open && i === qq.correct) cls += ' right';
      else if (!open && mine && mine.a === i) cls += ' wrong';
      else if (mine && mine.a === i) cls += ' picked';
      return `<button class="${cls}" data-i="${i}"><span>${i + 1}</span>${escapeHtml(o)}</button>`;
    }).join('');
    const got = [...this.answers[q].entries()].filter(([, a]) => a.a === qq.correct).length;
    this.el.innerHTML = `<div class="pg-card wide"><div class="pg-kicker">NAMMA QUIZ · QUESTION ${q + 1} / ${this.qs.length}</div>
      <h3>${escapeHtml(qq.q)}</h3><div class="pg-opts">${opts}</div>
      <div class="pg-bar"><i style="width:${(left / (this.OPEN / 1000)) * 100}%"></i></div>
      <div class="pg-sub">${open ? (mine ? `Answer locked. ${answered} of ${this.players.size} answered…` : `${Math.ceil(left)}s — press 1-4 or tap`) : `${got} of ${this.answers[q].size || 0} got it right`}</div>
      <div class="pg-board mini">${this.board()}</div></div>`;
    this.el.querySelectorAll('.pg-opt').forEach((b) => (b.onclick = () => this.answer(+b.dataset.i)));
  }
  key(n) { if (n >= 1 && n <= 4) this.answer(n - 1); }
}

// ============================================================================ Dance-off

export class DanceOff extends PartyGame {
  constructor(social, inv) {
    super(social, inv);
    this.el.classList.add('dance');
    this.fullscreen = true;
    this.BPM = 118;
    this.beat = 60 / this.BPM;
    this.LEN = 36;              // seconds of dancing
    this.TRAVEL = 1.5;          // seconds a note takes to fall
    const r = seeded(inv.seed);
    this.notes = [];
    for (let b = 4; b * this.beat < this.LEN; b += 0.5) {
      const dense = b * this.beat > this.LEN * 0.45;
      if (b % 1 !== 0 && (!dense || r() < 0.55)) continue;
      if (r() < 0.25) continue;
      this.notes.push({ t: b * this.beat, lane: Math.floor(r() * 4), hit: null });
    }
    this.combo = 0; this.best = 0;
    this.judge = '';
    this.el.innerHTML = `<canvas class="dance-cv" width="360" height="420"></canvas><div class="dance-pads">${['←', '↓', '↑', '→'].map((a, i) => `<button data-l="${i}">${a}</button>`).join('')}</div>`;
    this.cv = this.el.querySelector('canvas');
    this.el.querySelectorAll('.dance-pads button').forEach((b) => {
      const l = +b.dataset.l;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.press(l); }, { passive: false });
      b.addEventListener('mousedown', (e) => { e.preventDefault(); this.press(l); });
    });
    this.onKey = (e) => {
      const m = { ArrowLeft: 0, KeyA: 0, ArrowDown: 1, KeyS: 1, ArrowUp: 2, KeyW: 2, ArrowRight: 3, KeyD: 3 }[e.code];
      if (m != null && !e.repeat) { e.preventDefault(); this.press(m); }
    };
    addEventListener('keydown', this.onKey);
    this.s.freeze = true;
    this.g.audio.clubForce?.(true);
    this.sendT = 0;
    document.body.classList.add('dancing');
  }
  now() { return (Date.now() - this.inv.start) / 1000; }
  press(lane) {
    const t = this.now();
    if (t < -0.5 || this.done) return;
    let best = null, bd = 0.22;
    for (const n of this.notes) {
      if (n.hit !== null || n.lane !== lane) continue;
      const d = Math.abs(n.t - t);
      if (d < bd) { bd = d; best = n; }
    }
    const me = this.players.get(this.g.profile.id);
    if (!best) { this.combo = 0; this.judge = 'MISS'; return; }
    best.hit = bd < 0.09 ? 2 : 1;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    me.score += (best.hit === 2 ? 300 : 120) * (1 + Math.min(this.combo, 40) / 20);
    me.score = Math.round(me.score);
    this.judge = best.hit === 2 ? 'PERFECT' : 'GOOD';
    if (this.combo % 8 === 0) this.g.fx.pop(this.g.player.pos, `${this.combo} COMBO!`);
    this.g.player.avatar.play('dance', 1.2);
  }
  onNet(peer, type, d) {
    if (type !== 'dance:score' || d.sid !== this.sid) return;
    const p = this.addPlayer(peer.id, peer.name);
    p.score = Math.max(p.score, d.score | 0);
    const r = this.g.remotes.get(peer.id);
    if (r) r.avatar.play('dance', 1.5);
  }
  update(dt) {
    if (this.done) return;
    const t = this.now();
    // missed notes reset the combo
    for (const n of this.notes) if (n.hit === null && t - n.t > 0.22) { n.hit = 0; this.combo = 0; this.judge = 'MISS'; }
    // bots: seeded hits, the same on every screen
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      const r = seeded(this.inv.seed + 31 * (p.bot.i + 1));
      let s = 0, c = 0;
      for (const n of this.notes) {
        if (n.t > t) break;
        if (r() < p.bot.skill + 0.2) { c++; s += (r() < p.bot.skill ? 300 : 120) * (1 + Math.min(c, 40) / 20); } else c = 0;
      }
      p.score = Math.round(s);
    }
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 1.5; this.g.net?.event('dance:score', { sid: this.sid, score: this.players.get(this.g.profile.id).score }); }
    this.draw(t);
    if (t > this.LEN + 1.5) {
      this.g.net?.event('dance:score', { sid: this.sid, score: this.players.get(this.g.profile.id).score, final: true });
      removeEventListener('keydown', this.onKey);
      this.s.freeze = false;
      this.g.audio.clubForce?.(false);
      document.body.classList.remove('dancing');
      this.finish('DANCE-OFF · NAMMA CLUB');
      this.s.postScore('dance', this.players.get(this.g.profile.id).score);
    }
  }
  draw(t) {
    const c = this.cv.getContext('2d'), W = this.cv.width, H = this.cv.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(42,34,38,0.72)'; c.fillRect(0, 0, W, H);
    const lw = W / 4, hitY = H - 70;
    const cols = ['#e75a7c', '#8ff0ff', '#f2c14e', '#7dc47c'];
    for (let l = 0; l < 4; l++) {
      c.strokeStyle = 'rgba(255,246,230,0.25)'; c.lineWidth = 2;
      c.strokeRect(l * lw + 4, 0, lw - 8, H);
      c.fillStyle = cols[l]; c.globalAlpha = 0.35;
      c.beginPath(); c.arc(l * lw + lw / 2, hitY, 26, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = '#fff6e6'; c.lineWidth = 3; c.stroke();
    }
    c.font = '800 30px "Baloo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const n of this.notes) {
      if (n.hit) continue;
      const dtn = n.t - t;
      if (dtn > this.TRAVEL || dtn < -0.3) continue;
      const y = hitY - (dtn / this.TRAVEL) * (hitY - 20);
      c.fillStyle = cols[n.lane];
      c.beginPath(); c.arc(n.lane * lw + lw / 2, y, 22, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2a2226'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#2a2226'; c.fillText(['←', '↓', '↑', '→'][n.lane], n.lane * lw + lw / 2, y + 1);
    }
    const me = this.players.get(this.g.profile.id);
    const ranked = [...this.players.values()].sort((a, b) => b.score - a.score).slice(0, 4);
    c.fillStyle = 'rgba(20,16,18,0.78)'; c.fillRect(0, 0, W, 40 + ranked.length * 17);
    c.fillStyle = '#fff6e6'; c.font = '800 20px "Baloo 2", sans-serif'; c.textAlign = 'center';
    c.fillText(t < 0 ? `GET READY… ${Math.ceil(-t)}` : `${me.score}  ·  combo ${this.combo}`, W / 2, 20);
    c.font = '700 14px "Baloo 2", sans-serif';
    ranked.forEach((p, i) => {
      const y = 46 + i * 17;
      c.fillStyle = p.me ? '#f2c14e' : '#fff6e6';
      c.textAlign = 'left'; c.fillText(`${i + 1}. ${p.name.replace(' 🤖', ' (bot)').slice(0, 22)}`, 14, y);
      c.textAlign = 'right'; c.fillText(String(p.score), W - 14, y);
    });
    c.textAlign = 'center';
    if (this.judge) { c.fillStyle = this.judge === 'MISS' ? '#ff7a7a' : '#f2c14e'; c.font = '30px Bangers, sans-serif'; c.fillText(this.judge, W / 2, hitY - 60); }
  }
  dispose() { removeEventListener('keydown', this.onKey); this.s.freeze = false; this.g.audio.clubForce?.(false); document.body.classList.remove('dancing'); super.dispose(); }
}

// ============================================================================ Chor-Police (tag)

export class ChorPolice extends PartyGame {
  constructor(social, inv) {
    super(social, inv);
    this.el.classList.add('chor');
    this.LEN = 100;
    this.police = inv.police;
    this.immune = new Map();
    this.last = inv.start;
    this.g.player.mode === 'ride' && this.g.player.toggleRide();
    this.s.noRide = true;
    if (inv.bot) this._spawnBot(inv.bot);
    // a siren tag floating over whoever is police
    this.tag = this.g.labels.add('🚨 POLICE', () => this.policePos(), { cls: 'marker police', maxDist: 200 });
  }
  policePos() {
    const p = this.posOf(this.police);
    return p ? new THREE.Vector3(p.x, (p.y || 0) + 2.6, p.z) : null;
  }
  posOf(id) {
    if (id === this.g.profile.id) return this.g.player.pos;
    if (id === 'bot') return this.bot?.pos;
    return this.g.remotes.get(id)?.pos;
  }
  _spawnBot() {
    const av = new Avatar({ ...randomLook(7), shirt: '#2b2b30', extras: ['cap'] });
    const [x, z] = this.s.venue.spots.floor;
    this.bot = { av, pos: new THREE.Vector3(x + 6, 0, z + 6), yaw: 0 };
    av.object.position.copy(this.bot.pos);
    this.g.ren.scene.add(av.object);
  }
  onNet(peer, type, d) {
    if (d.sid !== this.sid) return;
    this.addPlayer(peer.id, peer.name);
    if (type === 'chor:tag') this.swap(d.to, false);
    if (type === 'chor:police' && typeof d.police === 'string') { if (!this.players.has(d.police)) this.addPlayer(d.police); this.police = d.police; }
  }
  swap(to, broadcast) {
    if (to === this.police) return;
    const was = this.police;
    this.police = to;
    this.immune.set(was, Date.now() + 3000);
    this.last = Date.now();
    if (broadcast) this.g.net?.event('chor:tag', { sid: this.sid, to });
    const p = this.posOf(to);
    if (p) this.g.fx.pop(p, to === this.g.profile.id ? 'CAUGHT!' : 'TAG!');
    this.g.audio.bonk();
    if (to === this.g.profile.id) this.g.hud.big("YOU'RE THE POLICE", 'Catch a chor!', 1500);
  }
  update(dt) {
    if (this.done) return;
    const t = (Date.now() - this.inv.start) / 1000;
    const meId = this.g.profile.id;
    if (t >= 0) {
      // the clock: every chor (not police) earns time, but only near the club and not hiding on a roof
      const [cx, cz] = this.s.venue.spots.floor;
      this.out = false;
      for (const [id, p] of this.players) {
        if (id === this.police) continue;
        const q = this.posOf(id);
        if (!q) continue;
        const inside = Math.hypot(q.x - cx, q.z - cz) < 70 && (q.y || 0) < 3.5;
        if (inside) p.score += dt;
        else if (id === meId) this.out = true;
      }
      this.boost = this.police === meId ? 1.15 : 1;
      this.syncT = (this.syncT || 0) - dt;
      if (this.police === meId && this.syncT <= 0) { this.syncT = 2; this.g.net?.event('chor:police', { sid: this.sid, police: meId }); }
      // police tags a nearby chor
      const myPos = this.g.player.pos;
      const tagger = this.police === meId ? myPos : this.police === 'bot' ? this.bot?.pos : null;
      if (tagger) {
        for (const [id] of this.players) {
          if (id === this.police || (this.immune.get(id) || 0) > Date.now()) continue;
          const p = this.posOf(id);
          if (p && Math.hypot(p.x - tagger.x, p.z - tagger.z) < 1.8 && Math.abs((p.y || 0) - (tagger.y || 0)) < 2) { this.swap(id, this.police === meId); break; }
        }
      }
      this._bot(dt);
    }
    const left = Math.max(0, this.LEN - t);
    const role = this.police === meId ? '<b class="cop">🚨 YOU ARE POLICE</b> — catch someone!' : this.out ? '<b class="thief">⚠️ Come back!</b> Time only counts near the club, not on roofs' : '<b class="thief">💰 YOU ARE A CHOR</b> — run!';
    this.el.innerHTML = `<div class="pg-card slim"><div class="pg-kicker">CHOR-POLICE · ${t < 0 ? 'starts in ' + Math.ceil(-t) : Math.ceil(left) + 's left'}</div><div>${role}</div><div class="pg-board mini">${this.board(true, (s) => Math.round(s) + 's free')}</div></div>`;
    if (t > this.LEN) this.end();
  }
  _bot(dt) {
    const b = this.bot;
    if (!b) return;
    const me = this.g.player.pos;
    const dx = me.x - b.pos.x, dz = me.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    const chasing = this.police === 'bot';
    const sp = chasing ? 7.9 : -7.2;
    let vx = (dx / d) * sp, vz = (dz / d) * sp;
    if (!chasing && d > 25) { vx *= 0.3; vz *= 0.3; }
    // run around the venue, not off across the city
    const [cx, cz] = this.s.venue.spots.floor;
    const fx = b.pos.x - cx, fz = b.pos.z - cz, fd = Math.hypot(fx, fz);
    if (fd > 45) { vx -= (fx / fd) * 4; vz -= (fz / fd) * 4; }
    const [nx, nz] = this.g.city.collide(b.pos.x + vx * dt, b.pos.z + vz * dt, 0.35, 0);
    b.pos.set(nx, this.g.city.groundAt(nx, nz, 1), nz);
    b.yaw = Math.atan2(vx, vz);
    b.av.object.position.copy(b.pos);
    b.av.object.rotation.y = b.yaw;
    b.av.update(dt, { speed: Math.hypot(vx, vz), grounded: true });
  }
  end() {
    this.tag.remove();
    if (this.bot) { this.g.ren.scene.remove(this.bot.av.object); this.bot.av.dispose(); this.bot = null; }
    this.s.noRide = false;
    this.finish('CHOR-POLICE', true, (s) => Math.round(s) + 's free');
    this.s.postScore('chor', Math.round(this.players.get(this.g.profile.id).score));
  }
  dispose() { this.tag.remove(); if (this.bot) { this.g.ren.scene.remove(this.bot.av.object); this.bot = null; } this.s.noRide = false; super.dispose(); }
}
