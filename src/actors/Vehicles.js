import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../core/Toon.js';

// Vehicles of Bengaluru: scooters, motorcycles, autos, cars, BMTC buses and water tankers, with
// extruded rounded bodies, glass, wheels with rims, lights, bumpers and mirrors.
// Each model is one merged geometry with vertex colours and a glow channel (lights).
// Models face +z with their origin on the ground.

function piece(geo, color, pos, rot, glow = 0, scale) {
  if (scale) geo.scale(...scale);
  if (rot) geo.rotateX(rot[0] || 0).rotateY(rot[1] || 0).rotateZ(rot[2] || 0);
  geo.translate(...pos);
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, c = new THREE.Color(color);
  const col = new Float32Array(n * 3), gl = new Float32Array(n);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; gl[i] = glow; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 10, ...rest) => new THREE.CylinderGeometry(r0, r1, h, s, ...rest);
const sph = (r, a = 10, b = 8, ...rest) => new THREE.SphereGeometry(r, a, b, ...rest);
const cap = (r, l, s = 8) => new THREE.CapsuleGeometry(r, l, 3, s);

function merge(parts) {
  // keep every part's own normals: smooth curved bodies, crisp boxes
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- shared shapes

// A side profile [[z, y], ...] (z forward, y up) extruded across the width, with rounded edges.
function body(profile, width, color, bevel = 0.05, glow = 0) {
  const s = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);   // shape x -> world z (forward), extrusion -> world x (width)
  return piece(g, color, [0, 0, 0], null, glow);
}

// A wheel lying on its side at (x, y, z): tyre with tread, rim, hub.
function wheel(P, x, y, z, r, w, rim = '#c9ccd2') {
  const side = Math.sign(x) || 1;
  P.push(piece(cyl(r, r, w, 18), '#1d1d21', [x, y, z], [0, 0, Math.PI / 2]));
  P.push(piece(cyl(r * 0.92, r * 0.92, w + 0.01, 18), '#2a2a2e', [x, y, z], [0, 0, Math.PI / 2]));
  P.push(piece(cyl(r * 0.6, r * 0.6, 0.02, 14), rim, [x + side * (w / 2 + 0.005), y, z], [0, 0, Math.PI / 2]));
  P.push(piece(cyl(r * 0.22, r * 0.22, 0.03, 10), '#8a8d94', [x + side * (w / 2 + 0.015), y, z], [0, 0, Math.PI / 2]));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P.push(piece(box(0.02, r * 0.55, 0.04), rim, [x + side * (w / 2 + 0.012), y + Math.cos(a) * r * 0.32, z + Math.sin(a) * r * 0.32], [a, 0, 0]));
  }
}

// A rider in a fixed riding pose, merged into two-wheeler models for traffic.
function rider(P, shirt, helmet, z = -0.15, y = 0.62) {
  const skin = ['#8d5a3b', '#a8714c', '#c08a62'][Math.floor(Math.random() * 3)];
  const pants = ['#2f3a4a', '#3b4a63', '#4a4036'][Math.floor(Math.random() * 3)];
  // torso leaning forward, arms to the bars
  P.push(piece(cap(0.15, 0.3, 10), shirt, [0, y + 0.58, z - 0.04], [0.28, 0, 0], 0, [1, 1, 0.75]));
  P.push(piece(cyl(0.05, 0.055, 0.08, 8), skin, [0, y + 0.86, z + 0.06]));
  P.push(piece(sph(0.125, 14, 10), helmet, [0, y + 1.0, z + 0.05], null, 0, [0.95, 1, 1.08]));
  P.push(piece(sph(0.11, 12, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.35), '#1d2228', [0, y + 0.99, z + 0.08], [0.2, 0, 0]));   // visor
  for (const sx of [1, -1]) {
    P.push(piece(cap(0.068, 0.34, 8), pants, [sx * 0.14, y + 0.27, z + 0.17], [1.35, 0, 0]));          // thigh
    P.push(piece(cap(0.055, 0.34, 8), pants, [sx * 0.16, y + 0.0, z + 0.36], [0.15, 0, 0]));            // shin
    P.push(piece(box(0.1, 0.07, 0.22), '#2a2422', [sx * 0.16, y - 0.2, z + 0.42]));                     // shoe
    P.push(piece(cap(0.048, 0.36, 8), shirt, [sx * 0.2, y + 0.66, z + 0.27], [1.15, 0, sx * -0.2]));    // arm
    P.push(piece(sph(0.045, 8, 6), skin, [sx * 0.23, y + 0.56, z + 0.46]));                            // hand
  }
}

