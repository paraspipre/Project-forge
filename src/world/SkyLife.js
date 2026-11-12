import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../core/Toon.js';
import { rng } from './geo.js';
import { carGeo, autoGeo, vehicleMaterial } from '../actors/Vehicles.js';

// Life above the rooftops in 2099: kites and pigeons wheeling, delivery drones hopping
// between roofs, slow advertising airships, and a sky-lane of hover cars that is (of course) jammed.

function tint(g, col, glow = 0) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(col), n = g.attributes.position.count;
  const a = new Float32Array(n * 3), gl = new Float32Array(n);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; gl[i] = glow; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return g;
}

function droneGeo() {
  const p = [tint(new THREE.BoxGeometry(0.7, 0.18, 0.7), '#2b2b30'), tint(new THREE.BoxGeometry(0.5, 0.45, 0.5).translate(0, -0.4, 0), '#f07b20')];
  for (const [x, z] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
    p.push(tint(new THREE.BoxGeometry(0.5, 0.05, 0.08).rotateY(Math.atan2(z, x)).translate(x * 0.55, 0, z * 0.55), '#2b2b30'));
    p.push(tint(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 10).translate(x, 0.1, z), '#8ff0ff', 1));
  }
  const g = mergeGeometries(p); g.computeVertexNormals(); return g;
}

function airshipGeo(col = '#f4f1ea', band = '#8e5bb5') {
  const p = [
    tint(new THREE.SphereGeometry(1, 20, 12).scale(22, 8, 8), col),
    tint(new THREE.CylinderGeometry(8.06, 8.06, 6, 20, 1, true).rotateZ(Math.PI / 2).translate(-2, 0, 0), band),
    tint(new THREE.BoxGeometry(8, 3, 3.4).translate(0, -9, 0), '#2b2b30'),
    tint(new THREE.BoxGeometry(7.6, 1, 3.5).translate(0, -8.6, 0), '#8ff0ff', 1),
  ];
  for (const [y, z] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) p.push(tint(new THREE.BoxGeometry(6, y ? 4 : 0.6, z ? 4 : 0.6).translate(-20, y * 0.6, z * 0.6), band));
  const g = mergeGeometries(p); g.computeVertexNormals(); return g;
}

function birdGeo() {
  // a flat "m"-shaped comic bird
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -1.1, 0.25, -0.1, 0, 0, -0.2, 0, 0, 0.3, 0, 0, -0.2, 1.1, 0.25, -0.1], 3));
  g.computeVertexNormals();
  return tint(g, '#3b3540');
}

