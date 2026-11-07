// Executes story "steps" — the data format every scene, NPC and clue uses.
//
//   { s: 'ibarra', t: 'Line of dialogue' }         speaker line (s: 'narrator' for italic narration)
//   { caption: 'MEANWHILE…' }                     yellow comic caption box
//   { cam: { pos:[x,y,z], look:[x,y,z] } }          cinematic camera (can be attached to a line)
//   Lines advance on their own when the voice ends (GTA-style); tap/Enter skips ahead.
//   { choices: [{ t, then:[...], set, if, ifNot }] } branching
//   { set: 'flag' | ['a','b'] }, { unset: 'flag' }
//   { if: 'flag', then:[...], else:[...] }          (`if` may be an array = all required)
//   { do: 'action', ...args }                        engine action (see Game.actions)
//   { wait: seconds }
//
// Lines can also carry `anim` ('gesture'|'laugh'), `sfx`, `face` (npc id to turn toward the speaker).

export class Script {
  constructor(game) {
    this.game = game;
    this.el = {
      box: document.getElementById('dialogue'),
      name: document.getElementById('dlg-name'),
      text: document.getElementById('dlg-text'),
      choices: document.getElementById('dlg-choices'),
      next: document.getElementById('dlg-next'),
      caption: document.getElementById('caption'),
      letterbox: document.getElementById('letterbox'),
    };
    this.active = false;
    this.waiter = null;      // { kind:'advance'|'choice', resolve, ... }
    this.ambient = null;     // token of the walk-and-talk conversation playing, if any
    this.el.box.addEventListener('click', (e) => { if (!e.target.closest('.choice')) this._advance(); });
    this.el.caption.addEventListener('click', () => this._advance());
  }

  get flags() { return this.game.state.flags; }

  test(cond) {
    if (cond == null) return true;
    const arr = Array.isArray(cond) ? cond : [cond];
    return arr.every((c) => (c.startsWith('!') ? !this.flags[c.slice(1)] : !!this.flags[c]));
  }

  async run(steps, { cinematic = false } = {}) {
    if (!steps || !steps.length) return;
    const outer = !this.active;
    if (outer) this.stopAmbient();
    this.active = true;
    if (outer) {
      this.game.onScriptStart();
      if (cinematic) this.el.letterbox.classList.remove('hidden');
    }
    try {
      await this._runList(steps);
    } finally {
      if (outer) {
        this.active = false;
        this._hideAll();
        this.game.onScriptEnd();
      }
    }
  }

  // Walk-and-talk: lines play as subtitles + voice while the player keeps control.
  // A blocking scene (run) takes over and cuts the ambient conversation short.
  async runAmbient(steps) {
    this.stopAmbient();
    const token = (this.ambient = {});
    const alive = () => this.ambient === token && !this.game.aborting;
    const list = this._flatten(steps);
    // story state is applied at once, so cutting the conversation short never loses progress
    for (const st of list) {
      if (st.set) [].concat(st.set).forEach((f) => { this.flags[f] = true; });
      if (st.unset) [].concat(st.unset).forEach((f) => { delete this.flags[f]; });
    }
    for (const st of list) {
      if (!alive()) return;
      if (st.do) await this.game.action(st);
      if (st.wait) await this.game.sleep(st.wait * 1000);
      if (!alive()) return;
      if (st.t || st.caption) {
        const sp = st.t ? st.s : 'narrator';
        const text = st.t || st.caption;
        this._showSubtitle(sp, text, true);
        if (st.anim) this.game.animate(sp, st.anim);
        if (st.sfx) this.game.sfx(st.sfx);
        this.game.setTalking(sp);
        const v = st.voice === false ? null : await this.game.audio.playLine(sp, st.vt || text);
        await new Promise((res) => {
          const done = () => { clearTimeout(timer); res(); };
          const timer = setTimeout(done, (v ? v.duration + 0.35 : this._readTime(text)) * 1000);
          token.skip = done;
        });
        if (!alive()) return;
      }
    }
    if (this.ambient === token) this.stopAmbient(true);
  }

  stopAmbient(finished) {
    if (!this.ambient) return;
    const t = this.ambient;
    this.ambient = null;
    t.skip?.();
    this.el.box.classList.add('hidden');
    this.el.box.classList.remove('ambient');
    this.game.setTalking(null);
    if (!finished) this.game.audio.stopVoice();
    this.game.onAmbientEnd?.();
  }

