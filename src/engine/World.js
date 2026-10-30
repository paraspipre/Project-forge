import * as THREE from 'three';
import { mesh, toon, glow, textTexture } from './Materials.js';

// Builds a playable environment from scene data:
//   environment: { sky, fog, fogNear, fogFar, ambient, moon, ground, rain, lightning, groundSize }
//   props: [{ type, x, z, rot, ...typeSpecific, solid }]
// Exposes colliders (XZ AABBs) and per-frame animation hooks.

const P = {}; // prop builders: (p, ctx) => Object3D

const rad = (deg) => (deg || 0) * Math.PI / 180;

P.box = (p) => {
  const m = mesh(new THREE.BoxGeometry(p.w || 1, p.h || 1, p.d || 1), p.color || '#555', { receive: true });
  m.position.y = (p.h || 1) / 2 + (p.y || 0);
  return m;
};

P.building = (p) => {
  const g = new THREE.Group();
  const w = p.w || 8, h = p.h || 8, d = p.d || 6;
  const body = mesh(new THREE.BoxGeometry(w, h, d), p.color || '#3b3346', { receive: true, outlineWidth: 0.06 });
  body.position.y = h / 2;
  g.add(body);
  const roof = mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), p.trim || '#1d1824');
  roof.position.y = h + 0.15;
  g.add(roof);
  if (p.windows !== false) {
    const lit = glow(p.windowColor || '#f6d27a'), dark = toon('#141019');
    const rows = Math.floor((h - 1) / 2.2), cols = Math.floor(w / 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const face of [1, -1]) {
          const isLit = ((r * 7 + c * 13 + (face > 0 ? 3 : 5) + (p.seed || 0)) % 5) === 0;
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), isLit ? lit : dark);
          win.position.set(-w / 2 + 1 + c * ((w - 2) / Math.max(1, cols - 1)), 2 + r * 2.2, face * (d / 2 + 0.01));
          if (face < 0) win.rotation.y = Math.PI;
          g.add(win);
        }
      }
    }
  }
  if (p.sign) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 6), 1.2), new THREE.MeshBasicMaterial({ map: textTexture(p.sign, { size: 90, bg: p.signBg || '#1d1824', fg: p.signFg || '#f6d27a' }) }));
    s.position.set(0, Math.min(h - 1, 4.2), d / 2 + 0.05);
    g.add(s);
  }
  if (p.door) {
    const door = mesh(new THREE.BoxGeometry(1.6, 2.6, 0.1), p.doorColor || '#140f19', { outline: false });
    door.position.set(0, 1.3, d / 2 + 0.05);
    g.add(door);
  }
  return g;
};

P.wall = (p) => {
  const m = mesh(new THREE.BoxGeometry(p.w || 6, p.h || 3, p.d || 0.4), p.color || '#4a4155', { receive: true });
  m.position.y = (p.h || 3) / 2;
  return m;
};

P.fence = (p) => {
  const g = new THREE.Group();
  const len = p.w || 8, h = p.h || 2.2;
  const bars = Math.round(len / 0.35);
  const geo = new THREE.CylinderGeometry(0.035, 0.035, h, 4);
  const mat = toon(p.color || '#1a1620');
  for (let i = 0; i <= bars; i++) {
    const b = new THREE.Mesh(geo, mat);
    b.position.set(-len / 2 + i * (len / bars), h / 2, 0);
    g.add(b);
  }
  for (const y of [0.25, h - 0.15]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), mat);
    rail.position.y = y;
    g.add(rail);
  }
  return g;
};

P.lamp = (p, ctx) => {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 6), '#1a1620');
  pole.position.y = 2;
  const arm = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.8), '#1a1620');
  arm.position.set(0, 3.95, 0.35);
  const head = mesh(new THREE.ConeGeometry(0.3, 0.3, 6), '#1a1620');
  head.position.set(0, 3.85, 0.7);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), glow(p.color || '#ffe7a3'));
  bulb.position.set(0, 3.7, 0.7);
  g.add(pole, arm, head, bulb);
  if (p.light !== false) ctx.addLight(g, new THREE.Vector3(0, 3.5, 0.7), p.color || '#ffd890', p.intensity ?? 18, p.range ?? 11);
  if (p.flicker) ctx.anim((t) => { bulb.visible = Math.sin(t * 17) + Math.sin(t * 5.3) > -1.3; });
  g.userData.colliderSize = [0.3, 0.3];
  return g;
};

