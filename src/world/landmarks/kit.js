import * as THREE from 'three';
import { GeoBuilder, ring, polyArea, centroid } from '../geo.js';

// Modelling kit for landmarks: boxes, prisms with real windows, cylinders, domes, all in a local
// frame (origin + yaw) and merged into one mesh using the city's facade material.
//   style codes (see Toon.js): 0 homes, 20 offices, 30 glass, 40 civic windows, 70 plain, 50 temple

const hexc = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export class Kit {
  constructor(city, ox, oz, yaw = 0) {
    this.city = city;
    this.ox = ox; this.oz = oz; this.yaw = yaw;
    this.g = new GeoBuilder({ bld: true });
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
  }

  // local (x forward-ish, z sideways) -> world
  w(x, z) { return [this.ox + x * this.c + z * this.s, this.oz - x * this.s + z * this.c]; }

  box(x, y, z, w, h, d, color, style = 70, yaw = 0) {
    const [wx, wz] = this.w(x, z);
    this.g.box(wx, y + h / 2, wz, w, h, d, this.yaw + yaw, hexc(color), [0, y, y + h, style]);
    return this;
  }

  // Extrude a local polygon [[x,z],...] from y0 to y1 with proper facade coordinates.
  prism(pts, y0, y1, color, style = 70, roof) {
    let r = pts.map(([x, z]) => this.w(x, z));
    if (polyArea(r) < 0) r = r.reverse();
    return this.prismWorld(r, y0, y1, color, style, roof);
  }

  prismWorld(r, y0, y1, color, style = 70, roof) {
    const g = this.g, col = hexc(color), rc = hexc(roof || color);
    const n = r.length;
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      const nx = dz / L, nz = -dx / L;
      const u0 = -L / 2 + 1.3, u1 = L / 2 + 1.3;
      const v0 = g.vert(a[0], y0, a[1], nx, 0, nz, col, [u0, y0, y1, style]);
      const v1 = g.vert(b[0], y0, b[1], nx, 0, nz, col, [u1, y0, y1, style]);
      const v2 = g.vert(b[0], y1, b[1], nx, 0, nz, col, [u1, y1, y1, style]);
      const v3 = g.vert(a[0], y1, a[1], nx, 0, nz, col, [u0, y1, y1, style]);
      g.quad(v0, v1, v2, v3, nx, 0, nz);
    }
    try { g.flat(r, [], y1, rc, [0, y1, y1, 70]); } catch {}
    return this;
  }

  // Regular n-gon prism / cylinder / frustum (r0 bottom, r1 top).
  cyl(x, y, z, r0, r1, h, color, seg = 16, style = 70, caps = true) {
    const g = this.g, col = hexc(color);
    const [cx, cz] = this.w(x, z);
    const st = [0, y, y + h, style];
    const base = g.count;
    const slope = (r0 - r1) / h;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, slope);
      const u = (i / seg) * Math.PI * 2 * Math.max(r0, r1);
      g.vert(cx + ca * r0, y, cz + sa * r0, ca / nl, slope / nl, sa / nl, col, [u, y, y + h, style]);
      g.vert(cx + ca * r1, y + h, cz + sa * r1, ca / nl, slope / nl, sa / nl, col, [u, y + h, y + h, style]);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2, am = ((i + 0.5) / seg) * Math.PI * 2;
      g.quad(a, a + 2, a + 3, a + 1, Math.cos(am), 0, Math.sin(am));
    }
    if (caps && r1 > 0.01) {
      const c0 = g.vert(cx, y + h, cz, 0, 1, 0, col, st);
      const s0 = g.count;
      for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; g.vert(cx + Math.cos(a) * r1, y + h, cz + Math.sin(a) * r1, 0, 1, 0, col, st); }
      for (let i = 0; i < seg; i++) g.tri(c0, s0 + i, s0 + ((i + 1) % seg), 0, 1, 0);
    }
    return this;
  }

  // Hemispherical dome (squash < 1 flattens it, > 1 makes an onion-ish dome).
  dome(x, y, z, r, color, squash = 1, seg = 16, rings = 7) {
    const g = this.g, col = hexc(color);
    const [cx, cz] = this.w(x, z);
    const st = [0, y, y + r * squash, 70];
    const base = g.count;
    for (let j = 0; j <= rings; j++) {
      const t = (j / rings) * (Math.PI / 2);
      const rr = Math.cos(t) * r, yy = Math.sin(t) * r * squash;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const nx = Math.cos(t) * Math.cos(a), ny = Math.sin(t) / squash, nz = Math.cos(t) * Math.sin(a);
        const nl = Math.hypot(nx, ny, nz);
        g.vert(cx + Math.cos(a) * rr, y + yy, cz + Math.sin(a) * rr, nx / nl, ny / nl, nz / nl, col, st);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + seg + 1;
      const t = ((j + 0.5) / rings) * (Math.PI / 2), am = ((i + 0.5) / seg) * Math.PI * 2;
      g.quad(a, a + 1, b + 1, b, Math.cos(t) * Math.cos(am), Math.sin(t), Math.cos(t) * Math.sin(am));
    }
    return this;
  }

  // Four-sided pyramid / hip roof over a w x d rectangle.
  pyramid(x, y, z, w, d, h, color, yaw = 0) {
    const g = this.g, col = hexc(color);
    const cy = Math.cos(this.yaw + yaw), sy = Math.sin(this.yaw + yaw);
    const [cx, cz] = this.w(x, z);
    const P = (lx, lz) => [cx + lx * cy + lz * sy, cz - lx * sy + lz * cy];
    const corners = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
    const top = [cx, y + h, cz];
    const st = [0, y, y + h, 70];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const ux = b[0] - a[0], uz = b[1] - a[1];
      const vx = top[0] - a[0], vy = h, vz = top[2] - a[1];
      let nx = uz * vy - 0 * vz, ny = 0 * vx - ux * vz + uz * 0, nz = ux * vy - uz * 0;
      nx = -uz * vy; ny = uz * vx - ux * vz; nz = ux * vy;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const i0 = g.vert(a[0], y, a[1], nx, ny, nz, col, st), i1 = g.vert(b[0], y, b[1], nx, ny, nz, col, st), i2 = g.vert(top[0], top[1], top[2], nx, ny, nz, col, st);
      g.tri(i0, i1, i2, nx, ny, nz);
    }
    return this;
  }

  // Flight of steps rising along local +x from x0 (height 0) to x0+len (height h), width w.
  steps(x0, z, len, w, h, n, color) {
    for (let i = 0; i < n; i++) {
      const hh = (h * (i + 1)) / n;
      this.box(x0 + (len * i) / n + len / n / 2, 0, z, len / n, hh, w, color);
    }
    return this;
  }

  mesh() {
    const m = new THREE.Mesh(this.g.geometry(), this.city.mats.props);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

// Footprint rings of named buildings / areas in the zone data (for exclusion and placement).
export function namedRings(city, name) {
  const out = [];
  const d = city.data, idx = d.names.indexOf(name);
  if (idx < 0) return out;
  for (const b of d.buildings) if (b.length > 4 && b[4] === idx) out.push(ring(b[3]));
  for (const g of d.greens) if (g[3] === idx) out.push(ring(g[1]));
  return out;
}

export function ringBox(r) {
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const p of r) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
  return { minx, minz, maxx, maxz, cx: (minx + maxx) / 2, cz: (minz + maxz) / 2 };
}

export function rectRing(cx, cz, w, d, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}

export function circleRing(cx, cz, rx, rz = rx, n = 24) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); }
  return out;
}

export { centroid };
