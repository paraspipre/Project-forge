import * as THREE from 'three';
import { toon } from '../core/Toon.js';

// Little comic effects: dust puffs, confetti, hover-scooter light trails, rain streaks,
// and floating "BONK!"-style words (through Labels).

// transparent effects blend colour but leave alpha (the ink pass's normal channel) untouched
export function fxBlend(m) {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  return m;
}

export class Fx {
  constructor(scene, labels) {
    this.scene = scene;
    this.labels = labels;
    this.puffs = [];
    const puffMat = toon({ color: '#fff8ec', hatch: 0.4 });
    const g = new THREE.IcosahedronGeometry(0.5, 0);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(g, puffMat);
      m.visible = false;
      scene.add(m);
      this.puffs.push({ m, t: 0, life: 0, v: new THREE.Vector3(), s: 1 });
    }
    // confetti
    this.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.18, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false }), 160);
    fxBlend(this.conf.material);
    this.conf.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3);
    this.conf.count = 0;
    this.conf.frustumCulled = false;
    scene.add(this.conf);
    this.confs = [];
    // rain: streaks in a box that follows the camera
    const N = 1400;
    const pos = new Float32Array(N * 6);
    this.rainSeed = [];
    for (let i = 0; i < N; i++) this.rainSeed.push([Math.random() * 60 - 30, Math.random() * 30, Math.random() * 60 - 30]);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, fxBlend(new THREE.LineBasicMaterial({ color: 0xdfe9f2, opacity: 0.55 })));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    // scooter trails: two ribbons
    this.trailMat = fxBlend(new THREE.MeshBasicMaterial({ color: 0x9ff3ff, opacity: 0.7, side: THREE.DoubleSide }));
    this.trails = [0, 1].map(() => {
      const n = 40;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, this.trailMat);
      m.frustumCulled = false;
      scene.add(m);
      return { m, pts: [], n };
    });
    this._d = new THREE.Object3D();
    this._c = new THREE.Color();
  }

  pop(pos, text) { this.labels.pop(text, pos.clone().add(new THREE.Vector3(0, 2.2, 0))); }

  poof(pos, text) {
    for (let i = 0; i < 10; i++) this._puff(pos, 1.2, 0.6);
    if (text) this.pop(pos, text);
  }

  dust(pos) { for (let i = 0; i < 6; i++) this._puff(pos, 0.7, 0.45); }

  _puff(pos, spread, life) {
    const p = this.puffs.find((q) => !q.m.visible);
    if (!p) return;
    p.m.visible = true;
    p.t = 0; p.life = life * (0.7 + Math.random() * 0.6);
    p.m.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + 0.3 + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * spread);
    p.v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3);
    p.s = 0.4 + Math.random() * 0.5;
  }

  confetti(pos, n = 120) {
    const cols = ['#f07b5a', '#f2c14e', '#3fb3a6', '#8e5bb5', '#5aa9e6', '#e75a7c', '#ffffff'];
    for (let i = 0; i < n; i++) {
      if (this.confs.length >= 160) this.confs.shift();
      this.confs.push({
        p: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, pos.y + 2 + Math.random() * 2, pos.z + (Math.random() - 0.5) * 2),
        v: new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: (Math.random() - 0.5) * 12, t: 0,
        c: new THREE.Color(cols[i % cols.length]),
      });
    }
  }

  // positions: the two hover pads of the player's scooter in world space (or null when not riding)
  trail(pads, dt) {
    this.trails.forEach((tr, k) => {
      const p = pads ? pads[k] : null;
      if (p) tr.pts.unshift(p.clone()); else if (tr.pts.length) tr.pts.pop();
      if (tr.pts.length > tr.n) tr.pts.length = tr.n;
      const a = tr.m.geometry.attributes.position;
      for (let i = 0; i < tr.n; i++) {
        const q = tr.pts[Math.min(i, tr.pts.length - 1)];
        const w = 0.16 * (1 - i / tr.n);
        if (!q) { a.setXYZ(i * 2, 0, -100, 0); a.setXYZ(i * 2 + 1, 0, -100, 0); continue; }
        a.setXYZ(i * 2, q.x, q.y + w, q.z);
        a.setXYZ(i * 2 + 1, q.x, q.y - w, q.z);
      }
      a.needsUpdate = true;
      tr.m.visible = tr.pts.length > 1;
    });
  }

  update(dt, camPos, rain) {
    for (const p of this.puffs) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.m.visible = false; continue; }
      p.m.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(0.92);
      p.m.scale.setScalar(p.s * Math.sin(Math.min(1, k * 1.3) * Math.PI) + 0.01);
    }
    if (this.confs.length) {
      let i = 0;
      for (const c of this.confs) {
        c.t += dt;
        c.v.y -= 9 * dt;
        c.v.multiplyScalar(0.985);
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w * dt; c.r.y += c.w * 0.7 * dt;
        this._d.position.copy(c.p); this._d.rotation.copy(c.r); this._d.updateMatrix();
        this.conf.setMatrixAt(i, this._d.matrix);
        this.conf.setColorAt(i, c.c);
        i++;
      }
      this.confs = this.confs.filter((c) => c.t < 3.5);
      this.conf.count = i;
      this.conf.instanceMatrix.needsUpdate = true;
      this.conf.instanceColor.needsUpdate = true;
    }
    this.rain.visible = rain > 0.02;
    if (this.rain.visible) {
      const a = this.rain.geometry.attributes.position;
      const fall = (performance.now() / 1000) * 22;
      const n = Math.floor(this.rainSeed.length * Math.min(1, rain));
      for (let i = 0; i < this.rainSeed.length; i++) {
        const s = this.rainSeed[i];
        if (i >= n) { a.setXYZ(i * 2, 0, -50, 0); a.setXYZ(i * 2 + 1, 0, -50, 0); continue; }
        const y = 30 - ((s[1] + fall) % 30);
        const x = camPos.x + s[0], z = camPos.z + s[2];
        const by = camPos.y - 8 + y;
        a.setXYZ(i * 2, x, by, z);
        a.setXYZ(i * 2 + 1, x + 0.12, by + 0.9, z + 0.05);
      }
      a.needsUpdate = true;
      this.rain.material.opacity = 0.35 + rain * 0.3;
    }
  }
}