// ---------------------------------------------------------------- two-wheelers

// An Activa-style scooter: front apron, floorboard, rear cowl, seat, bars with a headlamp housing.
export function scooterGeo({ body: col = '#f07b5a', seat = '#2b2422', withRider = false, shirt = '#5aa9e6', helmet = '#f2c14e', box: delivery = null } = {}) {
  const P = [];
  P.push(body([[0.62, 0.3], [0.7, 0.55], [0.66, 1.0], [0.52, 1.08], [0.44, 0.75], [0.36, 0.38], [0.42, 0.3]], 0.42, col, 0.05));   // front apron
  P.push(body([[0.42, 0.3], [-0.2, 0.3], [-0.2, 0.4], [0.42, 0.4]], 0.34, '#3a3a40', 0.02));                                     // floorboard
  P.push(body([[-0.15, 0.32], [-0.82, 0.38], [-0.9, 0.55], [-0.78, 0.8], [-0.1, 0.78], [-0.05, 0.5]], 0.44, col, 0.07));          // rear cowl
  P.push(body([[-0.08, 0.78], [-0.78, 0.8], [-0.74, 0.9], [-0.1, 0.9]], 0.34, seat, 0.05));                                      // seat
  P.push(piece(cyl(0.025, 0.025, 0.6, 8), '#2b2b30', [0, 1.14, 0.5], [0, 0, Math.PI / 2]));                                      // handlebar
  P.push(piece(box(0.3, 0.12, 0.14), col, [0, 1.13, 0.55]));                                                                      // headlamp housing
  P.push(piece(box(0.18, 0.08, 0.03), '#fff6d0', [0, 1.06, 0.64], null, 1));                                                     // headlamp
  P.push(piece(box(0.2, 0.05, 0.03), '#ff4a4a', [0, 0.66, -0.9], null, 1));                                                       // tail light
  for (const sx of [1, -1]) {
    P.push(piece(cyl(0.008, 0.008, 0.18, 4), '#2b2b30', [sx * 0.2, 1.24, 0.5]));                                                 // mirror stalks
    P.push(piece(sph(0.04, 8, 6), '#2b2b30', [sx * 0.21, 1.34, 0.5], null, 0, [1, 0.7, 0.4]));
    P.push(piece(sph(0.02, 6, 4), '#ffb347', [sx * 0.16, 1.1, 0.62], null, 1));                                                  // indicators
  }
  P.push(piece(cyl(0.03, 0.03, 0.5, 8), '#5a5d64', [0, 0.52, 0.66], [0.32, 0, 0]));                                             // fork
  wheel(P, 0, 0.26, 0.68, 0.26, 0.1);
  wheel(P, 0, 0.26, -0.62, 0.26, 0.11);
  P.push(piece(box(0.12, 0.05, 0.3), '#2b2b30', [0, 0.52, -0.62]));                                                              // rear mudguard
  if (withRider) rider(P, shirt, helmet, -0.18, 0.62);
  if (delivery) {
    P.push(piece(box(0.5, 0.46, 0.44), delivery, [0, 1.42, -0.62]));
    P.push(piece(box(0.52, 0.08, 0.46), new THREE.Color(delivery).multiplyScalar(0.7).getHex(), [0, 1.66, -0.62]));
  }
  return merge(P);
}

