import * as THREE from 'three';
import { rng } from '../world/geo.js';
import { R } from '../world/City.js';
import { toon } from '../core/Toon.js';

// Shared activities that work solo or with everyone nearby:
//   race  — a hover-scooter checkpoint race through real streets (route generated from a shared
//           seed, so every player sees the same course); finish times are broadcast.
//   sixes — "Catch the Six" at Chinnaswamy: balls fly out of the middle; first to the landing
//           spot catches it. The host (lowest player id) launches balls and settles disputes.

export class Minigames {
  constructor(game) {
    this.game = game;
    this.session = null;
    this.ballMat = toon({ color: '#c0262d', hatch: 0.2, rim: 0.3 });
    this.ringMat = toon({ color: '#3fb3a6', unlit: true, hatch: 0 });
  }

  // ------------------------------------------------------------------ entry points

  // Called from NPC scripts. opts.kind: 'race' | 'sixes'
  async run(name, opts = {}, ctx) {
    if (this.session) { this.game.hud.toast('Something is already on!'); return null; }
    const seed = Math.floor(Math.random() * 1e9);
    const start = Date.now() + (this.game.net && this.game.remotes.size ? 9000 : 4000);
    const p = this.game.player.pos;
    const data = { seed, start, x: p.x, z: p.z, name };
    this.game.net?.event(`${name}:invite`, data);
    return this._begin(name, data, true);
  }

  onNetEvent(peer, type, data, ts) {
    const [name, what] = type.split(':');
    if (what === 'invite') {
      if (this.session || this.game.quests.active) return;
      const d = Math.hypot(data.x - this.game.player.pos.x, data.z - this.game.player.pos.z);
      if (d > 400) return;
      const label = name === 'race' ? 'a hover race' : 'Catch the Six';
      this.game.hud.toast(`${peer.name} started ${label}! Head to the ▼ marker to join.`, 5000);
      this.game.hud.chat(null, `${peer.name} started ${label} — join in!`, true);
      this._begin(name, data, false, peer);
      return;
    }
    if (this.session && this.session.name === name) this.session.onNet?.(peer, what, data, ts);
  }

  async _begin(name, data, mine, host) {
    if (name === 'race') return this._race(data, mine);
    if (name === 'sixes') return this._sixes(data, mine);
    return null;
  }

  _countdown(start) {
    const hud = this.game.hud;
    return new Promise((res) => {
      let last = null;
      const iv = setInterval(() => {
        const left = Math.ceil((start - Date.now()) / 1000);
        if (left !== last && left <= 3 && left > 0) { hud.big(String(left), '', 900); this.game.audio.click(); }
        last = left;
        if (Date.now() >= start) { clearInterval(iv); hud.big('GO!', '', 900); this.game.audio.fanfare(false); res(); }
      }, 100);
    });
  }

  // ------------------------------------------------------------------ hover race

  route(seed, x, z, n = 7, spacing = 150) {
    const tr = this.game.traffic;
    const r = rng(seed);
    // nearest node on a decent road
    let node = null, bd = Infinity;
    for (const e of tr.edges) {
      if (e.road.code > R.residential || e.road.bridge) continue;
      const d = (e.a.x - x) ** 2 + (e.a.z - z) ** 2;
      if (d < bd) { bd = d; node = e.a; }
    }
    if (!node) return [];
    const pts = [];
    let prev = null, acc = 0;
    let cur = node;
    for (let steps = 0; steps < 600 && pts.length < n; steps++) {
      let opts = cur.out.filter((e) => e.b !== prev && !e.road.bridge && e.road.code <= R.residential);
      if (!opts.length) opts = cur.out;
      if (!opts.length) break;
      // stable order, then a seeded pick that favours big roads
      opts = [...opts].sort((a, b) => Math.atan2(a.dx, a.dz) - Math.atan2(b.dx, b.dz));
      const w = opts.map((e) => (e.road.code <= R.tertiary ? 3 : 1));
      let t = r() * w.reduce((a, b) => a + b, 0), pick = opts[0];
      for (let i = 0; i < opts.length; i++) { t -= w[i]; if (t <= 0) { pick = opts[i]; break; } }
      acc += pick.len;
      prev = cur; cur = pick.b;
      if (acc > spacing) { pts.push([cur.x, cur.z]); acc = 0; }
    }
    return pts;
  }

