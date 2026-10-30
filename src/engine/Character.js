import * as THREE from '../../vendor/three.module.js';
import { RoundedBoxGeometry } from '../../vendor/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { std, glow, mesh } from './Materials.js';

// Procedurally sculpted humanoid built from a story "look" description.
// Smooth lathe-modelled anatomy, a deformed-sphere head with eyes/lids/brows/lips,
// tailored clothing, and a procedural animation set: idle/breathing, walk/run,
// punch combo, kick, hit, dodge, knockdown, talk (lip-sync), blink, look-at.

// ---------- geometry helpers ----------

// Rounded, tapered limb: top at y=0 hanging down to y=-len.
function limbGeo(len, r0, r1, bulge = 0.12, seg = 14) {
  const pts = [];
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(r0 * Math.sin(a), r0 * Math.cos(a))); }
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const r = THREE.MathUtils.lerp(r0, r1, t) * (1 + bulge * Math.sin(Math.min(1, t * 1.6) * Math.PI));
    pts.push(new THREE.Vector2(r, -t * len));
  }
  for (let i = 0; i <= 4; i++) { const a = Math.PI / 2 + (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, r1 * Math.sin(a)), -len + r1 * Math.cos(a))); }
  pts.reverse();
  return new THREE.LatheGeometry(pts, seg);
}

// Lathe from a [y, r] profile (bottom → top), with x/z scaling for flattened bodies.
function profileGeo(profile, sx = 1, sz = 1, seg = 24, open = false) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(Math.max(r, 0.0001), y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(sx, 1, sz);
  if (!open) g.computeVertexNormals();
  return g;
}

function headGeo() {
  const g = new THREE.SphereGeometry(1, 40, 30);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // jaw taper + chin
    if (y < 0) {
      const k = -y;
      x *= 1 - 0.32 * k * k;
      if (z > 0) z *= 1 - 0.1 * k;
      if (y < -0.7 && z > 0.2) z += 0.08 * (k - 0.7) * 3;
    }
    // fuller cranium at the back
    if (z < 0 && y > -0.2) z *= 1.12;
    // brow ridge and eye sockets
    if (z > 0.6 && y > 0.05 && y < 0.35) {
      const ex = Math.abs(x) - 0.38;
      const sock = Math.max(0, 1 - (ex * ex + (y - 0.18) ** 2) / 0.04);
      z -= sock * 0.06;
      if (y > 0.28) z += 0.03;
    }
    // cheekbones
    if (z > 0.3 && y < 0.05 && y > -0.35) x *= 1 + 0.06 * (1 - Math.abs(y + 0.15) / 0.2);
    p.setXYZ(i, x * 0.088, y * 0.118, z * 0.102);
  }
  g.computeVertexNormals();
  return g;
}

function handGeo(fist) {
  const parts = [];
  const palm = new RoundedBoxGeometry(0.075, 0.085, 0.032, 2, 0.012);
  palm.translate(0, -0.045, 0);
  parts.push(palm);
  for (let f = 0; f < 4; f++) {
    const len = [0.06, 0.07, 0.066, 0.052][f];
    const fg = new THREE.CapsuleGeometry(0.0085, len, 3, 6);
    fg.translate(0, -len / 2, 0);
    const m = new THREE.Matrix4().makeRotationX(fist ? 1.9 : 0.35);
    fg.applyMatrix4(m);
    fg.translate(-0.027 + f * 0.018, -0.09, fist ? 0.01 : 0);
    parts.push(fg);
  }
  const th = new THREE.CapsuleGeometry(0.01, 0.045, 3, 6);
  th.translate(0, -0.022, 0);
  th.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.7).premultiply(new THREE.Matrix4().makeRotationY(fist ? 0.9 : 0.3)));
  th.translate(0.035, -0.035, 0.012);
  parts.push(th);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

function bootGeo() {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(0.052, 0.058, 0.12, 14);
  shaft.translate(0, 0.0, 0);
  const foot = new THREE.SphereGeometry(1, 16, 10);
  foot.scale(0.055, 0.045, 0.13);
  foot.translate(0, -0.06, 0.05);
  const sole = new RoundedBoxGeometry(0.11, 0.025, 0.27, 2, 0.01);
  sole.translate(0, -0.095, 0.045);
  parts.push(shaft.toNonIndexed(), foot.toNonIndexed(), sole.toNonIndexed());
  return mergeGeometries(parts);
}

const shared = {};
const once = (k, f) => shared[k] || (shared[k] = f());