// A commuter motorcycle: tank, engine block, exhaust, seat, round headlamp.
export function bikeGeo({ body: col = '#c0262d', withRider = false, shirt = '#5aa9e6', helmet = '#2b2b30', box: delivery = null } = {}) {
  const P = [];
  P.push(body([[0.35, 0.78], [0.05, 0.95], [-0.25, 0.92], [-0.22, 0.75], [0.3, 0.68]], 0.3, col, 0.06));                       // tank
  P.push(body([[-0.2, 0.86], [-0.8, 0.86], [-0.8, 0.94], [-0.2, 0.96]], 0.26, '#1f1c1b', 0.04));                               // seat
  P.push(body([[-0.75, 0.8], [-1.0, 0.82], [-0.98, 0.9], [-0.76, 0.88]], 0.22, col, 0.03));                                   // tail
  P.push(piece(box(0.26, 0.3, 0.36), '#5a5d64', [0, 0.52, 0.0]));                                                               // engine
  for (let i = 0; i < 4; i++) P.push(piece(box(0.28, 0.02, 0.3), '#8a8d94', [0, 0.42 + i * 0.07, 0.02]));                      // fins
  P.push(piece(cyl(0.045, 0.05, 0.85, 10), '#b8bcc4', [0.17, 0.38, -0.45], [Math.PI / 2 + 0.12, 0, 0]));                        // exhaust
  P.push(piece(cyl(0.025, 0.025, 0.55, 8), '#5a5d64', [0, 0.68, 0.58], [0.45, 0, 0]));                                         // fork
  P.push(piece(cyl(0.022, 0.022, 0.7, 8), '#2b2b30', [0, 1.04, 0.42], [0, 0, Math.PI / 2]));                                   // bars
  P.push(piece(cyl(0.09, 0.08, 0.08, 14), '#2b2b30', [0, 0.98, 0.62], [Math.PI / 2, 0, 0]));                                   // headlamp shell
  P.push(piece(cyl(0.075, 0.075, 0.02, 14), '#fff6d0', [0, 0.98, 0.665], [Math.PI / 2, 0, 0], 1));
  P.push(piece(box(0.14, 0.05, 0.03), '#ff4a4a', [0, 0.86, -1.0], null, 1));
  wheel(P, 0, 0.31, 0.72, 0.31, 0.09);
  wheel(P, 0, 0.31, -0.72, 0.31, 0.11);
  if (withRider) rider(P, shirt, helmet, -0.28, 0.66);
  if (delivery) P.push(piece(box(0.48, 0.44, 0.42), delivery, [0, 1.5, -0.78]));
  return merge(P);
}

// ---------------------------------------------------------------- the auto

