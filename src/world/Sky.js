import * as THREE from 'three';
import { toon, Look } from '../core/Toon.js';
import { rng } from './geo.js';

// Comic sky: a banded gradient dome with sun, moon and stars; puffy inked clouds;
// layered pastel hills at the horizon. Atmosphere drives colours through the day.

const skyVS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFS = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uSunCol;
  uniform vec3 uSunDir;
  uniform float uNight, uTime;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    // a few soft bands rather than a smooth ramp: printed-poster sky
    float t = pow(h, 0.55);
    float band = floor(t * 7.0) / 7.0;
    t = mix(t, band, 0.35);
    vec3 col = mix(uHorizon, uZenith, t);
    // sun disc + halo (or moon at night)
    float sd = dot(d, normalize(uSunDir));
    col = mix(col, uSunCol, smoothstep(0.9990, 0.9993, sd) * (1.0 - uNight));
    col += uSunCol * smoothstep(0.96, 1.0, sd) * 0.18 * (1.0 - uNight);
    float md = dot(d, normalize(-uSunDir + vec3(0.0, 0.3, 0.0)));
    col = mix(col, vec3(0.95, 0.93, 0.85), smoothstep(0.9993, 0.9995, md) * uNight);
    // stars
    vec3 sp = floor(d * 380.0);
    float st = step(0.9975, hash(sp)) * smoothstep(0.05, 0.3, d.y);
    col += st * uNight * (0.6 + 0.4 * sin(uTime * 3.0 + hash(sp + 1.0) * 30.0));
    gl_FragColor = vec4(col, 0.0);
  }
