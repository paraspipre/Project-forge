import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { std, glow, mesh, textTexture, lightCone } from './Materials.js';
import { worldUV } from './Textures.js';
import { Sky } from './Sky.js';
import { getModel, fitToHeight } from './Models.js';
import { clone as cloneSkinned } from '../../vendor/jsm/utils/SkeletonUtils.js';

// Builds a playable environment from scene data:
//   environment: { sky, fog, ambient, moon, ground, groundTex, rain, lightning, flashback, exposure }
//   props: [{ type, x, z, rot, ...typeSpecific, solid }]
// Exposes colliders (XZ AABBs with height) and per-frame animation hooks.

const rad = (deg) => (deg || 0) * Math.PI / 180;
const P = {};

function mulberry(a) {
  a = Math.floor(Math.abs(a) * 1000) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Box with world-scaled UVs so textures keep their real-world size.
function box(w, h, d, mat, uv = 2, opts) {
  return mesh(worldUV(new THREE.BoxGeometry(w, h, d), uv), mat, opts);
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };

function instanced(geo, mat, matrices, cast = true) {
  const im = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = cast;
  im.receiveShadow = true;
  return im;
}
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

const MAT = {
  brick: (c) => std(c || '#7a4a3c', { tex: 'brick', rough: 1, normal: 1.2 }),
  stone: (c) => std(c || '#8a8478', { tex: 'stone', rough: 1, normal: 1 }),
  concrete: (c) => std(c || '#7d7a76', { tex: 'concrete', rough: 1, normal: 0.8 }),
  wood: (c) => std(c || '#6b4a32', { tex: 'wood', rough: 1, normal: 0.8 }),
  iron: (c) => std(c || '#1d1b20', { tex: 'metal', metal: 0.8, rough: 0.6 }),
  brass: () => std('#c9a24a', { metal: 1, rough: 0.28 }),
  chrome: () => std('#d8dde4', { metal: 1, rough: 0.12 }),
  slate: () => std('#2a2a33', { tex: 'concrete', rough: 0.6, normal: 0.5 }),
  glassDark: () => std('#0c1018', { metal: 0.9, rough: 0.08 }),
  canvas: (c) => std(c, { tex: 'fabric', rough: 0.9, side: THREE.DoubleSide, normal: 0.6 }),
};

let chaseList = [];
const chase = (im, n) => {
  for (let i = 0; i < n; i++) im.setColorAt(i, new THREE.Color(1, 1, 1));
  chaseList.push({ im, n });
};

// ---------------- architecture ----------------

P.building = (p, ctx) => {
  const g = new THREE.Group();
  const w = p.w || 8, h = p.h || 8, d = p.d || 6;
  const wallM = p.mat === 'stone' ? MAT.stone(p.color) : MAT.brick(p.color);
  const trimM = MAT.stone(p.trim || '#9a948a');
  g.add(at(box(w, h, d, wallM, 2.4), 0, h / 2, 0));
  g.add(at(box(w + 0.3, 1.1, d + 0.3, MAT.stone('#6f6a62'), 3), 0, 0.55, 0));
  const floors = Math.max(1, Math.floor((h - 1.2) / 3));
  for (let f = 1; f <= floors; f++) g.add(at(box(w + 0.2, 0.18, d + 0.2, trimM, 3, { cast: false }), 0, 1.2 + f * 3 - 0.35, 0));
  g.add(at(box(w + 0.5, 0.45, d + 0.5, trimM, 3), 0, h + 0.1, 0));

  if (p.windows !== false) {
    const rng = mulberry((p.seed || 1) * 7.3 + w);
    const frames = [], lit = [], dark = [], sills = [];
    const cols = Math.max(1, Math.floor((w - 1.5) / 2.2));
    for (const face of [1, -1]) {
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const x = -w / 2 + 1.4 + c * ((w - 2.8) / Math.max(1, cols - 1));
          if (face > 0 && p.door && Math.abs(x) < 1.8 && f <= 1) continue;
          const y = 1.2 + f * 3 + 1.1;
          const z = face * (d / 2);
          const ry = face > 0 ? 0 : Math.PI;
          frames.push(M4(x, y, z, 0, ry));
          sills.push(M4(x, y - 0.95, z + face * 0.08, 0, ry));
          (rng() < (p.litRatio ?? 0.3) ? lit : dark).push(M4(x, y, z + face * 0.02, 0, ry));
        }
      }
    }
    const parts = [new THREE.BoxGeometry(1.25, 0.14, 0.22).translate(0, 0.85, 0), new THREE.BoxGeometry(1.25, 0.1, 0.22).translate(0, -0.85, 0),
      new THREE.BoxGeometry(0.12, 1.8, 0.22).translate(-0.6, 0, 0), new THREE.BoxGeometry(0.12, 1.8, 0.22).translate(0.6, 0, 0),
      new THREE.BoxGeometry(0.05, 1.6, 0.06).translate(0, 0, 0.02), new THREE.BoxGeometry(1.1, 0.05, 0.06).translate(0, 0.25, 0.02)];
    if (p.style === 'gothic') parts.push(new THREE.ConeGeometry(0.72, 0.5, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.2).translate(0, 1.15, 0));
    const frameGeo = mergeGeometries(parts.map((x) => x.toNonIndexed()));
    const pane = new THREE.PlaneGeometry(1.1, 1.6);
    g.add(instanced(frameGeo, trimM, frames));
    g.add(instanced(new THREE.BoxGeometry(1.4, 0.08, 0.3), trimM, sills));
    if (lit.length) g.add(instanced(pane, glow(p.windowColor || '#ffc874', 1.6), lit, false));
    if (dark.length) g.add(instanced(pane, MAT.glassDark(), dark, false));
  }

  if (p.style === 'gothic') {
    const s = new THREE.Shape();
    s.moveTo(-d / 2 - 0.3, 0); s.lineTo(0, d * 0.55); s.lineTo(d / 2 + 0.3, 0); s.lineTo(-d / 2 - 0.3, 0);
    const roof = mesh(new THREE.ExtrudeGeometry(s, { depth: w - 1, bevelEnabled: false }), MAT.slate());
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-(w - 1) / 2, h + 0.3, 0);
    g.add(roof);
    for (const sx of [-1, 1]) {
      const tw = new THREE.Group();
      tw.add(at(mesh(new THREE.CylinderGeometry(1.3, 1.4, h + 3, 12), wallM), 0, (h + 3) / 2, 0));
      tw.add(at(mesh(new THREE.ConeGeometry(1.7, 4.5, 12), MAT.slate()), 0, h + 3 + 2.25, 0));
      tw.add(at(mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.35, 12), trimM), 0, h + 3, 0));
      tw.add(at(mesh(new THREE.ConeGeometry(0.06, 1.2, 6), MAT.iron()), 0, h + 3 + 5, 0));
      tw.add(at(mesh(new THREE.PlaneGeometry(0.35, 1.2), glow('#ffcf7a', 1.8), { cast: false }), 0, h, 1.42));
      tw.position.set(sx * (w / 2), 0, d / 2 - 0.4);
      g.add(tw);
    }
    for (const cx of [-w / 4, w / 5]) g.add(at(box(0.9, 2.2, 0.9, wallM, 2.4), cx, h + d * 0.3 + 0.6, -d * 0.15));
  }

  if (p.door) {
    const doorG = new THREE.Group();
    const arch = new THREE.Shape();
    arch.moveTo(-1.1, 0); arch.lineTo(-1.1, 2.4); arch.absarc(0, 2.4, 1.1, Math.PI, 0, true); arch.lineTo(1.1, 0); arch.lineTo(-1.1, 0);
    const frame = mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.35, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 2 }), trimM);
    frame.scale.set(1.12, 1.06, 1);
    doorG.add(frame);
    doorG.add(at(mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.1, bevelEnabled: false }), MAT.wood('#3b2618')), 0, 0, 0.28));
    for (let i = 0; i < 3; i++) doorG.add(at(box(2.6 + i * 0.6, 0.18, 0.5, MAT.stone('#77726a'), 3), 0, 0.09, 0.6 + i * 0.5));
    const lampG = at(new THREE.Group(), 0, 3.9, 0.5);
    lampG.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.38, 6), glow('#ffd28a', 2.4), { cast: false }));
    lampG.add(at(mesh(new THREE.ConeGeometry(0.24, 0.2, 6), MAT.iron()), 0, 0.27, 0));
    doorG.add(lampG);
    ctx.addLight(doorG, new THREE.Vector3(0, 3.6, 1.2), '#ffcf8a', 12, 9);
    doorG.position.set(0, 0, d / 2 - 0.15);
    g.add(doorG);
  }
  if (p.sign) {
    const mat = new THREE.MeshStandardMaterial({ map: textTexture(p.sign, { w: 1024, h: 150, size: 110, bg: p.signBg || '#2b2420', fg: p.signFg || '#e8cf8a' }), metalness: 0.3, roughness: 0.5 });
    if (p.signGlow) { mat.emissive = new THREE.Color('#ffffff'); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.8; }
    const s = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 7), 1.0), mat);
    s.position.set(0, p.door ? 5.2 : Math.min(h - 1, 4.2), d / 2 + 0.06);
    g.add(s);
  }
  for (const sx of [-1, 1]) g.add(at(mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 8), MAT.iron('#2a2a2e')), sx * (w / 2 - 0.25), h / 2, d / 2 + 0.12));
  g.userData.collider = { w: w + 0.3, d: d + 0.3 };
  return g;
};