P.gate = (p) => {
  const g = new THREE.Group();
  const w = p.w || 6, h = p.h || 4.5;
  for (const s of [-1, 1]) {
    const pil = mesh(new THREE.BoxGeometry(0.8, h, 0.8), p.color || '#4a4155');
    pil.position.set(s * (w / 2 + 0.4), h / 2, 0);
    pil.userData.collide = true;
    g.add(pil);
  }
  const top = mesh(new THREE.BoxGeometry(w + 1.6, 1.2, 0.6), p.color || '#4a4155');
  top.position.y = h + 0.6;
  g.add(top);
  if (p.sign) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.2, 1), new THREE.MeshBasicMaterial({ map: textTexture(p.sign, { w: 1024, h: 180, size: 120, bg: p.signBg || '#2a2036', fg: p.signFg || '#f4ecd6' }) }));
    s.position.set(0, h + 0.6, 0.31);
    const s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = -0.31;
    g.add(s, s2);
  }
  g.userData.partColliders = true;
  return g;
};

P.cell = (p) => {
  // Open-fronted cell: back + side walls, bars across the front with a door gap.
  const g = new THREE.Group();
  const w = p.w || 4, d = p.d || 4, h = 3;
  const wallC = p.color || '#7a8079';
  const back = mesh(new THREE.BoxGeometry(w, h, 0.3), wallC, { receive: true });
  back.position.set(0, h / 2, -d / 2);
  back.userData.collide = true;
  g.add(back);
  for (const s of [-1, 1]) {
    const side = mesh(new THREE.BoxGeometry(0.3, h, d), wallC, { receive: true });
    side.position.set(s * w / 2, h / 2, 0);
    side.userData.collide = true;
    g.add(side);
  }
  const barMat = toon('#22252b');
  const geo = new THREE.CylinderGeometry(0.03, 0.03, h, 4);
  for (let x = -w / 2 + 0.2; x <= w / 2 - 0.2; x += 0.25) {
    if (p.open && x > -0.6 && x < 0.6) continue;
    const b = new THREE.Mesh(geo, barMat);
    b.position.set(x, h / 2, d / 2);
    g.add(b);
  }
  // bar colliders: split around the door gap only when the door is open
  const half = (w / 2 - 0.6);
  if (!p.open) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), barMat);
    c.visible = false;
    c.position.set(0, h / 2, d / 2);
    c.userData.collide = true;
    g.add(c);
  } else for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(half, h, 0.1), barMat);
    c.visible = false;
    c.position.set(s * (0.6 + half / 2), h / 2, d / 2);
    c.userData.collide = true;
    g.add(c);
  }
  if (p.open) {
    const door = new THREE.Group();
    for (let x = 0; x < 1.2; x += 0.25) {
      const b = new THREE.Mesh(geo, barMat);
      b.position.set(x, h / 2, 0);
      door.add(b);
    }
    door.position.set(-0.6, 0, d / 2);
    door.rotation.y = -1.9;
    g.add(door);
  }
  const bed = mesh(new THREE.BoxGeometry(1, 0.45, 2), '#cfc7b3');
  bed.position.set(w / 2 - 0.7, 0.23, -d / 2 + 1.2);
  bed.userData.collide = true;
  g.add(bed);
  g.userData.partColliders = true;
  return g;
};

P.crate = (p) => {
  const s = p.s || 1;
  const m = mesh(new THREE.BoxGeometry(s, s, s), p.color || '#7a5a3a');
  m.position.y = s / 2 + (p.y || 0);
  m.rotation.y = rad(p.spin);
  return m;
};

P.barrel = (p) => {
  const m = mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 8), p.color || '#6a2a2a');
  m.position.y = 0.5;
  return m;
};

P.bench = (p) => {
  const g = new THREE.Group();
  const seat = mesh(new THREE.BoxGeometry(2, 0.12, 0.6), p.color || '#5a3d2a');
  seat.position.y = 0.5;
  const back = mesh(new THREE.BoxGeometry(2, 0.6, 0.1), p.color || '#5a3d2a');
  back.position.set(0, 0.85, -0.28);
  g.add(seat, back);
  for (const s of [-0.85, 0.85]) {
    const leg = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), '#1a1620');
    leg.position.set(s, 0.25, 0);
    g.add(leg);
  }
  return g;
};

