import * as THREE from 'three';
import { Npc } from './Npc.js';
import { STORY } from '../data/story.js';
import { PHRASES } from '../ui/HUD.js';
import { toon } from '../core/Toon.js';
import { hash } from '../world/geo.js';
import { Minigames } from './Minigames.js';

// Missions are async scripts (see data/story.js) driven through a small context object:
//   await q.say('manju', 'Saar!'); const i = await q.choose('manju', 'Meter?', ['Yes', 'No']);
//   await q.goto(x, z, { text: 'Reach Koshy\'s', time: 60 }); await q.collect(points, {...});
// Only one mission runs at a time; failing one lets you retry from its giver.

export class QuestFail extends Error {}

class Ctx {
  constructor(qs, quest) {
    this.qs = qs; this.game = qs.game; this.quest = quest;
    this.cleanup = [];
    this.cancelled = false;
  }
  _check() { if (this.cancelled) throw new QuestFail('cancelled'); }

  speaker(who) {
    if (who === 'me') return { name: this.game.profile.name, color: '#3fb3a6', pitch: 1.15, voiceId: 'me' };
    if (typeof who === 'object') return who;
    return this.qs.npcs.get(who)?.speaker || { name: who, color: '#8e5bb5', pitch: 1 };
  }
  npc(id) { return this.qs.npcs.get(id); }

  async say(who, text, kn = '') {
    this._check();
    const n = this.qs.npcs.get(who);
    if (n) { n.face(this.game.player.pos.x, this.game.player.pos.z); if (Math.random() < 0.4) n.emote('wobble', 1.4); }
    await this.game.dlg.say(this.speaker(who), text, kn);
    this._check();
  }
  // `def` is the reply picked automatically when the countdown runs out (hands-free dialogue)
  async choose(who, text, options, kn = '', def = 0) {
    this._check();
    const i = await this.game.dlg.choose(this.speaker(who), text, options, kn, def);
    this._check();
    return i;
  }
  done() { this.game.dlg.close(); }

  objective(text) { this.game.hud.objective(text, this.quest.title.toUpperCase()); }
  toast(t, ms) { this.game.hud.toast(t, ms); }
  big(t, sub, ms) { this.game.hud.big(t, sub, ms); }
  wait(sec) { return new Promise((r) => setTimeout(r, sec * 1000)).then(() => this._check()); }
  pos() { return this.game.player.pos; }

  // Named spot from landmarks (e.g. 'vidhanaSteps') or a POI matched by regex in the map data.
  spot(name) { return this.game.city.spots?.[name] || null; }
  poi(re, fallback) {
    const d = this.game.zoneData;
    const P = this.game.player.pos;
    let best = null, bd = Infinity;
    for (const p of d.pois) {
      const nm = d.names[p[3]];
      if (!nm || !re.test(nm)) continue;
      const x = p[0] / 10, z = p[1] / 10, dd = (x - P.x) ** 2 + (z - P.z) ** 2;
      if (dd < bd) { bd = dd; best = [x, z, nm]; }
    }
    return best || fallback || null;
  }
  // A walkable point near (x, z): nudged out of buildings onto open ground.
  near(x, z, r = 8) { return this.qs.openSpot(x, z, r); }