P.wall = (p) => {
  const g = new THREE.Group();
  const w = p.w || 6, h = p.h || 3, d = p.d || 0.4;
  const m = p.mat === 'concrete' ? MAT.concrete(p.color) : p.mat === 'plaster' ? std(p.color || '#6a3a2a', { tex: 'plaster', rough: 1 }) : MAT.brick(p.color);
  g.add(at(box(w, h, d, m, 2.4), 0, h / 2, 0));
  if (p.mat !== 'plaster') g.add(at(box(w + 0.1, 0.15, d + 0.2, MAT.stone('#8a857c'), 3), 0, h + 0.07, 0));
  if (p.wire) {
    const pts = [];
    const turns = Math.floor(w * 3);
    for (let i = 0; i <= turns * 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(new THREE.Vector3(-w / 2 + (i / (turns * 12)) * w, h + 0.42 + Math.sin(a) * 0.25, Math.cos(a) * 0.25));
    }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 12, 0.012, 4), MAT.chrome(), { cast: false }));
  }
  if (p.mat === 'plaster') {
    for (const s of [1, -1]) {
      g.add(at(box(w, 1.1, 0.04, MAT.wood('#4a2e1e'), 2), 0, 0.55, s * (d / 2 + 0.02)));
      g.add(at(box(w, 0.08, 0.08, MAT.wood('#3a2416'), 2), 0, 1.12, s * (d / 2 + 0.03)));
    }
  }
  return g;
};

P.fence = (p) => {
  const g = new THREE.Group();
  const len = p.w || 8, h = p.h || 2.2;
  const n = Math.round(len / 0.22);
  const bars = [], tips = [];
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + i * (len / n);
    bars.push(M4(x, h / 2, 0));
    tips.push(M4(x, h + 0.08, 0));
  }
  const iron = MAT.iron();
  g.add(instanced(new THREE.CylinderGeometry(0.018, 0.018, h, 6), iron, bars));
  g.add(instanced(new THREE.ConeGeometry(0.04, 0.16, 4), iron, tips));
  for (const y of [0.2, h - 0.2]) g.add(at(box(len, 0.05, 0.05, iron, 1), 0, y, 0));
  for (let x = -len / 2; x <= len / 2 + 0.01; x += Math.max(2, len / 6)) {
    g.add(at(box(0.14, h + 0.2, 0.14, iron, 1), x, (h + 0.2) / 2, 0));
    g.add(at(mesh(new THREE.SphereGeometry(0.1, 10, 8), iron), x, h + 0.32, 0));
  }
  g.userData.collider = { w: len, d: 0.3 };
  return g;
};

P.gate = (p) => {
  const g = new THREE.Group();
  const w = p.w || 6, h = p.h || 4.5;
  const pillarM = p.color ? std(p.color, { tex: 'concrete', rough: 0.7 }) : MAT.stone();
  for (const s of [-1, 1]) {
    const pil = at(box(1, h, 1, pillarM, 3), s * (w / 2 + 0.5), h / 2, 0);
    pil.userData.collide = true;
    g.add(pil);
    g.add(at(box(1.25, 0.3, 1.25, MAT.stone('#8f897e'), 3), s * (w / 2 + 0.5), h + 0.15, 0));
    g.add(at(mesh(new THREE.SphereGeometry(0.32, 16, 12), p.carnival ? MAT.brass() : MAT.stone('#8f897e')), s * (w / 2 + 0.5), h + 0.62, 0));
  }
  const archCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w / 2, h - 0.2, 0), new THREE.Vector3(0, h + 1.6, 0), new THREE.Vector3(w / 2, h - 0.2, 0));
  g.add(mesh(new THREE.TubeGeometry(archCurve, 32, 0.06, 6), MAT.iron()));
  if (p.sign) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 0.9), new THREE.MeshStandardMaterial({ map: textTexture(p.sign, { w: 1024, h: 150, size: 120, bg: p.signBg || '#1f1a22', fg: p.signFg || '#e8dcc0' }), roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }));
    plate.position.set(0, h + 0.45, 0);
    g.add(plate);
    if (p.carnival) {
      const bulbs = [];
      const W = w * 0.9 + 0.2;
      for (let i = 0; i <= 16; i++) for (const y of [-0.5, 0.5]) for (const z of [0.06, -0.06]) bulbs.push(M4(-W / 2 + i * (W / 16), h + 0.45 + y, z));
      const bm = instanced(new THREE.SphereGeometry(0.06, 8, 6), glow('#ffd36a', 3), bulbs, false);
      g.add(bm);
      chase(bm, bulbs.length);
    }
  }
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    const bars = [];
    for (let i = 0; i < 9; i++) bars.push(M4(s * (0.15 + i * 0.32), h * 0.42, 0));
    leaf.add(instanced(new THREE.CylinderGeometry(0.02, 0.02, h * 0.84, 6), MAT.iron(), bars));
    leaf.add(at(box(2.9, 0.06, 0.06, MAT.iron(), 1), s * 1.45, 0.25, 0));
    leaf.add(at(box(2.9, 0.06, 0.06, MAT.iron(), 1), s * 1.45, h * 0.8, 0));
    leaf.position.set(s * (w / 2), 0, 0.1);
    leaf.rotation.y = s * -1.25;
    g.add(leaf);
  }
  g.userData.partColliders = true;
  return g;
};

