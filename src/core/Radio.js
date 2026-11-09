// Namma Radio: real live stations (Kannada, Hindi/Bollywood, Punjabi, English) found through the free
// Radio Browser directory and streamed straight from the stations, plus "My Music" from your own
// files. Nothing is stored or re-hosted by the game. Turns itself on in stolen vehicles (GTA style).

const API = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info', 'https://nl1.api.radio-browser.info'];
export const BANDS = [
  { id: 'kannada', name: 'Kannada', icon: '🟡🔴', q: 'language=kannada' },
  { id: 'hindi', name: 'Bollywood', icon: '🎬', q: 'tag=bollywood' },
  { id: 'punjabi', name: 'Punjabi', icon: '🥁', q: 'language=punjabi' },
  { id: 'english', name: 'English', icon: '🎸', q: 'tag=pop&language=english' },
];
const SKIP = /quran|gurbani|kirtan|bhajan|sermon|church|news|talk|islam|bible|prayer|devotional|sikh|path/i;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Radio {
  constructor(game) {
    this.game = game;
    this.el = new Audio();
    this.el.preload = 'none';
    this.lists = {};
    this.band = null;
    this.idx = 0;
    this.on = false;
    this.files = [];
    this.vol = 0.7;
    try {
      const s = JSON.parse(localStorage.getItem('pb.radio') || '{}');
      this.band = s.band || 'kannada'; this.idx = s.idx || 0; this.vol = s.vol ?? 0.7; this.autoVehicle = s.auto !== false;
    } catch { this.band = 'kannada'; this.autoVehicle = true; }
    this.el.volume = this.vol;
    this.el.addEventListener('error', () => { if (this.on && this.band !== 'mine') { this.fails = (this.fails || 0) + 1; if (this.fails < 6) this.next(); else this._status('Could not tune in. Try another band.'); } });
    this.el.addEventListener('playing', () => { this.fails = 0; this._status(); });
    this.el.addEventListener('ended', () => { if (this.band === 'mine') this.next(); });
    this.chip = document.createElement('div');
    this.chip.id = 'radiochip';
    this.chip.className = 'hidden';
    $('hud').appendChild(this.chip);
    this.chip.addEventListener('click', (e) => { e.stopPropagation(); this.toggleUI(); });
  }

  _save() { try { localStorage.setItem('pb.radio', JSON.stringify({ band: this.band, idx: this.idx, vol: this.vol, auto: this.autoVehicle })); } catch {} }

  async stations(band) {
    if (band === 'mine') return this.files;
    if (this.lists[band]) return this.lists[band];
    const key = 'pb.radio.' + band;
    try {
      const c = JSON.parse(localStorage.getItem(key) || 'null');
      if (c && Date.now() - c.t < 86400000 && c.list.length) return (this.lists[band] = c.list);
    } catch {}
    const B = BANDS.find((b) => b.id === band);
    for (const host of API.sort(() => Math.random() - 0.5)) {
      try {
        const r = await fetch(`${host}/json/stations/search?${B.q}&hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=40`, { signal: AbortSignal.timeout?.(8000) });
        if (!r.ok) continue;
        const data = await r.json();
        const seen = new Set();
        const list = data.filter((s) => s.url_resolved && !/\.m3u8|\.pls|\.m3u($|\?)/i.test(s.url_resolved) && /MP3|AAC/i.test(s.codec || '') && !SKIP.test(`${s.name} ${s.tags}`))
          .map((s) => ({ name: s.name.trim().slice(0, 40), url: s.url_resolved, icon: s.favicon || '', uuid: s.stationuuid }))
          .filter((s) => { const k = s.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
          .slice(0, 14);
        if (!list.length) continue;
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), list })); } catch {}
        return (this.lists[band] = list);
      } catch {}
    }
    return [];
  }

  async play(band = this.band, idx = this.idx) {
    this.game.audio.unlock();
    this.band = band;
    const list = await this.stations(band);
    if (!list.length) { this._status(band === 'mine' ? 'Pick some songs from your device first.' : 'No stations found right now.'); return; }
    this.idx = ((idx % list.length) + list.length) % list.length;
    const st = list[this.idx];
    this.on = true;
    this.el.src = st.url;
    this.el.volume = this.vol;
    this.el.play().catch(() => {});
    this.game.audio.musicHold?.(true);
    this._save();
    this._status('Tuning in…');
    this.game.audio._noise?.({ dur: 0.35, vol: 0.05, f: 2500, q: 0.4 });   // a little static
    if (this.uiOpen) this.renderUI();
  }

  next() { this.play(this.band, this.idx + 1); }
  prev() { this.play(this.band, this.idx - 1); }

  stop() {
    this.on = false;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    this.game.audio.musicHold?.(false);
    this.chip.classList.add('hidden');
    if (this.uiOpen) this.renderUI();
  }

  toggle() { if (this.on) this.stop(); else this.play(); }

  current() {
    const list = this.band === 'mine' ? this.files : this.lists[this.band] || [];
    return list[this.idx] || null;
  }

  _status(msg) {
    const st = this.current();
    const B = BANDS.find((b) => b.id === this.band);
    this.chip.innerHTML = `📻 <b>${esc(B ? B.name : 'My Music')}</b> <span>${esc(msg || st?.name || '')}</span>`;
    this.chip.classList.toggle('hidden', !this.on);
    if (this.uiOpen) { const s = $('rd-now'); if (s) s.textContent = msg || st?.name || ''; }
  }

  pickFiles() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*'; inp.multiple = true;
    inp.onchange = () => {
      for (const f of this.files) URL.revokeObjectURL(f.url);
      this.files = [...inp.files].map((f) => ({ name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40), url: URL.createObjectURL(f) }));
      for (let i = this.files.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.files[i], this.files[j]] = [this.files[j], this.files[i]]; }
      if (this.files.length) this.play('mine', 0);
    };
    inp.click();
  }

  // ------------------------------------------------------------------ UI

  toggleUI() { if (this.uiOpen) this.closeUI(); else this.openUI(); }

  openUI() {
    this.uiOpen = true;
    let el = $('radio');
    if (!el) {
      el = document.createElement('div');
      el.id = 'radio';
      $('hud').appendChild(el);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = e.target.closest('[data-a]');
        if (!t) return;
        const a = t.dataset.a;
        if (a === 'close') this.closeUI();
        if (a === 'off') this.stop();
        if (a === 'next') this.next();
        if (a === 'prev') this.prev();
        if (a === 'mine') this.pickFiles();
        if (a === 'auto') { this.autoVehicle = !this.autoVehicle; this._save(); this.renderUI(); }
        if (a.startsWith('band:')) { this.band = a.slice(5); this.idx = 0; this.play(); }
        if (a.startsWith('st:')) this.play(this.band, +a.slice(3));
      });
      el.addEventListener('input', (e) => { if (e.target.id === 'rd-vol') { this.vol = +e.target.value; this.el.volume = this.vol; this._save(); } });
    }
    el.classList.remove('hidden');
    this.renderUI();
    if (this.band !== 'mine') this.stations(this.band).then(() => this.uiOpen && this.renderUI());
  }

  closeUI() { this.uiOpen = false; $('radio')?.classList.add('hidden'); }

  renderUI() {
    const el = $('radio');
    if (!el) return;
    const list = this.band === 'mine' ? this.files : this.lists[this.band];
    const bands = BANDS.map((b) => `<button data-a="band:${b.id}" class="opt${this.band === b.id ? ' on' : ''}">${b.icon} ${b.name}</button>`).join('') +
      `<button data-a="mine" class="opt${this.band === 'mine' ? ' on' : ''}">🎧 My music</button>`;
    const sts = !list ? '<div class="dim">Finding stations…</div>' : !list.length ? `<div class="dim">${this.band === 'mine' ? 'Tap 🎧 My music to pick songs from your device.' : 'No stations found. Try another band.'}</div>`
      : list.map((s, i) => `<button data-a="st:${i}" class="rd-st${this.on && i === this.idx ? ' on' : ''}">${this.on && i === this.idx ? '▶ ' : ''}${esc(s.name)}</button>`).join('');
    el.innerHTML = `<div class="rd-head"><b>📻 Namma Radio</b><button data-a="close" class="mini">✕</button></div>
      <div class="rd-bands">${bands}</div>
      <div class="rd-now"><span id="rd-now">${esc(this.on ? this.current()?.name || '' : 'Off')}</span></div>
      <div class="rd-ctrl"><button data-a="prev" class="mini">⏮</button><button data-a="${this.on ? 'off' : 'next'}" class="mini">${this.on ? '⏹ Off' : '▶ Play'}</button><button data-a="next" class="mini">⏭</button>
        <input id="rd-vol" type="range" min="0" max="1" step="0.05" value="${this.vol}"></div>
      <div class="rd-list">${sts}</div>
      <label class="rd-auto"><button data-a="auto" class="opt${this.autoVehicle ? ' on' : ''}">${this.autoVehicle ? '✓' : '○'} Radio on in vehicles</button></label>
      <div class="credits small">Live stations via radio-browser.info, streamed from the broadcasters.</div>`;
  }

  // ducking for voices, quieter at the club, auto-on in vehicles
  update(dt) {
    const g = this.game, a = g.audio;
    if (this.on) {
      const duck = (a._ducks || 0) > 0 ? 0.25 : 1;
      const club = 1 - Math.min(0.85, (a._clubLevel?.() || 0) * 0.9);
      const want = this.vol * duck * club * (a.muted ? 0 : 1);
      if (Math.abs(this.el.volume - want) > 0.01) this.el.volume += (want - this.el.volume) * Math.min(1, dt * 4);
    }
    const inVeh = g.player?.mode === 'drive';
    if (inVeh && !this._wasVeh && this.autoVehicle && !this.on) { this._auto = true; this.play(); }
    if (!inVeh && this._wasVeh && this._auto) { this._auto = false; this.stop(); }
    this._wasVeh = inVeh;
  }
}
