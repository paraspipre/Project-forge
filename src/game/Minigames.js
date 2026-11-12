import * as THREE from 'three';
import { rng } from '../world/geo.js';
import { R } from '../world/City.js';
import { toon } from '../core/Toon.js';
import { fxBlend } from './Fx.js';

const fxBlendLine = () => fxBlend(new THREE.LineBasicMaterial({ color: 0x8ff0ff, opacity: 0.9 }));

// Shared activities that work solo or with everyone nearby:
//   race  — a hover-scooter checkpoint race through real streets (route generated from a shared
//           seed, so every player sees the same course); finish times are broadcast.
//   sixes — "Catch the Six" at Chinnaswamy: balls fly out of the middle; first to the landing
//           spot catches it. The host (lowest player id) launches balls and settles disputes.

export class Minigames {
  constructor(game) {
    this.game = game;
    this.session = null;
    this.ballMat = toon({ color: '#c0262d', hatch: 0.2, rim: 0.3, plain: true });
    this.ringMat = toon({ color: '#3fb3a6', unlit: true, hatch: 0 });
  }

  // ------------------------------------------------------------------ entry points

  // Called from NPC scripts. opts.kind: 'race' | 'sixes'
  async run(name, opts = {}, ctx) {
    if (this.session) { this.game.hud.toast('Something is already on!'); return null; }
    if (name !== 'race' && name !== 'sixes') return this._begin(name, opts, true);
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
    if (name === 'foam') return this._foam(data);
    if (name === 'dosa') return this._dosa(data);
    return null;
  }

  // ------------------------------------------------------------------ the Foam (Bellandur boss)

  _hud(html) {
    let el = document.getElementById('mg-hud');
    if (!el) { el = document.createElement('div'); el.id = 'mg-hud'; document.getElementById('hud').appendChild(el); }
    if (html == null) { el.remove(); return; }
    el.innerHTML = html;
  }