P.cell = (p) => {
  const g = new THREE.Group();
  const w = p.w || 4, d = p.d || 4, h = 3.2;
  const wallM = MAT.concrete(p.color || '#8a8d86');
  const addWall = (ww, hh, dd, x, y, z) => { const m = at(box(ww, hh, dd, wallM, 3), x, y, z); m.userData.collide = true; g.add(m); };
  addWall(w, h, 0.3, 0, h / 2, -d / 2);
  addWall(0.3, h, d, -w / 2, h / 2, 0);
  addWall(0.3, h, d, w / 2, h / 2, 0);
  g.add(at(box(w, 0.06, d, MAT.concrete('#6a6c68'), 3, { cast: false }), 0, 0.03, 0));
  const barsM = std('#2a2c30', { metal: 0.9, rough: 0.45 });
  const bars = [];
  for (let x = -w / 2 + 0.22; x <= w / 2 - 0.2; x += 0.2) {
    if (p.open && x > -0.6 && x < 0.6) continue;
    bars.push(M4(x, h / 2, d / 2));
  }
  g.add(instanced(new THREE.CylinderGeometry(0.022, 0.022, h, 8), barsM, bars));
  for (const y of [0.15, 1.6, h - 0.1]) g.add(at(box(w, 0.06, 0.06, barsM, 1), 0, y, d / 2));
  const half = w / 2 - 0.6;
  const hidden = (bw, x) => { const c = new THREE.Mesh(new THREE.BoxGeometry(bw, h, 0.1)); c.visible = false; c.position.set(x, h / 2, d / 2); c.userData.collide = true; g.add(c); };
  if (!p.open) hidden(w, 0);
  else {
    for (const s of [-1, 1]) hidden(half, s * (0.6 + half / 2));
    const door = new THREE.Group();
    const db = [];
    for (let x = 0.1; x < 1.2; x += 0.2) db.push(M4(x, h / 2 - 0.1, 0));
    door.add(instanced(new THREE.CylinderGeometry(0.022, 0.022, h - 0.2, 8), barsM, db));
    for (const y of [0.2, 1.6, h - 0.25]) door.add(at(box(1.2, 0.06, 0.06, barsM, 1), 0.6, y, 0));
    door.position.set(-0.6, 0, d / 2);
    door.rotation.y = -1.9;
    g.add(door);
  }
  const cot = new THREE.Group();
  const frame = at(box(0.95, 0.06, 2, barsM, 1), 0, 0.42, 0);
  frame.userData.collide = true;
  cot.add(frame);
  for (const [x, z] of [[-0.42, -0.95], [0.42, -0.95], [-0.42, 0.95], [0.42, 0.95]]) cot.add(at(box(0.05, 0.42, 0.05, barsM, 1), x, 0.21, z));
  cot.add(at(mesh(new THREE.BoxGeometry(0.9, 0.14, 1.95), std('#b9b2a0', { tex: 'fabric', rough: 1 })), 0, 0.52, 0));
  const blanket = mesh(new THREE.BoxGeometry(0.94, 0.05, 1.1, 6, 1, 6), std('#5a6a5a', { tex: 'fabric', rough: 1 }));
  const bp = blanket.geometry.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setY(i, bp.getY(i) + Math.sin(bp.getX(i) * 9) * 0.015 + Math.cos(bp.getZ(i) * 7) * 0.012);
  blanket.geometry.computeVertexNormals();
  cot.add(at(blanket, 0, 0.6, 0.35));
  cot.add(at(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), std('#d8d2c4', { tex: 'fabric', rough: 1 })), 0, 0.64, -0.75));
  cot.position.set(w / 2 - 0.7, 0, -d / 2 + 1.2);
  g.add(cot);
  const steel = std('#b8bcc2', { metal: 1, rough: 0.25 });
  g.add(at(mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 16), steel), -w / 2 + 0.45, 0.21, -d / 2 + 0.45));
  g.add(at(box(0.45, 0.15, 0.35, steel, 1), -w / 2 + 0.45, 0.95, -d / 2 + 0.3));
  const tally = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({
    map: textTexture('', { w: 256, h: 128, bg: null, border: false, aged: false, draw: (c) => {
      c.strokeStyle = 'rgba(230,225,210,.75)'; c.lineWidth = 3;
      for (let i = 0; i < 9; i++) { const x0 = 14 + i * 26; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x0 + k * 5, 30); c.lineTo(x0 + k * 5, 90); c.stroke(); } c.beginPath(); c.moveTo(x0 - 4, 80); c.lineTo(x0 + 22, 40); c.stroke(); }
    } }), transparent: true, roughness: 1 }));
  tally.position.set(0.3, 1.5, -d / 2 + 0.16);
  g.add(tally);
  g.userData.partColliders = true;
  return g;
};

// ---------------- street furniture ----------------

P.lamp = (p, ctx) => {
  const g = new THREE.Group();
  const iron = MAT.iron('#1c1a1f');
  g.add(at(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8), iron), 0, 0.25, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.09, 4, 8), iron), 0, 2.4, 0));
  g.add(rot(at(mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), iron), 0, 1.0, 0), Math.PI / 2));
  const arm = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 4.2, 0), new THREE.Vector3(0, 4.7, 0), new THREE.Vector3(0, 4.7, 0.6), new THREE.Vector3(0, 4.35, 0.85));
  g.add(mesh(new THREE.TubeGeometry(arm, 16, 0.035, 6), iron));
  const lan = at(new THREE.Group(), 0, 3.95, 0.85);
  const glass = mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.42, 6, 1, true), glow(p.color || '#ffd890', 2.6), { cast: false });
  lan.add(glass);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    lan.add(at(box(0.02, 0.44, 0.02, iron, 1), Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17));
  }
  lan.add(at(mesh(new THREE.ConeGeometry(0.27, 0.22, 6), iron), 0, 0.32, 0));
  lan.add(at(mesh(new THREE.SphereGeometry(0.05, 8, 6), iron), 0, 0.47, 0));
  lan.add(at(mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.06, 6), iron), 0, -0.24, 0));
  g.add(lan);
  const cone = lightCone(p.color || '#ffd890', 1.7, 3.8, 0.12);
  cone.position.set(0, 3.8, 0.85);
  g.add(cone);
  const light = p.light !== false ? ctx.addLight(g, new THREE.Vector3(0, 3.6, 0.85), p.color || '#ffcf86', p.intensity ?? 22, p.range ?? 13) : null;
  if (p.flicker) {
    const on = glass.material, off = glow(p.color || '#ffd890', 0.25);
    ctx.anim((t) => {
      const lit = Math.sin(t * 17) + Math.sin(t * 5.3) + Math.sin(t * 31) > -1.6;
      glass.material = lit ? on : off;
      cone.visible = lit;
      if (light) light.visible = lit;
    });
  }
  g.userData.collider = { w: 0.5, d: 0.5 };
  return g;
};

P.bench = (p) => {
  const g = new THREE.Group();
  const wood = MAT.wood(p.color || '#5a3a24');
  for (let i = 0; i < 4; i++) g.add(at(box(2, 0.05, 0.12, wood, 1.5), 0, 0.48, -0.2 + i * 0.14));
  for (let i = 0; i < 3; i++) g.add(rot(at(box(2, 0.12, 0.04, wood, 1.5), 0, 0.68 + i * 0.16, -0.32), -0.15));
  for (const x of [-0.85, 0.85]) {
    const leg = new THREE.Shape();
    leg.moveTo(-0.3, 0); leg.lineTo(-0.25, 0.45); leg.lineTo(-0.35, 1.1); leg.lineTo(-0.3, 1.1); leg.lineTo(-0.18, 0.45); leg.lineTo(0.3, 0.45); leg.lineTo(0.25, 0); leg.lineTo(0.2, 0); leg.lineTo(0.22, 0.4); leg.lineTo(-0.2, 0.4); leg.lineTo(-0.25, 0);
    const lm = mesh(new THREE.ExtrudeGeometry(leg, { depth: 0.05, bevelEnabled: false }), MAT.iron());
    lm.rotation.y = Math.PI / 2;
    lm.position.set(x, 0, 0);
    g.add(lm);
  }
  return g;
};

P.tree = (p) => {
  const g = new THREE.Group();
  const h = p.h || 5;
  const bark = std(p.color || '#3a2c26', { tex: 'wood', rough: 1, normal: 1.5 });
  const rng = mulberry(p.seed || (p.x * 13 + p.z * 7 + 3));
  const geos = [];
  const grow = (start, dir, len, r, depth) => {
    const pts = [start.clone()];
    let pos = start.clone();
    const d = dir.clone();
    for (let i = 1; i <= 5; i++) {
      d.add(new THREE.Vector3((rng() - 0.5) * 0.5, (rng() - 0.3) * 0.25, (rng() - 0.5) * 0.5)).normalize();
      pos = pos.clone().addScaledVector(d, len / 5);
      pts.push(pos);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 10, r, 7);
    const tp = tube.attributes.position, center = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < tp.count; i++) {
      const seg = Math.min(1, Math.floor(i / 8) / 10);
      curve.getPointAt(seg, center);
      v.set(tp.getX(i), tp.getY(i), tp.getZ(i)).sub(center).multiplyScalar(1 - seg * 0.75).add(center);
      tp.setXYZ(i, v.x, v.y, v.z);
    }
    tube.computeVertexNormals();
    geos.push(tube.toNonIndexed());
    if (depth > 0) {
      const n = depth === 2 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const sp = curve.getPointAt(0.45 + rng() * 0.5);
        const nd = d.clone().add(new THREE.Vector3((rng() - 0.5) * 2.2, rng() * 0.6, (rng() - 0.5) * 2.2)).normalize();
        grow(sp, nd, len * (0.45 + rng() * 0.2), r * 0.45, depth - 1);
      }
    }
  };
  grow(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, 1, 0), h, 0.22, 2);
  const geo = mergeGeometries(geos);
  worldUV(geo, 1.5);
  g.add(mesh(geo, bark));
  for (let i = 0; i < 4; i++) g.add(rot(at(mesh(new THREE.ConeGeometry(0.12, 0.8, 5), bark), Math.cos(i * 1.57) * 0.2, 0.05, Math.sin(i * 1.57) * 0.2), Math.PI / 2 - 0.3, i * Math.PI / 2 + rng()));
  g.userData.collider = { w: 0.6, d: 0.6 };
  return g;
};

