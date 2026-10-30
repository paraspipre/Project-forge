import * as THREE from '../../vendor/three.module.js';

// Comic-book effects: onomatopoeia bursts, smoke puffs, telegraph icons, enemy health bars.

const wordCache = new Map();

function wordTexture(word, color) {
  const key = word + color;
  if (wordCache.has(key)) return wordCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  // starburst
  g.translate(128, 80);
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = i % 2 ? 58 : 80;
    g.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 0.95);
  }
  g.closePath();
  g.fillStyle = color; g.fill();
  g.lineWidth = 6; g.strokeStyle = '#0b0812'; g.stroke();
  g.rotate(-0.12);
  g.font = '64px Bangers, Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeText(word, 0, 4);
  g.fillStyle = '#fff'; g.fillText(word, 0, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  wordCache.set(key, t);
  return t;
}

// attack telegraphs: gold "!" = counterable, red "!!" = unblockable (dodge it)
const iconTex = {};
function makeIcon(kind) {
  if (iconTex[kind]) return iconTex[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = kind === 'danger' ? '#e8323c' : '#f0b429';
  g.beginPath(); g.moveTo(32, 2); g.lineTo(62, 58); g.lineTo(2, 58); g.closePath(); g.fill();
  g.lineWidth = 4; g.strokeStyle = '#0b0812'; g.stroke();
  g.fillStyle = kind === 'danger' ? '#fff' : '#0b0812';
  g.font = 'bold 36px sans-serif'; g.textAlign = 'center';
  g.fillText(kind === 'danger' ? '!!' : '!', 32, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (iconTex[kind] = t);
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  word(pos, word, color = '#f0b429') {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTexture(word, color), depthTest: false, transparent: true }));
    s.position.copy(pos);
    s.renderOrder = 10;
    s.scale.set(0.1, 0.06, 1);
    this.scene.add(s);
    this.items.push({ obj: s, t: 0, dur: 0.7, kind: 'word', rot: (Math.random() - 0.5) * 0.5 });
  }

  smoke(pos, n = 18, color = '#8b8098') {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + Math.random() * 0.3, 0), mat.clone());
      m.position.set(pos.x + (Math.random() - 0.5), 0.4 + Math.random() * 1.6, pos.z + (Math.random() - 0.5));
      this.scene.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
      this.items.push({ obj: m, t: 0, dur: 1.4 + Math.random(), kind: 'smoke', v });
    }
  }

  sparks(pos, color = '#fff1a8') {
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06), mat);
      m.position.copy(pos);
      this.scene.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6);
      this.items.push({ obj: m, t: 0, dur: 0.35, kind: 'spark', v });
    }
  }

  icon(kind = 'counter') {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeIcon(kind), depthTest: false }));
    s.scale.set(0.45, 0.45, 1);
    s.renderOrder = 11;
    return s;
  }

  healthBar() {
    const g = new THREE.Group();
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#0b0812', depthTest: false }));
    bg.scale.set(0.9, 0.11, 1);
    bg.renderOrder = 9;
    const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#d8323c', depthTest: false }));
    fill.center.set(0, 0.5);
    fill.position.x = -0.42;
    fill.scale.set(0.84, 0.07, 1);
    fill.renderOrder = 10;
    g.add(bg, fill);
    g.setValue = (k) => { fill.scale.x = 0.84 * Math.max(0, k); };
    return g;
  }

  // detective-scan pulse: a ring sweeping out across the ground
  ring(pos, color = '#7fd4ff') {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(pos.x, 0.06, pos.z);
    this.scene.add(m);
    this.items.push({ obj: m, t: 0, dur: 1.6, kind: 'ring' });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / it.dur;
      const o = it.obj;
      if (it.kind === 'word') {
        const s = k < 0.15 ? k / 0.15 : 1;
        o.scale.set(1.6 * s, 1.0 * s, 1);
        o.material.rotation = it.rot;
        o.position.y += dt * 0.8;
        o.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      } else if (it.kind === 'smoke') {
        o.position.addScaledVector(it.v, dt);
        o.scale.setScalar(1 + k * 2);
        o.material.opacity = 0.8 * (1 - k);
      } else if (it.kind === 'ring') {
        o.scale.setScalar(1 + k * 38);
        o.material.opacity = 0.9 * (1 - k);
      } else if (it.kind === 'spark') {
        it.v.y -= 15 * dt;
        o.position.addScaledVector(it.v, dt);
      }
      if (k >= 1) {
        this.scene.remove(o);
        if (it.kind === 'smoke' || it.kind === 'ring') { o.geometry.dispose(); o.material.dispose(); }
        if (it.kind === 'word') o.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items.length = 0;
  }
}