P.tree = (p) => {
  const g = new THREE.Group();
  const h = p.h || 5;
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.3, h, 5), p.color || '#2b2025');
  trunk.position.y = h / 2;
  g.add(trunk);
  const rng = mulberry(p.seed || (p.x * 13 + p.z * 7));
  for (let i = 0; i < 5; i++) {
    const len = 1 + rng() * 1.6;
    const br = mesh(new THREE.CylinderGeometry(0.03, 0.09, len, 4), p.color || '#2b2025');
    br.geometry.translate(0, len / 2, 0);
    br.position.y = h * (0.5 + rng() * 0.45);
    br.rotation.set((rng() - 0.5) * 1.8, rng() * 6, (rng() - 0.5) * 1.8 + 0.6);
    g.add(br);
  }
  g.userData.colliderSize = [0.6, 0.6];
  return g;
};

P.car = (p, ctx) => {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(2, 0.7, 4.2), p.color || '#1d2233');
  body.position.y = 0.65;
  const cab = mesh(new THREE.BoxGeometry(1.8, 0.6, 2.1), p.color || '#1d2233');
  cab.position.set(0, 1.3, -0.2);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.4, 2), toon('#6d86a8'));
  glass.position.set(0, 1.33, -0.2);
  g.add(body, cab, glass);
  if (p.police !== false) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.22), toon('#e8e2d0'));
    stripe.position.y = 0.7;
    g.add(stripe);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), glow('#ff2a2a'));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), glow('#2a6bff'));
    red.position.set(-0.3, 1.68, -0.2); blue.position.set(0.3, 1.68, -0.2);
    g.add(red, blue);
    const light = ctx.addLight(g, new THREE.Vector3(0, 2.3, 0), '#ff2a2a', 10, 9);
    ctx.anim((t) => {
      const on = Math.sin(t * 10 + (p.x || 0)) > 0;
      red.visible = on; blue.visible = !on;
      if (light) light.color.set(on ? '#ff3030' : '#3060ff');
    });
  }
  for (const [x, z] of [[-1, 1.3], [1, 1.3], [-1, -1.3], [1, -1.3]]) {
    const w = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8), '#111');
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.35, z);
    g.add(w);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.05), glow('#fff6cc'));
  head.position.set(0, 0.75, 2.11);
  g.add(head);
  return g;
};

P.tent = (p) => {
  const g = new THREE.Group();
  const r = p.r || 2.5, h = p.h || 2.5;
  const seg = 12;
  const c1 = p.color || '#c0283a', c2 = p.color2 || '#f4ecd6';
  for (let i = 0; i < seg; i++) {
    const geo = new THREE.CylinderGeometry(r, r, h, 1, 1, true, (i / seg) * Math.PI * 2, Math.PI * 2 / seg);
    const m = new THREE.Mesh(geo, toon(i % 2 ? c1 : c2, { side: THREE.DoubleSide }));
    m.position.y = h / 2;
    m.castShadow = true;
    g.add(m);
    const cg = new THREE.ConeGeometry(r * 1.08, h * 0.7, 1, 1, true, (i / seg) * Math.PI * 2, Math.PI * 2 / seg);
    const cm = new THREE.Mesh(cg, toon(i % 2 ? c1 : c2, { side: THREE.DoubleSide }));
    cm.position.y = h + h * 0.35;
    g.add(cm);
  }
  const flag = mesh(new THREE.ConeGeometry(0.2, 0.6, 3), p.flag || '#f0b429');
  flag.rotation.z = -Math.PI / 2;
  flag.position.set(0.3, h * 1.7 + 0.3, 0);
  g.add(flag);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2), glow('#120c16'));
  door.position.set(0, 1, r + 0.02);
  g.add(door);
  g.userData.colliderSize = [r * 2, r * 2];
  return g;
};

