import * as THREE from 'three';

// DOM labels pinned to 3D points: player names, chat bubbles, quest markers, comic pops.

const _v = new THREE.Vector3();

export class Labels {
  constructor(root) {
    this.root = root;
    this.items = new Set();
  }

  // getPos: () => Vector3 (world). opts: { cls, maxDist, offsetY, html, life }
  add(text, getPos, opts = {}) {
    const el = document.createElement('div');
    el.className = opts.cls || 'tag';
    if (opts.html) el.innerHTML = text; else el.textContent = text;
    this.root.appendChild(el);
    const it = { el, getPos, maxDist: opts.maxDist || 80, offsetY: opts.offsetY || 0, life: opts.life || 0, t: 0, onScreen: false };
    it.set = (t, html) => { if (html) el.innerHTML = t; else el.textContent = t; };
    it.remove = () => { el.remove(); this.items.delete(it); };
    this.items.add(it);
    return it;
  }

  pop(text, pos, cls = 'pop') {
    const p = pos.clone();
    this.add(text, () => p, { cls, life: 0.9, maxDist: 150 });
  }

  update(camera, dt) {
    const w = innerWidth, h = innerHeight;
    for (const it of this.items) {
      if (it.life) { it.t += dt; if (it.t > it.life) { it.remove(); continue; } }
      const p = it.getPos();
      if (!p) { it.el.style.display = 'none'; continue; }
      _v.copy(p);
      _v.y += it.offsetY;
      const dist = _v.distanceTo(camera.position);
      _v.project(camera);
      const vis = _v.z < 1 && dist < it.maxDist && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2;
      if (!vis) { if (it.onScreen) { it.el.style.display = 'none'; it.onScreen = false; } continue; }
      if (!it.onScreen) { it.el.style.display = ''; it.onScreen = true; }
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      const s = THREE.MathUtils.clamp(14 / Math.max(dist, 1), 0.55, 1.15);
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      it.el.style.left = '0'; it.el.style.top = '0';
      it.el.style.zIndex = String(1000 - Math.round(dist));
    }
  }

  clear() { for (const it of [...this.items]) it.remove(); }
}
