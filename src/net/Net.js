import { MiniMqtt } from './MiniMqtt.js';
import { VKEYS } from '../game/Driving.js';

// Serverless multiplayer over public MQTT brokers (WebSocket). The site is static (Vercel),
// so players meet in topics: peakblr/v1/<zone>/<room>/...
//   p/<id>  retained presence (name, look); cleared by last-will on disconnect
//   s       compact binary state packets (~10 Hz moving, 1 Hz idle)
//   c       chat,  e  events (emotes, mini-games)
// Two brokers are used at once; messages are de-duplicated, so either one can fail.

const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
const ROOT = 'peakblr/v1';
const enc = new TextEncoder(), dec = new TextDecoder();

export const MODES = ['walk', 'ride', 'climb', 'sit', 'glide', 'pillion', 'drive'];
export const EMOTES = ['', 'wave', 'namaste', 'wobble', 'dance', 'cheer', 'facepalm', 'laugh', 'point', 'shrug', 'phone', 'typing', 'sit', 'aim', 'punch'];

const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigg', 'fag', 'rape', 'slut', 'whore', 'bastard', 'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'chutiye', 'gandu', 'randi', 'bosadi', 'bsdk', 'lavde', 'lund', 'soole', 'bolimaga', 'boli maga', 'tunne', 'tullu', 'harami'];
const BAD_RE = BAD.map((w) => new RegExp((w.length <= 4 ? String.raw`\b` : '') + w.replace(/ /g, String.raw`\s*`), 'gi'));
export function clean(text) {
  let t = String(text).replace(/[\u0000-\u001f<>]/g, '').slice(0, 80);
  for (const re of BAD_RE) t = t.replace(re, (m) => '*'.repeat(m.length));
  return t;
}

const COLOR = /^#[0-9a-f]{6}$/i;
export function safeLook(l) {
  if (!l || typeof l !== 'object') return {};
  const out = {};
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'shoes']) if (COLOR.test(l[k])) out[k] = l[k];
  for (const k of ['hairStyle', 'shirtStyle']) if (typeof l[k] === 'string' && /^[a-z]{2,12}$/.test(l[k])) out[k] = l[k];
  if (Array.isArray(l.extras)) out.extras = l.extras.filter((e) => typeof e === 'string' && /^[a-zA-Z]{2,16}$/.test(e)).slice(0, 6);
  const h = +l.height; if (h > 0.85 && h < 1.15) out.height = h;
  const b = +l.build; if (b > 0.85 && b < 1.2) out.build = b;
  const t = +l.title; if (Number.isInteger(t) && t > 0 && t < 40) out.title = t;
  return out;
}

