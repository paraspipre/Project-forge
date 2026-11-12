import * as THREE from 'three';
import { PERSONAS, RESIDENTS } from './personas.js';
import { offlineReply, SIGNAL_ARGS, BAD_ARGS } from './offline.js';
import { ZONES } from '../data/zones.js';
import { TITLES } from '../data/cosmetics.js';
import { clean } from '../net/Net.js';

// AI characters: talk to anyone in your own words (typed or spoken). Replies come from Claude through
// api/agent.js when the site has an API key, otherwise from the offline brain. Characters remember
// you between visits, can mark places on your map, ask for favours and give small gifts. Maga lives in
// your phone (G / 📱). AI residents wander every district.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAILY_CAP = 150;

export class Agents {
  constructor(game) {
    this.game = game;
    this.online = null;          // null = unknown, true = AI server ready, false = offline brain
    this.chat = null;            // the open conversation
    this.mark = null;            // a place someone marked for you
    this._buildUI();
    fetch('/api/agent', { method: 'GET' }).then((r) => (r.ok ? r.json() : null)).then((j) => { this.online = !!(j && j.ai); this._badge(); }).catch(() => { this.online = false; this._badge(); });
  }

  get open() { return !!this.chat; }

  // ------------------------------------------------------------------ who

  persona(id) {
    const p = PERSONAS[id];
    return p ? { id, name: p.name, title: p.title, voiceId: p.voice || id, pitch: p.pitch || 1, color: p.color || '#8e5bb5', lines: p.lines || [] } : null;
  }

  fromNpc(n) {
    const d = n.def;
    const known = PERSONAS[d.id];
    const lines = (d.chatter || []).filter((l) => typeof l !== 'function').map((l) => (Array.isArray(l) ? l[0] : l));
    return {
      id: d.id, name: d.name, title: d.title || '', voiceId: n.speaker.voiceId, pitch: n.speaker.pitch || 1, color: n.speaker.color || '#f07b5a',
      npc: n, lines: known?.lines || lines, generic: !known && !d.ai, chatter: d.chatter || [],
    };
  }

  // ------------------------------------------------------------------ residents

  spawn(zone) {
    const g = this.game, Q = g.quests;
    for (const r of RESIDENTS) {
      if (r.zone !== zone) continue;
      const at = Q._resolve(r.at, { ring: r.ring, fallback: null }) || Q._resolve('near-spawn', { ring: r.ring + 1 });
      if (!at) continue;
      const n = Q.addNpc({ id: r.id, name: r.name, title: r.title, ai: true, look: { ...r.look }, voice: r.voice, pitch: r.pitch, color: '#3fb3a6', x: at[0], z: at[1], yaw: Math.random() * 6.28, idle: 'phone' });
      n.home = [at[0], at[1]];
      n.nextWander = performance.now() + 3000 + Math.random() * 8000;
      n.setMarker('ai');
    }
  }

