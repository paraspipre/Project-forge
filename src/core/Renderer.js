import * as THREE from 'three';
import { Post } from './Post.js';
import { Look } from './Toon.js';

// Colours are authored and blended directly in display (sRGB) values: what you pick is what you see.
THREE.ColorManagement.enabled = false;

export const QUALITY = {
  high:   { name: 'High',   bloom: true, fxaa: true, ssao: true, maxDpr: 1.75, shadows: true, shadowSize: 2048, shadowRange: 75, drawDistance: 1500, fogDensity: 0.0011, treeDensity: 1.0, treeRadius: 520, treeCap: 6000, crowd: 46, traffic: 90 },
  medium: { name: 'Medium', bloom: true, maxDpr: 1.25, shadows: true, shadowSize: 1024, shadowRange: 55, drawDistance: 1100, fogDensity: 0.0014, treeDensity: 0.8, treeRadius: 380, treeCap: 3200, crowd: 30, traffic: 60 },
  low:    { name: 'Low',    maxDpr: 1.0,  shadows: false, shadowSize: 512, shadowRange: 40, drawDistance: 800, fogDensity: 0.0019, treeDensity: 0.55, treeRadius: 260, treeCap: 1600, crowd: 18, traffic: 36 },
};

export function pickQuality() {
  const saved = (() => { try { return localStorage.getItem('pb.quality'); } catch { return null; } })();
  if (saved && QUALITY[saved]) return saved;
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch) return cores >= 8 ? 'medium' : 'low';
  return 'high';
}

export class Renderer {
  constructor(canvas, qualityKey) {
    this.qualityKey = qualityKey;
    this.quality = QUALITY[qualityKey];
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = this.quality.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0xcfe4ee, 1);
    this.r = r;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xd2e4ec, this.quality.fogDensity);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 6000);

    // one sun (or moon) that casts crisp shadows around the player
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = this.quality.shadows;
    const s = this.sun.shadow, R = this.quality.shadowRange;
    s.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    s.camera.left = -R; s.camera.right = R; s.camera.top = R; s.camera.bottom = -R;
    s.camera.near = 1; s.camera.far = 600;
    s.camera.updateProjectionMatrix();
    s.bias = -0.0006; s.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();

    this.post = new Post(r, { bloom: !!this.quality.bloom, fxaa: !!this.quality.fxaa, ssao: !!this.quality.ssao });
    this.clock = new THREE.Clock();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, this.quality.maxDpr) * (this.dprScale || 1);
    this.r.setPixelRatio(dpr);
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    // wider view on portrait phones so the street still fits
    this.baseFov = w < h ? 72 : 58;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.post.setSize(Math.floor(w * dpr), Math.floor(h * dpr), dpr);
  }

  setSun(dir) { this.sunDir.copy(dir); }

  // Keep the shadow frustum centred on the focus point, snapped to shadow texels to avoid shimmer.
  followShadow(focus) {
    const R = this.quality.shadowRange;
    const texel = (2 * R) / this.quality.shadowSize;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 300, this.sunDir.y * 300, fz + this.sunDir.z * 300);
  }

  render() {
    Look.uTime.value = this.clock.getElapsedTime();
    this.post.render(this.scene, this.camera);
  }
}