P.car = (p, ctx) => {
  const g = new THREE.Group();
  const paint = std(p.color || '#141a2a', { metal: 0.6, rough: 0.25, clearcoat: 1, clearcoatRough: 0.05 });
  const white = std('#e8e6e0', { metal: 0.4, rough: 0.25, clearcoat: 1 });
  const s = new THREE.Shape();
  s.moveTo(-2.3, 0.35); s.lineTo(-2.35, 0.8); s.quadraticCurveTo(-2.3, 0.95, -1.9, 0.98); s.lineTo(-0.95, 1.0);
  s.lineTo(-0.6, 1.5); s.quadraticCurveTo(-0.5, 1.58, -0.3, 1.58); s.lineTo(0.95, 1.58); s.quadraticCurveTo(1.15, 1.56, 1.25, 1.45);
  s.lineTo(1.6, 1.02); s.lineTo(2.25, 0.98); s.quadraticCurveTo(2.4, 0.95, 2.38, 0.75); s.lineTo(2.32, 0.35); s.lineTo(-2.3, 0.35);
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 1.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 8 });
  bodyGeo.translate(0, 0, -0.85);
  bodyGeo.rotateY(Math.PI / 2);
  g.add(mesh(bodyGeo, paint));
  // side windows + door decals. Profile x maps to world -z after the rotation.
  const glass = std('#0a0e16', { metal: 0.9, rough: 0.05, clearcoat: 1 });
  for (const sx of [-1, 1]) {
    const win = new THREE.Shape();
    win.moveTo(-1.17, 1.05); win.lineTo(-0.95, 1.48); win.lineTo(0.25, 1.48); win.lineTo(0.5, 1.05);
    const wm = mesh(new THREE.ShapeGeometry(win), glass, { cast: false });
    wm.rotation.y = sx * Math.PI / 2;
    wm.position.x = sx * 0.94;
    if (sx < 0) wm.scale.x = -1;
    g.add(wm);
    if (p.police !== false) {
      const door = mesh(new THREE.PlaneGeometry(1.9, 0.5), new THREE.MeshPhysicalMaterial({ map: textTexture('POLICE', { w: 512, h: 140, size: 96, bg: '#e8e6e0', fg: '#141a2a', border: false, aged: false }), clearcoat: 1, roughness: 0.3 }), { cast: false });
      door.rotation.y = sx * Math.PI / 2;
      door.position.set(sx * 0.945, 0.7, 0);
      g.add(door);
    }
  }
  const wind = mesh(new THREE.PlaneGeometry(1.6, 0.62), glass, { cast: false });
  wind.position.set(0, 1.27, 1.42); wind.rotation.x = -0.85;
  g.add(wind);
  const rear = mesh(new THREE.PlaneGeometry(1.6, 0.55), glass, { cast: false });
  rear.position.set(0, 1.27, -1.1); rear.rotation.set(-0.95, Math.PI, 0);
  g.add(rear);
  if (p.police !== false) g.add(at(box(1.62, 0.04, 1.2, white, 1), 0, 1.6, 0.2));
  const chrome = MAT.chrome();
  g.add(at(box(1.9, 0.16, 0.12, chrome, 1), 0, 0.42, 2.42));
  g.add(at(box(1.9, 0.16, 0.12, chrome, 1), 0, 0.42, -2.38));
  const tyre = std('#111', { rough: 0.85 });
  for (const [x, z] of [[-0.86, 1.45], [0.86, 1.45], [-0.86, -1.4], [0.86, -1.4]]) {
    const wg = new THREE.Group();
    wg.add(mesh(new THREE.TorusGeometry(0.3, 0.12, 10, 20), tyre));
    wg.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 16).rotateX(Math.PI / 2), chrome));
    wg.rotation.y = Math.PI / 2;
    wg.position.set(x, 0.4, z);
    g.add(wg);
  }
  for (const sx of [-0.6, 0.6]) {
    g.add(at(mesh(new THREE.CircleGeometry(0.13, 16), glow('#fff4d6', 3), { cast: false }), sx, 0.78, 2.45));
    g.add(rot(at(mesh(new THREE.PlaneGeometry(0.3, 0.12), glow('#ff2020', 1.6), { cast: false }), sx, 0.82, -2.4), 0, Math.PI));
  }
  const beam = lightCone('#fff4d6', 1.4, 9, 0.06);
  beam.rotation.x = -Math.PI / 2 + 0.1;
  beam.position.set(0, 0.8, 2.4);
  g.add(beam);
  if (p.police !== false) {
    const bar = at(new THREE.Group(), 0, 1.72, 0.2);
    bar.add(box(1.4, 0.08, 0.32, chrome, 1));
    const red = at(mesh(new THREE.BoxGeometry(0.6, 0.16, 0.28), glow('#ff1a1a', 4), { cast: false }), -0.36, 0.1, 0);
    const blue = at(mesh(new THREE.BoxGeometry(0.6, 0.16, 0.28), glow('#1a4dff', 4), { cast: false }), 0.36, 0.1, 0);
    bar.add(red, blue);
    g.add(bar);
    const light = ctx.addLight(g, new THREE.Vector3(0, 2.4, 0), '#ff2a2a', 30, 14);
    const redOff = std('#401010', { rough: 0.3 }), blueOff = std('#101640', { rough: 0.3 });
    const redOn = red.material, blueOn = blue.material;
    ctx.anim((t) => {
      const phase = (t * 1.6 + (p.x || 0) * 0.13) % 1;
      const left = phase < 0.5;
      const strobe = Math.sin(phase * Math.PI * 8) > 0;
      red.material = left && strobe ? redOn : redOff;
      blue.material = !left && strobe ? blueOn : blueOff;
      if (light) { light.color.set(left ? '#ff2a2a' : '#2a50ff'); light.intensity = strobe ? 30 : 4; }
    });
  }
  g.userData.collider = { w: 2.0, d: 4.9 };
  return g;
};

P.crate = (p) => {
  const g = new THREE.Group();
  const s = p.s || 1;
  g.add(at(box(s * 0.94, s * 0.94, s * 0.94, MAT.wood(p.color || '#7a5a3a'), 1.2), 0, s / 2, 0));
  const frame = MAT.wood('#5a3e26');
  for (const [w, h, d, x, y, z] of [[s, 0.08, 0.08, 0, s - 0.04, s / 2], [s, 0.08, 0.08, 0, 0.04, s / 2], [s, 0.08, 0.08, 0, s - 0.04, -s / 2], [s, 0.08, 0.08, 0, 0.04, -s / 2],
    [0.08, s, 0.08, s / 2, s / 2, s / 2], [0.08, s, 0.08, -s / 2, s / 2, s / 2], [0.08, s, 0.08, s / 2, s / 2, -s / 2], [0.08, s, 0.08, -s / 2, s / 2, -s / 2]]) g.add(at(box(w, h, d, frame, 1), x, y, z));
  g.add(rot(at(box(0.07, s * 1.3, 0.04, frame, 1), 0, s / 2, s / 2 + 0.01), 0, 0, Math.PI / 4));
  g.rotation.y = rad(p.spin);
  g.position.y = p.y || 0;
  return g;
};

P.barrel = (p) => {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.07, t * 1.05)); }
  g.add(mesh(new THREE.LatheGeometry(prof, 20), std(p.color || '#6a2a2a', { tex: 'metal', metal: 0.7, rough: 0.5 })));
  for (const y of [0.15, 0.5, 0.9]) g.add(rot(at(mesh(new THREE.TorusGeometry(0.43 - Math.abs(y - 0.52) * 0.12, 0.018, 6, 24), MAT.iron()), 0, y, 0), Math.PI / 2));
  g.add(rot(at(mesh(new THREE.CircleGeometry(0.37, 20), MAT.iron('#2a2020')), 0, 1.04, 0), -Math.PI / 2));
  return g;
};

P.rubble = (p) => {
  const g = new THREE.Group();
  const rng = mulberry(p.x * 3 + p.z * 11 + 1);
  const m = MAT.concrete(p.color || '#6a6470');
  for (let i = 0; i < (p.n || 7); i++) {
    const geo = new THREE.DodecahedronGeometry(0.18 + rng() * 0.35, 1);
    const pa = geo.attributes.position;
    const sx = 0.8 + rng() * 0.4, sy = 0.5 + rng() * 0.3, sz = 0.8 + rng() * 0.4;
    for (let k = 0; k < pa.count; k++) pa.setXYZ(k, pa.getX(k) * sx, pa.getY(k) * sy, pa.getZ(k) * sz);
    geo.computeVertexNormals();
    worldUV(geo, 1);
    g.add(rot(at(mesh(geo, m), (rng() - 0.5) * 2.2, 0.08, (rng() - 0.5) * 2.2), rng() * 3, rng() * 3));
  }
  g.userData.solid = false;
  return g;
};

