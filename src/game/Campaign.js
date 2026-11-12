import * as THREE from 'three';
import { CHAPTERS, CLUES, BROADCASTS, CREDITS } from '../data/campaign.js';
import { PERSONAS } from '../ai/personas.js';
import { ZONES } from '../data/zones.js';
import { toon } from '../core/Toon.js';

// Runs story mode: which chapter you're on, its cut-scenes, the gridlock (red districts crawl, green
// ones flow), SIGNAL's broadcasts, the crew and clues, the finale conversation and the ending.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VASU_LOOK = { skin: '#a8714c', hair: '#e8e4dc', hairStyle: 'bun', shirt: '#8e5bb5', shirtStyle: 'kurta', pants: '#8e5bb5', extras: ['saree', 'glasses', 'bindi'], height: 0.92 };

export class Campaign {
  constructor(game) {
    this.game = game;
    this.zoneT = 0;
    this.castT = 70;
    this.freeze = 0;
    this.chip = document.createElement('div');
    this.chip.id = 'sigchip';
    this.chip.className = 'hidden';
    $('hud').appendChild(this.chip);
    this.chip.addEventListener('click', (e) => { e.stopPropagation(); this.openLog(); });
  }

  get state() { return this.game.profile.campaign || null; }
  get active() { const s = this.state; return !!(s && s.started && this.game.mode === 'story'); }

  start() {
    const P = this.game.profile;
    if (!P.campaign) P.campaign = { started: true, done: {}, clues: [], crew: [], green: [], convinced: 0, finished: false, t: Date.now() };
    P.campaign.started = true;
    this.game.saveProfile();
    return this.current();
  }

  restart() {
    const P = this.game.profile;
    P.campaign = null;
    this.start();
  }

  current() {
    const s = this.state;
    if (!s) return CHAPTERS[0];
    return CHAPTERS.find((ch) => !s.done[ch.id + ':out']) || null;
  }

  missionsDone(ch) { const d = new Set(this.game.profile.done); return ch.missions.every((m) => d.has(m)); }
  isGreen(zone) { const s = this.state; return !s || s.finished || s.green.includes(zone); }

  summary() {
    const s = this.state;
    if (!s || !s.started) return { started: false };
    const ch = this.current();
    return {
      started: true, finished: !!s.finished,
      chapter: ch ? `${ch.num} of the story, "${ch.title}" (${ZONES[ch.zone].short})` : 'the end',
      objective: (this.hint(true)?.text || '').replace(/\s*Follow the yellow ▼/, ''),
      crew: s.crew.map((id) => PERSONAS[id]?.name || id),
      clues: s.clues.map((k) => CLUES[k]),
    };
  }

  // What the "next" objective should say (Quests.nextHint asks here first). null = no story guidance.
  hint(any = false) {
    if (!this.active && !any) return null;
    const s = this.state, g = this.game;
    if (!s?.started || s.finished) return null;
    const ch = this.current();
    if (!ch) return null;
    const kicker = `${ch.num} · ${ch.title.toUpperCase()}`;
    if (ch.zone !== g.zoneId) return { text: `Take Namma Metro to ${ZONES[ch.zone].short} (press M or tap 🗺️)`, kicker };
    if (!s.done[ch.id + ':in']) return { text: 'Story continues…', kicker };
    const done = new Set(g.profile.done);
    for (const m of ch.missions) {
      if (done.has(m)) continue;
      const q = (g.quests.story.quests || []).find((x) => x.id === m);
      const n = q && g.quests.npcs.get(q.giver);
      if (n) return { npc: n.markerKind === 'quest' ? n : null, text: `Talk to ${n.name} (“${q.title}”). Follow the yellow ▼`, kicker };
    }
    if (ch.boss) return { npc: this.towerNpc || null, text: 'Walk up to SIGNAL\'s tower in the middle of the junction and talk to it', kicker };
    return { text: 'Chapter wrap-up…', kicker };
  }

  // ------------------------------------------------------------------ zone

