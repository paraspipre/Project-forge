import * as THREE from 'three';
import { Avatar } from '../actors/Avatar.js';
import { lerpAngle } from './Player.js';

// A named character you can talk to: stands somewhere, turns to face you, idles with emotes,
// and can be scripted to walk somewhere during missions.

export class Npc {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.speaker = { name: def.name, color: def.color || '#f07b5a', pitch: def.pitch || 1, voiceId: def.voice || def.id };
    this.avatar = new Avatar(def.look || {});
    this.object = new THREE.Group();
    this.object.add(this.avatar.object);
    this.pos = new THREE.Vector3(def.x, def.y || 0, def.z);
    this.yaw = def.yaw || 0;
    this.baseYaw = this.yaw;
    this.object.position.copy(this.pos);
    this.path = null;
    this.idleT = 3 + Math.random() * 5;
    this.tag = game.labels.add(def.title ? `${def.name}<span class="sub">${def.title}</span>` : def.name,
      () => this.object.visible ? this.pos.clone().add(new THREE.Vector3(0, 2.2, 0)) : null, { cls: 'tag npc', html: true, maxDist: 40 });
    this.marker = null;
    if (def.pose) this.avatar.play(def.pose, 1e9);
    if (def.prop) this.object.add(def.prop);
  }

  setMarker(kind) {
    if (this.markerKind === kind) return;
    this.markerKind = kind;
    this.marker?.remove();
    const icon = { quest: '!', activity: '★', turnin: '?', ai: '💬' }[kind] || '…';
    this.marker = kind ? this.game.labels.add(icon, () => (this.object.visible ? this.pos.clone().add(new THREE.Vector3(0, kind === 'quest' && this.def.prop ? 18.5 : 2.75, 0)) : null), { cls: kind === 'quest' ? 'marker' : kind === 'ai' ? 'marker ai' : 'marker activity', maxDist: kind === 'quest' ? 900 : kind === 'ai' ? 45 : 250 }) : null;
  }

  // Walk along a list of points; resolves on arrival.
  walkTo(points, speed = 1.6) {
    return new Promise((res) => { this.path = { pts: points.map((p) => new THREE.Vector3(p[0], 0, p[1])), i: 0, speed, res }; });
  }

  face(x, z) { this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z); }

  emote(name, dur = 2.5) { this.avatar.play(name, dur); }

  // Say something out loud in a speech bubble (no dialogue box), voiced by distance.
  bark(text, volume = 1) {
    this.bubble?.remove();
    const b = this.game.labels.add(text, () => (this.object.visible ? this.pos.clone().add(new THREE.Vector3(0, 2.6, 0)) : null), { cls: 'bubble', maxDist: 40 });
    this.bubble = b;
    setTimeout(() => { if (this.bubble === b) { b.remove(); this.bubble = null; } }, 4200 + text.length * 40);
    if (window.__recordLines) window.__recordLines.push({ id: this.speaker.voiceId, text, name: this.name });
    this.game.audio?.speak(this.speaker.voiceId, text, { pitch: this.speaker.pitch, volume, fallback: false });
    if (Math.random() < 0.6) this.emote(['wobble', 'point', 'shrug'][Math.floor(Math.random() * 3)], 2);
  }

  update(dt, player) {
    let speed = 0;
    if (this.path) {
      const p = this.path, t = p.pts[p.i];
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { p.i++; if (p.i >= p.pts.length) { this.path = null; p.res(); } }
      else {
        const st = Math.min(d, p.speed * dt);
        this.pos.x += (dx / d) * st; this.pos.z += (dz / d) * st;
        this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
        speed = p.speed;
      }
    } else if (player) {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const near = dx * dx + dz * dz < 36;
      const want = near ? Math.atan2(dx, dz) : this.baseYaw;
      this.yaw = lerpAngle(this.yaw, want, Math.min(1, dt * 4));
      this.idleT -= dt;
      if (this.idleT < 0 && !this.def.pose) { this.idleT = 5 + Math.random() * 8; this.avatar.play(this.def.idle || ['wobble', 'phone', 'shrug'][Math.floor(Math.random() * 3)], 2.2); }
    }
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    const vis = player ? this.pos.distanceToSquared(player.pos) < 160 * 160 : true;
    this.object.visible = vis;
    if (vis) this.avatar.update(dt, { speed, grounded: true });
  }

  dispose() {
    this.game.ren.scene.remove(this.object);
    this.avatar.dispose();
    this.tag.remove();
    this.marker?.remove();
    this.bubble?.remove();
  }
}