export function autoGeo({ lower = '#2f8f4e', upper = '#f2c94c', roof = '#1f1f22', driver = true } = {}) {
  const P = [];
  // green tub with the rounded nose, yellow cowl, black canvas hood
  P.push(body([[1.18, 0.34], [1.3, 0.62], [1.2, 0.95], [0.95, 1.02], [-1.15, 1.02], [-1.22, 0.85], [-1.15, 0.34]], 1.3, lower, 0.08));
  P.push(body([[1.2, 0.95], [1.05, 1.32], [0.82, 1.45], [0.72, 1.02], [0.95, 1.0]], 1.24, upper, 0.06));                         // front cowl
  P.push(body([[-1.15, 1.0], [-1.25, 1.02], [-1.25, 1.62], [-1.12, 1.62]], 1.28, roof, 0.03));                                    // rear panel
  P.push(piece(cyl(0.7, 0.7, 1.95, 16, 1, true, -Math.PI / 2, Math.PI), roof, [0, 1.78, -0.22], [Math.PI / 2, 0, 0], 0, [1, 1, 0.42]));  // hood
  for (const sx of [1, -1]) {
    P.push(piece(box(0.045, 0.8, 0.045), '#2a2a2e', [sx * 0.62, 1.42, 0.72]));                                                   // front posts
    P.push(piece(box(0.04, 0.7, 0.04), '#2a2a2e', [sx * 0.64, 1.36, -1.12]));
    P.push(piece(box(0.03, 0.06, 1.85), upper, [sx * 0.66, 1.04, -0.15]));                                                       // yellow trim
  }
  P.push(piece(box(1.18, 0.62, 0.025), '#9ab8c4', [0, 1.5, 0.76], [-0.14, 0, 0]));                                              // windscreen
  P.push(piece(box(1.1, 0.06, 0.06), '#2a2a2e', [0, 1.84, 0.74]));
  P.push(body([[-0.35, 0.95], [-1.05, 0.95], [-1.05, 1.12], [-0.35, 1.12]], 1.1, '#6e2a26', 0.05));                             // passenger seat
  P.push(body([[-1.05, 1.1], [-1.15, 1.1], [-1.12, 1.6], [-1.02, 1.6]], 1.1, '#6e2a26', 0.04));                                 // backrest
  P.push(piece(cyl(0.022, 0.022, 0.62, 8), '#2b2b30', [0, 1.3, 0.55], [0, 0, Math.PI / 2]));                                    // handlebar
  P.push(piece(cyl(0.11, 0.1, 0.07, 14), '#2b2b30', [0, 1.2, 1.22], [Math.PI / 2, 0, 0]));                                      // headlamp
  P.push(piece(cyl(0.09, 0.09, 0.02, 14), '#fff6d0', [0, 1.2, 1.26], [Math.PI / 2, 0, 0], 1));
  for (const sx of [1, -1]) P.push(piece(box(0.16, 0.08, 0.03), '#ff4a4a', [sx * 0.5, 0.72, -1.24], null, 1));
  P.push(piece(box(0.16, 0.2, 0.1), '#2b2b2b', [-0.52, 1.4, 0.68]));                                                              // the meter
  P.push(piece(box(0.12, 0.06, 0.02), '#ff5a3a', [-0.52, 1.43, 0.735], null, 1));
  P.push(piece(box(0.3, 0.1, 0.02), '#f4f1ea', [0, 0.5, 1.29]));                                                                  // number plate
  wheel(P, 0, 0.26, 0.98, 0.26, 0.13);
  wheel(P, 0.62, 0.26, -0.85, 0.26, 0.13);
  wheel(P, -0.62, 0.26, -0.85, 0.26, 0.13);
  if (driver) {
    P.push(piece(cap(0.17, 0.28, 10), '#c8a96b', [0, 1.42, 0.22], null, 0, [1, 1, 0.8]));                                       // khaki uniform
    P.push(piece(sph(0.11, 12, 10), '#8d5a3b', [0, 1.84, 0.24], null, 0, [0.95, 1.1, 1]));
    P.push(piece(box(0.1, 0.022, 0.025), '#1d1a1c', [0, 1.8, 0.345]));                                                           // moustache
    P.push(piece(sph(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), '#1d1a1c', [0, 1.87, 0.22]));
    for (const sx of [1, -1]) P.push(piece(cap(0.045, 0.3, 8), '#c8a96b', [sx * 0.2, 1.4, 0.4], [1.2, 0, sx * -0.3]));
  }
  return merge(P);
}

// ---------------------------------------------------------------- cars

