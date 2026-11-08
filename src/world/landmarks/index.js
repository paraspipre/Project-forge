import * as THREE from 'three';
import { Kit, namedRings, ringBox, rectRing, circleRing } from './kit.js';
import { closestOnSeg } from '../geo.js';
import { Avatar } from '../../actors/Avatar.js';
import { ZONE_LANDMARKS, ZONE_LATE } from './zones.js';

// Hand-built landmarks placed on their real footprints, plus generic pieces every zone gets
// (Namma Metro stations on the elevated lines, with their real names).
// Each landmark returns { object, update?, signs?, spots? }. `spots` are named points used by
// missions (e.g. the Vidhana Soudha steps).

const GRANITE = '#d9cfbd', CREAM = '#efe6d2', RED = '#b8473a', WHITE = '#f4f1ea';

function statue(look, pose, scale = 1.5) {
  const a = new Avatar({ skin: '#7d8a83', hair: '#6f7c75', shirt: '#7d8a83', pants: '#7d8a83', shoes: '#6f7c75', hairStyle: 'short', shirtStyle: 'kurta', extras: [], ...look });
  a.play(pose, 1e9);
  a.emoteT = 1;
  a.update(0.016, { speed: 0, grounded: true });
  a._emote(pose, 1);
  a.object.scale.setScalar(scale);
  return a.object;
}

function pedestalStatue(city, kit, x, z, look, pose, name) {
  kit.box(x, 0, z, 3.4, 3.2, 3.4, '#cfc7b8', 70);
  kit.box(x, 3.2, z, 2.6, 0.5, 2.6, '#bdb4a3', 70);
  const s = statue(look, pose);
  const [wx, wz] = kit.w(x, z);
  s.position.set(wx, 3.7, wz);
  s.rotation.y = kit.yaw + Math.PI / 2;
  city.addSolid(rectRing(wx, wz, 3.6, 3.6, kit.yaw), 3.7, 0, name);
  return s;
}

// ---------------------------------------------------------------- generic: metro stations

