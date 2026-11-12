import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../core/Toon.js';

// A person: one skinned mesh (one draw call) built from shaped parts (tapered, muscled limbs, a
// shaped torso, hands, shoes and a detailed face), with procedural animation — idle, walk, run, jump, ride, sit and emotes.

const B = { root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, uaL: 6, faL: 7, hL: 8, uaR: 9, faR: 10, hR: 11, thL: 12, shL: 13, ftL: 14, thR: 15, shR: 16, ftR: 17 };
// rest positions (world, metres) of each joint
const J = {
  root: [0, 0, 0], hips: [0, 0.94, 0], spine: [0, 1.0, 0], chest: [0, 1.22, 0], neck: [0, 1.47, 0], head: [0, 1.55, 0],
  uaL: [0.19, 1.43, 0], faL: [0.2, 1.15, 0], hL: [0.205, 0.89, 0],
  uaR: [-0.19, 1.43, 0], faR: [-0.2, 1.15, 0], hR: [-0.205, 0.89, 0],
  thL: [0.095, 0.92, 0], shL: [0.1, 0.5, 0], ftL: [0.1, 0.08, 0],
  thR: [-0.095, 0.92, 0], shR: [-0.1, 0.5, 0], ftR: [-0.1, 0.08, 0],
};
const PARENT = { hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', uaL: 'chest', faL: 'uaL', hL: 'faL', uaR: 'chest', faR: 'uaR', hR: 'faR', thL: 'hips', shL: 'thL', ftL: 'shL', thR: 'hips', shR: 'thR', ftR: 'shR' };

export const SKINS = ['#8d5a3b', '#a8714c', '#c08a62', '#d7a47c', '#e7bf9a', '#6e4630'];
export const HAIRS = ['curly', 'short', 'long', 'bun', 'ponytail', 'bald', 'spiky'];
export const SHIRT_COLS = ['#f07b5a', '#5aa9e6', '#f2c14e', '#7dc47c', '#b388eb', '#ffffff', '#2f3a4a', '#e75a7c', '#3fb3a6', '#f4a259'];

// Builds part geometry: positioned in rest pose, coloured, bound to one bone.
function part(geo, bone, color, pos, rot, scale) {
  if (scale) geo.scale(...scale);
  if (rot) geo.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  geo.translate(...pos);
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    si[i * 4] = B[bone]; sw[i * 4] = 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

const cap = (r, len, rs = 8) => new THREE.CapsuleGeometry(r, len, 3, rs);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 10, hs = 8, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest);
const cyl = (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r0, r1, h, s);
const mid = (a, b) => [(J[a][0] + J[b][0]) / 2, (J[a][1] + J[b][1]) / 2, (J[a][2] + J[b][2]) / 2];

// A limb or torso segment: a lathe that tapers from rTop to rBottom over len, bulging a little in the
// middle (muscle), with rounded ends (or open ends for clothing hems).
function taper(rTop, rBot, len, seg = 12, bulge = 0, open = false) {
  const pts = [], h = len / 2;
  if (!open) for (let i = 0; i <= 2; i++) { const a = -Math.PI / 2 + (i / 2) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * rBot), -h + Math.sin(a) * rBot)); }
  for (let i = open ? 0 : 1; i < 5; i++) { const t = i / 4; const r = (rBot + (rTop - rBot) * t) * (1 + bulge * Math.sin(Math.PI * t) * 0.25); pts.push(new THREE.Vector2(r, -h + len * t)); }
  if (!open) for (let i = 1; i <= 2; i++) { const a = (i / 2) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * rTop), h + Math.sin(a) * rTop)); }
  const g = new THREE.LatheGeometry(pts, Math.min(seg, 10));
  g.computeVertexNormals();
  return g;
}

export function randomLook(seed = Math.random() * 1e9) {
  let s = Math.floor(seed) % 2147483647 || 1;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pick = (a) => a[Math.floor(r() * a.length)];
  return {
    skin: pick(SKINS), hair: pick(['#1d1a1c', '#2b211d', '#3a2a22', '#1d1a1c', '#6b6b6b']), hairStyle: pick(HAIRS.slice(0, 6)),
    shirt: pick(SHIRT_COLS), shirtStyle: pick(['tee', 'shirt', 'kurta', 'tee']), pants: pick(['#e9e0cc', '#3b4a63', '#2f2f35', '#6b5844', '#9fb4c8']),
    shoes: pick(['#5a4636', '#2a2a2a', '#eeeeee', '#8a5a3c']), height: 0.94 + r() * 0.12, build: 0.92 + r() * 0.2, extras: [],
  };
}