// A hatchback / compact sedan: rounded body, glass cabin, roof, pillars, lights, bumpers, mirrors.
export function carGeo({ body: col = '#5aa9e6' } = {}) {
  const P = [];
  const W = 1.74;
  P.push(body([[-1.93, 0.36], [1.93, 0.36], [1.99, 0.56], [1.93, 0.78], [1.25, 0.9], [0.92, 0.95], [-1.3, 0.98], [-1.86, 0.92], [-1.98, 0.64]], W, col, 0.08));
  P.push(body([[0.96, 0.92], [0.4, 1.38], [-0.95, 1.4], [-1.48, 0.96]], W - 0.14, '#1c2530', 0.06));                              // glass cabin
  P.push(body([[0.42, 1.36], [-0.95, 1.38], [-0.93, 1.45], [0.38, 1.43]], W - 0.12, col, 0.05));                                   // roof
  for (const sx of [1, -1]) {
    P.push(piece(box(0.05, 0.46, 0.09), col, [sx * (W / 2 - 0.07), 1.16, -0.25], [0.05, 0, 0]));                                  // B pillar
    P.push(piece(box(0.012, 0.42, 0.02), '#2a2a2e', [sx * (W / 2 + 0.005), 0.66, 0.48]));                                         // door lines
    P.push(piece(box(0.012, 0.42, 0.02), '#2a2a2e', [sx * (W / 2 + 0.005), 0.66, -0.98]));
    P.push(piece(box(0.012, 0.03, 0.14), '#b8bcc4', [sx * (W / 2 + 0.01), 0.82, 0.25]));                                          // handles
    P.push(piece(box(0.012, 0.03, 0.14), '#b8bcc4', [sx * (W / 2 + 0.01), 0.82, -0.7]));
    P.push(piece(box(0.12, 0.08, 0.06), col, [sx * (W / 2 + 0.05), 1.0, 0.82]));                                                  // mirrors
    P.push(piece(box(0.02, 0.06, 0.04), '#cfd8de', [sx * (W / 2 + 0.11), 1.0, 0.8]));
    P.push(piece(box(0.38, 0.12, 0.06), '#fff6d0', [sx * 0.58, 0.8, 1.96], [0, sx * -0.12, 0], 1));                              // headlights
    P.push(piece(box(0.36, 0.11, 0.06), '#ff4040', [sx * 0.6, 0.84, -1.96], null, 1));                                            // tail lights
  }
  P.push(piece(box(0.72, 0.16, 0.05), '#1e1e22', [0, 0.66, 1.98]));                                                                // grille
  P.push(piece(box(1.8, 0.16, 0.16), '#2a2a2e', [0, 0.42, 1.95]));                                                                 // bumpers
  P.push(piece(box(1.8, 0.16, 0.16), '#2a2a2e', [0, 0.44, -1.95]));
  P.push(piece(box(0.42, 0.1, 0.02), '#f4f1ea', [0, 0.46, 2.04]));                                                                 // plates
  P.push(piece(box(0.42, 0.1, 0.02), '#f4f1ea', [0, 0.62, -2.0]));
  for (const [x, z] of [[0.76, 1.22], [-0.76, 1.22], [0.76, -1.24], [-0.76, -1.24]]) {
    wheel(P, x, 0.31, z, 0.31, 0.2);
    P.push(piece(cyl(0.36, 0.36, 0.22, 14, 1, true, 0, Math.PI), '#1a1a1d', [x * 1.005, 0.36, z], [0, 0, Math.PI / 2]));       // arch
  }
  return merge(P);
}

// ---------------------------------------------------------------- BMTC bus

export function busGeo({ body: col = '#3c7fc4', band = '#f4f1ea' } = {}) {
  const P = [];
  const W = 2.5;
  P.push(body([[5.45, 0.42], [5.55, 1.1], [5.5, 2.9], [5.3, 3.12], [-5.35, 3.12], [-5.5, 2.95], [-5.5, 0.42]], W, band, 0.1));
  P.push(body([[5.5, 0.42], [5.56, 1.15], [-5.51, 1.15], [-5.51, 0.42]], W + 0.02, col, 0.08));                                    // lower colour band
  P.push(body([[5.3, 3.0], [5.25, 3.14], [-5.3, 3.14], [-5.4, 3.0]], W - 0.1, col, 0.06));                                        // roof band
  P.push(body([[4.0, 1.55], [4.0, 2.6], [-5.1, 2.6], [-5.1, 1.55]], W + 0.03, '#1f2a33', 0.02));                                  // side windows
  for (let i = 0; i < 9; i++) P.push(piece(box(W + 0.05, 1.05, 0.08), band, [0, 2.08, 3.6 - i * 1.0]));                           // window pillars
  P.push(piece(box(2.2, 1.25, 0.05), '#1f2a33', [0, 2.15, 5.56], [-0.04, 0, 0]));                                                 // windscreen
  P.push(piece(box(1.7, 0.28, 0.05), '#111', [0, 2.88, 5.53]));
  P.push(piece(box(1.5, 0.18, 0.04), '#ffb347', [0, 2.88, 5.56], null, 1));                                                      // route board
  P.push(piece(box(0.9, 1.9, 0.04), '#1f2a33', [W / 2 + 0.005, 1.5, 3.9], [0, Math.PI / 2, 0]));                                 // front door
  P.push(piece(box(1.1, 1.9, 0.04), '#1f2a33', [W / 2 + 0.005, 1.5, -0.6], [0, Math.PI / 2, 0]));                                // middle door
  for (const sx of [1, -1]) {
    P.push(piece(box(0.4, 0.16, 0.05), '#fff6d0', [sx * 0.85, 0.85, 5.57], null, 1));
    P.push(piece(box(0.3, 0.3, 0.05), '#ff4040', [sx * 1.0, 1.0, -5.52], null, 1));
    P.push(piece(box(0.06, 0.3, 0.18), '#2a2a2e', [sx * (W / 2 + 0.12), 2.3, 5.2]));                                              // mirrors
  }
  P.push(piece(box(2.55, 0.25, 0.25), '#2a2a2e', [0, 0.5, 5.5]));
  for (const z of [3.7, -3.4]) for (const x of [1.02, -1.02]) wheel(P, x, 0.5, z, 0.5, 0.3);
  return merge(P);
}

