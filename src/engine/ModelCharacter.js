import * as THREE from 'three';
import { clone as cloneSkinned } from '../../vendor/jsm/utils/SkeletonUtils.js';
import { getModel, fitToHeight } from './Models.js';

// A character backed by a glTF/GLB model. Same interface as the procedural Character
// (root, update, play, speed, talking, downed, lookYaw, voiceDriven, mouthTarget, setFist),
// so stories can swap any character to an artist-made or AI-generated model:
//
//   "look": {
//     "model": "models/nightjar.glb",
//     "height": 1.05,                 // relative to 1.8 m (or "modelHeight": metres)
//     "modelRotation": 180,           // degrees, if the model doesn't face +Z
//     "animations": { "idle": "Idle_Loop", "punch": "Jab" },        // optional overrides
//     "animationFiles": ["models/anims/mixamo_pack.glb"]           // or { "walk": "walk.glb", ... }
//   }
//
// Clips are matched to game actions by name automatically. Rigged models with no clips,
// and static (unrigged) models, fall back to procedural motion of the whole body.

const ROLES = {
  idle: /idle|stand|breath|neutral/i,
  walk: /walk/i,
  run: /run|jog|sprint/i,
  punch: /punch|jab|attack|strike|swing|slash/i,
  kick: /kick/i,
  hit: /hit|hurt|damage|react|impact|flinch/i,
  dodge: /dodge|roll|evade/i,
  down: /death|die|dead|knock|defeat/i,
  talk: /talk|speak|convers|chat/i,
  laugh: /laugh|cheer|celebrat/i,
  gesture: /wave|point|gesture|shrug|yes|thumb/i,
  windup: /wind.?up|charge|ready|taunt/i,
};
// what to try when a story action has no dedicated clip
const FALLBACK = { kick: ['punch'], windup: [], laugh: ['gesture', 'talk'], gesture: ['talk'], dodge: [], hit: [] };

// head bone across common rigs: Mixamo (mixamorigHead), VRM (J_Bip_C_Head), Blender (head, DEF-head), Head_M…
const isHead = (name) => {
  const n = name.replace(/^mixamorig[:_]?/i, '');
  return /(^|[^a-z])head(_?m)?$/i.test(n) && !/top|end|front|tip/i.test(n);
};
const MOUTH = /jawopen|mouthopen|mouth_open|viseme_aa|^aa$|v_aa|mouth_a$/i;
const BLINK = /eyeblink|blink|eyesclosed|eye_close/i;

function bestClip(clips, re) {
  const m = clips.filter((c) => re.test(c.name));
  m.sort((a, b) => a.name.length - b.name.length);
  return m[0] || null;
}

export class ModelCharacter {
  // returns null when the model isn't loaded (caller falls back to the procedural Character)
  static create(look) {
    const gltf = getModel(look.model);
    return gltf ? new ModelCharacter(look, gltf) : null;
  }

