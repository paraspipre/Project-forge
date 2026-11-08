import * as THREE from 'three';
import { Kit, namedRings, ringBox, rectRing, circleRing } from './kit.js';
import { busGeo, autoGeo, metroCarGeo, vehicleMaterial } from '../../actors/Vehicles.js';
import { cowGeo } from '../Crowd.js';
import { toon } from '../../core/Toon.js';
import { rng, pointInRing, ring } from '../geo.js';

// Landmarks and stereotype set-dressing for every district beyond MG Road.

const GLASS = '#a9c4cf', CREAM = '#efe6d2', TEMPLE = '#f3ead4', OCHRE = '#e8b04a';

// A Dravidian gopuram: stacked shrinking tiers, a barrel vault and kalashas.
function gopuram(kit, x, z, w, d, h, tiers, color = TEMPLE, yaw = 0) {
  const th = h / (tiers + 1.6);
  kit.box(x, 0, z, w, th * 1.4, d, color, 50, yaw);
  for (let i = 0; i < tiers; i++) {
    const k = 1 - (i + 1) / (tiers + 2);
    const y = th * 1.4 + i * th;
    kit.box(x, y, z, w * k, th * 0.82, d * k, i % 2 ? color : '#efd9a8', 70, yaw);
    kit.box(x, y + th * 0.82, z, w * k * 1.04, th * 0.18, d * k * 1.04, '#d9b46a', 70, yaw);
  }
  const top = th * 1.4 + tiers * th;
  const kw = w * (1 - (tiers + 1) / (tiers + 2));
  kit.box(x, top, z, kw, th * 0.6, d * 0.12, '#d9b46a', 70, yaw);
  for (const o of [-0.3, 0, 0.3]) kit.cyl(x + Math.cos(yaw) * o * kw, top + th * 0.6, z - Math.sin(yaw) * o * kw, 0.35, 0.05, 1.4, '#c9a64b', 8);
}

function billboard(kit, x, y, z, w, h, yaw, pole = '#5d6670') {
  kit.box(x - Math.cos(yaw) * w * 0.35, y, z + Math.sin(yaw) * w * 0.35, 0.35, h * 0.9, 0.35, pole, 70);
  kit.box(x + Math.cos(yaw) * w * 0.35, y, z - Math.sin(yaw) * w * 0.35, 0.35, h * 0.9, 0.35, pole, 70);
  kit.box(x, y + h * 0.9, z, w + 0.4, h + 0.4, 0.4, '#2b2b30', 70, yaw);
}

// Tall roofs near a point, for rooftop billboards / extras.
function roofsNear(city, x, z, r, minH = 9, maxH = 30) {
  return city.buildings.filter((b) => b.h >= minH && b.h <= maxH && b.area > 150 && (b.c[0] - x) ** 2 + (b.c[1] - z) ** 2 < r * r);
}

// ---------------------------------------------------------------- Silk Board

function silkboard(city) {
  const out = [];
  const J = [-423, -9];
  const kit = new Kit(city, J[0], J[1], 0.55);
  // overhead gantry with the famous welcome
  kit.box(0, 0, -16, 1, 9, 1, '#4f5a66'); kit.box(0, 0, 16, 1, 9, 1, '#4f5a66');
  kit.box(0, 9, 0, 1.4, 1.2, 33.5, '#4f5a66');
  out.push({
    object: kit.mesh(),
    signs: [
      { text: 'CENTRAL SILK BOARD JUNCTION', sub: 'Avg. speed 4 km/h · Est. clearance: 2 hrs · Welcome', pos: kit.w(0.8, 0), y: 11.6, yaw: 0.55 + Math.PI / 2, w: 26, h: 4.2, bg: '#1f6b3a', fg: '#ffffff' },
      { text: 'CENTRAL SILK BOARD JUNCTION', sub: 'ಸಿಲ್ಕ್ ಬೋರ್ಡ್ · You are now part of the traffic', pos: kit.w(-0.8, 0), y: 11.6, yaw: 0.55 - Math.PI / 2, w: 26, h: 4.2, bg: '#1f6b3a', fg: '#ffffff' },
    ],
    spots: { junction: J, junctionFar: [J[0] + 170, J[1] - 120] },
  });
  // stuck techie's auto, parked forever
  const auto = new THREE.Mesh(autoGeo(), vehicleMaterial());
  auto.position.set(J[0] + 26, 0.1, J[1] + 34); auto.rotation.y = 2.2; auto.castShadow = true;
  out.push({ object: auto, spots: { stuckAuto: [J[0] + 26, J[1] + 34] } });
  return out;
}

