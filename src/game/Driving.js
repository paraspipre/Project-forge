import * as THREE from 'three';
import { scooterGeo, bikeGeo, autoGeo, carGeo, busGeo, tankerGeo, vehicleMaterial } from '../actors/Vehicles.js';
import { Avatar, randomLook } from '../actors/Avatar.js';

// GTA-style driving: walk up to anything in traffic and take it. The driver gets out (loudly),
// you drive it until you hop out, then it stays parked for a while. Do it in front of the traffic
// police and they chase you on hover scooters; get caught and it's a challan.

export const VKEYS = ['scooter', 'delivery', 'auto', 'car', 'bus', 'tanker'];
export const VSPEC = {
  scooter: { name: 'scooter', max: 27, acc: 16, turn: 1.0, r: 0.8, cam: 9, sit: [0, 0.18, -0.1], pose: 'ride' },
  delivery: { name: 'delivery bike', max: 29, acc: 17, turn: 1.0, r: 0.8, cam: 9, sit: [0, 0.22, -0.25], pose: 'ride' },
  auto: { name: 'auto', max: 22, acc: 11, turn: 0.85, r: 1.2, cam: 10, sit: [0, 0.5, 0.18], pose: 'ride' },
  car: { name: 'car', max: 31, acc: 13, turn: 0.75, r: 1.5, cam: 11, hide: true },
  bus: { name: 'BMTC bus', max: 17, acc: 6, turn: 0.45, r: 2.4, cam: 17, hide: true },
  tanker: { name: 'water tanker', max: 16, acc: 6, turn: 0.45, r: 2.2, cam: 15, hide: true },
};

const geoCache = new Map();
export function vehicleGeo(key, tint = '#ffffff') {
  const k = key + tint;
  if (geoCache.has(k)) return geoCache.get(k);
  let g;
  if (key === 'scooter') g = scooterGeo({ body: tint === '#ffffff' ? '#d9d9de' : tint });
  else if (key === 'delivery') g = bikeGeo({ body: '#c0262d', box: '#f07b20' });
  else if (key === 'auto') g = autoGeo({ driver: false });
  else if (key === 'car') g = carGeo({ body: tint });
  else if (key === 'bus') g = busGeo();
  else g = tankerGeo();
  geoCache.set(k, g);
  return g;
}

const ANGRY = {
  auto: ['Ayyo! My auto! Meter is still running!', 'Saar! At least pay the fare!', 'Swalpa adjust maadi... NOT LIKE THIS!'],
  car: ['My EMI isn\'t even paid yet!', 'Bro, that\'s a company car!', 'I\'m calling 112!'],
  scooter: ['Oye! My scooty!', 'Ayyo, my Swiggy order is in that!', 'Helmet at least haako!'],
  delivery: ['My delivery rating will go down!', 'Customer is waiting, bro!'],
  bus: ['Bus pass holders, get down! New driver!', 'BMTC will hear about this!'],
  tanker: ['The whole apartment is waiting for that water!', 'Ayyo, the tanker mafia will find you!'],
};

export class Driving {
  constructor(game) {
    this.game = game;
    this.parked = [];          // { key, mesh, x, z, yaw, until }
    this.cops = [];
    this.heat = 0;             // wanted level 0..3
    this.coolT = 0;
    this.drivers = [];         // angry ex-drivers on foot
    this.stars = document.createElement('div');
    this.stars.id = 'wanted';
    this.stars.className = 'hidden';
    document.getElementById('hud').appendChild(this.stars);
  }

  get driving() { return this.game.player?.mode === 'drive'; }

  // ------------------------------------------------------------------ stealing / parking

  nearestVehicle() {
    const g = this.game, p = g.player;
    if (!g.traffic || p.mode !== 'walk') return null;
    let best = null, bd = Infinity;
    for (const v of g.traffic.near(p.pos.x, p.pos.z, 2.6, this._tmp || (this._tmp = []))) {
      if (Math.abs(v.y - p.pos.y) > 1.8) continue;
      const d = Math.hypot(v.x - p.pos.x, v.z - p.pos.z) - v.type.r;
      if (d < bd) { bd = d; best = { traffic: v }; }
    }
    for (const pk of this.parked) {
      const d = Math.hypot(pk.x - p.pos.x, pk.z - p.pos.z) - VSPEC[pk.key].r;
      if (d < 1.8 && d < bd) { bd = d; best = { parked: pk }; }
    }
    return best;
  }