  constructor(look, gltf) {
    this.look = look;
    this.root = new THREE.Group();
    this.pose = new THREE.Group();     // procedural offsets (bob, lean, fall) live here
    this.root.add(this.pose);
    this.inner = new THREE.Group();    // orientation + scale correction for the asset
    this.pose.add(this.inner);
    this.model = cloneSkinned(gltf.scene);
    this.inner.add(this.model);
    this.inner.rotation.y = THREE.MathUtils.degToRad(look.modelRotation || 0);
    const height = look.modelHeight || 1.8 * (look.height || 1);
    if (look.modelScale) this.model.scale.setScalar(look.modelScale);
    else fitToHeight(this.model, height);
    if (look.modelScale) fitToHeight(this.model, 0);

    // find a head bone, morph targets for mouth/blink
    this.morphs = [];
    this.model.traverse((o) => {
      if (!this.headBone && !o.isMesh && isHead(o.name)) this.headBone = o;
      if (o.isMesh && o.morphTargetDictionary) {
        const dict = o.morphTargetDictionary;
        const keys = Object.keys(dict);
        const mouth = keys.filter((k) => MOUTH.test(k)).map((k) => dict[k]);
        const blink = keys.filter((k) => BLINK.test(k)).map((k) => dict[k]);
        if (mouth.length || blink.length) this.morphs.push({ mesh: o, mouth, blink });
      }
    });

    this.headRest = this.headBone?.quaternion.clone();

    // animations: clips in the model + optional animation packs
    let clips = [...gltf.animations];
    const files = look.animationFiles;
    const roleFile = {};
    if (Array.isArray(files)) {
      for (const f of files) { const g = getModel(f); if (g) clips.push(...g.animations); }
    } else if (files) {
      for (const [role, f] of Object.entries(files)) { const g = getModel(f); if (g?.animations[0]) roleFile[role] = g.animations[0]; }
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const role of Object.keys(ROLES)) {
      let clip = roleFile[role] || null;
      const named = look.animations?.[role];
      if (!clip && named) clip = clips.find((c) => c.name === named) || null;
      if (!clip && !(look.animations && role in look.animations)) clip = bestClip(clips, ROLES[role]);
      if (clip) this.actions[role] = this.mixer.clipAction(clip);
    }
    this.animated = !!(this.actions.idle || this.actions.walk || this.actions.run);
    for (const r of ['idle', 'walk', 'run', 'talk']) {
      const a = this.actions[r];
      if (a) { a.setLoop(THREE.LoopRepeat); a.play(); a.setEffectiveWeight(r === 'idle' ? 1 : 0); }
    }
    this.clipNames = clips.map((c) => c.name);

    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;
    blob.renderOrder = 1;
    this.root.add(blob);

    this.t = Math.random() * 10;
    this.speed = 0;
    this.action = null;
    this.downed = false;
    this.talking = false;
    this.mouth = 0;
    this.mouthTarget = 0;
    this.voiceDriven = false;
    this.lookYaw = 0;
    this.curLook = 0;
    this.blinkT = 2 + Math.random() * 3;
  }

  setFist() {}

  get busy() { return this.action && this.action.t < this.action.dur; }

  play(type, dur, extra = {}) {
    this.action = { type, t: 0, dur, ...extra };
    if (this.downed) return;
    const role = this.actions[type] ? type : (FALLBACK[type] || []).find((r) => this.actions[r]);
    const a = role && this.actions[role];
    if (!a) return;
    if (this.oneShot && this.oneShot !== a) this.oneShot.fadeOut(0.1);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    // fit the clip to the gameplay timing so hits land when the game expects them
    a.timeScale = THREE.MathUtils.clamp(a.getClip().duration / Math.max(0.2, dur), 0.6, 3);
    a.setEffectiveWeight(1);
    a.fadeIn(0.08).play();
    this.oneShot = a;
    this.oneShotEnd = this.t + Math.max(dur, a.getClip().duration / a.timeScale);
    this.action.clip = true;
  }

  _locomotion(dt) {
    const sp = this.speed;
    const { idle, walk, run, talk } = this.actions;
    const busy = this.oneShot && this.t < this.oneShotEnd;
    const base = busy ? 0.15 : 1;
    let wIdle = 1 - THREE.MathUtils.smoothstep(sp, 0.02, 0.3);
    let wRun = run ? THREE.MathUtils.smoothstep(sp, 0.5, 0.9) : 0;
    let wWalk = walk ? Math.max(0, 1 - wIdle - wRun) : 0;
    if (!walk && run) wRun = 1 - wIdle;
    if (!run && walk) wWalk = 1 - wIdle;
    let wTalk = 0;
    if (talk && this.talking && sp < 0.1) { wTalk = wIdle * 0.7; wIdle *= 0.3; }
    if (!idle) { wWalk += wIdle; wIdle = 0; }
    idle?.setEffectiveWeight(wIdle * base);
    talk?.setEffectiveWeight(wTalk * base);
    if (walk) { walk.setEffectiveWeight(wWalk * base); walk.timeScale = THREE.MathUtils.clamp(sp / 0.45, 0.5, 1.6); }
    if (run) { run.setEffectiveWeight(wRun * base); run.timeScale = THREE.MathUtils.clamp(sp / 0.85, 0.6, 1.4); }
    if (this.oneShot && this.t >= this.oneShotEnd) { this.oneShot.fadeOut(0.15); this.oneShot = null; }
  }