function metroStations(city) {
  const out = [];
  const data = city.data;
  const lines = city.metroLines || [];
  for (const st of data.stations || []) {
    const name = data.names[st[2]] || '';
    const kn = data.namesKn?.[st[2]] || '';
    const x = st[0] / 10, z = st[1] / 10;
    // nearest elevated metro segment
    let best = null, bd = 45 * 45;
    for (const l of lines) for (let i = 0; i < l.pts.length - 1; i++) {
      const c = closestOnSeg(x, z, l.pts[i][0], l.pts[i][1], l.pts[i + 1][0], l.pts[i + 1][1]);
      if (c[3] < bd) { bd = c[3]; best = { c, a: l.pts[i], b: l.pts[i + 1], H: l.H, construction: l.construction }; }
    }
    if (!best || best.construction) continue;
    if (!st[3] && !/metro/i.test(name)) continue;
    const yaw = Math.atan2(best.b[0] - best.a[0], best.b[1] - best.a[1]);
    // station box sits over the viaduct, centred on the track
    const cx = best.c[0], cz = best.c[1];
    const kit = new Kit(city, cx, cz, yaw + Math.PI / 2);
    const H = best.H;
    const L = 120, W = 24;
    // kit local x runs along the track (yaw + 90deg maps local x onto the track direction)
    kit.box(0, H - 3.2, 0, L, 1.6, W, '#e2dbcf', 70);                 // concourse slab
    kit.box(0, H - 1.6, 0, L, 0.6, W, '#cfc6b8', 70);
    for (const side of [-1, 1]) {
      kit.box(0, H + 1.4, side * (W / 2 - 0.4), L - 4, 5.4, 0.8, '#bcd7df', 300 / 10);  // glass walls
      kit.box(0, H + 0.4, side * (W / 2 - 0.2), L, 0.5, 0.5, '#8e5bb5', 70);        // purple band
    }
    // curved roof made of stepped slats (reads as a vault with ink lines)
    for (let k = 0; k < 7; k++) {
      const t = (k / 6) * 2 - 1;
      const z0 = t * (W / 2 + 1);
      const y = H + 6.8 + Math.cos((t * Math.PI) / 2) * 3.2;
      kit.box(0, y, z0, L + 6, 0.5, W / 6 + 1.2, k % 2 ? '#f4f1ea' : '#e7e1d6', 70);
    }
    // columns down to the road and stair towers at both ends
    for (let i = -3; i <= 3; i++) for (const side of [-1, 1]) {
      kit.box(i * 17, 0, side * (W / 2 - 2), 1.2, H - 3.2, 1.2, '#d9d2c6', 70);
      const [wx, wz] = kit.w(i * 17, side * (W / 2 - 2));
      city.pillars = city.pillars || [];
      city.pillars.push([wx, wz, 0.9]);
    }
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const ex = end * (L / 2 + 6), ez = side * (W / 2 + 6);
      kit.box(ex, 0, ez, 8, H + 1, 6, '#e2dbcf', 70);
      kit.box(ex, H + 1, ez, 8.6, 0.6, 6.6, '#8e5bb5', 70);
      const [wx, wz] = kit.w(ex, ez);
      city.addSolid(rectRing(wx, wz, 8, 6, kit.yaw), H + 1.6, 0, 'Metro stairs');
    }
    out.push({
      object: kit.mesh(),
      signs: [
        { text: name.toUpperCase(), sub: `${kn ? kn + ' · ' : ''}ನಮ್ಮ ಮೆಟ್ರೋ · NAMMA METRO`, pos: kit.w(0, W / 2 + 0.2), y: H + 4.6, yaw: kit.yaw, w: 22, h: 3, bg: '#8e5bb5', fg: '#ffffff' },
        { text: name.toUpperCase(), sub: `${kn ? kn + ' · ' : ''}ನಮ್ಮ ಮೆಟ್ರೋ · NAMMA METRO`, pos: kit.w(0, -W / 2 - 0.2), y: H + 4.6, yaw: kit.yaw + Math.PI, w: 22, h: 3, bg: '#8e5bb5', fg: '#ffffff' },
      ],
      spots: { [`metro:${name}`]: [cx, cz] },
    });
  }
  return out;
}

// ---------------------------------------------------------------- MG Road & Cubbon Park