  async _race(data, mine) {
    const g = this.game;
    const pts = this.route(data.seed, data.x, data.z);
    if (pts.length < 3) { g.hud.toast('No good roads here for a race.'); return null; }
    const results = [];
    const ses = { name: 'race', results, onNet: (peer, what, d) => {
      if (what === 'finish') { results.push({ name: peer.name, t: d.t }); g.hud.chat(null, `🏁 ${peer.name} finished in ${d.t.toFixed(1)}s`, true); }
    } };
    this.session = ses;
    const startLabel = g.labels.add('START', () => new THREE.Vector3(data.x, 3.5, data.z), { cls: 'marker goal', maxDist: 2000 });
    g.hud.objective('Get to the start line and hop on your scooter (R)', 'HOVER RACE');
    // wait for the start time; you're "in" if you're near the start
    await new Promise((res) => {
      const iv = setInterval(() => {
        const d = Math.hypot(g.player.pos.x - data.x, g.player.pos.z - data.z);
        g.hud.objectiveDist(d);
        if (Date.now() > data.start - 3200) { clearInterval(iv); res(); }
      }, 100);
    });
    const inRace = Math.hypot(g.player.pos.x - data.x, g.player.pos.z - data.z) < 40;
    if (!inRace) { startLabel.remove(); g.hud.objective(null); this.session = null; g.hud.toast('Missed the start! Next time.'); return null; }
    if (g.player.mode !== 'ride') g.player.toggleRide();
    g.quests.freeze = true;
    await this._countdown(data.start);
    g.quests.freeze = false;
    startLabel.remove();
    const t0 = performance.now();
    // checkpoint rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.35, 8, 24), this.ringMat);
    g.ren.scene.add(ring);
    let ok = true;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      ring.position.set(x, 3.2, z);
      const nxt = pts[i + 1] || pts[i];
      ring.rotation.y = Math.atan2(nxt[0] - x, nxt[1] - z);
      g.hud.objective(i === pts.length - 1 ? 'Final stretch! Reach the finish' : `Checkpoint ${i + 1} of ${pts.length}`, 'HOVER RACE');
      g.quests.target = { x, z, icon: '◎' };
      const reached = await new Promise((res) => {
        const iv = setInterval(() => {
          const t = (performance.now() - t0) / 1000;
          g.hud.timer(t);
          const d = Math.hypot(g.player.pos.x - x, g.player.pos.z - z);
          g.hud.objectiveDist(d);
          if (d < 7) { clearInterval(iv); res(true); }
          if (t > 240) { clearInterval(iv); res(false); }
        }, 50);
      });
      if (!reached) { ok = false; break; }
      g.audio.pickup();
      g.fx.pop(new THREE.Vector3(x, 2, z), i === pts.length - 1 ? 'FINISH!' : 'CHECK!');
    }
    g.ren.scene.remove(ring);
    g.quests.target = null;
    g.hud.timer(null);
    g.hud.objectiveDist(null);
    const t = (performance.now() - t0) / 1000;
    if (ok) {
      results.push({ name: g.profile.name, t, me: true });
      g.net?.event('race:finish', { t });
      const best = +(localStorage.getItem('pb.race.' + g.zoneId) || 0);
      if (!best || t < best) { try { localStorage.setItem('pb.race.' + g.zoneId, String(t)); } catch {} }
      g.hud.big('FINISHED!', `${t.toFixed(1)} s${!best || t < best ? ' · new personal best' : ''}`, 3000);
      g.fx.confetti(g.player.pos);
      g.audio.fanfare(true);
      g.addCoins(Math.max(10, Math.round(80 - t / 3)), g.player.pos);
      // give others a few seconds, then the podium
      await new Promise((r) => setTimeout(r, g.remotes.size ? 8000 : 1500));
      results.sort((a, b) => a.t - b.t);
      const pos = results.findIndex((r) => r.me) + 1;
      const board = results.slice(0, 5).map((r, i) => `${i + 1}. ${r.name} ${r.t.toFixed(1)}s`).join('   ');
      g.hud.chat(null, `🏆 ${board}`, true);
      if (results.length > 1) g.hud.toast(`You came #${pos} of ${results.length}!`, 4000);
    } else g.hud.big('DNF', 'Got lost? It happens in Bengaluru.', 2500);
    g.hud.objective(null);
    this.session = null;
    return ok ? t : null;
  }

  // ------------------------------------------------------------------ catch the six

  async _sixes(data, mine) {
    const g = this.game;
    const centre = g.city.spots?.stadiumCenter || [data.x, data.z];
    const score = new Map();
    const balls = new Map();
    const iAmHost = mine;
    const ses = { name: 'sixes', onNet: (peer, what, d) => {
      if (what === 'ball') this._ball(balls, d);
      if (what === 'catch' && iAmHost) this._claim(balls, d.ball, peer.id, peer.name, d.t, score);
      if (what === 'point') this._point(balls, d, score);
    } };
    this.session = ses;
    g.hud.objective('Catch the Six! Run under the falling balls', 'EE SALA CUP NAMDE');
    await this._countdown(data.start);
    const r = rng(data.seed);
    const total = 12;
    let launched = 0;
    const end = data.start + total * 2600 + 6000;
    const loop = setInterval(() => {
      // host launches balls on a schedule
      if (iAmHost && launched < total && Date.now() > data.start + launched * 2600) {
        const a = r() * Math.PI * 2, d = 20 + r() * 45;
        const b = { id: launched, x: centre[0] + Math.cos(a) * d, z: centre[1] + Math.sin(a) * d, land: Date.now() + 2400, from: centre };
        launched++;
        this._ball(balls, b);
        g.net?.event('sixes:ball', b);
      }
      // catching
      for (const b of balls.values()) {
        if (b.done || b.claimed) continue;
        const now = Date.now();
        if (now >= b.land - 250 && now <= b.land + 400) {
          const d = Math.hypot(g.player.pos.x - b.x, g.player.pos.z - b.z);
          if (d < 2.4) {
            b.claimed = true;
            if (iAmHost) this._claim(balls, b.id, g.profile.id, g.profile.name, now, score);
            else g.net?.event('sixes:catch', { ball: b.id, t: now });
          }
        }
        if (now > b.land + 600 && !b.done) { b.done = true; g.ren.scene.remove(b.mesh); b.shadow.remove(); }
      }
      if (Date.now() > end) clearInterval(loop);
    }, 50);
    await new Promise((res) => { const iv = setInterval(() => { if (Date.now() > end) { clearInterval(iv); res(); } }, 200); });
    for (const b of balls.values()) { g.ren.scene.remove(b.mesh); b.shadow?.remove(); }
    const mine2 = score.get(g.profile.id)?.n || 0;
    const board = [...score.values()].sort((a, b) => b.n - a.n).slice(0, 5).map((s, i) => `${i + 1}. ${s.name}: ${s.n}`).join('   ');
    g.hud.big(`${mine2} CATCHES`, mine2 >= 5 ? 'Ee sala cup namde!' : 'Next season for sure.', 3000);
    if (board) g.hud.chat(null, `🏏 ${board}`, true);
    g.addCoins(mine2 * 8, g.player.pos);
    g.hud.objective(null);
    this.session = null;
    return mine2;
  }

  _ball(balls, b) {
    if (balls.has(b.id)) return;
    const g = this.game;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), this.ballMat);
    mesh.castShadow = true;
    g.ren.scene.add(mesh);
    const shadow = g.labels.add('✕', () => (b.done ? null : new THREE.Vector3(b.x, 0.3, b.z)), { cls: 'marker goal', maxDist: 200 });
    const ball = { ...b, mesh, shadow, done: false };
    balls.set(b.id, ball);
    const t0 = b.land - 2400;
    const tick = () => {
      if (ball.done) return;
      const k = Math.min(1, (Date.now() - t0) / 2400);
      const x = b.from[0] + (b.x - b.from[0]) * k, z = b.from[1] + (b.z - b.from[1]) * k;
      mesh.position.set(x, 1 + Math.sin(k * Math.PI) * 38 * (1 - k * 0.15), z);
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
    if (Date.now() - t0 < 200) g.audio.whoosh();
  }

  _claim(balls, id, pid, name, t, score) {
    const b = balls.get(id);
    if (!b || b.winner) return;
    b.winner = pid;
    const d = { ball: id, pid, name };
    this._point(balls, d, score);
    this.game.net?.event('sixes:point', d);
  }

  _point(balls, d, score) {
    const b = balls.get(d.ball);
    if (b && b.scored) return;
    if (b) { b.scored = true; b.done = true; this.game.ren.scene.remove(b.mesh); b.shadow.remove(); }
    const s = score.get(d.pid) || { name: d.name, n: 0 };
    s.n++;
    score.set(d.pid, s);
    const me = d.pid === this.game.profile.id;
    if (b) this.game.fx.pop(new THREE.Vector3(b.x, 1.5, b.z), me ? 'CAUGHT IT!' : `${d.name}!`);
    if (me) { this.game.audio.coin(); this.game.player.avatar.play('cheer', 1.2); }
  }
}
