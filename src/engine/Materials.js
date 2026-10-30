import * as THREE from 'three';

// Comic look: 3-band toon shading + inverted-hull ink outlines.

const gradient = (() => {
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const cache = new Map();

export const settings = { outlines: true };

export function toon(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.side || ''}|${opts.transparent || ''}`;
  if (!opts.unique && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: gradient,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    side: opts.side ?? THREE.FrontSide, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
  });
  if (!opts.unique) cache.set(key, m);
  return m;
}

export function glow(color) {
  const key = `glow|${color}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshBasicMaterial({ color });
  cache.set(key, m);
  return m;
}

export const outlineMat = new THREE.MeshBasicMaterial({ color: 0x07050b, side: THREE.BackSide });

// Adds an ink outline shell to a mesh (thickness in world units, approx).
export function outline(mesh, thickness = 0.025) {
  if (!settings.outlines) return mesh;
  const shell = new THREE.Mesh(mesh.geometry, outlineMat);
  mesh.geometry.computeBoundingSphere();
  const r = Math.max(mesh.geometry.boundingSphere.radius, 0.05);
  shell.scale.setScalar(1 + thickness / r);
  shell.position.copy(mesh.geometry.boundingSphere.center).multiplyScalar(-(shell.scale.x - 1));
  shell.raycast = () => {};
  shell.userData.isOutline = true;
  mesh.add(shell);
  return mesh;
}

export function mesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, typeof color === 'object' && color.isMaterial ? color : toon(color, opts));
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = !!opts.receive;
  if (opts.outline !== false) outline(m, opts.outlineWidth ?? 0.025);
  return m;
}

// Canvas-texture for signs, posters, chalk drawings.
export function textTexture(lines, { w = 512, h = 256, bg = '#f4ecd6', fg = '#0b0812', font = 'Bangers, Impact, sans-serif', size = 72, border = true, draw } = {}) {
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
    // shrink to fit the canvas width
    const maxW = w * 0.9, tw = g.measureText(ln).width;
    if (tw > maxW) { s *= maxW / tw; g.font = `${s}px ${font}`; }
    const y = h / 2 + (i - (arr.length - 1) / 2) * size * 0.9;
    g.fillText(ln, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
