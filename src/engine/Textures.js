import * as THREE from '../../vendor/three.module.js';

// Procedural PBR texture sets generated on a canvas at load time: albedo (greyscale, tinted by
// the material colour), normal (derived from a height field) and roughness. No image assets.

let SIZE = 512;
export function setTextureSize(s) { SIZE = s; }

// ---------- tileable noise ----------
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const p = (a) => ((a % period) + period) % period;
  const a = hash(p(xi), p(yi), seed), b = hash(p(xi + 1), p(yi), seed);
  const c = hash(p(xi), p(yi + 1), seed), d = hash(p(xi + 1), p(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, period, seed) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, period * f, seed + i * 17); amp *= 0.5; f *= 2; }
  return s;
}

// ---------- helpers ----------
function field(fn) {
  const n = SIZE, h = new Float32Array(n * n), a = new Float32Array(n * n), r = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = fn(x / n, y / n);
    const i = y * n + x;
    h[i] = o.h; a[i] = o.a; r[i] = o.r;
  }
  return { h, a, r };
}

function toTexture(data, isColor) {
  const n = SIZE, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = data[i];
    if (Array.isArray(v)) { img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; }
    else { const b = Math.max(0, Math.min(255, v * 255)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = b; }
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (isColor) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function normalFrom(h, strength) {
  const n = SIZE, out = new Uint8ClampedArray(n * n * 4);
  const at = (x, y) => h[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * n + x) * 4;
    out[i] = (-dx / len * 0.5 + 0.5) * 255;
    out[i + 1] = (dy / len * 0.5 + 0.5) * 255;
    out[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    out[i + 3] = 255;
  }
  const c = document.createElement('canvas');
  c.width = c.height = n;
  c.getContext('2d').putImageData(new ImageData(out, n, n), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function build(fn, normalStrength = 4) {
  const f = field(fn);
  return { map: toTexture(f.a, true), normalMap: normalFrom(f.h, normalStrength), roughnessMap: toTexture(f.r, false) };
}

// ---------- recipes (u,v in 0..1, tileable) ----------
const recipes = {
  brick: () => build((u, v) => {
    const rows = 8, cols = 4;
    const ry = v * rows, row = Math.floor(ry);
    const rx = u * cols + (row % 2) * 0.5, col = Math.floor(rx);
    const fx = rx - col, fy = ry - row;
    const m = 0.06;
    const mortar = fx < m || fy < m * 2 ? 1 : 0;
    const edge = Math.min(fx, 1 - fx, fy * 2, (1 - fy) * 2);
    const tone = 0.5 + hash(col % cols, row, 3) * 0.35;
    const grit = fbm(u * 32, v * 32, 3, 32, 5);
    const grime = fbm(u * 4, v * 4, 4, 4, 9);
    const a = mortar ? 0.75 + grit * 0.15 : tone * (0.75 + grit * 0.35) * (0.7 + grime * 0.4);
    const h = mortar ? 0.1 : 0.6 + Math.min(edge * 5, 0.3) + grit * 0.15;
    return { a, h, r: mortar ? 0.95 : 0.7 + grit * 0.2 };
  }, 6),
  stone: () => build((u, v) => {
    const rows = 4, cols = 2;
    const ry = v * rows, row = Math.floor(ry);
    const rx = u * cols + (row % 2) * 0.5, col = Math.floor(rx);
    const fx = rx - col, fy = ry - row;
    const mortar = fx < 0.025 || fy < 0.05;
    const n = fbm(u * 16, v * 16, 5, 16, 21);
    const tone = 0.6 + hash(col % cols, row, 7) * 0.25;
    return { a: mortar ? 0.4 : tone * (0.7 + n * 0.5), h: mortar ? 0.0 : 0.5 + n * 0.5, r: 0.85 };
  }, 5),
  concrete: () => build((u, v) => {
    const n = fbm(u * 8, v * 8, 6, 8, 31);
    const stain = fbm(u * 2, v * 2, 3, 2, 41);
    const pits = hash(Math.floor(u * 256), Math.floor(v * 256), 4) > 0.985 ? -0.3 : 0;
    const streak = fbm(u * 24, v * 1.5, 3, 24, 51) * 0.25;
    return { a: (0.55 + n * 0.35) * (0.75 + stain * 0.35) - streak * 0.3, h: n + pits, r: 0.8 + n * 0.15 };
  }, 3),
  asphalt: () => build((u, v) => {
    const n = fbm(u * 64, v * 64, 3, 64, 61);
    const big = fbm(u * 3, v * 3, 4, 3, 71);
    const puddle = big > 0.55 ? Math.min(1, (big - 0.55) * 10) : 0;
    const speck = hash(Math.floor(u * 512), Math.floor(v * 512), 8) > 0.92 ? 0.25 : 0;
    return { a: 0.28 + n * 0.25 + speck - puddle * 0.08, h: (n + speck) * (1 - puddle), r: 0.75 - puddle * 0.65 + n * 0.1 };
  }, 4),
  cobble: () => build((u, v) => {
    // jittered-grid Voronoi stones
    const g = 10;
    const x = u * g, y = v * g;
    let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = Math.floor(x) + i, cy = Math.floor(y) + j;
      const px = cx + hash(((cx % g) + g) % g, ((cy % g) + g) % g, 1) * 0.8 + 0.1;
      const py = cy + hash(((cx % g) + g) % g, ((cy % g) + g) % g, 2) * 0.8 + 0.1;
      const d = Math.hypot(x - px, y - py);
      if (d < d1) { d2 = d1; d1 = d; id = hash(((cx % g) + g) % g, ((cy % g) + g) % g, 3); } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1;
    const gap = edge < 0.08;
    const n = fbm(u * 40, v * 40, 3, 40, 81);
    const wet = fbm(u * 3, v * 3, 3, 3, 91) > 0.5;
    return { a: gap ? 0.15 : (0.4 + id * 0.3) * (0.8 + n * 0.3), h: gap ? 0 : Math.min(1, edge * 3) * 0.8 + n * 0.2, r: gap ? 0.9 : (wet ? 0.18 : 0.45) + n * 0.15 };
  }, 7),
  wood: () => build((u, v) => {
    const planks = 6;
    const pv = u * planks, p = Math.floor(pv), f = pv - p;
    const off = hash(p, 0, 11);
    const grain = fbm(u * 6 + off * 10, (v + off) * 60, 4, 6, 13);
    const ring = Math.sin((v + off) * 40 + grain * 8) * 0.5 + 0.5;
    const gap = f < 0.03 || f > 0.97;
    const endJoint = ((v + off) % 0.5) < 0.006;
    const tone = 0.45 + off * 0.25;
    return { a: gap || endJoint ? 0.12 : tone * (0.7 + ring * 0.25 + grain * 0.2), h: gap || endJoint ? 0 : 0.6 + ring * 0.1, r: 0.6 + grain * 0.2 };
  }, 4),
  fabric: () => build((u, v) => {
    // fine twill weave + soft mottling (wear, creases)
    const w = 256;
    const tw = Math.sin((u + v) * w * Math.PI * 2) * 0.5 + 0.5;
    const n = fbm(u * 8, v * 8, 4, 8, 101);
    const crease = fbm(u * 3, v * 3, 3, 3, 105);
    return { a: 0.86 + tw * 0.03 + n * 0.08 + crease * 0.05, h: tw * 0.3 + n * 0.7, r: 0.92 + n * 0.08 };
  }, 0.8),
  leather: () => build((u, v) => {
    const n = fbm(u * 48, v * 48, 4, 48, 111);
    const c = fbm(u * 6, v * 6, 3, 6, 121);
    return { a: 0.75 + n * 0.2 + c * 0.1, h: n, r: 0.35 + n * 0.25 };
  }, 2),
  plaster: () => build((u, v) => {
    const n = fbm(u * 10, v * 10, 5, 10, 131);
    const damask = (Math.sin(u * Math.PI * 16) * Math.sin(v * Math.PI * 12) > 0.6) ? 0.1 : 0;
    return { a: 0.7 + n * 0.2 + damask, h: n * 0.6 + damask, r: 0.85 };
  }, 2),
  metal: () => build((u, v) => {
    const n = fbm(u * 2, v * 120, 3, 2, 141);
    const rust = fbm(u * 6, v * 6, 4, 6, 151);
    return { a: 0.6 + n * 0.2 - (rust > 0.62 ? 0.25 : 0), h: n * 0.3, r: 0.35 + n * 0.2 + (rust > 0.62 ? 0.4 : 0) };
  }, 1),
  skin: () => build((u, v) => {
    const pores = fbm(u * 90, v * 90, 2, 90, 161);
    const blotch = fbm(u * 5, v * 5, 3, 5, 171);
    return { a: 0.9 + blotch * 0.1, h: pores, r: 0.55 + pores * 0.2 };
  }, 0.6),
};

const cache = new Map();
export function texSet(name) {
  if (!recipes[name]) return null;
  if (!cache.has(name)) cache.set(name, recipes[name]());
  return cache.get(name);
}

// Re-project UVs in world units (box-mapping) so one material tiles evenly on any size of mesh.
export function worldUV(geo, scale = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let a, b;
    if (ax >= ay && ax >= az) { a = z; b = y; } else if (ay >= ax && ay >= az) { a = x; b = z; } else { a = x; b = y; }
    uv[i * 2] = a / scale; uv[i * 2 + 1] = b / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