export const PLAYER_LOOK = {
  skin: '#a8714c', hair: '#1d1a1c', hairStyle: 'curly', shirt: '#f07b5a', shirtStyle: 'shirt', pants: '#ece3cf', shoes: '#7a5a42',
  height: 1, build: 1, extras: ['satchel'],
};

function buildGeometry(look) {
  const L = { ...PLAYER_LOOK, ...look };
  const P = [];
  const skin = L.skin, shirt = L.shirt, pants = L.pants;
  const longShirt = L.shirtStyle === 'kurta' || L.shirtStyle === 'uniform';
  const bw = L.build;
  // ---------------------------------------------------------------- body
  // Realistic proportions: tapered limbs with muscle, a shaped torso, hands with a thumb, proper shoes,
  // and a face with eyes, brows, nose, lips and ears.
  const dark = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
  const L2 = (a, b) => Math.hypot(J[b][0] - J[a][0], J[b][1] - J[a][1]);
  // pelvis / hips
  P.push(part(taper(0.15 * bw, 0.155 * bw, 0.12, 14, 0.1), 'hips', pants, [0, 0.93, 0], null, [1.05, 1, 0.66]));
  P.push(part(cyl(0.158 * bw, 0.158 * bw, 0.035, 14), 'hips', L.shoes === '#eeeeee' ? '#3a2f2c' : dark(pants, 0.45), [0, 1.0, 0], null, [1.05, 1, 0.67]));   // belt
  // legs: thigh, knee, calf, ankle
  for (const s of ['L', 'R']) {
    const th = 'th' + s, sh = 'sh' + s, ft = 'ft' + s;
    P.push(part(taper(0.088 * bw, 0.064, L2(th, sh), 12, 0.25), th, pants, mid(th, sh)));
    P.push(part(sph(0.066, 10, 8), sh, pants, [J[sh][0], J[sh][1] + 0.01, 0.005]));
    P.push(part(taper(0.064, 0.045, L2(sh, ft) - 0.02, 12, 0.35), sh, pants, mid(sh, ft)));
    // shoe: a sole, a rounded upper and a toe cap
    const fx = J[ft][0];
    P.push(part(box(0.105, 0.025, 0.27), ft, dark(L.shoes, 0.55), [fx, 0.013, 0.04]));
    P.push(part(sph(0.07, 12, 8), ft, L.shoes, [fx, 0.06, -0.02], null, [0.75, 0.62, 1.15]));
    P.push(part(sph(0.06, 12, 8), ft, L.shoes, [fx, 0.05, 0.1], null, [0.85, 0.6, 1.1]));
  }
  // torso: abdomen (spine) + rib cage and shoulders (chest)
  P.push(part(taper(0.152 * bw, 0.168 * bw, 0.24, 16, 0.12), 'spine', shirt, [0, 1.1, 0], null, [1, 1, 0.66]));
  P.push(part(taper(0.2 * bw, 0.172 * bw, 0.26, 16, 0.18), 'chest', shirt, [0, 1.33, 0], null, [1, 1, 0.64]));
  P.push(part(sph(0.205 * bw, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'chest', shirt, [0, 1.44, 0], null, [1, 0.42, 0.64]));
  for (const sx of [1, -1]) P.push(part(sph(0.062 * bw, 12, 8), 'chest', shirt, [sx * 0.158 * bw, 1.425, 0], null, [1.1, 0.75, 0.9]));   // shoulders
  if (longShirt) {
    // kurta / uniform: falls to the knee with a slight flare
    P.push(part(taper(0.172 * bw, 0.215 * bw, 0.34, 16, 0.0, true), 'hips', shirt, [0, 0.84, 0], null, [1, 1, 0.72]));
  } else {
    P.push(part(taper(0.168 * bw, 0.172 * bw, 0.08, 16, 0.0, true), 'hips', shirt, [0, 0.99, 0], null, [1, 1, 0.68]));
  }
  if (L.shirtStyle === 'shirt' || L.shirtStyle === 'uniform' || L.shirtStyle === 'kurta') {
    const collar = L.shirtStyle === 'shirt' ? '#ffffff' : shirt;
    P.push(part(cyl(0.062, 0.075, 0.045, 12, true), 'chest', L.shirtStyle === 'kurta' ? dark(shirt, 0.85) : collar === '#ffffff' ? shirt : shirt, [0, 1.485, 0.005]));
    P.push(part(box(0.018, L.shirtStyle === 'kurta' ? 0.16 : 0.34, 0.01), 'chest', dark(shirt, 0.78), [0, L.shirtStyle === 'kurta' ? 1.4 : 1.29, 0.13]));
    for (let i = 0; i < (L.shirtStyle === 'kurta' ? 3 : 5); i++) P.push(part(sph(0.007, 5, 4), 'chest', '#efe8d8', [0.0, 1.45 - i * 0.065, 0.137]));
    if (L.shirtStyle === 'uniform') for (const sx of [1, -1]) P.push(part(box(0.07, 0.07, 0.012), 'chest', dark(shirt, 0.88), [sx * 0.085, 1.35, 0.128]));
  }
  // neck and head
  P.push(part(taper(0.052, 0.058, 0.09, 10, 0.1), 'neck', skin, [0, 1.515, 0]));
  P.push(part(sph(0.104, 14, 10), 'head', skin, [0, 1.695, -0.008], null, [0.94, 1.1, 1.05]));    // skull
  P.push(part(sph(0.078, 14, 10), 'head', skin, [0, 1.625, 0.03], null, [0.95, 0.9, 1.0]));       // jaw and chin
  P.push(part(sph(0.03, 8, 6), 'head', skin, [0, 1.6, 0.075], null, [1.2, 0.9, 0.9]));            // chin
  const skinDark = dark(skin, 0.82);
  // nose: bridge and tip
  P.push(part(box(0.022, 0.05, 0.03), 'head', skin, [0, 1.675, 0.103], [-0.25, 0, 0]));
  P.push(part(sph(0.017, 8, 6), 'head', skin, [0, 1.652, 0.116], null, [1.15, 0.9, 1]));
  // eyes: whites, irises, lids; brows
  for (const sx of [1, -1]) {
    P.push(part(sph(0.017, 10, 8), 'head', '#f1ebe2', [sx * 0.037, 1.698, 0.091], null, [1.1, 0.75, 0.6]));
    P.push(part(sph(0.0095, 8, 6), 'head', '#2b1a12', [sx * 0.037, 1.698, 0.1]));
    P.push(part(box(0.038, 0.007, 0.012), 'head', skinDark, [sx * 0.037, 1.711, 0.098]));
    P.push(part(box(0.042, 0.009, 0.01), 'head', dark(L.hair, 1.0), [sx * 0.039, 1.724, 0.1], [0, 0, sx * -0.12]));
    // ears
    P.push(part(sph(0.026, 8, 6), 'head', skin, [sx * 0.1, 1.69, -0.005], null, [0.4, 1, 0.75]));
  }
  // mouth
  P.push(part(box(0.044, 0.008, 0.012), 'head', dark(skin, 0.6), [0, 1.622, 0.104]));
  P.push(part(sph(0.022, 8, 6), 'head', dark(skin, 0.78), [0, 1.613, 0.098], null, [1.2, 0.35, 0.5]));
  const hair = L.hair;
  const hairCap = (y = 1.705, sx = 0.98, sy = 1.08, sz = 1.1, theta = 0.52) => part(sph(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * theta), 'head', hair, [0, y, -0.012], [-0.42, 0, 0], [sx, sy, sz]);
  const back = (len = 0.08) => part(sph(0.105, 14, 8, 0, Math.PI, 0, Math.PI * 0.6), 'head', hair, [0, 1.69 - len * 0.3, -0.03], [0, Math.PI, 0], [1.0, 1.0 + len, 1.05]);
  switch (L.hairStyle) {
    case 'curly':
      P.push(hairCap(1.71, 1.0, 1.1, 1.12, 0.55));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, rr = 0.085 + (i % 3) * 0.006;
        P.push(part(sph(0.034, 7, 6), 'head', hair, [Math.cos(a) * rr, 1.77 + Math.sin(i * 2.3) * 0.012, Math.sin(a) * rr - 0.015]));
      }
      P.push(back(0.02));
      break;
    case 'short':
      P.push(hairCap()); P.push(back(0.02));
      for (const sx of [1, -1]) P.push(part(box(0.012, 0.035, 0.03), 'head', hair, [sx * 0.098, 1.685, 0.025]));   // sideburns
      break;
    case 'spiky':
      P.push(hairCap(1.712, 0.98, 1.12, 1.1)); P.push(back(0.02));
      for (let i = 0; i < 7; i++) P.push(part(new THREE.ConeGeometry(0.026, 0.075, 5), 'head', hair, [(i - 3) * 0.028, 1.81 - Math.abs(i - 3) * 0.008, 0.03 - Math.abs(i - 3) * 0.018], [-0.35, 0, (i - 3) * 0.18]));
      break;
    case 'long':
      P.push(hairCap(1.708, 1.02, 1.1, 1.12, 0.56));
      P.push(part(sph(0.12, 14, 10), 'head', hair, [0, 1.56, -0.075], null, [1.05, 1.55, 0.55]));
      for (const sx of [1, -1]) P.push(part(sph(0.05, 8, 6), 'head', hair, [sx * 0.095, 1.6, 0.0], null, [0.5, 2.0, 0.8]));
      break;
    case 'bun':
      P.push(hairCap(1.706, 0.98, 1.08, 1.1, 0.56)); P.push(back(0.04));
      P.push(part(sph(0.055, 12, 10), 'head', hair, [0, 1.72, -0.135]));
      break;
    case 'ponytail':
      P.push(hairCap(1.706, 0.98, 1.08, 1.1, 0.56)); P.push(back(0.04));
      P.push(part(taper(0.035, 0.02, 0.2, 8, 0.2), 'head', hair, [0, 1.6, -0.15], [0.35, 0, 0]));
      break;
    default:
      break;
  }
  // arms: deltoid, upper arm, elbow, forearm, hand with a thumb; sleeves by shirt style
  const longSleeve = L.shirtStyle !== 'tee';
  for (const s of ['L', 'R']) {
    const ua = 'ua' + s, fa = 'fa' + s, h = 'h' + s, sx = s === 'L' ? 1 : -1;
    P.push(part(taper(0.054 * bw, 0.044, L2(ua, fa), 12, 0.3), ua, longSleeve ? shirt : skin, mid(ua, fa)));
    if (!longSleeve) P.push(part(taper(0.062 * bw, 0.056 * bw, 0.11, 12, 0, true), ua, shirt, [J[ua][0], J[ua][1] - 0.06, 0]));
    P.push(part(sph(0.044, 8, 6), fa, longSleeve ? shirt : skin, [J[fa][0], J[fa][1], 0]));
    P.push(part(taper(0.043, 0.032, L2(fa, h) - 0.01, 12, 0.3), fa, longSleeve ? shirt : skin, mid(fa, h)));
    if (longSleeve) P.push(part(cyl(0.036, 0.036, 0.025, 10), fa, dark(shirt, 0.85), [J[h][0], J[h][1] + 0.02, 0]));
    // hand: palm, fingers, thumb
    P.push(part(box(0.035, 0.075, 0.07), h, skin, [J[h][0], J[h][1] - 0.04, 0.005], null));
    P.push(part(box(0.03, 0.06, 0.062), h, skin, [J[h][0] - sx * 0.002, J[h][1] - 0.105, 0.008]));
    P.push(part(taper(0.011, 0.009, 0.045, 6, 0.3), h, skin, [J[h][0] - sx * 0.006, J[h][1] - 0.045, 0.045], [-0.5, 0, 0]));
  }
  // extras
  const ex = new Set(L.extras || []);
  if (ex.has('mustache') || ex.has('beard')) P.push(part(box(0.09, 0.02, 0.02), 'head', hair, [0, 1.635, 0.112]));
  if (ex.has('beard')) P.push(part(sph(0.1, 8, 6), 'head', hair, [0, 1.6, 0.04], null, [0.95, 0.6, 0.75]));
  if (ex.has('glasses')) {
    P.push(part(box(0.2, 0.012, 0.01), 'head', '#1b1718', [0, 1.71, 0.112]));
    P.push(part(box(0.06, 0.045, 0.008), 'head', '#bcd6e0', [0.045, 1.7, 0.115]));
    P.push(part(box(0.06, 0.045, 0.008), 'head', '#bcd6e0', [-0.045, 1.7, 0.115]));
  }
  if (ex.has('bindi')) P.push(part(sph(0.009, 5, 4), 'head', '#c0262d', [0, 1.73, 0.112]));
  if (ex.has('backpack')) P.push(part(box(0.28, 0.36, 0.14), 'chest', ex.has('backpackCol') ? '#555' : '#3b4a63', [0, 1.28, -0.2]));
  if (ex.has('satchel')) {
    P.push(part(box(0.025, 0.55, 0.02), 'chest', '#6b4a35', [0.0, 1.3, 0.14], [0, 0, 0.75]));
    P.push(part(box(0.2, 0.17, 0.07), 'hips', '#c94f3a', [-0.2, 0.98, -0.02]));
  }
  if (ex.has('lanyard')) {
    P.push(part(box(0.012, 0.25, 0.01), 'chest', '#2f6fd1', [0.05, 1.36, 0.145], [0, 0, -0.2]));
    P.push(part(box(0.012, 0.25, 0.01), 'chest', '#2f6fd1', [-0.05, 1.36, 0.145], [0, 0, 0.2]));
    P.push(part(box(0.06, 0.085, 0.01), 'chest', '#ffffff', [0, 1.2, 0.16]));
  }
  if (ex.has('helmet')) P.push(part(sph(0.15, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.6), 'head', ex.has('helmetRed') ? '#d64b3b' : '#f2c14e', [0, 1.7, 0], null, [1, 1, 1.1]));
  if (ex.has('cap')) {
    P.push(part(sph(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), 'head', ex.has('capRed') ? '#d64b3b' : '#2f6fd1', [0, 1.71, 0]));
    P.push(part(box(0.15, 0.015, 0.11), 'head', ex.has('capRed') ? '#d64b3b' : '#2f6fd1', [0, 1.73, 0.13]));
  }
  if (ex.has('deliveryBox')) P.push(part(box(0.42, 0.42, 0.36), 'chest', ex.has('boxPurple') ? '#7b4bb5' : '#f07b20', [0, 1.3, -0.3]));
  if (ex.has('saree')) {
    P.push(part(cyl(0.2, 0.3, 0.86, 10), 'hips', shirt, [0, 0.5, 0], null, [1, 1, 0.85]));
    P.push(part(box(0.06, 0.62, 0.03), 'chest', new THREE.Color(shirt).offsetHSL(0.05, 0, -0.1).getHex(), [0.05, 1.22, 0.14], [0, 0, 0.62]));
  }
  if (ex.has('veshti')) P.push(part(cyl(0.18, 0.24, 0.8, 10), 'hips', '#f7f3e8', [0, 0.52, 0], null, [1, 1, 0.85]));
  if (ex.has('phone')) P.push(part(box(0.05, 0.09, 0.012), 'hR', '#22252b', [J.hR[0], J.hR[1] - 0.07, 0.03]));
  if (ex.has('jersey')) {
    P.push(part(box(0.3, 0.12, 0.01), 'chest', '#f2c14e', [0, 1.3, 0.15]));
  }
  // boutique items
  if (ex.has('shades')) {
    P.push(part(box(0.21, 0.014, 0.012), 'head', '#c9a23a', [0, 1.718, 0.113]));
    P.push(part(box(0.075, 0.05, 0.01), 'head', '#141216', [0.048, 1.7, 0.117]));
    P.push(part(box(0.075, 0.05, 0.01), 'head', '#141216', [-0.048, 1.7, 0.117]));
  }
  if (ex.has('mallige')) for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 1.9;
    P.push(part(sph(0.024, 5, 4), 'head', '#fbfaf2', [Math.sin(a) * 0.11, 1.68 - Math.abs(a) * 0.03, -Math.cos(a) * 0.115]));
  }
  if (ex.has('headphones')) {
    P.push(part(box(0.25, 0.03, 0.045), 'head', '#22252b', [0, 1.835, 0]));
    for (const sx of [-1, 1]) {
      P.push(part(box(0.025, 0.12, 0.04), 'head', '#22252b', [sx * 0.122, 1.77, 0]));
      P.push(part(cyl(0.05, 0.05, 0.04, 10), 'head', '#e75a7c', [sx * 0.125, 1.69, 0], [0, 0, Math.PI / 2]));
    }
  }
  if (ex.has('goldchain')) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.4;
      P.push(part(sph(0.014, 4, 3), 'chest', '#e2b13c', [Math.sin(a) * 0.1, 1.46 - Math.cos(a * 0.5) * 0.07 + 0.05, 0.1 + Math.cos(a) * 0.045]));
    }
    P.push(part(box(0.04, 0.05, 0.012), 'chest', '#e2b13c', [0, 1.36, 0.152]));
  }
  if (ex.has('rcb')) {
    P.push(part(box(0.31, 0.22, 0.012), 'chest', '#c8102e', [0, 1.33, 0.148]));
    P.push(part(box(0.31, 0.07, 0.013), 'chest', '#1b1718', [0, 1.2, 0.149]));
    P.push(part(box(0.1, 0.035, 0.014), 'chest', '#e2b13c', [0, 1.38, 0.151]));
  }
  // keep each part's own smooth normals (recomputing on the merged, non-indexed mesh would facet it)
  return mergeGeometries(P);
}