function faceTexture(kind, paint = '#f4f0e6', accent = '#c0283a') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = paint; g.fillRect(0, 0, 256, 256);
  // porcelain mask: hollow eyes + painted grin
  g.fillStyle = '#0b0812';
  for (const x of [92, 164]) { g.beginPath(); g.ellipse(x, 104, 20, 13, x < 128 ? 0.25 : -0.25, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = accent; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.arc(128, 128, 62, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
  g.lineWidth = 4;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 58, 152); g.lineTo(128 + s * 70, 140); g.stroke(); }
  g.fillStyle = 'rgba(192,40,58,.35)';
  for (const x of [80, 176]) { g.beginPath(); g.arc(x, 150, 14, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- character ----------

export class Character {
  constructor(look = {}) {
    const L = {
      skin: '#d9a888', top: '#3a3550', pants: '#25222f', shoes: '#18151c', hair: '#2a1d14', eyes: '#4a3424',
      hairStyle: 'short', height: 1, build: 1, figure: 'regular', ...look,
    };
    this.look = L;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.scale.set(L.build, L.height, L.build);

    const slim = L.figure === 'slim';
    const cloth = (c, o = {}) => std(c, { tex: 'fabric', rough: 0.95, sheen: 0.5, sheenColor: '#ffffff', normal: 0.3, ...o });
    const leather = (c) => std(c, { tex: 'leather', rough: 0.55, clearcoat: L.wet ? 0.6 : 0.2, clearcoatRough: 0.25, normal: 0.5 });
    const skinM = std(L.skin, { tex: 'skin', rough: 0.6, normal: 0.3 });
    const faceM = L.facePaint ? std(L.facePaint, { rough: 0.45, clearcoat: 0.3 }) : skinM;
    const topM = L.leather ? leather(L.top) : cloth(L.top);
    const sleeveM = L.sleeve ? (L.sleeve === L.skin ? skinM : cloth(L.sleeve)) : topM;
    const pantsM = L.leather ? leather(L.pants) : (L.pants === L.skin ? skinM : cloth(L.pants));
    const shoeM = std(L.shoes, { tex: 'leather', rough: 0.35, clearcoat: 0.5, normal: 0.4 });
    const gloveM = L.gloves ? (L.leather ? leather(L.gloves) : std(L.gloves, { tex: 'fabric', rough: 0.7, normal: 0.4 })) : skinM;
    const hairM = std(L.hair, { rough: L.hairStyle === 'slick' ? 0.3 : 0.65, clearcoat: L.hairStyle === 'slick' ? 0.6 : 0 });
    const accentM = L.accent ? cloth(L.accent) : null;
    const goldM = std('#d9b45a', { metal: 1, rough: 0.3 });
    this.mats = { skinM, topM };

    // ----- hips & legs -----
    this.hips = new THREE.Group();
    this.hips.position.y = 0.98;
    this.body.add(this.hips);
    const pelvis = mesh(profileGeo([[-0.13, 0.05], [-0.1, 0.11], [-0.04, slim ? 0.155 : 0.15], [0.04, slim ? 0.14 : 0.15]], 1, 0.72), pantsM);
    this.hips.add(pelvis);

    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0.088 * side, -0.07, 0);
      this.hips.add(hip);
      hip.add(mesh(limbGeo(0.42, slim ? 0.072 : 0.078, 0.052, 0.12), pantsM));
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);
      knee.add(mesh(limbGeo(0.4, 0.052, 0.038, 0.18), pantsM));
      const boot = mesh(once('boot', bootGeo), shoeM);
      boot.position.set(0, -0.37, 0.0);
      knee.add(boot);
      return { hip, knee };
    });

    // ----- torso -----
    this.torso = new THREE.Group();
    this.torso.position.y = 0.04;
    this.hips.add(this.torso);
    this.chest = new THREE.Group();
    this.torso.add(this.chest);
    const tp = slim
      ? [[0, 0.13], [0.08, 0.118], [0.18, 0.125], [0.3, 0.15], [0.4, 0.162], [0.48, 0.158], [0.54, 0.12], [0.58, 0.07], [0.6, 0.05]]
      : [[0, 0.142], [0.08, 0.135], [0.18, 0.145], [0.3, 0.172], [0.41, 0.186], [0.48, 0.182], [0.54, 0.14], [0.58, 0.075], [0.6, 0.052]];
    this.chest.add(mesh(profileGeo(tp, 1.12, 0.56, 28), topM));
    for (const s of [-1, 1]) {
      // deltoids round off the shoulder line
      const d = mesh(new THREE.SphereGeometry(0.068, 16, 12), sleeveM);
      d.scale.set(1.05, 0.85, 1);
      d.position.set(0.19 * s, 0.485, 0);
      this.chest.add(d);
    }
    if (L.accent && L.tie !== false) {
      const tie = mesh(new THREE.CylinderGeometry(0.014, 0.034, 0.26, 4), accentM, { cast: false });
      tie.scale.z = 0.25;
      tie.position.set(0, 0.37, 0.104);
      tie.rotation.x = -0.14;
      this.chest.add(tie);
    }
    if (L.buttons) {
      for (let i = 0; i < 3; i++) {
        const b = mesh(new THREE.SphereGeometry(0.012, 8, 6), goldM);
        b.position.set(-0.05, 0.16 + i * 0.1, 0.112 + i * 0.006);
        this.chest.add(b);
      }
    }
    if (L.badge) {
      const b = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 6), std(L.badge, { metal: 1, rough: 0.25 }));
      b.rotation.x = Math.PI / 2;
      b.position.set(-0.09, 0.42, 0.12);
      this.chest.add(b);
    }
    if (L.emblem) {
      // a stylised nightjar in flight
      const s = new THREE.Shape();
      s.moveTo(0, 0.02); s.quadraticCurveTo(0.05, 0.05, 0.11, 0.02); s.quadraticCurveTo(0.06, 0.015, 0.03, -0.02);
      s.lineTo(0, -0.05); s.lineTo(-0.03, -0.02); s.quadraticCurveTo(-0.06, 0.015, -0.11, 0.02); s.quadraticCurveTo(-0.05, 0.05, 0, 0.02);
      const e = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }), std(L.emblem, { metal: 0.9, rough: 0.3 }));
      e.position.set(0, 0.4, 0.118);
      this.chest.add(e);
    }
    if (L.belt) {
      const belt = mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 28), std(L.belt, { tex: 'leather', rough: 0.5 }));
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1.04, 0.72, 1);
      belt.position.y = 0.03;
      this.torso.add(belt);
      for (let i = -2; i <= 2; i++) {
        if (!i) continue;
        const pouch = mesh(new RoundedBoxGeometry(0.045, 0.06, 0.03, 2, 0.008), std(L.belt, { tex: 'leather', rough: 0.5 }));
        const a = i * 0.45;
        pouch.position.set(Math.sin(a) * 0.16, 0.02, Math.cos(a) * 0.115);
        pouch.rotation.y = a;
        this.torso.add(pouch);
      }
      const buckle = mesh(new RoundedBoxGeometry(0.05, 0.04, 0.012, 2, 0.006), goldM);
      buckle.position.set(0, 0.03, 0.112);
      this.torso.add(buckle);
    }

    // ----- coat skirt / dress -----
    if (L.coat) {
      const len = L.coatLength || 0.6;
      const coatM = L.coat === L.top ? topM : cloth(L.coat);
      const c = std(L.coat, { tex: 'fabric', rough: 0.95, sheen: 0.6, side: THREE.DoubleSide, normal: 0.6 });
      const prof = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([-len * (1 - t), THREE.MathUtils.lerp(0.29 + (L.flare || 0), 0.16, Math.pow(t, 0.8))]); }
      this.coat = mesh(profileGeo(prof, 1.02, 0.8, 30, true), c);
      this.coat.position.y = 0.1;
      this.hips.add(this.coat);
      if (L.tails) {
        for (const s of [-1, 1]) {
          const tail = mesh(new THREE.PlaneGeometry(0.13, 0.5, 1, 6), std(L.coat, { tex: 'fabric', rough: 0.9, side: THREE.DoubleSide }));
          tail.geometry.translate(0, -0.25, 0);
          tail.position.set(0.07 * s, 0.05, -0.13);
          tail.rotation.x = 0.12;
          this.hips.add(tail);
        }
      }
      if (L.collar !== false) {
        const collar = mesh(new THREE.TorusGeometry(0.085, 0.025, 8, 20, Math.PI * 1.4), coatM);
        collar.rotation.set(Math.PI / 2 - 0.4, 0, Math.PI * 0.3 + Math.PI);
        collar.position.set(0, 0.57, -0.01);
        this.chest.add(collar);
      }
    }

    // ----- arms -----
    this.arms = [-1, 1].map((side) => {
      const sh = new THREE.Group();
      sh.position.set(0.215 * side, 0.49, 0);
      this.chest.add(sh);
      sh.add(mesh(limbGeo(0.28, 0.056, 0.044, 0.15), sleeveM));
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      sh.add(elbow);
      elbow.add(mesh(limbGeo(0.25, 0.045, 0.034, 0.16), sleeveM));
      if (L.cuffs) {
        const cuff = mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.06, 12), cloth(L.cuffs));
        cuff.position.y = -0.24;
        elbow.add(cuff);
      }
      const wrist = new THREE.Group();
      wrist.position.y = -0.26;
      elbow.add(wrist);
      const open = mesh(once('handOpen', () => handGeo(false)), gloveM);
      const fist = mesh(once('handFist', () => handGeo(true)), gloveM);
      if (side < 0) { open.scale.x = -1; fist.scale.x = -1; }
      fist.visible = false;
      wrist.add(open, fist);
      sh.rotation.z = 0.07 * side;
      return { sh, elbow, wrist, open, fist, side };
    });

    // ----- cape -----
    if (L.cape) {
      const W = 0.62, H = 1.18;
      const capeGeo = new THREE.PlaneGeometry(W, H, 10, 14);
      const pa = capeGeo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i);
        const f = (H / 2 - y) / H;
        // widen toward the hem and scallop the bottom edge like folded wings
        pa.setX(i, x * (0.75 + f * 0.55));
        pa.setZ(i, Math.sin((x / W) * Math.PI * 7) * 0.025 * f);   // vertical folds
        if (f > 0.97) pa.setY(i, y + Math.abs(Math.sin((x / W) * Math.PI * 3)) * 0.07);
      }
      capeGeo.translate(0, -H / 2, 0);
      capeGeo.computeVertexNormals();
      this.cape = new THREE.Mesh(capeGeo, std(L.cape, { tex: 'leather', rough: 0.6, clearcoat: L.wet ? 0.4 : 0, clearcoatRough: 0.3, sheen: 0.25, sheenColor: '#4a4060', side: THREE.DoubleSide, normal: 0.5 }));
      this.cape.castShadow = true;
      this.cape.frustumCulled = false;
      this.cape.position.set(0, 0.55, -0.11);
      this.chest.add(this.cape);
      this.capeBase = Float32Array.from(capeGeo.attributes.position.array);
      for (const s of [-1, 1]) {
        const drape = mesh(new THREE.SphereGeometry(0.08, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), std(L.cape, { tex: 'fabric', rough: 0.85, sheen: 0.8, side: THREE.DoubleSide }));
        drape.scale.set(1.15, 0.9, 1.1);
        drape.position.set(0.19 * s, 0.5, -0.005);
        this.chest.add(drape);
      }
    }

    // ----- neck & head -----
    this.neck = new THREE.Group();
    this.neck.position.y = 0.55;
    this.chest.add(this.neck);
    this.neck.add(mesh(limbGeo(0.07, 0.048, 0.05, 0).translate(0, 0.1, 0), L.cowl ? leather(L.cowl) : faceM));
    this.head = new THREE.Group();
    this.head.position.y = 0.15;
    this.neck.add(this.head);
    const headMesh = mesh(once('head', headGeo), faceM);
    this.head.add(headMesh);

    // ears + nose
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(1, 10, 8), faceM);
      ear.scale.set(0.012, 0.03, 0.02);
      ear.position.set(0.086 * s, 0.0, -0.005);
      ear.rotation.y = 0.3 * s;
      this.head.add(ear);
    }
    const nose = mesh(once('nose', () => {
      const g = new THREE.SphereGeometry(1, 12, 10);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setXYZ(i, p.getX(i) * 0.0105 * (1.2 - y * 0.4), y * 0.026, p.getZ(i) * 0.013 * (1.1 - y * 0.5));
      }
      g.computeVertexNormals();
      return g;
    }), faceM);
    nose.position.set(0, -0.01, 0.099);
    nose.rotation.x = -0.12;
    this.head.add(nose);

    // eyes, lids, brows
    const white = std('#f2efe8', { rough: 0.15, clearcoat: 1 });
    const iris = std(L.eyes, { rough: 0.2 });
    const pupil = std('#050505', { rough: 0.1 });
    this.eyes = []; this.lids = []; this.brows = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(0.031 * s, 0.02, 0.078);
      const ball = mesh(new THREE.SphereGeometry(0.0145, 14, 10), white, { cast: false });
      const ir = mesh(new THREE.SphereGeometry(0.0082, 12, 8), iris, { cast: false });
      ir.scale.z = 0.45; ir.position.z = 0.0118;
      const pu = mesh(new THREE.SphereGeometry(0.0042, 8, 6), pupil, { cast: false });
      pu.scale.z = 0.4; pu.position.z = 0.0136;
      eye.add(ball, ir, pu);
      this.head.add(eye);
      this.eyes.push(eye);
      const lid = mesh(new THREE.SphereGeometry(0.0158, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), faceM, { cast: false });
      lid.position.copy(eye.position);
      lid.rotation.x = -0.9;
      this.head.add(lid);
      this.lids.push(lid);
      if (!L.cowl) {
        const brow = mesh(new THREE.CapsuleGeometry(0.0045, 0.03, 2, 6), std(L.brows || L.hair, { rough: 0.8 }), { cast: false });
        brow.rotation.z = Math.PI / 2 + (L.browAngle || 0) * s;
        brow.position.set(0.033 * s, 0.047, 0.088);
        this.head.add(brow);
        this.brows.push(brow);
      }
      if (L.eyeShadow) {
        const sh = mesh(new THREE.CircleGeometry(0.022, 16), std(L.eyeShadow, { rough: 0.8, transparent: true, opacity: 0.85 }), { cast: false });
        sh.position.set(0.032 * s, 0.024, 0.0905);
        sh.scale.y = 1.3;
        this.head.add(sh);
      }
    }

    // mouth: dark interior + lips; the lower lip rides a jaw value driven by speech
    const lipM = std(L.lips || new THREE.Color(L.skin).multiplyScalar(0.78).getStyle(), { rough: 0.35, clearcoat: L.lips ? 0.6 : 0 });
    const grinW = L.grinWide ? 1.7 : 1;
    this.mouthInside = mesh(new THREE.CircleGeometry(0.015, 16), std('#2a0a0e', { rough: 1 }), { cast: false });
    this.mouthInside.position.set(0, -0.052, 0.0905);
    this.mouthInside.scale.set(grinW * 1.0, 0.1, 1);
    this.head.add(this.mouthInside);
    const lipGeo = new THREE.CapsuleGeometry(0.0036, 0.026, 3, 10);
    lipGeo.rotateZ(Math.PI / 2);
    this.upperLip = mesh(lipGeo, lipM, { cast: false });
    this.upperLip.position.set(0, -0.047, 0.093);
    this.upperLip.scale.set(grinW, 0.9, 0.55);
    this.lowerLip = mesh(lipGeo, lipM, { cast: false });
    this.lowerLip.position.set(0, -0.056, 0.0915);
    this.lowerLip.scale.set(grinW * 0.9, 1.15, 0.55);
    this.head.add(this.upperLip, this.lowerLip);
    if (L.grinWide) {
      // a painted smile that runs past the mouth corners
      const arc = mesh(new THREE.TorusGeometry(0.046, 0.0042, 6, 24, Math.PI * 0.75), lipM, { cast: false });
      arc.rotation.z = Math.PI + Math.PI * 0.125;
      arc.position.set(0, -0.02, 0.083);
      arc.rotation.x = -0.25;
      this.head.add(arc);
      this.upperLip.visible = false;
    }
    if (L.mustache) {
      const m = mesh(new THREE.CapsuleGeometry(0.007, 0.045, 3, 6), std(L.hair, { rough: 0.8 }), { cast: false });
      m.rotation.z = Math.PI / 2;
      m.position.set(0, -0.035, 0.098);
      this.head.add(m);
    }

    // porcelain grin mask (henchmen)
    if (L.mask) {
      const mask = mesh(new THREE.SphereGeometry(0.108, 24, 18, 0, Math.PI, Math.PI * 0.2, Math.PI * 0.62),
        new THREE.MeshPhysicalMaterial({ map: faceTexture('grin', L.mask, L.grin || '#c0283a'), roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide }));
      mask.scale.set(0.92, 1.12, 1.04);
      mask.position.set(0, -0.004, 0.002);
      this.head.add(mask);
    }

    // cowl: helmet with a beaked brow, feather crest and glowing lenses
    if (L.cowl) {
      const cowlM = leather(L.cowl);
      const helm = mesh(new THREE.SphereGeometry(0.112, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.62), cowlM);
      helm.scale.set(0.86, 1.1, 1.03);
      helm.rotation.x = -0.42;
      helm.position.set(0, 0.012, -0.004);
      this.head.add(helm);
      const back = mesh(new THREE.SphereGeometry(0.11, 24, 16, Math.PI, Math.PI, 0, Math.PI), cowlM);
      back.scale.set(0.84, 1.08, 0.98);
      this.head.add(back);
      const beak = mesh(new THREE.ConeGeometry(0.03, 0.08, 4), cowlM);
      beak.rotation.set(Math.PI / 2 + 0.7, 0, Math.PI / 4);
      beak.scale.set(1.4, 1, 0.6);
      beak.position.set(0, 0.05, 0.118);
      this.head.add(beak);
      for (const s of [-1, 1]) {
        const lens = mesh(new THREE.CircleGeometry(0.014, 3), glow('#e9f3ff', 4), { cast: false });
        lens.scale.set(1.5, 0.6, 1);
        lens.rotation.set(-0.15, 0.25 * s, -0.25 * s);
        lens.position.set(0.034 * s, 0.026, 0.1175);
        this.head.add(lens);
        const crest = mesh(new THREE.ConeGeometry(0.012, 0.09, 4), cowlM);
        crest.position.set(0.03 * s, 0.1, -0.07);
        crest.rotation.set(-1.0, 0, -0.35 * s);
        this.head.add(crest);
      }
      this.eyes.forEach((e) => (e.visible = false));
      this.lids.forEach((e) => (e.visible = false));
    }

    // ----- hair -----
    const hs = L.hairStyle;
    if (!L.cowl && hs !== 'bald' && !L.mask) {
      const cap = mesh(new THREE.SphereGeometry(0.1, 28, 18, 0, Math.PI * 2, 0, hs === 'slick' ? 1.55 : 1.7), hairM);
      cap.scale.set(0.95, 1.18, 1.1);
      cap.rotation.x = hs === 'slick' ? -0.55 : -0.48;
      cap.position.set(0, 0.012, -0.008);
      this.head.add(cap);
      if (hs === 'short' || hs === 'bun' || hs === 'long') {
        const fringe = mesh(new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, 1.2), hairM);
        fringe.scale.set(1.35, 0.5, 0.9);
        fringe.position.set(0, 0.085, 0.045);
        fringe.rotation.x = 0.4;
        this.head.add(fringe);
      }
      if (hs === 'bun') {
        const bun = mesh(new THREE.SphereGeometry(0.042, 16, 12), hairM);
        bun.position.set(0, 0.06, -0.11);
        this.head.add(bun);
      }
      if (hs === 'long') {
        const back = mesh(profileGeo([[-0.2, 0.07], [-0.12, 0.09], [0, 0.098], [0.05, 0.09]], 1.0, 0.75, 20), hairM);
        back.position.set(0, 0, -0.035);
        this.head.add(back);
      }
    }
    if (hs === 'bald' && !L.cowl) {
      // stubble shadow on the scalp
      const shade = mesh(new THREE.SphereGeometry(0.1, 24, 14, 0, Math.PI * 2, 0, 1.3), std(new THREE.Color(L.skin).multiplyScalar(0.85).getStyle(), { rough: 0.7 }));
      shade.scale.set(0.93, 1.17, 1.08);
      shade.rotation.x = -0.5;
      shade.position.y = 0.006;
      this.head.add(shade);
    }

    // ----- hats -----
    const hatM = std(L.hatColor || '#151218', { tex: 'fabric', rough: 0.75, sheen: 0.5, normal: 0.5 });
    if (L.hat === 'top') {
      const hat = mesh(profileGeo([[0, 0.001], [0.0, 0.17], [0.012, 0.172], [0.018, 0.11], [0.03, 0.1], [0.19, 0.105], [0.2, 0.1], [0.2, 0.001]], 1, 0.92, 28), hatM);
      hat.position.y = 0.088;
      hat.rotation.z = 0.08;
      const band = mesh(new THREE.CylinderGeometry(0.102, 0.101, 0.03, 28), cloth(L.hatBand || '#d8323c'));
      band.scale.z = 0.92;
      band.position.y = 0.035;
      hat.add(band);
      this.head.add(hat);
    } else if (L.hat === 'fedora') {
      const hat = mesh(profileGeo([[0, 0.001], [0.0, 0.16], [0.015, 0.165], [0.02, 0.105], [0.08, 0.1], [0.11, 0.08], [0.115, 0.001]], 1, 0.95, 28), hatM);
      hat.position.y = 0.08;
      hat.rotation.x = -0.08;
      const band = mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.022, 28), cloth('#1a1a1a'));
      band.position.y = 0.032;
      hat.add(band);
      this.head.add(hat);
    } else if (L.hat === 'cap') {
      const crown = mesh(profileGeo([[0, 0.1], [0.03, 0.11], [0.06, 0.12], [0.075, 0.1], [0.078, 0.001]], 1, 0.98, 24), hatM);
      crown.position.y = 0.07;
      const visor = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 20, 1, false, -Math.PI * 0.35, Math.PI * 0.7), std('#0d0d10', { rough: 0.2, clearcoat: 1 }));
      visor.position.set(0, 0.075, 0.02);
      visor.rotation.x = 0.15;
      this.head.add(crown, visor);
    } else if (L.hat === 'hood') {
      const hood = mesh(new THREE.SphereGeometry(0.135, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.72), std(L.top, { tex: 'fabric', rough: 0.95, sheen: 0.5, side: THREE.DoubleSide }));
      hood.rotation.x = -Math.PI / 2 + 0.3;
      hood.scale.set(1, 1.05, 1.15);
      hood.position.set(0, 0.0, -0.02);
      this.head.add(hood);
    }

    // contact shadow blob
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;
    blob.renderOrder = 1;
    this.root.add(blob);

    this.t = Math.random() * 10;
    this.speed = 0;
    this.action = null;
    this.downed = false;
    this.talking = false;
    this.mouth = 0;          // 0..1, set by voice playback
    this.mouthTarget = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.lookYaw = 0;        // desired head yaw relative to body
    this.fist = false;
  }

  play(type, dur, extra = {}) { this.action = { type, t: 0, dur, ...extra }; }
  get busy() { return this.action && this.action.t < this.action.dur; }

  setFist(on) {
    if (on === this.fist) return;
    this.fist = on;
    for (const a of this.arms) { a.open.visible = !on; a.fist.visible = on; }
  }

  update(dt) {
    this.t += dt;
    const t = this.t, sp = this.speed;
    const [lL, lR] = this.legs;
    const [aL, aR] = this.arms;

    // locomotion
    const freq = 5.5 + sp * 4.5;
    const ph = t * freq;
    const swing = Math.sin(ph) * (0.08 + sp * 0.7);
    lL.hip.rotation.x = swing; lR.hip.rotation.x = -swing;
    lL.knee.rotation.x = Math.max(0, -Math.sin(ph - 0.6)) * sp * 1.2 + 0.03;
    lR.knee.rotation.x = Math.max(0, Math.sin(ph - 0.6)) * sp * 1.2 + 0.03;
    const armSwing = swing * (this.fist ? 0.5 : 0.85);
    aL.sh.rotation.set(-armSwing, 0, -0.07 - sp * 0.05);
    aR.sh.rotation.set(armSwing, 0, 0.07 + sp * 0.05);
    const bend = this.fist ? 1.2 : 0.15 + sp * 0.7;
    aL.elbow.rotation.x = -bend; aR.elbow.rotation.x = -bend;
    if (this.fist && sp < 0.3) { aL.sh.rotation.x = -0.45; aR.sh.rotation.x = -0.3; aL.elbow.rotation.x = -1.7; aR.elbow.rotation.x = -1.6; }
    this.body.position.y = Math.abs(Math.cos(ph)) * 0.045 * sp;
    this.hips.rotation.y = Math.sin(ph) * 0.12 * sp;
    this.hips.rotation.z = Math.cos(ph) * 0.04 * sp;
    this.torso.rotation.set(sp * 0.12 + (this.fist ? 0.08 : 0), -Math.sin(ph) * 0.18 * sp, 0);
    // breathing
    const br = Math.sin(t * 1.6);
    this.chest.scale.set(1 + br * 0.008, 1 + br * 0.004, 1 + br * 0.012);
    this.body.rotation.set(0, 0, 0);
    this.head.rotation.set(Math.sin(t * 0.7) * 0.02, 0, 0);
    if (this.coat) this.coat.rotation.x = -sp * 0.2 + Math.sin(ph) * 0.03 * sp;

    // head look-at (yaw relative to body, clamped)
    this.curLook = THREE.MathUtils.lerp(this.curLook || 0, THREE.MathUtils.clamp(this.lookYaw, -1, 1), 1 - Math.exp(-dt * 5));
    this.neck.rotation.y = this.curLook * 0.4;
    this.head.rotation.y = this.curLook * 0.6;

    // speech: jaw/lips follow the voice envelope (or a procedural flap without audio)
    const target = this.talking ? (this.voiceDriven ? this.mouthTarget : Math.max(0, Math.sin(t * 13) * Math.sin(t * 5.3)) * 0.8) : 0;
    this.mouth = THREE.MathUtils.lerp(this.mouth, target, 1 - Math.exp(-dt * 25));
    const m = this.mouth;
    this.lowerLip.position.y = -0.056 - m * 0.014;
    this.mouthInside.scale.y = 0.1 + m * 0.9;
    this.mouthInside.position.y = -0.052 - m * 0.006;
    if (this.talking) {
      this.head.rotation.x += Math.sin(t * 7) * 0.03 * (0.3 + m);
      if (!this.fist) { aR.sh.rotation.x = -0.35 + Math.sin(t * 2.3) * 0.15; aR.elbow.rotation.x = -1.0 + Math.sin(t * 3.1) * 0.2; }
    }

    // blinking
    this.blinkT -= dt;
    let lid = -0.9;
    if (this.blinkT < 0.12) lid = -0.9 + (1 - Math.abs(this.blinkT - 0.06) / 0.06) * 1.2;
    if (this.blinkT <= 0) this.blinkT = 2 + Math.random() * 4;
    for (const l of this.lids) l.rotation.x = lid;

    // actions
    const a = this.action;
    if (a && a.t < a.dur) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      if (a.type === 'punch') {
        const arm = a.side > 0 ? aR : aL;
        const e = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
        const ee = e * e * (3 - 2 * e);
        arm.sh.rotation.x = THREE.MathUtils.lerp(-0.4, -1.55, ee);
        arm.sh.rotation.z = -0.15 * arm.side * ee;
        arm.elbow.rotation.x = THREE.MathUtils.lerp(-1.7, -0.05, ee);
        this.torso.rotation.y = 0.55 * ee * -a.side;
        this.hips.rotation.y = 0.2 * ee * -a.side;
        lL.hip.rotation.x = -0.25 * ee; lR.hip.rotation.x = 0.2 * ee;
      } else if (a.type === 'kick') {
        const e = Math.sin(k * Math.PI);
        lR.hip.rotation.x = -1.6 * e; lR.knee.rotation.x = 0.9 * (1 - e) * e + 0.05;
        lL.knee.rotation.x = 0.25 * e;
        this.torso.rotation.x = -0.35 * e;
        aL.sh.rotation.z = -0.6 * e; aR.sh.rotation.z = 0.6 * e;
      } else if (a.type === 'windup') {
        const e = Math.min(1, k * 1.6);
        aR.sh.rotation.x = -0.3 - 1.9 * e; aR.sh.rotation.z = 0.5 * e;
        aR.elbow.rotation.x = -1.5;
        this.torso.rotation.y = -0.5 * e;
        this.torso.rotation.x = -0.1 * e;
      } else if (a.type === 'hit') {
        const e = Math.sin(k * Math.PI);
        this.torso.rotation.x = -0.4 * e;
        this.head.rotation.x = -0.45 * e;
        aL.sh.rotation.x = aR.sh.rotation.x = -0.6 * e;
        aL.sh.rotation.z = -0.5 * e; aR.sh.rotation.z = 0.5 * e;
      } else if (a.type === 'dodge') {
        const e = Math.sin(k * Math.PI);
        this.body.rotation.x = 0.5 * e;
        this.body.position.y = -0.15 * e;
        aL.sh.rotation.x = aR.sh.rotation.x = 1.0 * e;
        lL.knee.rotation.x = lR.knee.rotation.x = 1.0 * e;
        lL.hip.rotation.x = lR.hip.rotation.x = -0.6 * e;
      } else if (a.type === 'gesture') {
        const e = Math.sin(k * Math.PI);
        aR.sh.rotation.x = -1.3 * e; aR.sh.rotation.z = 0.7 * e; aR.elbow.rotation.x = -0.6 * e;
        aL.sh.rotation.x = -0.8 * e; aL.sh.rotation.z = -0.5 * e;
        this.head.rotation.x -= 0.25 * e;
      } else if (a.type === 'laugh') {
        const e = Math.sin(k * Math.PI);
        this.torso.rotation.x = -0.25 * e + Math.sin(t * 22) * 0.04 * e;
        this.head.rotation.x = -0.35 * e;
        aL.sh.rotation.set(-0.6 * e, 0, -0.9 * e); aR.sh.rotation.set(-0.6 * e, 0, 0.9 * e);
        aL.elbow.rotation.x = aR.elbow.rotation.x = -0.9 * e;
        this.mouthInside.scale.y = 0.15 + e * 0.8;
        this.lowerLip.position.y = -0.058 - e * 0.012;
      }
    }
    if (this.downed) {
      this.downT = Math.min(1, (this.downT || 0) + dt * 2.5);
      const e = this.downT * this.downT;
      this.body.rotation.x = -Math.PI / 2 * e;
      this.body.position.y = 0.16 * e;
      aL.sh.rotation.z = -1.2 * e; aR.sh.rotation.z = 1.2 * e;
    } else this.downT = 0;

    // cape cloth: trails with speed, ripples in the wind
    if (this.cape) {
      const pos = this.cape.geometry.attributes.position;
      const base = this.capeBase, arr = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const y = base[i * 3 + 1], x = base[i * 3];
        const f = -y / 1.18;
        arr[i * 3 + 2] = base[i * 3 + 2] - f * f * (0.08 + sp * 0.75) - Math.sin(t * 3.5 + f * 4 + x * 6) * 0.035 * f * (0.5 + sp);
        arr[i * 3] = x * (1 - sp * 0.15 * f);
      }
      pos.needsUpdate = true;
      this.cape.geometry.computeVertexNormals();
      this.cape.rotation.x = 0.04 + sp * 0.2;
    }
  }
}
