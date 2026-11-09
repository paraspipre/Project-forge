import * as THREE from 'three';
import { PartyGame } from './PartyGames.js';
import { Avatar, randomLook } from '../actors/Avatar.js';
import { seeded } from '../data/quiz.js';
import { toon } from '../core/Toon.js';

// a chunky sci-fi blaster that sits in the right hand (barrel along the hand's -y, i.e. the arm)
let gunParts = null;
function makeGun(color = '#8ff0ff') {
  if (!gunParts) gunParts = { body: new THREE.BoxGeometry(0.08, 0.24, 0.12), barrel: new THREE.CylinderGeometry(0.025, 0.03, 0.22, 8), mat: toon({ color: '#3b3b44', hatch: 0.5, rim: 0.3 }) };
  const g = new THREE.Group();
  const body = new THREE.Mesh(gunParts.body, gunParts.mat); body.position.set(0, -0.12, 0.05);
  const barrel = new THREE.Mesh(gunParts.barrel, new THREE.MeshBasicMaterial({ color })); barrel.position.set(0, -0.3, 0.07);
  g.add(body, barrel);
  return g;
}

// Bengaluru Blasters: a cartoon sci-fi blaster battle around Namma Club. Over-the-shoulder aim,
// three blasters, respawns, a kill feed. Free-for-all, or Team Benne vs Team Masala with 4+ players.
// Bots fill in when you play alone. Shooters decide their own hits (hitscan) and tell the target.

