import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { Avatar, randomLook } from '../actors/Avatar.js';
import { R } from './City.js';
import { toon } from '../core/Toon.js';
import { rng } from './geo.js';

// Street life: pedestrians on the footpaths (techies, aunties, students, delivery riders...),
// little groups chatting at chai spots, cows lounging in the road and sleeping street dogs.

const ROLES = [
  { w: 22, look: () => ({ shirtStyle: 'shirt', extras: ['lanyard', 'backpack'] }), emote: 'phone' },          // techie on a call
  { w: 12, look: () => ({ shirtStyle: 'tee', extras: ['backpack', 'glasses'] }), emote: 'typing' },           // student / dev
  { w: 12, look: () => ({ shirtStyle: 'kurta', hairStyle: 'bun', extras: ['saree', 'bindi'], shirt: ['#e75a7c', '#f2c14e', '#3fb3a6', '#b388eb', '#f07b5a'][Math.floor(Math.random() * 5)] }), emote: 'wobble' }, // aunty
  { w: 9, look: () => ({ shirtStyle: 'shirt', hairStyle: 'bald', shirt: '#f7f3e8', extras: ['veshti', 'mustache'] }), emote: 'namaste' },   // uncle in veshti
  { w: 7, look: () => ({ shirtStyle: 'tee', shirt: '#f07b20', extras: ['helmet', 'deliveryBox'] }), emote: 'phone' },                // delivery
  { w: 10, look: () => ({ shirtStyle: 'tee', extras: [] }), emote: 'laugh' },
  { w: 8, look: () => ({ shirtStyle: 'kurta', hairStyle: 'long', extras: ['bindi'] }), emote: 'wave' },
  { w: 5, look: () => ({ shirtStyle: 'tee', shirt: '#d64b3b', extras: ['jersey', 'cap', 'capRed'] }), emote: 'cheer' },            // RCB fan
];

function pickRole(r) {
  let t = 0;
  for (const x of ROLES) t += x.w;
  let v = r() * t;
  for (const x of ROLES) { v -= x.w; if (v <= 0) return x; }
  return ROLES[0];
}

