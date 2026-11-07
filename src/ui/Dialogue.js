// Comic speech-bubble dialogue: typewriter text with per-character "voice" blips,
// optional Kannada line under the English, and numbered choices.

const $ = (id) => document.getElementById(id);

export class Dialogue {
  constructor(game) {
    this.game = game;
    this.el = $('dialogue');
    this.open = false;
    this._advance = null;
    this.el.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') this.advance(); });
  }

  // speaker: { name, color, pitch }
  say(speaker, text, kn = '') {
    return new Promise((resolve) => {
      this._show(speaker, kn);
      $('dlg-choices').innerHTML = '';
      $('dlg-next').style.display = '';
      this._type(text, speaker.pitch || 1, () => {});
      this._advance = () => {
        if (this.typing) { this._finishType(); return; }
        this._advance = null;
        resolve();
      };
    });
  }

  choose(speaker, text, options, kn = '') {
    return new Promise((resolve) => {
      this._show(speaker, kn);
      $('dlg-next').style.display = 'none';
      const box = $('dlg-choices');
      box.innerHTML = '';
      const pick = (i) => { this._advance = null; this.choosing = null; box.innerHTML = ''; this.game.audio?.click(); resolve(i); };
      this._type(text, speaker.pitch || 1, () => {
        options.forEach((o, i) => {
          const b = document.createElement('button');
          const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
          b.appendChild(n); b.appendChild(document.createTextNode(o));
          b.onclick = (e) => { e.stopPropagation(); pick(i); };
          box.appendChild(b);
        });
      });
      this.choosing = { n: options.length, pick };
      this._advance = () => { if (this.typing) this._finishType(); };
    });
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
      if (i % 2 === 0 && text[i] !== ' ') this.game.audio?.blip(pitch, i);
      if (i >= text.length) this._finishType();
    }, 22);
  }

  _finishType() {
    clearInterval(this._timer);
    $('dlg-text').textContent = this._full;
    if (this.typing) { this.typing = false; this._done?.(); }
  }

  advance() { this._advance?.(); }

  // number keys pick choices
  key(n) { if (this.choosing && n >= 1 && n <= this.choosing.n && !this.typing) this.choosing.pick(n - 1); }

  close() {
    if (this.open) this.closedAt = performance.now();
    this.open = false;
    this.choosing = null;
    this._advance = null;
    clearInterval(this._timer);
    this.el.classList.add('hidden');
  }
}
