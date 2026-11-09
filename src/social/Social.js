import * as THREE from 'three';
import { Venue } from './Venue.js';
import { Hall } from './Hall.js';
import { Quiz, DanceOff, ChorPolice } from './PartyGames.js';
import { Blasters } from './Blasters.js';
import { SHOP, TITLES, EARNED } from '../data/cosmetics.js';
import { Avatar, randomLook } from '../actors/Avatar.js';
import { fetchBoard, postBoard } from '../net/Net.js';

// The district hangout and everything social around it: Namma Club (DJ, dance floor, club music),
// party games on a shared schedule (or started any time by Meetup Mamta), weekly leaderboards,
// a boutique for looks and titles, and filter kaapi that makes you run faster.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const KINDS = {
  quiz: { name: 'Namma Quiz Night', icon: '🧠', cls: Quiz, len: 8 * 16 + 10, late: 70, bots: true, blurb: '8 questions about Bengaluru. Fastest right answers win.' },
  dance: { name: 'Dance-off', icon: '🕺', cls: DanceOff, len: 44, late: 3, bots: true, blurb: 'Hit the arrows on the beat. Combos score big.' },
  chor: { name: 'Chor-Police', icon: '🚨', cls: ChorPolice, len: 106, late: 70, blurb: 'Police catches a chor and you swap. Stay free the longest!' },
  blasters: { name: 'Bengaluru Blasters', icon: '💥', cls: Blasters, len: 156, late: 100, blurb: 'Sci-fi blaster battle around Namma Club. Most knock-outs wins.' },
};
export const BOARD_NAMES = { quiz: '🧠 Quiz', dance: '🕺 Dance-off', chor: '🚨 Chor-Police', blasters: '💥 Blasters' };
const ROTATION = ['quiz', 'dance', 'chor', 'blasters', 'dance', 'quiz', 'chor', 'blasters'];
const SLOT = 4 * 60 * 1000;      // a meetup every 4 minutes on everyone's clock
const LEAD = 45000;              // shown 45 s before it starts
const BEAT_MS = 60000 / 118;
const BOT_NAMES = ['Benne Bhaskar', 'Kaapi Kavya', 'Idli Ishaan', 'Ragi Raghu', 'Gully Gopal', 'Namma Neha'];