  async _foam() {
    const g = this.game, city = g.city;
    this.session = { name: 'foam' };
    // the monster rises a little way out into the lake from the shore
    const shore = city.spots?.lakeShore || [g.player.pos.x, g.player.pos.z];
    let mx = shore[0], mz = shore[1];
    const lc = [-747, -735];
    const d0 = Math.hypot(lc[0] - mx, lc[1] - mz);
    if (city.spots?.lakeBoss) [mx, mz] = city.spots.lakeBoss;
    else for (let s = 10; s < d0; s += 5) {
      const x = mx + ((lc[0] - mx) / d0) * s, z = mz + ((lc[1] - mz) / d0) * s;
      if (city.isWater(x, z) && s > 45) { mx = x; mz = z; break; }
    }
    const mat = toon({ color: '#fbfbf7', hatch: 0.6, rim: 0.3 });
    const dark = toon({ color: '#2a2226', hatch: 0 });
    const boss = new THREE.Group();
    const blobs = [];
    const R = rng(9);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
      const s = 3 + R() * 3.5;
      m.scale.setScalar(s);
      m.position.set((R() - 0.5) * 12, 3 + R() * 9 + (i === 0 ? 6 : 0), (R() - 0.5) * 8);
      m.castShadow = true;
      boss.add(m);
      blobs.push({ m, s, base: m.position.clone(), p: R() * 6 });
    }
    // angry eyes and eyebrows on the biggest top blob
    const head = new THREE.Group();
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), dark); e.position.set(sx * 1.8, 0, 3.6); e.scale.set(1, 1.3, 0.5); head.add(e);
      const br = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.5), dark); br.position.set(sx * 1.8, 1.7, 3.5); br.rotation.z = -sx * 0.45; head.add(br);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.5), dark); mouth.position.set(0, -2, 3.5); head.add(mouth);
    head.position.set(0, 16, 1);
    boss.add(head);
    boss.position.set(mx, -20, mz);
    this._boss = boss;
    g.ren.scene.add(boss);
    boss.lookAt(g.player.pos.x, 0, g.player.pos.z);
    // fight setup
    const cross = document.createElement('div');
    cross.id = 'crosshair'; cross.textContent = '+';
    document.getElementById('hud').appendChild(cross);
    g.camRig.yaw = Math.atan2(mx - g.player.pos.x, mz - g.player.pos.z);
    g.camRig.pitch = 0.12;
    g.hud.prompt('Fire the Clean-up Cannon', 'Click');
    const btn = document.getElementById('t-act'); const oldTxt = btn.textContent; btn.textContent = '💦';
    g.audio.fanfare(false);
    g.hud.big('THE FOAM AWAKENS', 'Click / tap to blast it', 2400);
    const maxHp = 26;
    let hp = maxHp, health = 5;
    const balls = [];
    let throwT = 2.5, rise = 0, over = null;
    const ray = new THREE.Raycaster();
    const jetMat = fxBlendLine();
    const jets = [];
    const ballGeo = new THREE.IcosahedronGeometry(0.9, 1);
    const tmpV = new THREE.Vector3();
    const draw = () => this._hud(`<div class="mg-row"><b>THE FOAM</b><div class="mg-bar"><i style="width:${(hp / maxHp) * 100}%"></i></div></div><div class="mg-row"><b>You</b> ${'💧'.repeat(health)}${'🫧'.repeat(5 - health)}</div>`);
    draw();
    g.quests.busy = true;
    const result = await new Promise((resolve) => {
      g.quests.ticks.add((dt) => {
        const now = performance.now();
        if (g.quests.active?.ctx.cancelled) over = null, resolve(null);
        if (over !== null || g.quests.active?.ctx.cancelled) { if (over !== null) resolve(over); return true; }
        rise = Math.min(1, rise + dt * 0.35);
        boss.position.y = -20 + rise * 20 - (1 - hp / maxHp) * 5;
        const t = now / 1000;
        for (const b of blobs) b.m.position.set(b.base.x + Math.sin(t * 1.3 + b.p) * 0.8, b.base.y + Math.sin(t * 2 + b.p) * 0.6, b.base.z + Math.cos(t * 1.1 + b.p) * 0.8);
        head.position.y = 16 + Math.sin(t * 2) * 0.5;
        boss.lookAt(g.player.pos.x, boss.position.y, g.player.pos.z);
        // throw foam balls at the player
        if (rise >= 1) {
          throwT -= dt;
          if (throwT <= 0) {
            throwT = 1.0 + (hp / maxHp) * 1.4;
            const from = boss.position.clone().add(new THREE.Vector3(0, 14, 0));
            const to = g.player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
            const m = new THREE.Mesh(ballGeo, mat); m.castShadow = true;
            g.ren.scene.add(m);
            balls.push({ m, from, to, t: 0, dur: 1.8 + Math.random() * 0.5 });
            g.audio.whoosh();
          }
        }
        for (let i = balls.length - 1; i >= 0; i--) {
          const b = balls[i];
          b.t += dt / b.dur;
          const k = Math.min(1, b.t);
          b.m.position.lerpVectors(b.from, b.to, k);
          b.m.position.y += Math.sin(k * Math.PI) * 18;
          b.m.rotation.x += dt * 4;
          if (k >= 1) {
            if (b.m.position.distanceTo(g.player.pos) < 2.4) {
              health--; draw();
              g.ren.post.material.uniforms.uFlash.value = 0.6;
              g.fx.pop(g.player.pos, 'SPLAT!');
              g.audio.bonk();
              g.player.knock(Math.random() - 0.5, Math.random() - 0.5, 4);
              if (health <= 0) over = false;
            } else g.fx.dust(b.m.position);
            g.ren.scene.remove(b.m);
            balls.splice(i, 1);
          }
        }
        const fl = g.ren.post.material.uniforms.uFlash;
        fl.value = Math.max(0, fl.value - dt * 1.5);
        // fire
        const fire = g.input.consume('click') || g.input.consume('interact');
        if (fire && rise > 0.6) {
          g.audio._noise?.({ dur: 0.18, vol: 0.18, f: 2500, q: 0.6 });
          ray.setFromCamera(new THREE.Vector2(0, 0.24), g.ren.camera);
          // aim assist: snap to the closest target within a few degrees
          let best = null, bestA = 0.07;
          const cands = [...balls.map((b) => ({ p: b.m.position, r: 0.9, ball: b })), { p: boss.position.clone().add(new THREE.Vector3(0, 10, 0)), r: 9, boss: true }];
          for (const c of cands) {
            tmpV.copy(c.p).sub(ray.ray.origin);
            const dist = tmpV.length();
            if (dist > 160) continue;
            const ang = Math.max(0, tmpV.normalize().angleTo(ray.ray.direction) - Math.atan(c.r / dist));
            if (ang < bestA) { bestA = ang; best = c; }
          }
          const hand = g.player.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
          const end = best ? best.p.clone() : ray.ray.at(80, new THREE.Vector3());
          const geo = new THREE.BufferGeometry().setFromPoints([hand, end]);
          const line = new THREE.Line(geo, jetMat);
          g.ren.scene.add(line);
          jets.push({ line, t: 0.18 });
          if (best?.ball) { g.ren.scene.remove(best.ball.m); balls.splice(balls.indexOf(best.ball), 1); g.fx.pop(best.p, 'POP!'); g.audio.pickup(); }
          else if (best?.boss) {
            hp--; draw();
            g.fx.pop(end, ['SPLASH!', 'CLEAN!', 'SCRUB!', 'WHOOSH!'][hp % 4]);
            g.camRig.shake(0.15);
            if (hp <= 0) over = true;
          }
        }
        for (let i = jets.length - 1; i >= 0; i--) { jets[i].t -= dt; if (jets[i].t <= 0) { g.ren.scene.remove(jets[i].line); jets[i].line.geometry.dispose(); jets.splice(i, 1); } }
        return false;
      });
    });
    g.quests.busy = false;
    // wrap up
    for (const b of balls) g.ren.scene.remove(b.m);
    for (const j of jets) g.ren.scene.remove(j.line);
    cross.remove();
    btn.textContent = oldTxt;
    this._hud(null);
    g.hud.prompt(null);
    g.ren.post.material.uniforms.uFlash.value = 0;
    if (result) {
      g.hud.big('FOAM DEFEATED!', 'Bellandur Lake breathes again (a bit)', 3000);
      g.fx.confetti(g.player.pos, 160);
      g.audio.fanfare(true);
      // the boss deflates and the lake foam shrinks
      await new Promise((res) => {
        let k = 1;
        const iv = setInterval(() => {
          k -= 0.03; boss.scale.setScalar(Math.max(0.01, k)); boss.position.y -= 0.3;
          if (k <= 0) { clearInterval(iv); res(); }
        }, 30);
      });
      if (city.foam) { for (const b of city.foam.blobs) b.s *= 0.45; city.foam.refresh(); }
    }
    g.ren.scene.remove(boss);
    this.session = null;
    return result;
  }

  // ------------------------------------------------------------------ benne dose balance

  async _dosa({ tables = 3 }) {
    const g = this.game, p = g.player;
    this.session = { name: 'dosa' };
    if (p.mode === 'ride') p.toggleRide();
    const plateM = toon({ color: '#f4f1ea', hatch: 0.3 }), doseM = toon({ color: '#d99a3e', hatch: 0.6 });
    const stack = new THREE.Group();
    const plates = [];
    const pg = new THREE.CylinderGeometry(0.2, 0.17, 0.03, 12), dg = new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8);
    dg.rotateZ(Math.PI / 2);
    let N = 12;
    for (let i = 0; i < N; i++) {
      const pl = new THREE.Group();
      const a = new THREE.Mesh(pg, plateM), b = new THREE.Mesh(dg, doseM);
      b.position.y = 0.05;
      pl.add(a, b);
      pl.position.y = i * 0.075;
      stack.add(pl);
      plates.push(pl);
    }
    stack.position.set(-0.25, 1.32, 0.42);
    p.object.add(stack);
    p.carry = true;
    let tilt = 0, prevV = new THREE.Vector3(), prevYaw = p.yaw, served = 0;
    const draw = () => this._hud(`<div class="mg-row"><b>Balance</b><div class="mg-bar wob"><i style="width:${Math.min(100, Math.abs(tilt) * 100)}%;background:${Math.abs(tilt) > 0.7 ? '#e75a5a' : Math.abs(tilt) > 0.4 ? '#f2c14e' : '#3fb3a6'}"></i></div></div><div class="mg-row"><b>Plates</b> ${'🍽️'.repeat(N)}</div>`);
    const P = g.city.spots?.vidyarthi || [p.pos.x, p.pos.z];
    const spots = [];
    for (let i = 0; i < tables; i++) {
      const a = i * 2.2 + 0.5;
      spots.push(g.quests.openSpot(P[0] + Math.cos(a) * (22 + i * 10), P[1] + Math.sin(a) * (22 + i * 10), 6));
    }
    let ti = 0;
    const mk = g.labels.add('🍽️', () => (ti < spots.length ? new THREE.Vector3(spots[ti][0], 2.5, spots[ti][1]) : null), { cls: 'marker goal', maxDist: 300 });
    g.hud.objective(`Serve table 1 of ${tables} — walk smoothly!`, 'BENNE DOSE BALANCE');
    draw();
    const result = await new Promise((resolve) => {
      g.quests.ticks.add((dt) => {
        const now = performance.now();
        if (!this.session || g.quests.active?.ctx.cancelled) { resolve(served); return true; }
        dt = Math.max(dt, 1e-3);
        // tilt chases a target set by sideways acceleration, turning and running; jerky moves crash plates
        const v = p.vel.clone().setY(0);
        const accV = v.clone().sub(prevV).divideScalar(dt);
        prevV.copy(v);
        let dy = p.yaw - prevYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        prevYaw = p.yaw;
        const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw);
        const lateral = accV.x * hz - accV.z * hx;          // sideways acceleration
        const forward = accV.x * hx + accV.z * hz;          // speeding up / braking
        const sp2 = v.length();
        const t = now / 1000;
        const target = lateral * 0.06 + (dy / dt) * 0.28 + forward * 0.025
          + (g.input.run ? Math.sin(t * 9) * 0.55 : Math.sin(t * 6) * sp2 * 0.035) + (!p.grounded ? 0.8 : 0);
        tilt += (target - tilt) * Math.min(1, dt * 3.2);
        stack.rotation.z = tilt * 0.35;
        stack.rotation.x = Math.sin(now / 410) * tilt * 0.2;
        if (Math.abs(tilt) > 1) {
          // crash! lose the top plates
          const lose = Math.min(N, 2 + Math.floor(Math.random() * 2));
          for (let k = 0; k < lose; k++) { const pl = plates.pop(); if (pl) stack.remove(pl); }
          N -= lose;
          g.fx.pop(p.pos, 'CRASH!');
          g.audio.bonk();
          tilt = 0;
          if (N <= 0) { resolve(served); return true; }
        }
        if (ti < spots.length && Math.hypot(p.pos.x - spots[ti][0], p.pos.z - spots[ti][1]) < 3) {
          const give = ti === spots.length - 1 ? N : Math.min(N, Math.ceil(N / (spots.length - ti)));
          for (let k = 0; k < give; k++) { const pl = plates.pop(); if (pl) stack.remove(pl); }
          N -= give; served += give;
          g.fx.pop(p.pos, `${give} SERVED!`);
          g.audio.coin();
          ti++;
          if (ti >= spots.length || N <= 0) { resolve(served); return true; }
          g.hud.objective(`Serve table ${ti + 1} of ${tables} — walk smoothly!`, 'BENNE DOSE BALANCE');
        }
        g.quests.target = ti < spots.length ? { x: spots[ti][0], z: spots[ti][1], icon: '🍽️' } : null;
        draw();
        return false;
      });
    });
    mk.remove();
    p.object.remove(stack);
    p.carry = false;
    g.quests.target = null;
    this._hud(null);
    this.session = null;
    return result;
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