P.ferris = (p, ctx) => {
  const g = new THREE.Group();
  const R = p.r || 7;
  for (const s of [-1, 1]) {
    for (const lean of [-0.3, 0.3]) {
      const leg = mesh(new THREE.CylinderGeometry(0.12, 0.15, R + 1.5, 5), '#2b2533');
      leg.position.set(lean * 3.5, (R + 1.5) / 2, s * 0.8);
      leg.rotation.z = -lean;
      g.add(leg);
    }
  }
  const wheel = new THREE.Group();
  wheel.position.y = R + 1.2;
  g.add(wheel);
  for (const s of [-0.7, 0.7]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 4, 32), toon('#d9d2c0'));
    rim.position.z = s;
    wheel.add(rim);
  }
  const cars = [];
  const n = 10;
  const bulbs = glow('#ffd36a');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, R, 0.06), toon('#d9d2c0'));
    spoke.geometry.translate(0, R / 2, 0);
    spoke.rotation.z = a;
    wheel.add(spoke);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 4), bulbs);
    b.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.8);
    wheel.add(b);
    const car = mesh(new THREE.BoxGeometry(1, 0.8, 1.1), i % 2 ? '#c0283a' : '#5b2a86');
    car.userData.a = a;
    wheel.add(car);
    cars.push(car);
  }
  const speed = p.speed ?? 0.08;
  ctx.anim((t) => {
    wheel.rotation.z = t * speed;
    for (const c of cars) {
      const a = c.userData.a;
      c.position.set(Math.cos(a) * R, Math.sin(a) * R - 0.7, 0);
      c.rotation.z = -wheel.rotation.z;
    }
  });
  g.userData.colliderSize = [8, 2.4];
  return g;
};

P.carousel = (p, ctx) => {
  const g = new THREE.Group();
  const R = p.r || 4;
  const base = mesh(new THREE.CylinderGeometry(R, R, 0.4, 16), '#5b2a86', { receive: true });
  base.position.y = 0.2;
  g.add(base);
  const pole = mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.6, 8), '#f0b429');
  pole.position.y = 2;
  g.add(pole);
  const roof = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const cg = new THREE.ConeGeometry(R + 0.4, 1.6, 1, 1, true, (i / 16) * Math.PI * 2, Math.PI / 8);
    const cm = new THREE.Mesh(cg, toon(i % 2 ? '#c0283a' : '#f4ecd6', { side: THREE.DoubleSide }));
    roof.add(cm);
  }
  roof.position.y = 4.3;
  g.add(roof);
  const spin = new THREE.Group();
  g.add(spin);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = new THREE.Group();
    h.position.set(Math.cos(a) * (R - 1), 0, Math.sin(a) * (R - 1));
    h.rotation.y = -a;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 4), toon('#f0b429'));
    rod.position.y = 2.1;
    const horse = mesh(new THREE.BoxGeometry(0.35, 0.5, 1.1), i % 2 ? '#f4ecd6' : '#7bd34f');
    const hd = mesh(new THREE.BoxGeometry(0.3, 0.5, 0.35), i % 2 ? '#f4ecd6' : '#7bd34f');
    hd.position.set(0, 0.35, 0.55);
    hd.rotation.x = 0.4;
    horse.add(hd);
    horse.userData.phase = i;
    h.add(rod, horse);
    h.userData.horse = horse;
    spin.add(h);
  }
  const speed = p.speed ?? 0.4;
  ctx.anim((t) => {
    spin.rotation.y = t * speed;
    spin.children.forEach((h, i) => { h.userData.horse.position.y = 1.4 + Math.sin(t * 2 + i) * 0.3; });
  });
  if (p.light !== false) ctx.addLight(g, new THREE.Vector3(0, 3.2, 0), '#ffb347', 14, 10);
  g.userData.colliderSize = [R * 2, R * 2];
  return g;
};

P.booth = (p) => {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(2, 2.4, 1.6), p.color || '#c0283a');
  body.position.y = 1.2;
  const roof = mesh(new THREE.ConeGeometry(1.6, 1, 4), p.roof || '#f0b429');
  roof.position.y = 2.9;
  roof.rotation.y = Math.PI / 4;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), glow('#ffd36a'));
  win.position.set(0, 1.5, 0.81);
  g.add(body, roof, win);
  if (p.sign) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshBasicMaterial({ map: textTexture(p.sign, { size: 100, w: 512, h: 140 }) }));
    s.position.set(0, 2.25, 0.82);
    g.add(s);
  }
  return g;
};

