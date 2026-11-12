import * as THREE from 'three';
import { toon, Look } from '../core/Toon.js';
import { GeoBuilder, Grid, ring, polyArea, centroid, pointInRing, closestOnSeg, hash, rng } from './geo.js';
import { Scatter, treeGeometries } from './Scatter.js';

// Builds a playable 3D slice of Bengaluru from a zone file (see tools/build_zones.py):
// real building footprints, roads, parks, lakes and metro lines, dressed in the comic style.
// Also answers spatial questions for gameplay: collisions, roof heights, street names.

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const PAL = {
  res: ['#f3e7cf', '#f4dca8', '#eab9a2', '#cfe3d2', '#c8dbe9', '#e6d2e6', '#f6f1e8', '#e8c793', '#dba98d', '#bcd8c3', '#f1cab9', '#d7cfe7', '#f2d4c4', '#e4e9c9', '#f7e1b5', '#bfe0de'].map(hex),
  shop: ['#f0e2c8', '#e9d5b5', '#f3c9a6', '#d8e2ea', '#efe8dc', '#f2d9a0', '#e3c6c6'].map(hex),
  office: ['#e3e0da', '#d6d9de', '#ece6dc', '#cfd5d8', '#e0d6c8'].map(hex),
  glass: ['#b9cfd6', '#a9c4cf', '#c4d6dc', '#b4c9c2'].map(hex),
  civic: ['#e9dcc4', '#d9b49a', '#e6cfa6', '#cdb9a0'].map(hex),
  worship: ['#f3ead4', '#f5e3a8', '#f2f0ea', '#f0cfa0'].map(hex),
  industrial: ['#c7ccd1', '#b9c3cc', '#d0cbc2', '#a9b8c4'].map(hex),
  construction: ['#c9c5bd', '#bdb6aa'].map(hex),
  roof: ['#cfcbc4', '#c4c1bc', '#d8d4cc', '#bdbab5', '#d3cdc2', '#e2ddd2'].map(hex),
  terracotta: hex('#c98a6a'),
};
const KIND_PAL = ['res', 'shop', 'office', 'glass', 'civic', 'worship', 'industrial', 'construction', 'construction', 'civic'];

// road codes from the build script
export const R = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, link: 5, residential: 6, service: 7, pedestrian: 8, footway: 9, path: 10, construction: 11 };
const ROAD_COL = [
  '#7c7f8c', '#7c7f8c', '#82848f', '#878994', '#8d8e97', '#878994', '#96969c', '#a3a1a1', '#d4cbbb', '#d4cbbb', '#d2c4a6', '#b08c68',
].map(hex);
const GREEN_COL = ['#a9cc7f', '#7fae6e', '#9fd17f', '#b6d68a', '#e3cfa0', '#b9c7a0'].map(hex);
const AREA_COL = ['#ddcfb6', '#ddcfb8', '#d6cfc0', '#cfd3b0', '#ddd0b8', '#d4bf9c', '#d0c7b9'].map(hex);

export const TILE = 260;

// Kannada road name: OpenStreetMap's name:kn when present, otherwise an exact rendering of
// Bengaluru's numbered grid ("5th Cross Road" -> "೫ನೇ ಅಡ್ಡ ರಸ್ತೆ"). Other names are left alone.
const KN_DIGITS = '೦೧೨೩೪೫೬೭೮೯';
export function knName(en, kn) {
  if (kn) return kn;
  if (!en) return '';
  const m = /^(\d+)(?:st|nd|rd|th)\s+(?:([AB])\s+)?(Main|Cross)(?:\s+Road)?$/i.exec(en.trim());
  if (!m) return '';
  const num = m[1].replace(/\d/g, (d) => KN_DIGITS[+d]);
  const sub = m[2] ? (m[2].toUpperCase() === 'A' ? 'ಎ ' : 'ಬಿ ') : '';
  return `${num}ನೇ ${sub}${m[3].toLowerCase() === 'main' ? 'ಮುಖ್ಯ ರಸ್ತೆ' : 'ಅಡ್ಡ ರಸ್ತೆ'}`;
}

// Offset a counter-clockwise ring inwards by d metres (mitred, clamped); null if it collapses.
function insetRing(r, d) {
  const n = r.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = r[(i + n - 1) % n], c = r[i], q = r[(i + 1) % n];
    const e1x = c[0] - p[0], e1z = c[1] - p[1], e2x = q[0] - c[0], e2z = q[1] - c[1];
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    // inward normal of a CCW (x,z) ring is (-dz, dx)
    const n1x = -e1z / l1, n1z = e1x / l1, n2x = -e2z / l2, n2z = e2x / l2;
    let bx = n1x + n2x, bz = n1z + n2z;
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-3) { bx = n1x; bz = n1z; } else { bx /= bl; bz /= bl; }
    const cos = bx * n1x + bz * n1z;
    const m = d / Math.max(cos, 0.4);
    out.push([c[0] + bx * m, c[1] + bz * m]);
  }
  return Math.abs(polyArea(out)) > 4 && polyArea(out) > 0 ? out : null;
}