export const weekNo = () => Math.floor((Date.now() / 86400000 + 3) / 7);
const zhash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export class Social {
  constructor(game) {
    this.game = game;
    this.invites = new Map();     // sid -> event
    this.rosters = new Map();     // sid -> Map(id -> name)
    this.dismissed = new Set();
    this.joined = null;
    this.cur = null;
    this.freeze = false;
    this.noRide = false;
    this.boostUntil = 0;
    this.dropT = 0;
    this.banner = document.createElement('div');
    this.banner.id = 'meetup';
    this.banner.className = 'hidden';
    $('hud').appendChild(this.banner);
    this.banner.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      e.stopPropagation();
      const ev = this._bannerEv;
      if (a === 'join' && ev) this.join(ev);
      if (a === 'leave') this.leave();
      if (a === 'go') this.takeMeThere();
      if (a === 'x' && ev) { this.dismissed.add(ev.sid); this._renderBanner(true); }
    });
    this.bannerT = 0;
  }

  static register(kind, def) { KINDS[kind] = def; }

  // ------------------------------------------------------------------ zone lifecycle

  // After the city is built and before the signs are painted.
  build(city, zone) {
    this.zone = zone;
    this.venue = new Venue(this.game, zone);
    city.customSigns.push(...this.venue.signs);
    city.trees?.clearAround?.(this.venue.pos.x, this.venue.pos.z, 26);
    city.spots.club = [this.venue.pos.x, this.venue.pos.z];
    this.game.ren.scene.add(this.venue.object);
    try {
      this.hall = new Hall(this, city, zone, this.venue.pos);
      city.customSigns.push(...this.hall.signs);
      city.trees?.clearAround?.(this.hall.pos.x, this.hall.pos.z, 30);
      city.spots.hall = [this.hall.pos.x, this.hall.pos.z];
      this.game.ren.scene.add(this.hall.object);
    } catch (e) { console.error('hall', e); this.hall = null; }
  }

  // After the story NPCs are placed.
  spawn() {
    const g = this.game, V = this.venue.spots, [cx, cz] = V.floor;
    const facing = (p) => Math.atan2(cx - p[0], cz - p[1]);
    const npc = (id, at, def) => {
      const n = g.quests.addNpc({ id, social: true, x: at[0], z: at[1], yaw: facing(at), voice: id, ...def });
      n.baseYaw = facing(at);
      return n;
    };
    const L = (seed, o) => ({ ...randomLook(seed), ...o });
    const board = [V.board[0] + (cx - V.board[0]) * 0.12, V.board[1] + (cz - V.board[1]) * 0.12];
    this.mamta = npc('mamta', board, {
      name: 'Meetup Mamta', title: 'Runs the meetups', color: '#e75a7c', pitch: 1.1,
      look: L(41, { shirt: '#e75a7c', extras: ['saree', 'bindi', 'mallige'], hairStyle: 'bun' }),
      chatter: ['Quiz night, dance-off, chor-police. Something is always on here!', 'Bring your friends, macha. More people, more fun.'],
      onTalk: (q) => this._talkMamta(q),
    });
    this.mamta.setMarker('activity');
    npc('dj', V.dj, {
      name: 'DJ Dinesh', title: 'Namma Club', color: '#8e5bb5', pitch: 0.95, pose: 'dance',
      look: L(52, { shirt: '#2b2b30', extras: ['headphones', 'shades', 'goldchain'], hairStyle: 'spiky' }),
      chatter: ['Ee beat, macha! Feel it!', 'Next track is a banger, trust me.', 'Who wants a drop?'],
      onTalk: (q) => this._talkDj(q),
    });
    npc('quizmaster', V.quiz, {
      name: 'Quizmaster Krishna', title: 'Namma Quiz', color: '#1f4e8c', pitch: 1,
      look: L(63, { shirt: '#f4f1ea', shirtStyle: 'kurta', extras: ['glasses'], hairStyle: 'short' }),
      chatter: ['Which lake makes foam? Easy one. Tonight\'s questions are harder.', 'Fastest fingers in Bengaluru, step up!'],
      onTalk: (q) => this._talkQuiz(q),
    });
    npc('kaapi', V.chai, {
      name: 'Kaapi Kumar', title: 'Filter coffee', color: '#8a5a34', pitch: 0.9,
      look: L(74, { shirt: '#f7f3e8', extras: ['veshti', 'mustache'] }),
      chatter: ['Strong filter kaapi! Wakes up even Silk Board traffic.', 'Kaapi, saar? Ten coins only.'],
      onTalk: (q) => this._talkKaapi(q),
    });
    npc('bhavana', V.shop, {
      name: 'Boutique Bhavana', title: 'Looks and titles', color: '#b388eb', pitch: 1.15,
      look: L(85, { shirt: '#b388eb', extras: ['goldchain', 'shades'], hairStyle: 'long' }),
      chatter: ['New shades just arrived from Commercial Street!', 'Look sharp at the club, darling.'],
      onTalk: (q) => this._talkShop(q),
    });
    // a few people already dancing on the floor
    this.dancers = [];
    for (let i = 0; i < 5; i++) {
      const av = new Avatar(randomLook(900 + i * 37 + zhash(this.zone) % 97));
      const a = (i / 5) * Math.PI * 2 + 0.4, r = 2.2 + (i % 2) * 2.3;
      av.object.position.set(cx + Math.cos(a) * r, 0.3, cz + Math.sin(a) * r);
      av.object.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)) + (i % 2 ? 0.6 : -0.4);
      av.play('dance', 1e9);
      av.t = i * 0.37;
      g.ren.scene.add(av.object);
      this.dancers.push(av);
    }
  }

  unload() {
    this.cur?.dispose();
    this.cur = null;
    this.joined = null;
    this.invites.clear(); this.rosters.clear();
    for (const av of this.dancers || []) { this.game.ren.scene.remove(av.object); av.dispose(); }
    this.dancers = [];
    if (this.venue) this.game.ren.scene.remove(this.venue.object);
    this.venue = null;
    if (this.hall) { this.hall.dispose(); this.game.ren.scene.remove(this.hall.object); this.hall = null; }
    this.want = null; this._wantText = null;
    this.banner.classList.add('hidden');
    this.game.audio.setClub?.(0);
  }

  // ------------------------------------------------------------------ events

  now() { return Date.now(); }

  _scheduled(k) {
    const kind = ROTATION[((k % ROTATION.length) + ROTATION.length) % ROTATION.length];
    if (!KINDS[kind]) return null;
    return { sid: `s${k}`, kind, seed: (Math.imul(k, 2654435761) ^ zhash(this.zone)) >>> 0, start: k * SLOT, sched: true };
  }

  // The meetup you can join right now (or the one coming up), if any.
  upcoming() {
    if (!this.venue) return null;
    const now = this.now(), list = [];
    // the shared schedule only shows when there are people around to play with, or you're at the club
    if (this.game.profile.online && this.game.net && (this.game.remotes.size || this.venue.near(this.game.player.pos, 150))) {
      const k = Math.floor(now / SLOT);
      for (const kk of [k, k + 1]) { const e = this._scheduled(kk); if (e) list.push(e); }
    }
    list.push(...this.invites.values());
    let best = null;
    for (const e of list) {
      const def = KINDS[e.kind];
      if (!def) continue;
      if (now > e.start + def.late * 1000 || now < e.start - (e.sched ? LEAD : 90000)) continue;
      if (!best || e.start < best.start) best = e;
    }
    return best;
  }

  joinedEvent() {
    if (!this.joined) return null;
    if (this.invites.has(this.joined)) return this.invites.get(this.joined);
    if (this.joined.startsWith('s')) return this._scheduled(+this.joined.slice(1));
    return null;
  }

  _roster(sid) { let r = this.rosters.get(sid); if (!r) { r = new Map(); this.rosters.set(sid, r); } return r; }

  join(ev) {
    const g = this.game;
    if (g.quests.active) { g.hud.toast('Finish your mission first, then join the fun!', 3000); return; }
    if (this.cur) return;
    this.joined = ev.sid;
    if (!ev.sched) this.invites.set(ev.sid, ev);
    this._roster(ev.sid).set(g.profile.id, g.profile.name);
    g.net?.event('party:join', { sid: ev.sid, kind: ev.kind, seed: ev.seed, start: ev.start, sched: !!ev.sched });
    g.audio.pickup();
    const d = this.venue.pos.distanceTo(g.player.pos);
    g.hud.toast(`You're in: ${KINDS[ev.kind].name}! ${d > 40 && ev.kind !== 'quiz' ? 'Head to Namma Club (follow the ▼).' : ''}`, 3500);
    this._renderBanner(true);
  }

  leave() {
    if (!this.joined) return;
    this.game.net?.event('party:leave', { sid: this.joined });
    this._roster(this.joined).delete(this.game.profile.id);
    this.dismissed.add(this.joined);
    const inv = this.invites.get(this.joined);
    if (inv && inv.host === this.game.profile.id && !this._roster(this.joined).size) this.invites.delete(this.joined);
    if (this.cur) { this.cur.dispose(); this.cur = null; }
    this.joined = null;
    this._renderBanner(true);
  }

  // Start a game now (from Mamta / Quizmaster). Others in the district get an invite.
  host(kind) {
    const g = this.game;
    const up = this.upcoming();
    if (up && up.kind === kind && up.start > this.now() + 3000 && this.joined !== up.sid) { this.join(up); return; }
    if (this.joined) this.leave();
    const start = Math.ceil((this.now() + (g.remotes.size ? 20000 : 6000)) / BEAT_MS) * BEAT_MS;
    const ev = { sid: `${g.profile.id}${(Date.now() % 1e7).toString(36)}`, kind, seed: (Math.random() * 4294967295) >>> 0, start: Math.round(start), host: g.profile.id };
    this.invites.set(ev.sid, ev);
    g.net?.event('party:inv', ev);
    this.join(ev);
    if (g.remotes.size) g.hud.chat(null, `You started ${KINDS[kind].name}. Everyone in ${g.zoneId} got an invite!`, true);
  }

  onNet(peer, type, d) {
    const now = this.now();
    if (/^(stage|hall):/.test(type)) { this.hall?.onNet(peer, type, d); return; }
    if (type === 'party:inv' || type === 'party:join') {
      if (!d || !KINDS[d.kind] || typeof d.sid !== 'string' || d.sid.length > 24 || !(Math.abs(d.start - now) < 180000)) return;
      if (!d.sched && !this.invites.has(d.sid)) {
        this.invites.set(d.sid, { sid: d.sid, kind: d.kind, seed: d.seed >>> 0, start: +d.start, host: peer.id });
        if (type === 'party:inv') {
          this.game.hud.chat(null, `🎉 ${peer.name} started ${KINDS[d.kind].name} at Namma Club. Join from the banner!`, true);
          this.game.audio.chat();
          this.dismissed.delete(d.sid);
        }
      }
      this._roster(d.sid).set(peer.id, peer.name);
      return;
    }
    if (type === 'party:leave') { this.rosters.get(d.sid)?.delete(peer.id); return; }
    if (type === 'party:go') { if (this.joined === d.sid && !this.cur) this._launch(d); return; }
    if (type === 'club:drop') { this._drop(peer.name); return; }
    if (type === 'kaapi:round') {
      if (this.venue && this.venue.near(this.game.player.pos, 70)) { this._buff(60); this.game.hud.toast(`☕ ${peer.name} bought everyone filter kaapi! Run faster for a minute.`, 4000); }
      return;
    }
    this.cur?.onNet?.(peer, type, d);
  }

  _humans(sid) {
    const me = this.game.profile.id;
    const ids = [...this._roster(sid).keys()].filter((id) => id === me || this.game.remotes.has(id));
    if (!ids.includes(me)) ids.push(me);
    return ids.sort();
  }

  _launch(go) {
    const ev = this.joinedEvent();
    if (!ev || this.cur) return;
    const def = KINDS[ev.kind];
    const inv = { ...ev, ...go, sid: ev.sid, start: ev.start };
    const humans = (inv.players || this._humans(ev.sid)).filter((id) => id !== 'bot');
    if (def.bots && humans.length < 3) {
      inv.bots = [];
      for (let i = 0; i < 3 - humans.length; i++) {
        inv.bots.push({ id: 'bot' + i, i, name: BOT_NAMES[(ev.seed + i * 3) % BOT_NAMES.length] + ' 🤖', skill: 0.45 + ((ev.seed >>> (i * 4)) % 10) / 30 });
      }
    }
    this.cur = new def.cls(this, inv);
    this.cur.result.then((res) => {
      if (this.cur && this.cur.sid === ev.sid) this.cur = null;
      if (this.joined === ev.sid) this.joined = null;
      if (res && res.rank === 1) this.earnTitle(ev.kind);
    });
  }

  // The lowest id in the roster sends the final player list (and roles) a few seconds before the start.
  _tickLaunch() {
    const ev = this.joinedEvent();
    if (!ev || this.cur) return;
    const now = this.now();
    if (now < ev.start - 4000) return;
    const def = KINDS[ev.kind];
    if (now > ev.start + def.late * 1000) { this.joined = null; return; }
    const humans = this._humans(ev.sid);
    const lead = humans[0] === this.game.profile.id;
    if (lead || now > ev.start - 2200) {
      const go = { sid: ev.sid, players: humans };
      if (ev.kind === 'chor' || ev.kind === 'blasters') {
        if (humans.length < 2 && ev.kind === 'chor') { go.players = [...humans, 'bot']; go.bot = true; go.police = 'bot'; }
        else go.police = humans[ev.seed % humans.length];
      }
      if (lead && now < ev.start) this.game.net?.event('party:go', go);
      this._launch(go);
    }
  }

  // ------------------------------------------------------------------ the NPCs

  async _talkMamta(q) {
    const up = this.upcoming();
    const opts = [], acts = [];
    if (up && this.joined !== up.sid) { opts.push(`✅ Join ${KINDS[up.kind].name}`); acts.push(() => this.join(up)); }
    if (!up || up.start - this.now() > 75000) {
      for (const k of ['quiz', 'dance', 'chor', 'blasters']) if (KINDS[k]) { opts.push(`${KINDS[k].icon} Start ${KINDS[k].name} now`); acts.push(() => this.host(k)); }
    }
    opts.push('🏆 This week\'s leaderboards'); acts.push(() => this.openBoards());
    if (this.hall) { opts.push('📅 Meetup calendar (talks, demos)'); acts.push(() => this.hall.openCalendar()); }
    opts.push('Just saying hi'); acts.push(null);
    const text = up && this.joined !== up.sid ? 'A meetup is about to start! Want in?' : 'Namaskara! I run the meetups here. Quiz nights, dance-offs, chor-police and blaster battles. What shall we do?';
    const i = await q.choose('mamta', text, opts, '', opts.length - 1);
    q.done();
    acts[i]?.();
  }

  async _talkDj(q) {
    const i = await q.choose('dj', 'Namaskara, I\'m DJ Dinesh! Want me to drop the bass? Everyone dancing on the floor gets a bonus.', ['🔥 Drop it!', '🕺 Start a dance-off', 'Later, macha'], '', 2);
    q.done();
    if (i === 0) {
      if (performance.now() < (this.dropCd || 0)) { this.game.hud.toast('DJ Dinesh: "One drop at a time, macha. Wait a bit!"', 2500); return; }
      this.dropCd = performance.now() + 40000;
      this.game.net?.event('club:drop', {});
      this._drop(this.game.profile.name);
    }
    if (i === 1) this.host('dance');
  }

  async _talkQuiz(q) {
    const i = await q.choose('quizmaster', 'Fancy a quiz? Eight questions on Namma Bengaluru. Faster answers score more.', ['🧠 Start a quiz now', '🏆 Leaderboards', 'Later'], '', 2);
    q.done();
    if (i === 0) this.host('quiz');
    if (i === 1) this.openBoards('quiz');
  }

  async _talkKaapi(q) {
    const g = this.game;
    const i = await q.choose('kaapi', 'Filter kaapi, saar! Ten coins. Strong enough to make you run thirty percent faster.', ['☕ One kaapi (10 🪙)', '☕ A round for everyone here (30 🪙)', 'No thanks'], '', 2);
    q.done();
    if (i === 2) return;
    const cost = i === 0 ? 10 : 30;
    if ((g.profile.coins || 0) < cost) { g.hud.toast('Not enough coins! Do missions and games to earn some.', 3000); return; }
    g.addCoins(-cost);
    this._buff(60);
    g.player.avatar.play('cheer', 1.5);
    if (i === 1) { g.net?.event('kaapi:round', {}); g.hud.toast('☕ You bought a round for everyone at the club! Big heart, macha.', 3500); }
    else g.hud.toast('☕ Kaapi power! You run 30% faster for 60 seconds.', 3000);
  }

  async _talkShop(q) {
    const i = await q.choose('bhavana', 'Welcome to Bhavana\'s Boutique! Shades, jasmine, gold chains, and titles everyone can see.', ['🛍️ Show me', 'Later'], '', 1);
    q.done();
    if (i === 0) this.openShop();
  }

  _buff(sec) { this.boostUntil = Math.max(this.boostUntil, performance.now()) + sec * 1000; this.game.fx.pop(this.game.player.pos, '☕ KAAPI POWER!'); }

  _drop(by) {
    const g = this.game;
    if (!this.venue) return;
    this.dropT = 8;
    const [cx, cz] = this.venue.spots.floor;
    const at = new THREE.Vector3(cx, 1, cz);
    g.fx.confetti(at, 200);
    g.audio.clubDrop?.();
    if (this.venue.near(g.player.pos, 60)) g.hud.big('DROP! 🔥', `${by} asked DJ Dinesh for a drop`, 1800);
    for (const av of this.dancers) av.play('cheer', 2);
    setTimeout(() => { for (const av of this.dancers) av.play('dance', 1e9); }, 2000);
    // dancing on the floor during a drop pays
    this._dropCheck = 8;
  }

  earnTitle(kind) {
    const idx = EARNED[kind];
    if (!idx) return;
    const P = this.game.profile;
    P.titles = P.titles || [];
    if (P.titles.includes(idx)) return;
    P.titles.push(idx);
    this.game.saveProfile();
    setTimeout(() => this.game.hud.toast(`🏷️ New title: “${TITLES[idx]}”! Wear it from Boutique Bhavana or Change look.`, 5000), 7500);
  }

  // ------------------------------------------------------------------ leaderboards

  postScore(board, score) {
    const g = this.game, P = g.profile, w = weekNo();
    score = Math.round(score);
    P.best = P.best || {};
    const b = P.best[board];
    if (b && b.w === w && b.s >= score) return;
    P.best[board] = { w, s: score };
    g.saveProfile();
    if (P.online !== false) postBoard(board, w, P.id, { n: P.name, s: score, z: this.zone, t: Date.now() }).catch(() => {});
    if (!b || b.w !== w || score > b.s) setTimeout(() => g.hud.toast(`🏆 New personal best this week: ${score}!`, 3000), 7600);
  }

  async openBoards(tab = 'quiz') {
    const g = this.game;
    let el = $('boards');
    if (!el) {
      el = document.createElement('div');
      el.id = 'boards'; el.className = 'screen';
      document.getElementById('app').appendChild(el);
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]')?.dataset.tab;
        if (t) this.openBoards(t);
        if (e.target.closest('[data-close]')) this.closeBoards();
      });
    }
    el.classList.remove('hidden');
    if (g.state === 'play') { this._prevState = 'play'; g.state = 'paused'; }
    const tabs = Object.entries(BOARD_NAMES).map(([k, n]) => `<button data-tab="${k}" class="opt${k === tab ? ' on' : ''}">${n}</button>`).join('');
    const mine = g.profile.best?.[tab];
    el.innerHTML = `<div class="menu-card wide"><h2>🏆 This week's best</h2><div class="look-row">${tabs}</div><div class="lb-list">Loading…</div>
      <div class="credits">Your best this week: <b>${mine && mine.w === weekNo() ? mine.s : '—'}</b>. Boards reset every Monday.</div>
      <div class="menu-buttons"><button class="menu-btn primary" data-close>Close</button></div></div>`;
    const rows = await fetchBoard(tab, weekNo()).catch(() => null);
    if (el.classList.contains('hidden') || !el.querySelector(`[data-tab="${tab}"].on`)) return;
    const list = el.querySelector('.lb-list');
    if (!rows) { list.textContent = 'Could not reach the leaderboard servers.'; return; }
    if (!rows.length) { list.textContent = 'Nobody yet this week. Be the first!'; return; }
    list.innerHTML = rows.slice(0, 15).map((r, i) => `<div class="pg-row${r.id === g.profile.id ? ' me' : ''}"><b>${['🥇', '🥈', '🥉'][i] || i + 1}</b><span>${esc(r.n)}</span><em>${esc(r.z || '')}</em><i>${r.s}</i></div>`).join('');
  }

  closeBoards() {
    $('boards')?.classList.add('hidden');
    if (this._prevState) { this.game.state = this._prevState; this._prevState = null; }
  }

  // ------------------------------------------------------------------ boutique

  openShop() {
    const g = this.game, P = g.profile;
    P.owned = P.owned || [];
    P.titles = P.titles || [];
    let el = $('shop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'shop'; el.className = 'screen';
      document.getElementById('app').appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-item]');
        if (b) this._shopAct(b.dataset.item);
        if (e.target.closest('[data-close]')) this.closeShop();
      });
    }
    el.classList.remove('hidden');
    if (g.state === 'play') { this._prevState = 'play'; g.state = 'paused'; }
    const L = P.look;
    const row = (it) => {
      const owned = P.owned.includes(it.id) || (it.kind === 'title' && P.titles.includes(it.title));
      const worn = it.kind === 'extra' ? (L.extras || []).includes(it.id) : L.title === it.title;
      const btn = !owned ? `Buy · ${it.price} 🪙` : worn ? 'Take off' : 'Wear';
      return `<div class="shop-row"><span>${esc(it.name)}</span><button class="mini${owned ? '' : ' buy'}" data-item="${it.id}">${btn}</button></div>`;
    };
    const earned = P.titles.filter((t) => !SHOP.some((s) => s.title === t)).map((t) => ({ id: 'title:' + t, kind: 'title', title: t, name: '🏅 Title: ' + TITLES[t], price: 0 }));
    el.innerHTML = `<div class="menu-card wide"><h2>Bhavana's Boutique</h2><div class="credits">You have <b>${P.coins || 0} 🪙</b>. Titles show under your name for everyone.</div>
      <div class="shop-list">${[...SHOP, ...earned].map(row).join('')}</div>
      <div class="menu-buttons"><button class="menu-btn primary" data-close>Done</button></div></div>`;
  }

  _shopAct(id) {
    const g = this.game, P = g.profile, L = P.look;
    const it = SHOP.find((s) => s.id === id) || (id.startsWith('title:') ? { id, kind: 'title', title: +id.slice(6), price: 0 } : null);
    if (!it) return;
    const owned = P.owned.includes(it.id) || (it.kind === 'title' && P.titles.includes(it.title));
    if (!owned) {
      if ((P.coins || 0) < it.price) { g.hud.toast('Not enough coins yet! Missions, games and word cards pay.', 3000); return; }
      g.addCoins(-it.price);
      P.owned.push(it.id);
      if (it.kind === 'title') P.titles.push(it.title);
      g.audio.fanfare(false);
    }
    if (it.kind === 'extra') {
      const s = new Set(L.extras || []);
      if (s.has(it.id) && owned) s.delete(it.id); else s.add(it.id);
      L.extras = [...s];
    } else L.title = L.title === it.title && owned ? 0 : it.title;
    g.saveProfile();
    g.player.setLook(L);
    g.net?.updateProfile(P.name, L);
    this.openShop();
  }

  closeShop() {
    $('shop')?.classList.add('hidden');
    if (this._prevState) { this.game.state = this._prevState; this._prevState = null; }
  }

  // ------------------------------------------------------------------ getting there

  takeMeThere() {
    const g = this.game;
    if (!this.venue || g.quests.active) return;
    const fade = $('fade');
    fade.classList.add('on');
    g.audio.whoosh();
    setTimeout(() => {
      const [x, z] = this.venue.spots.board;
      if (g.player.mode === 'ride') g.player.toggleRide();
      g.player.place(x + 2, z + 2, Math.atan2(this.venue.pos.x - x, this.venue.pos.z - z));
      g.camRig.yaw = g.player.yaw;
      fade.classList.remove('on');
      g.hud.toast('🛺 Auto anna: "Club-ah? Meter mele twenty, saar." (This one is on the house.)', 3500);
    }, 600);
  }

  // From the calendar: switch room / district if needed, then walk in through the hall's entrance.
  async goToMeetup(m) {
    const g = this.game;
    const room = m.room || 'public';
    const roomChange = room !== (g.profile.room || 'public');
    if (roomChange) { g.profile.room = room; g.saveProfile(); }
    if (m.zone !== g.zoneId) await g.travel(m.zone);
    else if (roomChange) { g.voice.closeAll(); g.net?.close(); g.net = null; g.remotes.forEach((r) => r.dispose()); g.remotes.clear(); g._connect(); }
    this.toHall();
  }

  toHall() {
    const g = this.game, h = this.hall;
    if (!h) return;
    const fade = $('fade');
    fade.classList.add('on');
    setTimeout(() => {
      if (g.player.mode === 'ride') g.player.toggleRide();
      const [x, z] = h.spots.entrance;
      g.player.place(x, z, h.yaw + Math.PI);
      g.camRig.yaw = h.yaw + Math.PI;
      fade.classList.remove('on');
      g.hud.toast('Welcome to the Namma Meetup Hall! 🎤', 3000);
    }, 600);
  }

  // Head to the club when you've joined something there.
  guide() {
    if (!this.venue) return null;
    const ev = this.joinedEvent();
    if (!ev || ev.kind === 'quiz' || ev.kind === 'dance') return null;
    const p = this.game.player.pos;
    if (this.venue.near(p, 20)) return null;
    return { x: this.venue.pos.x, z: this.venue.pos.z, y: 0 };
  }

  markers() {
    if (!this.venue) return [];
    return [{ x: this.venue.pos.x, z: this.venue.pos.z, icon: '♫', color: '#ff7ad9', size: 17, clamp: !!this.joined }];
  }

  // ------------------------------------------------------------------ per frame

  update(dt) {
    const g = this.game;
    if (!this.venue) return;
    const p = g.player;
    const now = performance.now();
    // the club: music level by distance, floor lights on the shared beat
    const d = Math.hypot(p.pos.x - this.venue.pos.x, p.pos.z - this.venue.pos.z);
    const level = Math.max(0, Math.min(1, 1 - (d - 14) / 60));
    g.audio.setClub?.(level);
    this.dropT = Math.max(0, this.dropT - dt);
    const beats = Date.now() / BEAT_MS;
    if (d < 260) this.venue.update(dt, beats / 2, this.dropT > 0 ? 1 : 0.35 + 0.3 * (g.atmo?.night || 0));
    if (d < 140) for (const av of this.dancers) av.update(dt, { speed: 0, grounded: true });
    if (this._dropCheck > 0) {
      this._dropCheck -= dt;
      if (g.myEmote === 'dance' && this.venue.near(p.pos, 10)) { this._dropCheck = 0; g.addCoins(10, p.pos); g.fx.pop(p.pos, 'DANCE BONUS!'); }
    }
    // kaapi / game boosts
    p.boost = Math.max(now < this.boostUntil ? 1.3 : 1, this.cur?.boost || 1);
    // the meetup hall, and action-button prompts (stage, booths, benches, calendar, vehicles to take)
    {
      this.hall?.update(dt);
      const w = this.cur || g.dlg.open ? null : (this.hall?.want() || g.driving?.want() || null);
      this.want = w;
      const hud = g.hud;
      if (w) {
        if (!hud.promptText || hud.promptText === this._wantText) {
          hud.prompt(w.text); this._wantText = w.text;
          if (g.input.consume('interact')) w.act();
        }
      } else if (this._wantText) { if (hud.promptText === this._wantText) hud.prompt(null); this._wantText = null; }
    }
    // events
    this._tickLaunch();
    if (this.cur) this.cur.update(dt);
    this.bannerT -= dt;
    if (this.bannerT <= 0) { this.bannerT = 0.25; this._renderBanner(); }
  }

  key(n) { if (this.cur?.key) { this.cur.key(n); return true; } return false; }

  _renderBanner(force) {
    const ev = this.cur ? null : this.upcoming();
    this._bannerEv = ev;
    const el = this.banner;
    if (!ev || (this.dismissed.has(ev.sid) && this.joined !== ev.sid) || this.game.photoMode) { el.classList.add('hidden'); this._bannerKey = ''; return; }
    const def = KINDS[ev.kind];
    const left = Math.round((ev.start - this.now()) / 1000);
    const joined = this.joined === ev.sid;
    const n = this._humans(ev.sid).length - (joined ? 0 : 1) + (joined ? 0 : 0);
    const far = !this.venue.near(this.game.player.pos, 40);
    const when = left > 0 ? `in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'on now';
    const key = `${ev.sid}|${when}|${joined}|${n}|${far}|${!!this.game.quests.active}`;
    if (!force && key === this._bannerKey) return;
    this._bannerKey = key;
    const people = n > 0 ? `${n} joined` : 'be the first!';
    const btns = joined
      ? `${far && ev.kind !== 'quiz' && ev.kind !== 'dance' ? '<button data-a="go">🛺 Take me</button>' : ''}<button data-a="leave" class="ghost">Leave</button>`
      : this.game.quests.active ? '<span class="dim">after your mission</span><button data-a="x" class="ghost">✕</button>'
        : `<button data-a="join">Join</button>${far && ev.kind !== 'quiz' && ev.kind !== 'dance' ? '<button data-a="go">🛺 Take me</button>' : ''}<button data-a="x" class="ghost">✕</button>`;
    el.innerHTML = `<div class="mu-icon">${def.icon}</div><div class="mu-text"><b>${joined ? "✅ You're in · " : ''}${esc(def.name)}</b><small>${when} · ${ev.kind === 'quiz' || ev.kind === 'dance' ? 'play from anywhere' : 'at Namma Club'} · ${people}</small></div><div class="mu-btns">${btns}</div>`;
    el.classList.remove('hidden');
    if (!joined && left === 30 && !this._chimed?.has(ev.sid)) { (this._chimed || (this._chimed = new Set())).add(ev.sid); this.game.audio.chat(); }
  }
}