function central(city) {
  const out = [];
  // Vidhana Soudha: real footprint in granite, plus portico, grand steps and domes
  const vs = namedRings(city, 'Vidhana Soudha');
  if (vs.length) {
    city.restyle.set('Vidhana Soudha', { color: GRANITE, style: 40, h: 24, roof: '#cfc5b3' });
    const bb = ringBox(vs[0]);
    const kit = new Kit(city, bb.maxx, bb.cz, 0);   // local +x = east, front faces east
    // portico: 12 columns on a raised plinth
    kit.box(4, 0, 0, 14, 7, 64, GRANITE, 70);
    for (let i = 0; i < 12; i++) kit.cyl(8, 7, -27.5 + i * 5, 0.9, 0.8, 12, '#e6ddcb', 10);
    kit.box(4, 19, 0, 15, 3, 64, '#e6ddcb', 70);
    kit.box(4, 22, 0, 13, 2.5, 30, GRANITE, 70);
    kit.steps(10, 0, 26, 56, 7, 14, '#d4c9b5');
    // central dome on a drum, lantern, and the lion capital
    kit.cyl(-24, 24, 0, 12, 12, 7, GRANITE, 24, 40);
    kit.dome(-24, 31, 0, 12, '#d2c7b2', 1.05, 20, 8);
    kit.cyl(-24, 43.5, 0, 2.6, 2.2, 3.5, GRANITE, 12);
    kit.dome(-24, 47, 0, 2.4, '#d2c7b2', 1.2, 10, 4);
    kit.cyl(-24, 49.6, 0, 0.9, 0.9, 1.6, '#c9a64b', 8);
    kit.dome(-24, 51.2, 0, 1.1, '#c9a64b', 1.3, 8, 3);
    // corner domes
    for (const [cx, cz] of [[bb.minx - bb.maxx + 10, bb.minz - bb.cz + 10], [bb.minx - bb.maxx + 10, bb.maxz - bb.cz - 10], [-10, bb.minz - bb.cz + 10], [-10, bb.maxz - bb.cz - 10]]) {
      kit.cyl(cx, 24, cz, 5, 5, 4, GRANITE, 16, 40);
      kit.dome(cx, 28, cz, 5, '#d2c7b2', 1.1, 14, 6);
      kit.cyl(cx, 33.4, cz, 0.6, 0.4, 2, '#c9a64b', 8);
    }
    city.addPlatform(rectRing(bb.maxx + 4, bb.cz, 14, 64), 7);
    for (let i = 0; i < 14; i++) city.addPlatform(rectRing(bb.maxx + 10 + (26 * (13 - i)) / 14 + 26 / 28, bb.cz, 26 / 14, 56), (7 * (14 - i)) / 14);
    out.push({
      object: kit.mesh(),
      signs: [{ text: "GOVERNMENT WORK IS GOD'S WORK", sub: 'ಸರ್ಕಾರದ ಕೆಲಸ ದೇವರ ಕೆಲಸ', pos: [bb.maxx + 11.6, bb.cz], y: 19.2, yaw: Math.PI / 2, w: 40, h: 2.6, bg: '#cfc4ae', fg: '#3a3026' }],
      spots: { vidhanaSteps: [bb.maxx + 30, bb.cz], vidhanaTop: [bb.maxx + 6, bb.cz] },
    });
  }

  // Attara Kacheri (High Court), the red Greco-Roman one across the road
  city.restyle.set('Karnataka High Court', { color: RED, style: 40, h: 17, roof: '#9b3a30' });
  // State Central Library in Cubbon Park: red with white trims
  city.restyle.set('State Central Library', { color: '#c0503d', style: 40, h: 14, roof: '#8f3a2e' });
  city.restyle.set('Mayo Hall', { color: CREAM, style: 40, h: 15 });
  city.restyle.set('Vikasa Soudha', { color: GRANITE, style: 40, h: 26 });
  city.restyle.set('UB Tower', { color: '#9fc3cf', style: 3, h: 118 });
  city.restyle.set('Prestige Kingfisher Towers', { color: '#b6cdd3', style: 3, h: 92 });

  // UB City tower crown
  const ub = namedRings(city, 'UB Tower');
  if (ub.length) {
    const bb = ringBox(ub[0]);
    const kit = new Kit(city, bb.cx, bb.cz, 0);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      kit.box(Math.cos(a) * 13, 118, Math.sin(a) * 13, 1.2, 14 - (i % 2) * 4, 3, '#dfe7ea', 70, -a);
    }
    kit.cyl(0, 118, 0, 9, 7, 6, '#cfdde2', 16);
    kit.cyl(0, 124, 0, 1.2, 0.3, 16, '#e8eef0', 8);
    out.push({ object: kit.mesh() });
  }

  // M. Chinnaswamy Stadium: tiered bowl with gates, solar roofs and floodlights — RCB home
  const cs = namedRings(city, 'M Chinnaswamy Stadium');
  if (cs.length) {
    const bb = ringBox(cs[0]);
    city.exclude(cs[0]);
    const kit = new Kit(city, bb.cx, bb.cz, 0);
    const rx = (bb.maxx - bb.minx) / 2, rz = (bb.maxz - bb.minz) / 2;
    const N = 32, gates = new Set([0, 8, 16, 24]);
    const fx = rx * 0.66, fz = rz * 0.66;
    const seatCols = ['#d64b3b', '#2b2b30', '#e8b33c', '#d64b3b', '#f4f1ea', '#2b2b30', '#d64b3b', '#e8b33c'];
    // field, boundary rope, pitch
    kit.cyl(0, 0, 0, Math.max(fx, fz) * 1.0, Math.max(fx, fz), 0.06, '#7fbf63', 40);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; kit.box(Math.cos(a) * fx * 0.93, 0.06, Math.sin(a) * fz * 0.93, 0.4, 0.15, fx * 0.16, '#ffffff', 70, -a); }
    kit.box(0, 0.06, 0, 3.2, 0.04, 22, '#d7c39a', 70);
    kit.box(0, 0.1, 10, 3, 0.05, 0.12, '#ffffff', 70); kit.box(0, 0.1, -10, 3, 0.05, 0.12, '#ffffff', 70);
    for (const zz of [-10.06, 10.06]) for (const xx of [-0.12, 0, 0.12]) kit.cyl(xx, 0.06, zz, 0.025, 0.025, 0.72, '#e9e0c9', 6);
    for (let i = 0; i < N; i++) {
      if (gates.has(i)) continue;
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const P = (a, rr) => [Math.cos(a) * rx * rr, Math.sin(a) * rz * rr];
      // stand: low inner edge rising to the high outer wall
      const inner0 = P(a0, 0.7), inner1 = P(a1, 0.7), outer0 = P(a0, 1), outer1 = P(a1, 1);
      const seat = seatCols[i % seatCols.length];
      kit.prism([inner0, inner1, P(a1, 0.8), P(a0, 0.8)], 0, 6, '#cfc6b8', 70);
      kit.prism([P(a0, 0.8), P(a1, 0.8), P(a1, 0.9), P(a0, 0.9)], 0, 13, seat, 70);
      kit.prism([P(a0, 0.9), P(a1, 0.9), outer1, outer0], 0, 21, '#e2dbcf', 40);
      // solar roof canopy over the upper tier
      kit.prism([P(a0, 0.84), P(a1, 0.84), P(a1, 1.02), P(a0, 1.02)], 25, 25.8, '#3b4f73', 70);
      if (i % 2 === 0) { const [px, pz] = P(a0 + 0.05, 1.0); kit.box(px, 21, pz, 0.8, 4, 0.8, '#d9d2c6', 70); }
      const ring = [inner0, inner1, outer1, outer0].map(([x, z]) => kit.w(x, z));
      city.addSolid(ring, 21, 0, 'M Chinnaswamy Stadium');
    }
    // six floodlight towers leaning over the bowl
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * rx * 1.08, z = Math.sin(a) * rz * 1.08;
      kit.cyl(x, 0, z, 1.4, 0.8, 52, '#c9c2b6', 8);
      kit.box(x * 0.97, 52, z * 0.97, 9, 5, 2, '#2b2b30', 70, -a + Math.PI / 2);
      kit.box(x * 0.955, 52.5, z * 0.955, 8.4, 4, 0.3, '#fff6c9', 100, -a + Math.PI / 2);
      const [wx, wz] = kit.w(x, z);
      city.pillars = city.pillars || [];
      city.pillars.push([wx, wz, 1.4]);
    }
    city.addPlatform(circleRing(bb.cx, bb.cz, fx, fz), 0.06);
    out.push({
      object: kit.mesh(),
      signs: [{ text: 'M. CHINNASWAMY STADIUM', sub: 'ಈ ಸಲ ಕಪ್ ನಮ್ದೇ · EE SALA CUP NAMDE', pos: kit.w(rx * 1.005, 0), y: 15, yaw: Math.PI / 2, w: 30, h: 4, bg: '#d64b3b', fg: '#ffd84a' }],
      spots: { stadiumCenter: [bb.cx, bb.cz], stadiumGate: kit.w(rx + 8, 0) },
    });
  }

  // St. Mark's Cathedral: cross plan, central dome
  const sm = namedRings(city, "Saint Mark's Cathedral");
  if (sm.length) {
    const bb = ringBox(sm[0]);
    const kit = new Kit(city, bb.cx, bb.cz, 0);
    city.exclude(circleRing(bb.cx, bb.cz, 32, 32, 12));
    kit.box(0, 0, 0, 52, 13, 16, CREAM, 40);
    kit.box(0, 0, 0, 16, 13, 34, CREAM, 40);
    kit.box(0, 13, 0, 52.6, 1, 16.6, '#d9cdb5', 70);
    kit.cyl(0, 13, 0, 7, 7, 4, CREAM, 16, 40);
    kit.dome(0, 17, 0, 7, '#a7b0b4', 1.1, 16, 7);
    kit.cyl(0, 24.6, 0, 0.5, 0.3, 3, '#c9a64b', 6);
    kit.box(28, 0, 0, 6, 17, 12, CREAM, 40);
    kit.pyramid(28, 17, 0, 6, 12, 4, '#a7b0b4');
    for (const [x, z, w, d] of [[0, 0, 52, 16], [0, 0, 16, 34]]) city.addSolid(rectRing(...kit.w(x, z), w, d), 13, 0, "St. Mark's Cathedral");
    out.push({ object: kit.mesh(), spots: { stMarks: kit.w(36, 0) } });
  }

  // Cubbon Park bandstand
  const bs = namedRings(city, 'Band Stand');
  if (bs.length) {
    const bb = ringBox(bs[0]);
    city.exclude(circleRing(bb.cx, bb.cz, 8, 8, 10));
    const kit = new Kit(city, bb.cx, bb.cz, 0);
    kit.cyl(0, 0, 0, 6.5, 6.5, 1.2, '#e6ddcb', 8);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; kit.cyl(Math.cos(a) * 5.6, 1.2, Math.sin(a) * 5.6, 0.25, 0.25, 4, WHITE, 6); }
    kit.cyl(0, 5.2, 0, 6.8, 6.8, 0.4, '#2f6f4e', 8);
    kit.cyl(0, 5.6, 0, 6.6, 0.3, 3.6, '#2f6f4e', 8);
    city.addPlatform(circleRing(bb.cx, bb.cz, 6.5, 6.5, 8), 1.2);
    out.push({ object: kit.mesh(), spots: { bandstand: [bb.cx, bb.cz] } });
  }

  // Statues: Queen Victoria and Mahatma Gandhi near MG Road, Mark Cubbon in the park
  const st = [];
  const kitS = new Kit(city, 0, 0, 0);
  const statues = [
    [-239.6, -95.3, { hairStyle: 'bun', extras: ['saree'] }, 'point', 'Queen Victoria statue'],
    [-136.4, -149.3, { hairStyle: 'bald', extras: ['glasses', 'veshti'] }, 'namaste', 'Mahatma Gandhi statue'],
    [-728.9, -35.0, { hairStyle: 'short' }, 'point', 'Mark Cubbon statue'],
  ];
  for (const [x, z, look, pose, name] of statues) st.push(pedestalStatue(city, kitS, x, z, look, pose, name));
  const grp = new THREE.Group();
  grp.add(kitS.mesh(), ...st);
  out.push({ object: grp });
  return out;
}

const ZONE_BUILDERS = { central, ...ZONE_LANDMARKS };

// Zone landmarks: call before city.build() so footprints can be excluded / restyled.
export function buildLandmarks(zone, city) {
  const list = [];
  try { if (ZONE_BUILDERS[zone]) list.push(...ZONE_BUILDERS[zone](city)); } catch (e) { console.error('landmarks', zone, e); }
  return list;
}

// Things that need the built city (metro lines): call after city.build(). Also gathers mission
// spots and custom signs from every landmark.
export function finishLandmarks(city, list, zone) {
  try { list.push(...metroStations(city)); } catch (e) { console.error('stations', e); }
  try { if (ZONE_LATE[zone]) list.push(...ZONE_LATE[zone](city)); } catch (e) { console.error('late landmarks', zone, e); }
  city.spots = {};
  for (const l of list) Object.assign(city.spots, l.spots || {});
  city.customSigns = list.flatMap((l) => l.signs || []);
  return list;
}