  update(dt) {
    this.t += dt;
    const t = this.t, sp = this.speed, P = this.pose;
    P.position.set(0, 0, 0);
    P.rotation.set(0, 0, 0);

    if (this.downed) {
      const down = this.actions.down;
      if (down && !this.downStarted) {
        this.downStarted = true;
        for (const a of Object.values(this.actions)) if (a !== down) a.fadeOut(0.15);
        down.reset().setLoop(THREE.LoopOnce, 1);
        down.clampWhenFinished = true;
        down.setEffectiveWeight(1).fadeIn(0.1).play();
      }
      if (!down) {
        this.downT = Math.min(1, (this.downT || 0) + dt * 2.5);
        const e = this.downT * this.downT;
        P.rotation.x = -Math.PI / 2 * e;
        P.position.y = 0.16 * e;
      }
    } else {
      if (this.downStarted) { this.downStarted = false; this.actions.down?.stop(); for (const r of ['idle', 'walk', 'run', 'talk']) this.actions[r]?.reset().play(); }
      this.downT = 0;
      if (this.animated) this._locomotion(dt);
      else {
        // static/unrigged model: bob, sway and lean the whole body
        const f = 5.5 + sp * 4.5;
        P.position.y = Math.abs(Math.sin(t * f)) * 0.06 * sp + Math.sin(t * 1.6) * 0.004;
        P.rotation.z = Math.sin(t * f) * 0.05 * sp;
        P.rotation.x = sp * 0.12;
        if (this.talking) P.rotation.y = Math.sin(t * 2.3) * 0.04;
      }
      // procedural reactions when there's no clip for the action
      const a = this.action;
      if (a && a.t < a.dur) {
        a.t += dt;
        const k = Math.min(1, a.t / a.dur), e = Math.sin(k * Math.PI);
        if (!a.clip) {
          if (a.type === 'punch' || a.type === 'kick') { P.rotation.x += 0.18 * e; P.position.z += 0.15 * e; P.rotation.y += 0.25 * e * (a.side || 1); }
          else if (a.type === 'windup') { P.rotation.x -= 0.12 * Math.min(1, k * 2); P.rotation.y -= 0.3 * Math.min(1, k * 2); }
          else if (a.type === 'hit') { P.rotation.x -= 0.25 * e; P.position.z -= 0.1 * e; }
          else if (a.type === 'dodge') { P.rotation.x += 0.45 * e; P.position.y -= 0.15 * e; }
          else if (a.type === 'laugh' || a.type === 'gesture') { P.rotation.x -= 0.12 * e; P.position.y += Math.abs(Math.sin(t * 20)) * 0.02 * e; }
        }
      }
    }
    if (this.headBone) this.headBone.quaternion.copy(this.headRest);   // the mixer overwrites this if a clip animates the head
    this.mixer.update(dt);

    // head look-at, applied on top of the animation in the head's parent space
    this.curLook = THREE.MathUtils.lerp(this.curLook, THREE.MathUtils.clamp(this.lookYaw, -1, 1), 1 - Math.exp(-dt * 5));
    if (this.headBone && Math.abs(this.curLook) > 0.001 && !this.downed) {
      const parent = this.headBone.parent;
      parent.updateWorldMatrix(true, false);
      const pq = parent.getWorldQuaternion(_q1);
      const turn = _q2.setFromAxisAngle(_up, this.curLook * 0.75);
      const local = _q3.copy(pq).invert().multiply(turn).multiply(pq);
      this.headBone.quaternion.premultiply(local);
    }

    // lip-sync and blinking through blend shapes, when the model has them
    if (this.morphs.length) {
      const target = this.talking ? (this.voiceDriven ? this.mouthTarget : Math.max(0, Math.sin(t * 13) * Math.sin(t * 5.3)) * 0.8) : 0;
      this.mouth = THREE.MathUtils.lerp(this.mouth, target, 1 - Math.exp(-dt * 25));
      this.blinkT -= dt;
      const blink = this.blinkT < 0.12 ? 1 - Math.abs(this.blinkT - 0.06) / 0.06 : 0;
      if (this.blinkT <= 0) this.blinkT = 2 + Math.random() * 4;
      for (const m of this.morphs) {
        for (const i of m.mouth) m.mesh.morphTargetInfluences[i] = this.mouth;
        for (const i of m.blink) m.mesh.morphTargetInfluences[i] = blink;
      }
    }
  }
}

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