// ---------------------------------------------------------------- water tanker

export function tankerGeo() {
  const P = [];
  P.push(body([[4.0, 0.7], [4.05, 1.5], [3.9, 2.6], [2.2, 2.65], [2.15, 0.7]], 2.3, '#e8e2d6', 0.1));                            // cab
  P.push(body([[3.98, 1.6], [3.85, 2.45], [2.8, 2.45], [2.8, 1.6]], 2.34, '#1f2a33', 0.04));                                      // cab glass
  P.push(piece(box(2.3, 0.35, 7.4), '#2f2f35', [0, 0.85, 0.1]));                                                                  // chassis
  P.push(piece(cap(1.0, 3.9, 16), '#2f6fd1', [0, 2.0, -1.0], [Math.PI / 2, 0, 0]));                                              // the blue water tank
  for (const z of [0.6, -1.0, -2.6]) P.push(piece(cyl(1.02, 1.02, 0.08, 16), '#245db3', [0, 2.0, z], [Math.PI / 2, 0, 0]));       // bands
  P.push(piece(cyl(0.25, 0.25, 0.2, 12), '#245db3', [0, 3.05, -1.0]));                                                             // hatch
  for (const sx of [1, -1]) {
    P.push(piece(box(0.3, 0.14, 0.06), '#fff6d0', [sx * 0.8, 1.1, 4.06], null, 1));
    P.push(piece(box(0.2, 0.12, 0.05), '#ff4040', [sx * 1.0, 0.95, -3.62], null, 1));
  }
  P.push(piece(box(2.35, 0.25, 0.25), '#2a2a2e', [0, 0.7, 4.0]));
  for (const z of [3.1, -1.4, -2.8]) for (const x of [1.0, -1.0]) wheel(P, x, 0.48, z, 0.48, 0.32);
  return merge(P);
}

export function metroCarGeo(front = false) {
  const P = [];
  P.push(piece(box(2.9, 2.7, 18), '#f4f1ea', [0, 1.75, 0]));
  P.push(piece(box(2.94, 0.55, 18.02), '#8e5bb5', [0, 0.85, 0]));
  P.push(piece(box(2.94, 0.18, 18.02), '#8e5bb5', [0, 2.5, 0]));
  P.push(piece(box(2.96, 0.9, 16.5), '#9ccbdd', [0, 1.8, 0]));
  for (const z of [-5, 0, 5]) P.push(piece(box(2.98, 1.9, 1.3), '#cfd6da', [0, 1.45, z]));
  if (front) {
    P.push(piece(cap(1.4, 0.4, 10), '#f4f1ea', [0, 1.75, 9.2], [0, 0, Math.PI / 2], 0, [1, 0.95, 0.9]));
    P.push(piece(box(2.2, 0.8, 0.05), '#2b3640', [0, 2.2, 10.35], [-0.3, 0, 0]));
    P.push(piece(box(0.4, 0.14, 0.05), '#fff6d0', [0.8, 1.2, 10.5], null, 1));
    P.push(piece(box(0.4, 0.14, 0.05), '#fff6d0', [-0.8, 1.2, 10.5], null, 1));
  }
  P.push(piece(box(2.6, 0.2, 17.5), '#8ff0ff', [0, 0.32, 0], null, 1));   // maglev glow
  return merge(P);
}

let vmat;
export function vehicleMaterial() {
  return vmat || (vmat = toon({ vertexColors: true, glowAttr: true, gloss: true, hatch: 0.8, rim: 0.08 }));
}

// The player's own hover scooter, with animated pads and a light trail.
export class PlayerScooter {
  constructor() {
    this.object = new THREE.Group();
    this.mesh = new THREE.Mesh(scooterGeo({ body: '#3fb3a6' }), vehicleMaterial());
    this.mesh.castShadow = true;
    this.object.add(this.mesh);
    this.object.visible = false;
  }
}
