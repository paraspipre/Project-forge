import * as THREE from 'three';
import { Renderer, QUALITY, pickQuality } from '../core/Renderer.js';
import { Input } from '../core/Input.js';
import { Audio } from '../core/Audio.js';
import { City } from '../world/City.js';
import { Sky, Atmosphere } from '../world/Sky.js';
import { Traffic } from '../world/Traffic.js';
import { Crowd } from '../world/Crowd.js';
import { Signs } from '../world/Signs.js';
import { buildLandmarks, finishLandmarks } from '../world/landmarks/index.js';
import { Player, CameraRig } from './Player.js';
import { Fx } from './Fx.js';
import { Quests } from './Quests.js';
import { HUD, DEFAULT_PHRASES, PHRASES } from '../ui/HUD.js';
import { Labels } from '../ui/Labels.js';
import { Dialogue } from '../ui/Dialogue.js';
import { Net, makeId, clean } from '../net/Net.js';
import { RemotePlayer } from '../net/Remote.js';
import { ZONES, TRAVEL_TIPS } from '../data/zones.js';
import { PLAYER_LOOK } from '../actors/Avatar.js';
import { Look } from '../core/Toon.js';

const NAMES = ['Dosa Dev', 'Macha Mohan', 'Swalpa Sana', 'Chai Chitra', 'Byte Bhavya', 'Kaapi Kavya', 'Meter Manoj', 'Silk Board Sid', 'Namma Neha', 'Benne Bhaskar', 'Idli Ishaan', 'Gully Gopal', 'Startup Shreya', 'Traffic Tara', 'Pothole Pranav', 'Hebbal Harsha', 'Mysore Pak Mira', 'Ragi Raghu'];