  // Go somewhere. opts: { r, text, time (seconds), ride, icon }
  goto(x, z, opts = {}) {
    this._check();
    const r = opts.r || 6;
    if (opts.text) this.objective(opts.text);
    const target = { x, z, icon: opts.icon || '★' };
    this.qs.target = target;
    const mk = this.game.labels.add(opts.icon || '▼', () => new THREE.Vector3(x, this.game.city.groundAt(x, z, 1e4) + 3.2, z), { cls: 'marker goal', maxDist: 4000 });
    this.cleanup.push(() => mk.remove());
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const step = () => {
        if (this.cancelled) { mk.remove(); reject(new QuestFail('cancelled')); return true; }
        const p = this.game.player.pos;
        const d = Math.hypot(p.x - x, p.z - z);
        this.game.hud.objectiveDist(d);
        if (opts.time) {
          const left = opts.time - (performance.now() - start) / 1000;
          this.game.hud.timer(left);
          if (left <= 0) { mk.remove(); this.game.hud.timer(null); this.qs.target = null; reject(new QuestFail(opts.failText || 'Too slow!')); return true; }
        }
        if (d < r && (!opts.ride || this.game.player.mode === 'ride')) {
          mk.remove();
          this.qs.target = null;
          this.game.hud.objectiveDist(null);
          if (opts.time) this.game.hud.timer(null);
          this.game.audio.pickup();
          resolve();
          return true;
        }
        return false;
      };
      this.qs.ticks.add(step);
    });
  }

  // Collect floating items. points: [[x, z, (y)], ...]. opts: { text, icon, time, color, label }
  collect(points, opts = {}) {
    this._check();
    const items = points.map(([x, z, y]) => this.qs.spawnPickup(x, z, y, opts.color || '#f2c14e', opts.icon || '★'));
    const total = items.length;
    const upd = () => this.objective(`${opts.text || 'Collect'} (${total - items.filter((i) => !i.taken).length}/${total})`);
    upd();
    return new Promise((resolve, reject) => {
      const start = performance.now();
      this.cleanup.push(() => items.forEach((i) => i.remove()));
      const step = () => {
        if (this.cancelled) { reject(new QuestFail('cancelled')); return true; }
        const p = this.game.player.pos;
        let left = 0, nearest = null, nd = Infinity;
        for (const it of items) {
          if (it.taken) continue;
          const d = Math.hypot(p.x - it.x, p.z - it.z), dy = Math.abs(p.y + 1 - it.y);
          if (d < 1.6 && dy < 2.2) { it.take(); this.game.audio.pickup(); this.game.fx.pop(new THREE.Vector3(it.x, it.y, it.z), opts.label || 'GOT IT!'); upd(); continue; }
          left++;
          if (d < nd) { nd = d; nearest = it; }
        }
        this.qs.target = nearest ? { x: nearest.x, z: nearest.z, icon: opts.icon || '★' } : null;
        this.game.hud.objectiveDist(nearest ? nd : null);
        if (opts.time) {
          const t = opts.time - (performance.now() - start) / 1000;
          this.game.hud.timer(t);
          if (t <= 0) { this.game.hud.timer(null); reject(new QuestFail(opts.failText || 'Out of time!')); return true; }
        }
        if (!left) { if (opts.time) this.game.hud.timer(null); this.qs.target = null; resolve(); return true; }
        return false;
      };
      this.qs.ticks.add(step);
    });
  }

  // A temporary character for this mission.
  spawn(def) {
    const n = this.qs.addNpc(def);
    this.cleanup.push(() => this.qs.removeNpc(n.id));
    return n;
  }

  // Wait until a predicate (called each frame with dt) returns true. Optional time limit.
  until(pred, opts = {}) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const step = (dt) => {
        if (this.cancelled) { reject(new QuestFail('cancelled')); return true; }
        if (opts.time) {
          const left = opts.time - (performance.now() - start) / 1000;
          if (opts.showTimer !== false) this.game.hud.timer(left);
          if (left <= 0) { this.game.hud.timer(null); if (opts.okOnTimeout) { resolve(false); return true; } reject(new QuestFail(opts.failText || 'Out of time!')); return true; }
        }
        let r;
        try { r = pred(dt); } catch (e) { reject(e); return true; }
        if (r) { if (opts.time) this.game.hud.timer(null); resolve(r); return true; }
        return false;
      };
      this.qs.ticks.add(step);
    });
  }

  fail(msg) { throw new QuestFail(msg); }

  reward({ coins = 0, phrase = null, text = '' } = {}) {
    if (coins) this.game.addCoins(coins, this.game.player.pos);
    if (phrase) this.game.unlockPhrase(phrase);
    if (text) this.toast(text, 4000);
  }

  minigame(name, opts) { return this.qs.mini.run(name, opts, this); }
  cam(pos, look) { this.game.camRig.override = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) } : null; }
  freeze(on) { this.qs.freeze = on; }
}