P.stage = (p, ctx) => {
  const g = new THREE.Group();
  const w = p.w || 8, d = p.d || 4;
  const plat = mesh(new THREE.BoxGeometry(w, 0.8, d), '#4a2a1e', { receive: true });
  plat.position.y = 0.4;
  plat.userData.collide = true;
  g.add(plat);
  for (const s of [-1, 1]) {
    const cur = mesh(new THREE.BoxGeometry(1.4, 4.4, 0.3), '#8a1022');
    cur.position.set(s * (w / 2 - 0.5), 3, -d / 2 + 0.3);
    g.add(cur);
  }
  const back = mesh(new THREE.BoxGeometry(w, 5, 0.2), '#2a0d18');
  back.position.set(0, 3, -d / 2);
  back.userData.collide = true;
  g.add(back);
  const valance = mesh(new THREE.BoxGeometry(w, 0.8, 0.3), '#8a1022');
  valance.position.set(0, 5.2, -d / 2 + 0.3);
  g.add(valance);
  const steps = mesh(new THREE.BoxGeometry(2, 0.4, 1), '#4a2a1e');
  steps.position.set(0, 0.2, d / 2 + 0.5);
  g.add(steps);
  if (p.spot !== false) ctx.addLight(g, new THREE.Vector3(0, 5, 2), '#fff1c9', 22, 12);
  g.userData.partColliders = true;
  return g;
};

P.poster = (p) => {
  const tex = textTexture(p.text || ['?'], { w: 384, h: 512, size: p.size || 64, bg: p.bg || '#f0b429', fg: p.fg || '#3a0f1a', draw: p.face ? drawFace : null });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w || 1.4, (p.w || 1.4) * 4 / 3), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.y = p.y ?? 1.7;
  const g = new THREE.Group();
  g.add(m);
  g.userData.solid = false;
  return g;
};

P.chalk = (p) => {
  const tex = textTexture(p.text || '', {
    w: 1024, h: 512, size: p.size || 90, bg: null, border: false, fg: p.fg || '#f4ecd6', font: '"Comic Neue", cursive',
    draw: (g, w, h) => { g.strokeStyle = p.fg || '#f4ecd6'; g.lineWidth = 9; drawGrin(g, w / 2, h * 0.32, 120); },
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w || 3, (p.w || 3) / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.position.y = p.y ?? 1.6;
  const g = new THREE.Group();
  g.add(m);
  g.userData.solid = false;
  return g;
};

P.sign = (p) => {
  const g = new THREE.Group();
  const post = mesh(new THREE.BoxGeometry(0.12, 2, 0.12), '#2b2025');
  post.position.y = 1;
  const board = new THREE.Mesh(new THREE.BoxGeometry(p.w || 2, 0.8, 0.08), [toon('#3a2a20'), toon('#3a2a20'), toon('#3a2a20'), toon('#3a2a20'),
    new THREE.MeshBasicMaterial({ map: textTexture(p.text || '', { size: 80, w: 512, h: 200, bg: p.bg || '#f4ecd6' }) }), toon('#3a2a20')]);
  board.position.y = 2.1;
  g.add(post, board);
  g.userData.colliderSize = [0.3, 0.3];
  return g;
};

P.stringLights = (p, ctx) => {
  // A droopy string of bulbs from (x,z) to (x2,z2).
  const g = new THREE.Group();
  const a = new THREE.Vector3(0, p.h || 4, 0);
  const b = new THREE.Vector3((p.x2 ?? p.x) - p.x, p.h || 4, (p.z2 ?? p.z) - p.z);
  const n = 14;
  const cols = ['#ffd36a', '#ff6a6a', '#7bd34f', '#8fb7ff'];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const pt = a.clone().lerp(b, t);
    pt.y -= Math.sin(t * Math.PI) * 0.9;
    pts.push(pt);
    if (i > 0 && i < n) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), glow(cols[i % 4]));
      bulb.position.copy(pt);
      g.add(bulb);
    }
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x111111 })));
  g.userData.solid = false;
  return g;
};

P.beam = (p, ctx) => {
  // Searchlight sweeping the sky.
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.5, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: p.color || '#fff4c4', transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }));
  cone.geometry.translate(0, -20, 0);
  const pivot = new THREE.Group();
  pivot.add(cone);
  pivot.position.y = p.y ?? 0.5;
  g.add(pivot);
  ctx.anim((t) => { pivot.rotation.set(Math.PI + Math.sin(t * 0.3 + (p.x || 0)) * 0.5, 0, Math.cos(t * 0.21) * 0.4); });
  g.userData.solid = false;
  return g;
};

