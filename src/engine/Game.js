import * as THREE from 'three';
import { Input } from './Input.js';
import { Audio } from './Audio.js';
import { Character } from './Character.js';
import { ModelCharacter } from './ModelCharacter.js';
import { preloadModels, sceneModelUrls } from './Models.js';
import { World } from './World.js';
import { Script } from './Script.js';
import { Fx } from './Fx.js';
import { glow } from './Materials.js';
import { Post } from './Post.js';
import { setTextureSize } from './Textures.js';

// The engine. Everything story-specific comes from the `story` object (see story/*.json);
// this file only knows how to stage it: scenes, actors, clues, exits, fights, choices.

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'gh_save_v1';
const tmpV = new THREE.Vector3();

const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const lerpAngle = (a, b, k) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export class Game {
  constructor(story) {
    this.story = story;
    this.canvas = $('view');
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.quality = this._loadQuality();

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    setTextureSize(this.quality === 'high' ? 512 : 256);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    this.fx = new Fx(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera, this.quality);
    // soft key light that follows the player so faces stay readable at night
    this.keyLight = new THREE.PointLight('#c8d0ff', 4, 7, 1.5);
    this.scene.add(this.keyLight);
    this.hurtFlash = 0;
    for (const [id, c] of Object.entries(story.characters)) if (c.voice?.style) this.audio.voiceStyle[id] = c.voice.style;
    this.audio.loadManifest();
    this.script = new Script(this);
    this._resize();
    addEventListener('resize', () => this._resize());

    this.state = { sceneId: null, flags: {}, stats: { defeated: 0, start: Date.now() } };
    this.cam = { yaw: Math.PI, pitch: 0.32, dist: 6.2, look: new THREE.Vector3(), cine: null, cineLook: new THREE.Vector3(), shake: 0, idle: 0 };
    this.timeScale = 1;
    this.hitstop = 0;
    this.paused = true;
    this.running = false;
    this.seenIntros = new Set();
    this.scriptQueue = [];
    this.attackTokens = 2;
    this.clock = new THREE.Clock();
    this.t = 0;

    this._bindUI();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---------- setup / UI ----------

  _loadQuality() {
    try { const q = localStorage.getItem('gh_quality'); if (q) return q; } catch {}
    const small = Math.min(screen.width, screen.height) < 600;
    return small ? 'low' : 'high';
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h, pr);
    this.camera.aspect = w / h;
    // Wider FOV in portrait so the player can see around them.
    this.camera.fov = w < h ? 75 : 60;
    this.camera.updateProjectionMatrix();
    $('rotate-hint').classList.toggle('show', w < h);
  }

  _bindUI() {
    const unlock = () => this.audio.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);

    $('game-title').textContent = this.story.title.toUpperCase();
    $('game-subtitle').textContent = this.story.subtitle || '';
    document.title = this.story.title;
    $('loading').classList.add('hidden');
    if (this._readSave()) $('btn-continue').classList.remove('hidden');

    $('btn-new').onclick = () => { this.audio.unlock(); this.audio.select(); this.newGame(); };
    $('btn-continue').onclick = () => { this.audio.unlock(); this.audio.select(); this.continueGame(); };
    $('btn-howto').onclick = () => $('howto').classList.toggle('hidden');
    $('btn-pause').onclick = () => this.pause(true);
    $('btn-resume').onclick = () => this.pause(false);
    $('btn-restart').onclick = () => { this.pause(false); this.retry(); };
    $('btn-retry').onclick = () => { $('gameover').classList.add('hidden'); this.retry(); };
    $('btn-quit').onclick = () => this.toMenu();
    $('btn-end-menu').onclick = () => this.toMenu();
    const muteLabel = () => { $('btn-mute').textContent = `Sound: ${this.audio.muted ? 'Off' : 'On'}`; };
    muteLabel();
    $('btn-mute').onclick = () => { this.audio.setMuted(!this.audio.muted); muteLabel(); };
    this.settings = { autoDialogue: false };
    try { this.settings.autoDialogue = localStorage.getItem('gh_auto') === '1'; } catch {}
    const autoLabel = () => { $('btn-auto').textContent = `Auto dialogue: ${this.settings.autoDialogue ? 'On' : 'Off'}`; };
    autoLabel();
    $('btn-auto').onclick = () => {
      this.settings.autoDialogue = !this.settings.autoDialogue;
      try { localStorage.setItem('gh_auto', this.settings.autoDialogue ? '1' : '0'); } catch {}
      autoLabel();
    };
    const qLabel = () => { $('btn-quality').textContent = `Quality: ${this.quality === 'high' ? 'High' : 'Low'}`; };
    qLabel();
    $('btn-quality').onclick = () => {
      this.quality = this.quality === 'high' ? 'low' : 'high';
      try { localStorage.setItem('gh_quality', this.quality); } catch {}
      qLabel();
      this.toast('Applies after reload', 1500);
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.running && !this.paused) this.pause(true); });
  }

  newGame() {
    this.state = { sceneId: null, flags: {}, stats: { defeated: 0, start: Date.now() } };
    this.seenIntros.clear();
    this._start(this.story.start);
  }

  continueGame() {
    const s = this._readSave();
    if (!s) return this.newGame();
    this.state = { sceneId: null, flags: { ...s.flags }, stats: s.stats || { defeated: 0, start: Date.now() } };
    this._start(s.scene, s.spawn);
  }

  _start(sceneId, spawn) {
    $('menu').classList.add('hidden');
    $('ending').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.running = true;
    this.paused = false;
    this.loadScene(sceneId, spawn);
  }

  toMenu() {
    this.script.cancel();
    this.aborting = true;
    this.running = false;
    this.paused = true;
    ['pause', 'gameover', 'ending', 'hud', 'dialogue', 'caption', 'card'].forEach((id) => $(id).classList.add('hidden'));
    $('menu').classList.remove('hidden');
    if (this._readSave()) $('btn-continue').classList.remove('hidden');
    this.audio.setMood('silent', false);
  }

  pause(on) {
    if (!this.running) return;
    this.paused = on;
    $('pause').classList.toggle('hidden', !on);
  }

  retry() {
    // Restore the flags as they were when the scene was entered.
    this.state.flags = { ...this.entryFlags };
    this.loadScene(this.state.sceneId, this.entrySpawn);
  }

  _readSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
  }

  save(spawn) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ scene: this.state.sceneId, spawn, flags: this.state.flags, stats: this.state.stats }));
    } catch {}
  }

  // ---------- scene lifecycle ----------

  async loadScene(id, spawnName) {
    const data = this.story.scenes[id];
    if (!data) throw new Error(`Unknown scene: ${id}`);
    this.loading = true;
    this.aborting = true;
    this.script.cancel();
    $('fade').classList.add('on');
    // load this scene's GLB characters/props while the screen fades out
    await Promise.all([this.sleep(500), preloadModels(sceneModelUrls(this.story, data))]);

    // Teardown
    if (this.world) this.world.dispose();
    for (const a of this.actors || []) this.scene.remove(a.char.root);
    for (const m of this.markers || []) this.scene.remove(m);
    this.fx.clear();
    this.enemies = [];
    this.actors = [];
    this.markers = [];
    this.scriptQueue = [];

    this.state.sceneId = id;
    this.sceneData = data;
    this.entryFlags = { ...this.state.flags };
    this.entrySpawn = spawnName;
    this.world = new World(this.renderer, this.scene, data, this.quality);
    const env = data.environment || {};
    this.renderer.toneMappingExposure = env.exposure ?? 1;
    this.post.set({ sepia: env.flashback ? 0.85 : 0 });
    this.audio.setMood(data.mood || 'rain', !!env.rain, env.groundTex === 'wood' ? 'wood' : 'wet');
    this.audio.preload(this._sceneLines(data));

    // Player
    this.playerId = data.playAs || this.story.player;
    const sp = (spawnName && data.spawns?.[spawnName]) || data.spawn || { x: 0, z: 0, rot: 0 };
    this.player = this._makeActor(this.playerId, sp.x, sp.z, sp.rot);
    Object.assign(this.player, { hp: this.story.playerHp || 10, maxHp: this.story.playerHp || 10, combo: 0, comboT: 0, atkT: 0, dodgeT: 0, invuln: 0, vel: new THREE.Vector3() });
    this.cam.yaw = this.player.rot + Math.PI;
    this.cam.cine = null;
    this._snapCamera();

    // NPCs (talkable NPCs register interactables)
    this.interactables = [];
    this.npcs = {};
    for (const n of data.npcs || []) {
      if (n.if && !this.script.test(n.if)) continue;
      this._spawnNpc(n);
    }

    // Clues / interactables
    for (const it of data.interactables || []) this._addInteractable(it);

    this.triggers = (data.triggers || []).map((t) => ({ ...t, fired: false }));
    this.exits = (data.exits || []).map((e) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry((e.r || 1.5) - 0.15, e.r || 1.5, 32), new THREE.MeshBasicMaterial({ color: '#7bd34f', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x, 0.05, e.z);
      this.scene.add(ring);
      this.markers.push(ring);
      return { ...e, ring };
    });
    this.waves = {};
    this._setObjective(this._currentObjective());
    this._updateHealth();
    this.save(spawnName);

    this.loading = false;
    this.aborting = false;
    $('fade').classList.remove('on');

    if (data.card && !this.seenIntros.has(id + ':card')) {
      this.seenIntros.add(id + ':card');
      await this.showCard(data.card);
    }
    if (data.intro && !this.seenIntros.has(id)) {
      this.seenIntros.add(id);
      this.runScript(data.intro, true);
    } else if (data.resume) {
      this.runScript(data.resume);
    }
  }

  _makeActor(charId, x, z, rotDeg = 0) {
    const def = this.story.characters[charId];
    if (!def) throw new Error(`Unknown character: ${charId}`);
    // a GLB model when the story provides one and it loaded; the procedural character otherwise
    const char = (def.look.model && ModelCharacter.create(def.look)) || new Character(def.look);
    char.root.traverse((o) => { if (o.isMesh) o.castShadow = this.quality === 'high'; });
    const actor = { id: charId, char, pos: new THREE.Vector3(x, 0, z), rot: rotDeg * Math.PI / 180 };
    char.root.position.copy(actor.pos);
    char.root.rotation.y = actor.rot;
    this.scene.add(char.root);
    this.actors.push(actor);
    return actor;
  }

  _spawnNpc(n) {
    const a = this._makeActor(n.character || n.id, n.x, n.z, n.rot);
    a.npc = n;
    a.homeRot = a.rot;
    if (n.y) a.char.root.position.y = n.y;
    this.npcs[n.id] = a;
    if (n.talk) this._addInteractable({ id: 'talk_' + n.id, npc: n.id, label: n.label || `Talk to ${this.story.characters[n.character || n.id].name}`, script: n.talk, if: n.talkIf, repeat: n.repeat, kind: 'talk' });
    return a;
  }

  _addInteractable(it) {
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glow(it.kind === 'talk' ? '#f4ecd6' : '#f0b429'));
    marker.renderOrder = 5;
    this.scene.add(marker);
    this.markers.push(marker);
    this.interactables.push({ ...it, marker, used: false });
  }

  _interactPos(it) {
    if (it.npc) { const a = this.npcs[it.npc]; return a ? a.pos : null; }
    return tmpV.set(it.x, 0, it.z).clone();
  }

  _available(it) {
    if (it.npc && !this.npcs[it.npc]) return false;
    if (it.if && !this.script.test(it.if)) return false;
    if (!it.repeat && it.kind !== 'talk' && this.state.flags[`_used_${this.state.sceneId}_${it.id}`]) return false;
    return true;
  }

  _currentObjective() {
    for (const o of this.sceneData.objectives || []) {
      if (o.if && !this.script.test(o.if)) continue;
      if (o.until && this.script.test(o.until)) continue;
      if (o.count) return `${o.text} (${o.count.filter((f) => this.state.flags[f]).length}/${o.count.length})`;
      return o.text;
    }
    return '';
  }

  _setObjective(text) {
    if (text === this.objectiveText) return;
    this.objectiveText = text;
    $('objective').classList.toggle('hidden', !text);
    $('objective-text').textContent = text;
    const el = $('objective');
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  }

  // ---------- scripting hooks ----------

  runScript(steps, cinematic = false) {
    if (!steps) return;
    if (this.script.active) { this.scriptQueue.push([steps, cinematic]); return; }
    this.script.run(steps, { cinematic });
  }

  onScriptStart() {
    document.body.classList.add('in-script');
    $('sticks').style.visibility = 'hidden';
    $('prompt').classList.add('hidden');
    this.player && (this.player.char.speed = 0);
  }

  onScriptEnd() {
    document.body.classList.remove('in-script');
    $('sticks').style.visibility = '';
    for (const n of Object.values(this.npcs || {})) n.talkingTo = null;
    this.convoPartner = null;
    if (this.pendingGoto) return;
    this._setObjective(this._currentObjective());
    const next = this.scriptQueue.shift();
    if (next) setTimeout(() => this.runScript(next[0], next[1]), 50);
  }

  actorById(id) {
    if (id === this.playerId) return this.player;
    return this.npcs?.[id];
  }

  // Every spoken line in a scene, for voice preloading (mirrors tools/generate_voices.py).
  _sceneLines(sc) {
    const out = [];
    const player = sc.playAs || this.story.player;
    const walk = (steps) => {
      for (const st of steps || []) {
        if (st.s && st.t) out.push([st.s, st.t]);
        if (st.caption) out.push(['narrator', st.caption]);
        for (const c of st.choices || []) { out.push([player, c.t]); walk(c.then); }
        walk(st.then); walk(st.else); walk(st.talk);
      }
    };
    walk(sc.intro); walk(sc.resume);
    for (const n of sc.npcs || []) walk(n.talk);
    for (const it of sc.interactables || []) walk(it.script);
    for (const t of sc.triggers || []) walk(t.script);
    for (const w of Object.values(sc.waves || {})) walk(w.onClear);
    return out;
  }

  // Heads turn toward whoever is speaking; mouths follow the voice; fists come up in a fight.
  _lookAndTalk(a) {
    let target = null;
    if (this.script.active && this.talkingId) {
      const sp = this.actorById(this.talkingId);
      target = a === sp ? (a === this.player ? this.actorById(this.convoPartner) : this.player) : sp;
    } else if (a.enemy) target = this.player;
    else if (a !== this.player && a.pos.distanceTo(this.player.pos) < 6) target = this.player;
    if (target && target !== a) {
      let rel = angleTo(a.pos, target.pos) - a.rot;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      a.char.lookYaw = Math.abs(rel) < 2 ? rel : 0;
    } else a.char.lookYaw = 0;
    a.char.voiceDriven = a.char.talking && !!this.audio.curVoice && this.audio.speakingAs === a.id;
    if (a.char.voiceDriven) a.char.mouthTarget = this.audio.voiceLevel();
    if (a === this.player) a.char.setFist(this._combatNow);
    else if (a.enemy) a.char.setFist(a.hp > 0);
  }

  setTalking(id) {
    this.talkingId = id;
    for (const a of this.actors) a.char.talking = false;
    const a = id && this.actorById(id);
    if (a) a.char.talking = true;
  }

  animate(id, anim) {
    const a = this.actorById(id);
    if (anim === 'laugh') { this.audio.laugh(id); if (a) a.char.play('laugh', 1.4); return; }
    if (a) a.char.play(anim, 0.7);
  }

  sfx(name) { if (this.audio[name]) this.audio[name](); }

  setCinematic(cam) {
    this.cam.cine = { pos: new THREE.Vector3(...cam.pos), look: new THREE.Vector3(...cam.look), cut: !!cam.cut };
    if (cam.cut) { this.camera.position.copy(this.cam.cine.pos); this.cam.cineLook.copy(this.cam.cine.look); }
  }

  clearCinematic() { this.cam.cine = null; this.cam.speakerShot = null; }

  // Over-the-shoulder framing for conversations without an authored camera.
  focusSpeaker(id) {
    const speaker = this.actorById(id);
    const listener = id === this.playerId ? this.actorById(this.convoPartner) : this.player;
    if (!speaker || !listener || speaker === listener) return;
    const dir = speaker.pos.clone().sub(listener.pos).setY(0);
    if (dir.lengthSq() < 0.01) return;
    dir.normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const pos = listener.pos.clone().addScaledVector(dir, -1.9).addScaledVector(side, 0.9).setY(2.0);
    const look = speaker.pos.clone().setY(1.55).addScaledVector(side, -0.2);
    this.cam.speakerShot = { pos, look };
  }

  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async showCard({ kicker = '', title = '', sub = '', dur = 2.6 }) {
    $('card-kicker').textContent = kicker;
    $('card-title').textContent = title;
    $('card-sub').textContent = sub;
    $('card').classList.remove('hidden');
    this.audio.sting();
    await this.sleep(dur * 1000);
    $('card').classList.add('hidden');
  }

  toast(text, ms = 1400) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // Engine actions callable from story scripts via { do: 'name', ... }.
  async action(st) {
    const f = this.state.flags;
    switch (st.do) {
      case 'objective': this._setObjective(st.text); break;
      case 'goto':
        this.pendingGoto = { scene: st.scene, spawn: st.spawn };
        this.aborting = true;
        break;
      case 'card': await this.showCard(st); break;
      case 'toast': this.toast(st.text, st.ms); break;
      case 'sfx': this.sfx(st.name); break;
      case 'shake': this.cam.shake = st.amount ?? 0.5; break;
      case 'laugh': this.animate(st.id, 'laugh'); break;
      case 'clue':
        f[st.flag] = true;
        this.audio.clue();
        this.toast(st.text || 'CLUE FOUND!', 1600);
        break;
      case 'wave': this._spawnWave(st.id); break;
      case 'npcAdd': if (!this.npcs[st.id]) this._spawnNpc(st); break;
      case 'npcRemove': {
        const a = this.npcs[st.id];
        if (a) {
          if (st.smoke) { this.fx.smoke(a.pos); this.audio.smoke(); }
          this.scene.remove(a.char.root);
          this.actors = this.actors.filter((x) => x !== a);
          delete this.npcs[st.id];
        }
        break;
      }
      case 'npcMove': {
        const a = this.npcs[st.id];
        if (a) {
          a.moveTo = new THREE.Vector3(st.x, 0, st.z);
          a.moveSpeed = st.speed || 2.5;
          if (st.wait) await new Promise((r) => { a.onArrive = r; });
        }
        break;
      }
      case 'face': {
        const a = this.actorById(st.id), b = st.target ? this.actorById(st.target) : null;
        if (a) a.faceTarget = b ? angleTo(a.pos, b.pos) : (st.rot ?? 0) * Math.PI / 180;
        break;
      }
      case 'smoke': this.fx.smoke(new THREE.Vector3(st.x, 0, st.z)); this.audio.smoke(); break;
      case 'heal': this.player.hp = this.player.maxHp; this._updateHealth(); break;
      case 'fade':
        $('fade').classList.toggle('on', !!st.out);
        await this.sleep(550);
        break;
      case 'save': this.save(); break;
      case 'end': this._ending(st); break;
      default: console.warn('Unknown action', st.do);
    }
  }

  _ending(st) {
    this.running = false;
    const f = this.state.flags;
    $('end-kicker').textContent = st.kicker || '';
    $('end-title').textContent = st.title || 'THE END';
    $('end-text').textContent = st.text || '';
    const ul = $('end-stats');
    ul.innerHTML = '';
    const clues = Object.keys(f).filter((k) => k.startsWith('clue_')).length;
    const mins = Math.round((Date.now() - this.state.stats.start) / 60000);
    const rows = [[`Clues found`, `${clues} / ${this.story.totalClues || clues}`], ['Grinners knocked out', this.state.stats.defeated], ['Time', `${mins} min`]];
    for (const r of st.stats || []) if (this.script.test(r.if)) rows.push([r.label, r.value]);
    for (const [k, v] of rows) { const li = document.createElement('li'); li.innerHTML = `${k}: <b>${v}</b>`; ul.appendChild(li); }
    $('hud').classList.add('hidden');
    $('ending').classList.remove('hidden');
    try { localStorage.removeItem(SAVE_KEY); } catch {}
  }

  // ---------- combat ----------

  _spawnWave(id) {
    const w = this.sceneData.waves?.[id];
    if (!w) return;
    const list = w.enemies.map((e) => {
      const a = this._makeActor(e.character, e.x, e.z, e.rot);
      const kind = this.story.characters[e.character].combat || {};
      Object.assign(a, {
        enemy: true, wave: id, hp: kind.hp || 3, maxHp: kind.hp || 3, dmg: kind.damage || 1, speedMul: kind.speed || 1,
        windup: kind.windup || 0.6, reach: kind.reach || 1.5, strafe: Math.random() < 0.5 ? 1 : -1, state: 'chase', t: 0, cd: 0.5 + Math.random(), vel: new THREE.Vector3(),
        bar: this.fx.healthBar(), icon: this.fx.icon(),
      });
      a.bar.position.y = 2.35 * (this.story.characters[e.character].look.height || 1);
      a.icon.position.y = 2.75;
      a.icon.visible = false;
      a.char.root.add(a.bar, a.icon);
      this.enemies.push(a);
      return a;
    });
    this.waves[id] = { list, onClear: w.onClear, cleared: false };
    this.audio.setMood('combat', !!this.sceneData.environment?.rain);
    if (w.announce) this.toast(w.announce, 1600);
  }

  _playerAttack() {
    const p = this.player;
    if (p.atkT > 0 || p.dodgeT > 0) return;
    const step = p.comboT > 0 ? (p.combo + 1) % 3 : 0;
    p.combo = step;
    p.comboT = 0.75;
    p.atkT = step === 2 ? 0.42 : 0.3;
    p.hitDone = false;
    if (step === 2) p.char.play('kick', 0.42);
    else p.char.play('punch', 0.3, { side: step === 0 ? 1 : -1 });
    this.audio.whoosh(step === 2);
    if (Math.random() < 0.45) this.audio.effort(this.playerId, 'attack');
    // soft auto-aim to the nearest enemy in front-ish
    let best = null, bd = 3.2;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) p.rot = angleTo(p.pos, best.pos);
  }

  _resolvePlayerHit() {
    const p = this.player;
    const fwd = new THREE.Vector3(Math.sin(p.rot), 0, Math.cos(p.rot));
    const heavy = p.combo === 2;
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const to = e.pos.clone().sub(p.pos);
      const d = to.length();
      if (d > (heavy ? 1.9 : 1.7)) continue;
      to.normalize();
      if (to.dot(fwd) < 0.35) continue;
      hitAny = true;
      e.hp -= heavy ? 2 : 1;
      e.bar.setValue(e.hp / e.maxHp);
      e.vel.copy(to).multiplyScalar(heavy ? 7 : 3.5);
      e.icon.visible = false;
      if (e.state === 'windup') this.attackTokens++;
      const head = e.pos.clone().setY(1.6);
      this.fx.sparks(head);
      const words = heavy ? ['KRAK!', 'WHAM!', 'BOOM!'] : ['POW!', 'BIFF!', 'THWAK!', 'SOCK!'];
      this.fx.word(head.clone().add(new THREE.Vector3(0, 0.6, 0)), words[(Math.random() * words.length) | 0], heavy ? '#d8323c' : '#f0b429');
      this.audio.effort(e.id, 'hurt');
      if (e.hp <= 0) {
        this.audio.bodyFall();
        e.state = 'down'; e.t = 0;
        e.char.downed = true;
        e.bar.visible = false;
        this.state.stats.defeated++;
      } else {
        e.state = 'stagger'; e.t = heavy ? 0.6 : 0.35;
        e.char.play('hit', e.t);
      }
    }
    if (hitAny) {
      this.audio.hit(heavy);
      this.hitstop = heavy ? 0.09 : 0.05;
      this.cam.shake = heavy ? 0.35 : 0.18;
      if (navigator.vibrate) try { navigator.vibrate(heavy ? 40 : 20); } catch {}
    }
  }

  _damagePlayer(dmg, from) {
    const p = this.player;
    if (p.invuln > 0 || p.hp <= 0) return;
    p.hp -= dmg;
    p.invuln = 0.7;
    p.char.play('hit', 0.35);
    p.vel.copy(p.pos).sub(from).setY(0).normalize().multiplyScalar(5);
    this.audio.hit(false);
    this.audio.effort(this.playerId, 'hurt');
    this.hurtFlash = 1;
    this.cam.shake = 0.4;
    this.fx.word(p.pos.clone().setY(2.4), 'OOF!', '#d8323c');
    this._updateHealth();
    if (p.hp <= 0) {
      p.char.downed = true;
      this.audio.bodyFall();
      this.audio.laugh('vale');
      setTimeout(() => { if (this.running) $('gameover').classList.remove('hidden'); }, 1300);
    }
  }

  _updateHealth() {
    const p = this.player;
    if (!p) return;
    $('health-fill').style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`;
    $('health').classList.toggle('low', p.hp / p.maxHp < 0.35);
  }

  _updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      const toP = p.pos.clone().sub(e.pos).setY(0);
      const d = toP.length();
      e.cd -= dt;
      e.t -= dt;
      let moveSpeed = 0;
      // knockback slide
      if (e.vel.lengthSq() > 0.01) {
        e.pos.addScaledVector(e.vel, dt);
        e.vel.multiplyScalar(Math.exp(-dt * 8));
      }
      if (e.state === 'down') {
        if (e.t < -4) { e.sink = (e.sink || 0) + dt; e.char.root.position.y = -e.sink * 0.8; }
        continue;
      }
      if (p.hp <= 0) { e.char.speed = 0; continue; }
      const facing = angleTo(e.pos, p.pos);
      if (e.state === 'stagger') {
        if (e.t <= 0) { e.state = 'chase'; e.cd = 0.6 + Math.random() * 0.6; }
      } else if (e.state === 'windup') {
        e.rot = lerpAngle(e.rot, facing, 1 - Math.exp(-dt * 10));
        if (e.t <= 0) {
          e.icon.visible = false;
          e.char.play('punch', 0.3, { side: 1 });
          this.audio.whoosh();
          if (Math.random() < 0.3) this.audio.effort(e.id, 'attack');
          const fwd = new THREE.Vector3(Math.sin(e.rot), 0, Math.cos(e.rot));
          if (d < e.reach + 0.2 && toP.normalize().dot(fwd) > 0.3 && p.dodgeT <= 0) this._damagePlayer(e.dmg, e.pos);
          e.state = 'recover'; e.t = 0.5;
          this.attackTokens++;
        }
      } else if (e.state === 'recover') {
        if (e.t <= 0) { e.state = 'chase'; e.cd = 0.8 + Math.random() * 1.2; }
      } else if (e.state === 'chase') {
        if (d > 20) { e.char.speed = 0; continue; }
        e.rot = lerpAngle(e.rot, facing, 1 - Math.exp(-dt * 8));
        const dir = toP.clone().normalize();
        if (d > e.reach - 0.1) {
          moveSpeed = 2.7 * e.speedMul;
          e.pos.addScaledVector(dir, moveSpeed * dt);
        } else {
          // circle-strafe while waiting for an attack slot
          const side = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(e.strafe);
          e.pos.addScaledVector(side, 0.9 * dt);
          moveSpeed = 0.9;
          if (d < 0.9) e.pos.addScaledVector(dir, -1.5 * dt);
        }
        if (d < e.reach + 0.6 && e.cd <= 0 && this.attackTokens > 0) {
          this.attackTokens--;
          e.state = 'windup'; e.t = e.windup;
          e.icon.visible = true;
          e.char.play('windup', e.windup);
        }
      }
      // separation
      for (const o of this.enemies) {
        if (o === e || o.state === 'down') continue;
        const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, dd = Math.hypot(dx, dz);
        if (dd < 1.1 && dd > 0.001) { e.pos.x += dx / dd * (1.1 - dd) * 0.5; e.pos.z += dz / dd * (1.1 - dd) * 0.5; }
      }
      this.world.collide(e.pos, 0.4);
      e.char.speed = THREE.MathUtils.lerp(e.char.speed, Math.min(1, moveSpeed / 4), 1 - Math.exp(-dt * 10));
    }
    // waves cleared?
    for (const [id, w] of Object.entries(this.waves)) {
      if (w.cleared) continue;
      if (w.list.every((e) => e.hp <= 0)) {
        w.cleared = true;
        this.state.flags[`wave_${id}`] = true;
        this.attackTokens = 2;
        this.audio.setMood(this.sceneData.mood || 'rain', !!this.sceneData.environment?.rain);
        setTimeout(() => this.runScript(w.onClear || []), 900);
      }
    }
  }

  get inCombat() { return this.enemies.some((e) => e.hp > 0 && e.pos.distanceTo(this.player.pos) < 20); }

  // ---------- frame ----------

  _frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update();
    if (this.input.consume('pause') && this.running) this.pause(!this.paused);
    if (!this.running || this.paused || this.loading || !this.world) {
      if (this.world) this.post.render(0, 0);
      this.input.takeLook();
      this.input.endFrame();
      return;
    }
    if (this.pendingGoto && !this.script.active) {
      const g = this.pendingGoto;
      this.pendingGoto = null;
      this.loadScene(g.scene, g.spawn);
      this.input.endFrame();
      return;
    }
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.08; }
    this.t += dt;

    if (this.script.active) { this.input.takeLook(); this.script.update(this.input); }
    else this._updatePlayer(dt);

    this._updateNpcs(dt);
    if (this.enemies.length) this._updateEnemies(dt);
    if (!this.script.active) { this._checkTriggers(); this._updateInteract(); }

    this._combatNow = this.inCombat;
    this.keyLight.position.set(this.player.pos.x + (this.camera.position.x - this.player.pos.x) * 0.3, 2.4, this.player.pos.z + (this.camera.position.z - this.player.pos.z) * 0.3);
    for (const a of this.actors) {
      a.char.root.position.x = a.pos.x;
      a.char.root.position.z = a.pos.z;
      a.char.root.rotation.y = a.rot;
      this._lookAndTalk(a);
      a.char.update(dt);
    }
    this._updateMarkers(dt);
    this._updateCamera(dt);
    this.world.update(dt, this.t, this.camera.position, () => this.audio.thunder());
    this.fx.update(dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.post.render(dt, this.hurtFlash * 0.6);
    this.input.endFrame();
  }

  _updatePlayer(dt) {
    const p = this.player, inp = this.input;
    if (p.hp <= 0) { p.char.speed = 0; return; }
    p.atkT -= dt; p.comboT -= dt; p.invuln -= dt;
    // camera-relative movement
    const look = inp.takeLook();
    this.cam.yaw -= look.x * 0.005;
    this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + look.y * 0.004, 0.05, 1.1);
    if (look.x || look.y) this.cam.idle = 0; else this.cam.idle += dt;

    const mx = inp.move.x, my = inp.move.y;
    const mag = Math.hypot(mx, my);
    const sy = Math.sin(this.cam.yaw), cy = Math.cos(this.cam.yaw);
    // camera looks toward -forward; forward on screen = direction from camera to player
    const fwd = new THREE.Vector3(-sy, 0, -cy), right = new THREE.Vector3(cy, 0, -sy);
    const wish = fwd.multiplyScalar(-my).add(right.multiplyScalar(mx));

    if (inp.consume('dodge') && p.dodgeT <= 0 && p.atkT <= 0) {
      p.dodgeT = 0.38;
      p.invuln = Math.max(p.invuln, 0.38);
      const dir = mag > 0.1 ? wish.clone().normalize() : new THREE.Vector3(-Math.sin(p.rot), 0, -Math.cos(p.rot));
      p.vel.copy(dir).multiplyScalar(11);
      if (mag > 0.1) p.rot = Math.atan2(dir.x, dir.z);
      p.char.play('dodge', 0.38);
      this.audio.whoosh();
    }
    if (inp.consume('attack') && !this.nearInteract) this._playerAttack();

    let speed = 0;
    if (p.dodgeT > 0) {
      p.dodgeT -= dt;
    } else if (p.atkT > 0) {
      // attack lunge
      p.pos.addScaledVector(new THREE.Vector3(Math.sin(p.rot), 0, Math.cos(p.rot)), 1.4 * dt);
      if (!p.hitDone && p.atkT < (p.combo === 2 ? 0.26 : 0.18)) { p.hitDone = true; this._resolvePlayerHit(); }
    } else if (mag > 0.05) {
      speed = 5.2 * mag;
      p.pos.addScaledVector(wish, 5.2 * dt);
      p.rot = lerpAngle(p.rot, Math.atan2(wish.x, wish.z), 1 - Math.exp(-dt * 14));
      // camera lazily swings behind when the player runs sideways for a while
      if (this.cam.idle > 1.2) this.cam.yaw = lerpAngle(this.cam.yaw, p.rot + Math.PI, dt * 0.6 * mag);
      p.stepT = (p.stepT || 0) - dt * mag;
      if (p.stepT <= 0) { p.stepT = 0.32; this.audio.step(); }
    }
    if (p.vel.lengthSq() > 0.01) {
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-dt * 9));
    }
    this.world.collide(p.pos, 0.38);
    for (const a of this.actors) {
      if (a === p || (a.enemy && a.hp <= 0)) continue;
      const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 0.75 && dd > 0.001) { p.pos.x = a.pos.x + dx / dd * 0.75; p.pos.z = a.pos.z + dz / dd * 0.75; }
    }
    p.char.speed = THREE.MathUtils.lerp(p.char.speed, Math.min(1, speed / 5.2), 1 - Math.exp(-dt * 12));
    // out-of-combat regen
    if (p.hp < p.maxHp && !this.inCombat) {
      p.regen = (p.regen || 0) + dt;
      if (p.regen > 1) { p.regen = 0; p.hp++; this._updateHealth(); }
    }
  }

  _updateNpcs(dt) {
    for (const a of Object.values(this.npcs)) {
      let speed = 0;
      if (a.moveTo) {
        const to = a.moveTo.clone().sub(a.pos).setY(0);
        const d = to.length();
        if (d < 0.15) {
          a.moveTo = null;
          if (a.onArrive) { const r = a.onArrive; a.onArrive = null; r(); }
        } else {
          to.normalize();
          a.pos.addScaledVector(to, Math.min(d, a.moveSpeed * dt));
          a.rot = lerpAngle(a.rot, Math.atan2(to.x, to.z), 1 - Math.exp(-dt * 10));
          speed = a.moveSpeed / 5;
        }
      } else if (a.faceTarget !== undefined && a.faceTarget !== null) {
        a.rot = lerpAngle(a.rot, a.faceTarget, 1 - Math.exp(-dt * 6));
      } else if (a.npc?.idle === 'pace') {
        a.rot = a.homeRot + Math.sin(this.t * 0.4) * 0.8;
      }
      a.char.speed = THREE.MathUtils.lerp(a.char.speed, speed, 1 - Math.exp(-dt * 10));
    }
  }

  _updateInteract() {
    const p = this.player;
    let best = null, bd = 2.3;
    for (const it of this.interactables) {
      if (!this._available(it)) continue;
      const pos = this._interactPos(it);
      if (!pos) continue;
      const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
      if (d < (it.r || bd)) { bd = d; best = it; }
    }
    this.nearInteract = best;
    const prompt = $('prompt');
    if (best) {
      prompt.innerHTML = `<kbd>E</kbd>${best.label}`;
      prompt.classList.remove('hidden');
      $('btn-interact').classList.remove('hidden');
    } else {
      prompt.classList.add('hidden');
      $('btn-interact').classList.add('hidden');
    }
    if (best && this.input.consume('interact')) {
      if (!best.repeat && best.kind !== 'talk') this.state.flags[`_used_${this.state.sceneId}_${best.id}`] = true;
      if (best.npc) {
        const a = this.npcs[best.npc];
        a.faceTarget = angleTo(a.pos, p.pos);
        p.rot = angleTo(p.pos, a.pos);
        this.convoPartner = best.npc;
      } else {
        p.rot = angleTo(p.pos, this._interactPos(best));
      }
      this.audio.select();
      const steps = typeof best.script === 'function' ? best.script() : best.script;
      this.runScript(steps);
    }
  }

  _checkTriggers() {
    const p = this.player;
    for (const t of this.triggers) {
      if (t.fired && t.once !== false) continue;
      if (t.if && !this.script.test(t.if)) continue;
      if (Math.hypot(p.pos.x - t.x, p.pos.z - t.z) < (t.r || 2)) {
        t.fired = true;
        this.runScript(t.script, !!t.cinematic);
        return;
      }
    }
    for (const e of this.exits) {
      const ok = !e.if || this.script.test(e.if);
      e.ring.visible = ok;
      if (!ok) continue;
      if (Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < (e.r || 1.5)) {
        if (this.inCombat) { this.toast('Not while they\'re swinging!', 1200); p.pos.x += (p.pos.x - e.x) * 0.3; p.pos.z += (p.pos.z - e.z) * 0.3; return; }
        this.pendingGoto = { scene: e.to, spawn: e.spawn };
        return;
      }
    }
  }

  _updateMarkers(dt) {
    for (const it of this.interactables) {
      const show = this._available(it) && !this.script.active;
      it.marker.visible = show;
      if (!show) continue;
      const pos = this._interactPos(it);
      it.marker.position.set(pos.x, (it.npc ? 2.45 : (it.y ?? 1.2)) + Math.sin(this.t * 3) * 0.08, pos.z);
      it.marker.rotation.y += dt * 2;
    }
    for (const e of this.exits) {
      const s = 1 + Math.sin(this.t * 4) * 0.06;
      e.ring.scale.set(s, s, s);
    }
  }

  _snapCamera() {
    const p = this.player;
    this.cam.look.set(p.pos.x, 1.4, p.pos.z);
    this._orbitPos(this.camera.position);
    this.camera.lookAt(this.cam.look);
  }

  _orbitPos(out, dist = this.cam.dist) {
    const c = this.cam;
    out.set(
      c.look.x + Math.sin(c.yaw) * Math.cos(c.pitch) * dist,
      c.look.y + Math.sin(c.pitch) * dist,
      c.look.z + Math.cos(c.yaw) * Math.cos(c.pitch) * dist,
    );
    return out;
  }

  // Shorten the camera boom if a tall collider is in the way.
  _boomLength() {
    const c = this.cam, cols = this.world.colliders;
    const steps = 12;
    const target = new THREE.Vector3();
    for (let i = 3; i <= steps; i++) {
      const dist = (c.dist * i) / steps;
      this._orbitPos(target, dist);
      for (const b of cols) {
        if (target.x > b.minX && target.x < b.maxX && target.z > b.minZ && target.z < b.maxZ && (b.maxY ?? 4) > target.y) {
          return Math.max(1.6, (c.dist * (i - 1)) / steps);
        }
      }
    }
    return c.dist;
  }

  _updateCamera(dt) {
    const c = this.cam, p = this.player;
    const k = 1 - Math.exp(-dt * 6);
    const shot = c.cine || (this.script.active ? c.speakerShot : null);
    if (shot) {
      const kk = shot.cut ? 1 : 1 - Math.exp(-dt * (c.cine ? 3 : 5));
      this.camera.position.lerp(shot.pos, kk);
      c.cineLook.lerp(shot.look, kk);
      this.camera.lookAt(c.cineLook);
    } else {
      c.look.lerp(tmpV.set(p.pos.x, 1.4, p.pos.z), k * 1.5);
      const dist = this._boomLength();
      c.curDist = THREE.MathUtils.lerp(c.curDist || dist, dist, dist < (c.curDist || dist) ? 0.5 : k);
      const want = this._orbitPos(new THREE.Vector3(), c.curDist);
      this.camera.position.lerp(want, Math.min(1, k * 2.5));
      c.cineLook.copy(c.look);
      this.camera.lookAt(c.look);
    }
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 2);
      const s = c.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
  }
}