// ---------------- carnival ----------------

function stripeTexture(c1, c2, n = 12, scallop = false) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < n * 2; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * 512 / (n * 2), 0, 512 / (n * 2) + 1, 256); }
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(0,0,0,0.25)'); grd.addColorStop(0.6, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(30,20,10,0.35)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  if (scallop) {
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n * 2; i++) { g.beginPath(); g.arc((i + 0.5) * 512 / (n * 2), 256, 512 / (n * 4), Math.PI, 0); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

P.tent = (p, ctx) => {
  const g = new THREE.Group();
  const r = p.r || 2.5, h = p.h || 2.5;
  const c1 = p.color || '#a8202f', c2 = p.color2 || '#efe4cc';
  const wall = new THREE.MeshStandardMaterial({ map: stripeTexture(c1, c2, 10), roughness: 0.85, side: THREE.DoubleSide });
  g.add(at(mesh(new THREE.CylinderGeometry(r, r * 1.02, h, 32, 4, true), wall), 0, h / 2, 0));
  const roofGeo = new THREE.ConeGeometry(r * 1.12, h * 0.85, 32, 6, true);
  const rp = roofGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getZ(i), y = rp.getY(i);
    const k = (h * 0.425 - y) / (h * 0.85);
    rp.setY(i, y - Math.abs(Math.sin(Math.atan2(z, x) * 5)) * 0.18 * Math.sin(k * Math.PI));
  }
  roofGeo.computeVertexNormals();
  g.add(at(mesh(roofGeo, wall), 0, h + h * 0.425, 0));
  const val = new THREE.MeshStandardMaterial({ map: stripeTexture(c1, c2, 20, true), roughness: 0.85, side: THREE.DoubleSide, alphaTest: 0.5 });
  g.add(at(mesh(new THREE.CylinderGeometry(r * 1.13, r * 1.13, 0.45, 40, 1, true), val), 0, h - 0.05, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), MAT.wood('#4a3020')), 0, h * 1.85 + 0.6, 0));
  const flagGeo = new THREE.PlaneGeometry(0.7, 0.4, 6, 1).translate(0.35, 0, 0);
  const flag = at(mesh(flagGeo, MAT.canvas(p.flag || '#e8b02a')), 0, h * 1.85 + 1.1, 0);
  g.add(flag);
  ctx.anim((t) => { const fp = flagGeo.attributes.position; for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(t * 6 + fp.getX(i) * 6) * 0.06 * fp.getX(i)); fp.needsUpdate = true; });
  g.add(at(mesh(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshBasicMaterial({ color: '#1a0c06' }), { cast: false }), 0, 1.0, r + 0.03));
  g.add(at(mesh(new THREE.PlaneGeometry(0.9, 1.2), glow('#ff9a3a', 0.5), { cast: false }), 0, 0.7, r + 0.035));
  for (const s of [-1, 1]) g.add(rot(at(mesh(new THREE.PlaneGeometry(0.6, 2.1), MAT.canvas(c1)), s * 0.95, 1.05, r + 0.15), 0, s * 0.6));
  g.userData.collider = { w: r * 2, d: r * 2 };
  return g;
};

function profileCup() {
  return new THREE.LatheGeometry([[0, 0.01], [0.05, 0.45], [0.35, 0.6], [0.7, 0.6], [0.72, 0.55]].map(([y, r]) => new THREE.Vector2(r, y)), 16);
}

P.ferris = (p, ctx) => {
  const g = new THREE.Group();
  const R = p.r || 7;
  const steel = std('#d8d0bc', { metal: 0.7, rough: 0.4 });
  for (const s of [-1, 1]) for (const lean of [-1, 1]) {
    const len = R + 2;
    const leg = mesh(new THREE.CylinderGeometry(0.1, 0.16, len, 8), steel);
    leg.position.set(lean * 2.2, len / 2 - 0.4, s * 1.0);
    leg.rotation.z = -lean * 0.3;
    g.add(leg);
  }
  const wheel = new THREE.Group();
  wheel.position.y = R + 1.4;
  g.add(wheel);
  for (const z of [-0.8, 0.8]) {
    wheel.add(at(mesh(new THREE.TorusGeometry(R, 0.07, 6, 64), steel), 0, 0, z));
    wheel.add(at(mesh(new THREE.TorusGeometry(R * 0.85, 0.05, 6, 64), steel), 0, 0, z));
  }
  wheel.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 16).rotateX(Math.PI / 2), steel));
  const n = 12, bulbs = [], spokes = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    for (const z of [-0.8, 0.8]) spokes.push(M4(Math.cos(a) * R / 2, Math.sin(a) * R / 2, z, 0, 0, a - Math.PI / 2));
  }
  for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; for (const z of [-0.85, 0.85]) bulbs.push(M4(Math.cos(a) * R, Math.sin(a) * R, z)); }
  wheel.add(instanced(new THREE.CylinderGeometry(0.035, 0.035, R, 4), steel, spokes, false));
  const bm = instanced(new THREE.SphereGeometry(0.09, 6, 4), glow('#ffd06a', 3.5), bulbs, false);
  wheel.add(bm);
  chase(bm, bulbs.length);
  const cars = [];
  for (let i = 0; i < n; i++) {
    const color = ['#a8202f', '#4a2a86', '#d8a020'][i % 3];
    const c = new THREE.Group();
    c.add(mesh(profileCup(), std(color, { metal: 0.3, rough: 0.35, clearcoat: 0.8 })));
    c.add(at(mesh(new THREE.ConeGeometry(0.7, 0.4, 8), std(color, { metal: 0.3, rough: 0.35 })), 0, 1.15, 0));
    for (const s of [-1, 1]) c.add(at(box(0.04, 0.8, 0.04, steel, 1), s * 0.5, 0.7, 0));
    c.add(at(box(0.06, 0.06, 1.0, steel, 1), 0, 1.3, 0));
    c.userData.a = (i / n) * Math.PI * 2;
    wheel.add(c);
    cars.push(c);
  }
  const speed = p.speed ?? 0.06;
  ctx.anim((t) => {
    wheel.rotation.z = t * speed;
    for (const c of cars) {
      const a = c.userData.a;
      c.position.set(Math.cos(a) * R, Math.sin(a) * R - 1.25, 0);
      c.rotation.z = -wheel.rotation.z + Math.sin(t * 1.3 + a) * 0.05;
    }
  });
  g.userData.collider = { w: 6, d: 2.6 };
  return g;
};

function makeHorse(color) {
  const g = new THREE.Group();
  const m = std(color, { rough: 0.3, clearcoat: 1 });
  const gold = MAT.brass();
  g.add(mesh(new THREE.CapsuleGeometry(0.2, 0.55, 6, 12).rotateX(Math.PI / 2), m));
  g.add(rot(at(mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 10), m), 0, 0.25, 0.38), 0.6));
  g.add(rot(at(mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 10), m), 0, 0.42, 0.55), 1.6));
  g.add(rot(at(mesh(new THREE.BoxGeometry(0.04, 0.3, 0.08), gold), 0, 0.35, 0.33), 0.6));
  for (const [x, z, r] of [[-0.1, 0.25, -0.9], [0.1, 0.3, -0.5], [-0.1, -0.25, 0.5], [0.1, -0.3, 0.9]]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.04, 0.35, 3, 6).translate(0, -0.2, 0), m);
    g.add(rot(at(leg, x, -0.08, z), r));
  }
  g.add(at(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.3), std('#a8202f', { rough: 0.4, clearcoat: 1 })), 0, 0.21, 0));
  g.add(rot(at(mesh(new THREE.ConeGeometry(0.06, 0.4, 6), gold), 0, 0.05, -0.5), -2.2));
  return g;
}

