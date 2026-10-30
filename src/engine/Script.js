// Executes story "steps" — the data format every scene, NPC and clue uses.
//
//   { s: 'ibarra', t: 'Line of dialogue' }         speaker line (s: 'narrator' for italic narration)
//   { caption: 'MEANWHILE…' }                     yellow comic caption box
//   { cam: { pos:[x,y,z], look:[x,y,z] } }          cinematic camera (can be attached to a line)
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
    this.typing = null;
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

  async _caption(text, voiced = true) {
    const a = this.game.audio;
    this.el.box.classList.add('hidden');
    this.el.caption.textContent = text;
    this.el.caption.classList.remove('hidden');
    a.page();
    const v = voiced ? await a.playLine('narrator', text) : null;
    await this._waitAdvance(v);
    a.stopVoice();
    this.el.caption.classList.add('hidden');
  }

  async _line(st) {
    const g = this.game;
    const sp = st.s && st.s !== 'narrator' ? g.story.characters[st.s] : null;
    const name = sp ? sp.name : '';
    this.el.caption.classList.add('hidden');
    this.el.box.classList.remove('hidden');
    this.el.choices.innerHTML = '';
    this.el.name.textContent = name;
    this.el.text.classList.toggle('narration', !sp);
    g.setTalking(st.s);
    if (st.anim) g.animate(st.s, st.anim);
    if (st.sfx) g.sfx(st.sfx);
    if (!st.cam && sp) g.focusSpeaker(st.s);
    const v = await g.audio.playLine(st.s, st.vt || st.t);
    await this._type(this.flagsInterp(st.t), v && v.duration);
    this.el.next.classList.remove('hidden');
    await this._waitAdvance(v);
    g.audio.stopVoice();
    this.el.next.classList.add('hidden');
  }

  flagsInterp(text) {
    return text.replace(/\{player\}/g, this.game.story.characters[this.game.playerId]?.name || '');
  }

  // Typewriter; when a voice clip plays, the text is paced to finish with the speech.
  _type(text, voiceDur) {
    return new Promise((resolve) => {
      const el = this.el.text;
      el.textContent = '';
      let i = 0;
      const speed = voiceDur ? Math.max(14, (text.length / 2) / (voiceDur * 0.85)) : 28; // ticks per second
      const tick = () => {
        i = Math.min(text.length, i + 2);
        el.textContent = text.slice(0, i);
        if (!voiceDur && i % 6 === 0) this.game.audio.blip();
        if (i >= text.length) { this.typing = null; resolve(); return; }
        this.typing = setTimeout(tick, 1000 / speed);
      };
      this.finishTyping = () => { clearTimeout(this.typing); this.typing = null; el.textContent = text; resolve(); };
      tick();
    });
  }

  // Waits for the player; with auto-dialogue on, a voiced line also advances itself once spoken.
  _waitAdvance(voice) {
    return new Promise((resolve) => {
      const w = { kind: 'advance', resolve, at: performance.now() };
      this.waiter = w;
      if (voice && this.game.settings.autoDialogue) {
        voice.ended.then(() => setTimeout(() => { if (this.waiter === w) { this.waiter = null; resolve(); } }, 700));
      }
    });
  }

  _advance() {
    if (this.typing) { this.finishTyping(); return; }
    const w = this.waiter;
    if (w && w.kind === 'advance' && performance.now() - w.at > 120) {
      this.waiter = null;
      w.resolve();
    }
  }

  async _choose(st) {
    const opts = st.choices.filter((c) => this.test(c.if) && !(c.ifNot && this.test(c.ifNot)) && !(c.once && this.flags['_ch_' + c.once]));
    if (!opts.length) return;
    this.el.box.classList.remove('hidden');
    this.el.next.classList.add('hidden');
    if (!st.t) { this.el.name.textContent = this.game.story.characters[this.game.playerId]?.name || ''; this.el.text.textContent = st.prompt || ''; }
    this.el.choices.innerHTML = '';
    const picked = await new Promise((resolve) => {
      opts.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.innerHTML = `<span class="n">${i + 1}</span>`;
        b.appendChild(document.createTextNode(c.t));
        const pick = (e) => { e && e.preventDefault(); e && e.stopPropagation(); this.waiter = null; resolve(c); };
        b.addEventListener('click', pick);
        b.addEventListener('touchend', pick);
        this.el.choices.appendChild(b);
      });
      this.waiter = { kind: 'choice', resolve, opts, sel: 0 };
      this._highlight();
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
    if (!w) { if (this.typing && input.consume('advance')) this.finishTyping(); return; }
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
    clearTimeout(this.typing);
    this.typing = null;
    const w = this.waiter;
    this.waiter = null;
    if (w) w.resolve(w.kind === 'choice' ? { t: '' } : undefined);
  }
}