// ---------------------------------------------------------------- Koramangala

const ADS = [
  ['DOSA.AI', 'Your dosa, now with AI. Series A raised.'],
  ['ZIPPO', 'Groceries in 7 minutes. Rider not included.'],
  ['UBER FOR UBER', 'We disrupt the disruptors.'],
  ['HIRING 10X ENGINEERS', 'Salary: exposure + free cold brew'],
  ['IDLI COIN', 'To the moon. Then to Silk Board.'],
  ['RAPID-O', 'Faster than your auto. Slower than your mom.'],
  ['PIVOT STUDIO', 'Pre-revenue? Post-vibes? We get you.'],
  ['CO-WORK 24/7', 'Sleep is a legacy feature.'],
  ['CHAI GPT', 'Ask anything. Answer: "adjust maadi".'],
  ['UNICORN WALKS', 'Weekend founder meetups at Forum'],
];

function koramangala(city) {
  city.restyleFn = (b) => (b.area > 4000 && b.h > 12 ? { color: GLASS, style: 3, h: Math.max(b.h, 28) } : null);
  return [{ object: new THREE.Group(), spots: { sony: [560, -300], thirdWave: [773, -82], social: [-903, -176], forum: [-1180, -20] } }];
}

function koramangalaLate(city) {
  const out = [];
  const kit = new Kit(city, 0, 0, 0);
  const signs = [];
  const R = rng(7);
  const roofs = roofsNear(city, 0, 0, 1300, 10, 26).sort(() => R() - 0.5).slice(0, ADS.length);
  roofs.forEach((b, i) => {
    const yaw = R() * Math.PI * 2;
    billboard(kit, b.c[0], b.h, b.c[1], 9, 3.4, yaw);
    const [t, s] = ADS[i];
    signs.push({ text: t, sub: s, pos: [b.c[0] + Math.sin(yaw) * 0.25, b.c[1] + Math.cos(yaw) * 0.25], y: b.h + 4.96, yaw, w: 9, h: 3.4, bg: ['#ffffff', '#2b2b30', '#f2c14e', '#3fb3a6', '#e75a7c'][i % 5], fg: ['#2b2b30', '#f2c14e', '#2b2b30', '#ffffff', '#ffffff'][i % 5] });
    signs.push({ text: t, sub: s, pos: [b.c[0] - Math.sin(yaw) * 0.25, b.c[1] - Math.cos(yaw) * 0.25], y: b.h + 4.96, yaw: yaw + Math.PI, w: 9, h: 3.4, bg: '#f4f1ea', fg: '#2b2b30' });
  });
  signs.push({ near: [571, -292], text: 'SONY WORLD SIGNAL', sub: 'Landmark since 2005. Shop closed. Name stays forever.', w: 12, h: 2.2, y: 5, bg: '#2b2b30', fg: '#ffffff' });
  out.push({ object: kit.mesh(), signs });
  return out;
}

// ---------------------------------------------------------------- Indiranagar

function indiranagar(city) {
  return [{ object: new THREE.Group(), spots: { toit: [-40, -598], metro: [-253, -473], defence: [370, -240] } }];
}

function indiranagarLate(city) {
  const signs = [];
  const R = rng(11);
  const houses = city.buildings.filter((b) => b.kind === 0 && b.h < 16 && b.area > 80 && b.area < 600).sort(() => R() - 0.5).slice(0, 26);
  const rents = ['₹65,000 · 10 months deposit', '₹48,000 · Veg only · No bachelors', '₹72,000 · Send LinkedIn', '₹55,000 · No pets, no guests, no fun', '₹90,000 · "Semi-furnished" (1 fan)', '₹38,000 · 1RK · View of a wall'];
  houses.forEach((b, i) => signs.push({ near: b.c, text: 'TO-LET', sub: rents[i % rents.length], w: 2.6, h: 1.3, y: 4.2, bg: '#ffffff', fg: '#d64b3b' }));
  signs.push({ near: [-40, -598], text: 'TOIT', sub: 'Brewpub · 100 Feet Road · Since forever', w: 7, h: 2, y: 5.5, bg: '#2b2b30', fg: '#f2c14e' });
  return [{ object: new THREE.Group(), signs }];
}

// ---------------------------------------------------------------- Basavanagudi

function nandi(scale, color = '#3b3b40') {
  const g = cowGeo(color);
  const m = new THREE.Mesh(g, toon({ vertexColors: true, hatch: 1.2, rim: 0.12 }));
  m.scale.set(scale, scale * 0.62, scale);
  m.castShadow = true;
  return m;
}