  _clear(ax, az, bx, bz) {
    const c = this.game.city, d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 1.5);
    for (let i = 1; i <= n; i++) { const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n; if (c.buildingAt(x, z, [], 0.4) || c.isWater(x, z)) return false; }
    return true;
  }

  _wander(n, now) {
    if (n.path || this.chat?.agent.npc === n || now < n.nextWander) return;
    n.nextWander = now + 7000 + Math.random() * 12000;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 12;
      const x = n.home[0] + Math.cos(a) * r, z = n.home[1] + Math.sin(a) * r;
      if (this._clear(n.pos.x, n.pos.z, x, z)) { n.walkTo([[x, z]], 1.2); return; }
    }
  }

  // ------------------------------------------------------------------ the conversation

  openMaga() { const a = this.persona('maga'); a.phone = true; this.openChat(a); }

  // agent: from persona() or fromNpc(); opts: { confront: { onWin } } for SIGNAL
  openChat(agent, opts = {}) {
    const g = this.game;
    if (this.chat) this.close();
    if (g.quests.active && !opts.confront && agent.npc) { /* talking during a mission is fine */ }
    const mem = this._mem(agent.id);
    this.chat = { agent, opts, busy: false, log: [] };
    const n = agent.npc;
    if (n) { n.path = null; n.face(g.player.pos.x, g.player.pos.z); }
    if (g.player.mode === 'ride') g.player.toggleRide();
    const el = this.el;
    el.className = 'aichat' + (agent.phone ? ' phone' : '') + (opts.confront ? ' confront' : '');
    el.querySelector('.ac-name').textContent = agent.name;
    el.querySelector('.ac-title').textContent = agent.title;
    el.querySelector('.ac-av').style.background = agent.color;
    el.querySelector('.ac-av').textContent = agent.phone ? '📱' : agent.id === 'signal' ? '🚦' : agent.name[0];
    el.querySelector('.ac-log').innerHTML = '';
    el.querySelector('.ac-meter').classList.toggle('hidden', !opts.confront);
    this._badge();
    // a first line straight away (no wait): their own voiced line, or something they remember
    let hello;
    if (opts.confront) hello = 'SIGNAL ONLINE. You have walked to Silk Board. Bold. Say what you came to say.';
    else if (agent.phone) hello = this._magaHello();
    else if (mem.n > 0 && Math.random() < 0.7) hello = pick([`Ah, you again! ${mem.f.length ? 'I haven\'t forgotten, you know.' : 'Come, come.'}`, 'Look who\'s back! Namaskara!', `${g.profile.name}! Oota aayta?`]);
    else {
      const ch = (agent.chatter || []).filter((l) => typeof l !== 'function');
      const l = ch.length ? pick(ch) : null;
      hello = l ? (Array.isArray(l) ? l[0] : l) : `Namaskara! I'm ${agent.name}${agent.title ? ', ' + agent.title : ''}.`;
    }
    this._say(agent, { say: hello, kn: '', emote: 'wave', replies: this._defaultReplies(agent), action: { type: 'none' } }, true);
    mem.n++;
    this._saveMem();
    if (opts.confront) this._meter(this._st().convinced || 0);
    if (!g.input.isTouch) setTimeout(() => el.querySelector('.ac-in').focus(), 50);
    document.body.classList.add('chatting');
  }

  close() {
    if (!this.chat) return;
    const c = this.chat;
    this.chat = null;
    this.el.classList.add('hidden');
    this.rec?.stop?.();
    this.game.audio.stopVoice();
    document.body.classList.remove('chatting');
    this.el.querySelector('.ac-in').blur();
    if (c.agent.npc) { c.agent.npc.nextWander = performance.now() + 4000; c.agent.npc.yaw = c.agent.npc.baseYaw; }
    c.opts.onClose?.();
  }

  _defaultReplies(agent) {
    if (this.chat?.opts.confront) return this._args().map((a) => a.text);
    if (agent.phone) return ['What should I do next?', 'Teach me a Kannada word', 'Any food nearby?'];
    return ['What\'s going on with SIGNAL?', 'Need any help?', 'Tell me about this place'];
  }

  _args() {
    const clues = new Set(this.game.campaign?.state?.clues || []);
    return [...SIGNAL_ARGS.filter((a) => clues.has(a.clue)), ...BAD_ARGS.slice(0, 1)];
  }

  _magaHello() {
    const S = this.game.campaign?.summary();
    const h = new Date().getHours();
    if (S?.started && !S.finished && S.objective) return `${h < 12 ? 'Good morning' : h < 17 ? 'Hey' : 'Evening'}, boss! Next up: ${S.objective} Ask me anything.`;
    if (S?.finished) return 'Hero of Bengaluru! SIGNAL is green and I am famous by association. What\'s up?';
    return 'Namaskara! Maga here, your phone\'s AI. Ask me anything about Bengaluru.';
  }

  _mem(id) {
    const P = this.game.profile;
    P.ai = P.ai || {};
    return (P.ai[id] = P.ai[id] || { h: [], f: [], n: 0 });
  }

  _saveMem() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.game.saveProfile(), 800); }

  _st() { return this.game.campaign?.state || {}; }

  context(agent) {
    const g = this.game, p = g.player.pos, d = g.zoneData;
    const near = [];
    if (d) {
      const seen = new Set();
      const list = d.pois.map((q) => ({ n: d.names[q[3]], d: Math.hypot(q[0] / 10 - p.x, q[1] / 10 - p.z) })).filter((q) => q.n && q.d < 260).sort((a, b) => a.d - b.d);
      for (const q of list) { const k = q.n.toLowerCase(); if (seen.has(k)) continue; seen.add(k); near.push(q.n); if (near.length >= 14) break; }
    }
    const rd = g.city.streetAt(p.x, p.z, 60);
    const mem = this._mem(agent.id);
    const S = g.campaign?.summary() || { started: false };
    const ctx = {
      zoneName: ZONES[g.zoneId]?.name, street: rd?.name || '', time: g.atmo.timeString(), weather: g.atmo.rain > 0.3 ? 'raining' : Look_night(g) ? 'night' : 'clear',
      nearby: near,
      player: { name: g.profile.name, title: TITLES[g.profile.look?.title] || '', coins: g.profile.coins || 0, wanted: g.driving?.heat || 0, vehicle: g.player.veh?.spec.name || '' },
      story: S, memory: mem.f,
    };
    if (this.chat?.opts.confront) ctx.signal = { convinced: this._st().convinced || 0, turn: (this.chat.turns || 0) + 1 };
    return ctx;
  }

  async send(text) {
    const c = this.chat;
    text = clean(String(text || '')).trim().slice(0, 300);
    if (!c || !text || c.busy) return;
    const g = this.game, agent = c.agent;
    this._bubble('me', text);
    const mem = this._mem(agent.id);
    const ctx = this.context(agent);
    c.busy = true;
    c.turns = (c.turns || 0) + 1;
    this._typing(true);
    let reply = null, ai = false;
    const P = g.profile, today = new Date().toDateString();
    if (P.aiDay !== today) { P.aiDay = today; P.aiCount = 0; }
    if (this.online && P.aiCount < DAILY_CAP) {
      try {
        const body = { agent: agent.generic ? `npc:${agent.id}` : agent.id, message: text, history: mem.h.slice(-12), context: ctx };
        if (agent.generic) body.npc = { name: agent.name, title: agent.title, zoneName: ctx.zoneName, lines: agent.lines.slice(0, 4) };
        const r = await fetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout?.(30000) });
        if (r.status === 503) { this.online = false; this._badge(); }
        const j = r.ok ? await r.json() : null;
        if (j?.reply) { reply = j.reply; ai = true; P.aiCount++; }
      } catch {}
    }
    if (this.chat !== c) return;
    if (!reply) reply = offlineReply({ ...agent, npc: !!agent.npc }, text, ctx, { args: c.opts.confront ? this._args() : null });
    this._typing(false);
    c.busy = false;
    mem.h.push({ role: 'user', text }, { role: 'assistant', text: reply.say });
    mem.h = mem.h.slice(-16);
    if (reply.remember && !mem.f.includes(reply.remember)) { mem.f.push(reply.remember); mem.f = mem.f.slice(-8); }
    this._saveMem();
    this._say(agent, reply);
    this._act(agent, reply.action);
    if (c.opts.confront) {
      const st = this._st();
      st.convinced = reply.convinced;
      this._meter(reply.convinced);
      g.saveProfile();
      if (reply.convinced >= 100) setTimeout(() => { if (this.chat === c) { c.opts.onWin?.(); this.close(); } }, 2600);
      else if (!ai || c.turns >= 6) c.replies = null;   // arguments stay offered as chips
    }
    // others nearby see the character's line as a speech bubble
    if (agent.npc && g.net) g.net.event('ai:say', { id: agent.id, text: reply.say.slice(0, 140) });
  }

  _say(agent, r, first = false) {
    const g = this.game;
    this._bubble(agent, r.say, r.kn);
    const chips = this.el.querySelector('.ac-chips');
    const replies = this.chat?.opts.confront ? this._args().map((a) => a.text) : (r.replies && r.replies.length ? r.replies : this._defaultReplies(agent));
    chips.innerHTML = replies.map((t) => `<button class="ac-chip">${esc(t)}</button>`).join('') + (this.chat?.opts.confront ? '' : '<button class="ac-chip bye">👋 Bye</button>');
    if (agent.npc && r.emote && r.emote !== 'none') agent.npc.emote(r.emote, 2.2);
    g.audio.speak(agent.voiceId, r.say, { pitch: agent.pitch, fallback: true }).catch?.(() => {});
    if (first && !agent.npc && !agent.phone && agent.id !== 'signal') g.audio.chat();
  }

  _bubble(who, text, kn = '') {
    const log = this.el.querySelector('.ac-log');
    const d = document.createElement('div');
    d.className = who === 'me' ? 'ac-msg me' : 'ac-msg them';
    d.innerHTML = `${esc(text)}${kn ? `<span class="kn">${esc(kn)}</span>` : ''}`;
    log.appendChild(d);
    while (log.children.length > 30) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  _typing(on) {
    const log = this.el.querySelector('.ac-log');
    log.querySelector('.typing')?.remove();
    if (on) { const d = document.createElement('div'); d.className = 'ac-msg them typing'; d.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(d); log.scrollTop = log.scrollHeight; }
    this.el.querySelector('.ac-send').disabled = on;
  }

  _meter(v) {
    const m = this.el.querySelector('.ac-meter');
    m.querySelector('i').style.width = `${v}%`;
    m.querySelector('b').textContent = `Convinced: ${v}%`;
  }

  _badge() {
    const b = this.el?.querySelector('.ac-mode');
    if (!b) return;
    b.textContent = this.online ? '🧠 AI' : '💬 offline';
    b.title = this.online ? 'Replies by Claude' : 'The AI server is not set up, so characters use built-in replies';
  }

  // ------------------------------------------------------------------ actions

  // A place by name: points of interest, landmark spots, then street names.
  findPlace(name, near) {
    const g = this.game, d = g.zoneData;
    const q = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (!q || !d) return null;
    const from = near || g.player.pos;
    let best = null, bd = Infinity;
    for (const p of d.pois) {
      const nm = (d.names[p[3]] || '').toLowerCase();
      if (!nm || !(nm.includes(q) || q.includes(nm))) continue;
      const x = p[0] / 10, z = p[1] / 10, dd = Math.hypot(x - from.x, z - from.z);
      if (dd < bd) { bd = dd; best = { x, z, label: d.names[p[3]] }; }
    }
    if (best) return best;
    for (const rd of g.city.roads) {
      if (!rd.name || !rd.name.toLowerCase().includes(q)) continue;
      const pt = rd.pts[Math.floor(rd.pts.length / 2)];
      return { x: pt[0], z: pt[1], label: rd.name };
    }
    return null;
  }

  _act(agent, a) {
    const g = this.game;
    if (!a || a.type === 'none') return;
    if (a.type === 'waypoint') {
      const p = this.findPlace(a.place, agent.npc?.pos);
      if (!p) return;
      const [x, z] = g.quests.openSpot(p.x, p.z, 10);
      this.mark = { x, z, label: p.label, by: agent.name };
      g.hud.toast(`📍 ${agent.name} marked ${p.label} on your map`, 3000);
      g.quests.nextHint();
    } else if (a.type === 'gift') {
      const mem = this._mem(agent.id), day = g.atmo.day?.() ?? new Date().toDateString();
      if (mem.gift === day || !agent.npc) return;
      mem.gift = day;
      g.addCoins(Math.max(5, Math.min(15, a.reward | 0)), g.player.pos);
    } else if (a.type === 'favour' && agent.npc && !g.quests.active) {
      const n = agent.npc;
      let p = this.findPlace(a.place, n.pos);
      if (!p || Math.hypot(p.x - n.pos.x, p.z - n.pos.z) > 450) {
        const d = g.zoneData, opts = d.pois.map((q) => ({ x: q[0] / 10, z: q[1] / 10, label: d.names[q[3]] })).filter((q) => q.label && Math.hypot(q.x - n.pos.x, q.z - n.pos.z) > 50 && Math.hypot(q.x - n.pos.x, q.z - n.pos.z) < 220);
        p = opts.length ? pick(opts) : null;
      }
      if (!p) return;
      const reward = Math.max(10, Math.min(40, a.reward | 0 || 20));
      const mem = this._mem(agent.id);
      if (performance.now() < (mem.favourCd || 0)) return;
      mem.favourCd = performance.now() + 120000;
      setTimeout(() => {
        this.close();
        g.quests.start({
          id: 'favour', title: `Favour for ${agent.name}`, repeat: true, summary: `Go to ${p.label} and come back`,
          async run(q) {
            const [x, z] = q.near(p.x, p.z, 10);
            await q.goto(x, z, { r: 7, text: `${agent.name}'s favour: go to ${p.label}`, time: 180, icon: '🎁', failText: `${agent.name} gave up waiting. Ond nimsha became one hour.` });
            await q.goto(n.pos.x, n.pos.z, { r: 3.5, text: `Go back to ${agent.name}`, time: 180, icon: '💬' });
            n.emote('cheer', 2);
            await q.say(n.id, pick([`Super! You actually did it. Here, take this.`, 'Sakkath! Bengaluru needs more people like you.', 'Thank you, thank you! I owe you a filter coffee.']));
            q.reward({ coins: reward });
            mem.f.push(`Player did a favour for you: went to ${p.label}`);
            mem.f = mem.f.slice(-8);
          },
        });
      }, 1800);
    }
  }

  guide() {
    const m = this.mark;
    if (!m) return null;
    if (Math.hypot(m.x - this.game.player.pos.x, m.z - this.game.player.pos.z) < 8) { this.mark = null; this.game.audio.pickup(); this.game.quests.nextHint(); return null; }
    return { x: m.x, z: m.z, y: 0 };
  }

  markers() {
    const out = [];
    if (this.mark) out.push({ x: this.mark.x, z: this.mark.z, icon: '📍', color: '#e75a7c', size: 16, clamp: true });
    for (const n of this.game.quests.npcs.values()) if (n.def.ai && n.pos.distanceTo(this.game.player.pos) < 110) out.push({ x: n.pos.x, z: n.pos.z, icon: '💬', color: '#3fb3a6', size: 12 });
    return out;
  }

  onNet(peer, type, d) {
    if (type !== 'ai:say') return;
    const n = this.game.quests.npcs.get(String(d.id || ''));
    if (!n || n.pos.distanceTo(this.game.player.pos) > 40) return;
    n.bubble?.remove();
    const b = this.game.labels.add(clean(String(d.text || '')).slice(0, 140), () => n.pos.clone().add(new THREE.Vector3(0, 2.6, 0)), { cls: 'bubble', maxDist: 40 });
    n.bubble = b;
    setTimeout(() => { if (n.bubble === b) { b.remove(); n.bubble = null; } }, 5000);
  }

  update(dt) {
    const g = this.game, now = performance.now();
    for (const n of g.quests.npcs.values()) if (n.def.ai && n.home) this._wander(n, now);
    const c = this.chat;
    if (c?.agent.npc) {
      const n = c.agent.npc;
      n.face(g.player.pos.x, g.player.pos.z);
      if (!c.opts.confront && n.pos.distanceTo(g.player.pos) > 9) this.close();
    }
  }

  // ------------------------------------------------------------------ UI

  _buildUI() {
    const el = document.createElement('div');
    el.id = 'aichat';
    el.className = 'aichat hidden';
    el.innerHTML = `<div class="ac-head"><span class="ac-av"></span><div class="ac-who"><b class="ac-name"></b><small class="ac-title"></small></div><span class="ac-mode"></span><button class="ac-x" title="Close (Esc)">✕</button></div>
      <div class="ac-meter hidden"><b>Convinced: 0%</b><span><i></i></span></div>
      <div class="ac-log"></div>
      <div class="ac-chips"></div>
      <form class="ac-form"><button type="button" class="ac-mic" title="Speak">🎙️</button><input class="ac-in" maxlength="300" placeholder="Say anything…" autocomplete="off"><button type="submit" class="ac-send">➤</button></form>`;
    $('app').appendChild(el);
    this.el = el;
    const input = el.querySelector('.ac-in');
    el.querySelector('.ac-form').addEventListener('submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; this.send(t); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); this.close(); } e.stopPropagation(); });
    el.querySelector('.ac-x').onclick = () => this.close();
    el.querySelector('.ac-chips').addEventListener('click', (e) => {
      const b = e.target.closest('.ac-chip');
      if (!b) return;
      if (b.classList.contains('bye')) { this.send('Bye!'); setTimeout(() => this.close(), 1500); return; }
      this.send(b.textContent);
    });
    const mic = el.querySelector('.ac-mic');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) mic.style.display = 'none';
    mic.onclick = () => {
      if (this.rec) { this.rec.stop(); return; }
      const rec = new SR();
      rec.lang = 'en-IN'; rec.interimResults = true; rec.maxAlternatives = 1;
      this.rec = rec;
      mic.classList.add('live');
      rec.onresult = (e) => { input.value = [...e.results].map((r) => r[0].transcript).join(' '); if (e.results[e.results.length - 1].isFinal) { const t = input.value; input.value = ''; this.send(t); } };
      rec.onend = () => { this.rec = null; mic.classList.remove('live'); };
      rec.onerror = () => { this.rec = null; mic.classList.remove('live'); };
      try { rec.start(); } catch { this.rec = null; mic.classList.remove('live'); }
    };
    ['pointerdown', 'touchstart', 'mousedown', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
  }
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function Look_night(g) { return (g.atmo?.t ?? 0.5) > 0.8 || (g.atmo?.t ?? 0.5) < 0.22; }
