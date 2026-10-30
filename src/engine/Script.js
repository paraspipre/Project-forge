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
    if (st.caption) await this._caption(st.caption);
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

  _caption(text) {
    this.el.box.classList.add('hidden');
    this.el.caption.textContent = text;
    this.el.caption.classList.remove('hidden');
    this.game.audio.blip();
    return this._waitAdvance().then(() => this.el.caption.classList.add('hidden'));
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
    await this._type(this.flagsInterp(st.t));
    this.el.next.classList.remove('hidden');
    await this._waitAdvance();
    this.el.next.classList.add('hidden');
  }

  flagsInterp(text) {
    return text.replace(/\{player\}/g, this.game.story.characters[this.game.playerId]?.name || '');
  }

  _type(text) {
    return new Promise((resolve) => {
      const el = this.el.text;
      el.textContent = '';
      let i = 0;
      const speed = 28; // chars / 100ms-ish
      const tick = () => {
        i = Math.min(text.length, i + 2);
        el.textContent = text.slice(0, i);
        if (i % 6 === 0) this.game.audio.blip();
        if (i >= text.length) { this.typing = null; resolve(); return; }
        this.typing = setTimeout(tick, 1000 / speed);
      };
      this.finishTyping = () => { clearTimeout(this.typing); this.typing = null; el.textContent = text; resolve(); };
      tick();
    });
  }

  _waitAdvance() {
    return new Promise((resolve) => { this.waiter = { kind: 'advance', resolve, at: performance.now() }; });
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
