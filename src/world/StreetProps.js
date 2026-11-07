import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../core/Toon.js';
import { GeoBuilder, rng, closestOnSeg } from './geo.js';
import { R, TILE } from './City.js';
import { Scatter } from './Scatter.js';
import { scooterGeo, carGeo, vehicleMaterial } from '../actors/Vehicles.js';

// The texture of an Indian street: electric poles with sagging tangles of cable, low compound
// walls with gates, two-wheelers parked along the kerb, bunk shops and coconut carts, potholes.

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const WALLS = ['#efe6d2', '#e8d3b0', '#d9e4d2', '#e9cfc4', '#dfe3ea', '#f2e2b8'].map(hex);

function colorize(g, col, glow = 0) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(col), n = g.attributes.position.count;
  const a = new Float32Array(n * 3), gl = new Float32Array(n);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; gl[i] = glow; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return g;
}

// A bunk shop (petty shop): a tin box with a hinged awning and bright packets.
function bunkGeo() {
  const parts = [
    colorize(new THREE.BoxGeometry(2.2, 2.2, 1.6).translate(0, 1.1, 0), '#3fb3a6'),
    colorize(new THREE.BoxGeometry(2.4, 0.08, 1.2).rotateX(-0.35).translate(0, 2.35, 1.0), '#f2c14e'),
    colorize(new THREE.BoxGeometry(2.0, 1.0, 0.05).translate(0, 1.5, 0.81), '#2b2b30'),
    colorize(new THREE.BoxGeometry(1.8, 0.25, 0.08).translate(0, 1.85, 0.84), '#e75a7c', 0.5),
    colorize(new THREE.BoxGeometry(1.8, 0.25, 0.08).translate(0, 1.5, 0.84), '#f07b20', 0.5),
    colorize(new THREE.BoxGeometry(1.8, 0.25, 0.08).translate(0, 1.15, 0.84), '#5aa9e6', 0.5),
    colorize(new THREE.BoxGeometry(2.2, 0.3, 0.06).translate(0, 2.05, 0.82), '#d64b3b'),
  ];
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}

// Coconut cart: a wooden handcart heaped with green tender coconuts.
function coconutGeo() {
  const parts = [colorize(new THREE.BoxGeometry(1.4, 0.15, 2.0).translate(0, 0.75, 0), '#8a5a34')];
  for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) parts.push(colorize(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5).translate(x, 0.35, z), '#5a3b22'));
  for (let i = 0; i < 9; i++) parts.push(colorize(new THREE.IcosahedronGeometry(0.22, 0).translate((i % 3 - 1) * 0.38, 0.98 + (i > 5 ? 0.25 : 0), (Math.floor(i / 3) - 1) * 0.5), i % 2 ? '#7cbf4a' : '#6aa83f'));
  parts.push(colorize(new THREE.BoxGeometry(0.06, 1.3, 0.06).translate(0.6, 1.4, -0.9), '#5a3b22'));
  parts.push(colorize(new THREE.ConeGeometry(0.9, 0.5, 8).translate(0.6, 2.2, -0.9), '#e75a5a'));
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}

