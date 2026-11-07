import { Game } from './game/Game.js';
import { ZONES, ZONE_ORDER } from './data/zones.js';
import { SKINS, SHIRT_COLS, PLAYER_LOOK, randomLook } from './actors/Avatar.js';
import { lobbyCounts, makeId } from './net/Net.js';
import { QUALITY } from './core/Renderer.js';

// Boot: fonts, the game, and all the menu screens (title, look, settings, metro map, pause).

const $ = (id) => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle('hidden', !on);

class UI {
  constructor(game) {
    this.g = game;
    game.ui = this;
    const P = game.profile;
    const params = new URLSearchParams(location.search);
    if (params.get('room')) { P.room = params.get('room').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 12) || 'public'; P.online = true; }
    if (params.get('zone') && ZONES[params.get('zone')]) P.zone = params.get('zone');
    $('in-name').value = P.name;
    $('in-online').checked = P.online !== false;
    $('in-room').value = P.room && P.room !== 'public' ? P.room : '';
    $('btn-play').onclick = () => this.play();
    $('btn-districts').onclick = () => this.openMap(false);
    $('btn-look').onclick = () => this.openLook();
    $('btn-settings').onclick = () => this.pause(true, true);
    $('btn-room-new').onclick = () => { $('in-room').value = makeId().slice(0, 6); $('in-online').checked = true; };
    $('in-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.play(); e.stopPropagation(); });
    $('in-room').addEventListener('keydown', (e) => e.stopPropagation());
    $('btn-resume').onclick = () => this.pause(false);
    $('btn-quit').onclick = () => location.reload();
    $('btn-mute').onclick = () => { game.audio.setMuted(!game.audio.muted); this._labels(); };
    $('btn-music').onclick = () => { game.audio.setMusic(!game.audio.musicOn); this._labels(); };
    $('btn-quality').onclick = () => {
      const keys = Object.keys(QUALITY);
      game.setQuality(keys[(keys.indexOf(game.qualityKey) + 1) % keys.length]);
    };
    $('btn-invite').onclick = () => this.invite();
    $('btn-quests').onclick = () => this.questList();
    $('map-close').onclick = () => this.closeMap();
    $('look-done').onclick = () => this.closeLook();
    $('look-random').onclick = () => { P.look = { ...randomLook(), extras: P.look.extras || [] }; this._lookRows(); this._applyLook(); };
    this._labels();
    this._mapCanvas();
    // peek at who's online, for the title screen
    lobbyCounts(2200).then((c) => {
      this.counts = c;
      const n = Object.values(c).reduce((a, b) => a + b, 0);
      if (n) $('loading').textContent = `${n} player${n > 1 ? 's' : ''} online right now`;
    }).catch(() => {});
  }

  _labels() {
    const g = this.g;
    $('btn-mute').textContent = `Sound: ${g.audio.muted ? 'Off' : 'On'}`;
    $('btn-music').textContent = `Music: ${g.audio.musicOn ? 'On' : 'Off'}`;
    $('btn-quality').textContent = `Quality: ${QUALITY[g.qualityKey].name}`;
  }

