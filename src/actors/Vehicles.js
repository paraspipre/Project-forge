import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../core/Toon.js';

// Low-poly vehicle models for Bengaluru, 2099: everything hovers, nothing moves faster.
// Each model is one merged geometry with vertex colours and a glow channel (hover pads, lights).
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
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// A rider in a fixed riding pose, merged into scooter models for traffic.
function rider(P, shirt, helmet, z = -0.15, y = 0.62) {
  const skin = ['#8d5a3b', '#a8714c', '#c08a62'][Math.floor(Math.random() * 3)];
  P.push(piece(cap(0.15, 0.32), shirt, [0, y + 0.55, z - 0.05], [0.25, 0, 0]));
  P.push(piece(sph(0.12), helmet, [0, y + 1.0, z + 0.05]));
  P.push(piece(box(0.18, 0.06, 0.04), '#2a2a30', [0, y + 0.99, z + 0.16], null, 0));
  P.push(piece(cap(0.06, 0.38), '#3b4a63', [0.13, y + 0.25, z + 0.2], [1.3, 0, 0]));
  P.push(piece(cap(0.06, 0.38), '#3b4a63', [-0.13, y + 0.25, z + 0.2], [1.3, 0, 0]));
  P.push(piece(cap(0.05, 0.42), shirt, [0.2, y + 0.65, z + 0.25], [1.1, 0, -0.2]));
  P.push(piece(cap(0.05, 0.42), shirt, [-0.2, y + 0.65, z + 0.25], [1.1, 0, 0.2]));
  P.push(piece(sph(0.05), skin, [0.22, y + 0.55, z + 0.48]));
  P.push(piece(sph(0.05), skin, [-0.22, y + 0.55, z + 0.48]));
}

export function scooterGeo({ body = '#f07b5a', seat = '#3a2f2c', withRider = false, shirt = '#5aa9e6', helmet = '#f2c14e', box: delivery = null } = {}) {
  const P = [];
  P.push(piece(cap(0.26, 1.0), body, [0, 0.55, 0], [Math.PI / 2, 0, 0], 0, [1, 1, 0.75]));      // hull
  P.push(piece(box(0.46, 0.12, 0.7), seat, [0, 0.82, -0.25]));                                   // seat
  P.push(piece(box(0.36, 0.5, 0.18), body, [0, 0.92, 0.48], [-0.35, 0, 0]));                    // front shield
  P.push(piece(cyl(0.035, 0.035, 0.62, 6), '#2b2b30', [0, 1.22, 0.5], [0, 0, Math.PI / 2]));      // handlebar
  P.push(piece(box(0.22, 0.12, 0.08), '#fff6d0', [0, 1.02, 0.6], null, 1));                     // headlamp
  P.push(piece(box(0.3, 0.06, 0.05), '#ff5a5a', [0, 0.7, -0.78], null, 1));                     // tail light
  for (const z of [-0.45, 0.45]) {
    P.push(piece(cyl(0.24, 0.3, 0.12, 12), '#2b2b30', [0, 0.32, z]));
    P.push(piece(cyl(0.2, 0.2, 0.04, 12), '#8ff0ff', [0, 0.25, z], null, 1));                  // hover pad glow
  }
  if (withRider) rider(P, shirt, helmet, -0.1, 0.55);
  if (delivery) P.push(piece(box(0.5, 0.48, 0.45), delivery, [0, 1.2, -0.62]));
  return merge(P);
}

export function autoGeo({ lower = '#2f8f4e', upper = '#f2c94c', roof = '#2b2b2b', driver = true } = {}) {
  const P = [];
  // the Bengaluru auto: green belly, yellow front, black canvas hood
  P.push(piece(box(1.3, 0.55, 2.3), lower, [0, 0.62, -0.1]));
  P.push(piece(cap(0.6, 0.3, 10), upper, [0, 1.0, 0.88], [0, 0, Math.PI / 2], 0, [1, 0.95, 0.7]));  // nose
  P.push(piece(box(1.32, 0.18, 2.3), upper, [0, 0.98, -0.1]));                                     // waist band
  P.push(piece(box(1.36, 0.08, 2.0), roof, [0, 2.0, -0.25]));                                      // hood
  P.push(piece(cyl(0.68, 0.68, 2.0, 12, 1, false, 0, Math.PI), roof, [0, 1.95, -0.25], [Math.PI / 2, 0, Math.PI / 2], 0, [1, 1, 0.35]));
  P.push(piece(box(0.06, 1.0, 0.06), '#2b2b2b', [0.62, 1.5, 0.62]));
  P.push(piece(box(0.06, 1.0, 0.06), '#2b2b2b', [-0.62, 1.5, 0.62]));
  P.push(piece(box(1.2, 0.75, 0.04), '#bfe3ee', [0, 1.55, 0.72], [-0.12, 0, 0]));                 // windscreen
  P.push(piece(box(1.2, 0.5, 0.06), roof, [0, 1.25, -1.24]));                                       // back
  P.push(piece(box(1.0, 0.25, 0.6), '#7a2f2f', [0, 1.05, -0.75]));                                  // seat
  P.push(piece(box(0.26, 0.14, 0.06), '#fff6d0', [0, 1.05, 1.14], null, 1));                        // headlamp
  P.push(piece(box(0.18, 0.08, 0.04), '#ff5a5a', [0.5, 0.75, -1.26], null, 1));
  P.push(piece(box(0.18, 0.08, 0.04), '#ff5a5a', [-0.5, 0.75, -1.26], null, 1));
  // meter box on the left (meter mele 50!)
  P.push(piece(box(0.16, 0.2, 0.1), '#2b2b2b', [-0.52, 1.35, 0.7]));
  P.push(piece(box(0.12, 0.06, 0.02), '#ff5a3a', [-0.52, 1.38, 0.76], null, 1));
  for (const [x, z] of [[0, 0.95], [0.55, -0.85], [-0.55, -0.85]]) {
    P.push(piece(cyl(0.3, 0.36, 0.14, 12), '#2b2b30', [x, 0.3, z]));
    P.push(piece(cyl(0.24, 0.24, 0.04, 12), '#8ff0ff', [x, 0.22, z], null, 1));
  }
  if (driver) {
    P.push(piece(cap(0.17, 0.3), '#c8a96b', [0, 1.45, 0.25]));      // khaki uniform
    P.push(piece(sph(0.12), '#8d5a3b', [0, 1.88, 0.27]));
    P.push(piece(box(0.12, 0.03, 0.03), '#1d1a1c', [0, 1.84, 0.39])); // moustache
    P.push(piece(sph(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), '#1d1a1c', [0, 1.92, 0.25]));
  }
  return merge(P);
}