export function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem('pb.profile') || 'null'); } catch {}
  if (!p || !p.id) {
    p = { id: makeId(), name: NAMES[Math.floor(Math.random() * NAMES.length)], look: { ...PLAYER_LOOK }, coins: 0, phrases: [...DEFAULT_PHRASES], done: [], cards: [], zone: 'central', online: true, room: 'public' };
  }
  p.phrases = p.phrases || [...DEFAULT_PHRASES];
  p.done = p.done || [];
  p.cards = p.cards || [];
  return p;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.qualityKey = pickQuality();
    this.ren = new Renderer(canvas, this.qualityKey);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.labels = new Labels(document.getElementById('labels'));
    this.hud = new HUD(this);
    this.dlg = new Dialogue(this);
    this.fx = new Fx(this.ren.scene, this.labels);
    this.profile = loadProfile();
    this.unlocked = new Set(this.profile.phrases);
    this.sky = new Sky(this.ren.scene);
    this.atmo = new Atmosphere(this.ren, this.sky);
    this.state = 'boot';
    this.remotes = new Map();
    this.net = null;
    this.sendT = 0;
    this.streetT = 0;
    this.mmT = 0;
    this.perf = { t: 0, n: 0 };
    this.time = 0;
    this.menuT = 0;
    this.quests = new Quests(this);
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
    window.addEventListener('keydown', () => this.audio.unlock());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  saveProfile() {
    this.profile.phrases = [...this.unlocked];
    try { localStorage.setItem('pb.profile', JSON.stringify(this.profile)); } catch {}
  }

  addCoins(n, at) {
    this.profile.coins = Math.max(0, (this.profile.coins || 0) + n);
    this.hud.setCoins(this.profile.coins);
    if (at && n > 0) this.fx.pop(at, `+${n} 🪙`);
    if (n > 0) this.audio.coin();
    this.saveProfile();
  }

  unlockPhrase(id) {
    if (this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    const p = PHRASES.find((x) => x.id === id);
    if (p) this.hud.toast(`New phrase unlocked: “${p.en}” — ${p.mean}. Use it from the emote menu (Q).`, 4500);
    this.saveProfile();
    return true;
  }

  // ------------------------------------------------------------------ zones

  async loadZone(id, onProgress = () => {}) {
    const meta = ZONES[id] || ZONES.central;
    this.zoneId = ZONES[id] ? id : 'central';
    onProgress('Downloading the map of ' + meta.name + '…');
    const res = await fetch(`data/zones/${this.zoneId}.json`);
    if (!res.ok) throw new Error(`map data for ${id} (${res.status})`);
    const data = await res.json();
    onProgress('Building ' + meta.short + ' (real OpenStreetMap streets)…');
    await new Promise((r) => setTimeout(r, 30));
    this._unloadZone();
    const city = new City(data, this.ren.quality);
    this.city = city;
    this.zoneData = data;
    const landmarks = buildLandmarks(this.zoneId, city);
    this.ren.scene.add(city.build());
    finishLandmarks(city, landmarks);
    this.landmarks = landmarks;
    for (const lm of landmarks) this.ren.scene.add(lm.object);
    this.signs = new Signs(city, data);
    this.ren.scene.add(this.signs.group);
    this.traffic = new Traffic(city, this.ren.quality, { jam: meta.jam || 0 });
    this.traffic.honk = (x, z, kind) => this.audio.horn(x, z, kind);
    this.ren.scene.add(this.traffic.group);
    this.crowd = new Crowd(this, city, this.ren.quality);
    this.ren.scene.add(this.crowd.group);
    this.traffic.obstacles = this.crowd.cows;
    onProgress('Placing auto drivers, cows and filter coffee…');
    if (!this.player) {
      this.player = new Player(this, this.profile.look);
      this.camRig = new CameraRig(this.ren.camera, city);
    }
    this.camRig.city = city;
    this.ren.scene.add(this.player.object);
    const [sx, sz, syaw] = this._safeSpawn(meta.spawn);
    this.player.place(sx, sz, syaw);
    this.camRig.yaw = syaw;
    this.hud.buildMinimap(city, data);
    this.hud.setZone(meta.name);
    this.quests.loadZone(this.zoneId);
    this.profile.zone = this.zoneId;
    this.saveProfile();
    return city;
  }

  // Move a spawn point out of buildings onto the nearest road.
  _safeSpawn([x, z, yaw]) {
    const c = this.city;
    if (!c.buildingAt(x, z, [], 0.6) && !c.isWater(x, z)) return [x, z, yaw];
    for (let r = 4; r < 300; r += 4) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (c.onRoad(px, pz) && !c.buildingAt(px, pz, [], 0.6)) return [px, pz, yaw];
      }
    }
    return [x, z, yaw];
  }

  _unloadZone() {
    if (!this.city) return;
    const s = this.ren.scene;
    s.remove(this.city.group);
    this.city.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const lm of this.landmarks || []) s.remove(lm.object);
    s.remove(this.signs.group); this.signs.dispose();
    s.remove(this.traffic.group);
    this.crowd.dispose(); s.remove(this.crowd.group);
    this.quests.unloadZone();
    this.labels.clear();
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.city = null;
  }

  async travel(zoneId) {
    if (this.traveling) return;
    this.traveling = true;
    const meta = ZONES[zoneId];
    const card = document.getElementById('travel');
    document.getElementById('travel-sub').textContent = `Next station: ${meta.name}  ·  ${meta.kn}`;
    document.getElementById('travel-tip').textContent = TRAVEL_TIPS[Math.floor(Math.random() * TRAVEL_TIPS.length)];
    card.classList.remove('hidden');
    this.audio.whoosh();
    this.state = 'loading';
    this.net?.close();
    this.net = null;
    try {
      const t0 = performance.now();
      await this.loadZone(zoneId, (m) => (document.getElementById('travel-title').textContent = 'Namma Metro'));
      const wait = 1600 - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.state = 'play';
      this.hud.big(meta.short.toUpperCase(), meta.kn, 2400);
      this._connect();
    } catch (e) {
      console.error(e);
      this.hud.toast('Could not reach ' + meta.name + ': ' + e.message);
      this.state = 'play';
    }
    card.classList.add('hidden');
    this.traveling = false;
  }

  // ------------------------------------------------------------------ multiplayer

  async _connect() {
    if (!this.profile.online) { this.hud.setOnline(1, false); return; }
    const net = new Net({ id: this.profile.id, name: this.profile.name, look: this.profile.look, zone: this.zoneId, room: this.profile.room });
    this.net = net;
    this.hud.setOnline(1, false);
    net.on.status = (n) => this.hud.setOnline(1 + this.remotes.size, n > 0);
    net.on.join = (p) => {
      if (this.remotes.has(p.id) || !this.city) return;
      this.remotes.set(p.id, new RemotePlayer(p, this.ren.scene, this.labels));
      this.hud.chat(null, `${p.name} is here 👋`, true);
      this.hud.setOnline(1 + this.remotes.size, true);
      this.audio.chat();
    };
    net.on.update = (p) => this.remotes.get(p.id)?.setProfile(p);
    net.on.leave = (p) => {
      const r = this.remotes.get(p.id);
      if (r) { r.dispose(); this.remotes.delete(p.id); this.hud.chat(null, `${p.name} left. Hogi banni!`, true); }
      this.hud.setOnline(1 + this.remotes.size, true);
    };
    net.on.state = (p, st) => this.remotes.get(p.id)?.push(st);
    net.on.chat = (p, text) => {
      this.hud.chat(p.name, text);
      this.remotes.get(p.id)?.say(text);
      this.audio.chat();
    };
    net.on.event = (p, type, data, ts) => this.quests.onNetEvent(p, type, data, ts);
    const ok = await net.connect();
    if (this.net !== net) { net.close(); return; }
    if (ok) this.hud.chat(null, this.profile.room === 'public' ? `Online in ${ZONES[this.zoneId].short}. Say hi with T or the 💬 button.` : `Private room “${this.profile.room}”. Share the invite link from the menu.`, true);
    else this.hud.chat(null, 'Could not reach the multiplayer servers. Playing solo.', true);
    this.hud.setOnline(1 + this.remotes.size, ok);
  }

  sendChat(text, phrase = false) {
    const t = clean(text).trim();
    if (!t) return;
    this.hud.chat(this.profile.name, t);
    this._sayBubble(t);
    if (this.net) this.net.chat(t);
    if (phrase) this.player.avatar.play('wobble', 1.6);
    this.quests.onSay?.(t);
  }

  _sayBubble(text) {
    this.myBubble?.remove();
    const b = this.labels.add(text, () => this.player.pos.clone().add(new THREE.Vector3(0, 2.55, 0)), { cls: 'bubble', maxDist: 60 });
    this.myBubble = b;
    setTimeout(() => { if (this.myBubble === b) { b.remove(); this.myBubble = null; } }, 5000);
  }

  doEmote(id) {
    if (this.player.mode === 'ride') this.player.toggleRide();
    this.player.avatar.play(id, id === 'sit' ? 999 : id === 'dance' ? 5 : 2.6);
    this.myEmote = id;
    this.myEmoteT = id === 'sit' ? 999 : 3;
    this.quests.onEmote?.(id);
  }

  // ------------------------------------------------------------------ main loop

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.ren.clock.getDelta());
    this.time += dt;
    this.input.update();
    try {
      if (this.state === 'paused' && this.input.consume('pause')) { if (this.ui?.mapInGame) this.ui.closeMap(); else this.ui?.pause(false); }
      if (this.state === 'play') this._play(dt);
      else if (this.state === 'menu' || this.state === 'loading') this._menuCam(dt);
      if (this.city) this._world(dt);
    } catch (e) { console.error(e); }
    this.ren.render();
    this._adapt(dt);
    this.input.endFrame();
    window.__ready = !!this.city;
  }

  _menuCam(dt) {
    if (!this.city) return;
    this.menuT += dt * 0.03;
    const [sx, sz] = ZONES[this.zoneId]?.spawn || [0, 0];
    const c = this.ren.camera;
    c.position.set(sx + Math.cos(this.menuT) * 140, 70, sz + Math.sin(this.menuT) * 140);
    c.lookAt(sx, 8, sz);
  }

  _world(dt) {
    const cam = this.ren.camera;
    this.atmo.update(dt);
    this.sky.update(dt, cam.position);
    this.city.update(cam.position);
    this.signs?.update(cam.position);
    const focus = this.state === 'play' ? this.player.pos : cam.position;
    this.ren.followShadow(focus);
    this.traffic?.update(dt, this.state === 'play' ? this.player : { pos: focus });
    this.crowd?.update(dt, focus);
    for (const lm of this.landmarks || []) lm.update?.(dt, this);
    this.fx.update(dt, cam.position, this.atmo.rain);
    this.labels.update(cam, dt);
    this.audio.setListener(cam.position.x, cam.position.z, this.camRig?.yaw || 0);
    const t = this.atmo.t;
    this.audio.updateAmbience({ night: Look.uNight.value, rain: this.atmo.rain, crowd: (ZONES[this.zoneId]?.jam || 0.3), morning: t > 0.25 && t < 0.4 }, dt);
  }

  _play(dt) {
    const inp = this.input, hud = this.hud, p = this.player;
    // dialogue owns the input while open
    if (this.dlg.open) {
      p.frozen = true;
      if (inp.pressed('advance') || inp.pressed('click')) this.dlg.advance();
      for (let i = 1; i <= 4; i++) if (inp.pressed('n' + i)) this.dlg.key(i);
    } else p.frozen = !!this.quests.freeze;
    if (inp.consume('pause')) {
      if (hud.chatOpen) hud.closeChat();
      else if (hud.wheelOpen) hud.closeWheel();
      else { this.ui?.pause(true); return; }
    }
    if (!this.dlg.open) {
      if (inp.consume('map')) { this.ui?.openMap(true); return; }
      // Enter both advances dialogue and opens chat: ignore it right after a conversation
      if (inp.consume('chat') && performance.now() - (this.dlg.closedAt || 0) > 700 && !this.quests.talking) hud.openChat();
      if (inp.consume('emote')) hud.openWheel(this.unlocked);
      if (inp.consume('horn')) { this.audio.myHorn(); this.net?.event('horn', {}); }
      for (let i = 1; i <= 9; i++) if (inp.consume('n' + i) && !hud.wheelOpen) {
        const e = ['wave', 'namaste', 'wobble', 'dance', 'cheer', 'laugh', 'facepalm', 'shrug', 'phone'][i - 1];
        this.doEmote(e);
      }
    }
    if (this.myEmote && (inp.move.x || inp.move.y || inp.pressed('jump'))) { this.player.avatar.stop(); this.myEmote = null; }
    if (this.myEmote) { this.myEmoteT -= dt; if (this.myEmoteT < 0) this.myEmote = null; }

    p.update(dt, inp, this.camRig.yaw);
    this._vehicleHits(dt);
    this.crowd.collidePlayer(p);
    this.quests.update(dt);
    this.camRig.update(dt, p, inp);

    // scooter light trails from the two hover pads
    if (p.mode === 'ride') {
      const pads = [-0.45, 0.45].map((zz) => new THREE.Vector3(0, 0.3, zz).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw).add(p.pos));
      this.fx.trail(Math.abs(p.speed) > 4 ? pads : null, dt);
    } else this.fx.trail(null, dt);

    // multiplayer
    for (const r of this.remotes.values()) r.update(dt);
    this.sendT -= dt;
    const moving = p.speedNow > 0.2 || !p.grounded || p.mode !== 'walk';
    if (this.net && this.sendT <= 0) {
      this.sendT = moving ? 0.1 : 1.0;
      this.net.sendState({ x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, mode: p.mode, emote: this.myEmote || '', speed: p.speedNow || 0, lean: p.lean, flags: p.grounded ? 0 : 1 });
    }

    // HUD
    this.streetT -= dt;
    if (this.streetT <= 0) {
      this.streetT = 0.5;
      const rd = this.city.streetAt(p.pos.x, p.pos.z, 45);
      hud.setStreet(rd?.name || (this.city.isWater(p.pos.x, p.pos.z)?.name) || '');
      hud.setClock(this.atmo.timeString(), this.atmo.rain, Look.uNight.value);
    }
    this.mmT -= dt;
    if (this.mmT <= 0) {
      this.mmT = 1 / 15;
      hud.drawMinimap(p, this.camRig.yaw, [...this.remotes.values()].filter((r) => r.visible), this.quests.markers());
    }
  }

  _vehicleHits() {
    const p = this.player;
    if (p.pos.y > 3 && p.mode !== 'ride') return;
    for (const v of this.traffic.near(p.pos.x, p.pos.z, p.mode === 'ride' ? 0.8 : 0.4, this._hitTmp || (this._hitTmp = []))) {
      if (Math.abs(v.y - p.pos.y) > 2) continue;
      const dx = p.pos.x - v.x, dz = p.pos.z - v.z, d = Math.hypot(dx, dz) || 1;
      const push = (v.type.r + 0.5 - d);
      p.pos.x += (dx / d) * push; p.pos.z += (dz / d) * push;
      if (v.v > 3 && !this._bonkCd) {
        p.knock(dx / d, dz / d, Math.min(8, v.v));
        this.fx.pop(p.pos, ['BONK!', 'SWALPA ADJUST!', 'AYYO!', 'BEEP BEEP!'][Math.floor(Math.random() * 4)]);
        this.audio.bonk();
        this.audio.horn(v.x, v.z, v.type.key);
        this.camRig.shake(0.35);
        this._bonkCd = true;
        setTimeout(() => (this._bonkCd = false), 900);
        this.quests.onBonk?.(v);
      }
    }
  }

  // Lower the render resolution if the device struggles; raise it back when there's headroom.
  _adapt(dt) {
    const pf = this.perf;
    pf.t += dt; pf.n++;
    if (pf.t < 3) return;
    const fps = pf.n / pf.t;
    pf.t = 0; pf.n = 0;
    const r = this.ren;
    const s = r.dprScale || 1;
    if (fps < 38 && s > 0.55) { r.dprScale = s - 0.15; r.resize(); }
    else if (fps > 57 && s < 1) { r.dprScale = Math.min(1, s + 0.1); r.resize(); }
  }

  setQuality(key) {
    try { localStorage.setItem('pb.quality', key); } catch {}
    location.reload();
  }

  onRoof(b) {
    if (!this._roofs) this._roofs = 0;
    this._roofs++;
    if (this._roofs === 1) this.hud.toast('Rooftop! Say hi to the Sintex tank. 🛢️');
    this.quests.onRoof?.(b);
  }
}
