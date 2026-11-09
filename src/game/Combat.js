import * as THREE from 'three';

// Filmy street scuffles: punch with X (or 👊 on touch). No blood, lots of DHISHOOM. People react
// the way you'd expect in Bengaluru: aunties fight back with a chappal, some run, most complain.
// No fighting inside the Meetup Hall or at Namma Club (safe zones), or during missions and games.

const HITS = ['DHISHOOM!', 'DHAMAAL!', 'THAPAAK!', 'DISHUM!', 'BAM!'];
const COMPLAIN = ['Ayyo! What is this behaviour?!', 'I\'ll tell your amma!', 'Swalpa adjust maadi, illa?!', 'I\'m posting this on Twitter!', 'Kids these days…'];
const FIGHT = ['Banni, banni! Come here!', 'You want dishoom? I\'ll give dishoom!', 'Ninge yaaru gottha?!'];
const AUNTY = ['CHAPPAL ATTACK!', 'Wait, I\'ll show you!', 'Ayyo, no manners!'];

export class Combat {
  constructor(game) {
    this.game = game;
    this.hp = 100;
    this.lastHurt = 0;
    this.cd = 0;
    this.bar = document.createElement('div');
    this.bar.id = 'hpbar';
    this.bar.className = 'hidden';
    this.bar.innerHTML = '<span>❤️</span><div><i></i></div>';
    document.getElementById('hud').appendChild(this.bar);
    this.flash = document.createElement('div');
    this.flash.id = 'hurtflash';
    document.getElementById('hud').appendChild(this.flash);
  }

  safeZone(pos) {
    const s = this.game.social;
    return !!(s?.hall?.inside(pos) || s?.venue?.near(pos, 24));
  }

  canFight() {
    const g = this.game;
    return !g.dlg.open && !g.quests.busy && !g.quests.freeze && !g.quests.active && !g.social?.cur && !g.blasters?.active
      && g.player.mode === 'walk' && !this.safeZone(g.player.pos) && !this.down;
  }

