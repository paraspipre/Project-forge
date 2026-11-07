import * as THREE from 'three';
import { Avatar } from '../actors/Avatar.js';
import { PlayerScooter } from '../actors/Vehicles.js';

// The player: walks, runs, jumps, climbs walls onto rooftops, and rides a hover scooter
// (summoned anywhere) that floats over lakes and up flyover ramps.

const WALK = 4.2, RUN = 7.6, JUMP = 7.4, GRAV = 24;
const SC_MAX = 22, SC_BOOST = 30;

export class Player {
  constructor(game, look) {
    this.game = game;
    this.avatar = new Avatar(look);
    this.scooter = new PlayerScooter();
    this.object = new THREE.Group();
    this.object.add(this.avatar.object, this.scooter.object);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.mode = 'walk';       // walk | ride | climb
    this.grounded = true;
    this.coyote = 0;
    this.speed = 0;           // scooter forward speed
    this.lean = 0;
    this.frozen = false;
    this.climbWall = null;
    this.bump = 0;
  }

  setLook(look) {
    this.object.remove(this.avatar.object);
    this.avatar.dispose();
    this.avatar = new Avatar(look);
    this.object.add(this.avatar.object);
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, this.game.city.heightAt(x, z, 200), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.speed = 0;
  }

  toggleRide() {
    if (this.mode === 'ride') {
      this.mode = 'walk';
      this.scooter.object.visible = false;
      this.vel.set(Math.sin(this.yaw) * this.speed * 0.3, 3, Math.cos(this.yaw) * this.speed * 0.3);
      this.game.fx?.poof(this.pos, 'hop off');
      this.game.audio?.scooter(false);
    } else if (this.mode === 'walk') {
      this.mode = 'ride';
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      this.scooter.object.visible = true;
      this.game.fx?.poof(this.pos, 'VROOM!');
      this.game.audio?.scooter(true);
    }
  }

  update(dt, input, camYaw) {
    const city = this.game.city;
    const mv = this.frozen ? { x: 0, y: 0 } : input.move;
    const F = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const Rt = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const wish = F.clone().multiplyScalar(-mv.y).addScaledVector(Rt, mv.x);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.01) wish.normalize();

    if (!this.frozen && input.consume('ride')) this.toggleRide();

    if (this.mode === 'ride') this._ride(dt, input, wish, wishLen, camYaw);
    else if (this.mode === 'climb') this._climb(dt, input, wish, wishLen);
    else this._walk(dt, input, wish, wishLen);

