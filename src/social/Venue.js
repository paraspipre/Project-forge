import * as THREE from 'three';
import { Kit, rectRing, circleRing } from '../world/landmarks/kit.js';
import { ring, pointInRing, polyArea } from '../world/geo.js';
import { toon } from '../core/Toon.js';

// The district hangout: an open-air club (light-up dance floor, DJ booth, speaker stacks, a truss of
// fairy lights and a neon sign), a quiz stage with a big screen, and a meetup notice board.

// Where each district's hangout should be (searches for open ground near these).
const HINTS = {
  central: [175, 40], indiranagar: [-60, -560], koramangala: [560, -260], silkboard: [-300, 150],
  basavanagudi: [-600, 260], bellandur: [-120, 280], majestic: [0, -480], malleshwaram: [-40, 250],
  ecity: [300, -300], whitefield: [120, 200],
};

// Open ground: no buildings within `r`, not water, preferably a park and away from big roads.
export function findOpenSpot(city, hint, r = 17, maxDist = 600, seed = 7, okFn = null) {
  const tmp = [];
  // seeded, so every player's game puts the hangout in exactly the same place
  let s = seed >>> 0 || 7;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const clear = (x, z) => {
    if (okFn && !okFn(x, z)) return false;
    if (city.isWater(x, z)) return false;
    for (const b of city.bGrid.query(x - r, z - r, x + r, z + r, tmp)) {
      if (x + r < b.minx || x - r > b.maxx || z + r < b.minz || z - r > b.maxz) continue;
      for (const [px, pz] of b.r) if ((px - x) ** 2 + (pz - z) ** 2 < r * r) return false;
      if (pointInRing(x, z, b.r)) return false;
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rd = city.onRoad(x + Math.cos(a) * r * 0.7, z + Math.sin(a) * r * 0.7);
      if (rd && rd.code <= 5) return false;
      if (city.buildingAt(x + Math.cos(a) * r, z + Math.sin(a) * r, tmp)) return false;
    }
    return !city.onRoad(x, z);
  };
  // parks near the hint first
  const parks = (city.data.greens || [])
    .filter((g) => g[0] === 0 || g[0] === 3 || g[0] === 2)
    .map((g) => ring(g[1]))
    .filter((r2) => Math.abs(polyArea(r2)) > 900)
    .map((r2) => { let x = 0, z = 0; for (const p of r2) { x += p[0]; z += p[1]; } return { r2, c: [x / r2.length, z / r2.length] }; })
    .filter((p) => Math.hypot(p.c[0] - hint[0], p.c[1] - hint[1]) < maxDist)
    .sort((a, b) => Math.hypot(a.c[0] - hint[0], a.c[1] - hint[1]) - Math.hypot(b.c[0] - hint[0], b.c[1] - hint[1]));
  for (const p of parks.slice(0, 6)) {
    for (let k = 0; k < 40; k++) {
      const x = p.c[0] + (rand() - 0.5) * 60, z = p.c[1] + (rand() - 0.5) * 60;
      if (pointInRing(x, z, p.r2) && clear(x, z)) return [x, z];
    }
  }
  for (let d = 0; d < maxDist; d += 8) {
    const n = Math.max(1, Math.floor((2 * Math.PI * d) / 8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = hint[0] + Math.cos(a) * d, z = hint[1] + Math.sin(a) * d;
      if (clear(x, z)) return [x, z];
    }
  }
  return hint;
}

export class Venue {
  constructor(game, zone) {
    const city = game.city;
    this.game = game;
    const hint = HINTS[zone] || [0, 0];
    const [cx, cz] = findOpenSpot(city, hint);
    this.pos = new THREE.Vector3(cx, 0, cz);
    // face the nearest road so the sign reads from the street
    let yaw = 0, bd = Infinity;
    for (const rd of city.roads) {
      if (rd.code > 7 || rd.bridge) continue;
      for (const p of rd.pts) { const d = (p[0] - cx) ** 2 + (p[1] - cz) ** 2; if (d < bd) { bd = d; yaw = Math.atan2(p[0] - cx, p[1] - cz); } }
    }
    this.yaw = yaw;
    const kit = new Kit(city, cx, cz, yaw);
    this.kit = kit;
    // club: dance floor (local +z faces the road)
    const F = 14;
    kit.box(0, 0, 0, F + 1, 0.3, F + 1, '#2b2b30');
    // DJ booth at the back with speaker stacks
    kit.box(0, 0.3, -F / 2 + 0.8, 5, 1.2, 1.4, '#3b3b44');
    kit.box(0, 1.5, -F / 2 + 0.8, 5.2, 0.12, 1.6, '#8e5bb5', 100);
    for (const sx of [-1, 1]) {
      kit.box(sx * (F / 2 - 0.4), 0.3, -F / 2 + 0.8, 1.4, 2.2, 1.2, '#1d1d22');
      kit.box(sx * (F / 2 - 0.4), 2.5, -F / 2 + 0.8, 1.2, 1.4, 1.1, '#1d1d22');
    }
    // truss with fairy lights
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.box(x * (F / 2 + 0.2), 0, z * (F / 2 + 0.2), 0.35, 5.5, 0.35, '#c9c2b6');
    kit.box(0, 5.5, -(F / 2 + 0.2), F + 0.8, 0.35, 0.35, '#c9c2b6');
    kit.box(0, 5.5, F / 2 + 0.2, F + 0.8, 0.35, 0.35, '#c9c2b6');
    kit.box(-(F / 2 + 0.2), 5.5, 0, 0.35, 0.35, F + 0.8, '#c9c2b6');
    kit.box(F / 2 + 0.2, 5.5, 0, 0.35, 0.35, F + 0.8, '#c9c2b6');
    for (let i = 0; i < 16; i++) {
      const t = i / 15 - 0.5;
      kit.cyl(t * F, 5.0 - Math.sin((i / 15) * Math.PI) * 0.6, 0, 0.12, 0.12, 0.2, ['#f2c14e', '#e75a7c', '#8ff0ff', '#7dc47c'][i % 4], 6, 100);
      kit.cyl(0, 5.0 - Math.sin((i / 15) * Math.PI) * 0.6, t * F, 0.12, 0.12, 0.2, ['#8ff0ff', '#f2c14e', '#e75a7c'][i % 3], 6, 100);
    }
    // quiz stage beside the club, with a big screen
    kit.box(F / 2 + 6, 0, -2, 7, 0.8, 5, '#d9d2c6');
    kit.box(F / 2 + 6, 0.8, -4.2, 6, 4.2, 0.4, '#2b2b30');
    kit.box(F / 2 + 6, 0.8, -1.8, 1.2, 1.1, 0.7, '#8e5bb5');
    // meetup notice board on the other side
    kit.box(-(F / 2 + 5), 0, 3, 0.25, 2.6, 0.25, '#6b4a35');
    kit.box(-(F / 2 + 5), 0, 5.6, 0.25, 2.6, 0.25, '#6b4a35');
    kit.box(-(F / 2 + 5), 1.2, 4.3, 0.2, 1.6, 3.2, '#8a5a34');
    const mesh = kit.mesh();
    this.object = new THREE.Group();
    this.object.add(mesh);
    // dance floor tiles that pulse with the beat
    const N = 7, tile = F / N;
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(tile * 0.92, 0.06, tile * 0.92), new THREE.MeshBasicMaterial({ color: 0xffffff }), N * N);
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * N * 3), 3);
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const [wx, wz] = kit.w((i - (N - 1) / 2) * tile, (j - (N - 1) / 2) * tile);
      d.position.set(wx, 0.33, wz); d.rotation.y = yaw; d.updateMatrix();
      this.tiles.setMatrixAt(i * N + j, d.matrix);
    }
    this.object.add(this.tiles);
    this.N = N;
    this.palette = ['#e75a7c', '#8ff0ff', '#f2c14e', '#b388eb', '#7dc47c', '#f07b5a'].map((c) => new THREE.Color(c));
    // collision / walkable bits
    city.addPlatform(rectRing(cx, cz, F + 1, F + 1, yaw), 0.3);
    const st = kit.w(F / 2 + 6, -2);
    city.addPlatform(rectRing(st[0], st[1], 7, 5, yaw), 0.8);
    const dj = kit.w(0, -F / 2 + 0.8);
    city.addSolid(rectRing(dj[0], dj[1], 5, 1.4, yaw), 1.5, 0, 'DJ booth');
    for (const sx of [-1, 1]) { const sp = kit.w(sx * (F / 2 - 0.4), -F / 2 + 0.8); city.addSolid(rectRing(sp[0], sp[1], 1.4, 1.2, yaw), 3.9, 0, 'Speakers'); }
    const sc = kit.w(F / 2 + 6, -4.2);
    city.addSolid(rectRing(sc[0], sc[1], 6, 0.4, yaw), 5, 0, 'Screen');
    // spots used by NPCs and games
    this.spots = {
      dj: kit.w(0, -F / 2 + 2.0), floor: [cx, cz], quiz: kit.w(F / 2 + 6, -1.0), quizCrowd: kit.w(F / 2 + 6, 4),
      board: kit.w(-(F / 2 + 3.6), 4.3), chai: kit.w(-(F / 2 + 4), -4), shop: kit.w(F / 2 + 6, 7),
    };
    this.signs = [
      { text: 'NAMMA CLUB', sub: 'Dance-offs nightly · ಡ್ಯಾನ್ಸ್ ಮಾಡಿ', pos: kit.w(0, -F / 2 - 0.25), y: 6.6, yaw: yaw, w: 10, h: 2.4, bg: '#2b2b30', fg: '#ff7ad9' },
      { text: 'NAMMA QUIZ', sub: 'Bengaluru trivia · live with everyone here', pos: kit.w(F / 2 + 6, -3.95), y: 3.2, yaw: yaw, w: 5.6, h: 3.2, bg: '#1f4e8c', fg: '#ffffff' },
      { text: 'MEETUPS', sub: 'Quiz · Dance-off · Chor-Police · Race', pos: kit.w(-(F / 2 + 4.85), 4.3), y: 2.0, yaw: yaw - Math.PI / 2, w: 3, h: 1.4, bg: '#f4f1ea', fg: '#8a2b1e' },
    ];
    this.beat = 0;
  }

  // flash the dance floor (beat: 0..1 phase, energy: 0..1)
  update(dt, t, energy = 0.5) {
    const c = new THREE.Color();
    const N = this.N;
    const step = Math.floor(t * 2.0);
    if (step === this._step && energy === this._e) return;
    this._step = step; this._e = energy;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = (i + j + step) % this.palette.length;
      const on = ((i * 3 + j * 5 + step) % 4 === 0) || energy > 0.8;
      c.copy(this.palette[k]).multiplyScalar(on ? 1 : 0.25 + energy * 0.3);
      this.tiles.setColorAt(i * N + j, c);
    }
    this.tiles.instanceColor.needsUpdate = true;
  }

  near(p, r = 22) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < r; }
}