export function cowGeo(color = '#f1ece2') {
  const parts = [];
  const add = (g, col, pos, scale, rot) => {
    if (scale) g.scale(...scale);
    if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    g.translate(...pos);
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  add(new THREE.CapsuleGeometry(0.42, 1.0, 4, 10), color, [0, 1.0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(0.3, 8, 6), color, [0, 1.42, 0.35], [1, 0.8, 1.3]);                 // zebu hump
  add(new THREE.CapsuleGeometry(0.16, 0.5, 3, 8), color, [0, 1.15, 0.85], null, [0.9, 0, 0]);      // neck
  add(new THREE.BoxGeometry(0.34, 0.36, 0.56), color, [0, 1.25, 1.15], null, [0.4, 0, 0]);          // head
  add(new THREE.BoxGeometry(0.26, 0.2, 0.2), '#d9a59a', [0, 1.1, 1.42]);                           // muzzle
  add(new THREE.ConeGeometry(0.05, 0.36, 5), '#e0543a', [0.13, 1.5, 1.05], null, [-0.5, 0, -0.35]); // painted horns
  add(new THREE.ConeGeometry(0.05, 0.36, 5), '#3a6fd1', [-0.13, 1.5, 1.05], null, [-0.5, 0, 0.35]);
  add(new THREE.BoxGeometry(0.06, 0.12, 0.02), '#1d1a1c', [0.16, 1.3, 1.25]);
  add(new THREE.BoxGeometry(0.06, 0.12, 0.02), '#1d1a1c', [-0.16, 1.3, 1.25]);
  for (const [x, z] of [[0.25, 0.55], [-0.25, 0.55], [0.25, -0.55], [-0.25, -0.55]]) add(new THREE.CylinderGeometry(0.09, 0.07, 0.8, 6), color, [x, 0.4, z]);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), color, [0, 0.9, -0.95], null, [0.3, 0, 0]);    // tail
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function dogGeo() {
  const parts = [];
  const add = (g, col, pos, scale, rot) => {
    if (scale) g.scale(...scale);
    if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    g.translate(...pos);
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  // curled up asleep
  add(new THREE.SphereGeometry(0.38, 10, 7), '#b07a4a', [0, 0.22, 0], [1.3, 0.55, 1]);
  add(new THREE.SphereGeometry(0.17, 8, 6), '#b07a4a', [0.38, 0.22, 0.18], [1.2, 0.9, 1]);
  add(new THREE.ConeGeometry(0.06, 0.14, 4), '#8a5a34', [0.42, 0.38, 0.12], null, [0, 0, -0.4]);
  add(new THREE.ConeGeometry(0.06, 0.14, 4), '#8a5a34', [0.34, 0.38, 0.27], null, [0, 0, -0.4]);
  add(new THREE.CapsuleGeometry(0.05, 0.4, 3, 6), '#b07a4a', [-0.2, 0.12, 0.32], null, [0, 0, Math.PI / 2]);
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export class Crowd {
  constructor(game, city, quality) {
    this.game = game;
    this.city = city;
    this.group = new THREE.Group();
    this.peds = [];
    this.groups = [];
    this.max = quality.crowd;
    this.r = rng(Math.floor(Math.random() * 1e9));
    // walkable lines: footpaths along roads, plus pedestrian streets
    this.walks = city.roads.filter((rd) => !rd.bridge && (rd.code <= R.residential || rd.code === R.pedestrian || rd.code === R.footway) && rd.pts.length >= 2);
    // cows and dogs
    const mat = toon({ vertexColors: true, hatch: 1, rim: 0.1 });
    const cg = cowGeo(), cg2 = cowGeo('#c9b9a6'), dg = dogGeo();
    this.cows = [];
    const roads = city.roads.filter((rd) => rd.code >= R.tertiary && rd.code <= R.residential && !rd.bridge);
    const R2 = rng(77 + city.buildings.length);
    for (let i = 0; i < 9 && roads.length; i++) {
      const rd = roads[Math.floor(R2() * roads.length)];
      const k = Math.floor(R2() * (rd.pts.length - 1));
      const a = rd.pts[k], b = rd.pts[k + 1];
      const t = R2();
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const m = new THREE.Mesh(R2() < 0.6 ? cg : cg2, mat);
      m.position.set(x, 0, z);
      m.rotation.y = R2() * Math.PI * 2;
      const lying = R2() < 0.5;
      if (lying) { m.scale.set(1, 0.62, 1); m.position.y = -0.18; }
      m.castShadow = true;
      this.group.add(m);
      this.cows.push({ x, z, r: 1.4, m, t: R2() * 10, lying });
    }
    this.dogs = [];
    for (let i = 0; i < 10 && roads.length; i++) {
      const rd = roads[Math.floor(R2() * roads.length)];
      const k = Math.floor(R2() * (rd.pts.length - 1));
      const a = rd.pts[k], b = rd.pts[k + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = R2(), off = rd.w / 2 + 1.4;
      const x = a[0] + (b[0] - a[0]) * t - ((b[1] - a[1]) / L) * off, z = a[1] + (b[1] - a[1]) * t + ((b[0] - a[0]) / L) * off;
      if (city.buildingAt(x, z, [], 0.4)) continue;
      const m = new THREE.Mesh(dg, mat);
      m.position.set(x, 0, z);
      m.rotation.y = R2() * 6.28;
      this.group.add(m);
      this.dogs.push({ x, z, m });
    }
    this._tmp = [];
  }

  _spawnPed(near) {
    const r = this.r;
    for (let tries = 0; tries < 20; tries++) {
      const rd = this.walks[Math.floor(r() * this.walks.length)];
      if (!rd) return null;
      const k = Math.floor(r() * (rd.pts.length - 1));
      const a = rd.pts[k];
      if (near && ((a[0] - near.x) ** 2 + (a[1] - near.z) ** 2 > 140 * 140 || (a[0] - near.x) ** 2 + (a[1] - near.z) ** 2 < 25 * 25)) continue;
      const side = r() < 0.5 ? 1 : -1;
      const off = rd.code === R.footway || rd.code === R.pedestrian ? (r() - 0.5) * 1.2 : rd.w / 2 + 1.0 + r() * 1.0;
      return { rd, k, s: r(), dir: r() < 0.5 ? 1 : -1, side, off, speed: 1.1 + r() * 0.5 };
    }
    return null;
  }

  _pos(p) {
    const a = p.rd.pts[p.k], b = p.rd.pts[p.k + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    const x = a[0] + (b[0] - a[0]) * p.s + dz * p.off * p.side;
    const z = a[1] + (b[1] - a[1]) * p.s - dx * p.off * p.side;
    return [x, z, Math.atan2(dx * p.dir, dz * p.dir), L];
  }

  update(dt, focus) {
    // keep a crowd around the focus point
    if (this.peds.length < this.max && this.walks.length) {
      const st = this._spawnPed(focus);
      if (st) {
        const role = pickRole(this.r);
        const look = { ...randomLook(this.r() * 1e9), ...role.look() };
        const av = new Avatar(look);
        this.group.add(av.object);
        const ped = { ...st, av, role, idle: 0, look };
        // some just stand around: a chai break, a phone call
        if (this.r() < 0.22) { ped.idle = 1e9; av.play(role.emote, 1e9); }
        this.peds.push(ped);
      }
    }
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      // knocked over / fighting / running away: Combat moves them (see Combat.js)
      if (p.free) {
        const f = p.free;
        p.x = f.x; p.z = f.z;
        p.av.object.position.set(f.x, (f.y || 0) + (f.rx ? 0.12 : 0), f.z);
        p.av.object.rotation.set(f.rx || 0, f.yaw || 0, 0);
        const vis = (f.x - focus.x) ** 2 + (f.z - focus.z) ** 2 < 90 * 90;
        p.av.object.visible = vis;
        if (vis) p.av.update(dt, { speed: f.speed || 0, grounded: (f.y || 0) < 0.05 });
        continue;
      }
      let [x, z, yaw, L] = this._pos(p);
      const d2 = (x - focus.x) ** 2 + (z - focus.z) ** 2;
      if (d2 > 170 * 170) {
        const st = this._spawnPed(focus);
        if (st) Object.assign(p, st, { idle: p.idle > 1e8 ? 1e9 : 0 });
        else { this.group.remove(p.av.object); p.av.dispose(); this.peds.splice(i, 1); }
        continue;
      }
      let speed = 0;
      if (p.idle <= 0) {
        p.s += (p.dir * p.speed * dt) / L;
        speed = p.speed;
        if (p.s > 1 || p.s < 0) {
          // next segment, or turn back at the end of the road
          if (p.s > 1 && p.k < p.rd.pts.length - 2) { p.k++; p.s = 0; }
          else if (p.s < 0 && p.k > 0) { p.k--; p.s = 1; }
          else { p.dir *= -1; p.s = Math.min(1, Math.max(0, p.s)); }
        }
        if (this.r() < dt * 0.02) { p.idle = 2 + this.r() * 5; p.av.play(p.role.emote, p.idle); }
        // step around buildings that stand right on the footpath
        if (this.city.buildingAt(x, z, this._tmp)) p.off = Math.max(0.5, p.off - dt * 2);
      } else p.idle -= dt;
      p.av.object.position.set(x, 0, z);
      p.av.object.rotation.y = yaw;
      p.x = x; p.z = z;
      const vis = d2 < 90 * 90;
      p.av.object.visible = vis;
      if (vis) p.av.update(dt, { speed, grounded: true });
    }
    for (const c of this.cows) {
      c.t += dt;
      if (!c.lying) c.m.rotation.x = Math.sin(c.t * 0.8) * 0.02;
    }
  }

  // Simple push-apart with the player.
  collidePlayer(player) {
    const P = player.pos;
    for (const p of this.peds) {
      if (p.x == null) continue;
      const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.7 && d > 1e-4 && P.y < 2) { P.x = p.x + (dx / d) * 0.7; P.z = p.z + (dz / d) * 0.7; }
    }
    for (const c of this.cows) {
      const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz);
      if (d < 1.5 && d > 1e-4 && P.y < 2.5) {
        P.x = c.x + (dx / d) * 1.5; P.z = c.z + (dz / d) * 1.5;
        if (!c.mooed) { c.mooed = true; this.game.fx.pop(new THREE.Vector3(c.x, 1.2, c.z), 'MOOO'); setTimeout(() => (c.mooed = false), 4000); }
      }
    }
  }

  // Nearest pedestrian to a point (used by missions).
  nearest(x, z, max = 4) {
    let best = null, bd = max * max;
    for (const p of this.peds) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }

  dispose() {
    for (const p of this.peds) { this.group.remove(p.av.object); p.av.dispose(); }
    this.peds = [];
  }
}
