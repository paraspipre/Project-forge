import * as THREE from '../../vendor/three.module.js';
import { texSet } from './Textures.js';

// Physically based material library. Textures are greyscale detail sets tinted by `color`,
// so one generated brick/concrete/etc. set serves every colour variant.

const cache = new Map();

export function std(color, o = {}) {
  const key = JSON.stringify([color, o]);
  if (!o.unique && cache.has(key)) return cache.get(key);
  const physical = o.clearcoat || o.sheen || o.transmission;
  const P = {
    color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0,
    side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1,
    envMapIntensity: o.env ?? 1, flatShading: !!o.flat,
  };
  if (o.emissive) { P.emissive = new THREE.Color(o.emissive); P.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (physical) {
    if (o.clearcoat) { P.clearcoat = o.clearcoat; P.clearcoatRoughness = o.clearcoatRough ?? 0.1; }
    if (o.sheen) { P.sheen = o.sheen; P.sheenRoughness = 0.6; P.sheenColor = new THREE.Color(o.sheenColor || '#ffffff'); }
  }
  const m = physical ? new THREE.MeshPhysicalMaterial(P) : new THREE.MeshStandardMaterial(P);
  if (o.tex) {
    const t = texSet(o.tex);
    if (t) {
      m.map = t.map;
      m.normalMap = t.normalMap;
      m.normalScale = new THREE.Vector2(o.normal ?? 1, o.normal ?? 1);
      if (o.useRough !== false) { m.roughnessMap = t.roughnessMap; m.roughness = o.rough ?? 1; }
    }
  }
  if (!o.unique) cache.set(key, m);
  return m;
}

// Unlit, HDR-bright material: anything above 1.0 blooms.
export function glow(color, intensity = 3) {
  const key = `glow|${color}|${intensity}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true });
  cache.set(key, m);
  return m;
}

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Soft additive light cone (fake volumetrics under lamps, spotlights).
let coneMat;
export function lightCone(color = '#ffd890', radius = 1.6, height = 4, opacity = 0.18) {
  if (!coneMat) {
    coneMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.2 } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ float rim = pow(abs(dot(vN, vV)), 1.5); float a = uOpacity * rim * smoothstep(0.0, 0.9, vY) ; gl_FragColor = vec4(uColor * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }
  const m = coneMat.clone();
  m.uniforms.uColor.value.set(color);
  m.uniforms.uOpacity.value = opacity;
  const geo = new THREE.CylinderGeometry(0.08, radius, height, 24, 1, true);
  geo.translate(0, -height / 2, 0);
  const cone = new THREE.Mesh(geo, m);
  cone.renderOrder = 2;
  cone.raycast = () => {};
  return cone;
}

// Canvas-texture for signs, posters, chalk drawings.
export function textTexture(lines, { w = 512, h = 256, bg = '#f4ecd6', fg = '#0b0812', font = 'Bangers, Impact, sans-serif', size = 72, border = true, draw, aged = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); }
  if (draw) draw(g, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((ln, i) => {
    let s = i === 0 ? size : size * 0.55;
    g.font = `${s}px ${font}`;
    const maxW = w * 0.9, tw = g.measureText(ln).width;
    if (tw > maxW) { s *= maxW / tw; g.font = `${s}px ${font}`; }
    const y = h / 2 + (i - (arr.length - 1) / 2) * size * 0.9;
    g.fillText(ln, w / 2, y);
  });
  if (bg && aged) {
    // weathering: speckle + darkened edges
    const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(30,15,5,0.45)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 300; i++) {
      g.fillStyle = `rgba(40,25,10,${Math.random() * 0.15})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