`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uZenith: { value: new THREE.Color('#6fb0e4') }, uHorizon: { value: new THREE.Color('#cfe4ee') },
      uSunCol: { value: new THREE.Color('#fff4d6') }, uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
      uNight: Look.uNight, uTime: Look.uTime,
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(5000, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: skyVS, fragmentShader: skyFS, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }),
    );
    dome.renderOrder = -100;
    dome.frustumCulled = false;
    this.dome = dome;
    this.group = new THREE.Group();
    this.group.add(dome);
    this._clouds();
    this._hills();
    scene.add(this.group);
  }

  _clouds() {
    this.cloudMat = toon({ color: '#ffffff', hatch: 0.6, fog: false });
    this.clouds = new THREE.Group();
    const R = rng(42);
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(R() * 5);
      for (let k = 0; k < n; k++) {
        const g = new THREE.IcosahedronGeometry(1, 1);
        const m = new THREE.Mesh(g, this.cloudMat);
        const s = 40 + R() * 60;
        m.scale.set(s * (1.2 + R() * 0.6), s * (0.5 + R() * 0.3), s);
        m.position.set((k - n / 2) * 55 + R() * 30, R() * 20 + (k % 2) * 15, R() * 40);
        c.add(m);
      }
      const a = R() * Math.PI * 2, d = 1500 + R() * 2200;
      c.position.set(Math.cos(a) * d, 320 + R() * 520, Math.sin(a) * d);
      c.rotation.y = -a + Math.PI / 2;
      c.userData = { a, d, speed: 0.004 + R() * 0.006 };
      this.clouds.add(c);
    }
    this.group.add(this.clouds);
  }

  _hills() {
    // two rings of low hills in hazy pastel, like stage flats
    this.hillMats = [];
    [[4200, 90, '#b9c6d6', 1], [3300, 55, '#c9d3dc', 2]].forEach(([r, amp, col, seed]) => {
      const seg = 160;
      const pos = [];
      const R = rng(seed * 77);
      const hs = [];
      for (let i = 0; i <= seg; i++) hs.push(R());
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const smooth = (k) => (hs[(k + seg) % seg] + hs[(k + 1) % seg] * 2 + hs[(k + 2) % seg]) / 4;
        const h0 = 10 + smooth(i) ** 2 * amp * 2.2, h1 = 10 + smooth(i + 1) ** 2 * amp * 2.2;
        const p = (a, h) => [Math.cos(a) * r, h, Math.sin(a) * r];
        pos.push(...p(a0, -5), ...p(a1, -5), ...p(a1, h1), ...p(a0, -5), ...p(a1, h1), ...p(a0, h0));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const m = toon({ color: col, unlit: true, fog: false, hatch: 0, side: THREE.DoubleSide });
      this.hillMats.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = -50;
      this.group.add(mesh);
    });
  }

  // Follow the camera horizontally so the horizon never gets closer.
  update(dt, camPos) {
    this.group.position.set(camPos.x, 0, camPos.z);
    for (const c of this.clouds.children) {
      c.userData.a += c.userData.speed * dt * 0.05;
      const { a, d } = c.userData;
      c.position.x = Math.cos(a) * d; c.position.z = Math.sin(a) * d;
      c.rotation.y = -a + Math.PI / 2;
    }
  }
}

// ------------------------------------------------------------------ time of day

const KEYS = [
  // t (0..1 of a day), zenith, horizon, lit, shade, fog, night, sun intensity
  [0.0, '#1b2148', '#34416f', '#7d8cc4', '#3d4775', '#313c66', 1],
  [0.22, '#1f2a58', '#4b5585', '#8590c4', '#454c7c', '#3d4775', 0.9],
  [0.26, '#86a6d6', '#f3c3a4', '#ffcda3', '#8c84b0', '#e6c2ae', 0.35],
  [0.32, '#79b2e3', '#d9e7ec', '#fff2dc', '#a3a3c8', '#d6e4e9', 0],
  [0.5, '#6aaee6', '#d3e6ef', '#fff7e8', '#a9aacc', '#d2e4ec', 0],
  [0.68, '#78acdf', '#dde5e3', '#fff1d6', '#a6a2c6', '#d9e2e2', 0],
  [0.74, '#8aa4d6', '#f6cb98', '#ffd49a', '#9c8db2', '#efcfae', 0.1],
  [0.785, '#4d5a9b', '#e79479', '#f2a27c', '#6d6698', '#bb8b8b', 0.55],
  [0.83, '#252f60', '#525a8c', '#8590c4', '#454c7c', '#3f4876', 0.95],
  [1.0, '#1b2148', '#34416f', '#7d8cc4', '#3d4775', '#313c66', 1],
].map(([t, ...c]) => [t, ...c.slice(0, 5).map((h) => new THREE.Color(h)), c[5]]);

export class Atmosphere {
  constructor(renderer, sky) {
    this.r = renderer;
    this.sky = sky;
    this.override = null;   // fixed time of day for missions / testing
    this.rain = 0;
    this.c = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  }

  // Shared clock: a 24-minute day derived from UTC, so every player sees the same sky.
  // Daylight is stretched (06:00–19:00 takes ~17 of the 24 minutes).
  clock() {
    if (this.override != null) return this.override;
    const p = (Date.now() / 1440000) % 1;
    // remap: first 0.72 of the cycle covers 06:00–19:00, the rest the night
    return p < 0.72 ? 0.25 + (p / 0.72) * (0.79 - 0.25) : (0.79 + ((p - 0.72) / 0.28) * 0.46) % 1;
  }

  // Afternoon showers on some days, also from the shared clock.
  weather(t) {
    const day = Math.floor(Date.now() / 1440000);
    const rainy = ((day * 2654435761) >>> 0) % 100 < 45;
    if (!rainy) return 0;
    const s = 0.6, e = 0.69;
    if (t < s || t > e) return 0;
    return Math.min(1, (t - s) / 0.01, (e - t) / 0.01);
  }

  timeString(t = this.clock()) {
    const m = Math.floor(t * 24 * 60);
    const h = Math.floor(m / 60), mm = m % 60;
    return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  update(dt) {
    const t = this.clock();
    this.t = t;
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = THREE.MathUtils.smoothstep(t, a[0], b[0]);
    for (let k = 0; k < 5; k++) this.c[k].copy(a[k + 1]).lerp(b[k + 1], f);
    const night = a[6] + (b[6] - a[6]) * f;
    const targetRain = this.forceRain ?? this.weather(t);
    this.rain += (targetRain - this.rain) * Math.min(1, dt * 0.5);
    const grey = new THREE.Color('#8f96a6');
    const [zen, hor, lit, shade, fog] = this.c;
    if (this.rain > 0.01) {
      zen.lerp(grey, this.rain * 0.7); hor.lerp(grey, this.rain * 0.5); fog.lerp(grey, this.rain * 0.55);
      lit.lerp(new THREE.Color('#c9ccd6'), this.rain * 0.6); shade.lerp(new THREE.Color('#8f93ad'), this.rain * 0.4);
    }
    const u = this.sky.uniforms;
    u.uZenith.value.copy(zen); u.uHorizon.value.copy(hor);
    Look.uLitTint.value.copy(lit);
    Look.uShadeTint.value.copy(shade);
    Look.uNight.value = night;
    Look.uWet.value = this.rain;
    this.r.scene.fog.color.copy(fog);
    this.r.scene.fog.density = this.r.quality.fogDensity * (1 + this.rain * 0.8 + night * 0.3);
    // hills take the haze colour
    this.sky.hillMats[0].color.copy(hor).lerp(zen, 0.25).multiplyScalar(0.92);
    this.sky.hillMats[1].color.copy(hor).lerp(fog, 0.5).multiplyScalar(0.97);
    this.sky.cloudMat.color.setRGB(1, 1, 1).lerp(hor, 0.25 + night * 0.4).lerp(grey, this.rain * 0.6);
    // sun position: rises in the east (+x), sets in the west, leaning south (+z)
    const ang = (t - 0.25) * Math.PI * 2;
    const sun = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const lightDir = night > 0.5 ? new THREE.Vector3(-sun.x, -sun.y, 0.35).normalize() : sun.clone();
    if (lightDir.y < 0.18) lightDir.y = 0.18;
    lightDir.normalize();
    this.sunDir = lightDir;
    u.uSunDir.value.copy(sun.y > -0.1 ? sun : lightDir);
    u.uSunCol.value.copy(lit).lerp(new THREE.Color('#ffffff'), 0.5);
    this.r.setSun(lightDir);
  }
}