  // Resolve if/else branches up front for ambient playback (no choices or cameras there).
  _flatten(steps, out = []) {
    for (const st of steps || []) {
      if (st.when && !this.test(st.when)) continue;
      if (st.if !== undefined) { this._flatten(this.test(st.if) ? st.then : st.else, out); continue; }
      out.push(st);
    }
    return out;
  }

  async _runList(steps) {
    for (const st of steps) {
      if (this.game.aborting) return;
      if (st.when && !this.test(st.when)) continue;
      await this._step(st);
    }
  }

  async _step(st) {
    const g = this.game;
    if (st.cam) g.setCinematic(st.cam);
    if (st.set) [].concat(st.set).forEach((f) => { this.flags[f] = true; });
    if (st.unset) [].concat(st.unset).forEach((f) => { delete this.flags[f]; });
    if (st.if !== undefined) {
      await this._runList(this.test(st.if) ? st.then || [] : st.else || []);
      return;
    }
    if (st.do) { await g.action(st); }
    if (st.wait) await g.sleep(st.wait * 1000);
    if (st.caption) await this._caption(st.caption, st.voice !== false);
    if (st.t) await this._line(st);
    if (st.choices) await this._choose(st);
  }

  _hideAll() {
    this.el.box.classList.add('hidden');
    this.el.caption.classList.add('hidden');
    this.el.letterbox.classList.add('hidden');
    this.game.clearCinematic();
    this.game.setTalking(null);
  }

  // How long an unvoiced line stays up: enough to read comfortably.
  _readTime(text) {
    const words = text.split(/\s+/).length;
    return Math.min(14, Math.max(1.8, 0.9 + words * 0.32));
  }

  // GTA-style subtitle: the speaker's name in their colour, the whole line at once.
  _showSubtitle(speaker, text, ambient = false) {
    const g = this.game;
    const sp = speaker && speaker !== 'narrator' ? g.story.characters[speaker] : null;
    this.el.caption.classList.add('hidden');
    this.el.box.classList.remove('hidden');
    this.el.box.classList.toggle('ambient', ambient);
    this.el.choices.innerHTML = '';
    this.el.name.textContent = sp ? sp.name : '';
    this.el.name.style.color = sp ? this.speakerColor(speaker) : '';
    this.el.text.classList.toggle('narration', !sp);
    this.el.text.textContent = this.flagsInterp(text);
    this.el.text.classList.remove('in'); void this.el.text.offsetWidth; this.el.text.classList.add('in');
  }

  speakerColor(id) {
    const c = this.game.story.characters[id];
    if (c?.color) return c.color;
    if (id === this.game.playerId) return '#9fd4ff';
    const palette = ['#f0b429', '#7bd34f', '#ff8a5c', '#d7a6ff', '#5fd1c9', '#ff6b8b', '#ffd36a'];
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }

  async _caption(text, voiced = true) {
    const a = this.game.audio;
    this.el.box.classList.add('hidden');
    this.el.caption.textContent = text;
    this.el.caption.classList.remove('hidden');
    a.page();
    const v = voiced ? await a.playLine('narrator', text) : null;
    await this._waitLine(v, this._readTime(text) * (voiced ? 1 : 1.25));
    a.stopVoice();
    this.el.caption.classList.add('hidden');
  }

  async _line(st) {
    const g = this.game;
    const sp = st.s && st.s !== 'narrator' ? g.story.characters[st.s] : null;
    this._showSubtitle(st.s, st.t);
    g.setTalking(st.s);
    if (st.anim) g.animate(st.s, st.anim);
    if (st.sfx) g.sfx(st.sfx);
    if (!st.cam && sp) g.focusSpeaker(st.s);
    const v = await g.audio.playLine(st.s, st.vt || st.t);
    await this._waitLine(v, this._readTime(st.t));
    g.audio.stopVoice();
  }

  flagsInterp(text) {
    return text.replace(/\{player\}/g, this.game.story.characters[this.game.playerId]?.name || '');
  }