P.carousel = (p, ctx) => {
  const g = new THREE.Group();
  const R = p.r || 4;
  const brass = MAT.brass();
  g.add(at(mesh(new THREE.CylinderGeometry(R, R + 0.1, 0.45, 40), MAT.wood('#5a2a5a')), 0, 0.22, 0));
  g.add(rot(at(mesh(new THREE.TorusGeometry(R + 0.05, 0.05, 6, 48), brass), 0, 0.45, 0), Math.PI / 2));
  g.add(at(mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.4, 12), std('#bcc6d0', { metal: 1, rough: 0.08 })), 0, 2.15, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 12), brass), 0, 3.9, 0));
  g.add(at(mesh(new THREE.ConeGeometry(R + 0.5, 1.8, 48, 1, true), new THREE.MeshStandardMaterial({ map: stripeTexture('#a8202f', '#efe4cc', 16), side: THREE.DoubleSide, roughness: 0.8 })), 0, 4.95, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(R + 0.5, R + 0.5, 0.5, 48, 1, true), new THREE.MeshStandardMaterial({ map: stripeTexture('#d8a020', '#4a2a86', 24, true), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.6 })), 0, 3.85, 0));
  const bulbs = [];
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; bulbs.push(M4(Math.cos(a) * (R + 0.52), 4.1, Math.sin(a) * (R + 0.52))); }
  const bm = instanced(new THREE.SphereGeometry(0.08, 6, 4), glow('#ffe08a', 3.5), bulbs, false);
  g.add(bm);
  chase(bm, bulbs.length);
  g.add(at(mesh(new THREE.SphereGeometry(0.3, 12, 8), brass), 0, 6, 0));
  const spin = new THREE.Group();
  g.add(spin);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const h = new THREE.Group();
    h.position.set(Math.cos(a) * (R - 1.1), 0, Math.sin(a) * (R - 1.1));
    h.rotation.y = -a;
    h.add(at(mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.5, 8), brass), 0, 2.1, 0));
    const horse = makeHorse(['#efe4cc', '#2a2a30', '#c9a050'][i % 3]);
    h.add(horse);
    h.userData.horse = horse;
    spin.add(h);
  }
  const speed = p.speed ?? 0.35;
  ctx.anim((t) => {
    spin.rotation.y = t * speed;
    spin.children.forEach((h, i) => { h.userData.horse.position.y = 1.3 + Math.sin(t * 2 + i) * 0.28; });
  });
  if (p.light !== false) ctx.addLight(g, new THREE.Vector3(0, 3.4, 0), '#ffb347', 30, 12);
  g.userData.collider = { w: R * 2, d: R * 2 };
  return g;
};

P.booth = (p) => {
  const g = new THREE.Group();
  g.add(at(box(2, 2.4, 1.6, std(p.color || '#8a1a28', { tex: 'wood', rough: 0.7 }), 1.5), 0, 1.2, 0));
  g.add(at(box(2.2, 0.15, 1.8, MAT.wood('#d8a020'), 1.5), 0, 2.45, 0));
  g.add(rot(at(mesh(new THREE.PlaneGeometry(2.3, 0.9, 1, 4), new THREE.MeshStandardMaterial({ map: stripeTexture('#efe4cc', '#a8202f', 6), side: THREE.DoubleSide, roughness: 0.8 })), 0, 2.25, 1.15), -1.0));
  g.add(at(mesh(new THREE.PlaneGeometry(1.2, 0.8), glow('#ffcf7a', 1.4), { cast: false }), 0, 1.5, 0.81));
  g.add(at(box(1.4, 0.06, 0.4, MAT.wood('#5a3a22'), 1), 0, 1.05, 0.95));
  if (p.sign) {
    const mat = new THREE.MeshStandardMaterial({ map: textTexture(p.sign, { size: 100, w: 512, h: 140, bg: '#1f1a22', fg: '#ffd36a' }), emissive: '#ffffff', emissiveIntensity: 0.5 });
    mat.emissiveMap = mat.map;
    g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), mat), 0, 2.85, 0.75));
    const bulbs = [];
    for (let i = 0; i <= 10; i++) for (const y of [2.58, 3.12]) bulbs.push(M4(-0.95 + i * 0.19, y, 0.78));
    const bm = instanced(new THREE.SphereGeometry(0.04, 6, 4), glow('#ffe08a', 3), bulbs, false);
    g.add(bm);
    chase(bm, bulbs.length);
  }
  g.userData.collider = { w: 2.1, d: 1.7 };
  return g;
};

P.stage = (p, ctx) => {
  const g = new THREE.Group();
  const w = p.w || 8, d = p.d || 4;
  const plat = at(box(w, 0.8, d, MAT.wood('#5a3420'), 2), 0, 0.4, 0);
  plat.userData.collide = true;
  g.add(plat);
  const velvet = std('#7a0a1a', { tex: 'fabric', rough: 0.85, sheen: 1, sheenColor: '#ff7a8a', side: THREE.DoubleSide, normal: 0.5 });
  g.add(at(box(w + 0.05, 0.6, 0.05, velvet, 1), 0, 0.35, d / 2 + 0.01));
  const curtain = (cw, ch) => {
    const geo = new THREE.PlaneGeometry(cw, ch, 32, 8);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 9) * 0.12);
    geo.computeVertexNormals();
    return mesh(geo, velvet);
  };
  for (const s of [-1, 1]) {
    g.add(at(curtain(1.8, 5), s * (w / 2 - 0.7), 3.3, -d / 2 + 0.6));
    g.add(at(mesh(new THREE.TorusGeometry(0.25, 0.05, 6, 12), MAT.brass()), s * (w / 2 - 0.9), 2.2, -d / 2 + 0.75));
  }
  const back = at(curtain(w, 5.2), 0, 3.4, -d / 2 + 0.15);
  back.userData.collide = true;
  g.add(back);
  const arch = new THREE.Shape();
  arch.moveTo(-w / 2 - 0.4, 0); arch.lineTo(-w / 2 - 0.4, 6.4); arch.lineTo(w / 2 + 0.4, 6.4); arch.lineTo(w / 2 + 0.4, 0);
  arch.lineTo(w / 2 - 0.1, 0); arch.lineTo(w / 2 - 0.1, 5.2); arch.quadraticCurveTo(0, 6.2, -w / 2 + 0.1, 5.2); arch.lineTo(-w / 2 + 0.1, 0);
  g.add(at(mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }), std('#3a1020', { tex: 'wood', rough: 0.6 })), 0, 0.8, -d / 2 + 0.85));
  g.add(at(mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w / 2, 6, 0), new THREE.Vector3(0, 7.2, 0), new THREE.Vector3(w / 2, 6, 0)), 30, 0.07, 6), MAT.brass()), 0, 0, -d / 2 + 1.2));
  const bulbs = [];
  for (let i = 0; i < 14; i++) bulbs.push(M4(-w / 2 + 0.5 + i * ((w - 1) / 13), 0.86, d / 2 - 0.15));
  g.add(instanced(new THREE.SphereGeometry(0.07, 8, 6), glow('#ffe7b0', 3), bulbs, false));
  if (p.spot !== false) {
    ctx.addLight(g, new THREE.Vector3(0, 6, 3), '#fff1d0', 40, 14);
    const cone = lightCone('#fff1d0', 1.6, 6.2, 0.1);
    cone.position.set(0, 7, 2.5);
    cone.rotation.x = 0.3;
    g.add(cone);
  }
  g.userData.partColliders = true;
  return g;
};

P.poster = (p) => {
  const tex = textTexture(p.text || ['?'], { w: 384, h: 512, size: p.size || 64, bg: p.bg || '#e8b02a', fg: p.fg || '#3a0f1a', draw: p.face ? drawFace : null });
  const pw = p.w || 1.4;
  const geo = new THREE.PlaneGeometry(pw, pw * 4 / 3, 6, 8);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); if (y < -0.3 * pw && x > 0.2 * pw) pa.setZ(i, (x - 0.2 * pw) * 0.15); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, side: THREE.DoubleSide }));
  m.position.set(0, p.y ?? 1.7, 0.02);
  const g = new THREE.Group();
  g.add(m);
  g.userData.solid = false;
  return g;
};