export function makeId() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export class Net {
  constructor({ id, name, look, zone, room }) {
    this.id = id;
    this.name = name;
    this.look = look;
    this.zone = zone;
    this.room = (room || 'public').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 12) || 'public';
    this.base = `${ROOT}/${zone}/${this.room}`;
    this.clients = [];
    this.peers = new Map();
    this.seenMsg = new Set();
    this.seq = 0;
    this.msgN = 0;
    this.lastChat = 0;
    this.on = { join: null, leave: null, state: null, chat: null, event: null, status: null, booth: null };
    this.connected = false;
  }

  async connect() {
    const will = { topic: `${this.base}/p/${this.id}`, payload: '', retain: true };
    const tries = BROKERS.map(async (url) => {
      const c = new MiniMqtt(url, { clientId: `pb-${this.id}-${Math.random().toString(36).slice(2, 6)}`, keepalive: 20, will });
      await c.connect(9000);
      c.onMessage((t, p, r) => this._onMessage(t, p, r));
      for (const s of ['p/+', 's', 'c', 'e', 'booth/+']) c.subscribe(`${this.base}/${s}`);
      c.onclose = () => { this.clients = this.clients.filter((x) => x !== c); this._status(); setTimeout(() => this._reconnect(url), 3000); };
      this.clients.push(c);
      this._status();
      return c;
    });
    try {
      await Promise.any(tries);
    } catch {
      this._status();
      return false;
    }
    this.connected = true;
    this._announce();
    this._presenceTimer = setInterval(() => this._announce(), 15000);
    this._sweepTimer = setInterval(() => this._sweep(), 2000);
    return true;
  }

  async _reconnect(url) {
    if (this.closed || this.clients.some((c) => c.url === url)) return;
    try {
      const c = new MiniMqtt(url, { clientId: `pb-${this.id}-${Math.random().toString(36).slice(2, 6)}`, keepalive: 20, will: { topic: `${this.base}/p/${this.id}`, payload: '', retain: true } });
      await c.connect(9000);
      c.onMessage((t, p, r) => this._onMessage(t, p, r));
      for (const s of ['p/+', 's', 'c', 'e', 'booth/+']) c.subscribe(`${this.base}/${s}`);
      c.onclose = () => { this.clients = this.clients.filter((x) => x !== c); this._status(); setTimeout(() => this._reconnect(url), 5000); };
      this.clients.push(c);
      this._announce();
      this._status();
    } catch { setTimeout(() => this._reconnect(url), 10000); }
  }

  _status() { this.on.status?.(this.clients.length); }

  _pub(sub, payload, retain = false) {
    for (const c of this.clients) c.publish(`${this.base}/${sub}`, payload, retain);
  }

  _announce() {
    this._pub(`p/${this.id}`, JSON.stringify({ id: this.id, name: this.name, look: this.look, t: Date.now() }), true);
  }

  // Meetup Hall booths: retained, so they stay up for everyone who comes later.
  booth(n, data) { this._pub(`booth/${n}`, data ? JSON.stringify(data) : '', true); }

  updateProfile(name, look) { this.name = name; this.look = look; this._announce(); }

  // st: { x, y, z, yaw, mode, emote, speed, lean }
  sendState(st) {
    if (!this.clients.length) return;
    const b = new ArrayBuffer(32), v = new DataView(b);
    v.setUint8(0, 1);
    for (let i = 0; i < 8; i++) v.setUint8(1 + i, this.id.charCodeAt(i) || 0);
    v.setFloat32(9, st.x, true); v.setFloat32(13, st.y, true); v.setFloat32(17, st.z, true);
    v.setInt16(21, Math.round((st.yaw % (Math.PI * 2)) * 5000), true);
    v.setUint8(23, Math.max(0, MODES.indexOf(st.mode)));
    v.setUint8(24, Math.max(0, EMOTES.indexOf(st.emote || '')));
    v.setUint8(25, Math.min(255, Math.round((st.speed || 0) * 8)));
    v.setInt8(26, Math.round((st.lean || 0) * 100));
    v.setUint16(27, (this.seq = (this.seq + 1) & 0xffff), true);
    v.setUint8(29, st.flags || 0);
    v.setUint8(30, st.veh ? VKEYS.indexOf(st.veh) + 1 : 0);
    v.setUint8(31, Math.max(0, Math.min(255, Math.round(st.hp ?? 255))));
    this._pub('s', new Uint8Array(b));
  }

  chat(text) {
    const now = Date.now();
    if (now - this.lastChat < 900) return null;
    this.lastChat = now;
    const t = clean(text).trim();
    if (!t) return null;
    const mid = `${this.id}:${++this.msgN}`;
    this._pub('c', JSON.stringify({ m: mid, id: this.id, n: this.name, t }));
    return t;
  }

  event(type, data = {}) {
    const mid = `${this.id}:${++this.msgN}`;
    this._pub('e', JSON.stringify({ m: mid, id: this.id, type, data, ts: Date.now() }));
  }

  // The lowest id among everyone here coordinates shared games.
  isHost() {
    for (const id of this.peers.keys()) if (id < this.id) return false;
    return true;
  }

  _dupe(mid) {
    if (this.seenMsg.has(mid)) return true;
    this.seenMsg.add(mid);
    if (this.seenMsg.size > 500) this.seenMsg = new Set([...this.seenMsg].slice(-250));
    return false;
  }

  _peer(id) {
    let p = this.peers.get(id);
    if (!p) {
      p = { id, name: 'Guest', look: {}, seq: -1, lastSeen: performance.now(), known: false };
      this.peers.set(id, p);
    }
    return p;
  }

  _onMessage(topic, payload, retained) {
    const sub = topic.slice(this.base.length + 1);
    if (sub === 's') {
      if (payload.length < 30) return;
      const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      let id = '';
      for (let i = 0; i < 8; i++) id += String.fromCharCode(v.getUint8(1 + i));
      if (id === this.id) return;
      const seq = v.getUint16(27, true);
      const p = this._peer(id);
      const d = (seq - p.seq + 65536) & 0xffff;
      if (p.seq >= 0 && (d === 0 || d > 30000)) return; // duplicate (other broker) or stale
      p.seq = seq;
      p.lastSeen = performance.now();
      const st = {
        x: v.getFloat32(9, true), y: v.getFloat32(13, true), z: v.getFloat32(17, true),
        yaw: v.getInt16(21, true) / 5000, mode: MODES[v.getUint8(23)] || 'walk', emote: EMOTES[v.getUint8(24)] || '',
        speed: v.getUint8(25) / 8, lean: v.getInt8(26) / 100, flags: v.getUint8(29),
        veh: payload.length >= 32 ? VKEYS[v.getUint8(30) - 1] || null : null, hp: payload.length >= 32 ? v.getUint8(31) : 255,
      };
      if (!Number.isFinite(st.x) || !Number.isFinite(st.z)) return;
      if (!p.known) { p.known = true; this.on.join?.(p); }
      this.on.state?.(p, st);
      return;
    }
    if (sub.startsWith('booth/')) {
      const n = parseInt(sub.slice(6), 10);
      if (!(n >= 0 && n < 12)) return;
      let m = null;
      if (payload.length) { try { m = JSON.parse(dec.decode(payload)); } catch { return; } }
      this.on.booth?.(n, m);
      return;
    }
    if (sub.startsWith('p/')) {
      const id = sub.slice(2);
      if (id === this.id) return;
      if (!payload.length) { this._leave(id); return; }
      let m;
      try { m = JSON.parse(dec.decode(payload)); } catch { return; }
      if (!m || Date.now() - (m.t || 0) > 120000) return;
      const p = this._peer(id);
      p.name = clean(m.name || 'Guest').slice(0, 16) || 'Guest';
      p.look = safeLook(m.look);
      p.lastSeen = Math.max(p.lastSeen, performance.now() - (retained ? 8000 : 0));
      if (!p.known) { p.known = true; this.on.join?.(p); } else this.on.update?.(p);
      return;
    }
    let m;
    try { m = JSON.parse(dec.decode(payload)); } catch { return; }
    if (!m || m.id === this.id || !m.m || this._dupe(m.m)) return;
    const p = this.peers.get(m.id);
    if (sub === 'c') this.on.chat?.(p || { id: m.id, name: clean(m.n || 'Guest') }, clean(m.t || ''));
    else if (sub === 'e') this.on.event?.(p || this._peer(m.id), m.type, m.data || {}, m.ts);
  }

  _leave(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    if (p.known) this.on.leave?.(p);
  }

  _sweep() {
    const now = performance.now();
    for (const [id, p] of this.peers) if (now - p.lastSeen > 14000) this._leave(id);
  }

  close() {
    this.closed = true;
    clearInterval(this._presenceTimer); clearInterval(this._sweepTimer);
    this._pub(`p/${this.id}`, '', true);
    for (const c of this.clients) { c.onclose = null; c.close(); }
    this.clients = [];
    this.peers.clear();
  }
}

