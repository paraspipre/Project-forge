import * as THREE from 'three';
import { ring } from '../world/geo.js';
import { R } from '../world/City.js';

// Heads-up display: location card, minimap drawn from the real map, objective + waypoint,
// prompts, toasts, chat log, the emote / phrase wheel.

export const PHRASES = [
  { id: 'namaskara', kn: 'ನಮಸ್ಕಾರ!', en: 'Namaskara!', mean: 'Hello!' },
  { id: 'oota', kn: 'ಊಟ ಆಯ್ತಾ?', en: 'Oota aayta?', mean: 'Had your meal? (how Bengaluru says hi)' },
  { id: 'guru', kn: 'ಏನ್ ಗುರು?', en: 'Yen guru?', mean: "What's up, boss?" },
  { id: 'macha', kn: 'ಮಚ್ಚಾ, ಸಕ್ಕತ್!', en: 'Macha, sakkath!', mean: 'Dude, awesome!' },
  { id: 'adjust', kn: 'ಸ್ವಲ್ಪ ಅಡ್ಜಸ್ಟ್ ಮಾಡಿ', en: 'Swalpa adjust maadi', mean: 'Please adjust a little' },
  { id: 'gottilla', kn: 'ಗೊತ್ತಿಲ್ಲ', en: 'Gottilla', mean: "Don't know" },
  { id: 'nimsha', kn: 'ಒಂದ್ ನಿಮಿಷ', en: 'Ond nimsha', mean: 'One minute (could be one hour)' },
  { id: 'bega', kn: 'ಬೇಗ ಬಾ!', en: 'Bega baa!', mean: 'Come quickly!' },
  { id: 'coffee', kn: 'ಬನ್ನಿ, ಕಾಫಿ ಕುಡಿಯೋಣ', en: 'Banni, coffee kudiyona', mean: "Come, let's have coffee" },
  { id: 'meter', kn: 'ಮೀಟರ್ ಹಾಕಿ, ಅಣ್ಣ', en: 'Meter haaki, anna', mean: 'Put the meter on, brother' },
  { id: 'cup', kn: 'ಈ ಸಲ ಕಪ್ ನಮ್ದೇ!', en: 'Ee sala cup namde!', mean: 'This year the cup is ours!' },
  { id: 'super', kn: 'ಸೂಪರ್, ಮಗಾ!', en: 'Super, maga!', mean: 'Super, kid!' },
  { id: 'hogi', kn: 'ಹೋಗಿ ಬನ್ನಿ', en: 'Hogi banni', mean: 'Go and come back (bye)' },
  { id: 'traffic', kn: 'ಟ್ರಾಫಿಕ್, ಲೇಟ್ ಆಗುತ್ತೆ', en: 'Traffic, late aagutte', mean: "Traffic. I'll be late." },
  { id: 'weather', kn: 'ಬೆಂಗಳೂರು weather, ಅಯ್ಯೋ!', en: 'Bengaluru weather, ayyo!', mean: 'Ah, that Bengaluru weather!' },
];
export const DEFAULT_PHRASES = ['namaskara', 'oota', 'guru', 'gottilla'];

