import * as THREE from 'three';
import { closestOnSeg } from './geo.js';

// Shop and restaurant boards with their real names (from OpenStreetMap), mounted on the nearest
// building wall above the shopfronts, plus big landmark signs. Text is painted into atlas
// textures, so all boards draw in a handful of calls.

const STYLE = {
  food: [['#d64b3b', '#ffe066'], ['#f2c14e', '#7a1f12'], ['#2f8f4e', '#ffffff'], ['#ffffff', '#c0262d']],
  cafe: [['#f3e5c8', '#5a3b22'], ['#5a3b22', '#f3e5c8'], ['#2b2b30', '#f2c14e']],
  pub: [['#1f2233', '#ff7ad9'], ['#2b2b30', '#8ff0ff'], ['#3a2a4a', '#ffd84a']],
  shop: [['#2f6fd1', '#ffffff'], ['#ffffff', '#2b2b30'], ['#e75a7c', '#ffffff'], ['#f07b20', '#ffffff'], ['#3fb3a6', '#ffffff'], ['#f4f1ea', '#8e5bb5']],
  bank: [['#1f4e8c', '#ffffff'], ['#ffffff', '#1f4e8c']],
  hotel: [['#6b1f2a', '#f2c14e'], ['#f4f1ea', '#6b1f2a']],
  sight: [['#6b4a2b', '#f4f1ea']],
  edu: [['#ffffff', '#1f4e8c']],
  health: [['#2f8f4e', '#ffffff'], ['#ffffff', '#d64b3b']],
  office: [['#2b2b30', '#ffffff'], ['#e2e6ea', '#2b2b30']],
};
const PLACE = ['food', 'cafe', 'pub', 'shop', 'bank', 'hotel', 'sight', 'health', 'edu', 'office'];

const SW = 384, SH = 80, ATLAS = 2048;

class Atlas {
  constructor(slotW, slotH, cls = 'Baloo 2') {
    this.c = document.createElement('canvas');
    this.c.width = ATLAS; this.c.height = ATLAS;
    this.g = this.c.getContext('2d');
    this.sw = slotW; this.sh = slotH;
    this.cols = Math.floor(ATLAS / slotW); this.rows = Math.floor(ATLAS / slotH);
    this.n = 0;
    this.font = cls;
  }
  get full() { return this.n >= this.cols * this.rows; }
  // Paint a board; returns uv rect [u0, v0, u1, v1].
  paint(text, sub, bg, fg) {
    const i = this.n++;
    const x = (i % this.cols) * this.sw, y = Math.floor(i / this.cols) * this.sh;
    const g = this.g, w = this.sw, h = this.sh;
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = fg; g.globalAlpha = 0.35; g.lineWidth = 4; g.strokeRect(x + 6, y + 6, w - 12, h - 12); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const main = sub ? h * 0.38 : h * 0.5;
    let fs = sub ? h * 0.36 : h * 0.56;
    g.font = `800 ${fs}px "${this.font}", sans-serif`;
    while (g.measureText(text).width > w - 24 && fs > 12) { fs -= 2; g.font = `800 ${fs}px "${this.font}", sans-serif`; }
    g.fillText(text, x + w / 2, y + main + 2);
    if (sub) {
      let s2 = h * 0.24;
      g.font = `700 ${s2}px "Baloo Tamma 2", "Baloo 2", sans-serif`;
      while (g.measureText(sub).width > w - 24 && s2 > 10) { s2 -= 2; g.font = `700 ${s2}px "Baloo Tamma 2", "Baloo 2", sans-serif`; }
      g.fillText(sub, x + w / 2, y + h * 0.76);
    }
    const pad = 1;
    return [(x + pad) / ATLAS, 1 - (y + h - pad) / ATLAS, (x + w - pad) / ATLAS, 1 - (y + pad) / ATLAS];
  }
  texture() {
    const t = new THREE.CanvasTexture(this.c);
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }
}