// Weekly leaderboards: one retained message per player per board per week.
//   peakblr/v1/lb/<board>/<week>/<id>  { n: name, s: score, z: zone, t }
const LB_MAX = { quiz: 1400, dance: 60000, chor: 110, blasters: 99 };

async function quickClient(timeout = 5000) {
  for (const u of BROKERS) {
    try { return await new MiniMqtt(u, { clientId: 'pb-lb-' + Math.random().toString(36).slice(2, 8) }).connect(timeout); } catch {}
  }
  throw new Error('no broker');
}

export async function postBoard(board, week, id, entry) {
  if (!LB_MAX[board] || !(entry.s >= 0) || entry.s > LB_MAX[board]) return;
  const payload = JSON.stringify({ ...entry, n: clean(entry.n || 'Guest').slice(0, 16) });
  const all = await Promise.allSettled(BROKERS.map((u) => new MiniMqtt(u, { clientId: 'pb-lbp-' + Math.random().toString(36).slice(2, 8) }).connect(5000)));
  for (const r of all) {
    if (r.status !== 'fulfilled') continue;
    r.value.publish(`${ROOT}/lb/${board}/${week}/${id}`, payload, true);
    setTimeout(() => r.value.close(), 800);
  }
}

export async function fetchBoard(board, week, wait = 1600) {
  const c = await quickClient();
  const rows = new Map();
  c.onMessage((topic, payload) => {
    if (!payload.length) return;
    const id = topic.split('/').pop();
    try {
      const m = JSON.parse(dec.decode(payload));
      const s = Math.round(+m.s);
      if (!(s >= 0) || s > (LB_MAX[board] || 1e9)) return;
      rows.set(id, { id, n: clean(m.n || 'Guest').slice(0, 16), s, z: String(m.z || '').replace(/[^a-z]/g, '').slice(0, 14) });
    } catch {}
  });
  c.subscribe(`${ROOT}/lb/${board}/${week}/+`);
  await new Promise((r) => setTimeout(r, wait));
  c.close();
  return [...rows.values()].sort((a, b) => b.s - a.s);
}