export class Quests {
  constructor(game) {
    this.game = game;
    this.npcs = new Map();
    this.ticks = new Set();
    this.active = null;
    this.target = null;
    this.pickups = [];
    this.cards = [];
    this.freeze = false;
    this.mini = new Minigames(game);
    this.cardMat = toon({ color: '#f2c14e', hatch: 0.5, rim: 0.2 });
    this.cardGeo = new THREE.BoxGeometry(0.7, 0.9, 0.08);
  }

  get story() { return STORY[this.zone] || { npcs: [], quests: [], cards: [] }; }

  loadZone(zone) {
    this.zone = zone;
    this.cancelActive();
    const st = this.story;
    for (const d of st.npcs || []) {
      const at = this._resolve(d.at, d);
      if (!at) continue;
      this.addNpc({ ...d, x: at[0], z: at[1], yaw: d.yaw ?? at[2] ?? 0 });
    }
    this._placeCards(st.cards || []);
    this.refreshMarkers();
    this.nextHint();
  }

  unloadZone() {
    this.cancelActive();
    for (const n of this.npcs.values()) n.dispose();
    this.npcs.clear();
    for (const c of this.cards) { this.game.ren.scene.remove(c.mesh); c.label.remove(); }
    this.cards = [];
    for (const p of this.pickups) p.remove();
    this.pickups = [];
  }

  // Resolve a placement: [x, z], 'spot:name', or 'poi:regex' (+ offset)
  _resolve(at, d = {}) {
    if (!at) return null;
    let p = null;
    if (at === 'near-spawn') {
      const sp = this.game.player?.pos || { x: 0, z: 0 };
      const a = (d.ring || 0) * 1.57 + 0.8, r = 45 + (d.ring || 0) * 25;
      p = [sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r];
    } else if (Array.isArray(at)) p = at;
    else if (at.startsWith('spot:')) p = this.game.city.spots?.[at.slice(5)];
    else if (at.startsWith('poi:')) {
      const re = new RegExp(at.slice(4), 'i');
      const dd = this.game.zoneData;
      for (const q of dd.pois) { const nm = dd.names[q[3]]; if (nm && re.test(nm)) { p = [q[0] / 10, q[1] / 10]; break; } }
    } else if (at.startsWith('station:')) {
      const re = new RegExp(at.slice(8), 'i');
      const dd = this.game.zoneData;
      for (const s of dd.stations) if (re.test(dd.names[s[2]] || '')) { p = [s[0] / 10, s[1] / 10]; break; }
    }
    if (!p && d.fallback) p = d.fallback;
    if (!p) return null;
    const off = d.offset || [0, 0];
    return this.openSpot(p[0] + off[0], p[1] + off[1], 14);
  }

  // Nearest open (not inside a building, not in water) point.
  openSpot(x, z, r = 10) {
    const c = this.game.city;
    const ok = (px, pz) => !c.buildingAt(px, pz, [], 0.7) && !c.isWater(px, pz);
    if (ok(x, z)) return [x, z];
    for (let rr = 1.5; rr <= r * 3; rr += 1.5) for (let a = 0; a < 12; a++) {
      const px = x + Math.cos((a / 12) * Math.PI * 2) * rr, pz = z + Math.sin((a / 12) * Math.PI * 2) * rr;
      if (ok(px, pz)) return [px, pz];
    }
    return [x, z];
  }

  addNpc(def) {
    const n = new Npc(this.game, def);
    n.pos.y = this.game.city.groundAt(def.x, def.z, def.y ?? 1e3);
    this.game.ren.scene.add(n.object);
    this.npcs.set(def.id, n);
    return n;
  }

  removeNpc(id) {
    const n = this.npcs.get(id);
    if (n) { n.dispose(); this.npcs.delete(id); }
  }