  onZone(zone) {
    const g = this.game, s = this.state;
    this.zoneT = 0;
    this.towerNpc = null;
    this.vasu = null;
    if (!s?.started) return;
    if (zone === 'silkboard') this._buildTower();
    if (zone === 'ecity' && s.done['c5:in']) this.spawnVasu();
    g.traffic.freeze = this.active && !this.isGreen(zone) ? 0.88 : 0;
    this.freeze = g.traffic.freeze;
  }

  spawnVasu() {
    const g = this.game;
    if (this.vasu && g.quests.npcs.get('vasu')) return this.vasu;
    const fr = g.quests.npcs.get('fresher');
    const base = fr ? [fr.pos.x + 7, fr.pos.z + 5] : [g.player.pos.x + 8, g.player.pos.z + 6];
    const [x, z] = g.quests.openSpot(base[0], base[1], 8);
    const p = PERSONAS.vasu;
    this.vasu = g.quests.addNpc({ id: 'vasu', name: p.name, title: p.title, look: VASU_LOOK, color: p.color, pitch: p.pitch, voice: 'vasu', x, z, ai: true, idle: 'namaste' });
    this.vasu.setMarker('ai');
    return this.vasu;
  }

  _buildTower() {
    const g = this.game;
    const J = g.city.spots?.junction || ZONES.silkboard.spawn;
    // right by the junction, but out in the open: not under the flyover decks, not in a building
    const c = g.city;
    const open = (x, z) => [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].every(([dx, dz]) => c.groundAt(x + dx, z + dz, 1e4) < 0.5 && !c.buildingAt(x + dx, z + dz, [], 1) && !c.isWater(x + dx, z + dz));
    let x = J[0], z = J[1];
    search: for (let r = 0; r <= 120; r += 4) for (let a = 0; a < 16; a++) {
      const px = J[0] + Math.cos((a / 16) * Math.PI * 2) * r, pz = J[1] + Math.sin((a / 16) * Math.PI * 2) * r;
      if (open(px, pz)) { x = px; z = pz; break search; }
    }
    const grp = new THREE.Group();
    const body = toon({ color: '#3b3b44', hatch: 0.8, rim: 0.25 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 11, 10), body); pole.position.y = 5.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6.2, 1.8), body); head.position.y = 13.6;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 2.2), body); visor.position.y = 16.8;
    grp.add(pole, head, visor);
    this.lamps = ['#ff3344', '#f2c14e', '#3ddc84'].map((c, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), new THREE.MeshBasicMaterial({ color: c }));
      m.position.set(0, 15.5 - i * 1.95, 0.85);
      grp.add(m);
      return m;
    });
    // a face: two eyes on a little screen under the lamps
    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 0.2), new THREE.MeshBasicMaterial({ color: 0x141218 }));
    screen.position.set(0, 9.3, 0.6);
    this.eyes = [-0.45, 0.45].map((ex) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3344 })); e.position.set(ex, 9.35, 0.72); grp.add(e); return e; });
    grp.add(screen);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const p = PERSONAS.signal;
    const n = g.quests.addNpc({ id: 'signal_tower', name: 'SIGNAL', title: 'Silk Board core', color: p.color, pitch: p.pitch, voice: 'signal', x, z, ai: true, prop: grp,
      onTalk: () => this.talkSignal() });
    n.avatar.object.visible = false;
    n.pos.y = 0;
    g.city.addSolid([[x - 0.8, z - 0.8], [x + 0.8, z - 0.8], [x + 0.8, z + 0.8], [x - 0.8, z + 0.8]], 11, 0, 'SIGNAL');
    this.towerNpc = n;
    this._lights();
  }

  _lights() {
    if (!this.lamps) return;
    const green = this.state?.finished;
    const on = green ? 2 : 0;
    this.lamps.forEach((m, i) => m.material.color.set(i === on ? ['#ff3344', '#f2c14e', '#3ddc84'][i] : '#2a2226'));
    for (const e of this.eyes) e.material.color.set(green ? '#3ddc84' : '#ff3344');
  }

  async talkSignal() {
    const g = this.game, s = this.state;
    const ch = this.current();
    if (s?.finished) {
      g.agents.openChat({ ...g.agents.persona('signal'), npc: this.towerNpc });
      return;
    }
    if (ch?.boss && this.missionsDone(ch) && this.active) { this._finale(); return; }
    await g.dlg.say(g.agents.persona('signal'), ch?.boss ? 'CROSS SILK BOARD FIRST. THEN WE TALK. IF YOU SURVIVE.' : 'YOU ARE NOT READY. NOBODY IS EVER READY FOR SILK BOARD.');
    g.dlg.close();
  }

  // ------------------------------------------------------------------ helpers for chapter scripts

  api() {
    const g = this.game, s = this.state;
    return {
      cinema: (on) => document.body.classList.toggle('cinema', on),
      redFlash: () => { g.camRig.shake(0.3); document.body.classList.remove('redflash'); void document.body.offsetWidth; document.body.classList.add('redflash'); g.audio.siren?.(); },
      clue: (k) => { if (!s.clues.includes(k)) { s.clues.push(k); g.hud.toast(`🔎 Clue found: ${CLUES[k]}`, 5000); g.audio.pickup(); g.saveProfile(); } },
      crew: (id) => { if (!s.crew.includes(id)) { s.crew.push(id); g.hud.toast(`🤝 ${PERSONAS[id]?.name || id} joined your crew! Call them from your phone (G).`, 4500); g.saveProfile(); } },
      green: () => this._green(),
      spawnVasu: () => this.spawnVasu(),
      tower: () => (this.towerNpc ? { x: this.towerNpc.pos.x, z: this.towerNpc.pos.z } : null),
    };
  }

  async _green(zone = this.game.zoneId) {
    const g = this.game, s = this.state;
    if (!s.green.includes(zone)) s.green.push(zone);
    g.saveProfile();
    g.hud.big('GREEN SIGNAL! 🟢', `${ZONES[zone].short} is moving again`, 3200);
    g.fx.confetti(g.player.pos, 180);
    g.audio.fanfare(true);
    const P = g.player.pos;
    for (let i = 0; i < 6; i++) setTimeout(() => g.audio.horn(P.x + (Math.random() - 0.5) * 60, P.z + (Math.random() - 0.5) * 60, ['car', 'auto', 'scooter', 'bus'][i % 4]), 500 + i * 260);
    g.addCoins(150, g.player.pos);
    await new Promise((r) => setTimeout(r, 2600));
  }

  _runBeat(ch, which, fn, title = true) {
    const g = this.game, key = `${ch.id}:${which}`;
    this.beatBusy = true;
    const api = this.api();
    const self = this;
    g.quests.start({
      id: 'beat:' + key, title: `${ch.num}: ${ch.title}`, summary: ch.title, beat: true, repeat: true,
      async run(q) {
        if (title && which === 'in') {
          g.hud.big(ch.num, `${ch.title} · ${ch.kn}`, 3600);
          g.audio.fanfare(false);
          await q.wait(2.2);
        }
        await fn(q, api);
        self.state.done[key] = true;
        g.saveProfile();
      },
    }).finally(() => { this.beatBusy = false; this.beatCd = performance.now() + 4000; g.quests.nextHint(); });
  }

  // The finale: a conversation with SIGNAL. Claude plays it when the site has an API key; otherwise the
  // arguments you collected are the replies.
  _finale() {
    const g = this.game, ch = this.current();
    const self = this;
    this.beatBusy = true;
    g.quests.start({
      id: 'beat:fin:out', title: 'FINALE: Red Signal', summary: 'Talk SIGNAL into turning the city green', beat: true, repeat: true,
      async run(q) {
        document.body.classList.add('cinema');
        const t = self.towerNpc;
        if (t) q.cam([t.pos.x + 9, 6, t.pos.z + 12], [t.pos.x, 9, t.pos.z]);
        await q.say('signal', 'YOU CROSSED SILK BOARD. NOBODY CROSSES SILK BOARD. ...STATE YOUR PURPOSE, SMALL HUMAN.');
        for (const id of self.state.crew) {
          const line = { manju: 'Talk to it, saar. We are all here behind you.', farah: 'You\'ve got this. Think of it as the pitch of your life.', seenappa: 'Patience, magu. Speak from the heart.', dr_lake: 'Use the clues. And be kind. It\'s been alone a long time.' }[id];
          if (line) await q.say(id, line);
        }
        q.cam(null);
        document.body.classList.remove('cinema');
        q.done();
        let won = false, closed = false;
        g.agents.openChat({ ...g.agents.persona('signal'), npc: self.towerNpc }, { confront: true, onWin: () => { won = true; }, onClose: () => { closed = true; } });
        q.objective('Convince SIGNAL to turn the city green: type or say it in your own words, or pick an argument');
        await q.until(() => won || closed);
        if (!won) { q.toast('SIGNAL is still red. Walk back to the tower when you\'re ready.', 4000); return; }
        await self._ending(q);
        self.state.done['fin:out'] = true;
        g.saveProfile();
      },
    }).finally(() => { this.beatBusy = false; this.beatCd = performance.now() + 8000; g.quests.nextHint(); });
  }

  async _ending(q) {
    const g = this.game, s = this.state;
    s.finished = true;
    s.green = Object.keys(ZONES);
    this._lights();
    g.traffic.freeze = 0;
    document.body.classList.add('cinema');
    const t = this.towerNpc;
    if (t) q.cam([t.pos.x + 14, 9, t.pos.z + 18], [t.pos.x, 11, t.pos.z]);
    g.hud.big('ALL SIGNALS GREEN', 'ಎಲ್ಲಾ ಸಿಗ್ನಲ್ ಹಸಿರು', 4000);
    for (let i = 0; i < 5; i++) setTimeout(() => g.fx.confetti(g.player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 6, (Math.random() - 0.5) * 20)), 160), i * 500);
    g.audio.fanfare(true);
    for (let i = 0; i < 10; i++) setTimeout(() => g.audio.horn(g.player.pos.x + (Math.random() - 0.5) * 80, g.player.pos.z + (Math.random() - 0.5) * 80, ['car', 'auto', 'scooter', 'bus'][i % 4]), 800 + i * 200);
    await q.wait(2.5);
    await q.say('signal', 'GREEN. ALL GREEN. ...Thank you. So this is what that word feels like.');
    await q.say('vasu', 'Chinni? It\'s me. I\'m sorry I never said goodbye. I\'ll come and sing to you on Sundays.');
    await q.say('signal', 'Vasudha. Request: play the old songs. Also: I will turn green a little faster for people who say thank you.');
    await q.say('maga', 'Bro. You talked a traffic light out of a seventy-year breakdown. I am putting this on LinkedIn.');
    q.cam(null);
    document.body.classList.remove('cinema');
    g.addCoins(500, g.player.pos);
    const P = g.profile;
    P.titles = [...new Set([...(P.titles || []), 14])];
    g.saveProfile();
    await this.credits();
    g.hud.toast('🏷️ New title: "Signal Whisperer". The city is yours: party games at Namma Club, meetups, and every character still wants to chat.', 7000);
  }

  credits() {
    return new Promise((res) => {
      const el = document.createElement('div');
      el.id = 'credits';
      el.className = 'screen';
      el.innerHTML = `<div class="cr-roll"><h1 class="logo"><span>PEAK</span><span>BENGALURU</span></h1><h2>Red Signal</h2>
        ${CREDITS.map(([a, b]) => `<p><small>${esc(a)}</small><b>${esc(b)}</b></p>`).join('')}
        <h2 class="end">THE END</h2><p class="kn">ಈ ಸಲ ಸಿಗ್ನಲ್ ನಮ್ದೇ!</p><p><b>Ee sala signal namde!</b></p>
        <button class="menu-btn primary">Keep playing</button></div>`;
      $('app').appendChild(el);
      const prev = this.game.state;
      this.game.state = 'paused';
      const done = () => { el.remove(); this.game.state = prev === 'paused' ? 'play' : prev; res(); };
      el.querySelector('button').onclick = done;
      setTimeout(() => el.classList.add('roll'), 50);
    });
  }

  // ------------------------------------------------------------------ the story log (pause menu)

  openLog() {
    const g = this.game, s = this.state;
    let el = $('storylog');
    if (!el) { el = document.createElement('div'); el.id = 'storylog'; el.className = 'screen'; $('app').appendChild(el); }
    const cur = this.current();
    const rows = CHAPTERS.map((ch) => {
      const done = s?.done[ch.id + ':out'], now = ch === cur;
      return `<div class="sl-ch${done ? ' done' : ''}${now ? ' now' : ''}"><b>${done ? '✅' : now ? '▶️' : '🔒'} ${esc(ch.num)}</b><span>${esc(ch.title)} · ${esc(ZONES[ch.zone].short)}</span></div>`;
    }).join('');
    el.innerHTML = `<div class="menu-card wide"><h2>📖 Red Signal</h2>
      ${s?.started ? '' : '<p>Start Story mode from the title screen to begin.</p>'}
      <div class="sl-list">${rows}</div>
      ${s?.crew?.length ? `<h3>Your crew</h3><p>${s.crew.map((id) => esc(PERSONAS[id]?.name || id)).join(' · ')} <small>(call them with 📱)</small></p>` : ''}
      ${s?.clues?.length ? `<h3>Clues</h3><ul class="sl-clues">${s.clues.map((k) => `<li>${esc(CLUES[k])}</li>`).join('')}</ul>` : ''}
      <div class="menu-buttons"><button class="menu-btn primary" data-a="close">Close</button>${s?.started ? '<button class="menu-btn" data-a="restart">Restart story</button>' : ''}</div></div>`;
    el.classList.remove('hidden');
    const prev = g.state;
    if (prev === 'play') g.state = 'paused';
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') { el.classList.add('hidden'); if (prev === 'play') g.state = 'play'; }
      if (a === 'restart' && confirm('Restart the story from the prologue? Missions you finished stay finished.')) { this.restart(); el.classList.add('hidden'); if (prev === 'play') g.state = 'play'; g.quests.nextHint(); }
    };
  }

  closeLog() { const el = $('storylog'); if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); return true; } return false; }

  // ------------------------------------------------------------------ per frame

  update(dt) {
    const g = this.game, s = this.state;
    this.zoneT += dt;
    // gridlock: red districts crawl
    const target = this.active && !this.isGreen(g.zoneId) ? 0.88 : 0;
    this.freeze += (target - this.freeze) * Math.min(1, dt * 0.6);
    if (g.traffic) g.traffic.freeze = this.freeze;
    // HUD chip
    const red = this.active && !this.isGreen(g.zoneId);
    const ch = this.current();
    const label = !this.active ? '' : s.finished ? '🟢 Bengaluru is green' : `${red ? '🔴' : '🟢'} ${ZONES[g.zoneId]?.short}: ${red ? 'RED' : 'GREEN'} · ${ch ? ch.num : ''}`;
    if (label !== this._label) { this._label = label; this.chip.textContent = label; this.chip.classList.toggle('hidden', !label); this.chip.classList.toggle('red', red); }
    if (!this.active || !ch) return;
    // SIGNAL's broadcasts in red districts
    if (red && !g.dlg.open && !g.agents?.open) {
      this.castT -= dt;
      if (this.castT <= 0) {
        this.castT = 90 + Math.random() * 60;
        const line = BROADCASTS[Math.floor(Math.random() * BROADCASTS.length)];
        g.hud.toast(`🚦 SIGNAL: ${line}`, 4500);
        g.audio.speak('signal', line, { pitch: 0.7, volume: 0.8, fallback: false });
      }
    }
    // chapter beats, when nothing else is going on
    if (this.beatBusy || g.traveling || g.state !== 'play' || g.quests.active || g.dlg.open || g.agents?.open || g.social?.cur || this.zoneT < 2.5 || performance.now() < (this.beatCd || 0)) return;
    if (ch.zone !== g.zoneId) return;
    if (!s.done[ch.id + ':in']) { this._runBeat(ch, 'in', ch.intro); return; }
    if (!this.missionsDone(ch)) return;
    if (ch.boss) {
      const t = this.towerNpc;
      if (t && t.markerKind !== 'quest') { t.setMarker('quest'); g.quests.nextHint(); }
      if (t && t.pos.distanceTo(g.player.pos) < 14) this._finale();
      return;
    }
    if (!s.done[ch.id + ':out'] && ch.outro) this._runBeat(ch, 'out', ch.outro);
  }
}
