import * as THREE from 'three';

// Small geometry toolkit for building the city from map data.

// Decimetre-quantised flat [x0, z0, x1, z1, ...] -> [[x, z], ...] in metres.
export function ring(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i] / 10, flat[i + 1] / 10]);
  return out;
}

export function polyArea(r) {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function centroid(r) {
  let x = 0, z = 0;
  for (const p of r) { x += p[0]; z += p[1]; }
  return [x / r.length, z / r.length];
}

export function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Closest point on segment ab to p; returns [x, z, t, distSq].
export function closestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / L;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t, z = az + dz * t;
  return [x, z, t, (px - x) ** 2 + (pz - z) ** 2];
}

// Deterministic pseudo-random in [0, 1) from integers / floats.
export function hash(a, b = 0, c = 0) {
  let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (c * 83492791), 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Triangulate a polygon (outer ring + holes) laid flat at height y. Returns { pos, idx } appended.
export function triangulate(outer, holes = []) {
  const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
  const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
  // ShapeUtils wants clockwise contours in its own convention; it fixes winding itself
  const faces = THREE.ShapeUtils.triangulateShape(contour, hs);
  const pts = [...outer, ...holes.flat()];
  return { pts, faces };
}

// Growable typed buffers for merged geometry.
export class GeoBuilder {
  constructor({ color = true, bld = false, uv = false } = {}) {
    this.pos = []; this.nrm = []; this.col = color ? [] : null; this.bld = bld ? [] : null; this.uv = uv ? [] : null;
    this.idx = [];
  }
  get count() { return this.pos.length / 3; }
  vert(x, y, z, nx, ny, nz, c, b, u) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz);
    if (this.col) this.col.push(c[0], c[1], c[2]);
    if (this.bld) this.bld.push(b[0], b[1], b[2], b[3]);
    if (this.uv) this.uv.push(u ? u[0] : 0, u ? u[1] : 0);
    return this.pos.length / 3 - 1;
  }
  // Adds triangle a,b,c with winding fixed to face the given normal.
  tri(a, b, c, nx, ny, nz) {
    const P = this.pos;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  quad(a, b, c, d, nx, ny, nz) { this.tri(a, b, c, nx, ny, nz); this.tri(a, c, d, nx, ny, nz); }

  // A flat polygon (with holes) at height y, facing up.
  flat(outer, holes, y, c, b) {
    const { pts, faces } = triangulate(outer, holes);
    const base = this.count;
    for (const p of pts) this.vert(p[0], y, p[1], 0, 1, 0, c, b);
    for (const f of faces) this.tri(base + f[0], base + f[1], base + f[2], 0, 1, 0);
  }

  // A ribbon along a polyline (mitred joins, capped by rounded discs if caps=true).
  ribbon(pts, width, y, c, caps = false, uvScale = 0) {
    const hw = width / 2;
    const n = pts.length;
    if (n < 2) return;
    const L = [], R = [];
    let along = 0;
    const us = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx, dz;
      if (i === 0 || i === n - 1) { dx = b[0] - a[0]; dz = b[1] - a[1]; }
      else {
        const d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1];
        const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1;
        dx = d1x / l1 + d2x / l2; dz = d1z / l1 + d2z / l2;
      }
      const l = Math.hypot(dx, dz) || 1;
      let ox = -dz / l, oz = dx / l;
      // miter length compensation (clamped)
      if (i > 0 && i < n - 1) {
        const d1x = p[0] - a[0], d1z = p[1] - a[1];
        const l1 = Math.hypot(d1x, d1z) || 1;
        const cos = Math.abs(ox * (-d1z / l1) + oz * (d1x / l1));
        const m = Math.min(1 / Math.max(cos, 0.35), 2.5);
        ox *= m; oz *= m;
      }
      if (i > 0) along += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      us.push(along);
      L.push([p[0] + ox * hw, p[1] + oz * hw]);
      R.push([p[0] - ox * hw, p[1] - oz * hw]);
    }
    const base = this.count;
    for (let i = 0; i < n; i++) {
      this.vert(L[i][0], y, L[i][1], 0, 1, 0, c, null, [us[i] * uvScale, 0]);
      this.vert(R[i][0], y, R[i][1], 0, 1, 0, c, null, [us[i] * uvScale, 1]);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2, 0, 1, 0);
    }
    if (caps) { this.disc(pts[0], hw, y, c); this.disc(pts[n - 1], hw, y, c); }
  }

  disc(p, r, y, c, seg = 10) {
    const base = this.count;
    this.vert(p[0], y, p[1], 0, 1, 0, c);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      this.vert(p[0] + Math.cos(a) * r, y, p[1] + Math.sin(a) * r, 0, 1, 0, c);
    }
    for (let i = 0; i < seg; i++) this.tri(base, base + 1 + i, base + 1 + ((i + 1) % seg), 0, 1, 0);
  }

  // An axis-aligned or rotated box (centre x,y,z; size w,h,d; yaw radians).
  box(x, y, z, w, h, d, yaw, c, b) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
    const N = (nx, nz) => [nx * cs + nz * sn, -nx * sn + nz * cs];
    const faces = [
      [[1, 0, 0], [[w / 2, -h / 2, -d / 2], [w / 2, -h / 2, d / 2], [w / 2, h / 2, d / 2], [w / 2, h / 2, -d / 2]]],
      [[-1, 0, 0], [[-w / 2, -h / 2, d / 2], [-w / 2, -h / 2, -d / 2], [-w / 2, h / 2, -d / 2], [-w / 2, h / 2, d / 2]]],
      [[0, 0, 1], [[w / 2, -h / 2, d / 2], [-w / 2, -h / 2, d / 2], [-w / 2, h / 2, d / 2], [w / 2, h / 2, d / 2]]],
      [[0, 0, -1], [[-w / 2, -h / 2, -d / 2], [w / 2, -h / 2, -d / 2], [w / 2, h / 2, -d / 2], [-w / 2, h / 2, -d / 2]]],
      [[0, 1, 0], [[-w / 2, h / 2, -d / 2], [w / 2, h / 2, -d / 2], [w / 2, h / 2, d / 2], [-w / 2, h / 2, d / 2]]],
      [[0, -1, 0], [[-w / 2, -h / 2, d / 2], [w / 2, -h / 2, d / 2], [w / 2, -h / 2, -d / 2], [-w / 2, -h / 2, -d / 2]]],
    ];
    for (const [n, vs] of faces) {
      const [nx, nz] = N(n[0], n[2]);
      const ids = vs.map((v) => { const p = P(...v); return this.vert(p[0], p[1], p[2], nx, n[1], nz, c, b); });
      this.quad(ids[0], ids[1], ids[2], ids[3], nx, n[1], nz);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.bld) g.setAttribute('aBld', new THREE.Float32BufferAttribute(this.bld, 4));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const n = this.count;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Uniform grid of items keyed by their bounding boxes, for fast nearby queries.
export class Grid {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  insert(item, minx, minz, maxx, maxz) {
    const c = this.cell;
    for (let ix = Math.floor(minx / c); ix <= Math.floor(maxx / c); ix++)
      for (let iz = Math.floor(minz / c); iz <= Math.floor(maxz / c); iz++) {
        const k = this.key(ix, iz);
        let a = this.map.get(k);
        if (!a) this.map.set(k, (a = []));
        a.push(item);
      }
  }
  // Items whose cells overlap the query box (may repeat; callers de-dupe with a stamp if needed).
  query(minx, minz, maxx, maxz, out = []) {
    const c = this.cell;
    out.length = 0;
    for (let ix = Math.floor(minx / c); ix <= Math.floor(maxx / c); ix++)
      for (let iz = Math.floor(minz / c); iz <= Math.floor(maxz / c); iz++) {
        const a = this.map.get(this.key(ix, iz));
        if (a) for (const it of a) out.push(it);
      }
    return out;
  }
}