export class City {
  constructor(data, quality) {
    this.data = data;
    this.quality = quality;
    this.names = data.names;
    this.group = new THREE.Group();
    this.group.name = 'city';
    const [x0, z0, x1, z1] = data.bounds.map((v) => v / 10);
    this.bounds = { x0, z0, x1, z1 };
    this.bGrid = new Grid(24);      // building footprints
    this.rGrid = new Grid(32);      // road segments
    this.wGrid = new Grid(48);      // water polygons
    this.excluded = [];             // landmark areas where generated buildings are skipped
    this.restyle = new Map();       // building name -> { color, style, h, roof } overrides for landmarks
    this.chunks = [];               // { mesh, cx, cz } for distance culling
    this.mats = {
      building: toon({ vertexColors: true, building: true, hatch: 1 }),
      ground: toon({ color: '#dccaa9', ground: true, hatch: 0.25 }),
      flat: toon({ vertexColors: true, ground: true, hatch: 0.3 }),
      road: toon({ vertexColors: true, ground: true, road: true, hatch: 0.15 }),
      water: toon({ color: '#79b8c6', water: true, hatch: 0, noInk: false }),
      paint: toon({ vertexColors: true, unlit: true, hatch: 0 }),
      props: toon({ vertexColors: true, building: true, hatch: 0.6 }),
      viaduct: toon({ vertexColors: true, hatch: 0.8 }),
    };
    for (const k of ['ground', 'flat', 'road', 'water', 'paint']) {
      const m = this.mats[k];
      m.depthWrite = k === 'ground';
      m.polygonOffset = k !== 'ground';
    }
    this.mats.flat.polygonOffsetFactor = -1; this.mats.flat.polygonOffsetUnits = -2;
    this.mats.water.polygonOffsetFactor = -1; this.mats.water.polygonOffsetUnits = -3;
    this.mats.road.polygonOffsetFactor = -1; this.mats.road.polygonOffsetUnits = -4;
    this.mats.paint.polygonOffsetFactor = -1; this.mats.paint.polygonOffsetUnits = -6;
  }

  // Landmark modules call this before build() so their footprint isn't filled with boxes.
  exclude(poly) { this.excluded.push(poly); }

  build() {
    const t0 = performance.now();
    this._indexBuildings();
    this._indexRoads();
    this._ground();
    this._areas();
    this._roads();
    this._buildings();
    this._rail();
    this._trees();
    this._horizon();
    this.buildMs = performance.now() - t0;
    return this.group;
  }

  // ---------------------------------------------------------------- indexing