P.chalk = (p) => {
  const tex = textTexture(p.text || '', {
    w: 1024, h: 512, size: p.size || 90, bg: null, border: false, aged: false, fg: p.fg || '#efeadc', font: '"Comic Neue", cursive',
    draw: (g, w, h) => { g.strokeStyle = p.fg || '#efeadc'; g.lineWidth = 9; drawGrin(g, w / 2, h * 0.3, 120); },
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w || 3, (p.w || 3) / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.y = p.y ?? 1.6;
  const g = new THREE.Group();
  g.add(m);
  g.userData.solid = false;
  return g;
};

P.sign = (p) => {
  const g = new THREE.Group();
  const wood = MAT.wood('#4a3020');
  g.add(at(box(0.12, 2.3, 0.12, wood, 1), 0, 1.15, 0));
  g.add(at(box(p.w || 2, 0.8, 0.08, wood, 1), 0, 2.1, 0));
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry((p.w || 2) - 0.1, 0.7), new THREE.MeshStandardMaterial({ map: textTexture(p.text || '', { size: 80, w: 512, h: 180, bg: p.bg || '#efe4cc' }), roughness: 0.7 })), 0, 2.1, 0.045));
  g.userData.collider = { w: 0.3, d: 0.3 };
  return g;
};

P.stringLights = (p) => {
  const g = new THREE.Group();
  const a = new THREE.Vector3(0, p.h || 4, 0);
  const b = new THREE.Vector3((p.x2 ?? p.x) - p.x, p.h || 4, (p.z2 ?? p.z) - p.z);
  const n = Math.max(10, Math.round(a.distanceTo(b) * 2.5));
  const cols = ['#ffd36a', '#ff5a5a', '#7bd34f', '#7fa8ff'];
  const byCol = cols.map(() => []);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const pt = a.clone().lerp(b, t);
    pt.y -= Math.sin(t * Math.PI) * 0.8;
    pts.push(pt);
    if (i > 0 && i < n) byCol[i % 4].push(M4(pt.x, pt.y - 0.1, pt.z));
  }
  byCol.forEach((ms, i) => { if (ms.length) g.add(instanced(new THREE.SphereGeometry(0.07, 6, 4), glow(cols[i], 3), ms, false)); });
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.012, 4), MAT.iron('#111'), { cast: false }));
  for (const pt of [a, b]) g.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.08, pt.y + 0.3, 6), MAT.wood('#3a2a1a')), pt.x, (pt.y + 0.3) / 2, pt.z));
  g.userData.solid = false;
  return g;
};

P.beam = (p, ctx) => {
  const g = new THREE.Group();
  const cone = lightCone(p.color || '#fff4c4', 3, 45, 0.06);
  cone.rotation.x = Math.PI;
  const pivot = new THREE.Group();
  pivot.add(cone);
  pivot.position.y = p.y ?? 0.5;
  g.add(pivot);
  ctx.anim((t) => { pivot.rotation.set(Math.sin(t * 0.27 + (p.x || 0)) * 0.45, 0, Math.cos(t * 0.19 + (p.z || 0)) * 0.4); });
  g.userData.solid = false;
  return g;
};

P.mirror = (p) => {
  const g = new THREE.Group();
  const w = p.w || 1.2;
  g.add(at(box(w + 0.2, 2.6, 0.12, std(p.frame || '#c9a24a', { metal: 1, rough: 0.35 }), 1), 0, 1.4, 0));
  g.add(at(mesh(new THREE.PlaneGeometry(w, 2.4), std('#cfd8e0', { metal: 1, rough: 0.04 }), { cast: false }), 0, 1.4, 0.07));
  if (p.bulbs !== false) {
    const b = [];
    for (let i = 0; i < 7; i++) for (const x of [-w / 2 - 0.05, w / 2 + 0.05]) b.push(M4(x, 0.4 + i * 0.33, 0.1));
    g.add(instanced(new THREE.SphereGeometry(0.05, 8, 6), glow('#fff0c8', 2.5), b, false));
  }
  return g;
};

P.table = (p, ctx) => {
  const g = new THREE.Group();
  const wood = MAT.wood(p.color || '#5a3a24');
  g.add(at(box(p.w || 1.6, 0.08, p.d || 0.9, wood, 1.5), 0, 0.82, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.8, 8), wood), x * ((p.w || 1.6) / 2 - 0.1), 0.4, z * ((p.d || 0.9) / 2 - 0.1)));
  if (p.items) {
    const candle = at(new THREE.Group(), -0.5, 0.86, 0.1);
    candle.add(at(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), std('#efe8d8', { rough: 0.6 })), 0, 0.11, 0));
    const flame = at(mesh(new THREE.SphereGeometry(0.025, 8, 6), glow('#ffb347', 5), { cast: false }), 0, 0.26, 0);
    candle.add(flame);
    g.add(candle);
    const light = ctx.addLight(g, new THREE.Vector3(-0.5, 1.2, 0.1), '#ffb060', 6, 5);
    ctx.anim((t) => { const f = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.06; flame.scale.set(1, 1.8 * f, 1); if (light) light.intensity = 6 * f; });
    for (let i = 0; i < 5; i++) g.add(rot(at(mesh(new THREE.BoxGeometry(0.06, 0.003, 0.09), std(i % 2 ? '#efe4cc' : '#a8202f', { rough: 0.5 })), 0.25 + i * 0.03, 0.865 + i * 0.002, -0.05), 0, i * 0.25));
    const hatGeo = new THREE.LatheGeometry([[0, 0.001], [0, 0.17], [0.012, 0.172], [0.018, 0.11], [0.03, 0.1], [0.19, 0.105], [0.2, 0.1], [0.2, 0.001]].map(([y, r]) => new THREE.Vector2(r, y)), 24);
    g.add(rot(at(mesh(hatGeo, std('#141216', { tex: 'fabric', rough: 0.7, sheen: 0.6 })), 0, 1.07, 0.15), 0, 0, Math.PI));
  }
  return g;
};

// A GLB/glTF prop (preloaded by the scene). { type:'model', src, height | scale, rot, y, solid, collider:[w,d] }
P.model = (p, ctx) => {
  const g = new THREE.Group();
  const gltf = getModel(p.src);
  if (!gltf) { g.userData.solid = false; return g; }
  const obj = cloneSkinned(gltf.scene);
  g.add(obj);
  if (p.height) fitToHeight(obj, p.height);
  else fitToHeight(obj, 0);
  obj.position.y += p.y || 0;
  if (gltf.animations.length && p.animate !== false) {
    // ambient animation (flags, signs, rides…)
    const mixer = new THREE.AnimationMixer(obj);
    const clip = (p.clip && gltf.animations.find((c) => c.name === p.clip)) || gltf.animations[0];
    mixer.clipAction(clip).play();
    ctx.anim((t, dt) => mixer.update(dt));
  }
  if (p.collider) g.userData.collider = { w: p.collider[0], d: p.collider[1] };
  return g;
};

P.marker = () => new THREE.Group();