const WEAPONS = [
  { id: 'rifle', name: 'Kaapi Blaster', rate: 7, dmg: 11, pellets: 1, spread: 0.012, range: 90, mag: 30, reload: 1.6, color: 0x8ff0ff },
  { id: 'shotgun', name: 'Coconut Scatter', rate: 1.3, dmg: 9, pellets: 7, spread: 0.075, range: 26, mag: 6, reload: 2.1, color: 0xf2c14e },
  { id: 'sniper', name: 'Auto-Meter Sniper', rate: 0.8, dmg: 72, pellets: 1, spread: 0.0, range: 220, mag: 4, reload: 2.4, color: 0xff7ad9, zoom: 30 },
];
const TEAM = { benne: { name: 'Team Benne', col: '#e75a5a' }, masala: { name: 'Team Masala', col: '#5aa9e6' } };
const LEN = 150, ARENA = 85;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Blasters extends PartyGame {
  constructor(social, inv) {
    super(social, inv);
    const g = this.g;
    this.el.classList.add('blasters');
    this.center = social.venue.pos.clone();
    this.r = seeded(inv.seed);
    const humans = (inv.players || [g.profile.id]).filter((id) => id !== 'bot');
    // bots when you're alone
    this.bots = [];
    if (humans.length < 2) {
      const names = ['Benne Bhaskar', 'Kaapi Kavya', 'Idli Ishaan'];
      names.forEach((n, i) => {
        const id = 'bot' + i;
        const av = new Avatar({ ...randomLook(inv.seed + i * 99), extras: ['cap', 'shades'] });
        av.bones.hR.add(makeGun('#ff9c5a'));
        g.ren.scene.add(av.object);
        const b = { id, name: n + ' 🤖', av, pos: new THREE.Vector3(), yaw: 0, hp: 100, dead: 0, cd: 1 + i * 0.3, strafe: i % 2 ? 1 : -1, think: 0, target: null };
        this.bots.push(b);
        this.players.set(id, { name: b.name, score: 0, deaths: 0, bot: b });
        b.tag = g.labels.add(b.name, () => (b.dead > 0 ? null : b.pos.clone().add(new THREE.Vector3(0, 2.2, 0))), { cls: 'tag', maxDist: 90 });
      });
    }
    for (const p of this.players.values()) p.deaths = p.deaths || 0;
    // teams with 4+ people
    const all = [...this.players.keys()].sort();
    this.teams = humans.length >= 4 ? new Map(all.map((id, i) => [id, i % 2 ? 'masala' : 'benne'])) : null;
    this.spawns = this._spawnPoints();
    this.hp = 100;
    this.dead = 0;
    this.shield = 0;
    this.w = 0;
    this.ammo = WEAPONS.map((w) => w.mag);
    this.reloadT = 0;
    this.fireCd = 0;
    this.firing = false;
    this.fxSendT = 0;
    this.started = false;
    this.boost = 1;
    // tracers
    this.tracers = [];
    this.tracerGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    // controls
    this.cross = document.createElement('div');
    this.cross.id = 'bl-cross';
    this.cross.innerHTML = '<i></i><i></i><i></i><i></i>';
    $('hud').appendChild(this.cross);
    this.touch = document.createElement('div');
    this.touch.id = 'bl-touch';
    this.touch.innerHTML = '<button data-a="fire">🔫</button><button data-a="swap">🔁</button>';
    $('hud').appendChild(this.touch);
    const fireBtn = this.touch.querySelector('[data-a=fire]');
    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.firing = true; }, { passive: false });
    fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.firing = false; }, { passive: false });
    this.touch.querySelector('[data-a=swap]').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.key(((this.w + 1) % 3) + 1); }, { passive: false });
    this.onDown = (e) => {
      if (e.button !== 0 || this.done) return;
      if (!document.pointerLockElement && !g.input.isTouch) g.canvas.requestPointerLock?.();
      this.firing = true;
    };
    this.onUp = (e) => { if (e.button === 0) this.firing = false; };
    g.canvas.addEventListener('mousedown', this.onDown);
    addEventListener('mouseup', this.onUp);
    document.body.classList.add('blasting');
    this.fov0 = g.ren.camera.fov;
    this.gun = makeGun();
    this.gunHand = g.player.avatar.bones.hR;
    this.gunHand.add(this.gun);
    g.blasters = this;
    if (g.player.mode === 'ride') g.player.toggleRide();
    if (g.player.mode === 'drive') g.driving.exit();
    social.noRide = true;
  }

  get active() { return !this.done; }

  _spawnPoints() {
    const g = this.g, out = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + this.r() * 0.3, d = 30 + this.r() * 35;
      const [x, z] = g.quests.openSpot(this.center.x + Math.cos(a) * d, this.center.z + Math.sin(a) * d, 6);
      out.push([x, z]);
    }
    return out;
  }

  _spawnAt() {
    // the spawn point furthest from enemies
    let best = this.spawns[0], bd = -1;
    for (const s of this.spawns) {
      let near = 1e9;
      for (const e of this._enemies()) near = Math.min(near, Math.hypot(e.pos.x - s[0], e.pos.z - s[1]));
      near += this.r() * 10;
      if (near > bd) { bd = near; best = s; }
    }
    return best;
  }

  _team(id) { return this.teams?.get(id) || null; }
  _foe(a, b) { return a !== b && (!this.teams || this._team(a) !== this._team(b)); }

  // everyone I can shoot: { id, pos, bot? }
  _enemies() {
    const g = this.g, me = g.profile.id, out = [];
    for (const [id, p] of this.players) {
      if (!this._foe(me, id)) continue;
      if (p.bot) { if (p.bot.dead <= 0) out.push({ id, pos: p.bot.pos, bot: p.bot }); continue; }
      const r = g.remotes.get(id);
      if (r && r.visible && (r.hp ?? 255) > 0) out.push({ id, pos: r.pos });
    }
    return out;
  }

  key(n) {
    if (n >= 1 && n <= 3 && this.w !== n - 1) {
      this.w = n - 1;
      this.reloadT = 0;
      this.fireCd = 0.25;
      this.g.audio.click();
      this.g.hud.toast(`🔫 ${WEAPONS[this.w].name}`, 1200);
    }
  }

  // ------------------------------------------------------------------ shooting

  _blocked(a, b) {
    const city = this.g.city;
    const d = a.distanceTo(b), n = Math.ceil(d / 1.2);
    for (let i = 1; i < n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      if (city.heightAt(x, z) > y + 0.2) return true;
    }
    return false;
  }

  _fire() {
    const g = this.g, W = WEAPONS[this.w], cam = g.ren.camera;
    const origin = cam.position.clone();
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const muzzle = g.player.pos.clone().add(new THREE.Vector3(0, 1.35, 0)).addScaledVector(fwd, 0.6);
    const startD = origin.distanceTo(g.player.pos) + 0.5;
    const enemies = this._enemies();
    const assist = g.input.isTouch ? 0.11 : 0.05;
    let any = false, lastEnd = null;
    for (let k = 0; k < W.pellets; k++) {
      const dir = fwd.clone();
      if (W.spread) { dir.x += (Math.random() - 0.5) * W.spread * 2; dir.y += (Math.random() - 0.5) * W.spread * 2; dir.z += (Math.random() - 0.5) * W.spread * 2; dir.normalize(); }
      // nearest enemy whose body (a capsule) the ray passes through, or within aim-assist angle
      let hit = null, hd = W.range;
      for (const e of enemies) {
        const c = e.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
        const to = c.clone().sub(origin);
        const along = to.dot(dir);
        if (along < startD || along > W.range) continue;
        const perp = to.clone().sub(dir.clone().multiplyScalar(along));
        const off = Math.hypot(perp.x, perp.z), offY = Math.abs(perp.y);
        const ang = perp.length() / along;
        if ((off < 0.6 && offY < 1.0) || (W.pellets === 1 && ang < assist)) {
          if (along < hd && !this._blocked(origin.clone().addScaledVector(dir, startD), c)) { hd = along; hit = e; }
        }
      }
      // where the shot ends (a wall, or max range)
      let end = origin.clone().addScaledVector(dir, hit ? hd : W.range);
      if (!hit) {
        const n = Math.ceil(W.range / 1.5);
        for (let i = Math.ceil(startD / 1.5); i < n; i++) {
          const p = origin.clone().addScaledVector(dir, i * 1.5);
          if (g.city.heightAt(p.x, p.z) > p.y || p.y < g.city.groundAt(p.x, p.z, p.y + 1)) { end = p; g.fx.dust(p); break; }
        }
      }
      this._tracer(muzzle, end, W.color);
      lastEnd = end;
      if (hit) { any = true; this._hit(hit, W.dmg, W.id); }
    }
    if (any) { g.audio._tone?.({ f: 1800, dur: 0.05, type: 'square', vol: 0.05 }); this.cross.classList.remove('hitm'); void this.cross.offsetWidth; this.cross.classList.add('hitm'); }
    g.audio._tone?.({ f: W.id === 'sniper' ? 300 : W.id === 'shotgun' ? 180 : 620, f2: W.id === 'sniper' ? 90 : 120, dur: W.id === 'rifle' ? 0.08 : 0.2, type: 'sawtooth', vol: 0.07, q: 1600 });
    g.myEmote = 'aim'; g.myEmoteT = 0.6;
    g.player.avatar.play('aim', 0.6);
    // others see the tracer
    this.fxSendT -= 1;
    if (this.fxSendT <= 0) { this.fxSendT = W.rate > 3 ? 2 : 1; g.net?.event('blast:fx', { sid: this.sid, a: muzzle.toArray().map((v) => +v.toFixed(1)), b: lastEnd.toArray().map((v) => +v.toFixed(1)), c: W.color }); }
  }

  _hit(e, dmg, wid) {
    const g = this.g;
    g.fx.pop(e.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), String(dmg));
    if (e.bot) this._botDamage(e.bot, dmg, g.profile.id, wid);
    else g.net?.event('blast:hit', { sid: this.sid, to: e.id, dmg, w: wid });
  }

  _tracer(a, b, color) {
    const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    m.position.copy(a);
    m.lookAt(b);
    m.scale.set(1, 1, a.distanceTo(b));
    this.g.ren.scene.add(m);
    this.tracers.push({ m, t: 0.09 });
  }

  // ------------------------------------------------------------------ damage, deaths

  _hurt(dmg, by, wid) {
    const g = this.g;
    if (this.dead > 0 || this.shield > 0 || this.done) return;
    this.hp -= dmg;
    g.combat.flash.classList.remove('on'); void g.combat.flash.offsetWidth; g.combat.flash.classList.add('on');
    g.camRig.shake(0.12);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = 3;
      const by_ = this.players.get(by);
      g.hud.big('SWALPA OUT! 💥', by_ ? `${by_.name} got you with the ${WEAPONS.find((w) => w.id === wid)?.name || 'blaster'}` : '', 2400);
      g.net?.event('blast:down', { sid: this.sid, by, w: wid });
      this._down(g.profile.id, by, wid);
      g.player.avatar.play('facepalm', 3);
    }
  }

  _down(victim, by, wid) {
    const v = this.players.get(victim), k = this.players.get(by);
    if (v) v.deaths = (v.deaths || 0) + 1;
    if (k && by !== victim) k.score += 1;
    this._feed(`${esc(k?.name || '?')} <b>💥</b> ${esc(v?.name || '?')} <small>${esc(WEAPONS.find((w) => w.id === wid)?.name || '')}</small>`);
    if (by === this.g.profile.id && victim !== by) { this.g.fx.pop(this.g.player.pos, '+1 KILL'); this.g.audio.coin(); }
  }

  _feed(html) {
    let f = $('bl-feed');
    if (!f) { f = document.createElement('div'); f.id = 'bl-feed'; $('hud').appendChild(f); }
    const d = document.createElement('div');
    d.innerHTML = html;
    f.prepend(d);
    while (f.children.length > 5) f.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  _botDamage(b, dmg, by, wid) {
    if (b.dead > 0 || b.shield > 0) return;
    b.hp -= dmg;
    b.av.play('facepalm', 0.3);
    if (b.hp <= 0) { b.hp = 0; b.dead = 3; b.av.object.visible = false; this.g.fx.poof(b.pos.clone().add(new THREE.Vector3(0, 1, 0)), 'OUT!'); this._down(b.id, by, wid); }
  }

  onNet(peer, type, d) {
    if (d.sid !== this.sid) return;
    const g = this.g;
    this.addPlayer(peer.id, peer.name);
    if (type === 'blast:hit' && d.to === g.profile.id) this._hurt(Math.min(80, Math.max(0, +d.dmg || 0)), peer.id, d.w);
    if (type === 'blast:down') this._down(peer.id, d.by, d.w);
    if (type === 'blast:fx' && Array.isArray(d.a) && Array.isArray(d.b)) this._tracer(new THREE.Vector3(...d.a), new THREE.Vector3(...d.b), d.c || 0xffffff);
  }

  // ------------------------------------------------------------------ bots

  _bots(dt) {
    const g = this.g, me = g.profile.id;
    for (const b of this.bots) {
      b.shield = Math.max(0, (b.shield || 0) - dt);
      if (b.dead > 0) {
        b.dead -= dt;
        if (b.dead <= 0) { const [x, z] = this._spawnAt(); b.pos.set(x, g.city.groundAt(x, z, 2), z); b.hp = 100; b.shield = 2; b.av.object.visible = true; }
        continue;
      }
      // pick the nearest visible foe (you, or another bot)
      b.think -= dt;
      if (b.think <= 0) {
        b.think = 0.6;
        let best = null, bd = 1e9;
        const cands = [];
        if (this._foe(b.id, me) && this.dead <= 0) cands.push({ id: me, pos: g.player.pos });
        for (const o of this.bots) if (o !== b && o.dead <= 0 && this._foe(b.id, o.id)) cands.push({ id: o.id, pos: o.pos, bot: o });
        for (const c of cands) { const d = c.pos.distanceTo(b.pos); if (d < bd) { bd = d; best = c; } }
        b.target = best;
        if (Math.random() < 0.3) b.strafe *= -1;
      }
      const t = b.target;
      let vx = 0, vz = 0;
      if (t) {
        const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
        b.yaw = Math.atan2(dx, dz);
        const sp = 4.6;
        if (d > 16) { vx = (dx / d) * sp; vz = (dz / d) * sp; }
        vx += (dz / d) * b.strafe * 2.4; vz += (-dx / d) * b.strafe * 2.4;
        // shoot
        b.cd -= dt;
        if (b.cd <= 0 && d < 70) {
          b.cd = 0.45 + Math.random() * 0.4;
          const from = b.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
          const to = t.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
          if (!this._blocked(from, to)) {
            const moving = t.id === me ? Math.min(1, (g.player.speedNow || 0) / 8) : 0.3;
            const p = Math.max(0.1, 0.45 - d / 120) * (1 - moving * 0.5);
            const hitIt = Math.random() < p;
            const end = hitIt ? to : to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
            this._tracer(from, end, 0xff9c5a);
            b.av.play('aim', 0.5);
            if (hitIt) { if (t.id === me) this._hurt(7, b.id, 'rifle'); else this._botDamage(t.bot, 9, b.id, 'rifle'); }
          }
        }
      } else { b.yaw += dt * 0.5; vx = Math.sin(b.yaw) * 2; vz = Math.cos(b.yaw) * 2; }
      // stay in the arena
      const cx = b.pos.x - this.center.x, cz = b.pos.z - this.center.z, cd = Math.hypot(cx, cz);
      if (cd > ARENA - 10) { vx -= (cx / cd) * 5; vz -= (cz / cd) * 5; }
      const [nx, nz] = g.city.collide(b.pos.x + vx * dt, b.pos.z + vz * dt, 0.35, 0);
      b.pos.set(nx, g.city.groundAt(nx, nz, b.pos.y + 0.6), nz);
      b.av.object.position.copy(b.pos);
      b.av.object.rotation.y = b.yaw;
      b.av.update(dt, { speed: Math.hypot(vx, vz), grounded: true });
    }
  }

  // ------------------------------------------------------------------ per frame

  update(dt) {
    if (this.done) return;
    const g = this.g, p = g.player, now = Date.now();
    const t = (now - this.inv.start) / 1000;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t -= dt;
      tr.m.material.opacity = Math.max(0, tr.t / 0.09);
      if (tr.t <= 0) { g.ren.scene.remove(tr.m); tr.m.material.dispose(); this.tracers.splice(i, 1); }
    }
    if (t < 0) { this._hud(t); return; }
    if (!this.started) {
      this.started = true;
      const [x, z] = this._spawnAt();
      p.place(x, z, Math.atan2(this.center.x - x, this.center.z - z));
      g.camRig.yaw = p.yaw;
      g.camRig.shoulder = true;
      for (const b of this.bots) { const [bx, bz] = this._spawnAt(); b.pos.set(bx, g.city.groundAt(bx, bz, 2), bz); }
      g.hud.big('BLASTERS! 💥', this.teams ? `You're on ${TEAM[this._team(g.profile.id)].name}` : 'Free-for-all · most knock-outs wins', 2200);
      g.audio.fanfare(false);
      if (!g.input.isTouch) g.hud.toast('Click to aim with the mouse (Esc frees it) · hold click to fire · 1/2/3 switch blasters', 5000);
    }
    // aim: face where the camera looks
    p.yaw = g.camRig.yaw;
    p.object.rotation.y = p.yaw;
    const W = WEAPONS[this.w];
    const zoom = W.zoom && (this.firing || this.zoomHeld) ? W.zoom : 0;
    const fov = zoom || this.fov0;
    if (Math.abs(g.ren.camera.fov - fov) > 0.5) { g.ren.camera.fov += (fov - g.ren.camera.fov) * Math.min(1, dt * 10); g.ren.camera.updateProjectionMatrix(); }
    // shooting
    this.fireCd -= dt;
    this.shield = Math.max(0, this.shield - dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo[this.w] = W.mag; }
    if (this.dead > 0) {
      this.dead -= dt;
      if (this.dead <= 0) {
        const [x, z] = this._spawnAt();
        p.place(x, z, Math.atan2(this.center.x - x, this.center.z - z));
        g.camRig.yaw = p.yaw;
        this.hp = 100; this.shield = 2;
        g.hud.toast('Back in! 2 s of spawn shield.', 1500);
      }
    } else if (this.firing && this.fireCd <= 0 && this.reloadT <= 0) {
      if (this.ammo[this.w] > 0) { this.ammo[this.w]--; this.fireCd = 1 / W.rate; this._fire(); if (!this.ammo[this.w]) this.reloadT = W.reload; }
      else this.reloadT = W.reload;
    }
    // keep to the arena
    const cd = Math.hypot(p.pos.x - this.center.x, p.pos.z - this.center.z);
    if (cd > ARENA) { this.outT = (this.outT || 0) + dt; if (this.outT > 3) { this.outT = 2; this._hurt(10, g.profile.id, 'arena'); } } else this.outT = 0;
    if (this.hp < 100 && this.dead <= 0) this.hp = Math.min(100, this.hp + dt * 2);
    this._bots(dt);
    this._hud(t);
    if (t > LEN) this.end();
  }

  _hud(t) {
    const W = WEAPONS[this.w];
    const left = Math.max(0, Math.ceil(t < 0 ? -t : LEN - t));
    const board = [...this.players.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 5).map(([id, p], i) => {
      const tm = this._team(id);
      return `<div class="pg-row${p.me ? ' me' : ''}"><b>${i + 1}</b><span${tm ? ` style="color:${TEAM[tm].col}"` : ''}>${esc(p.name)}</span><i>${p.score} 💥 · ${p.deaths || 0} ☠</i></div>`;
    }).join('');
    const key = `${left}|${this.hp | 0}|${this.ammo[this.w]}|${this.w}|${this.reloadT > 0}|${board}|${this.dead > 0}`;
    if (key === this._key) return;
    this._key = key;
    this.el.innerHTML = `<div class="pg-card slim bl-card"><div class="pg-kicker">BENGALURU BLASTERS · ${t < 0 ? 'starts in ' + left : left + 's left'}${this.teams ? ` · ${TEAM[this._team(this.g.profile.id)].name}` : ''}</div>
      <div class="bl-stats"><span class="bl-hp"><i style="width:${this.hp}%"></i></span><b>${W.name}</b><span>${this.reloadT > 0 ? 'reloading…' : `${this.ammo[this.w]}/${W.mag}`}</span></div>
      <div class="pg-board mini">${board}</div></div>`;
    this.cross.classList.toggle('sniper', !!W.zoom);
    this.cross.classList.toggle('hidden', this.dead > 0 || t < 0);
  }

  end() {
    if (this.done) return;
    const me = this.players.get(this.g.profile.id);
    this._cleanup();
    this.finish('BENGALURU BLASTERS', true, (s) => `${s} 💥`);
    this.s.postScore('blasters', me.score);
  }

  _cleanup() {
    const g = this.g;
    g.camRig.shoulder = false;
    g.ren.camera.fov = this.fov0; g.ren.camera.updateProjectionMatrix();
    g.canvas.removeEventListener('mousedown', this.onDown);
    removeEventListener('mouseup', this.onUp);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.gunHand?.remove(this.gun);
    this.cross.remove(); this.touch.remove();
    $('bl-feed')?.remove();
    document.body.classList.remove('blasting');
    for (const b of this.bots) { g.ren.scene.remove(b.av.object); b.av.dispose(); b.tag.remove(); }
    this.bots = [];
    for (const tr of this.tracers) g.ren.scene.remove(tr.m);
    this.tracers = [];
    this.s.noRide = false;
    if (g.blasters === this) g.blasters = null;
  }

  dispose() { this._cleanup(); super.dispose(); }
}