  // A line ends by itself when its voice finishes (or after a reading pause if unvoiced).
  // Tapping / Enter skips ahead. With auto dialogue switched off, it waits for the tap.
  _waitLine(voice, readSec) {
    const auto = this.game.settings.autoDialogue;
    this.el.next.classList.toggle('hidden', auto);
    return new Promise((resolve) => {
      const w = { kind: 'advance', resolve, at: performance.now() };
      this.waiter = w;
      const finish = () => { if (this.waiter === w) { this.waiter = null; resolve(); } };
      if (!auto) return;
      if (voice) voice.ended.then(() => setTimeout(finish, 350));
      // safety net in case the clip never reports its end
      setTimeout(finish, ((voice ? voice.duration + 1.5 : 0) || readSec) * 1000);
    });
  }

  _advance() {
    const w = this.waiter;
    if (w && w.kind === 'advance' && performance.now() - w.at > 150) {
      this.waiter = null;
      w.resolve();
    }
  }

  // Choices pick themselves after a short countdown (the default, else the first new option),
  // so conversations keep flowing; the player can still choose.
  async _choose(st) {
    const opts = st.choices.filter((c) => this.test(c.if) && !(c.ifNot && this.test(c.ifNot)) && !(c.once && this.flags['_ch_' + c.once]));
    if (!opts.length) return;
    this.el.box.classList.remove('hidden', 'ambient');
    this.el.next.classList.add('hidden');
    this.el.name.textContent = this.game.story.characters[this.game.playerId]?.name || '';
    this.el.name.style.color = this.speakerColor(this.game.playerId);
    this.el.text.textContent = st.prompt || '';
    this.el.choices.innerHTML = '';
    const auto = this.game.settings.autoDialogue;
    const fallback = opts.find((c) => c.default) || opts.find((c) => !c.exit) || opts[0];
    const seconds = st.timer || 7;
    const picked = await new Promise((resolve) => {
      opts.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.innerHTML = `<span class="n">${i + 1}</span>`;
        b.appendChild(document.createTextNode(c.t));
        const pick = (e) => { e && e.preventDefault(); e && e.stopPropagation(); if (this.waiter?.kind === 'choice') { this.waiter = null; resolve(c); } };
        b.addEventListener('click', pick);
        b.addEventListener('touchend', pick);
        this.el.choices.appendChild(b);
      });
      if (auto) {
        const bar = document.createElement('div');
        bar.className = 'choice-timer';
        bar.style.animationDuration = `${seconds}s`;
        this.el.choices.appendChild(bar);
      }
      const w = { kind: 'choice', resolve, opts, sel: Math.max(0, opts.indexOf(fallback)) };
      this.waiter = w;
      this._highlight();
      if (auto) setTimeout(() => { if (this.waiter === w) { this.waiter = null; resolve(fallback); } }, seconds * 1000);
    });
    this.game.audio.select();
    this.el.choices.innerHTML = '';
    if (picked.once) this.flags['_ch_' + picked.once] = true;
    if (picked.set) [].concat(picked.set).forEach((f) => { this.flags[f] = true; });
    // the player character speaks the chosen reply
    const said = (picked.t || '').replace(/\[[^\]]*\]\s*/g, '').trim();
    if (said && !picked.silent) await this._line({ s: this.game.playerId, t: said, vt: picked.t });
    if (picked.then) await this._runList(picked.then);
    if (st.loop && !picked.exit) await this._choose(st);
  }

  _highlight() {
    const w = this.waiter;
    [...this.el.choices.children].forEach((b, i) => b.classList.toggle('sel', w && i === w.sel));
  }

  // Called by the game loop with the frame's input.
  update(input) {
    const w = this.waiter;
    if (!w) return;
    if (w.kind === 'advance') {
      if (input.consume('advance') || input.consume('interact')) this._advance();
    } else if (w.kind === 'choice') {
      for (let i = 0; i < w.opts.length; i++) {
        if (input.consume('choice' + (i + 1))) { this.waiter = null; w.resolve(w.opts[i]); return; }
      }
      if (input.consume('up')) { w.sel = (w.sel + w.opts.length - 1) % w.opts.length; this._highlight(); }
      if (input.consume('down')) { w.sel = (w.sel + 1) % w.opts.length; this._highlight(); }
      if (input.isTouch) return; // touch users tap the buttons directly
      if (input.consume('advance')) { this.waiter = null; w.resolve(w.opts[w.sel]); }
    }
  }

  cancel() {
    this.stopAmbient();
    const w = this.waiter;
    this.waiter = null;
    if (w) w.resolve(w.kind === 'choice' ? { t: '' } : undefined);
  }
}
