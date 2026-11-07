import * as THREE from 'three';
import { R } from './City.js';
import { Grid } from './geo.js';
import { scooterGeo, autoGeo, carGeo, busGeo, tankerGeo, metroCarGeo, vehicleMaterial } from '../actors/Vehicles.js';

// Ambient traffic on the real road network. Vehicles keep left, follow each other, slow for
// anything in front (including the player), wander junction to junction, and are recycled
// around the player so the streets near you are always busy. Plus metro trains on the viaducts.

const TYPES = [
  // key, weight, radius, cruise speed (m/s), cap
  { key: 'scooter', w: 30, r: 0.9, v: 9, cap: 60 },
  { key: 'delivery', w: 8, r: 0.9, v: 10, cap: 20 },
  { key: 'auto', w: 26, r: 1.4, v: 8, cap: 50 },
  { key: 'car', w: 22, r: 2.0, v: 10, cap: 45 },
  { key: 'bus', w: 5, r: 5.5, v: 7, cap: 10 },
  { key: 'tanker', w: 3, r: 4.0, v: 7, cap: 6 },
];

export class Traffic {
  constructor(city, quality, { jam = 0 } = {}) {
    this.city = city;
    this.jam = jam; // 0 normal .. 1 Silk Board
    this.count = Math.round(quality.traffic * (1 + jam * 0.8));
    this.group = new THREE.Group();
    this._buildGraph();
    this._buildMeshes();
    this.vehicles = [];
    this.grid = new Grid(12);
    this.player = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3();
    this._e = new THREE.Euler();
    this.trains = [];
    this._buildTrains();
    this.honk = null; // callback(x, z, kind)
    this.obstacles = []; // extra things to brake for: { x, z, r }
  }