  _indexBuildings() {
    this.buildings = [];
    // elevated metro stations are mapped as ground-to-roof "station" blocks; our station model replaces them
    const elevated = new Grid(60);
    for (const rl of this.data.rail) {
      if (rl[0] !== 1 && rl[0] !== 3) continue;
      const pts = ring(rl[2]);
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        elevated.insert([ax, az, bx, bz], Math.min(ax, bx) - 30, Math.min(az, bz) - 30, Math.max(ax, bx) + 30, Math.max(az, bz) + 30);
      }
    }
    const nearViaduct = (x, z, d) => elevated.query(x, z, x, z, []).some((s) => closestOnSeg(x, z, s[0], s[1], s[2], s[3])[3] < d * d);
    for (const b of this.data.buildings) {
      const r = ring(b[3]);
      if (r.length < 3) continue;
      const c = centroid(r);
      if (this.excluded.some((p) => pointInRing(c[0], c[1], p))) continue;
      if ((b[0] === 9 || b[0] === 7) && nearViaduct(c[0], c[1], 28)) continue;
      let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
      for (const p of r) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
      const rec = {
        kind: b[0], h: b[1] / 10, base: b[2] / 10, r, c,
        name: b.length > 4 && b[4] >= 0 ? this.names[b[4]] : null,
        holes: b.length > 5 ? b[5].map(ring) : [],
        minx, minz, maxx, maxz, area: Math.abs(polyArea(r)),
      };
      const rs = (rec.name && this.restyle.get(rec.name)) || (this.restyleFn && this.restyleFn(rec));
      if (rs) { rec.rs = rs; if (rs.h) rec.h = rs.h; }
      this.buildings.push(rec);
      this.bGrid.insert(rec, minx, minz, maxx, maxz);
    }
    for (const w of this.data.water) {
      const r = ring(w[0]);
      let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
      for (const p of r) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
      const rec = { r, holes: w[1].map(ring), name: w[2] >= 0 ? this.names[w[2]] : null, pool: w[3] === 1 };
      if (!rec.pool) this.wGrid.insert(rec, minx, minz, maxx, maxz);
    }
  }

  _indexRoads() {
    this.roads = [];
    const ends = new Map();
    const key = (x, z) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
    for (const rd of this.data.roads) {
      const [code, w, flags, nameIx, flat] = rd;
      const pts = ring(flat);
      const rec = {
        code, w: w / 10, oneway: !!(flags & 1), bridge: !!(flags & 2), layer: (flags >> 2) & 3,
        name: nameIx >= 0 ? this.names[nameIx] : null, pts, id: rd[5],
        kn: nameIx >= 0 ? knName(this.names[nameIx], this.data.namesKn?.[nameIx]) : '',
      };
      this.roads.push(rec);
      for (const p of [pts[0], pts[pts.length - 1]]) {
        const k = key(p[0], p[1]);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(rec);
      }
    }
    // Flyover heights: a bridge end that meets a ground road ramps down to it.
    for (const rec of this.roads) {
      if (!rec.bridge || rec.code >= R.footway) continue;
      const H = 6.5 + Math.max(0, rec.layer - 1) * 6;
      const a = rec.pts[0], b = rec.pts[rec.pts.length - 1];
      const groundA = (ends.get(key(a[0], a[1])) || []).some((o) => o !== rec && !o.bridge);
      const groundB = (ends.get(key(b[0], b[1])) || []).some((o) => o !== rec && !o.bridge);
      let len = 0;
      const along = [0];
      for (let i = 1; i < rec.pts.length; i++) { len += Math.hypot(rec.pts[i][0] - rec.pts[i - 1][0], rec.pts[i][1] - rec.pts[i - 1][1]); along.push(len); }
      const ramp = Math.min(90, len / 2.2);
      rec.heights = along.map((s) => {
        let h = H;
        if (groundA) h = Math.min(h, (s / ramp) * H);
        if (groundB) h = Math.min(h, ((len - s) / ramp) * H);
        return Math.max(0, h);
      });
      rec.deckH = H;
    }
    for (const rec of this.roads) {
      for (let i = 0; i < rec.pts.length - 1; i++) {
        const a = rec.pts[i], b = rec.pts[i + 1];
        const seg = { road: rec, i, ax: a[0], az: a[1], bx: b[0], bz: b[1] };
        const m = rec.w / 2 + 1;
        this.rGrid.insert(seg, Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m);
      }
    }
  }

  // ---------------------------------------------------------------- ground layers

  _ground() {
    const { x0, z0, x1, z1 } = this.bounds;
    const g = new THREE.PlaneGeometry(14000, 14000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, this.mats.ground);
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    m.receiveShadow = true;
    m.renderOrder = -20;
    this.group.add(m);
  }

  _areas() {
    const areas = new GeoBuilder();
    for (const a of this.data.areas) {
      try { areas.flat(ring(a[1]), a[2].map(ring), 0, AREA_COL[a[0]] || AREA_COL[0]); } catch {}
    }
    this._addFlat(areas, this.mats.flat, -19);

    const greens = new GeoBuilder();
    for (const gr of this.data.greens) {
      try { greens.flat(ring(gr[1]), gr[2].map(ring), 0, GREEN_COL[gr[0]] || GREEN_COL[0]); } catch {}
    }
    this._addFlat(greens, this.mats.flat, -18);

    // lake beds: a muddy rim slightly larger than the water, then the water itself
    const water = new GeoBuilder({ color: false });
    const banks = new GeoBuilder();
    for (const w of this.data.water) {
      const r = ring(w[0]);
      try { water.flat(r, w[1].map(ring), 0, null); } catch {}
      if (!w[3]) banks.ribbon([...r, r[0]], 2.4, 0, hex('#bfae8c'));
    }
    for (const ww of this.data.waterways) {
      const pts = ring(ww[1]);
      banks.ribbon(pts, ww[0] / 10 + 2, 0, hex('#bfae8c'));
      water.ribbon(pts, ww[0] / 10, 0, null);
    }
    this._addFlat(banks, this.mats.flat, -17);
    this._addFlat(water, this.mats.water, -16);
  }

  _addFlat(builder, mat, order) {
    if (!builder.count) return null;
    const mesh = new THREE.Mesh(builder.geometry(), mat);
    mesh.renderOrder = order;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- roads

  _roads() {
    const walks = new GeoBuilder();
    const ground = new GeoBuilder();
    const paint = new GeoBuilder();
    const decks = new GeoBuilder({ bld: true });
    const white = hex('#f4f1ea'), yellow = hex('#f2c94c'), walkCol = hex('#d4cbbb'), kerb = hex('#ece6da');
    for (const rd of this.roads) {
      const col = ROAD_COL[rd.code] || ROAD_COL[R.residential];
      if (rd.bridge && rd.heights && rd.code < R.footway) {
        this._deck(decks, rd, col);
        continue;
      }
      const major = rd.code <= R.link;
      if (major) {
        walks.ribbon(rd.pts, rd.w + 4.4, 0, kerb, true);
        walks.ribbon(rd.pts, rd.w + 3.6, 0, walkCol, true);
      }
      ground.ribbon(rd.pts, rd.w, 0, col, true);
      if (rd.code <= R.tertiary && rd.w >= 8) this._markings(paint, rd, rd.oneway ? white : yellow, white);
    }
    this._zebras(paint, white);
    this._addFlat(walks, this.mats.road, -15);
    this._addFlat(ground, this.mats.road, -14);
    this._addFlat(paint, this.mats.paint, -13);
    if (decks.count) {
      const m = new THREE.Mesh(decks.geometry(), this.mats.props);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
  }

  // Zebra crossings across the bigger roads where they meet another street.
  _zebras(b, white) {
    const key = (p) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
    const at = new Map();
    for (const rd of this.roads) {
      if (rd.bridge || rd.code > R.residential) continue;
      for (const p of rd.pts) { const k = key(p); const l = at.get(k) || []; if (!l.includes(rd)) l.push(rd); at.set(k, l); }
    }
    let n = 0;
    for (const rd of this.roads) {
      if (rd.bridge || rd.code > R.tertiary || rd.w < 7) continue;
      const pts = rd.pts;
      for (let i = 0; i < pts.length && n < 260; i++) {
        const others = (at.get(key(pts[i])) || []).filter((o) => o !== rd);
        if (!others.length) continue;
        const across = Math.max(...others.map((o) => o.w)) / 2 + 2.2;
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= pts.length) continue;
          const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], L = Math.hypot(dx, dz);
          if (L < across + 4) continue;
          const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
          const cx = pts[i][0] + ux * across, cz = pts[i][1] + uz * across;
          const half = rd.w / 2 - 0.4;
          for (let s = -half + 0.3; s <= half - 0.2; s += 0.95) {
            const sx = cx + nx * s, sz = cz + nz * s;
            b.ribbon([[sx, sz], [sx + ux * 2.6, sz + uz * 2.6]], 0.5, 0, white);
          }
          n++;
        }
      }
    }
    this.zebraCount = n;
  }

  // Dashed centre line (and lane lines on wide one-ways), kept clear of junctions.
  _markings(b, rd, centre, lane) {
    const pts = rd.pts;
    let total = 0;
    const seg = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      seg.push(L); total += L;
    }
    const lanes = rd.oneway ? Math.max(1, Math.round(rd.w / 3.4)) : 2;
    const offsets = [];
    if (rd.oneway) for (let k = 1; k < lanes; k++) offsets.push(-rd.w / 2 + (rd.w * k) / lanes);
    else offsets.push(0);
    const dash = 3, gap = 4.5;
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = seg[i];
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let t = Math.ceil(s / (dash + gap)) * (dash + gap) - s; t + dash < L; t += dash + gap) {
        const g = s + t;
        if (g < 9 || g > total - 9) continue;
        for (const o of offsets) {
          const ox = -dz * o, oz = dx * o;
          const p0 = [ax + dx * t + ox, az + dz * t + oz], p1 = [ax + dx * (t + dash) + ox, az + dz * (t + dash) + oz];
          b.ribbon([p0, p1], o === 0 && !rd.oneway ? 0.22 : 0.16, 0, o === 0 && !rd.oneway ? centre : lane);
        }
      }
      s += L;
    }
  }

  // Flyover: deck following the height profile, parapets and pillars.
  _deck(b, rd, col) {
    const pts = rd.pts, H = rd.heights, hw = rd.w / 2;
    const conc = hex('#d9d2c6'), shade = hex('#bdb5a8');
    const style = [0, 0, 0, 70];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      const ha = H[i], hb = H[i + 1];
      const v = (x, y, z, n, c) => b.vert(x, y, z, n[0], n[1], n[2], c, style);
      // top
      const t0 = v(ax + nx * hw, ha + 0.05, az + nz * hw, [0, 1, 0], col), t1 = v(ax - nx * hw, ha + 0.05, az - nz * hw, [0, 1, 0], col);
      const t2 = v(bx - nx * hw, hb + 0.05, bz - nz * hw, [0, 1, 0], col), t3 = v(bx + nx * hw, hb + 0.05, bz + nz * hw, [0, 1, 0], col);
      b.quad(t0, t1, t2, t3, 0, 1, 0);
      if (Math.max(ha, hb) < 0.6) continue;
      // girder sides and underside
      for (const sgn of [1, -1]) {
        const ex = nx * hw * sgn, ez = nz * hw * sgn;
        const n = [nx * sgn, 0, nz * sgn];
        const s0 = v(ax + ex, ha + 1.0, az + ez, n, conc), s1 = v(bx + ex, hb + 1.0, bz + ez, n, conc);
        const s2 = v(bx + ex, Math.max(0, hb - 1.4), bz + ez, n, shade), s3 = v(ax + ex, Math.max(0, ha - 1.4), az + ez, n, shade);
        b.quad(s0, s1, s2, s3, ...n);
      }
      const u0 = v(ax + nx * hw, Math.max(0, ha - 1.4), az + nz * hw, [0, -1, 0], shade), u1 = v(ax - nx * hw, Math.max(0, ha - 1.4), az - nz * hw, [0, -1, 0], shade);
      const u2 = v(bx - nx * hw, Math.max(0, hb - 1.4), bz - nz * hw, [0, -1, 0], shade), u3 = v(bx + nx * hw, Math.max(0, hb - 1.4), bz + nz * hw, [0, -1, 0], shade);
      b.quad(u0, u1, u2, u3, 0, -1, 0);
      // pillars every ~30 m where the deck is high
      for (let s = 15; s < L; s += 30) {
        const t = s / L, h = ha + (hb - ha) * t;
        if (h < 4) continue;
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        b.box(px, (h - 1.4) / 2, pz, 1.6, h - 1.4, Math.min(rd.w * 0.6, 4), Math.atan2(bx - ax, bz - az), conc, style);
        this.pillars = this.pillars || [];
        this.pillars.push([px, pz, 1.4]);
      }
    }
  }

  // ---------------------------------------------------------------- buildings

  _buildings() {
    const tiles = new Map();
    const { x0, z0 } = this.bounds;
    const tileOf = (x, z) => `${Math.floor((x - x0) / TILE)},${Math.floor((z - z0) / TILE)}`;
    const getB = (k) => { if (!tiles.has(k)) tiles.set(k, new GeoBuilder({ bld: true })); return tiles.get(k); };
    const poiShops = this._poiIndex();
    for (let bi = 0; bi < this.buildings.length; bi++) {
      const b = this.buildings[bi];
      const seed = Math.floor(b.c[0] * 13.1) * 7919 + Math.floor(b.c[1] * 7.3);
      const r = rng(seed);
      let style = b.kind;
      // plain buildings with shops inside or fronting a busy road get shopfronts
      if (style === 0 && (poiShops(b) || (this._nearMajorRoad(b) && r() < 0.75))) style = 1;
      if (style === 1 && b.h > 34) style = 3;
      const palName = style === 1 ? 'shop' : KIND_PAL[style] || 'res';
      const pal = PAL[palName];
      let col = pal[Math.floor(r() * pal.length)];
      if (b.rs) { if (b.rs.color) col = hex(b.rs.color); if (b.rs.style != null) style = b.rs.style; }
      const g = getB(tileOf(b.c[0], b.c[1]));
      this._extrude(g, b, col, style, r, Math.floor(r() * 10));
      if (b.h < 30 && style <= 1 && b.area > 35 && b.area < 900 && !b.base) this._roofProps(g, b, r);
    }
    for (const [k, g] of tiles) {
      const mesh = new THREE.Mesh(g.geometry(), this.mats.building);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const [tx, tz] = k.split(',').map(Number);
      this.chunks.push({ mesh, cx: x0 + (tx + 0.5) * TILE, cz: z0 + (tz + 0.5) * TILE });
      this.group.add(mesh);
    }
    this._lamps();
  }

  _extrude(g, b, col, style, r, variant = 0) {
    const H = Math.max(b.h, b.base + 2.5), base = b.base;
    const sv = style * 10 + variant;
    const spacing = style === 3 ? 1.6 : 2.6;
    let roofCol = style === 3 ? hex('#9fb2b8') : style === 0 && r() < 0.15 ? PAL.terracotta : PAL.roof[Math.floor(r() * PAL.roof.length)];
    if (b.rs?.roof) roofCol = hex(b.rs.roof);
    // flat-roofed homes and shops get a parapet: the classic Bengaluru terrace
    const para = (style <= 2 || style === 4) && b.area < 4000 && !b.holes.length ? 0.9 : 0;
    const top = H + para;
    const walls = (pts, inward, y0, y1, c, st, sp) => {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i], d = pts[(i + 1) % n];
        const dx = d[0] - a[0], dz = d[1] - a[1];
        const L = Math.hypot(dx, dz);
        if (L < 0.05) continue;
        let nx = dz / L, nz = -dx / L;
        if (inward) { nx = -nx; nz = -nz; }
        const u0 = -L / 2 + sp / 2, u1 = L / 2 + sp / 2;
        const v0 = g.vert(a[0], y0, a[1], nx, 0, nz, c, [u0, y0, H, st]);
        const v1 = g.vert(d[0], y0, d[1], nx, 0, nz, c, [u1, y0, H, st]);
        const v2 = g.vert(d[0], y1, d[1], nx, 0, nz, c, [u1, y1, H, st]);
        const v3 = g.vert(a[0], y1, a[1], nx, 0, nz, c, [u0, y1, H, st]);
        g.quad(v0, v1, v2, v3, nx, 0, nz);
      }
    };
    walls(b.r, false, base, top, col, sv, spacing);
    for (const h of b.holes) walls(h, true, base, H, col, sv, spacing);
    if (para) {
      const inner = insetRing(b.r, 0.28);
      if (inner) {
        walls(inner, true, H, top, col, 70, spacing);
        // cap strip between outer and inner rings
        for (let i = 0; i < b.r.length; i++) {
          const j = (i + 1) % b.r.length;
          const a = g.vert(b.r[i][0], top, b.r[i][1], 0, 1, 0, col, [0, top, H, 70]);
          const c2 = g.vert(b.r[j][0], top, b.r[j][1], 0, 1, 0, col, [0, top, H, 70]);
          const d = g.vert(inner[j][0], top, inner[j][1], 0, 1, 0, col, [0, top, H, 70]);
          const e = g.vert(inner[i][0], top, inner[i][1], 0, 1, 0, col, [0, top, H, 70]);
          g.quad(a, c2, d, e, 0, 1, 0);
        }
        try { g.flat(inner, [], H, roofCol, [0, H, H, sv]); } catch {}
      } else {
        try { g.flat(b.r, [], top, roofCol, [0, top, H, sv]); } catch {}
      }
    } else {
      try { g.flat(b.r, b.holes, H, roofCol, [0, H, H, sv]); } catch {}
    }
    if (base > 1.5) {
      // floating part (tower on a podium, canopy): close the underside
      const faces = THREE.ShapeUtils.triangulateShape(b.r.map((p) => new THREE.Vector2(p[0], p[1])), []);
      const s = g.count;
      for (const p of b.r) g.vert(p[0], base, p[1], 0, -1, 0, roofCol, [0, base, H, 70]);
      for (const f of faces) g.tri(s + f[0], s + f[1], s + f[2], 0, -1, 0);
    }
  }

  // Black Sintex water tanks and stair head-rooms: the true Bengaluru skyline.
  _roofProps(g, b, r) {
    const H = b.h;
    const tank = hex('#2c2c31'), cabin = PAL.res[Math.floor(r() * PAL.res.length)];
    const pick = () => {
      for (let k = 0; k < 8; k++) {
        const x = b.minx + 1.2 + r() * Math.max(0.1, b.maxx - b.minx - 2.4);
        const z = b.minz + 1.2 + r() * Math.max(0.1, b.maxz - b.minz - 2.4);
        if (pointInRing(x, z, b.r) && pointInRing(x + 1, z, b.r) && pointInRing(x - 1, z, b.r) && pointInRing(x, z + 1, b.r) && pointInRing(x, z - 1, b.r)) return [x, z];
      }
      return null;
    };
    if (r() < 0.55 && b.area > 60) {
      const p = pick();
      if (p) g.box(p[0], H + 1.25, p[1], 2.6, 2.5, 2.4, r() * 3, cabin, [0, 1, 2.5, 70]);
    }
    const tanks = r() < 0.8 ? (r() < 0.3 ? 2 : 1) : 0;
    for (let i = 0; i < tanks; i++) {
      const p = pick();
      if (!p) continue;
      this._cylinder(g, p[0], H, p[1], 0.62, 1.25, tank, 8);
      // a little lid ring
      this._cylinder(g, p[0], H + 1.25, p[1], 0.3, 0.12, tank, 6);
    }
  }

  _cylinder(g, x, y, z, rad, h, col, seg) {
    const st = [0, 0, 0, 70];
    const s = g.count;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      g.vert(x + cx * rad, y, z + cz * rad, cx, 0, cz, col, st);
      g.vert(x + cx * rad, y + h, z + cz * rad, cx, 0, cz, col, st);
    }
    for (let i = 0; i < seg; i++) { const a = s + i * 2; g.quad(a, a + 2, a + 3, a + 1, Math.cos(((i + 0.5) / seg) * Math.PI * 2), 0, Math.sin(((i + 0.5) / seg) * Math.PI * 2)); }
    const top = g.vert(x, y + h, z, 0, 1, 0, col, st);
    const s2 = g.count;
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; g.vert(x + Math.cos(a) * rad, y + h, z + Math.sin(a) * rad, 0, 1, 0, col, st); }
    for (let i = 0; i < seg; i++) g.tri(top, s2 + i, s2 + ((i + 1) % seg), 0, 1, 0);
  }

  _poiIndex() {
    const grid = new Grid(20);
    const cats = this.data.poiCats;
    const shopCats = new Set(['food', 'cafe', 'pub', 'shop', 'bank', 'hotel'].map((c) => cats.indexOf(c)));
    for (const p of this.data.pois) if (shopCats.has(p[2])) grid.insert([p[0] / 10, p[1] / 10], p[0] / 10, p[1] / 10, p[0] / 10, p[1] / 10);
    const tmp = [];
    return (b) => grid.query(b.minx - 4, b.minz - 4, b.maxx + 4, b.maxz + 4, tmp).some((p) => pointInRing(p[0], p[1], b.r) || (p[0] > b.minx - 4 && p[0] < b.maxx + 4 && p[1] > b.minz - 4 && p[1] < b.maxz + 4));
  }

  _nearMajorRoad(b) {
    const tmp = [];
    for (const s of this.rGrid.query(b.minx - 10, b.minz - 10, b.maxx + 10, b.maxz + 10, tmp)) {
      if (s.road.code > R.tertiary || s.road.bridge) continue;
      const [, , , d2] = closestOnSeg(b.c[0], b.c[1], s.ax, s.az, s.bx, s.bz);
      const reach = s.road.w / 2 + Math.sqrt(b.area) * 0.7 + 4;
      if (d2 < reach * reach) return true;
    }
    return false;
  }

  // Street lamps along main roads: poles with heads that glow at night (style 10 in the shader).
  _lamps() {
    this.lampPos = [];
    const g = new GeoBuilder({ bld: true });
    const pole = hex('#5d6670'), head = hex('#fff1c9');
    const tmp = [];
    for (const rd of this.roads) {
      if (rd.code > R.tertiary || rd.bridge) continue;
      const pts = rd.pts;
      let carry = 10;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / L, dz = (bz - az) / L;
        for (let s = carry; s < L; s += 34) {
          for (const side of [1, -1]) {
            const off = rd.w / 2 + 0.9;
            const x = ax + dx * s - dz * off * side, z = az + dz * s + dx * off * side;
            if (this.buildingAt(x, z, tmp)) continue;
            g.box(x, 3.6, z, 0.18, 7.2, 0.18, 0, pole, [0, 0, 0, 70]);
            g.box(x + dz * side * 0.9, 7.15, z - dx * side * 0.9, 0.5, 0.18, 1.9, Math.atan2(dx, dz), pole, [0, 0, 0, 70]);
            g.box(x + dz * side * 1.5, 7.0, z - dx * side * 1.5, 0.42, 0.14, 0.7, Math.atan2(dx, dz), head, [0, 0, 0, 100]);
            this.lampPos.push([x + dz * side * 1.5, z - dx * side * 1.5]);
          }
          carry = s + 34 - L;
        }
        if (carry < 0) carry = 0;
      }
    }
    if (g.count) {
      const m = new THREE.Mesh(g.geometry(), this.mats.props);
      m.castShadow = true;
      this.group.add(m);
    }
    this._lightPools();
  }

  // Warm pools of lamplight on the ground that fade in after dusk (additive, alpha left alone).
  _lightPools() {
    const n = this.lampPos.length;
    if (!n) return;
    const geo = new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uNight: Look.uNight },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uNight; varying vec2 vUv; void main() { float r = length(vUv - 0.5) * 2.0; float k = (1.0 - smoothstep(0.0, 1.0, r)); gl_FragColor = vec4(vec3(1.0, 0.78, 0.45) * k * k * 0.42 * uNight, 1.0); }',
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -8,
    });
    const m = new THREE.InstancedMesh(geo, mat, n);
    const d = new THREE.Object3D();
    this.lampPos.forEach(([x, z], i) => { d.position.set(x, 0.02, z); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.renderOrder = -11;
    m.frustumCulled = false;
    this.pools = m;
    this.group.add(m);
  }

  // ---------------------------------------------------------------- metro

  _rail() {
    const g = new GeoBuilder({ bld: true });
    const conc = hex('#e2dbcf'), shade = hex('#c4bcae'), purple = hex('#8e5bb5'), track = hex('#7b7470');
    this.metroLines = [];
    const st = [0, 0, 0, 70];
    let lastPillars = [];
    for (const rl of this.data.rail) {
      const [kind, , flat, metro] = rl;
      const pts = ring(flat);
      if (kind === 2) continue; // underground
      if (kind === 0 && !metro) {
        // surface railway: ballast and rails
        const b = new GeoBuilder();
        b.ribbon(pts, 4.2, 0, hex('#b9aea0'));
        this._addFlat(b, this.mats.road, -12);
        continue;
      }
      const H = kind === 3 ? 9 : 11;
      this.metroLines.push({ pts, H, construction: kind === 3 });
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.1) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L, hw = 2.7;
        const v = (x, y, z, n, c) => g.vert(x, y, z, n[0], n[1], n[2], c, st);
        // U-girder deck
        const t = [v(ax + nx * hw, H, az + nz * hw, [0, 1, 0], track), v(ax - nx * hw, H, az - nz * hw, [0, 1, 0], track), v(bx - nx * hw, H, bz - nz * hw, [0, 1, 0], track), v(bx + nx * hw, H, bz + nz * hw, [0, 1, 0], track)];
        g.quad(t[0], t[1], t[2], t[3], 0, 1, 0);
        for (const sgn of [1, -1]) {
          const ex = nx * hw * sgn, ez = nz * hw * sgn, n = [nx * sgn, 0, nz * sgn];
          const s = [v(ax + ex, H + 1.3, az + ez, n, conc), v(bx + ex, H + 1.3, bz + ez, n, conc), v(bx + ex, H - 1.6, bz + ez, n, shade), v(ax + ex, H - 1.6, az + ez, n, shade)];
          g.quad(s[0], s[1], s[2], s[3], ...n);
          // purple stripe — Namma Metro livery on the girder
          if (kind !== 3) {
            const p = [v(ax + ex * 1.01, H + 0.2, az + ez * 1.01, n, purple), v(bx + ex * 1.01, H + 0.2, bz + ez * 1.01, n, purple), v(bx + ex * 1.01, H - 0.2, bz + ez * 1.01, n, purple), v(ax + ex * 1.01, H - 0.2, az + ez * 1.01, n, purple)];
            g.quad(p[0], p[1], p[2], p[3], ...n);
          }
        }
        const u = [v(ax + nx * hw, H - 1.6, az + nz * hw, [0, -1, 0], shade), v(ax - nx * hw, H - 1.6, az - nz * hw, [0, -1, 0], shade), v(bx - nx * hw, H - 1.6, bz - nz * hw, [0, -1, 0], shade), v(bx + nx * hw, H - 1.6, bz + nz * hw, [0, -1, 0], shade)];
        g.quad(u[0], u[1], u[2], u[3], 0, -1, 0);
        // T-shaped piers (skip if the twin track already has one close by)
        for (let s = 12; s < L; s += 28) {
          const px = ax + ((bx - ax) * s) / L, pz = az + ((bz - az) * s) / L;
          if (lastPillars.some((p) => (p[0] - px) ** 2 + (p[1] - pz) ** 2 < 120)) continue;
          lastPillars.push([px, pz]);
          const yaw = Math.atan2(bx - ax, bz - az);
          g.box(px, (H - 2.6) / 2, pz, 1.8, H - 2.6, 1.8, yaw, conc, st);
          g.box(px, H - 2.1, pz, 9.5, 1.0, 2.2, yaw + Math.PI / 2, conc, st);
          this.pillars = this.pillars || [];
          this.pillars.push([px, pz, 1.2]);
        }
      }
    }
    if (g.count) {
      const m = new THREE.Mesh(g.geometry(), this.mats.props);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
  }

  // ---------------------------------------------------------------- trees

  _trees() {
    const items = [];
    const R2 = rng(1234);
    const tmp = [];
    const ok = (x, z, clear = 1.2) => !this.buildingAt(x, z, tmp, clear) && !this.onRoad(x, z, 0.8) && !this.isWater(x, z);
    const add = (x, z, type) => items.push({ x, z, type, s: 0.75 + R2() * 0.6, yaw: R2() * 6.28, tint: R2() });
    for (let i = 0; i < this.data.trees.length; i += 2) {
      const x = this.data.trees[i] / 10, z = this.data.trees[i + 1] / 10;
      if (ok(x, z, 0.5)) add(x, z, R2() < 0.15 ? 2 : R2() < 0.6 ? 0 : 1);
    }
    // parks and woods
    for (const gr of this.data.greens) {
      const code = gr[0];
      const dens = [1 / 210, 1 / 70, 0, 1 / 320, 1 / 400, 1 / 260][code] || 0;
      if (!dens) continue;
      const r = ring(gr[1]);
      const holes = gr[2].map(ring);
      const a = Math.abs(polyArea(r));
      let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
      for (const p of r) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
      const n = Math.min(6000, Math.round(a * dens * this.quality.treeDensity));
      for (let k = 0, tries = 0; k < n && tries < n * 4; tries++) {
        const x = minx + R2() * (maxx - minx), z = minz + R2() * (maxz - minz);
        if (!pointInRing(x, z, r) || holes.some((h) => pointInRing(x, z, h)) || !ok(x, z)) continue;
        add(x, z, code === 1 ? (R2() < 0.7 ? 0 : 1) : R2() < 0.55 ? 0 : R2() < 0.6 ? 1 : 3);
        k++;
      }
    }
    // avenue trees along roads — Garden City
    for (const rd of this.roads) {
      if (rd.bridge || rd.code > R.service || rd.code === R.link) continue;
      const step = rd.code <= R.secondary ? 14 : 12;
      const pts = rd.pts;
      let carry = 6 + R2() * 6;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / L, dz = (bz - az) / L;
        for (let s = carry; s < L; s += step) {
          for (const side of [1, -1]) {
            if (R2() > 0.62 * this.quality.treeDensity) continue;
            const off = rd.w / 2 + (rd.code <= R.tertiary ? 2.6 : 1.4);
            const x = ax + dx * s - dz * off * side, z = az + dz * s + dx * off * side;
            if (ok(x, z, 1.0)) add(x, z, R2() < 0.1 ? 2 : R2() < 0.75 ? 0 : 1);
          }
          carry = s + step - L;
        }
        if (carry < 0) carry = 0;
      }
    }
    this.treeCount = items.length;
    this.trees = new Scatter(treeGeometries(), items, this.quality.treeRadius, this.quality.treeCap, null, treeGeometries(true));
    this.group.add(this.trees.group);
  }

  // ---------------------------------------------------------------- horizon

  // The rest of the city fading into the haze: a ring of low blocks beyond the zone edge.
  _horizon() {
    const { x0, z0, x1, z1 } = this.bounds;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const r0 = Math.hypot(x1 - x0, z1 - z0) / 2 + 150;
    const g = new GeoBuilder({ bld: true });
    const R2 = rng(99);
    for (let i = 0; i < 1400; i++) {
      const a = R2() * Math.PI * 2, d = r0 + Math.pow(R2(), 0.7) * 2600;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (x > x0 - 60 && x < x1 + 60 && z > z0 - 60 && z < z1 + 60) continue;
      const h = 8 + Math.pow(R2(), 3) * 70;
      const w = 14 + R2() * 30, dd = 14 + R2() * 30;
      const pal = h > 45 ? PAL.glass : PAL.res;
      g.box(x, h / 2, z, w, h, dd, R2() * 3, pal[Math.floor(R2() * pal.length)], [0, 0, h, h > 45 ? 30 : Math.floor(R2() * 10)]);
    }
    const m = new THREE.Mesh(g.geometry(), this.mats.building);
    this.group.add(m);
  }

  // ---------------------------------------------------------------- queries

  // Building whose footprint contains (x, z) (optionally within `pad` metres), else null.
  buildingAt(x, z, tmp = [], pad = 0) {
    for (const b of this.bGrid.query(x - pad, z - pad, x + pad, z + pad, tmp)) {
      if (x < b.minx - pad || x > b.maxx + pad || z < b.minz - pad || z > b.maxz + pad) continue;
      if (pointInRing(x, z, b.r)) return b;
      if (pad > 0) {
        for (let i = 0; i < b.r.length; i++) {
          const a = b.r[i], c = b.r[(i + 1) % b.r.length];
          if (closestOnSeg(x, z, a[0], a[1], c[0], c[1])[3] < pad * pad) return b;
        }
      }
    }
    return null;
  }

  // Ground or roof height under a point for something currently at height y.
  heightAt(x, z, y = 1e9) {
    let h = 0;
    const tmp = this._tmpH || (this._tmpH = []);
    for (const b of this.bGrid.query(x, z, x, z, tmp)) {
      if (b.h > h && b.h <= y + 0.6 && x >= b.minx && x <= b.maxx && z >= b.minz && z <= b.maxz && pointInRing(x, z, b.r)) h = b.h;
    }
    return h;
  }

  // Walkable surface under a point: ground, roofs, flyover decks and landmark platforms.
  groundAt(x, z, y = 1e9) {
    let h = this.heightAt(x, z, y);
    const tmp = this._tmpG || (this._tmpG = []);
    for (const s of this.rGrid.query(x, z, x, z, tmp)) {
      const rd = s.road;
      if (!rd.heights) continue;
      const c = closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      if (c[3] > (rd.w / 2 + 0.3) ** 2) continue;
      const dh = rd.heights[s.i] + (rd.heights[s.i + 1] - rd.heights[s.i]) * c[2] + 0.05;
      if (dh <= y + 0.7 && dh > h) h = dh;
    }
    for (const p of this.platforms || []) {
      if (p.h > h && p.h <= y + 0.7 && x > p.minx && x < p.maxx && z > p.minz && z < p.maxz && pointInRing(x, z, p.r)) h = p.h;
    }
    return h;
  }

  // Landmarks add walkable/collidable solids: a footprint ring with a height (like a building).
  addSolid(r, h, base = 0, name = null) {
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (const p of r) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
    if (polyArea(r) < 0) r = [...r].reverse();
    const rec = { kind: 4, h, base, r, c: centroid(r), name, holes: [], minx, minz, maxx, maxz, area: Math.abs(polyArea(r)), landmark: true };
    this.bGrid.insert(rec, minx, minz, maxx, maxz);
    return rec;
  }

  addPlatform(r, h) {
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (const p of r) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
    (this.platforms || (this.platforms = [])).push({ r, h, minx, minz, maxx, maxz });
  }

  onRoad(x, z, pad = 0) {
    const tmp = this._tmpR || (this._tmpR = []);
    for (const s of this.rGrid.query(x, z, x, z, tmp)) {
      if (s.road.bridge && s.road.heights) continue;
      const hw = s.road.w / 2 + pad;
      if (closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz)[3] < hw * hw) return s.road;
    }
    return null;
  }

  isWater(x, z) {
    const tmp = this._tmpW || (this._tmpW = []);
    for (const w of this.wGrid.query(x, z, x, z, tmp)) if (pointInRing(x, z, w.r) && !w.holes.some((h) => pointInRing(x, z, h))) return w;
    return null;
  }

  // Nearest named road within `max` metres: for the street-name HUD.
  streetAt(x, z, max = 40) {
    const tmp = this._tmpS || (this._tmpS = []);
    let best = null, bd = max * max;
    for (const s of this.rGrid.query(x - max, z - max, x + max, z + max, tmp)) {
      if (!s.road.name || s.road.code > R.service) continue;
      const d = closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz)[3] - (s.road.w / 2) ** 2;
      if (d < bd) { bd = d; best = s.road; }
    }
    return best;
  }

  // Push a circle (x, z, radius) at height y out of building walls and pillars. Returns [x, z, hit].
  collide(x, z, rad, y = 0) {
    const tmp = this._tmpC || (this._tmpC = []);
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.bGrid.query(x - rad, z - rad, x + rad, z + rad, tmp)) {
        if (y >= b.h - 0.05 || y + 1.7 < b.base) continue;
        if (x < b.minx - rad || x > b.maxx + rad || z < b.minz - rad || z > b.maxz + rad) continue;
        const inside = pointInRing(x, z, b.r);
        let best = null, bd = Infinity;
        for (let i = 0; i < b.r.length; i++) {
          const a = b.r[i], c = b.r[(i + 1) % b.r.length];
          const p = closestOnSeg(x, z, a[0], a[1], c[0], c[1]);
          if (p[3] < bd) { bd = p[3]; best = p; }
        }
        if (!best) continue;
        if (inside) {
          // push out through the nearest wall
          const d = Math.sqrt(bd) || 1e-6;
          const nx = (best[0] - x) / d, nz = (best[1] - z) / d;
          x = best[0] + nx * rad; z = best[1] + nz * rad; hit = true;
        } else if (bd < rad * rad) {
          const d = Math.sqrt(bd) || 1e-6;
          const nx = (x - best[0]) / d, nz = (z - best[1]) / d;
          x = best[0] + nx * rad; z = best[1] + nz * rad; hit = true;
        }
      }
    }
    if (this.pillars && y < 9) {
      for (const p of this._pillarsNear(x, z)) {
        const dx = x - p[0], dz = z - p[1], d = Math.hypot(dx, dz), m = p[2] + rad;
        if (d < m && d > 1e-6) { x = p[0] + (dx / d) * m; z = p[1] + (dz / d) * m; hit = true; }
      }
    }
    return [x, z, hit];
  }

  _pillarsNear(x, z) {
    if (!this.pGrid) {
      this.pGrid = new Grid(30);
      for (const p of this.pillars || []) this.pGrid.insert(p, p[0], p[1], p[0], p[1]);
    }
    return this.pGrid.query(x - 3, z - 3, x + 3, z + 3, this._tmpP || (this._tmpP = []));
  }

  // Hide far building tiles (fog hides them anyway) and refresh nearby trees.
  update(camPos) {
    const far = this.quality.drawDistance + TILE * 0.7;
    for (const c of this.chunks) c.mesh.visible = Math.hypot(c.cx - camPos.x, c.cz - camPos.z) < far;
    this.trees?.update(camPos);
    if (this.pools) this.pools.visible = Look.uNight.value > 0.05;
  }
}