  spawnPickup(x, z, y, color, icon) {
    const g = this.game;
    const yy = y ?? g.city.groundAt(x, z, 1e4) + 1.2;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), toon({ color, hatch: 0.4, rim: 0.3 }));
    mesh.position.set(x, yy, z);
    mesh.castShadow = true;
    g.ren.scene.add(mesh);
    const label = g.labels.add(icon, () => (it.taken ? null : mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0))), { cls: 'marker', maxDist: 120 });
    const it = {
      x, z, y: yy, mesh, label, taken: false,
      take() { it.taken = true; g.ren.scene.remove(mesh); label.remove(); g.fx.poof(mesh.position); },
      remove() { if (!it.taken) { g.ren.scene.remove(mesh); label.remove(); } it.taken = true; },
    };
    this.pickups.push(it);
    return it;
  }

  // Kannada word cards: on rooftops (climb!) and at landmarks. Each unlocks a chat phrase.
  _placeCards(list) {
    const have = new Set(this.game.profile.cards);
    const c = this.game.city;
    const roofs = c.buildings.filter((b) => b.h > 8 && b.h < 26 && b.area > 120 && b.area < 2500 && !b.landmark);
    list.forEach((card, i) => {
      const key = `${this.zone}:${card.phrase}`;
      if (have.has(key)) return;
      let x, z, y;
      if (card.at) {
        const p = this._resolve(card.at, card);
        if (!p) return;
        [x, z] = p; y = c.groundAt(x, z, 1e4) + 1.3;
      } else {
        // a deterministic rooftop near the zone centre-ish
        const pick = roofs[Math.floor(hash(i + 1, roofs.length, this.zone.length) * roofs.length)];
        if (!pick) return;
        [x, z] = pick.c; y = pick.h + 1.3;
      }
      const mesh = new THREE.Mesh(this.cardGeo, this.cardMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.game.ren.scene.add(mesh);
      const label = this.game.labels.add('ಕ', () => mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), { cls: 'marker', maxDist: 70 });
      this.cards.push({ key, phrase: card.phrase, mesh, label, x, z, y });
    });
  }

  available(q) {
    const done = new Set(this.game.profile.done);
    if (done.has(q.id) && !q.repeat) return false;
    return (q.requires || []).every((r) => done.has(r));
  }

  refreshMarkers() {
    const quests = this.story.quests || [];
    for (const n of this.npcs.values()) {
      if (n.def.temp) continue;
      const q = quests.find((q) => q.giver === n.id && this.available(q) && !q.repeat) || quests.find((q) => q.giver === n.id && this.available(q));
      n.setMarker(this.active ? null : q ? (q.repeat ? 'activity' : 'quest') : null);
    }
  }

  markers() {
    const out = [];
    for (const n of this.npcs.values()) {
      if (n.markerKind === 'quest') out.push({ x: n.pos.x, z: n.pos.z, icon: '!', color: '#f2c14e', size: 18, clamp: n === this.guideNpc });
      else if (n.markerKind === 'activity') out.push({ x: n.pos.x, z: n.pos.z, icon: '★', color: '#3fb3a6', size: 15 });
    }
    if (this.target) out.push({ x: this.target.x, z: this.target.z, icon: this.target.icon || '★', color: '#3fb3a6', size: 18, clamp: true });
    for (const c of this.cards) if (Math.hypot(c.x - this.game.player.pos.x, c.z - this.game.player.pos.z) < 120) out.push({ x: c.x, z: c.z, icon: 'ಕ', color: '#f2c14e', size: 13 });
    return out;
  }

  async start(q) {
    if (this.active) return;
    const ctx = new Ctx(this, q);
    this.active = { q, ctx };
    this.refreshMarkers();
    this.game.hud.objective(q.summary || q.title, q.title.toUpperCase());
    try {
      await q.run(ctx);
      ctx.done();
      // success
      const done = new Set(this.game.profile.done);
      done.add(q.id);
      this.game.profile.done = [...done];
      this.game.saveProfile();
      this.game.hud.big('MISSION PASSED', q.title, 2800);
      this.game.audio.fanfare(true);
      this.game.fx.confetti(this.game.player.pos);
      if (q.coins) this.game.addCoins(q.coins, this.game.player.pos);
      if (q.phrase) this.game.unlockPhrase(q.phrase);
      this.game.net?.event('quest', { title: q.title });
      const pct = this.game.progress();
      setTimeout(() => this.game.hud.toast(`Bengalurean-ness: ${pct}%${pct >= 100 ? ' — CERTIFIED BENGALUREAN!' : ''}`, 3500), 3000);
      if (pct >= 100 && !this.game.profile.certified) { this.game.profile.certified = true; this.game.saveProfile(); setTimeout(() => this.game.ui?.certificate(), 4500); }
    } catch (e) {
      ctx.done();
      if (!(e instanceof QuestFail)) console.error(e);
      if (e.message !== 'cancelled') {
        this.game.hud.big('MISSION FAILED', e instanceof QuestFail ? e.message : 'Something went wrong', 2600);
        this.game.audio.fail();
      }
    } finally {
      ctx.cancelled = true;
      for (const f of ctx.cleanup) { try { f(); } catch {} }
      this.ticks.clear();
      this.game.hud.timer(null);
      this.game.hud.objective(null);
      this.game.hud.objectiveDist(null);
      this.game.camRig.override = null;
      this.freeze = false;
      this.busy = false;
      this.target = null;
      this.active = null;
      this.game.dlg.close();
      this.refreshMarkers();
      this.nextHint();
    }
  }

  cancelActive() {
    if (!this.active) return;
    this.active.ctx.cancelled = true;
    for (const t of [...this.ticks]) t(0);
    this.ticks.clear();
  }

  nextHint() {
    const q = (this.story.quests || []).find((q) => this.available(q) && !q.repeat);
    const g = q && this.npcs.get(q.giver);
    this.guideNpc = g || null;
    if (g) this.game.hud.objective(`Talk to ${g.name} — follow the yellow ▼`, 'NEXT');
    else this.game.hud.objective(null);
  }

  // Where the player should head right now: the active objective, else the next "!".
  guide() {
    if (this.active) return this.target;
    const n = this.guideNpc;
    return n && n.markerKind === 'quest' ? { x: n.pos.x, z: n.pos.z, y: n.pos.y, npc: n } : null;
  }

  async talk(n) {
    if (this.talking) return;
    this.talking = true;
    try {
      const qs = (this.story.quests || []).filter((q) => q.giver === n.id && this.available(q));
      const q = qs.find((q) => !q.repeat) || qs[0];
      if (q && !this.active) { this.start(q); return; }
      const lines = n.def.chatter || ['Namaskara!'];
      const pick = lines[Math.floor(Math.random() * lines.length)];
      const ctx = new Ctx(this, { title: '' });
      if (typeof pick === 'function') await pick(ctx);
      else if (Array.isArray(pick)) await this.game.dlg.say(n.speaker, pick[0], pick[1]);
      else await this.game.dlg.say(n.speaker, pick);
      this.game.dlg.close();
    } finally { this.talking = false; }
  }

  update(dt) {
    const g = this.game, p = g.player;
    for (const n of this.npcs.values()) n.update(dt, p);
    for (const t of [...this.ticks]) if (t(dt)) this.ticks.delete(t);
    // cards
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      c.mesh.rotation.y += dt * 1.8;
      c.mesh.position.y = c.y + Math.sin(g.time * 2 + i) * 0.15;
      if (Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < 1.6 && Math.abs(p.pos.y + 1 - c.y) < 2) {
        g.ren.scene.remove(c.mesh); c.label.remove();
        this.cards.splice(i, 1);
        g.profile.cards = [...new Set([...g.profile.cards, c.key])];
        g.fx.poof(c.mesh.position, 'ಕನ್ನಡ!');
        g.audio.fanfare(false);
        g.addCoins(15);
        if (!g.unlockPhrase(c.phrase)) g.hud.toast('Word card collected! +15 🪙');
      }
    }
    // pickups bob
    for (const it of this.pickups) if (!it.taken) { it.mesh.rotation.y += dt * 2; it.mesh.position.y = it.y + Math.sin(g.time * 3 + it.x) * 0.15; }
    this.pickups = this.pickups.filter((i) => !i.taken);
    // interaction prompt (minigames that own the action button set `busy`)
    if (this.busy) return;
    if (g.dlg.open || this.freeze) { g.hud.prompt(null); return; }
    let best = null, bd = 3.2 * 3.2;
    for (const n of this.npcs.values()) {
      if (n.def.silent) continue;
      const d = n.pos.distanceToSquared(p.pos);
      if (d < bd && Math.abs(n.pos.y - p.pos.y) < 2) { bd = d; best = n; }
    }
    if (this.pedTalk && !best) {
      const ped = g.crowd.nearest(p.pos.x, p.pos.z, 2.6);
      if (ped && !ped.greeted) {
        g.hud.prompt(this.pedTalk.prompt);
        const d = Math.hypot(ped.x - p.pos.x, ped.z - p.pos.z);
        if (g.input.consume('interact') || d < 1.9) this.pedTalk.fn(ped);
        return;
      }
    }
    const now = performance.now();
    for (const n of this.npcs.values()) {
      const d2 = n.pos.distanceToSquared(p.pos);
      if (d2 > 36) { n.dwell = 0; n.autoDone = false; }
      if (d2 < 45 * 45 && !n.prefetched) { n.prefetched = true; g.audio?.prefetchVoices(n.speaker.voiceId); }
      // ambient chatter: a voiced speech bubble when you walk past
      if (d2 < 7.5 * 7.5 && !n.def.temp && !n.def.silent && n.markerKind !== 'quest' && !this.active && !this.talking
          && now > (n.nextBark || 0) && now > (this.nextBark || 0) && (n.def.chatter || []).length && n.markerKind !== 'activity') {
        const lines = n.def.chatter.filter((l) => typeof l !== 'function');
        const line = lines[Math.floor(Math.random() * lines.length)];
        if (line) {
          n.bark(Array.isArray(line) ? line[0] : line, Math.max(0.35, 1 - Math.sqrt(d2) / 9));
          n.nextBark = now + 16000 + Math.random() * 10000;
          this.nextBark = now + 5000;
        }
      }
    }
    if (best) {
      g.hud.prompt(`Talk to ${best.name}`);
      // a quest giver starts the conversation when you stop next to them: no button needed
      if (best.markerKind === 'quest' && !this.active && !best.autoDone && (p.speedNow || 0) < 2.5) {
        best.dwell = (best.dwell || 0) + dt;
        if (best.dwell > 0.45) { best.autoDone = true; this.talk(best); return; }
      }
      if (g.input.consume('interact')) { best.autoDone = true; this.talk(best); }
    } else g.hud.prompt(null);
  }

  onNetEvent(peer, type, data, ts) {
    if (type === 'horn') { const r = this.game.remotes.get(peer.id); if (r) this.game.audio.horn(r.pos.x, r.pos.z, 'scooter'); }
    if (type === 'quest') this.game.hud.chat(null, `${peer.name} completed “${data.title}” 🎉`, true);
    if (type === 'pillion') {
      const r = this.game.remotes.get(peer.id);
      if (r) r.pillionOf = data.on ? data.driver : null;
      if (data.on && data.driver === this.game.profile.id) this.game.hud.toast(`${peer.name} hopped on your scooter! Take them for a ride.`, 4000);
    }
    this.mini.onNetEvent(peer, type, data, ts);
  }

  onEmote(id) { this.emoteHook?.(id); }
  onSay(t) { this.sayHook?.(t); }
}