function drawGrin(g, cx, cy, r) {
  g.beginPath(); g.arc(cx, cy, r, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.beginPath(); g.arc(cx - r * 0.45, cy - r * 0.45, r * 0.12, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx + r * 0.45, cy - r * 0.45, r * 0.12, 0, Math.PI * 2); g.stroke();
}
function drawFace(g, w, h) {
  // vintage portrait of a stage magician
  g.fillStyle = '#2a1a14'; g.fillRect(w * 0.15, h * 0.1, w * 0.7, h * 0.52);
  g.fillStyle = '#e8c8a0';
  g.beginPath(); g.ellipse(w / 2, h * 0.38, w * 0.15, w * 0.19, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  g.fillRect(w / 2 - w * 0.2, h * 0.18, w * 0.4, w * 0.04);
  g.fillRect(w / 2 - w * 0.13, h * 0.06, w * 0.26, w * 0.17);
  g.fillStyle = '#a8202f'; g.fillRect(w / 2 - w * 0.13, h * 0.17, w * 0.26, w * 0.025);
  g.fillStyle = '#222';
  for (const s of [-1, 1]) { g.beginPath(); g.arc(w / 2 + s * w * 0.055, h * 0.36, 5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#6a2a2a'; g.lineWidth = 4;
  g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.05, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  g.fillStyle = '#1a1a1a';
  g.beginPath(); g.moveTo(w * 0.3, h * 0.62); g.lineTo(w / 2, h * 0.5); g.lineTo(w * 0.7, h * 0.62); g.fill();
}

// ---------------- world ----------------

export class World {
  constructor(renderer, scene, data, quality) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.anims = [];
    this.lights = [];
    this.maxLights = quality === 'low' ? 4 : 10;
    this.quality = quality;
    chaseList = [];
    const env = data.environment || {};
    this.env = env;
    this.bounds = data.bounds || [-30, 30, -30, 30];

    this.sky = new Sky(renderer, scene, env, this.group, quality);
    scene.fog = new THREE.FogExp2(new THREE.Color(env.fog || '#1a1428'), env.fogDensity ?? 0.022);

    this.hemi = new THREE.HemisphereLight(env.skyLight || '#6a6aa8', env.groundLight || '#1a1420', env.ambient ?? 0.6);
    this.group.add(this.hemi);
    this.baseHemi = this.hemi.intensity;
    const moon = new THREE.DirectionalLight(env.moon || '#9fb0ff', env.moonIntensity ?? 0.9);
    moon.position.set(-12, 25, 10);
    if (quality !== 'low') {
      moon.castShadow = true;
      moon.shadow.mapSize.set(2048, 2048);
      const s = 24;
      Object.assign(moon.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
      moon.shadow.bias = -0.0004;
      moon.shadow.normalBias = 0.04;
    }
    this.moon = moon;
    this.baseMoon = moon.intensity;
    this.group.add(moon, moon.target);

    const gs = env.groundSize || 120;
    const gtex = env.groundTex || (env.rain ? 'asphalt' : 'concrete');
    const groundGeo = worldUV(new THREE.PlaneGeometry(gs, gs).rotateX(-Math.PI / 2), gtex === 'wood' ? 2 : 4);
    const ground = new THREE.Mesh(groundGeo, std(env.ground || '#3a3640', { tex: gtex, rough: env.rain ? 0.75 : 1, normal: 1, env: 1.4 }));
    ground.receiveShadow = true;
    this.group.add(ground);
    for (const path of env.paths || []) {
      const pm = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(path.w, path.d).rotateX(-Math.PI / 2), 3), std(path.color || '#5a5260', { tex: path.tex || 'cobble', rough: env.rain ? 0.8 : 1, normal: 1.2, env: 1.4 }));
      pm.position.set(path.x, 0.012, path.z);
      pm.receiveShadow = true;
      this.group.add(pm);
    }

    const ctx = {
      anim: (fn) => this.anims.push(fn),
      addLight: (parent, pos, color, intensity, range) => {
        if (this.lights.length >= this.maxLights) return null;
        const l = new THREE.PointLight(color, intensity, range, 1.7);
        l.position.copy(pos);
        parent.add(l);
        this.lights.push(l);
        return l;
      },
    };
    for (const p of data.props || []) this.addProp(p, ctx);
    this.chase = chaseList;

    if (env.rain) this._makeRain(quality === 'low' ? 900 : 2600);
    this.lightningT = 3 + Math.random() * 5;
    this.flash = 0;
  }

  addProp(p, ctx) {
    const build = P[p.type];
    if (!build) { console.warn('Unknown prop type', p.type); return null; }
    const obj = build(p, ctx);
    obj.position.x += p.x || 0;
    obj.position.z += p.z || 0;
    obj.rotation.y += rad(p.rot);
    if (p.scale) obj.scale.setScalar(p.scale);
    this.group.add(obj);
    obj.updateMatrixWorld(true);
    if (p.solid === false || obj.userData.solid === false) return obj;
    if (obj.userData.partColliders) {
      obj.traverse((o) => { if (o.userData.collide) this._boxCollider(o); });
    } else if (obj.userData.collider) {
      const { w, d } = obj.userData.collider;
      const r = rad(p.rot), c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
      const sc = p.scale || 1;
      const hw = (w * c + d * s) / 2 * sc, hd = (w * s + d * c) / 2 * sc;
      this.colliders.push({ minX: obj.position.x - hw, maxX: obj.position.x + hw, minZ: obj.position.z - hd, maxZ: obj.position.z + hd, maxY: 6 });
    } else {
      this._boxCollider(obj);
    }
    return obj;
  }

  _boxCollider(o) {
    const b = new THREE.Box3();
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      if (c.isMesh && !c.isInstancedMesh) {
        c.geometry.computeBoundingBox();
        b.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
      }
    });
    if (b.isEmpty() || b.min.y > 1.5) return;
    this.colliders.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, maxY: b.max.y });
  }

  _makeRain(n) {
    const pos = new Float32Array(n * 6), col = new Float32Array(n * 6);
    this.rainSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 44, y = Math.random() * 22, z = (Math.random() - 0.5) * 44;
      const len = 0.35 + Math.random() * 0.35;
      pos.set([x, y, z, x + 0.03, y + len, z + 0.03], i * 6);
      col.set([0.75, 0.8, 1, 0.2, 0.22, 0.3], i * 6);
      this.rainSpeed[i] = 20 + Math.random() * 8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    const sn = this.quality === 'low' ? 60 : 160;
    this.splashes = new THREE.InstancedMesh(new THREE.RingGeometry(0.6, 1, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#8a96c8', transparent: true, opacity: 0.16, depthWrite: false }), sn);
    this.splashes.frustumCulled = false;
    this.splashT = new Float32Array(sn).map(() => Math.random());
    this.splashP = Array.from({ length: sn }, () => new THREE.Vector3(0, -10, 0));
    this.group.add(this.splashes);
  }

  // Resolve a circle (x,z,r) against colliders and bounds; mutates and returns pos.
  collide(pos, r) {
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-6) {
          const pens = [pos.x - c.minX, c.maxX - pos.x, pos.z - c.minZ, c.maxZ - pos.z];
          const m = Math.min(...pens);
          if (m === pens[0]) pos.x = c.minX - r; else if (m === pens[1]) pos.x = c.maxX + r;
          else if (m === pens[2]) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
        } else {
          const d = Math.sqrt(d2);
          pos.x = cx + dx / d * r;
          pos.z = cz + dz / d * r;
        }
      }
    }
    const [x0, x1, z0, z1] = this.bounds;
    pos.x = Math.max(x0 + r, Math.min(x1 - r, pos.x));
    pos.z = Math.max(z0 + r, Math.min(z1 - r, pos.z));
    return pos;
  }

  update(dt, t, camPos, onThunder) {
    for (const fn of this.anims) fn(t, dt);
    // marquee chase: every third bulb dims in turn
    const step = Math.floor(t * 6) % 3;
    for (const c of this.chase) {
      if (c.step === step) continue;
      c.step = step;
      for (let i = 0; i < c.n; i++) c.im.setColorAt(i, (i % 3) === step ? DIM : FULL);
      c.im.instanceColor.needsUpdate = true;
    }
    if (this.rain) {
      const a = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < this.rainSpeed.length; i++) {
        const o = i * 6, dy = this.rainSpeed[i] * dt;
        a[o + 1] -= dy; a[o + 4] -= dy;
        if (a[o + 1] < 0) {
          const len = a[o + 4] - a[o + 1];
          const x = camPos.x + (Math.random() - 0.5) * 44, z = camPos.z + (Math.random() - 0.5) * 44, y = 18 + Math.random() * 6;
          a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x + 0.03; a[o + 4] = y + len; a[o + 5] = z + 0.03;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      for (let i = 0; i < this.splashT.length; i++) {
        this.splashT[i] += dt * 2.2;
        if (this.splashT[i] >= 1) {
          this.splashT[i] = 0;
          this.splashP[i].set(camPos.x + (Math.random() - 0.5) * 24, 0.03, camPos.z + (Math.random() - 0.5) * 24);
        }
        const s = 0.02 + this.splashT[i] * 0.09;
        TMP.makeScale(s, 1, s).setPosition(this.splashP[i]);
        this.splashes.setMatrixAt(i, TMP);
      }
      this.splashes.instanceMatrix.needsUpdate = true;
    }
    if (this.env.lightning) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.flash = 1;
        this.lightningT = 7 + Math.random() * 12;
        onThunder && onThunder();
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2.2);
      const f = this.flash > 0.65 || (this.flash > 0.25 && this.flash < 0.42) ? this.flash : 0;
      this.hemi.intensity = this.baseHemi + f * 3;
      this.moon.intensity = this.baseMoon + f * 6;
      this.sky.setFlash(f);
    }
    this.sky.update(t, camPos);
    this.moon.position.set(camPos.x - 12, 25, camPos.z + 10);
    this.moon.target.position.set(camPos.x, 0, camPos.z);
  }

  dispose() {
    this.scene.remove(this.group);
    this.sky.dispose();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
  }
}
const DIM = new THREE.Color(0.12, 0.12, 0.12), FULL = new THREE.Color(1, 1, 1);
const TMP = new THREE.Matrix4();