    // keep inside the zone
    const b = city.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.x0 + 5, b.x1 - 5);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.z0 + 5, b.z1 - 5);

    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    this.avatar.update(dt, {
      speed: this.mode === 'ride' ? 0 : hspeed, grounded: this.grounded || this.mode === 'climb', vy: this.vel.y,
      mode: this.mode === 'ride' ? 'ride' : 'walk', lean: this.lean,
    });
    if (this.mode === 'climb') this._climbPose();
    if (this.mode === 'ride') {
      const bob = Math.sin(performance.now() / 260) * 0.05;
      this.scooter.object.position.y = 0.05 + bob;
      this.scooter.object.rotation.z = -this.lean * 0.35;
      this.avatar.object.position.set(0, 0.18 + bob, -0.12);
      this.avatar.object.rotation.z = -this.lean * 0.35;
    } else {
      this.avatar.object.position.set(0, 0, 0);
      this.avatar.object.rotation.z = 0;
    }
  }

  _ground(y) {
    return this.game.city.groundAt(this.pos.x, this.pos.z, y);
  }

  _walk(dt, input, wish, wishLen) {
    const city = this.game.city;
    const target = (input.run ? RUN : WALK) * wishLen;
    const accel = this.grounded ? 12 : 3;
    this.vel.x += (wish.x * target - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wish.z * target - this.vel.z) * Math.min(1, dt * accel);
    if (wishLen > 0.05) {
      const want = Math.atan2(wish.x, wish.z);
      this.yaw = lerpAngle(this.yaw, want, Math.min(1, dt * 12));
    }
    this.coyote -= dt;
    if (this.grounded) this.coyote = 0.12;
    if (!this.frozen && input.consume('jump') && this.coyote > 0) {
      this.vel.y = JUMP;
      this.grounded = false;
      this.coyote = 0;
      this.game.audio?.jump();
    }
    this.vel.y -= GRAV * dt;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    let [cx, cz, hit] = city.collide(nx, nz, 0.35, this.pos.y);
    // lakes: wade a little, then back out ("don't go in, it foams")
    const w = city.isWater(cx, cz);
    if (w && !w.pool && this.pos.y < 1) {
      if (!this._warnedWater) { this.game.hud?.toast('Ayyo! Lake water is not for walking. Take the hover scooter (R)'); this._warnedWater = true; setTimeout(() => (this._warnedWater = false), 5000); }
      cx = this.pos.x; cz = this.pos.z;
    }
    this.pos.x = cx; this.pos.z = cz;
    this.pos.y += this.vel.y * dt;
    const g = this._ground(this.pos.y + 0.4);
    if (this.pos.y <= g) {
      if (!this.grounded && this.vel.y < -14) this.game.fx?.dust(this.pos);
      this.pos.y = g; this.vel.y = 0; this.grounded = true;
    } else if (this.pos.y > g + 0.05) this.grounded = false;
    // start climbing: jump into a wall
    if (hit && !this.grounded && this.vel.y > 0 && wishLen > 0.3 && !this.frozen) {
      const b = city.buildingAt(nx, nz, undefined, 0.5);
      if (b && b.h - this.pos.y < 40 && b.h > this.pos.y + 0.5) {
        this.mode = 'climb';
        this.climbWall = b;
        this.vel.set(0, 0, 0);
      }
    }
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
  }

  _climb(dt, input, wish, wishLen) {
    const b = this.climbWall;
    // climb while pushing into the wall; let go to drop
    const climbing = wishLen > 0.2;
    this.vel.y = climbing ? 3.4 : -6;
    this.pos.y += this.vel.y * dt;
    // stay pressed against the wall facing it
    const [cx, cz] = this.game.city.collide(this.pos.x + Math.sin(this.yaw) * 0.2, this.pos.z + Math.cos(this.yaw) * 0.2, 0.35, this.pos.y);
    this.pos.x = cx; this.pos.z = cz;
    if (this.pos.y >= b.h - 0.2) {
      // mantle onto the roof
      this.pos.y = b.h + 0.6;
      this.pos.x += Math.sin(this.yaw) * 0.9; this.pos.z += Math.cos(this.yaw) * 0.9;
      this.vel.set(0, 2, 0);
      this.mode = 'walk';
      this.grounded = false;
      this.game.onRoof?.(b);
    } else if (!climbing || input.consume('jump')) {
      const g = this._ground(this.pos.y);
      if (this.pos.y <= g + 0.05 || input.consume('jump')) {
        this.mode = 'walk';
        this.vel.set(-Math.sin(this.yaw) * 3, 3, -Math.cos(this.yaw) * 3);
      }
    }
    this.grounded = false;
  }

  _climbPose() {
    const bn = this.avatar.bones, t = performance.now() / 160;
    bn.uaL.rotation.set(Math.PI - 0.3 + Math.sin(t) * 0.4, 0, 0.2);
    bn.uaR.rotation.set(Math.PI - 0.3 - Math.sin(t) * 0.4, 0, -0.2);
    bn.faL.rotation.set(-0.4, 0, 0); bn.faR.rotation.set(-0.4, 0, 0);
    bn.thL.rotation.set(-0.8 - Math.sin(t) * 0.5, 0, 0); bn.thR.rotation.set(-0.8 + Math.sin(t) * 0.5, 0, 0);
    bn.shL.rotation.set(1.2, 0, 0); bn.shR.rotation.set(1.2, 0, 0);
  }

  _ride(dt, input, wish, wishLen, camYaw) {
    const city = this.game.city;
    const keyboard = input.joy.id === null && !input.hasPad;
    let throttle = 0, steer = 0;
    if (keyboard) {
      throttle = -input.move.y;
      steer = -input.move.x;
    } else if (wishLen > 0.05) {
      // stick: face where the stick points (camera-relative), throttle by how far it's pushed
      const want = Math.atan2(wish.x, wish.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      steer = THREE.MathUtils.clamp(d * 2, -1, 1);
      throttle = wishLen * (Math.abs(d) > 2.2 ? -0.4 : 1);
    }
    if (this.frozen) { throttle = 0; steer = 0; }
    const max = input.run ? SC_BOOST : SC_MAX;
    if (throttle > 0) this.speed += throttle * 14 * dt * (this.speed < max ? 1 : -0.5);
    else if (throttle < 0) this.speed += throttle * (this.speed > 0 ? 26 : 8) * dt;
    else this.speed *= Math.pow(0.55, dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -6, max);
    const turn = steer * dt * (1.4 + 1.6 / (1 + Math.abs(this.speed) * 0.08)) * (this.speed < 0 ? -1 : 1);
    if (Math.abs(this.speed) > 0.3 || !keyboard) this.yaw += turn;
    this.lean += (steer * Math.min(1, Math.abs(this.speed) / 10) - this.lean) * Math.min(1, dt * 6);
    this.vel.x = Math.sin(this.yaw) * this.speed;
    this.vel.z = Math.cos(this.yaw) * this.speed;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const [cx, cz, hit] = city.collide(nx, nz, 0.7, this.pos.y);
    if (hit) {
      if (Math.abs(this.speed) > 8) { this.game.fx?.pop(this.pos, 'BONK!'); this.game.audio?.bonk(); this.game.camRig?.shake(0.4); }
      this.speed *= 0.35;
    }
    this.pos.x = cx; this.pos.z = cz;
    // hover over ground, roofs, flyover decks and water alike
    const g = this._ground(this.pos.y + 0.8);
    if (input.consume('jump') && this.grounded) { this.vel.y = 6; this.grounded = false; }
    this.vel.y -= GRAV * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= g) { this.pos.y += (g - this.pos.y) * Math.min(1, dt * 18); if (this.pos.y > g - 0.4) this.pos.y = Math.max(this.pos.y, g); this.vel.y = 0; this.grounded = true; }
    else this.grounded = this.pos.y < g + 0.1;
    this.speedNow = Math.abs(this.speed);
    this.game.audio?.scooterSpeed(Math.abs(this.speed) / SC_BOOST);
  }

  // Knock-back when something big hits you.
  knock(dx, dz, power) {
    this.vel.x += dx * power; this.vel.z += dz * power; this.vel.y = Math.max(this.vel.y, 3.5);
    this.grounded = false;
    if (this.mode === 'ride') this.speed *= 0.3;
  }
}

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Third-person orbit camera that stays out of buildings.
export class CameraRig {
  constructor(camera, city) {
    this.camera = camera;
    this.city = city;
    this.yaw = Math.PI;      // facing direction of the camera (forward = (sin, cos))
    this.pitch = 0.32;
    this.dist = 6.2;
    this.target = new THREE.Vector3();
    this.idle = 0;
    this.shakeAmt = 0;
    this.override = null;    // { pos, look } for cut-scenes
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  update(dt, player, input) {
    const look = input.takeLook();
    const z = input.takeZoom();
    this.dist = THREE.MathUtils.clamp(this.dist * (1 + z * 0.1), 2.6, 16);
    if (look.x || look.y) this.idle = 0; else this.idle += dt;
    this.yaw -= look.x * 0.0055;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * 0.004, -0.35, 1.25);
    const riding = player.mode === 'ride';
    // drift behind the player while they move and the camera is left alone
    const sp = player.speedNow || 0;
    if (this.idle > (riding ? 0.5 : 1.4) && sp > 1.5) {
      this.yaw = lerpAngle(this.yaw, player.yaw, Math.min(1, dt * (riding ? 2.2 : 0.8)));
      if (riding) this.pitch += (0.22 - this.pitch) * Math.min(1, dt);
    }
    const dist = this.dist + (riding ? 2.5 + sp * 0.08 : 0);
    const tgt = player.pos.clone().add(new THREE.Vector3(0, riding ? 1.8 : 1.55, 0));
    this.target.lerp(tgt, Math.min(1, dt * 14));
    if (this.target.distanceTo(tgt) > 20) this.target.copy(tgt);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    // pull in when a building is between player and camera
    let d = dist;
    for (let i = 1; i <= 10; i++) {
      const s = (dist * i) / 10;
      const p = this.target.clone().addScaledVector(dir, s);
      const h = this.city.heightAt(p.x, p.z, 1e6);
      if (p.y < h + 0.3 && h > player.pos.y + 0.5) { d = Math.max(1.2, s - 0.6); break; }
    }
    this.curDist = this.curDist == null ? d : d < this.curDist ? d : this.curDist + (d - this.curDist) * Math.min(1, dt * 3);
    const pos = this.target.clone().addScaledVector(dir, this.curDist);
    const groundY = this.city.groundAt(pos.x, pos.z, pos.y) + 0.4;
    if (pos.y < groundY) pos.y = groundY;
    if (this.override) {
      this.camera.position.lerp(this.override.pos, Math.min(1, dt * 3));
      this._look = (this._look || this.override.look.clone()).lerp(this.override.look, Math.min(1, dt * 3));
      this.camera.lookAt(this._look);
    } else {
      this._look = null;
      this.camera.position.copy(pos);
      this.camera.lookAt(this.target);
    }
    if (this.shakeAmt > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2);
    }
  }
}
