import * as THREE from 'three';

// Night driving: glowing headlamps and tail-lights on every vehicle in traffic, and a soft beam of
// light on the road ahead of each one. Instanced (three meshes for all of traffic); off in daylight.

const SPEC = {
  // lamps: [x, y, z]; tails: [x, y, z]; beam: [width, length, z start]
  scooter: { head: [[0, 1.02, 0.66]], tail: [[0, 0.7, -0.82]], beam: [2.2, 7, 0.8] },
  delivery: { head: [[0, 0.98, 0.69]], tail: [[0, 0.86, -1.02]], beam: [2.2, 7, 0.8] },
  auto: { head: [[0, 1.2, 1.28]], tail: [[0.5, 0.72, -1.27], [-0.5, 0.72, -1.27]], beam: [2.8, 8, 1.3] },
  car: { head: [[0.6, 0.8, 1.99], [-0.6, 0.8, 1.99]], tail: [[0.6, 0.82, -1.99], [-0.6, 0.82, -1.99]], beam: [3.4, 10, 2.1] },
  bus: { head: [[0.8, 0.85, 5.56], [-0.8, 0.85, 5.56]], tail: [[1.0, 1.0, -5.55], [-1.0, 1.0, -5.55]], beam: [3.8, 12, 5.7] },
  tanker: { head: [[0.8, 1.1, 4.1], [-0.8, 1.1, 4.1]], tail: [[1.0, 0.95, -3.66], [-1.0, 0.95, -3.66]], beam: [3.6, 11, 4.1] },
};

function beamTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 128, 4, 32, 128, 128);
  grd.addColorStop(0, 'rgba(255,240,200,1)'); grd.addColorStop(0.5, 'rgba(255,230,180,0.35)'); grd.addColorStop(1, 'rgba(255,230,180,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class VehicleLights {
  constructor(cap = 220) {
    this.group = new THREE.Group();
    const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; this.group.add(m); return m; };
    this.head = mk(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3d0, toneMapped: false, fog: false }), cap * 2);
    this.tail = mk(new THREE.BoxGeometry(0.26, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3a3a, toneMapped: false, fog: false }), cap * 2);
    const bg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    // additive light, but alpha left untouched: the ink pass reads surface normals from alpha
    this.beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
    this.beam = mk(bg, this.beamMat, cap);
    this.beam.renderOrder = 2;
    this._m = new THREE.Matrix4(); this._o = new THREE.Object3D();
    this.group.visible = false;
  }

  // Called by Traffic once per frame with the vehicles near the camera.
  update(vehicles, night, camPos) {
    const on = night > 0.12;
    this.group.visible = on;
    if (!on) return;
    this.beamMat.opacity = 0.1 + night * 0.22;
    let h = 0, t = 0, b = 0;
    const o = this._o;
    for (const v of vehicles) {
      const s = SPEC[v.type.key];
      if (!s || (v.x - camPos.x) ** 2 + (v.z - camPos.z) ** 2 > 260 * 260) continue;
      const c = Math.cos(v.yaw), sn = Math.sin(v.yaw);
      const put = (mesh, i, [x, y, z]) => {
        o.position.set(v.x + x * c + z * sn, v.y + y, v.z - x * sn + z * c);
        o.rotation.set(0, v.yaw, 0); o.scale.set(1, 1, 1); o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      };
      for (const p of s.head) if (h < this.head.instanceMatrix.count) put(this.head, h++, p);
      for (const p of s.tail) if (t < this.tail.instanceMatrix.count) put(this.tail, t++, p);
      if (b < this.beam.instanceMatrix.count) {
        const [w, len, z0] = s.beam;
        o.position.set(v.x + z0 * sn, v.y + 0.06, v.z + z0 * c);
        o.rotation.set(0, v.yaw, 0); o.scale.set(w, 1, len); o.updateMatrix();
        this.beam.setMatrixAt(b++, o.matrix);
      }
    }
    for (const [m, n] of [[this.head, h], [this.tail, t], [this.beam, b]]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }
}
