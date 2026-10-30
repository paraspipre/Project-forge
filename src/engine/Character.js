import * as THREE from 'three';
import { mesh, glow, toon } from './Materials.js';

// Procedural low-poly humanoid built from a story "look" description, with
// a small procedural animation set: idle, walk/run, punch combo, hit, dodge, knockdown, talk.

const box = (w, h, d, yTop = true) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yTop) g.translate(0, -h / 2, 0); // pivot at top for limbs
  return g;
};

export class Character {
  constructor(look = {}) {
    this.look = look;
    const L = {
      skin: '#e0b48f', top: '#3a3550', pants: '#25222f', shoes: '#141118', hair: '#2a1d14',
      hairStyle: 'short', height: 1, build: 1, ...look,
    };
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const S = L.height, B = L.build;
    this.body.scale.set(B, S, B);

    // Hips
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;
    this.body.add(this.hips);
    this.hips.add(mesh(new THREE.BoxGeometry(0.36, 0.16, 0.22), L.pants));

    // Legs (thigh -> knee -> shin -> shoe)
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0.1 * side, -0.04, 0);
      this.hips.add(hip);
      hip.add(mesh(box(0.15, 0.44, 0.16), L.pants));
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      knee.add(mesh(box(0.13, 0.42, 0.14), L.pants));
      const shoe = mesh(new THREE.BoxGeometry(0.15, 0.08, 0.26), L.shoes);
      shoe.position.set(0, -0.42, 0.05);
      knee.add(shoe);
      return { hip, knee };
    });

    // Torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.06;
    this.hips.add(this.torso);
    const chestGeo = new THREE.CylinderGeometry(0.25, 0.19, 0.6, 6);
    chestGeo.translate(0, 0.3, 0);
    const chest = mesh(chestGeo, L.top);
    chest.scale.z = 0.7;
    chest.rotation.y = Math.PI / 6;
    this.torso.add(chest);
    if (L.accent) {
      const tie = mesh(new THREE.BoxGeometry(0.1, 0.4, 0.02), L.accent, { outline: false });
      tie.position.set(0, 0.36, 0.16);
      this.torso.add(tie);
    }
    if (L.badge) {
      const b = mesh(new THREE.BoxGeometry(0.06, 0.07, 0.02), glow(L.badge), { outline: false });
      b.position.set(-0.11, 0.42, 0.15);
      this.torso.add(b);
    }
    if (L.emblem) {
      const e = mesh(new THREE.ConeGeometry(0.09, 0.14, 3), L.emblem, { outline: false });
      e.rotation.set(Math.PI / 2, 0, Math.PI);
      e.position.set(0, 0.4, 0.17);
      e.scale.z = 0.2;
      this.torso.add(e);
    }

    // Long coat / skirt hanging from hips
    if (L.coat) {
      const coatGeo = new THREE.CylinderGeometry(0.24, 0.36, 0.62, 7, 1, true);
      coatGeo.translate(0, -0.31, 0);
      this.coat = mesh(coatGeo, toon(L.coat, { side: THREE.DoubleSide }), { outline: false });
      this.coat.scale.z = 0.75;
      this.coat.position.y = 0.08;
      this.hips.add(this.coat);
    }

    // Arms
    this.arms = [-1, 1].map((side) => {
      const sh = new THREE.Group();
      sh.position.set(0.31 * side, 0.54, 0);
      this.torso.add(sh);
      sh.add(mesh(box(0.13, 0.33, 0.13), L.sleeve || L.top));
      const elbow = new THREE.Group();
      elbow.position.y = -0.33;
      sh.add(elbow);
      elbow.add(mesh(box(0.11, 0.3, 0.11), L.sleeve || L.top));
      const hand = mesh(new THREE.IcosahedronGeometry(0.075, 0), L.gloves || L.skin);
      hand.position.y = -0.33;
      elbow.add(hand);
      sh.rotation.z = 0.08 * side;
      return { sh, elbow, side };
    });

    // Cape
    if (L.cape) {
      const capeGeo = new THREE.PlaneGeometry(0.6, 1.1, 2, 5);
      capeGeo.translate(0, -0.55, 0);
      this.cape = new THREE.Mesh(capeGeo, toon(L.cape, { side: THREE.DoubleSide }));
      this.cape.castShadow = true;
      this.cape.frustumCulled = false;
      this.cape.position.set(0, 0.58, -0.17);
      this.torso.add(this.cape);
      this.capeBase = capeGeo.attributes.position.array.slice();
    }

    // Head
    this.neck = new THREE.Group();
    this.neck.position.y = 0.62;
    this.torso.add(this.neck);
    this.neck.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6), L.cowl || L.skin, { outline: false }));
    this.head = new THREE.Group();
    this.head.position.y = 0.2;
    this.neck.add(this.head);
    const headMesh = mesh(new THREE.IcosahedronGeometry(0.17, 1), L.cowl || L.facePaint || L.skin);
    headMesh.scale.set(0.95, 1.1, 1);
    this.head.add(headMesh);

    // Face
    const eyeMat = L.eyes === 'glow' ? glow('#fffbe8') : glow('#111');
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(L.eyes === 'glow' ? new THREE.BoxGeometry(0.07, 0.025, 0.02) : new THREE.BoxGeometry(0.035, 0.035, 0.02), eyeMat);
      eye.position.set(0.065 * s, 0.03, 0.155);
      if (L.eyes === 'glow') eye.rotation.z = -0.25 * s;
      this.head.add(eye);
    });
    if (L.grin) {
      const grin = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 3, 10, Math.PI), glow(L.grin));
      grin.rotation.z = Math.PI;
      grin.position.set(0, -0.04, 0.15);
      grin.rotation.x = -0.25;
      this.head.add(grin);
    } else if (!L.cowl) {
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.02), glow('#5a2a2a'));
      mouth.position.set(0, -0.07, 0.155);
      this.head.add(mouth);
    }
    if (L.cowl) {
      // A beaked brow: Nightjar's signature silhouette.
      const brow = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), L.cowl);
      brow.rotation.x = Math.PI / 2 + 0.5;
      brow.position.set(0, 0.07, 0.17);
      this.head.add(brow);
      if (L.cowlLower !== false) {
        const jaw = mesh(new THREE.BoxGeometry(0.2, 0.08, 0.05), L.skin, { outline: false });
        jaw.position.set(0, -0.1, 0.12);
        this.head.add(jaw);
      }
    }

    // Hair & hats
    const hair = L.hairStyle;
    if (!L.cowl && hair !== 'bald') {
      const capGeo = new THREE.SphereGeometry(0.185, 7, 4, 0, Math.PI * 2, 0, hair === 'slick' ? 1.2 : 1.45);
      const cap = mesh(capGeo, L.hair, { outline: false });
      cap.rotation.x = -0.35;
      cap.position.y = 0.02;
      this.head.add(cap);
      if (hair === 'bun') {
        const bun = mesh(new THREE.IcosahedronGeometry(0.08, 0), L.hair);
        bun.position.set(0, 0.08, -0.17);
        this.head.add(bun);
      }
      if (hair === 'long') {
        const back = mesh(new THREE.BoxGeometry(0.32, 0.36, 0.08), L.hair);
        back.position.set(0, -0.08, -0.14);
        this.head.add(back);
      }
    }
    if (L.hat === 'top') {
      const brim = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 10), L.hatColor || '#111');
      brim.position.y = 0.15;
      const crown = mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.3, 10), L.hatColor || '#111');
      crown.position.y = 0.3;
      const band = mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.05, 10), L.hatBand || '#d8323c', { outline: false });
      band.position.y = 0.19;
      this.head.add(brim, crown, band);
      this.head.rotation.z = 0.08;
    } else if (L.hat === 'fedora' || L.hat === 'cap') {
      const brim = mesh(new THREE.CylinderGeometry(L.hat === 'cap' ? 0.2 : 0.28, L.hat === 'cap' ? 0.2 : 0.28, 0.02, 10), L.hatColor || '#2a2a33');
      brim.position.set(0, 0.12, L.hat === 'cap' ? 0.06 : 0);
      const crown = mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.14, 10), L.hatColor || '#2a2a33');
      crown.position.y = 0.19;
      this.head.add(brim, crown);
    } else if (L.hat === 'hood') {
      const hood = mesh(new THREE.SphereGeometry(0.21, 7, 5, 0, Math.PI * 2, 0, 1.9), L.top);
      hood.rotation.x = -0.6;
      hood.position.set(0, 0.0, -0.03);
      this.head.add(hood);
    }

    // Shadow blob (cheap contact shadow, also works when real shadows are off)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.root.add(blob);

    this.t = Math.random() * 10;
    this.speed = 0;        // 0..1 normalized locomotion speed
    this.action = null;    // { type, t, dur, side }
    this.downed = false;
    this.talking = false;
  }

  play(type, dur, extra = {}) {
    this.action = { type, t: 0, dur, ...extra };
  }

  get busy() { return this.action && this.action.t < this.action.dur; }

  update(dt) {
    this.t += dt;
    const t = this.t, sp = this.speed;
    const [lL, lR] = this.legs;
    const [aL, aR] = this.arms;

    // Base locomotion pose
    const freq = 6 + sp * 5;
    const swing = Math.sin(t * freq) * (0.15 + sp * 0.75);
    lL.hip.rotation.x = swing; lR.hip.rotation.x = -swing;
    lL.knee.rotation.x = Math.max(0, -Math.sin(t * freq)) * sp * 1.1 + 0.02;
    lR.knee.rotation.x = Math.max(0, Math.sin(t * freq)) * sp * 1.1 + 0.02;
    aL.sh.rotation.x = -swing * 0.8; aR.sh.rotation.x = swing * 0.8;
    aL.elbow.rotation.x = -0.25 - sp * 0.5; aR.elbow.rotation.x = -0.25 - sp * 0.5;
    aL.sh.rotation.z = -0.08; aR.sh.rotation.z = 0.08;
    this.body.position.y = Math.abs(Math.sin(t * freq)) * 0.06 * sp + Math.sin(t * 2) * 0.008 * (1 - sp);
    this.torso.rotation.x = sp * 0.15;
    this.torso.rotation.y = swing * 0.12;
    this.head.rotation.x = 0;
    this.body.rotation.x = 0;
    this.body.rotation.z = 0;
    if (this.coat) this.coat.rotation.x = -sp * 0.25 + Math.sin(t * freq) * 0.03 * sp;

    if (this.talking) {
      this.head.rotation.x = Math.sin(t * 9) * 0.06;
      aR.sh.rotation.x = -0.5 + Math.sin(t * 3) * 0.2;
      aR.elbow.rotation.x = -0.9;
    }

    // Actions override
    const a = this.action;
    if (a && a.t < a.dur) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      if (a.type === 'punch') {
        const arm = a.side > 0 ? aR : aL;
        const e = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
        arm.sh.rotation.x = -1.55 * e - (1 - e) * 0.2;
        arm.sh.rotation.z = -0.1 * arm.side * e;
        arm.elbow.rotation.x = -1.4 * (1 - e);
        this.torso.rotation.y = 0.45 * e * -a.side;
      } else if (a.type === 'kick') {
        const e = Math.sin(k * Math.PI);
        lR.hip.rotation.x = -1.5 * e; lR.knee.rotation.x = 0.4 * (1 - e);
        this.torso.rotation.x = -0.3 * e;
      } else if (a.type === 'windup') {
        aR.sh.rotation.x = -2.6 * Math.min(1, k * 1.5);
        aR.elbow.rotation.x = -1.2;
        this.torso.rotation.y = -0.4 * k;
      } else if (a.type === 'hit') {
        const e = Math.sin(k * Math.PI);
        this.torso.rotation.x = -0.45 * e;
        this.head.rotation.x = -0.4 * e;
        aL.sh.rotation.x = aR.sh.rotation.x = -0.5 * e;
      } else if (a.type === 'dodge') {
        const e = Math.sin(k * Math.PI);
        this.body.rotation.x = 0.55 * e;
        this.body.position.y = -0.12 * e;
        aL.sh.rotation.x = aR.sh.rotation.x = 1.1 * e;
        lL.knee.rotation.x = lR.knee.rotation.x = 0.9 * e;
      } else if (a.type === 'gesture') {
        aR.sh.rotation.x = -1.4 * Math.sin(k * Math.PI);
        aR.sh.rotation.z = 0.6 * Math.sin(k * Math.PI);
      }
    }
    if (this.downed) {
      this.downT = Math.min(1, (this.downT || 0) + dt * 2.5);
      this.body.rotation.x = -Math.PI / 2 * this.downT;
      this.body.position.y = 0.18 * this.downT;
    } else this.downT = 0;

    // Cape cloth wobble
    if (this.cape) {
      const pos = this.cape.geometry.attributes.position;
      const base = this.capeBase;
      for (let i = 0; i < pos.count; i++) {
        const y = base[i * 3 + 1];
        const f = -y / 1.1;
        pos.array[i * 3 + 2] = base[i * 3 + 2] - f * f * (0.15 + sp * 0.9) - Math.sin(t * 4 + f * 3 + base[i * 3]) * 0.04 * f;
      }
      pos.needsUpdate = true;
      this.cape.rotation.x = 0.05 + sp * 0.25;
    }
  }
}