// The meetup calendar: retained entries at peakblr/v1/meetups/<id>, visible from every district.
export async function listMeetups(wait = 1500) {
  const c = await quickClient();
  const out = new Map();
  c.onMessage((topic, payload) => {
    if (!payload.length) return;
    const id = topic.split('/').pop();
    try {
      const m = JSON.parse(dec.decode(payload));
      const at = +m.at, dur = Math.min(240, Math.max(15, +m.dur || 60));
      if (!(at > 0) || at + dur * 60000 < Date.now() || at > Date.now() + 30 * 86400000) return;
      out.set(id, {
        id, at, dur, title: clean(m.title || '').slice(0, 60), desc: clean(m.desc || '').slice(0, 200),
        host: String(m.host || '').slice(0, 8), hostName: clean(m.hostName || 'Someone').slice(0, 16),
        zone: String(m.zone || 'central').replace(/[^a-z]/g, '').slice(0, 14), room: String(m.room || 'public').replace(/[^a-z0-9-]/g, '').slice(0, 12) || 'public',
      });
    } catch {}
  });
  c.subscribe(`${ROOT}/meetups/+`);
  await new Promise((r) => setTimeout(r, wait));
  c.close();
  return [...out.values()].filter((m) => m.title).sort((a, b) => a.at - b.at);
}

export async function postMeetup(id, m) {
  const all = await Promise.allSettled(BROKERS.map((u) => new MiniMqtt(u, { clientId: 'pb-mu-' + Math.random().toString(36).slice(2, 8) }).connect(5000)));
  let ok = false;
  for (const r of all) {
    if (r.status !== 'fulfilled') continue;
    r.value.publish(`${ROOT}/meetups/${id}`, m ? JSON.stringify(m) : '', true);
    ok = true;
    setTimeout(() => r.value.close(), 800);
  }
  return ok;
}

// Peek at how many people are in each zone (for the title screen and metro map).
export async function lobbyCounts(timeout = 2500) {
  const counts = {};
  const seen = new Set();
  const conns = await Promise.allSettled(BROKERS.map((u) => new MiniMqtt(u, { clientId: 'pb-peek-' + Math.random().toString(36).slice(2, 8) }).connect(5000)));
  for (const r of conns) {
    if (r.status !== 'fulfilled') continue;
    const c = r.value;
    c.onMessage((topic, payload) => {
      if (!payload.length) return;
      const parts = topic.split('/');
      const zone = parts[2], id = parts[5];
      if (seen.has(id)) return;
      try { const m = JSON.parse(dec.decode(payload)); if (Date.now() - (m.t || 0) > 90000) return; } catch { return; }
      seen.add(id);
      counts[zone] = (counts[zone] || 0) + 1;
    });
    c.subscribe(`${ROOT}/+/+/p/+`);
  }
  await new Promise((r) => setTimeout(r, timeout));
  for (const r of conns) if (r.status === 'fulfilled') r.value.close();
  return counts;
}