function basavanagudi(city) {
  const out = [];
  // Bull Temple (Dodda Basavana Gudi): pillared hall, gopuram, and the giant monolithic Nandi
  const BT = [-897.5, 579.8];
  city.exclude(circleRing(BT[0], BT[1], 16, 16, 12));
  const kit = new Kit(city, BT[0], BT[1], 0);
  kit.box(0, 0, 0, 22, 1.2, 15, '#d9cdb5');
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) kit.box(-9 + i * 4.5, 1.2, sx * 6.5, 0.8, 5.2, 0.8, TEMPLE);
  kit.box(0, 6.4, 0, 23, 1.0, 16, '#e8d9b8');
  kit.box(-9, 1.2, 0, 4, 5.2, 13, TEMPLE, 50);
  gopuram(kit, -9, 0, 7, 7, 16, 4, TEMPLE);
  kit.box(9.5, 0, 0, 3, 3, 9, '#cfc4ae');
  city.addSolid(rectRing(BT[0] - 9, BT[1], 7, 13), 7.4);
  city.addPlatform(rectRing(BT[0], BT[1], 22, 15), 1.2);
  const bull = nandi(3.0);
  bull.position.set(BT[0] + 1, 1.2 - 0.18 * 3, BT[1]);
  bull.rotation.y = Math.PI / 2;
  city.addSolid(rectRing(BT[0] + 1, BT[1], 4, 7), 4.5, 0, 'Nandi');
  const grp = new THREE.Group();
  grp.add(kit.mesh(), bull);
  out.push({
    object: grp,
    signs: [{ text: 'DODDA BASAVANA GUDI', sub: 'ದೊಡ್ಡ ಬಸವನ ಗುಡಿ · The Bull Temple · 1537', pos: [BT[0] + 11.2, BT[1]], y: 4.6, yaw: Math.PI / 2, w: 10, h: 2.2, bg: '#8a2b1e', fg: '#f2c14e' }],
    spots: { bullTemple: [BT[0] + 18, BT[1]], nandi: [BT[0] + 1, BT[1]] },
  });
  // Dodda Ganesha temple next door: small gopuram
  const DG = [-955.3, 455.1];
  const k2 = new Kit(city, DG[0], DG[1], 0);
  gopuram(k2, 0, 0, 9, 9, 13, 3, '#f5e3a8');
  out.push({ object: k2.mesh() });
  city.restyle.set('Dodda Ganesha Temple', { color: '#f5e3a8', style: 50, h: 4 });
  // Lalbagh Glass House: a cross of glass halls with a raised centre
  const GH = [1037.3, -309.7];
  city.exclude(circleRing(GH[0], GH[1], 40, 40, 12));
  const k3 = new Kit(city, GH[0], GH[1], 0);
  const glass = '#cfe6ec', frame = '#f4f1ea';
  k3.box(0, 0, 0, 70, 9, 16, glass, 300 / 10);
  k3.box(0, 0, 0, 16, 9, 56, glass, 30);
  k3.cyl(0, 9, 0, 9, 9, 3, glass, 16, 30);
  k3.dome(0, 12, 0, 9, frame, 0.7, 16, 6);
  for (const [w, d] of [[70, 16], [16, 56]]) { k3.box(0, 9, 0, w + 0.4, 0.6, d + 0.4, frame); k3.pyramid(0, 9.6, 0, w, d, 4, glass); }
  city.addSolid(rectRing(GH[0], GH[1], 70, 16), 13, 0, 'Glass House');
  city.addSolid(rectRing(GH[0], GH[1], 16, 56), 13, 0, 'Glass House');
  out.push({ object: k3.mesh(), signs: [{ text: 'LALBAGH GLASS HOUSE', sub: 'ಲಾಲ್‌ಬಾಗ್ · Flower show every Jan & Aug', pos: [GH[0], GH[1] + 28.4], y: 6, yaw: 0, w: 14, h: 2.4, bg: '#2f6f4e', fg: '#ffffff' }], spots: { glassHouse: [GH[0], GH[1] + 40] } });
  out.push({ object: new THREE.Group(), signs: [{ near: [-599.7, 220.4], text: 'VIDYARTHI BHAVAN', sub: 'ವಿದ್ಯಾರ್ಥಿ ಭವನ · Masala dose since 1943', w: 8, h: 1.8, y: 4.2, bg: '#f4f1ea', fg: '#8a2b1e' }], spots: { vidyarthi: [-599.7, 220.4] } });
  return out;
}

// ---------------------------------------------------------------- Bellandur

