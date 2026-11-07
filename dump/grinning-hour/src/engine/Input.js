// Unified input: keyboard + mouse on desktop, virtual joystick + look-drag on touch.
// Consumers read `move` (x,y in -1..1), `look` deltas, and edge-triggered `pressed(action)`.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.edges = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch');

    this.joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.mouseDrag = null;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const map = {
        KeyE: 'interact', KeyF: 'interact', KeyJ: 'attack', KeyK: 'attack', Space: 'dodge', ShiftLeft: 'dodge', KeyL: 'dodge', KeyQ: 'scan', Tab: 'scan',
        Enter: 'advance', Escape: 'pause', KeyP: 'pause',
        Digit1: 'choice1', Digit2: 'choice2', Digit3: 'choice3', Digit4: 'choice4', ArrowUp: 'up', ArrowDown: 'down',
      };
      if (map[e.code]) this.edges.add(map[e.code]);
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') this.edges.add('advance');
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Mouse: drag to look, click to attack (desktop only).
    canvas.addEventListener('mousedown', (e) => {
      if (this.isTouch) return;
      this.mouseDrag = { x: e.clientX, y: e.clientY, moved: 0 };
    });
    addEventListener('mousemove', (e) => {
      if (!this.mouseDrag) return;
      const dx = e.clientX - this.mouseDrag.x, dy = e.clientY - this.mouseDrag.y;
      this.lookDelta.x += dx; this.lookDelta.y += dy;
      this.mouseDrag.moved += Math.abs(dx) + Math.abs(dy);
      this.mouseDrag.x = e.clientX; this.mouseDrag.y = e.clientY;
    });
    addEventListener('mouseup', () => {
      if (this.mouseDrag && this.mouseDrag.moved < 6) { this.edges.add('attack'); this.edges.add('advance'); }
      this.mouseDrag = null;
    });

    // Touch: left half = joystick, right half = look.
    const joyEl = document.getElementById('joy');
    this.knob = document.getElementById('joy-knob');
    canvas.addEventListener('touchstart', (e) => this._touchStart(e), { passive: false });
    joyEl.addEventListener('touchstart', (e) => this._touchStart(e), { passive: false });
    addEventListener('touchmove', (e) => this._touchMove(e), { passive: false });
    addEventListener('touchend', (e) => this._touchEnd(e));
    addEventListener('touchcancel', (e) => this._touchEnd(e));

    const bind = (id, action) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.edges.add(action); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.stopPropagation(); this.edges.add(action); });
    };
    bind('btn-attack', 'attack');
    bind('btn-dodge', 'dodge');
    bind('btn-scan', 'scan');
    this.padPrev = [];
    addEventListener('gamepadconnected', () => { this.hasPad = true; document.body.classList.add('pad'); });
    bind('btn-interact', 'interact');
  }

  _touchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && this.joy.id === null) {
        const r = document.getElementById('joy').getBoundingClientRect();
        // Joystick recenters under the thumb if touched outside the base.
        const inside = t.clientX > r.left - 40 && t.clientX < r.right + 40 && t.clientY > r.top - 40 && t.clientY < r.bottom + 40;
        this.joy.id = t.identifier;
        this.joy.cx = inside ? r.left + r.width / 2 : t.clientX;
        this.joy.cy = inside ? r.top + r.height / 2 : t.clientY;
        this._updateJoy(t.clientX, t.clientY);
      } else if (this.lookTouch.id === null) {
        this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() };
      }
    }
  }

  _touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) this._updateJoy(t.clientX, t.clientY);
      else if (t.identifier === this.lookTouch.id) {
        this.lookDelta.x += (t.clientX - this.lookTouch.x) * 1.4;
        this.lookDelta.y += (t.clientY - this.lookTouch.y) * 1.4;
        this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
      }
    }
  }

  _touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        this.joy.id = null; this.joy.x = this.joy.y = 0;
        this.knob.style.transform = '';
      } else if (t.identifier === this.lookTouch.id) {
        const lt = this.lookTouch;
        if (Math.hypot(t.clientX - lt.sx, t.clientY - lt.sy) < 12 && performance.now() - lt.t < 300) this.edges.add('advance');
        this.lookTouch = { id: null };
      }
    }
  }

  _updateJoy(x, y) {
    const R = 50;
    let dx = x - this.joy.cx, dy = y - this.joy.cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    this.joy.x = dx / R; this.joy.y = dy / R;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Standard-mapping gamepad: left stick move, right stick look,
  // A interact/advance, X attack, B evade/counter, Y scan, Start pause, D-pad choices.
  _pollPad() {
    if (!this.hasPad || !navigator.getGamepads) return null;
    const gp = [...navigator.getGamepads()].find((g) => g && g.connected);
    if (!gp) return null;
    const b = gp.buttons.map((x) => x.pressed);
    const edge = (i, action) => { if (b[i] && !this.padPrev[i]) this.edges.add(action); };
    edge(0, 'interact'); edge(0, 'advance'); edge(2, 'attack'); edge(1, 'dodge'); edge(3, 'scan'); edge(5, 'attack');
    edge(9, 'pause'); edge(12, 'up'); edge(13, 'down');
    this.padPrev = b;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    this.lookDelta.x += rx * 14; this.lookDelta.y += ry * 9;
    return { x: dz(gp.axes[0] || 0), y: dz(gp.axes[1] || 0) };
  }

  pressed(action) { return this.edges.has(action); }
  consume(action) { const had = this.edges.has(action); this.edges.delete(action); return had; }

  // Called once per frame before game logic.
  update() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.joy.id !== null) { x = this.joy.x; y = this.joy.y; }
    const pad = this._pollPad();
    if (pad && Math.hypot(pad.x, pad.y) > 0.15) { x = pad.x; y = pad.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    // small dead zone for thumbs
    if (len < 0.12) { x = 0; y = 0; }
    this.move.x = x; this.move.y = y;
    this.running = k.has('ShiftRight') || len > 0.92;
  }

  takeLook() {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = this.lookDelta.y = 0;
    return d;
  }

  // Clear edge triggers at frame end.
  endFrame() { this.edges.clear(); }
}