P.mirror = (p) => {
  const g = new THREE.Group();
  const frame = mesh(new THREE.BoxGeometry((p.w || 1.4) + 0.2, 2.6, 0.12), p.frame || '#f0b429');
  frame.position.y = 1.4;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(p.w || 1.4, 2.4), new THREE.MeshStandardMaterial({ color: '#9fb4c8', metalness: 1, roughness: 0.15, emissive: '#1a2533' }));
  glass.position.set(0, 1.4, 0.07);
  g.add(frame, glass);
  return g;
};

P.rubble = (p) => {
  const g = new THREE.Group();
  const rng = mulberry(p.x * 3 + p.z * 11);
  for (let i = 0; i < (p.n || 6); i++) {
    const r = mesh(new THREE.DodecahedronGeometry(0.2 + rng() * 0.35, 0), p.color || '#5a5260');
    r.position.set((rng() - 0.5) * 2, 0.15, (rng() - 0.5) * 2);
    r.rotation.set(rng() * 3, rng() * 3, 0);
    g.add(r);
  }
  g.userData.solid = false;
  return g;
};

P.table = (p) => {
  const g = new THREE.Group();
  const top = mesh(new THREE.BoxGeometry(p.w || 1.6, 0.1, p.d || 0.9), p.color || '#5a3d2a');
  top.position.y = 0.8;
  g.add(top);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), '#2b2025', { outline: false });
    leg.position.set(x * ((p.w || 1.6) / 2 - 0.1), 0.4, z * ((p.d || 0.9) / 2 - 0.1));
    g.add(leg);
  }
  if (p.items) {
    const cand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), toon('#f4ecd6'));
    cand.position.set(-0.4, 0.95, 0);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), glow('#ffb347'));
    flame.position.set(-0.4, 1.08, 0);
    const deck = mesh(new THREE.BoxGeometry(0.25, 0.06, 0.35), '#c0283a');
    deck.position.set(0.3, 0.88, 0);
    const hat = mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.3, 10), '#111');
    hat.position.set(0.05, 1.0, -0.2);
    g.add(cand, flame, deck, hat);
  }
  return g;
};

P.marker = () => new THREE.Group(); // invisible anchor