  _readMenu() {
    const P = this.g.profile;
    const nm = $('in-name').value.trim().replace(/[<>]/g, '').slice(0, 16);
    if (nm) P.name = nm;
    P.online = $('in-online').checked;
    P.room = ($('in-room').value || 'public').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 12) || 'public';
    this.g.saveProfile();
  }

  async play(zone) {
    const g = this.g;
    this._readMenu();
    g.audio.unlock();
    show('menu', false);
    document.body.classList.add('playing');
    const z = zone || g.profile.zone || 'central';
    if (g.zoneId !== z) await g.travel(z);
    else { g._connect(); g.hud.big(ZONES[z].short.toUpperCase(), ZONES[z].kn, 2400); }
    g.state = 'play';
    g.hud.show(true);
    g.hud.setCoins(g.profile.coins || 0);
    g.player.setLook(g.profile.look);
    g.quests.nextHint();
    if (!g.profile.done.length) setTimeout(() => g.hud.toast('Welcome to Bengaluru, 2099! Find Manju Anna (yellow !) next to the metro station.', 6000), 2600);
    if (g.input.isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  pause(on, fromMenu = false) {
    const g = this.g;
    this.fromMenu = fromMenu;
    show('pause', on);
    $('pause-title').textContent = fromMenu ? 'Settings' : 'Paused';
    $('btn-resume').textContent = fromMenu ? 'Back' : 'Resume';
    show('btn-quit', !fromMenu); show('btn-quests', !fromMenu); show('btn-invite', true);
    show('quest-list', false);
    if (on) { this.prevState = g.state; if (!fromMenu) g.state = 'paused'; }
    else if (!fromMenu) g.state = 'play';
    this._labels();
  }

  invite() {
    const P = this.g.profile;
    let room = P.room;
    if (!room || room === 'public') {
      room = makeId().slice(0, 6);
      P.room = room;
      this.g.saveProfile();
      if (this.g.state !== 'menu') { this.g.net?.close(); this.g.net = null; this.g.remotes.forEach((r) => r.dispose()); this.g.remotes.clear(); this.g._connect(); }
      $('in-room').value = room;
    }
    const url = `${location.origin}${location.pathname}?room=${room}&zone=${this.g.zoneId || P.zone || 'central'}`;
    const done = () => this.g.hud.toast(`Invite link copied! Room “${room}”. Friends who open it will spawn here with you.`, 5000);
    if (navigator.share && this.g.input.isTouch) navigator.share({ title: 'Peak Bengaluru', text: 'Come play with me in Bengaluru 2099!', url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url));
    else prompt('Copy this link:', url);
  }

  questList() {
    const g = this.g;
    const box = $('quest-list');
    box.innerHTML = '';
    const st = g.quests.story;
    const done = new Set(g.profile.done);
    for (const q of st.quests || []) {
      const d = document.createElement('div');
      d.className = 'q' + (done.has(q.id) && !q.repeat ? ' done' : '');
      const giver = g.quests.npcs.get(q.giver);
      const b = document.createElement('b'); b.textContent = (done.has(q.id) && !q.repeat ? '✅ ' : g.quests.available(q) ? '❗ ' : '🔒 ') + q.title;
      const s = document.createElement('small'); s.textContent = `${q.summary || ''} — ${giver ? giver.name : ''}`;
      d.append(b, s);
      box.appendChild(d);
    }
    if (!st.quests?.length) box.textContent = 'No story missions here yet — explore, find word cards, and meet the locals!';
    show('quest-list', true);
  }

  // ------------------------------------------------------------------ look editor

  openLook() { this._readMenu(); this._lookRows(); show('lookscreen', true); show('menu', false); }
  closeLook() { show('lookscreen', false); show('menu', true); this.g.saveProfile(); this._applyLook(); }
  _applyLook() { if (this.g.player) this.g.player.setLook(this.g.profile.look); }

  _lookRows() {
    const L = this.g.profile.look;
    const rows = $('look-rows');
    rows.innerHTML = '';
    const row = (label, items, render) => {
      const r = document.createElement('div'); r.className = 'look-row';
      const s = document.createElement('span'); s.textContent = label; r.appendChild(s);
      items.forEach((it) => r.appendChild(render(it)));
      rows.appendChild(r);
    };
    const swatch = (key) => (c) => {
      const b = document.createElement('button'); b.className = 'sw' + (L[key] === c ? ' on' : ''); b.style.background = c;
      b.onclick = () => { L[key] = c; this._lookRows(); this._applyLook(); };
      return b;
    };
    const opt = (key, labels) => (v) => {
      const b = document.createElement('button'); b.className = 'opt' + (L[key] === v ? ' on' : ''); b.textContent = labels[v] || v;
      b.onclick = () => { L[key] = v; this._lookRows(); this._applyLook(); };
      return b;
    };
    const extra = (v) => {
      const on = (L.extras || []).includes(v);
      const b = document.createElement('button'); b.className = 'opt' + (on ? ' on' : '');
      b.textContent = { satchel: '👜 Satchel', backpack: '🎒 Backpack', glasses: '👓 Glasses', lanyard: '🪪 Office ID', helmet: '⛑️ Helmet', cap: '🧢 Cap', mustache: '🥸 Moustache', bindi: '🔴 Bindi', jersey: '🏏 Jersey' }[v] || v;
      b.onclick = () => { const s = new Set(L.extras || []); on ? s.delete(v) : s.add(v); L.extras = [...s]; this._lookRows(); this._applyLook(); };
      return b;
    };
    row('Skin', SKINS, swatch('skin'));
    row('Hair', ['curly', 'short', 'spiky', 'long', 'bun', 'ponytail', 'bald'], opt('hairStyle', {}));
    row('Hair col', ['#1d1a1c', '#3a2a22', '#6b4a35', '#a0522d', '#d9d4cc', '#8e5bb5'], swatch('hair'));
    row('Top', ['tee', 'shirt', 'kurta'], opt('shirtStyle', { tee: 'T-shirt', shirt: 'Shirt', kurta: 'Kurta' }));
    row('Top col', SHIRT_COLS, swatch('shirt'));
    row('Pants', ['#ece3cf', '#3b4a63', '#2f2f35', '#6b5844', '#9fb4c8', '#2f8f4e'], swatch('pants'));
    row('Extras', ['satchel', 'backpack', 'glasses', 'lanyard', 'helmet', 'cap', 'mustache', 'bindi', 'jersey'], extra);
    this.g.net?.updateProfile(this.g.profile.name, L);
  }

  // ------------------------------------------------------------------ Namma Metro map

  async _mapCanvas() {
    try { this.city = await (await fetch('data/city.json')).json(); } catch { this.city = null; }
    const cv = $('map-canvas');
    cv.addEventListener('pointermove', (e) => { this.hover = this._zoneAt(e); this._drawMap(); });
    cv.addEventListener('click', (e) => {
      const z = this._zoneAt(e);
      if (!z) return;
      if (this.mapInGame) { this.closeMap(); this.g.travel(z); }
      else { this.g.profile.zone = z; this.g.saveProfile(); this.closeMap(); this.play(z); }
    });
  }

  openMap(inGame) {
    this.mapInGame = inGame;
    show('map', true);
    if (!inGame) show('menu', false);
    else this.g.state = 'paused';
    requestAnimationFrame(() => this._drawMap());
    lobbyCounts(1800).then((c) => { this.counts = c; this._drawMap(); }).catch(() => {});
  }

  closeMap() {
    show('map', false);
    if (this.mapInGame) this.g.state = 'play'; else show('menu', true);
  }

  _proj() {
    const c = this.city;
    const lat0 = c ? c.origin[0] : 12.9716, lon0 = c ? c.origin[1] : 77.5946;
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180) / 5, kz = 110574 / 5;
    return (lat, lon) => [(lon - lon0) * kx, (lat0 - lat) * kz];
  }

  _view() {
    const cv = $('map-canvas');
    const W = cv.clientWidth, H = cv.clientHeight;
    const pr = this._proj();
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const id of ZONE_ORDER) {
      const b = ZONES[id].bbox;
      const [ax, az] = pr(b[2], b[1]), [bx, bz] = pr(b[0], b[3]);
      x0 = Math.min(x0, ax); z0 = Math.min(z0, az); x1 = Math.max(x1, bx); z1 = Math.max(z1, bz);
    }
    const m = 500;
    x0 -= m; z0 -= m; x1 += m; z1 += m;
    const s = Math.min(W / (x1 - x0), H / (z1 - z0));
    const ox = (W - (x1 - x0) * s) / 2 - x0 * s, oz = (H - (z1 - z0) * s) / 2 - z0 * s;
    return { W, H, s, ox, oz, pr };
  }

  _zoneAt(e) {
    const r = $('map-canvas').getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const v = this._view();
    for (const id of ZONE_ORDER) {
      const b = ZONES[id].bbox;
      const [ax, az] = v.pr(b[2], b[1]), [bx, bz] = v.pr(b[0], b[3]);
      if (mx > ax * v.s + v.ox - 8 && mx < bx * v.s + v.ox + 8 && my > az * v.s + v.oz - 8 && my < bz * v.s + v.oz + 8) return id;
    }
    return null;
  }

  _drawMap() {
    const cv = $('map-canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const v = this._view();
    cv.width = v.W * dpr; cv.height = v.H * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f3e7cf'; g.fillRect(0, 0, v.W, v.H);
    const T = (x, z) => [x * v.s + v.ox, z * v.s + v.oz];
    const c = this.city;
    if (c) {
      const poly = (f) => { g.beginPath(); for (let i = 0; i < f.length; i += 2) { const [x, y] = T(f[i], f[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
      g.fillStyle = '#c4dca6';
      for (const p of c.parks) { poly(p[0]); g.fill(); }
      g.fillStyle = '#9fd0dc';
      for (const w of c.water) { poly(w[0]); g.fill(); }
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const rank of [2, 1, 0]) {
        g.strokeStyle = rank === 0 ? '#f2c14e' : rank === 1 ? '#ffffff' : '#e6d9bf';
        g.lineWidth = rank === 0 ? 3 : rank === 1 ? 2 : 1;
        for (const r of c.roads) {
          if (r[0] !== rank) continue;
          g.beginPath();
          const f = r[1];
          for (let i = 0; i < f.length; i += 2) { const [x, y] = T(f[i], f[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
      }
      const LC = { purple: '#8e5bb5', green: '#2f9e5b', yellow: '#e2b51a', pink: '#e75a9c', blue: '#2f6fd1' };
      for (const r of c.rail) {
        g.strokeStyle = r[0] === 1 ? LC[r[2]] || '#8e5bb5' : '#9a8f86';
        g.lineWidth = r[0] === 1 ? 3.5 : 1.5;
        g.setLineDash(r[0] === 1 ? [] : [4, 3]);
        g.beginPath();
        const f = r[1];
        for (let i = 0; i < f.length; i += 2) { const [x, y] = T(f[i], f[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      g.setLineDash([]);
    }
    // districts
    for (const id of ZONE_ORDER) {
      const Z = ZONES[id], b = Z.bbox;
      const [ax, az] = v.pr(b[2], b[1]), [bx, bz] = v.pr(b[0], b[3]);
      const [x0, y0] = T(ax, az), [x1, y1] = T(bx, bz);
      const hot = this.hover === id, here = this.g.zoneId === id && this.mapInGame;
      g.fillStyle = hot ? 'rgba(240,123,90,0.45)' : here ? 'rgba(63,179,166,0.4)' : 'rgba(240,123,90,0.18)';
      g.strokeStyle = '#2a2226'; g.lineWidth = hot ? 3.5 : 2.5;
      g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const n = this.counts?.[id] || 0;
      const label = Z.short + (n ? `  · ${n} 🟢` : '');
      g.font = `800 ${hot ? 15 : 13}px "Baloo 2", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.lineWidth = 4; g.strokeStyle = '#fff6e6'; g.strokeText(label, (x0 + x1) / 2, y0 - 2);
      g.fillStyle = '#2a2226'; g.fillText(label, (x0 + x1) / 2, y0 - 2);
    }
    const h = this.hover && ZONES[this.hover];
    $('map-info').textContent = h ? `${h.name} (${h.kn}) — ${h.blurb}  Click to go.` : 'Tap a district to take Namma Metro there. Real roads, lakes and metro lines of Bengaluru (© OpenStreetMap).';
  }
}

async function boot() {
  const loading = $('loading');
  loading.textContent = 'Loading the city…';
  try { await Promise.race([Promise.all([document.fonts.load('800 40px "Baloo 2"'), document.fonts.load('700 30px "Baloo Tamma 2"'), document.fonts.load('40px Bangers')]), new Promise((r) => setTimeout(r, 3000))]); } catch {}
  const game = new Game($('view'));
  window.game = game;
  const ui = new UI(game);
  const zone = game.profile.zone && ZONES[game.profile.zone] ? game.profile.zone : 'central';
  await game.loadZone(zone, (m) => (loading.textContent = m));
  game.state = 'menu';
  if (!ui.counts) loading.textContent = '';
  $('btn-play').textContent = game.profile.done.length ? `Continue in ${ZONES[zone].short}` : 'Play';
  // ?autoplay for testing
  if (new URLSearchParams(location.search).has('autoplay')) ui.play();
}

boot().catch((e) => {
  console.error(e);
  $('loading').textContent = `Could not start: ${e.message}`;
});