  punch() {
    const g = this.game, p = g.player;
    if (this.cd > 0) return;
    if (!this.canFight()) { if (this.safeZone(p.pos)) g.hud.toast('No fighting here. This is a peaceful place 🙏', 1800); return; }
    this.cd = 0.42;
    p.avatar.play('punch', 0.42);
    g.myEmote = 'punch'; g.myEmoteT = 0.42;
    g.audio._noise?.({ dur: 0.12, vol: 0.08, f: 900, q: 0.8 });
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let best = null, bd = 2.0;
    const consider = (kind, o, x, z, y = 0, reach = 0) => {
      const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz) - reach;
      if (d > bd || Math.abs(y - p.pos.y) > 1.5) return;
      if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < 0.35) return;
      bd = d; best = { kind, o, x, z };
    };
    for (const ped of g.crowd?.peds || []) if (ped.x != null && !(ped.free?.ko > 0)) consider('ped', ped, ped.x, ped.z, ped.free?.y || 0);
    for (const r of g.remotes.values()) if (r.visible && !this.safeZone(r.pos)) consider('remote', r, r.pos.x, r.pos.z, r.pos.y);
    for (const n of g.quests.npcs.values()) if (n.object.visible) consider('npc', n, n.pos.x, n.pos.z, n.pos.y);
    for (const c of g.crowd?.cows || []) consider('cow', c, c.x, c.z, 0, 0.9);
    if (!best) return;
    const dx = best.x - p.pos.x, dz = best.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(dx, dz);
    const at = new THREE.Vector3(best.x, (p.pos.y || 0) + 0.4, best.z);
    if (best.kind === 'cow') {
      g.fx.pop(at, 'MOOO?!');
      p.knock(-dx / d, -dz / d, 5);
      g.hud.toast('The cow is unimpressed. It was here first. 🐄', 2200);
      g.audio.bonk();
      return;
    }
    if (best.kind === 'npc') {
      best.o.emote('facepalm', 2);
      best.o.bark(['Swalpa adjust maadi! Hands off!', 'Ayyo, I\'m busy, go away!', 'Not now, guru!'][Math.floor(Math.random() * 3)]);
      p.knock(-dx / d, -dz / d, 4);
      return;
    }
    this._thud();
    g.fx.pop(at, HITS[Math.floor(Math.random() * HITS.length)]);
    g.camRig.shake(0.15);
    if (best.kind === 'remote') {
      g.net?.event('fight:hit', { to: best.o.peer.id, dx: dx / d, dz: dz / d });
      best.o.avatar.play('facepalm', 0.6);
      return;
    }
    this.knockPed(best.o, dx, dz, 5.5);
    const f = best.o.free;
    if (f.hits >= 2) g.driving?.addHeat(1, 'Someone called the police! 🚨');
  }

  _thud() {
    const a = this.game.audio;
    a._tone?.({ f: 140, f2: 55, dur: 0.16, type: 'sine', vol: 0.3 });
    a._noise?.({ dur: 0.08, vol: 0.18, f: 1400, q: 0.6 });
  }

  // Send a pedestrian flying (punch or a bumper). They get up and react.
  knockPed(ped, dx, dz, power, text) {
    const g = this.game;
    const d = Math.hypot(dx, dz) || 1;
    const f = ped.free || (ped.free = { x: ped.x, z: ped.z, y: 0, yaw: Math.atan2(-dx, -dz), state: 'calm', t: 0, hits: 0, rx: 0 });
    ped.av.object.rotation.order = 'YXZ';
    f.vx = (dx / d) * power; f.vz = (dz / d) * power; f.vy = 3 + power * 0.25;
    f.ko = 1.8 + Math.random() * 0.8;
    f.state = 'ko';
    f.hits++;
    f.yaw = Math.atan2(-dx, -dz);
    if (text) g.fx.pop(new THREE.Vector3(f.x, 1.4, f.z), text);
    ped.av.stop();
  }

  hurt(dmg, dx = 0, dz = 0, text) {
    const g = this.game, p = g.player;
    if (this.down) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.lastHurt = performance.now();
    if (dx || dz) p.knock(dx, dz, 4);
    g.camRig.shake(0.3);
    this.flash.classList.remove('on'); void this.flash.offsetWidth; this.flash.classList.add('on');
    this._thud();
    if (text) g.fx.pop(p.pos, text);
    if (this.hp <= 0) this._down();
  }

  _down() {
    const g = this.game;
    this.down = true;
    g.hud.big('SWALPA REST 😵', 'Knocked out! Waking up with a hospital bill…', 2600);
    g.audio.fail();
    for (const ped of g.crowd?.peds || []) if (ped.free && ped.free.state === 'fight') ped.free.state = 'calm';
    setTimeout(() => {
      this.hp = 100;
      this.down = false;
      const bill = Math.min(10, g.profile.coins || 0);
      if (bill) g.addCoins(-bill);
      g.hud.toast(bill ? `Hospital bill: ${bill} coins. Get well soon!` : 'Back on your feet!', 3000);
    }, 2600);
  }

  update(dt) {
    const g = this.game, p = g.player, now = performance.now();
    this.cd = Math.max(0, this.cd - dt);
    if (g.input.consume('punch')) this.punch();
    if (now - this.lastHurt > 5000 && this.hp < 100 && !this.down) this.hp = Math.min(100, this.hp + dt * 8);
    const show = this.hp < 99.5 || g.blasters?.active;
    this.bar.classList.toggle('hidden', !show);
    if (show) { const i = this.bar.querySelector('i'); i.style.width = `${this.hp}%`; i.classList.toggle('low', this.hp < 35); }
    // pedestrians that got involved
    for (const ped of g.crowd?.peds || []) {
      const f = ped.free;
      if (!f) continue;
      f.t += dt;
      const dx = p.pos.x - f.x, dz = p.pos.z - f.z, d = Math.hypot(dx, dz) || 1;
      let vx = 0, vz = 0;
      if (f.state === 'ko') {
        f.vy -= 22 * dt;
        f.y = Math.max(0, f.y + f.vy * dt);
        if (f.y <= 0) { f.vx *= Math.pow(0.02, dt); f.vz *= Math.pow(0.02, dt); }
        vx = f.vx; vz = f.vz;
        f.rx += (-Math.PI / 2 - f.rx) * Math.min(1, dt * 10);
        f.ko -= dt;
        if (f.ko <= 0) {
          f.rx = 0; f.t = 0;
          const aunty = (ped.look?.extras || []).includes('saree');
          const r = Math.random();
          f.state = aunty || r < 0.3 ? 'fight' : r < 0.7 ? 'flee' : 'calm';
          const say = f.state === 'fight' ? (aunty ? AUNTY : FIGHT) : COMPLAIN;
          this._bubble(ped, say[Math.floor(Math.random() * say.length)]);
          if (f.state === 'calm') ped.av.play(Math.random() < 0.5 ? 'facepalm' : 'point', 2.5);
        }
      } else if (f.state === 'fight') {
        f.yaw = Math.atan2(dx, dz);
        if (d > 1.15) { vx = (dx / d) * 4.6; vz = (dz / d) * 4.6; }
        f.cd = (f.cd || 0) - dt;
        if (d < 1.4 && f.cd <= 0 && !this.down && p.mode === 'walk') {
          f.cd = 1.1;
          ped.av.play('punch', 0.42);
          const aunty = (ped.look?.extras || []).includes('saree');
          this.hurt(aunty ? 12 : 8, dx / d, dz / d, aunty ? 'CHAPPAL!' : HITS[Math.floor(Math.random() * HITS.length)]);
        }
        if (f.t > 14 || d > 28 || p.mode !== 'walk' || this.safeZone(p.pos)) { f.state = 'calm'; f.t = 0; ped.av.play('shrug', 2); }
      } else if (f.state === 'flee') {
        f.yaw = Math.atan2(-dx, -dz);
        vx = (-dx / d) * 5.2; vz = (-dz / d) * 5.2;
        if (f.t > 4) { f.state = 'calm'; f.t = 0; }
      } else if (d > 60 || f.t > 40) { ped.free = null; ped.av.object.rotation.set(0, 0, 0); continue; }
      if (vx || vz) {
        const [nx, nz] = g.city.collide(f.x + vx * dt, f.z + vz * dt, 0.3, 0);
        f.x = nx; f.z = nz;
      }
      f.speed = f.state === 'ko' ? 0 : Math.hypot(vx, vz);
    }
  }

  _bubble(ped, text) {
    const g = this.game;
    ped.bubble?.remove();
    const b = g.labels.add(text, () => (ped.free ? new THREE.Vector3(ped.free.x, 2.5, ped.free.z) : null), { cls: 'bubble', maxDist: 50 });
    ped.bubble = b;
    setTimeout(() => { b.remove(); if (ped.bubble === b) ped.bubble = null; }, 3200);
  }

  onNet(peer, type, d) {
    const g = this.game;
    if (type === 'fight:hit' && d.to === g.profile.id) {
      if (this.safeZone(g.player.pos) || g.social?.cur || g.quests.active) return;
      this.hurt(10, +d.dx || 0, +d.dz || 0, HITS[Math.floor(Math.random() * HITS.length)]);
      g.hud.toast(`${peer.name} punched you! Press X to hit back 👊`, 2000);
    }
  }
}