  _buildGraph() {
    const nodes = new Map();
    const key = (x, z, lay) => `${Math.round(x * 2)},${Math.round(z * 2)},${lay}`;
    const node = (x, z, lay) => {
      const k = key(x, z, lay);
      let n = nodes.get(k);
      if (!n) { n = { x, z, out: [] }; nodes.set(k, n); }
      return n;
    };
    this.edges = [];
    for (const rd of this.city.roads) {
      if (rd.code > R.residential || rd.code === R.pedestrian) continue;
      const pts = rd.pts;
      const hs = rd.heights;
      const last = pts.length - 1;
      for (let i = 0; i < last; i++) {
        // ends of bridges connect to the ground network; their middles live on their own layer
        const la = rd.bridge && i > 0 ? 'b' + rd.id : 'g';
        const lb = rd.bridge && i + 1 < last ? 'b' + rd.id : 'g';
        const a = node(pts[i][0], pts[i][1], la), b = node(pts[i + 1][0], pts[i + 1][1], lb);
        if (a === b) continue;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.3) continue;
        const ha = hs ? hs[i] : 0, hb = hs ? hs[i + 1] : 0;
        const lanes = rd.oneway ? Math.max(1, Math.round(rd.w / 3.3)) : Math.max(1, Math.round(rd.w / 6.6));
        const mk = (p, q, h0, h1) => {
          const e = { a: p, b: q, len, road: rd, h0, h1, lanes, dx: (q.x - p.x) / len, dz: (q.z - p.z) / len, w: rd.w, oneway: rd.oneway };
          p.out.push(e);
          this.edges.push(e);
          return e;
        };
        const f = mk(a, b, ha, hb);
        if (!rd.oneway) { const r = mk(b, a, hb, ha); f.rev = r; r.rev = f; }
      }
    }
    this.nodes = [...nodes.values()];
    // edges worth spawning on (not dead-end stubs)
    this.spawnEdges = this.edges.filter((e) => e.len > 6 && e.b.out.length > 0 && e.road.code <= R.residential);
    this.edgeGrid = new Grid(80);
    for (const e of this.spawnEdges) this.edgeGrid.insert(e, Math.min(e.a.x, e.b.x), Math.min(e.a.z, e.b.z), Math.max(e.a.x, e.b.x), Math.max(e.a.z, e.b.z));
  }

  _buildMeshes() {
    const mat = vehicleMaterial();
    const shirts = ['#5aa9e6', '#f07b5a', '#7dc47c', '#2f3a4a', '#e75a7c'];
    const geos = {
      scooter: scooterGeo({ body: '#d9d9de', withRider: true, shirt: shirts[0] }),
      delivery: scooterGeo({ body: '#2b2b30', withRider: true, shirt: '#f07b20', helmet: '#f07b20', box: '#f07b20' }),
      auto: autoGeo(),
      car: carGeo({ body: '#ffffff' }),
      bus: busGeo(),
      tanker: tankerGeo(),
    };
    this.meshes = {};
    for (const t of TYPES) {
      const m = new THREE.InstancedMesh(geos[t.key], mat, t.cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(t.cap * 3).fill(1), 3);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      this.meshes[t.key] = m;
      this.group.add(m);
    }
    this.typeByKey = Object.fromEntries(TYPES.map((t) => [t.key, t]));
    this.tints = {
      scooter: ['#ffffff', '#f6c1b0', '#bfe0f5', '#e8e8e8', '#ffd59a', '#c9f0c9'].map((h) => new THREE.Color(h)),
      delivery: ['#ffffff', '#e6d0ff'].map((h) => new THREE.Color(h)),
      auto: ['#ffffff', '#f4f4f4'].map((h) => new THREE.Color(h)),
      car: ['#ffffff', '#f2c14e', '#5aa9e6', '#e75a5a', '#9a9aa5', '#3c3c44', '#7dc47c', '#d9c8f0'].map((h) => new THREE.Color(h)),
      bus: ['#ffffff', '#c3f0c3', '#ffd0c0'].map((h) => new THREE.Color(h)),
      tanker: ['#ffffff'].map((h) => new THREE.Color(h)),
    };
  }

  _pickType() {
    let total = 0;
    for (const t of TYPES) total += t.w;
    let r = Math.random() * total;
    for (const t of TYPES) { r -= t.w; if (r <= 0) return t; }
    return TYPES[0];
  }

  _spawn(v, near) {
    // pick an edge 60–330 m from the player (or anywhere if no player yet)
    const p = near || { x: 0, z: 0 };
    let e = null;
    for (let k = 0; k < 12 && !e; k++) {
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 270;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const list = this.edgeGrid.query(x - 40, z - 40, x + 40, z + 40, this._tmpE || (this._tmpE = []));
      if (list.length) e = list[Math.floor(Math.random() * list.length)];
    }
    if (!e) e = this.spawnEdges[Math.floor(Math.random() * this.spawnEdges.length)];
    if (!e) return false;
    const t = v.type || this._pickType();
    if (t.key === 'bus' || t.key === 'tanker') { if (e.road.code > R.tertiary) return this._spawn(Object.assign(v, { type: TYPES[2] }), near); }
    v.type = t;
    v.edge = e;
    v.s = Math.random() * e.len;
    v.v = t.v * (0.7 + Math.random() * 0.3);
    v.cruise = t.v * (0.75 + Math.random() * 0.4) * (1 - this.jam * 0.82);
    v.lane = Math.floor(Math.random() * e.lanes);
    v.tint = this.tints[t.key][Math.floor(Math.random() * this.tints[t.key].length)];
    v.yaw = Math.atan2(e.dx, e.dz);
    v.bob = Math.random() * 10;
    v.honkT = 2 + Math.random() * 8;
    v.lat = this._lateral(e, v.lane);
    this._place(v, 0);
    return true;
  }

  // Keep-left lane offset (positive = left of travel direction).
  _lateral(e, lane) {
    if (e.oneway) {
      const lw = e.w / e.lanes;
      return e.w / 2 - lw * (lane + 0.5);
    }
    const half = e.w / 2;
    const lw = half / e.lanes;
    return half - lw * (lane + 0.5);
  }

  _place(v, dt) {
    const e = v.edge;
    const f = Math.min(1, v.s / e.len);
    const lat = v.lat;
    // left of travel direction (dx, dz) in our x-east/z-south frame is (dz, -dx)
    v.x = e.a.x + (e.b.x - e.a.x) * f + e.dz * lat;
    v.z = e.a.z + (e.b.z - e.a.z) * f - e.dx * lat;
    v.y = e.h0 + (e.h1 - e.h0) * f;
    const target = Math.atan2(e.dx, e.dz);
    let d = target - v.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    v.yaw += d * Math.min(1, dt * 6);
    v.pitch = Math.atan2(e.h1 - e.h0, e.len);
  }

  _nextEdge(v) {
    const b = v.edge.b;
    let opts = b.out.filter((e) => e !== v.edge.rev);
    if (!opts.length) opts = b.out;
    if (!opts.length) return null;
    // prefer carrying on along the same road, and bigger roads
    const same = opts.filter((e) => e.road === v.edge.road);
    if (same.length && Math.random() < 0.6) return same[0];
    const weights = opts.map((e) => (e.road.code <= R.tertiary ? 3 : 1));
    let tot = weights.reduce((a, b2) => a + b2, 0), r = Math.random() * tot;
    for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) return opts[i]; }
    return opts[0];
  }

  _buildTrains() {
    const lines = (this.city.metroLines || []).filter((l) => !l.construction);
    // join consecutive pieces into longer runs and keep the longest few
    const runs = lines.map((l) => {
      let len = 0;
      for (let i = 1; i < l.pts.length; i++) len += Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]);
      return { pts: l.pts, H: l.H, len };
    }).filter((r) => r.len > 120).sort((a, b) => b.len - a.len).slice(0, 2);
    const mat = vehicleMaterial();
    const front = metroCarGeo(true), mid = metroCarGeo(false);
    for (const run of runs) {
      const cars = [];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(i === 0 ? front : mid, mat);
        m.castShadow = true;
        this.group.add(m);
        cars.push(m);
      }
      this.trains.push({ run, cars, s: Math.random() * run.len, dir: Math.random() < 0.5 ? 1 : -1, wait: 0 });
    }
  }

  _pointOn(run, s) {
    s = Math.max(0, Math.min(run.len, s));
    const p = run.pts;
    for (let i = 1; i < p.length; i++) {
      const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (s <= L || i === p.length - 1) {
        const f = L ? Math.min(1, s / L) : 0;
        return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f, Math.atan2(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])];
      }
      s -= L;
    }
    return [p[0][0], p[0][1], 0];
  }

  update(dt, player) {
    const P = player ? player.pos : { x: 0, z: 0 };
    // top up / recycle
    while (this.vehicles.length < this.count) {
      const v = {};
      if (!this._spawn(v, P)) break;
      this.vehicles.push(v);
    }
    const g = this.grid;
    g.map.clear();
    for (const v of this.vehicles) g.insert(v, v.x, v.z, v.x, v.z);
    const tmp = this._tmpV || (this._tmpV = []);
    const counts = {};
    for (const k in this.meshes) counts[k] = 0;
    for (const v of this.vehicles) {
      // recycle far vehicles near the player
      if ((v.x - P.x) ** 2 + (v.z - P.z) ** 2 > 420 * 420) { v.type = null; this._spawn(v, P); }
      const hx = Math.sin(v.yaw), hz = Math.cos(v.yaw);
      // look ahead for anything in our way
      let block = 99;
      const look = 4 + v.v * 0.9 + v.type.r;
      for (const o of g.query(v.x + hx * look * 0.5 - look * 0.5, v.z + hz * look * 0.5 - look * 0.5, v.x + hx * look * 0.5 + look * 0.5, v.z + hz * look * 0.5 + look * 0.5, tmp)) {
        if (o === v || Math.abs(o.y - v.y) > 2.5) continue;
        const dx = o.x - v.x, dz = o.z - v.z;
        const along = dx * hx + dz * hz;
        if (along <= 0) continue;
        const side = Math.abs(dx * hz - dz * hx);
        if (side > (v.type.r + o.type.r) * 0.6 + 0.4) continue;
        block = Math.min(block, along - v.type.r - o.type.r);
      }
      if (player && Math.abs((player.pos.y || 0) - v.y) < 2.5) {
        const dx = P.x - v.x, dz = P.z - v.z;
        const along = dx * hx + dz * hz, side = Math.abs(dx * hz - dz * hx);
        if (along > 0 && along < look + 2 && side < v.type.r * 0.7 + 0.8) {
          block = Math.min(block, along - v.type.r - 0.6);
          v.honkT -= dt * 3;
          if (v.honkT < 0 && this.honk) { this.honk(v.x, v.z, v.type.key); v.honkT = 2.5 + Math.random() * 4; }
        }
      }
      for (const o of this.obstacles) {
        const dx = o.x - v.x, dz = o.z - v.z;
        const along = dx * hx + dz * hz, side = Math.abs(dx * hz - dz * hx);
        if (along > 0 && along < look + 3 && side < v.type.r * 0.6 + o.r) block = Math.min(block, along - v.type.r - o.r);
      }
      // random honks: it is Bengaluru
      v.honkT -= dt * (0.25 + this.jam * 0.6);
      if (v.honkT < 0) { v.honkT = 4 + Math.random() * 10; if (this.honk && Math.random() < 0.4) this.honk(v.x, v.z, v.type.key); }
      const want = block < 1 ? 0 : block < look ? v.cruise * Math.min(1, (block - 1) / (look * 0.8)) : v.cruise;
      v.v += (want - v.v) * Math.min(1, dt * (want < v.v ? 5 : 1.2));
      if (v.v < 0.05) v.v = 0;
      v.s += v.v * dt;
      while (v.s > v.edge.len) {
        const next = this._nextEdge(v);
        if (!next) { v.type = null; this._spawn(v, P); break; }
        v.s -= v.edge.len;
        v.edge = next;
        if (v.lane >= next.lanes) v.lane = next.lanes - 1;
        v.lat = this._lateral(next, v.lane);
      }
      this._place(v, dt);
      // draw
      const m = this.meshes[v.type.key];
      const i = counts[v.type.key]++;
      if (i >= v.type.cap) continue;
      v.bob += dt * 3;
      const hover = 0.08 + Math.sin(v.bob) * 0.05;
      this._p.set(v.x, v.y + hover, v.z);
      this._e.set(-v.pitch, v.yaw, Math.sin(v.bob * 0.7) * 0.02, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m.compose(this._p, this._q, this._s);
      m.setMatrixAt(i, this._m);
      m.setColorAt(i, v.tint);
    }
    for (const k in this.meshes) {
      const m = this.meshes[k];
      m.count = Math.min(counts[k], this.typeByKey[k].cap);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // metro trains shuttle along their viaducts, pausing at the ends
    for (const t of this.trains) {
      if (t.wait > 0) t.wait -= dt;
      else {
        t.s += t.dir * 17 * dt;
        if (t.s > t.run.len - 30) { t.s = t.run.len - 30; t.dir = -1; t.wait = 6; }
        if (t.s < 30) { t.s = 30; t.dir = 1; t.wait = 6; }
      }
      t.cars.forEach((c, i) => {
        const [x, z, yaw] = this._pointOn(t.run, t.s - i * 18.4 * t.dir);
        c.position.set(x, t.run.H + 0.2, z);
        c.rotation.y = yaw + (t.dir < 0 ? Math.PI : 0);
      });
    }
  }

  // Vehicles near a point (for player collisions / interactions).
  near(x, z, r, out = []) {
    out.length = 0;
    for (const v of this.grid.query(x - r - 6, z - r - 6, x + r + 6, z + r + 6, this._tmpN || (this._tmpN = []))) {
      if ((v.x - x) ** 2 + (v.z - z) ** 2 < (r + v.type.r) ** 2) out.push(v);
    }
    return out;
  }
}
