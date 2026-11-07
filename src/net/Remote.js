import * as THREE from 'three';
import { Avatar } from '../actors/Avatar.js';
import { scooterGeo, vehicleMaterial } from '../actors/Vehicles.js';
import { lerpAngle } from '../game/Player.js';

// Other players: an avatar per peer, smoothly interpolated ~150 ms behind the latest packets,
// with a name tag, chat bubbles, emotes and their own hover scooter.

const DELAY = 150;
let scGeo;

export class RemotePlayer {
  constructor(peer, scene, labels) {
    this.peer = peer;
    this.scene = scene;
    this.labels = labels;
    this.avatar = new Avatar(peer.look);
    this.object = new THREE.Group();
    this.object.add(this.avatar.object);
    this.scooter = new THREE.Mesh(scGeo || (scGeo = scooterGeo({ body: '#8e5bb5' })), vehicleMaterial());
    this.scooter.castShadow = true;
    this.scooter.visible = false;
    this.object.add(this.scooter);
    scene.add(this.object);
    this.snaps = [];
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.visible = false;
    this.object.visible = false;
    this.tag = labels.add(peer.name, () => (this.visible ? this.pos.clone().add(new THREE.Vector3(0, 2.15, 0)) : null), { cls: 'tag', maxDist: 120 });
    this.bubble = null;
  }

  setProfile(peer) {
    this.tag.set(peer.name);
    if (JSON.stringify(peer.look) !== JSON.stringify(this.peer.look)) {
      this.object.remove(this.avatar.object);
      this.avatar.dispose();
      this.avatar = new Avatar(peer.look);
      this.object.add(this.avatar.object);
    }
    this.peer = peer;
  }

  push(st) {
    const now = performance.now();
    this.snaps.push({ t: now, ...st });
    if (this.snaps.length > 12) this.snaps.shift();
    if (!this.visible) {
      this.visible = true;
      this.object.visible = true;
      this.pos.set(st.x, st.y, st.z);
      this.yaw = st.yaw;
    }
    if (st.emote && st.emote !== this.lastEmote) this.avatar.play(st.emote, 3);
    this.lastEmote = st.emote;
  }

  say(text) {
    this.bubble?.remove();
    const b = this.labels.add(text, () => this.pos.clone().add(new THREE.Vector3(0, 2.55, 0)), { cls: 'bubble', maxDist: 90 });
    this.bubble = b;
    setTimeout(() => { if (this.bubble === b) { b.remove(); this.bubble = null; } }, 6000);
  }

  update(dt) {
    if (!this.snaps.length) return;
    const rt = performance.now() - DELAY;
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].t <= rt && this.snaps[i + 1].t >= rt) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    }
    let target, yaw, s;
    if (rt >= b.t) {
      // extrapolate a little from the newest packet
      const ex = Math.min(0.25, (rt - b.t) / 1000);
      target = new THREE.Vector3(b.x + Math.sin(b.yaw) * b.speed * ex, b.y, b.z + Math.cos(b.yaw) * b.speed * ex);
      yaw = b.yaw; s = b;
    } else {
      const f = (rt - a.t) / Math.max(1, b.t - a.t);
      target = new THREE.Vector3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
      yaw = lerpAngle(a.yaw, b.yaw, f); s = b;
    }
    if (this.pos.distanceTo(target) > 25) this.pos.copy(target);
    else this.pos.lerp(target, Math.min(1, dt * 15));
    this.yaw = lerpAngle(this.yaw, yaw, Math.min(1, dt * 12));
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    const riding = s.mode === 'ride';
    this.scooter.visible = riding;
    const bob = Math.sin(performance.now() / 260) * 0.05;
    if (riding) {
      this.scooter.position.y = 0.05 + bob;
      this.scooter.rotation.z = -s.lean * 0.35;
      this.avatar.object.position.set(0, 0.18 + bob, -0.12);
    } else this.avatar.object.position.set(0, 0, 0);
    const grounded = !(s.flags & 1);
    this.avatar.update(dt, { speed: riding ? 0 : s.speed, mode: riding ? 'ride' : s.mode === 'sit' ? 'sit' : 'walk', grounded, vy: 0, lean: s.lean });
  }

  dispose() {
    this.scene.remove(this.object);
    this.avatar.dispose();
    this.tag.remove();
    this.bubble?.remove();
  }
}