export const EMOTE_LIST = [
  ['wave', '👋 Wave'], ['namaste', '🙏 Namaste'], ['wobble', '🙂 Head wobble'], ['dance', '💃 Dance'], ['cheer', '🙌 Cheer'],
  ['laugh', '😂 Laugh'], ['facepalm', '🤦 Facepalm'], ['shrug', '🤷 Shrug'], ['point', '👉 Point'], ['phone', '📱 "On a call"'],
  ['typing', '💻 Typing'], ['sit', '🪑 Sit'],
];

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.mm = $('minimap');
    this.mctx = this.mm.getContext('2d');
    this.toastTimer = null;
    this.streetT = 0;
    this.mmT = 0;
    this.chatLines = [];
    this._v = new THREE.Vector3();
    $('chat-send').onclick = () => this.sendChat();
    $('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.sendChat(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closeChat(); }
      e.stopPropagation();
    });
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  // ------------------------------------------------------------ minimap

  buildMinimap(city, data) {
    const { x0, z0, x1, z1 } = city.bounds;
    const S = 1 / 1.6; // px per metre
    const W = Math.ceil((x1 - x0) * S), H = Math.ceil((z1 - z0) * S);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#efe3cb'; g.fillRect(0, 0, W, H);
    const P = (p) => [(p[0] - x0) * S, (p[1] - z0) * S];
    const poly = (r, holes = []) => {
      g.beginPath();
      for (const rr of [r, ...holes]) { rr.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
    };
    g.fillStyle = '#b9d79a';
    for (const gr of data.greens) { poly(ring(gr[1]), gr[2].map(ring)); g.fill('evenodd'); }
    g.fillStyle = '#8fc9d6';
    for (const w of data.water) { poly(ring(w[0]), w[1].map(ring)); g.fill('evenodd'); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const rd of city.roads) {
        if (rd.code >= R.footway && pass === 0) continue;
        if (rd.code > R.service && rd.code < R.construction && pass === 1 && rd.code >= R.footway) {
          g.strokeStyle = '#e3d6bd'; g.lineWidth = 1.2;
        } else if (pass === 0) { g.strokeStyle = '#7d7480'; g.lineWidth = rd.w * S + 2.2; }
        else { g.strokeStyle = rd.code <= R.secondary ? '#ffe7a3' : '#ffffff'; g.lineWidth = rd.w * S; }
        g.beginPath();
        rd.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
      }
    }
    g.fillStyle = '#d6c3a5'; g.strokeStyle = '#a8957a'; g.lineWidth = 0.6;
    for (const b of city.buildings) { poly(b.r); g.fill(); g.stroke(); }
    g.strokeStyle = '#8e5bb5'; g.lineWidth = 3;
    for (const l of city.metroLines || []) { g.beginPath(); l.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    this.mapCanvas = c;
    this.mapS = S;
    this.mapOrigin = [x0, z0];
  }

  drawMinimap(player, camYaw, others, markers) {
    const g = this.mctx, W = this.mm.width, Hh = this.mm.height;
    const r = W / 2;
    g.save();
    g.clearRect(0, 0, W, Hh);
    g.beginPath(); g.arc(r, r, r - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#efe3cb'; g.fillRect(0, 0, W, Hh);
    const view = 1 / 1.4; // minimap px per metre
    const k = view / this.mapS;
    g.translate(r, r);
    // rotate so the camera's forward points up
    g.rotate(camYaw + Math.PI);
    g.scale(k, k);
    const px = (player.pos.x - this.mapOrigin[0]) * this.mapS, pz = (player.pos.z - this.mapOrigin[1]) * this.mapS;
    if (this.mapCanvas) g.drawImage(this.mapCanvas, -px, -pz);
    g.restore();
    const toMini = (x, z) => {
      const dx = (x - player.pos.x) * view, dz = (z - player.pos.z) * view;
      const a = camYaw + Math.PI, c = Math.cos(a), s = Math.sin(a);
      return [r + dx * c - dz * s, r + dx * s + dz * c];
    };
    for (const o of others) {
      let [x, y] = toMini(o.pos.x, o.pos.z);
      const d = Math.hypot(x - r, y - r);
      if (d > r - 6) { x = r + ((x - r) / d) * (r - 6); y = r + ((y - r) / d) * (r - 6); }
      g.fillStyle = '#f07b5a'; g.strokeStyle = '#2a2226'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    for (const m of markers) {
      let [x, y] = toMini(m.x, m.z);
      const d = Math.hypot(x - r, y - r);
      if (d > r - 9) { if (!m.clamp) continue; x = r + ((x - r) / d) * (r - 9); y = r + ((y - r) / d) * (r - 9); }
      g.font = `bold ${m.size || 16}px Baloo 2, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = '#2a2226'; g.strokeText(m.icon, x, y);
      g.fillStyle = m.color || '#f2c14e'; g.fillText(m.icon, x, y);
    }
    // player arrow
    g.save();
    g.translate(r, r);
    g.rotate(camYaw + Math.PI - player.yaw);
    g.fillStyle = '#3fb3a6'; g.strokeStyle = '#2a2226'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 9); g.lineTo(7, -7); g.lineTo(0, -3); g.lineTo(-7, -7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // north tick
    const [nx, ny] = toMini(player.pos.x, player.pos.z - 1000);
    const nd = Math.hypot(nx - r, ny - r);
    g.font = 'bold 13px Baloo 2, sans-serif'; g.fillStyle = '#2a2226'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', r + ((nx - r) / nd) * (r - 10), r + ((ny - r) / nd) * (r - 10));
    g.lineWidth = 3; g.strokeStyle = '#2a2226';
    g.beginPath(); g.arc(r, r, r - 1.5, 0, Math.PI * 2); g.stroke();
  }

  // ------------------------------------------------------------ text bits

  setZone(name) { $('loc-zone').textContent = name; }
  setStreet(name, kn = '') {
    const el = $('loc-street');
    if (el.dataset.v === name + kn) return;
    el.dataset.v = name + kn;
    el.textContent = name ? '📍 ' + name : '';
    if (kn) { const k = document.createElement('span'); k.className = 'kn'; k.textContent = ' · ' + kn; el.appendChild(k); }
  }
  setClock(t, rain, night) {
    $('loc-clock').textContent = t;
    $('loc-weather').textContent = rain > 0.3 ? '🌧️' : night > 0.5 ? '🌙' : '☀️';
  }
  setCoins(n) { $('coin-n').textContent = n; }
  setOnline(n, connected) {
    $('online-n').textContent = connected ? n : 'offline';
    $('online').classList.toggle('off', !connected);
  }

  objective(text, kicker = 'MISSION') {
    const o = $('objective');
    if (!text) { o.classList.add('hidden'); return; }
    o.classList.remove('hidden');
    $('obj-kicker').textContent = kicker;
    $('obj-text').textContent = text;
  }
  objectiveDist(d) { $('obj-dist').textContent = d == null ? '' : d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`; }

  prompt(text, key = 'E') {
    const p = $('prompt'), act = $('t-act');
    if (!text) { p.classList.add('hidden'); act.classList.add('hidden'); this.promptText = null; return; }
    if (this.promptText === text) return;
    this.promptText = text;
    p.innerHTML = `<kbd>${document.body.classList.contains('touch') ? '✋' : key}</kbd>`;
    p.appendChild(document.createTextNode(text));
    p.classList.remove('hidden');
    act.classList.remove('hidden');
  }

  toast(text, ms = 2600) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  big(text, sub = '', ms = 2200) {
    const b = $('bigtext');
    b.innerHTML = '';
    b.appendChild(document.createTextNode(text));
    if (sub) { const s = document.createElement('small'); s.textContent = sub; b.appendChild(s); }
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bigTimer);
    this.bigTimer = setTimeout(() => b.classList.add('hidden'), ms);
  }

  timer(sec) {
    const t = $('timer');
    if (sec == null) { t.classList.add('hidden'); return; }
    t.classList.remove('hidden');
    t.textContent = `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`;
    t.classList.toggle('hurry', sec < 10);
  }

  // Edge-of-screen arrow towards a world point when it's off screen (or behind).
  waypoint(camera, p) {
    const wp = $('waypoint');
    if (!p) { wp.classList.add('hidden'); return; }
    const v = this._v.set(p.x, (p.y || 0) + 2, p.z).project(camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const on = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85;
    if (on) { wp.classList.add('hidden'); return; }
    const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8);
    x /= m; y /= m;
    wp.classList.remove('hidden');
    wp.style.transform = `translate(${((x * 0.5 + 0.5) * innerWidth).toFixed(0)}px, ${((-y * 0.5 + 0.5) * innerHeight).toFixed(0)}px) translate(-50%, -50%)`;
    $('wp-arrow').style.transform = `rotate(${Math.atan2(x, y)}rad)`;
  }

  // ------------------------------------------------------------ chat

  chat(name, text, sys = false) {
    const log = $('chatlog');
    const d = document.createElement('div');
    d.className = 'msg' + (sys ? ' sys' : '');
    if (name) { const b = document.createElement('b'); b.textContent = name + ': '; d.appendChild(b); }
    d.appendChild(document.createTextNode(text));
    log.appendChild(d);
    while (log.children.length > 6) log.firstChild.remove();
    setTimeout(() => { d.style.transition = 'opacity 1s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 1000); }, 14000);
  }

  openChat() {
    $('chatbar').classList.remove('hidden');
    const i = $('chat-input');
    i.value = '';
    setTimeout(() => i.focus(), 30);
    this.chatOpen = true;
  }
  closeChat() {
    $('chatbar').classList.add('hidden');
    $('chat-input').blur();
    this.chatOpen = false;
  }
  sendChat() {
    const t = $('chat-input').value.trim();
    if (t) this.game.sendChat(t);
    this.closeChat();
  }

  // ------------------------------------------------------------ emote wheel

  openWheel(unlocked) {
    const w = $('wheel');
    if (!w.classList.contains('hidden')) { this.closeWheel(); return; }
    const em = $('wheel-emotes'), ph = $('wheel-phrases');
    em.innerHTML = ''; ph.innerHTML = '';
    EMOTE_LIST.forEach(([id, label], i) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { this.game.doEmote(id); this.closeWheel(); };
      em.appendChild(b);
    });
    for (const p of PHRASES) {
      const b = document.createElement('button');
      const ok = unlocked.has(p.id);
      b.className = ok ? '' : 'locked';
      b.innerHTML = '';
      b.appendChild(document.createTextNode(ok ? p.en : '🔒 ???'));
      const s = document.createElement('small');
      s.textContent = ok ? `${p.kn} · ${p.mean}` : 'Find Kannada word cards or finish missions';
      b.appendChild(s);
      if (ok) b.onclick = () => { this.game.sendChat(p.en, true); this.closeWheel(); };
      ph.appendChild(b);
    }
    w.classList.remove('hidden');
    this.wheelOpen = true;
  }
  closeWheel() { $('wheel').classList.add('hidden'); this.wheelOpen = false; }
}