export class StreetProps {
  constructor(city, quality) {
    this.city = city;
    this.group = new THREE.Group();
    const r = rng(4242);
    const roads = city.roads.filter((rd) => !rd.bridge && rd.code >= R.tertiary && rd.code <= R.residential);
    const tmp = [];
    const free = (x, z, pad = 0.5) => !city.buildingAt(x, z, tmp, pad) && !city.isWater(x, z);

    // ---- poles, cables, compound walls and potholes, chunked per tile
    const { x0, z0 } = city.bounds;
    const tiles = new Map();
    const tile = (x, z) => {
      const k = `${Math.floor((x - x0) / TILE)},${Math.floor((z - z0) / TILE)}`;
      if (!tiles.has(k)) tiles.set(k, { g: new GeoBuilder({ bld: true }), wires: [], cx: x0 + (Math.floor((x - x0) / TILE) + 0.5) * TILE, cz: z0 + (Math.floor((z - z0) / TILE) + 0.5) * TILE });
      return tiles.get(k);
    };
    const pole = hex('#8c8a86'), gate = hex('#4f5a66');
    const st = [0, 0, 0, 70];
    const pot = new GeoBuilder();
    const potCol = hex('#6c6e78');
    const parked = [];
    for (const rd of roads) {
      const pts = rd.pts;
      const side = r() < 0.5 ? 1 : -1;
      let prevTop = null;
      let carry = r() * 20;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1) continue;
        const dx = (bx - ax) / L, dz = (bz - az) / L;
        const nx = -dz, nz = dx;
        // electric poles every ~32 m on one side, cables sagging between them
        for (let s = carry; s < L; s += 32) {
          const off = rd.w / 2 + 0.8;
          const x = ax + dx * s + nx * off * side, z = az + dz * s + nz * off * side;
          if (!free(x, z, 0.3)) { prevTop = null; continue; }
          const t = tile(x, z);
          t.g.box(x, 4.5, z, 0.28, 9, 0.28, 0, pole, st);
          t.g.box(x, 8.4, z, 1.6, 0.14, 0.14, Math.atan2(dx, dz) + Math.PI / 2, pole, st);
          if (r() < 0.35) t.g.box(x + nx * side * 0.4, 6.4, z + nz * side * 0.4, 0.8, 0.9, 0.6, 0, hex('#7a7f86'), st); // transformer box
          const top = [x, 8.4, z];
          if (prevTop) {
            for (let w = 0; w < 4; w++) {
              const o = (w - 1.5) * 0.35, sag = 0.6 + w * 0.25 + r() * 0.4;
              t.wires.push([[prevTop[0] + nz * o * 0, prevTop[1] - w * 0.12, prevTop[2]], [top[0], top[1] - w * 0.12, top[2]], sag, o]);
            }
          }
          prevTop = top;
          // the odd drop cable to a house
          if (r() < 0.5) {
            const hx = x + nx * side * 5, hz = z + nz * side * 5;
            const b = city.buildingAt(hx, hz, tmp, 2);
            if (b && b.h > 5) t.wires.push([[x, 8.2, z], [hx - nx * side * 1.5, Math.min(b.h - 1, 7), hz - nz * side * 1.5], 0.5, 0]);
          }
        }
        carry = Math.max(0, carry - L);
        // compound walls along the property line, broken by gates
        const wo = rd.w / 2 + 2.4;
        for (const sg of [1, -1]) {
          let s = 2 + r() * 4;
          while (s < L - 2) {
            const len = 6 + r() * 8;
            const e = Math.min(L - 1, s + len);
            const mx = ax + dx * ((s + e) / 2) + nx * wo * sg, mz = az + dz * ((s + e) / 2) + nz * wo * sg;
            const sx = ax + dx * s + nx * wo * sg, sz = az + dz * s + nz * wo * sg;
            const ex = ax + dx * e + nx * wo * sg, ez = az + dz * e + nz * wo * sg;
            if (free(mx, mz, 0.6) && free(sx, sz, 0.6) && free(ex, ez, 0.6) && !city.onRoad(mx, mz, 0.2)) {
              const t = tile(mx, mz);
              const col = WALLS[Math.floor(r() * WALLS.length)];
              t.g.box(mx, 0.6, mz, 0.22, 1.2, e - s, Math.atan2(dx, dz), col, [0, 0, 1.2, 70]);
              t.g.box(mx, 1.24, mz, 0.3, 0.08, e - s, Math.atan2(dx, dz), col.map((c) => c * 0.85), st);
              // a gate at the end of the stretch
              if (r() < 0.6) t.g.box(ex + dx * 0.9, 0.75, ez + dz * 0.9, 0.12, 1.5, 1.8, Math.atan2(dx, dz), gate, st);
            }
            s = e + 2.6;
          }
        }
        // potholes (a Bengaluru constant)
        if (r() < 0.22 * L / 40) {
          const s = r() * L, lat = (r() - 0.5) * rd.w * 0.6;
          const px = ax + dx * s + nx * lat, pz = az + dz * s + nz * lat;
          const rr = 0.5 + r() * 0.9;
          const ring = [];
          for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; ring.push([px + Math.cos(a) * rr * (0.8 + r() * 0.4), pz + Math.sin(a) * rr * 0.7 * (0.8 + r() * 0.4)]); }
          try { pot.flat(ring, [], 0, potCol); } catch {}
        }
        // parked two-wheelers and the occasional car along the kerb
        for (let s = 4 + r() * 6; s < L - 3; s += 3 + r() * 9) {
          if (r() < 0.35) continue;
          const sg = r() < 0.5 ? 1 : -1;
          const off = rd.w / 2 - 0.9;
          const x = ax + dx * s + nx * off * sg, z = az + dz * s + nz * off * sg;
          const car = r() < 0.12;
          parked.push({ x, z, type: car ? 1 : 0, s: 1, yaw: Math.atan2(dx, dz) + (car ? 0 : Math.PI / 2 + (r() - 0.5) * 0.5) + (r() < 0.5 ? Math.PI : 0), tint: r() });
        }
      }
    }
    // kiosks: bunk shops and coconut carts near busy corners
    for (const rd of city.roads) {
      if (rd.bridge || rd.code > R.tertiary || r() > 0.5) continue;
      const k = Math.floor(r() * (rd.pts.length - 1));
      const [ax, az] = rd.pts[k], [bx, bz] = rd.pts[k + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const t = r(), sg = r() < 0.5 ? 1 : -1, off = rd.w / 2 + 2.2;
      const x = ax + (bx - ax) * t - ((bz - az) / L) * off * sg, z = az + (bz - az) * t + ((bx - ax) / L) * off * sg;
      if (!free(x, z, 1.2)) continue;
      parked.push({ x, z, type: r() < 0.55 ? 2 : 3, s: 1, yaw: Math.atan2(bx - ax, bz - az) + (sg > 0 ? Math.PI / 2 : -Math.PI / 2), tint: r() });
      city.pillars = city.pillars || [];
      city.pillars.push([x, z, 1.1]);
    }
    // build meshes
    this.chunks = [];
    const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2226 });
    for (const t of tiles.values()) {
      const grp = new THREE.Group();
      if (t.g.count) {
        const m = new THREE.Mesh(t.g.geometry(), city.mats.props);
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
      }
      if (t.wires.length) {
        const pos = [];
        for (const [a, b, sag] of t.wires) {
          const N = 6;
          let prev = a;
          for (let k = 1; k <= N; k++) {
            const f = k / N;
            const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - Math.sin(f * Math.PI) * sag, a[2] + (b[2] - a[2]) * f];
            pos.push(...prev, ...p);
            prev = p;
          }
        }
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        grp.add(new THREE.LineSegments(lg, wireMat));
      }
      this.group.add(grp);
      this.chunks.push({ obj: grp, cx: t.cx, cz: t.cz });
    }
    if (pot.count) {
      const m = new THREE.Mesh(pot.geometry(), city.mats.paint);
      m.renderOrder = -12;
      this.group.add(m);
    }
    // parked things are instanced near the camera
    const vmat = vehicleMaterial();
    const geos = [scooterGeo({ body: '#d9d9de' }), carGeo({ body: '#ffffff' }), bunkGeo(), coconutGeo()];
    this.parked = new Scatter(geos, parked, quality.treeRadius * 0.7, 2500, vmat);
    this.group.add(this.parked.group);
    this.count = parked.length;
  }

  update(cam, far) {
    for (const c of this.chunks) c.obj.visible = Math.hypot(c.cx - cam.x, c.cz - cam.z) < Math.min(far, 900);
    this.parked.update(cam);
  }
}
