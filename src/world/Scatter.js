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

// A vertex colour gradient: darker underneath, lighter on top (sun-lit crowns, shaded undersides).
function colorizeGrad(g, top, bottom, y0, y1) {
  if (g.index) g = g.toNonIndexed();
  const a = new THREE.Color(top), b = new THREE.Color(bottom), c = new THREE.Color();
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / Math.max(0.01, y1 - y0)));
    c.copy(b).lerp(a, t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

// A full canopy: many lumpy leaf clusters scattered through an ellipsoid (rx, ry) centred at height cy.
function canopy(n, rx, ry, cy, seed, top, bottom, detail, size = 1) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * rx * 0.78;
    const y = cy + (rnd() - 0.35) * ry * 0.9;
    const cr = (0.32 + rnd() * 0.22) * rx * size * (1 - Math.abs(y - cy) / (ry * 2));
    const g = blob(Math.max(0.6, cr), 0.62 + rnd() * 0.2, detail, 3 + i * 7 + seed);
    g.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    parts.push(colorizeGrad(g, top, bottom, cy - ry * 0.7, cy + ry * 0.6));
  }
  return parts;
}

function branches(parts, n, h, len, col, seed) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const b = trunk(len, 0.18, 0.08);
    b.rotateZ(0.75 + (i % 2) * 0.2);
    b.rotateY(a);
    b.translate(0, h, 0);
    parts.push(colorize(b, col));
  }
}

export function treeGeometries(low = false) {
  const D = low ? 0 : 1;
  const bark = '#5e4a3c', barkLight = '#7a6550';
  // 0: rain tree: wide, flat-topped umbrella over the avenues
  const rainP = [colorizeGrad(trunk(4.6, 0.46, 0.32), barkLight, bark, 0, 4.6)];
  if (!low) branches(rainP, 4, 3.8, 3.2, bark, 1);
  rainP.push(...canopy(low ? 3 : 9, 6.2, 2.2, 6.4, 11, '#6f9a4a', '#2f4f26', D, low ? 1.35 : 1.05));
  const rain = mergeGeometries(rainP);
  // 1: neem / honge: a rounder, denser crown
  const roundP = [colorizeGrad(trunk(3.2, 0.32, 0.22), barkLight, bark, 0, 3.2)];
  if (!low) branches(roundP, 3, 2.9, 2.0, bark, 2);
  roundP.push(...canopy(low ? 3 : 7, 3.2, 3.0, 5.6, 23, '#7aa252', '#2e4d25', D, low ? 1.3 : 1.05));
  const round = mergeGeometries(roundP);
  // 2: coconut palm: ringed, curving trunk and long drooping fronds with leaflets
  const parts = [];
  let x = 0;
  for (let i = 0; i < 6; i++) {
    const seg = colorizeGrad(trunk(1.7, 0.24 - i * 0.017, 0.22 - i * 0.017), '#8a7258', '#6e5a46', 0, 1.7);
    seg.translate(x, i * 1.65, 0);
    x += 0.08 + i * 0.045;
    parts.push(seg);
  }
  const top = 9.9;
  const fronds = low ? 7 : 12;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + (k % 2) * 0.2;
    const len = 4.2 + (k % 3) * 0.5;
    // a frond is a strip of leaflets: a plane cut into a sawtooth outline that tapers to the tip
    const f = new THREE.PlaneGeometry(len, 1.3, low ? 2 : 9, low ? 1 : 2);
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + len / 2) / len, v = p.getY(i) / 0.65;
      const saw = low ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(u * 36));
      p.setY(i, v * 0.65 * (1 - u * 0.75) * saw);
      p.setZ(i, -u * u * (2.4 + (k % 3) * 0.4) + Math.abs(v) * 0.15);
    }
    f.translate(len / 2, 0, 0);
    f.rotateX(-Math.PI / 2);
    f.rotateY(a);
    f.translate(x, top, 0);
    f.computeVertexNormals();
    parts.push(colorizeGrad(f, k % 2 ? '#7b9c4c' : '#6a8f44', '#3c5a2a', top - 3, top));
  }
  parts.push(colorize(blob(0.55, 1, 0, 9).translate(x, top - 0.35, 0), '#8a6a3c'));
  for (let i = 0; i < (low ? 0 : 5); i++) parts.push(colorize(sphere(0.16).translate(x + Math.cos(i * 1.3) * 0.35, top - 0.6, Math.sin(i * 1.3) * 0.35), '#6e7a2c'));   // coconuts
  const palm = mergeGeometries(parts);
  // 3: flowering tabebuia / gulmohar: a pink crown over green, the colours of a Bengaluru February
  const bloomP = [colorizeGrad(trunk(4.0, 0.3, 0.2), barkLight, bark, 0, 4)];
  if (!low) branches(bloomP, 3, 3.4, 2.4, bark, 3);
  bloomP.push(...canopy(low ? 3 : 6, 4.2, 2.4, 5.8, 31, '#f0a3c0', '#b8607e', D, low ? 1.3 : 1.05));
  if (!low) bloomP.push(...canopy(3, 3.8, 1.8, 5.2, 37, '#6d9a4a', '#2f4f26', D, 0.8));
  const bloom = mergeGeometries(bloomP);
  return [rain, round, palm, bloom];
}

function sphere(r) { return new THREE.SphereGeometry(r, 6, 4); }