function drawGrin(g, cx, cy, r) {
  g.beginPath(); g.arc(cx, cy, r, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.beginPath(); g.arc(cx - r * 0.45, cy - r * 0.45, r * 0.12, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx + r * 0.45, cy - r * 0.45, r * 0.12, 0, Math.PI * 2); g.stroke();
}
function drawFace(g, w, h) {
  g.fillStyle = '#f4ecd6';
  g.beginPath(); g.arc(w / 2, h * 0.38, w * 0.22, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3a0f1a'; g.lineWidth = 8;
  drawGrin(g, w / 2, h * 0.38, w * 0.15);
  g.fillStyle = '#111';
  g.fillRect(w / 2 - w * 0.17, h * 0.38 - w * 0.33, w * 0.34, w * 0.12);
  g.fillRect(w / 2 - w * 0.12, h * 0.38 - w * 0.55, w * 0.24, w * 0.24);
}

function mulberry(a) {
  a = Math.floor(Math.abs(a) * 1000) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export class World {
  constructor(scene, data, quality) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.walkAreas = [];
    this.anims = [];
    this.lights = [];
    this.maxLights = quality === 'low' ? 3 : 7;
    this.quality = quality;
    const env = data.environment || {};
    this.env = env;
    this.bounds = data.bounds || [-30, 30, -30, 30];

    scene.background = new THREE.Color(env.sky || '#120d1c');
    scene.fog = new THREE.Fog(env.fog || env.sky || '#120d1c', env.fogNear ?? 12, env.fogFar ?? 55);

    this.hemi = new THREE.HemisphereLight(env.skyLight || '#8a7fb8', env.groundLight || '#1a1420', env.ambient ?? 0.9);
    this.group.add(this.hemi);
    this.baseHemi = this.hemi.intensity;
    const moon = new THREE.DirectionalLight(env.moon || '#b9c4ff', env.moonIntensity ?? 1.2);
    moon.position.set(-12, 25, 10);
    if (quality !== 'low') {
      moon.castShadow = true;
      moon.shadow.mapSize.set(1024, 1024);
      const s = 22;
      Object.assign(moon.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 70 });
      moon.shadow.bias = -0.0015;
    }
    this.moon = moon;
    this.group.add(moon, moon.target);

    // Ground
    const gs = env.groundSize || 90;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs), toon(env.ground || '#2b2733'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    for (const path of env.paths || []) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(path.w, path.d), toon(path.color || '#3d3745'));
      pm.rotation.x = -Math.PI / 2;
      pm.position.set(path.x, 0.01, path.z);
      pm.receiveShadow = true;
      this.group.add(pm);
    }
    // Wet-ground puddles catch light
    if (env.rain) {
      const rng = mulberry(7);
      const pm = new THREE.MeshBasicMaterial({ color: env.puddle || '#4a4f78', transparent: true, opacity: 0.35, depthWrite: false });
      for (let i = 0; i < 14; i++) {
        const pud = new THREE.Mesh(new THREE.CircleGeometry(0.6 + rng() * 1.2, 10), pm);
        pud.rotation.x = -Math.PI / 2;
        pud.scale.y = 0.6;
        pud.position.set((rng() - 0.5) * (this.bounds[1] - this.bounds[0]), 0.015, (rng() - 0.5) * (this.bounds[3] - this.bounds[2]));
        this.group.add(pud);
      }
    }

    const ctx = {
      anim: (fn) => this.anims.push(fn),
      addLight: (parent, pos, color, intensity, range) => {
        if (this.lights.length >= this.maxLights) return null;
        const l = new THREE.PointLight(color, intensity, range, 1.6);
        l.position.copy(pos);
        parent.add(l);
        this.lights.push(l);
        return l;
      },
    };

    for (const p of data.props || []) this.addProp(p, ctx);
    if (env.rain) this._makeRain(quality === 'low' ? 600 : 1400);
    this.lightningT = 3 + Math.random() * 5;
    this.flash = 0;
  }

  addProp(p, ctx) {
    const build = P[p.type];
    if (!build) { console.warn('Unknown prop type', p.type); return; }
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
    } else if (obj.userData.colliderSize) {
      const [w, d] = obj.userData.colliderSize;
      const rot = Math.abs(Math.sin(rad(p.rot))) > 0.7;
      const hw = (rot ? d : w) / 2 * (p.scale || 1), hd = (rot ? w : d) / 2 * (p.scale || 1);
      this.colliders.push({ minX: obj.position.x - hw, maxX: obj.position.x + hw, minZ: obj.position.z - hd, maxZ: obj.position.z + hd, maxY: 6 });
    } else {
      this._boxCollider(obj);
    }
    return obj;
  }

  _boxCollider(o) {
    const b = new THREE.Box3();
    // Ignore lights, lines, outlines when sizing.
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      if (c.isMesh && !c.userData.isOutline) {
        c.geometry.computeBoundingBox();
        const bb = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld);
        b.union(bb);
      }
    });
    if (b.isEmpty() || b.min.y > 1.5) return;
    this.colliders.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, maxY: b.max.y });
  }

  _makeRain(n) {
    const pos = new Float32Array(n * 6);
    this.rainSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 40, y = Math.random() * 20, z = (Math.random() - 0.5) * 40;
      pos.set([x, y, z, x + 0.05, y + 0.6, z + 0.05], i * 6);
      this.rainSpeed[i] = 18 + Math.random() * 8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#9aa6d6', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
  }

  // Resolve a circle (x,z,r) against colliders and bounds; mutates and returns pos.
  collide(pos, r) {
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-6) {
          // centre inside the box: push out along the shallowest axis
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
    if (this.rain) {
      const a = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < this.rainSpeed.length; i++) {
        const o = i * 6;
        const dy = this.rainSpeed[i] * dt;
        a[o + 1] -= dy; a[o + 4] -= dy;
        if (a[o + 1] < 0) {
          const x = camPos.x + (Math.random() - 0.5) * 40, z = camPos.z + (Math.random() - 0.5) * 40, y = 16 + Math.random() * 6;
          a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x + 0.05; a[o + 4] = y + 0.6; a[o + 5] = z + 0.05;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.env.lightning) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.flash = 1;
        this.lightningT = 6 + Math.random() * 10;
        onThunder && onThunder();
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2.5);
      const f = this.flash > 0.6 || (this.flash > 0.25 && this.flash < 0.4) ? this.flash : 0;
      this.hemi.intensity = this.baseHemi + f * 4;
    }
    // keep the shadow camera near the action
    this.moon.position.set(camPos.x - 12, 25, camPos.z + 10);
    this.moon.target.position.set(camPos.x, 0, camPos.z);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); }
      }
    });
  }
}