function bellandur(city) {
  // tech-park glass on the ORR
  city.restyleFn = (b) => (b.c[0] > 700 && b.area > 1200 && b.h > 10 ? { color: ['#a9c4cf', '#b4c9c2', '#9fb6c9'][Math.floor(Math.abs(b.c[0] * 7 + b.c[1]) % 3)], style: 3, h: Math.max(b.h, 34) } : null);
  return [];
}

// needs the built city (water lookups)
function bellandurLate(city) {
  const out = [];
  // the infamous foam: drifting white blobs on the lake
  const lake = city.data.water.map((w) => ring(w[0])).sort((a, b) => b.length - a.length)[0];
  const R = rng(5);
  const mat = toon({ color: '#fbfbf7', hatch: 0.5, rim: 0.25 });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const N = 140;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const blobs = [];
  let tries = 0;
  const L = [-747, -735];
  while (blobs.length < N && tries < 4000) {
    tries++;
    const x = L[0] + (R() - 0.5) * 1100, z = L[1] + (R() - 0.5) * 1800;
    if (!city.isWater(x, z)) continue;
    blobs.push({ x, z, s: 1.5 + R() ** 3 * 9, p: R() * 10, v: 0.3 + R() * 0.6 });
  }
  mesh.count = blobs.length;
  const d = new THREE.Object3D();
  const upd = (t) => {
    blobs.forEach((b, i) => {
      d.position.set(b.x + Math.sin(t * 0.05 * b.v + b.p) * 6, b.s * 0.25, b.z + Math.cos(t * 0.04 * b.v + b.p) * 6);
      const w = 1 + Math.sin(t * 0.8 + b.p) * 0.06;
      d.scale.set(b.s * w, b.s * 0.55, b.s / w);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  upd(0);
  let t = 0;
  out.push({ object: mesh, update: (dt) => { t += dt; if (Math.floor(t * 10) % 2 === 0) upd(t); } });
  // a real shoreline point near the ORR side, and a spot out in the water for the boss
  let shore = [-200, 230], boss = [-260, 150];
  if (lake) {
    let bi = 0, bd = Infinity;
    lake.forEach((p, i) => { const d = (p[0] + 200) ** 2 + (p[1] - 230) ** 2; if (d < bd) { bd = d; bi = i; } });
    const v = lake[bi];
    let dx = L[0] - v[0], dz = L[1] - v[1];
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    shore = [v[0] - dx * 10, v[1] - dz * 10];
    for (let k = 30; k < 400; k += 5) { const x = v[0] + dx * k, z = v[1] + dz * k; if (city.isWater(x, z) && k >= 45) { boss = [x, z]; break; } }
  }
  out.push({
    object: new THREE.Group(),
    signs: [{ near: shore, text: 'BELLANDUR LAKE', sub: 'Please do not feed the foam · ಬೆಳ್ಳಂದೂರು ಕೆರೆ', w: 10, h: 2.2, y: 4, bg: '#2f6fd1', fg: '#ffffff' }],
    spots: { lakeShore: shore, lakeBoss: boss, ecospace: [1180, 560], ecoworld: [1520, 640], flyover: [742, 418] },
  });
  city.foam = { blobs, mesh, refresh: () => upd(t) };
  return out;
}

// ---------------------------------------------------------------- Majestic

function majestic(city) {
  const out = [];
  // Kempegowda Bus Station: rows of bay canopies full of parked buses
  const KBS = [-77.6, -639.4];
  city.exclude(rectRing(KBS[0], KBS[1], 280, 120));
  const kit = new Kit(city, KBS[0], KBS[1], 0);
  const busG = busGeo({ body: '#3c7fc4' }), busR = busGeo({ body: '#c0392b', band: '#f4f1ea' }), busGr = busGeo({ body: '#2f8f4e' });
  const buses = new THREE.Group();
  const routes = [];
  const R = rng(3);
  for (let row = 0; row < 4; row++) {
    const z = -42 + row * 28;
    kit.box(0, 0, z, 250, 0.3, 10, '#d8d0c2');
    for (let i = -6; i <= 6; i++) kit.box(i * 20, 0.3, z, 0.6, 5.5, 0.6, '#c9c2b6');
    kit.box(0, 5.8, z, 254, 0.5, 14, '#e4ddd0');
    kit.box(0, 6.3, z, 254, 0.4, 3, '#8e5bb5');
    for (let i = -5; i <= 5; i++) {
      if (R() < 0.25) continue;
      const g = [busG, busR, busGr][Math.floor(R() * 3)];
      const m = new THREE.Mesh(g, vehicleMaterial());
      const [x, zz] = kit.w(i * 21, z + 9);
      m.position.set(x, 0.1, zz);
      m.rotation.y = Math.PI / 2 + (R() - 0.5) * 0.1;
      m.castShadow = true;
      buses.add(m);
      city.pillars = city.pillars || [];
      city.pillars.push([x, zz, 1.4], [x + 4, zz, 1.4], [x - 4, zz, 1.4]);
      routes.push({ x, z: zz, no: ['500-D', '335-E', '201-R', 'V-500CA', 'KIA-8', '600-F', '410', '252', '365', '401-K', '215-H'][Math.floor(R() * 11)] });
    }
  }
  const grp = new THREE.Group();
  grp.add(kit.mesh(), buses);
  out.push({
    object: grp,
    signs: [{ text: 'KEMPEGOWDA BUS STATION', sub: 'ಕೆಂಪೇಗೌಡ ಬಸ್ ನಿಲ್ದಾಣ · MAJESTIC', pos: kit.w(0, -48.6), y: 8, yaw: Math.PI, w: 28, h: 3.4, bg: '#c0392b', fg: '#ffffff' }],
    spots: { kbs: [KBS[0], KBS[1] + 70], ksr: [-480, -450], metro: [-13, -410] },
  });
  city.busRoutes = routes;
  return out;
}

// ---------------------------------------------------------------- Malleshwaram

function malleshwaram(city) {
  return [{
    object: new THREE.Group(),
    signs: [
      { near: [-54.8, 303.3], text: 'SHRI SAGAR (C.T.R.)', sub: 'Benne masala dose · Queue starts here →', w: 8, h: 1.8, y: 4, bg: '#f4f1ea', fg: '#2f6f4e' },
      { near: [-77.1, -516.3], text: 'VEENA STORES', sub: 'Idli · Vada · Kesari bath · No seats, no problem', w: 7, h: 1.7, y: 3.8, bg: '#f2c14e', fg: '#8a2b1e' },
    ],
    spots: { ctr: [-54.8, 303.3], veena: [-77.1, -516.3], sankey: [480, -700], market: [80, 160] },
  }];
}

// ---------------------------------------------------------------- Electronic City

function ecity(city) {
  const out = [];
  // the famous glass pyramid on the Infosys campus
  const P = [60, 140];
  city.exclude(circleRing(P[0], P[1], 46, 46, 12));
  const kit = new Kit(city, P[0], P[1], Math.PI / 4);
  kit.box(0, 0, 0, 62, 2, 62, '#d9d2c6');
  kit.pyramid(0, 2, 0, 60, 60, 38, '#9cc7d6');
  for (let i = 1; i < 6; i++) { const k = 1 - i / 6; kit.box(0, 2 + 38 * (i / 6), 0, 60 * k + 0.5, 0.25, 60 * k + 0.5, '#e8eef0'); }
  city.addSolid(rectRing(P[0], P[1], 60, 60, Math.PI / 4), 20, 0, 'Pyramid');
  city.restyleFn = (b) => (b.area > 1500 && b.h > 10 ? { color: ['#a9c4cf', '#f4f1ea', '#b4c9c2'][Math.floor(Math.abs(b.c[0] + b.c[1] * 3) % 3)], style: Math.abs(b.c[0]) % 2 > 1 ? 3 : 2, h: Math.max(b.h, 22) } : null);
  out.push({
    object: kit.mesh(),
    signs: [{ near: [325.8, -359.9], text: 'TECH CAMPUS · GATE 6', sub: 'Visitors: badge, laptop declaration, and patience', w: 9, h: 2, y: 4, bg: '#1f4e8c', fg: '#ffffff' }],
    spots: { pyramid: [P[0] + 40, P[1] + 40], gate: [325.8, -340], busStation: [221.8, -346.2] },
  });
  return out;
}

// ---------------------------------------------------------------- Whitefield

function whitefield(city) {
  city.restyleFn = (b) => (b.area > 2000 && b.h > 10 ? { color: GLASS, style: 3, h: Math.max(b.h, 40) } : null);
  return [{
    object: new THREE.Group(),
    signs: [{ near: [140, 257], text: 'ITPL', sub: 'International Tech Park · Est. 1994 · Traffic est. 1995', w: 8, h: 2, y: 5, bg: '#2b2b30', fg: '#8ff0ff' }],
    spots: { itpl: [137.7, 257.3], kadugodi: [1140.3, 149.2] },
  }];
}

export const ZONE_LATE = { koramangala: koramangalaLate, indiranagar: indiranagarLate, bellandur: bellandurLate };
export const ZONE_LANDMARKS = { silkboard, koramangala, indiranagar, basavanagudi, bellandur, majestic, malleshwaram, ecity, whitefield };