  promptFor(n) {
    if (n.parked) return `🚗 Get in the ${VSPEC[n.parked.key].name}`;
    return `🚗 Steal this ${VSPEC[n.traffic.type.key].name}`;
  }

  enter(n) {
    const g = this.game, p = g.player;
    let key, tint = '#ffffff', x, z, yaw, y;
    if (n.parked) {
      const pk = n.parked;
      key = pk.key; tint = pk.tint; x = pk.x; z = pk.z; yaw = pk.yaw; y = pk.y;
      g.ren.scene.remove(pk.mesh);
      this.parked.splice(this.parked.indexOf(pk), 1);
    } else {
      const v = n.traffic;
      key = v.type.key; tint = '#' + v.tint.getHexString(); x = v.x; z = v.z; yaw = v.yaw; y = v.y;
      const i = g.traffic.vehicles.indexOf(v);
      if (i >= 0) g.traffic.vehicles.splice(i, 1);
      this._angryDriver(key, x, z, yaw);
      g.fx.pop(new THREE.Vector3(x, y + 1, z), ['CHORI!', 'GADI GONE!', 'AYYO!'][Math.floor(Math.random() * 3)]);
      // the traffic police notice (most of the time)
      if (Math.random() < 0.55) this.addHeat(1, 'The traffic police saw that! 🚨');
      g.quests.onSteal?.(key);
    }
    const mesh = new THREE.Mesh(vehicleGeo(key, tint), vehicleMaterial());
    mesh.castShadow = true;
    p.enterVehicle({ key, spec: VSPEC[key], mesh, tint });
    p.pos.set(x, y || 0, z);
    p.yaw = yaw;
    g.camRig.yaw = yaw;
    if (key === 'scooter' || key === 'delivery') g.audio.scooter(true); else g.audio.engine(key);
    g.audio.whoosh();
    if (!g.profile.drove) { g.profile.drove = true; g.saveProfile(); g.hud.toast('W/S throttle · A/D steer · Shift boost · H horn · E or R to get out', 5000); }
  }

  exit() {
    const g = this.game, p = g.player;
    const veh = p.exitVehicle();
    if (!veh) return;
    const mesh = new THREE.Mesh(vehicleGeo(veh.key, veh.tint), vehicleMaterial());
    mesh.castShadow = true;
    mesh.position.set(veh.x, veh.y + 0.08, veh.z);
    mesh.rotation.y = veh.yaw;
    g.ren.scene.add(mesh);
    this.parked.push({ key: veh.key, tint: veh.tint, mesh, x: veh.x, z: veh.z, y: veh.y, yaw: veh.yaw, until: performance.now() + 90000 });
    while (this.parked.length > 4) { const old = this.parked.shift(); g.ren.scene.remove(old.mesh); }
    this._syncObstacles();
    g.audio.scooter(false);
    g.audio.engine(null);
  }

  _syncObstacles() {
    const g = this.game;
    if (!g.traffic || !g.crowd) return;
    g.traffic.obstacles = [...g.crowd.cows, ...this.parked.map((pk) => ({ x: pk.x, z: pk.z, r: VSPEC[pk.key].r }))];
  }

  _angryDriver(key, x, z, yaw) {
    const g = this.game;
    const look = key === 'auto' ? { ...randomLook(), shirt: '#c8a96b', extras: ['mustache'] } : key === 'delivery' ? { ...randomLook(), shirt: '#f07b20', extras: ['helmet'] } : randomLook();
    const av = new Avatar(look);
    const sx = x + Math.cos(yaw) * 1.6, sz = z - Math.sin(yaw) * 1.6;
    av.object.position.set(sx, g.city.groundAt(sx, sz, 2), sz);
    g.ren.scene.add(av.object);
    const lines = ANGRY[key] || ANGRY.car;
    const line = lines[Math.floor(Math.random() * lines.length)];
    const b = g.labels.add(line, () => av.object.position.clone().add(new THREE.Vector3(0, 2.5, 0)), { cls: 'bubble', maxDist: 60 });
    av.play('facepalm', 2);
    this.drivers.push({ av, bubble: b, t: 0, x: sx, z: sz, yaw: yaw + Math.PI });
  }