export function carGeo({ body = '#5aa9e6' } = {}) {
  const P = [];
  P.push(piece(box(1.75, 0.6, 3.9), body, [0, 0.72, 0]));
  P.push(piece(box(1.55, 0.55, 2.1), body, [0, 1.28, -0.3]));
  P.push(piece(box(1.5, 0.48, 0.05), '#a9d3e0', [0, 1.3, 0.77], [-0.5, 0, 0]));
  P.push(piece(box(1.5, 0.42, 0.05), '#a9d3e0', [0, 1.3, -1.36], [0.4, 0, 0]));
  P.push(piece(box(1.57, 0.4, 1.7), '#a9d3e0', [0, 1.3, -0.3], null, 0, [1, 1, 1]));
  P.push(piece(box(1.6, 0.06, 2.2), body, [0, 1.57, -0.3]));
  P.push(piece(box(0.36, 0.12, 0.06), '#fff6d0', [0.6, 0.8, 1.95], null, 1));
  P.push(piece(box(0.36, 0.12, 0.06), '#fff6d0', [-0.6, 0.8, 1.95], null, 1));
  P.push(piece(box(0.36, 0.1, 0.06), '#ff5a5a', [0.6, 0.82, -1.95], null, 1));
  P.push(piece(box(0.36, 0.1, 0.06), '#ff5a5a', [-0.6, 0.82, -1.95], null, 1));
  for (const [x, z] of [[0.7, 1.2], [-0.7, 1.2], [0.7, -1.2], [-0.7, -1.2]]) {
    P.push(piece(cyl(0.28, 0.32, 0.14, 10), '#2b2b30', [x, 0.32, z]));
    P.push(piece(cyl(0.22, 0.22, 0.04, 10), '#8ff0ff', [x, 0.24, z], null, 1));
  }
  return merge(P);
}

export function busGeo({ body = '#3c7fc4', band = '#f4f1ea' } = {}) {
  const P = [];
  P.push(piece(box(2.5, 2.3, 11), band, [0, 1.75, 0]));
  P.push(piece(box(2.52, 0.9, 11.02), body, [0, 1.0, 0]));
  P.push(piece(box(2.52, 0.25, 11.02), body, [0, 2.85, 0]));
  P.push(piece(box(2.54, 0.9, 9.2), '#9ccbdd', [0, 2.15, -0.6]));
  P.push(piece(box(2.3, 1.2, 0.06), '#9ccbdd', [0, 2.1, 5.51]));
  P.push(piece(box(1.6, 0.3, 0.06), '#2b2b30', [0, 2.95, 5.52]));
  P.push(piece(box(1.4, 0.2, 0.04), '#ffb347', [0, 2.95, 5.55], null, 1));     // route board glow
  P.push(piece(box(0.4, 0.15, 0.06), '#fff6d0', [0.8, 0.85, 5.51], null, 1));
  P.push(piece(box(0.4, 0.15, 0.06), '#fff6d0', [-0.8, 0.85, 5.51], null, 1));
  P.push(piece(box(2.4, 0.12, 10.6), '#dfe6ea', [0, 2.98, 0]));
  for (const z of [3.6, -3.6]) for (const x of [1.0, -1.0]) {
    P.push(piece(cyl(0.38, 0.44, 0.16, 10), '#2b2b30', [x, 0.36, z]));
    P.push(piece(cyl(0.3, 0.3, 0.04, 10), '#8ff0ff', [x, 0.26, z], null, 1));
  }
  return merge(P);
}

export function tankerGeo() {
  const P = [];
  P.push(piece(box(2.3, 1.8, 2.2), '#e8e2d6', [0, 1.5, 2.8]));
  P.push(piece(box(2.2, 0.8, 2.0), '#a9d3e0', [0, 1.95, 3.0]));
  P.push(piece(box(2.4, 0.5, 7.6), '#3b3b40', [0, 0.75, 0]));
  P.push(piece(cap(1.05, 4.2, 12), '#2f6fd1', [0, 1.95, -1.2], [Math.PI / 2, 0, 0]));   // the famous blue water tank
  P.push(piece(box(0.3, 0.12, 0.06), '#fff6d0', [0.8, 1.1, 3.92], null, 1));
  P.push(piece(box(0.3, 0.12, 0.06), '#fff6d0', [-0.8, 1.1, 3.92], null, 1));
  for (const z of [2.8, -1.0, -2.6]) for (const x of [0.95, -0.95]) {
    P.push(piece(cyl(0.4, 0.46, 0.16, 10), '#2b2b30', [x, 0.36, z]));
    P.push(piece(cyl(0.32, 0.32, 0.04, 10), '#8ff0ff', [x, 0.26, z], null, 1));
  }
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
