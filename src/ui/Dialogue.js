// Comic speech-bubble dialogue, hands-free by default: each line is voiced (or gets a reading pause)
// and moves on by itself; reply choices pick a default after a countdown. Tap / Enter / click skips
// ahead, number keys pick a reply. Setting "Dialogue: Tap" makes every line wait for a tap instead.

const $ = (id) => document.getElementById(id);

export class Dialogue {
  constructor(game) {
    this.game = game;
    this.el = $('dialogue');
    this.open = false;
    this._advance = null;
    this.el.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') this.advance(); });
  }

  get auto() { return this.game.profile?.autoDialogue !== false; }

  // speaker: { name, color, pitch, voiceId }
  say(speaker, text, kn = '') {
    this._record(speaker, text);
    return new Promise((resolve) => {
      this._show(speaker, kn);
      $('dlg-choices').innerHTML = '';
      $('dlg-next').style.display = '';
      const token = (this._token = {});
      let typed = false, heard = false, finished = false;
      const finish = () => {
        if (finished || this._token !== token) return;
        finished = true;
        clearTimeout(this._autoT);
        this.game.audio?.stopVoice();
        this._advance = null;
        resolve();
      };
      const check = () => { if (this.auto && typed && heard) { clearTimeout(this._autoT); this._autoT = setTimeout(finish, 450); } };
      this._voice(speaker, text, token).then(() => { heard = true; check(); });
      this._type(text, speaker.pitch || 1, () => { typed = true; check(); });
      this._advance = () => { if (this.typing) this._finishType(); else finish(); };
    });
  }

  choose(speaker, text, options, kn = '', def = 0) {
    this._record(speaker, text);
    return new Promise((resolve) => {
      this._show(speaker, kn);
      $('dlg-next').style.display = 'none';
      const box = $('dlg-choices');
      box.innerHTML = '';
      const token = (this._token = {});
      let picked = false;
      const pick = (i) => {
        if (picked || this._token !== token) return;
        picked = true;
        clearTimeout(this._autoT);
        this.game.audio?.stopVoice();
        this._advance = null; this.choosing = null; box.innerHTML = '';
        this.game.audio?.click();
        resolve(i);
      };
      let typed = false, heard = false;
      const showOptions = () => {
        if (box.childElementCount || picked) return;
        options.forEach((o, i) => {
          const b = document.createElement('button');
          const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
          b.appendChild(n); b.appendChild(document.createTextNode(o));
          b.onclick = (e) => { e.stopPropagation(); pick(i); };
          box.appendChild(b);
        });
        if (this.auto) {
          // a countdown, then the default reply
          const bar = document.createElement('div');
          bar.className = 'dlg-timer';
          bar.innerHTML = '<i></i>';
          box.appendChild(bar);
          const wait = 7;
          requestAnimationFrame(() => { bar.firstChild.style.transition = `width ${wait}s linear`; bar.firstChild.style.width = '0%'; });
          this._autoT = setTimeout(() => pick(def), wait * 1000);
        }
      };
      const ready = () => { if (typed && heard) showOptions(); };
      this._voice(speaker, text, token).then(() => { heard = true; ready(); });
      this._type(text, speaker.pitch || 1, () => { typed = true; ready(); });
      // tapping while the question is still being read skips straight to the replies
      this._advance = () => { if (this.typing) this._finishType(); heard = true; this.game.audio?.stopVoice(); ready(); };
      this.choosing = { n: options.length, pick };
    });
  }

  // Play the line's voice; resolves when it has been heard (or after a reading pause if silent).
  async _voice(speaker, text, token) {
    const id = speaker.voiceId || speaker.name;
    this.voiced = !!this.game.audio?.voiceOn;
    let h = null;
    try { h = await this.game.audio?.speak(id, text, { pitch: speaker.pitch || 1 }); } catch {}
    if (this._token !== token) { h?.stop(); return; }
    this.voiced = !!h;
    if (h) await h.done;
    else {
      const words = String(text).split(/\s+/).length;
      await new Promise((r) => setTimeout(r, Math.max(1500, words * 330)));
    }
  }

  _record(speaker, text) {
    if (window.__recordLines) window.__recordLines.push({ id: speaker.voiceId || speaker.name, text, name: speaker.name });
  }

  _show(speaker, kn) {
    this.open = true;
    this.el.classList.remove('hidden');
    const nm = $('dlg-name');
    nm.textContent = speaker.name;
    nm.style.background = speaker.color || '#f07b5a';
    $('dlg-kn').textContent = kn || '';
  }

  _type(text, pitch, done) {
    const el = $('dlg-text');
    el.textContent = '';
    this.typing = true;
    this._full = text;
    this._done = done;
    let i = 0;
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      // without a recorded voice, the old comic "blips" stand in
      if (!this.voiced && i % 2 === 0 && text[i] !== ' ') this.game.audio?.blip(pitch, i);
      if (i >= text.length) this._finishType();
    }, 18);
  }

  _finishType() {
    clearInterval(this._timer);
    $('dlg-text').textContent = this._full;
    if (this.typing) { this.typing = false; this._done?.(); }
  }

  advance() { this._advance?.(); }

  // number keys pick choices
  key(n) { if (this.choosing && n >= 1 && n <= this.choosing.n) { if (this.typing) this._finishType(); this.choosing.pick(n - 1); } }

  close() {
    if (this.open) this.closedAt = performance.now();
    this.open = false;
    this.choosing = null;
    this._advance = null;
    this._token = null;
    clearTimeout(this._autoT);
    clearInterval(this._timer);
    this.game.audio?.stopVoice();
    this.el.classList.add('hidden');
  }
}