  // ------------------------------------------------------------------ police

  addHeat(n, msg) {
    const g = this.game;
    if (g.social?.cur || g.quests.active) return;   // no police during missions / party games
    const before = this.heat;
    this.heat = Math.min(3, this.heat + n);
    this.coolT = 0;
    if (this.heat > before) {
      if (msg) g.hud.toast(msg, 2500);
      g.audio.siren?.();
      while (this.cops.length < this.heat * 2) this._spawnCop();
    }
  }

  _spawnCop() {
    const g = this.game, p = g.player.pos;
    const a = Math.random() * Math.PI * 2, d = 45 + Math.random() * 25;
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    const av = new Avatar({ ...randomLook(), shirt: '#c8a96b', pants: '#6b5844', extras: ['helmet', 'mustache'], shirtStyle: 'shirt' });
    const sc = new THREE.Mesh(scooterGeo({ body: '#f4f1ea' }), vehicleMaterial());
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
    light.position.set(0, 1.25, -0.55);
    const obj = new THREE.Group();
    obj.add(sc, av.object, light);
    av.object.position.set(0, 0.18, -0.1);
    obj.position.set(x, g.city.groundAt(x, z, 4), z);
    g.ren.scene.add(obj);
    const tag = g.labels.add('🚨', () => obj.position.clone().add(new THREE.Vector3(0, 2.6, 0)), { cls: 'marker police', maxDist: 160 });
    this.cops.push({ obj, av, light, tag, x, z, yaw: 0, v: 0, near: 0 });
  }

  _removeCop(c) {
    this.game.ren.scene.remove(c.obj);
    c.av.dispose();
    c.tag.remove();
    this.cops.splice(this.cops.indexOf(c), 1);
  }

  _busted() {
    const g = this.game;
    const fine = Math.min(g.profile.coins || 0, 25 * this.heat);
    g.hud.big('CHALLAN! 🧾', fine ? `Fine: ${fine} coins. "Licence, RC, insurance… everything, saar."` : '"No money? Swalpa warning this time, saar."', 3000);
    if (fine) g.addCoins(-fine);
    g.audio.fail();
    if (this.driving) {
      const veh = g.player.exitVehicle();   // impounded: no parking
      if (veh) { g.audio.scooter(false); g.audio.engine(null); }
    }
    this.heat = 0;
    for (const c of [...this.cops]) this._removeCop(c);
    this._renderStars();
  }

  _renderStars() {
    const s = this.stars;
    if (!this.heat) { s.classList.add('hidden'); return; }
    s.classList.remove('hidden');
    s.innerHTML = `<span>🚨</span>${'★'.repeat(this.heat)}<i>${'★'.repeat(3 - this.heat)}</i>`;
  }

  // ------------------------------------------------------------------ per frame