export class SkyLife {
  constructor(city) {
    this.city = city;
    this.group = new THREE.Group();
    const r = rng(2099);
    const { x0, z0, x1, z1 } = city.bounds;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const vmat = vehicleMaterial();
    // birds
    this.flocks = [];
    const bmat = toon({ vertexColors: true, hatch: 0, side: THREE.DoubleSide, plain: true });
    const bg = birdGeo();
    for (let f = 0; f < 6; f++) {
      const n = 10 + Math.floor(r() * 12);
      const mesh = new THREE.InstancedMesh(bg, bmat, n);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.flocks.push({ mesh, n, x: cx + (r() - 0.5) * 1600, z: cz + (r() - 0.5) * 1600, y: 35 + r() * 40, rad: 30 + r() * 60, sp: 0.15 + r() * 0.2, ph: r() * 10, off: Array.from({ length: n }, () => [r() * 14 - 7, r() * 6 - 3, r() * 14 - 7, r() * 6]) });
    }
    // drones hopping between rooftops
    const roofs = city.buildings.filter((b) => b.h > 9 && b.area > 100);
    this.drones = [];
    const dg = droneGeo();
    const dm = new THREE.InstancedMesh(dg, vmat, 24);
    dm.frustumCulled = false;
    this.group.add(dm);
    this.droneMesh = dm;
    for (let i = 0; i < 24 && roofs.length; i++) {
      const a = roofs[Math.floor(r() * roofs.length)], b = roofs[Math.floor(r() * roofs.length)];
      this.drones.push({ a: [a.c[0], a.h + 1.5, a.c[1]], b: [b.c[0], b.h + 1.5, b.c[1]], t: r(), sp: 0.02 + r() * 0.03, roofs });
    }
    // airships with ads
    this.ships = [];
    const ads = [['#f4f1ea', '#8e5bb5'], ['#f2c14e', '#d64b3b'], ['#bfe0de', '#2f6fd1']];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(airshipGeo(...ads[i]), vmat);
      m.castShadow = true;
      this.group.add(m);
      this.ships.push({ m, a: r() * Math.PI * 2, rad: 600 + r() * 600, y: 140 + r() * 70, sp: 0.004 + r() * 0.004 });
    }
    // the sky-lane: hover cars nose to tail, 70 m up, barely moving
    this.lane = [];
    const lg = [carGeo({ body: '#ffffff' }), autoGeo({ driver: false })];
    this.laneMeshes = lg.map((g) => { const m = new THREE.InstancedMesh(g, vmat, 60); m.frustumCulled = false; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(180).fill(1), 3); this.group.add(m); return m; });
    const cols = ['#ffffff', '#f2c14e', '#5aa9e6', '#e75a5a', '#7dc47c', '#d9c8f0'].map((c) => new THREE.Color(c));
    const ang = r() * Math.PI;
    const ux = Math.cos(ang), uz = Math.sin(ang);
    for (let i = 0; i < 100; i++) {
      const lane = i % 2;
      this.lane.push({ s: (i / 2) * 14 + r() * 3, lane, type: r() < 0.3 ? 1 : 0, col: cols[Math.floor(r() * cols.length)], bob: r() * 6 });
    }
    this.laneDir = [ux, uz];
    this.laneO = [cx, cz];
    this._d = new THREE.Object3D();
    this.t = 0;
  }

  update(dt, cam) {
    this.t += dt;
    const t = this.t, d = this._d;
    for (const f of this.flocks) {
      const a = t * f.sp + f.ph;
      const fx = f.x + Math.cos(a) * f.rad, fz = f.z + Math.sin(a) * f.rad;
      for (let i = 0; i < f.n; i++) {
        const o = f.off[i];
        d.position.set(fx + o[0] + Math.sin(t + o[3]) * 2, f.y + o[1] + Math.sin(t * 1.3 + o[3]), fz + o[2]);
        d.rotation.set(0, -a + (f.sp > 0 ? Math.PI : 0), 0);
        const flap = 0.6 + Math.sin(t * 9 + o[3] * 3) * 0.5;
        d.scale.set(1.3, flap * 1.3, 1.3);
        d.updateMatrix();
        f.mesh.setMatrixAt(i, d.matrix);
      }
      f.mesh.instanceMatrix.needsUpdate = true;
    }
    this.drones.forEach((dr, i) => {
      dr.t += dr.sp * dt;
      if (dr.t >= 1) {
        dr.t = 0; dr.a = dr.b;
        const b = dr.roofs[Math.floor(Math.random() * dr.roofs.length)];
        dr.b = [b.c[0], b.h + 1.5, b.c[1]];
      }
      const k = dr.t, e = k * k * (3 - 2 * k);
      d.position.set(dr.a[0] + (dr.b[0] - dr.a[0]) * e, dr.a[1] + (dr.b[1] - dr.a[1]) * e + Math.sin(k * Math.PI) * 25, dr.a[2] + (dr.b[2] - dr.a[2]) * e);
      d.rotation.set(0, Math.atan2(dr.b[0] - dr.a[0], dr.b[2] - dr.a[2]), Math.sin(t * 3 + i) * 0.08);
      d.scale.setScalar(1.6);
      d.updateMatrix();
      this.droneMesh.setMatrixAt(i, d.matrix);
    });
    this.droneMesh.count = this.drones.length;
    this.droneMesh.instanceMatrix.needsUpdate = true;
    for (const s of this.ships) {
      s.a += s.sp * dt;
      s.m.position.set(cam.x * 0 + this.laneO[0] + Math.cos(s.a) * s.rad, s.y + Math.sin(t * 0.3) * 2, this.laneO[1] + Math.sin(s.a) * s.rad);
      s.m.rotation.y = -s.a;
    }
    // jammed sky lane: creeps forward in waves
    const [ux, uz] = this.laneDir, [ox, oz] = this.laneO;
    const counts = [0, 0];
    const L = 1400;
    for (const c of this.lane) {
      c.s += dt * (0.6 + Math.max(0, Math.sin(t * 0.4 - c.s * 0.02)) * 2.2) * (c.lane ? -1 : 1);
      if (c.s > L / 2) c.s -= L; if (c.s < -L / 2) c.s += L;
      const lat = c.lane ? 6 : -6;
      d.position.set(ox + ux * c.s - uz * lat, 72 + c.lane * 4 + Math.sin(t * 2 + c.bob) * 0.3, oz + uz * c.s + ux * lat);
      d.rotation.set(0, Math.atan2(ux, uz) + (c.lane ? Math.PI : 0), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      const m = this.laneMeshes[c.type];
      const i = counts[c.type]++;
      if (i >= 60) continue;
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.col);
    }
    this.laneMeshes.forEach((m, k) => { m.count = Math.min(60, counts[k]); m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
  }
}
