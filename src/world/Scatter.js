import * as THREE from 'three';
import { toon } from '../core/Toon.js';
import { Grid } from './geo.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';

// Thousands of instanced props (trees) of which only those near the camera are drawn:
// the instance buffers are refilled whenever the camera has moved far enough.

export class Scatter {
  constructor(geos, items, radius = 450, cap = 5000, mat = null, farGeos = null) {
    this.items = items;
    this.radius = radius;
    this.grid = new Grid(64);
    for (const it of items) this.grid.insert(it, it.x, it.z, it.x, it.z);
    this.group = new THREE.Group();
    this.mat = mat || toon({ vertexColors: true, sway: 1, hatch: 0.9, side: THREE.DoubleSide, cutout: true });
    // per type: a near set that casts shadows and a far set that doesn't (the shadow pass is costly)
    const make = (g, shadow) => {
      const m = new THREE.InstancedMesh(g, this.mat, cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.count = 0;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    this.meshes = (farGeos || geos).map((g) => make(g, false));
    this.near = geos.map((g) => make(g, true));
    this.shadowR = 85;
    this.cap = cap;
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._tmp = [];
    this._c = new THREE.Color();
  }

  // Remove items in a circle (a landmark built later on open ground).
  clearAround(x, z, r) {
    for (const it of this.grid.query(x - r, z - r, x + r, z + r, [])) if ((it.x - x) ** 2 + (it.z - z) ** 2 < r * r) it.gone = true;
    this.last.set(1e9, 0, 1e9);
  }

  update(cam) {
    if (Math.hypot(cam.x - this.last.x, cam.z - this.last.z) < Math.min(this.radius * 0.12, 18)) return;
    this.last.set(cam.x, 0, cam.z);
    const R = this.radius, SR2 = this.shadowR * this.shadowR;
    const near = this.grid.query(cam.x - R, cam.z - R, cam.x + R, cam.z + R, this._tmp);
    // nearest first so the cap drops the far ones
    near.sort((a, b) => ((a.x - cam.x) ** 2 + (a.z - cam.z) ** 2) - ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2));
    const counts = this.meshes.map(() => 0), ncounts = this.meshes.map(() => 0);
    const up = new THREE.Vector3(0, 1, 0);
    for (const it of near) {
      if (it.gone) continue;
      const d2 = (it.x - cam.x) ** 2 + (it.z - cam.z) ** 2;
      if (d2 > R * R) break;
      const inShadow = d2 < SR2;
      const m = (inShadow ? this.near : this.meshes)[it.type];
      const cnt = inShadow ? ncounts : counts;
      const i = cnt[it.type];
      if (i >= this.cap) continue;
      this._q.setFromAxisAngle(up, it.yaw);
      this._s.setScalar(it.s);
      this._p.set(it.x, 0, it.z);
      this._m.compose(this._p, this._q, this._s);
      m.setMatrixAt(i, this._m);
      const t = 0.86 + it.tint * 0.22;
      this._c.setRGB(t * (0.96 + it.tint * 0.06), t, t * (0.98 - it.tint * 0.05));
      m.setColorAt(i, this._c);
      cnt[it.type]++;
    }
    const apply = (list, cnt) => list.forEach((m, k) => {
      m.count = cnt[k];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    });
    apply(this.meshes, counts);
    apply(this.near, ncounts);
  }
}

function colorize(g, hex) {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

// Lumpy low-poly blob: an icosahedron with jittered vertices (shared positions stay welded).
function blob(r, sy, detail, seed) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const jit = new Map();
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    if (!jit.has(k)) jit.set(k, 0.86 + rnd() * 0.28);
    const f = jit.get(k);
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * sy, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

function trunk(h, r0, r1, lean = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 6, 1);
  g.translate(0, h / 2, 0);
  if (lean) g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, lean, 0, 0, 0));
  return g;
}

export function treeGeometries(low = false) {
  const D = low ? 0 : 1;
  const bark = '#7a5a48', leaf = '#6fae5c', leaf2 = '#89c26a', dark = '#5c9a55';
  // 0: rain tree — broad umbrella canopy (the Hiraeth "mushroom" silhouette)
  const rain = mergeGeometries([
    colorize(trunk(5.2, 0.42, 0.3), bark),
    colorize(trunk(2.4, 0.22, 0.14).rotateZ(0.7).translate(0.6, 3.6, 0), bark),
    colorize(trunk(2.4, 0.22, 0.14).rotateZ(-0.8).translate(-0.6, 3.4, 0.2), bark),
    colorize(blob(5.4, 0.36, D, 7).translate(0, 6.2, 0), leaf),
    colorize(blob(3.2, 0.45, 0, 11).translate(1.8, 7.0, 1.2), leaf2),
  ]);
  // 1: round neem / honge
  const round = mergeGeometries([
    colorize(trunk(3.4, 0.3, 0.22), bark),
    colorize(blob(2.9, 0.85, D, 3).translate(0, 5.2, 0), dark),
    colorize(blob(1.9, 0.8, 0, 5).translate(1.2, 6.4, -0.6), leaf),
  ]);
  // 2: coconut palm — slender curved trunk and drooping fronds
  const parts = [];
  let x = 0;
  for (let i = 0; i < 5; i++) {
    const seg = colorize(trunk(2.0, 0.24 - i * 0.02, 0.22 - i * 0.02), '#9b8063');
    seg.translate(x, i * 1.95, 0);
    x += 0.12 + i * 0.05;
    parts.push(seg);
  }
  const top = 9.6;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const f = new THREE.PlaneGeometry(4.2, 0.9, 3, 1);
    // droop the frond along its length
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 2.1) / 4.2; p.setY(i, p.getY(i) * (1 - u * 0.6)); p.setZ(i, -u * u * 1.8); }
    f.translate(2.1, 0, 0);
    f.rotateX(-Math.PI / 2);
    f.rotateY(a);
    f.translate(x, top, 0);
    f.computeVertexNormals();
    parts.push(colorize(f, k % 2 ? '#7fb35f' : '#6ea653'));
  }
  parts.push(colorize(blob(0.6, 1, 0, 9).translate(x, top - 0.4, 0), '#a0784a'));
  const palm = mergeGeometries(parts);
  // 3: flowering tabebuia / gulmohar (pink and orange canopies of February)
  const bloom = mergeGeometries([
    colorize(trunk(4.2, 0.32, 0.22), bark),
    colorize(blob(4.0, 0.5, D, 13).translate(0, 5.6, 0), '#f2a0bf'),
    colorize(blob(2.4, 0.6, 0, 17).translate(-1.4, 6.4, 0.8), '#f7b9cf'),
  ]);
  return [rain, round, palm, bloom];
}