class QuadBatch {
  constructor() { this.pos = []; this.uv = []; this.nrm = []; this.idx = []; }
  // centre (x, y, z), facing yaw (normal = (sin yaw, 0, cos yaw)), size w x h
  add(x, y, z, yaw, w, h, uv) {
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    const rx = nz, rz = -nx; // right vector when looking at the board
    const b = this.pos.length / 3;
    const P = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    for (const [u, v] of P) this.pos.push(x + rx * u, y + v, z + rz * u), this.nrm.push(nx, 0, nz);
    this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

export class Signs {
  constructor(city, data, maxSigns = 420) {
    this.group = new THREE.Group();
    this.textures = [];
    this.placed = [];
    const cats = data.poiCats;
    const pois = [];
    const seen = new Map();
    for (const p of data.pois) {
      const cat = cats[p[2]];
      if (!PLACE.includes(cat) || p[3] < 0) continue;
      const name = data.names[p[3]];
      if (!name || name.length < 2) continue;
      const x = p[0] / 10, z = p[1] / 10;
      // one board per name per block
      const k = name.toLowerCase();
      if ((seen.get(k) || []).some(([a, b]) => (a - x) ** 2 + (b - z) ** 2 < 2500)) continue;
      seen.set(k, [...(seen.get(k) || []), [x, z]]);
      pois.push({ x, z, cat, name });
    }
    // food and drink first: they make streets recognisable
    const pri = { food: 0, cafe: 0, pub: 0, shop: 1, hotel: 1, bank: 2, sight: 1, health: 2, edu: 3, office: 3 };
    pois.sort((a, b) => pri[a.cat] - pri[b.cat]);

    const atlases = [];
    const batches = [];
    let cur = null, batch = null;
    const next = () => { cur = new Atlas(SW, SH); batch = new QuadBatch(); atlases.push(cur); batches.push(batch); };
    next();
    const tmp = [];
    let count = 0;
    for (const p of pois) {
      if (count >= maxSigns) break;
      const spot = this._wallSpot(city, p.x, p.z, tmp);
      if (!spot) continue;
      const len = p.name.length;
      const w = Math.min(7.5, Math.max(2.6, len * 0.36 + 1.3)), h = 0.95;
      let y = Math.min(4.0, Math.max(2.4, spot.bh - 1.0));
      // stack boards that crowd the same stretch of wall
      for (const o of this.placed) {
        if ((o.x - spot.x) ** 2 + (o.z - spot.z) ** 2 < ((o.w + w) / 2) ** 2 && Math.abs(o.yaw - spot.yaw) < 0.3 && Math.abs(o.y - y) < 1.1) y += 1.2;
      }
      if (y > spot.bh - 0.3 && spot.bh > 3.5) continue;
      if (cur.full) next();
      const pal = STYLE[p.cat] || STYLE.shop;
      const [bg, fg] = pal[(len * 7 + p.name.charCodeAt(0)) % pal.length];
      const label = p.name.length > 26 ? p.name.slice(0, 25) + '…' : p.name;
      const uv = cur.paint(label, '', bg, fg);
      batch.add(spot.x, y, spot.z, spot.yaw, w, h, uv);
      this.placed.push({ x: spot.x, y, z: spot.z, yaw: spot.yaw, w, name: p.name, cat: p.cat });
      count++;
    }
    // landmark signs: bigger slots with a second (Kannada) line
    const custom = city.customSigns || [];
    if (custom.length) {
      const ca = new Atlas(512, 128);
      const cb = new QuadBatch();
      for (const s of custom) {
        if (ca.full) break;
        const uv = ca.paint(s.text, s.sub || '', s.bg || '#2b2b30', s.fg || '#ffffff');
        cb.add(s.pos[0], s.y, s.pos[1], s.yaw, s.w, s.h, uv);
      }
      atlases.push(ca); batches.push(cb);
    }
    atlases.forEach((a, i) => {
      if (!batches[i].idx.length) return;
      const tex = a.texture();
      this.textures.push(tex);
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
      const m = batches[i].mesh(mat);
      m.renderOrder = 1;
      this.group.add(m);
    });
    this.count = count;
  }

  // Nearest building wall to a point, with the outward-facing direction.
  _wallSpot(city, x, z, tmp) {
    let best = null, bd = 18 * 18;
    for (const b of city.bGrid.query(x - 18, z - 18, x + 18, z + 18, tmp)) {
      if (b.landmark || b.h < 2.5) continue;
      const r = b.r;
      for (let i = 0; i < r.length; i++) {
        const a = r[i], c = r[(i + 1) % r.length];
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L < 2.2) continue;
        const cp = closestOnSeg(x, z, a[0], a[1], c[0], c[1]);
        // prefer walls facing a road: weight by whether the outward side is open
        if (cp[3] < bd) {
          const nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L;
          // keep the board within the wall
          const t = Math.min(Math.max(cp[2], 1.4 / L), 1 - 1.4 / L);
          const px = a[0] + (c[0] - a[0]) * t, pz = a[1] + (c[1] - a[1]) * t;
          if (city.buildingAt(px + nx * 2.5, pz + nz * 2.5, [])) continue;
          bd = cp[3];
          best = { x: px + nx * 0.12, z: pz + nz * 0.12, yaw: Math.atan2(nx, nz), bh: b.h };
        }
      }
    }
    return best;
  }

  update() {}

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    for (const t of this.textures) t.dispose();
  }
}