const MAT_CACHE = {};

export class Avatar {
  constructor(look = {}) {
    this.look = { ...PLAYER_LOOK, ...look };
    const geo = buildGeometry(this.look);
    const bones = [];
    const byName = {};
    for (const name of Object.keys(B)) {
      const b = new THREE.Bone();
      b.name = name;
      byName[name] = b;
      bones[B[name]] = b;
    }
    for (const name of Object.keys(B)) {
      const b = byName[name];
      const p = PARENT[name];
      const w = J[name];
      if (p) {
        const pw = J[p];
        b.position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]);
        byName[p].add(b);
      } else b.position.set(...w);
    }
    const mat = MAT_CACHE.m || (MAT_CACHE.m = toon({ vertexColors: true, hatch: 1.2, rim: 0.18 }));
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.bones = byName;
    this.object = new THREE.Group();
    this.object.add(mesh);
    const s = this.look.height || 1;
    mesh.scale.setScalar(s);
    this.phase = Math.random() * 10;
    this.t = Math.random() * 10;
    this.emote = null;
    this.emoteT = 0;
    this.speedSm = 0;
    this.blink = 0;
  }

  // name: wave | namaste | dance | wobble | facepalm | laugh | point | shrug | phone | typing | cheer | sit
  play(name, dur = 2.5) { this.emote = name; this.emoteT = 0; this.emoteDur = dur; }
  stop() { this.emote = null; }

  // state: { speed, grounded, vy, mode: 'walk'|'ride'|'sit'|'glide' }
  update(dt, state = {}) {
    const b = this.bones;
    this.t += dt;
    const speed = state.speed || 0;
    this.speedSm += (speed - this.speedSm) * Math.min(1, dt * 8);
    const sp = this.speedSm;
    for (const k in b) b[k].rotation.set(0, 0, 0);
    b.hips.position.set(0, J.hips[1], 0);
    b.chest.position.set(0, J.chest[1] - J.spine[1], 0);

    const mode = state.mode || 'walk';
    if (mode === 'ride') this._ride(state);
    else if (mode === 'pillion') { this._ride(state); this._emote('typing', 1); }
    else if (mode === 'sit' || this.emote === 'sit') this._sit();
    else if (mode === 'glide') this._glide();
    else if (!state.grounded && state.grounded !== undefined) this._air(state.vy || 0);
    else this._locomote(dt, sp);

    if (this.emote && mode !== 'ride' && mode !== 'pillion') {
      this.emoteT += dt;
      this._emote(this.emote, this.emoteT);
      if (this.emoteDur && this.emoteT > this.emoteDur) this.emote = null;
    }
    // head follows a look target (yaw only), gently
    if (state.lookYaw) b.head.rotation.y += THREE.MathUtils.clamp(state.lookYaw, -1, 1) * 0.7;
  }

  _locomote(dt, sp) {
    const b = this.bones;
    const run = THREE.MathUtils.clamp((sp - 3.2) / 3, 0, 1);
    const walk = THREE.MathUtils.clamp(sp / 1.4, 0, 1);
    this.phase += dt * (sp * (2.4 - run * 0.9) + 0.0001);
    const p = this.phase;
    const s = Math.sin(p), c = Math.cos(p);
    // idle breathing and sway
    const idle = 1 - walk;
    b.chest.rotation.x = Math.sin(this.t * 1.6) * 0.02 * idle;
    b.spine.rotation.z = Math.sin(this.t * 0.7) * 0.02 * idle;
    b.uaL.rotation.z = 0.08 * idle + 0.05; b.uaR.rotation.z = -0.08 * idle - 0.05;
    b.faL.rotation.x = -0.12 * idle; b.faR.rotation.x = -0.12 * idle;
    // legs
    const amp = 0.5 * walk + 0.45 * run;
    b.thL.rotation.x = -s * amp; b.thR.rotation.x = s * amp;
    b.shL.rotation.x = Math.max(0, c) * (0.6 * walk + 0.9 * run) + 0.05;
    b.shR.rotation.x = Math.max(0, -c) * (0.6 * walk + 0.9 * run) + 0.05;
    b.ftL.rotation.x = -b.thL.rotation.x * 0.3; b.ftR.rotation.x = -b.thR.rotation.x * 0.3;
    // arms swing opposite
    const aamp = 0.45 * walk + 0.5 * run;
    b.uaL.rotation.x = s * aamp; b.uaR.rotation.x = -s * aamp;
    b.faL.rotation.x += -(0.25 * walk + 1.2 * run) - Math.max(0, s) * 0.2;
    b.faR.rotation.x += -(0.25 * walk + 1.2 * run) - Math.max(0, -s) * 0.2;
    // body
    b.hips.position.y = J.hips[1] - Math.abs(c) * (0.025 * walk + 0.05 * run) + 0.01 * walk;
    b.hips.rotation.y = s * 0.12 * walk;
    b.chest.rotation.y = -s * 0.18 * walk;
    b.spine.rotation.x += 0.05 * walk + 0.22 * run;
    b.head.rotation.x = -0.05 * walk - 0.12 * run;
  }

  _air(vy) {
    const b = this.bones;
    const up = THREE.MathUtils.clamp(vy / 6, -1, 1);
    b.thL.rotation.x = -0.9; b.shL.rotation.x = 1.3;
    b.thR.rotation.x = -0.2 + up * 0.2; b.shR.rotation.x = 0.5;
    b.uaL.rotation.z = 0.9 + up * 0.3; b.uaR.rotation.z = -0.9 - up * 0.3;
    b.uaL.rotation.x = -0.5; b.uaR.rotation.x = 0.3;
    b.faL.rotation.x = -0.6; b.faR.rotation.x = -0.6;
    b.spine.rotation.x = 0.15;
  }

  _ride(state) {
    const b = this.bones;
    b.hips.position.y = J.hips[1] - 0.12;
    b.thL.rotation.x = -1.45; b.thR.rotation.x = -1.45;
    b.thL.rotation.z = 0.12; b.thR.rotation.z = -0.12;
    b.shL.rotation.x = 1.25; b.shR.rotation.x = 1.25;
    b.spine.rotation.x = 0.25 + (state.lean || 0) * 0;
    b.uaL.rotation.x = -1.0; b.uaR.rotation.x = -1.0;
    b.uaL.rotation.z = 0.25; b.uaR.rotation.z = -0.25;
    b.faL.rotation.x = -0.5; b.faR.rotation.x = -0.5;
    b.spine.rotation.z = -(state.lean || 0) * 0.5;
    b.head.rotation.z = (state.lean || 0) * 0.3;
  }

  _sit() {
    const b = this.bones;
    b.hips.position.y = 0.5;
    b.thL.rotation.x = -1.5; b.thR.rotation.x = -1.5;
    b.shL.rotation.x = 1.5; b.shR.rotation.x = 1.5;
    b.uaL.rotation.x = -0.3; b.uaR.rotation.x = -0.3;
    b.faL.rotation.x = -0.9; b.faR.rotation.x = -0.9;
    b.chest.rotation.x = Math.sin(this.t * 1.6) * 0.02;
  }

  _glide() {
    const b = this.bones;
    b.spine.rotation.x = 0.9;
    b.head.rotation.x = -0.8;
    b.uaL.rotation.z = 1.4; b.uaR.rotation.z = -1.4;
    b.thL.rotation.x = 0.3; b.thR.rotation.x = 0.25;
    b.shL.rotation.x = 0.4; b.shR.rotation.x = 0.5;
  }

  _emote(e, t) {
    const b = this.bones;
    const k = Math.min(1, t * 5) * Math.min(1, Math.max(0, (this.emoteDur || 99) - t) * 5);
    const lerp = (bone, ax, v) => { bone.rotation[ax] += (v - bone.rotation[ax]) * k; };
    switch (e) {
      case 'wave':
        lerp(b.uaR, 'z', -2.6); lerp(b.uaR, 'x', 0);
        lerp(b.faR, 'z', Math.sin(t * 12) * 0.5); lerp(b.faR, 'x', 0);
        break;
      case 'namaste':
        lerp(b.uaL, 'x', -0.5); lerp(b.uaR, 'x', -0.5); lerp(b.uaL, 'z', -0.25); lerp(b.uaR, 'z', 0.25);
        lerp(b.faL, 'x', -1.7); lerp(b.faR, 'x', -1.7); lerp(b.faL, 'y', 0.6); lerp(b.faR, 'y', -0.6);
        lerp(b.spine, 'x', 0.25 * Math.min(1, t)); lerp(b.head, 'x', 0.25);
        break;
      case 'wobble':
        // the famous Indian head wobble: yes, no and maybe at once
        b.head.rotation.z += Math.sin(t * 9) * 0.28 * k;
        b.neck.rotation.z += Math.sin(t * 9 + 0.6) * 0.1 * k;
        lerp(b.uaL, 'z', 0.4); lerp(b.uaR, 'z', -0.4); lerp(b.faL, 'x', -1.2); lerp(b.faR, 'x', -1.2);
        b.hL.rotation.z += Math.sin(t * 9) * 0.6 * k; b.hR.rotation.z += Math.sin(t * 9) * 0.6 * k;
        break;
      case 'dance': {
        // a filmy hero step: shoulders, hip bounce, arm flourishes
        const q = t * 7;
        b.hips.position.y += Math.abs(Math.sin(q)) * 0.06 * k;
        lerp(b.uaL, 'z', 1.9 + Math.sin(q) * 0.5); lerp(b.uaR, 'z', -1.9 + Math.sin(q) * 0.5);
        lerp(b.faL, 'z', 0.6 * Math.sin(q * 0.5)); lerp(b.faR, 'z', -0.6 * Math.cos(q * 0.5));
        b.chest.rotation.y += Math.sin(q * 0.5) * 0.4 * k;
        b.thL.rotation.x += Math.max(0, Math.sin(q)) * -0.7 * k;
        b.shL.rotation.x += Math.max(0, Math.sin(q)) * 1.0 * k;
        b.thR.rotation.x += Math.max(0, -Math.sin(q)) * -0.7 * k;
        b.shR.rotation.x += Math.max(0, -Math.sin(q)) * 1.0 * k;
        b.head.rotation.z += Math.sin(q) * 0.15 * k;
        break;
      }
      case 'cheer':
        lerp(b.uaL, 'z', 2.7); lerp(b.uaR, 'z', -2.7);
        b.hips.position.y += Math.abs(Math.sin(t * 8)) * 0.07 * k;
        lerp(b.faL, 'z', Math.sin(t * 8) * 0.3); lerp(b.faR, 'z', -Math.sin(t * 8) * 0.3);
        break;
      case 'facepalm':
        lerp(b.uaR, 'x', -1.6); lerp(b.uaR, 'z', 0.4); lerp(b.faR, 'x', -1.9); lerp(b.head, 'x', 0.35); lerp(b.spine, 'x', 0.15);
        break;
      case 'laugh':
        lerp(b.spine, 'x', -0.15); lerp(b.head, 'x', -0.3);
        b.chest.rotation.x += Math.sin(t * 22) * 0.05 * k;
        lerp(b.uaL, 'x', -0.4); lerp(b.uaR, 'x', -0.4); lerp(b.faL, 'x', -1.5); lerp(b.faR, 'x', -1.5);
        break;
      case 'point':
        lerp(b.uaR, 'x', -1.5); lerp(b.faR, 'x', 0);
        break;
      case 'shrug':
        lerp(b.uaL, 'z', 0.5); lerp(b.uaR, 'z', -0.5); lerp(b.faL, 'x', -1.4); lerp(b.faR, 'x', -1.4);
        lerp(b.faL, 'y', -0.7); lerp(b.faR, 'y', 0.7); lerp(b.head, 'z', 0.2);
        b.chest.position.y = J.chest[1] - J.spine[1] + 0.03 * k;
        break;
      case 'punch': {
        // a quick filmy jab: out in 0.1 s, back by 0.4 s, left hand up as a guard
        const ext = Math.min(1, t / 0.1) * (1 - Math.min(1, Math.max(0, (t - 0.16) / 0.22)));
        b.uaR.rotation.x = -0.4 - 1.25 * ext; b.uaR.rotation.z = -0.15;
        b.faR.rotation.x = -1.5 * (1 - ext);
        b.uaL.rotation.x = -0.7; b.faL.rotation.x = -1.8; b.uaL.rotation.z = -0.2;
        b.chest.rotation.y -= 0.45 * ext;
        b.spine.rotation.x += 0.1 * ext;
        break;
      }
      case 'aim':
        b.uaR.rotation.x = -1.45; b.faR.rotation.x = -0.15; b.uaR.rotation.z = 0.15;
        b.uaL.rotation.x = -1.35; b.uaL.rotation.z = -0.55; b.faL.rotation.x = -0.35;
        b.chest.rotation.y += 0.25;
        break;
      case 'phone':
        lerp(b.uaR, 'x', -0.5); lerp(b.uaR, 'z', 0.5); lerp(b.faR, 'x', -2.2); lerp(b.head, 'z', -0.15);
        break;
      case 'typing':
        lerp(b.uaL, 'x', -0.5); lerp(b.uaR, 'x', -0.5); lerp(b.faL, 'x', -1.1); lerp(b.faR, 'x', -1.1);
        b.hL.rotation.x += Math.sin(t * 20) * 0.3 * k; b.hR.rotation.x += Math.cos(t * 23) * 0.3 * k;
        lerp(b.head, 'x', 0.35);
        break;
      default:
        break;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}