  update(dt) {
    const g = this.game, p = g.player, now = performance.now();
    // exiting
    if (this.driving && (g.input.consume('interact') || g.input.consume('ride'))) this.exit();
    // run people over (they bounce up, no harm done… mostly)
    if (this.driving && Math.abs(p.speed) > 5 && g.crowd) {
      const r = p.veh.spec.r + 0.4;
      for (const ped of g.crowd.peds) {
        if (ped.x == null || ped.free?.ko > 0) continue;
        const dx = ped.x - p.pos.x, dz = ped.z - p.pos.z;
        if (dx * dx + dz * dz < r * r) {
          g.combat?.knockPed(ped, dx, dz, Math.abs(p.speed) * 0.6, p.veh.key === 'bus' ? 'BMTC!' : null);
          if (!this._hitCd || now > this._hitCd) { this._hitCd = now + 3000; this.addHeat(1, 'Hit-and-run! The police are coming 🚨'); }
        }
      }
    }
    // parked vehicles time out
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const pk = this.parked[i];
      if (now > pk.until && Math.hypot(pk.x - p.pos.x, pk.z - p.pos.z) > 60) { g.ren.scene.remove(pk.mesh); this.parked.splice(i, 1); this._syncObstacles(); }
    }
    // angry drivers shake a fist, then walk off
    for (let i = this.drivers.length - 1; i >= 0; i--) {
      const d = this.drivers[i];
      d.t += dt;
      if (d.t > 1.5 && d.t < 5) { const dx = p.pos.x - d.x, dz = p.pos.z - d.z; d.yaw = Math.atan2(dx, dz); if (d.t % 1.2 < dt) d.av.play('point', 1); }
      if (d.t > 3.5) d.bubble.remove();
      d.av.object.rotation.y = d.yaw;
      d.av.update(dt, { speed: 0, grounded: true });
      if (d.t > 9) { g.ren.scene.remove(d.av.object); d.av.dispose(); this.drivers.splice(i, 1); }
    }
    // police chase
    if (this.heat) {
      let seen = false;
      for (const c of [...this.cops]) {
        const dx = p.pos.x - c.x, dz = p.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
        if (d < 110) seen = true;
        const target = this.driving ? Math.min(p.veh.spec.max * 0.92, 25) : 9;
        c.v += (target - c.v) * Math.min(1, dt * 1.5);
        const want = Math.atan2(dx, dz);
        let da = want - c.yaw;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        c.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, da));
        const step = Math.min(c.v * dt, Math.max(0, d - 1.6));
        const [nx, nz] = g.city.collide(c.x + Math.sin(c.yaw) * step, c.z + Math.cos(c.yaw) * step, 0.7, c.obj.position.y);
        c.x = nx; c.z = nz;
        const gy = g.city.groundAt(nx, nz, c.obj.position.y + 0.8);
        c.obj.position.set(nx, c.obj.position.y + (gy + 0.1 - c.obj.position.y) * Math.min(1, dt * 8), nz);
        c.obj.rotation.y = c.yaw;
        c.light.material.color.setHex(Math.floor(now / 250) % 2 ? 0xff3344 : 0x3366ff);
        c.av.update(dt, { mode: 'ride', grounded: true, lean: 0 });
        // caught?
        const slow = this.driving ? Math.abs(p.speed) < 6 : true;
        if (d < (this.driving ? p.veh.spec.r + 2 : 2.2) && slow) { c.near += dt; if (c.near > (this.driving ? 1.5 : 0.6)) { this._busted(); return; } }
        else c.near = Math.max(0, c.near - dt);
        if (d > 260) this._removeCop(c);
      }
      // lose them: stay out of sight and the heat cools down
      this.coolT += dt * (seen ? 0.25 : 1);
      if (this.coolT > 18) {
        this.coolT = 0;
        this.heat--;
        while (this.cops.length > this.heat * 2) this._removeCop(this.cops[this.cops.length - 1]);
        if (!this.heat) { g.hud.toast('You lost the police. Phew! 😅', 2500); g.addCoins(5); }
      }
      while (this.cops.length < this.heat * 2) this._spawnCop();
      this.sirenT = (this.sirenT || 0) - dt;
      if (this.sirenT <= 0 && seen) { this.sirenT = 2.2; g.audio.siren?.(); }
    }
    this._renderStars();
  }

  // Interaction prompt hook: called by Game when nothing else wants the action button.
  want() {
    const g = this.game;
    if (this.driving || g.quests.active || g.social?.cur || g.social?.hall?.inside(g.player.pos)) return null;
    const n = this.nearestVehicle();
    return n ? { text: this.promptFor(n), act: () => this.enter(n) } : null;
  }

  unload() {
    const g = this.game;
    if (this.driving) g.player.exitVehicle();
    for (const pk of this.parked) g.ren.scene.remove(pk.mesh);
    this.parked = [];
    for (const c of [...this.cops]) this._removeCop(c);
    for (const d of this.drivers) { g.ren.scene.remove(d.av.object); d.bubble.remove(); }
    this.drivers = [];
    this.heat = 0;
    this._renderStars();
  }
}
