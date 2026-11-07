// Unified input: keyboard + mouse, touch joystick + look-drag + buttons, and gamepads.
// Game code reads `move` (-1..1), `look` deltas, `run`, and edge-triggered actions via pressed().

const KEYMAP = {
  Space: 'jump', KeyE: 'interact', KeyF: 'interact', KeyR: 'ride', KeyQ: 'emote', KeyT: 'chat', Enter: 'chat',
  KeyM: 'map', Escape: 'pause', KeyP: 'pause', KeyH: 'horn', KeyC: 'camera',
  Digit1: 'n1', Digit2: 'n2', Digit3: 'n3', Digit4: 'n4', Digit5: 'n5', Digit6: 'n6', Digit7: 'n7', Digit8: 'n8', Digit9: 'n9',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.zoom = 0;
    this.edges = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch');
    this.enabled = true;
    this.joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null };
    this.drag = null;
    this.knob = document.getElementById('joy-knob');

    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
    addEventListener('keydown', (e) => {
      if (typing()) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) this.edges.add(a);
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') this.edges.add('advance');
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // mouse: drag to orbit the camera, wheel to zoom, click advances dialogue
    canvas.addEventListener('mousedown', (e) => { if (!this.isTouch) this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.lookDelta.x += e.movementX; this.lookDelta.y += e.movementY; return; }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.lookDelta.x += dx; this.lookDelta.y += dy;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    addEventListener('mouseup', () => { if (this.drag && this.drag.moved < 6) this.edges.add('click'); this.drag = null; });
    canvas.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch: left part of the screen = joystick, the rest = look
    const joyEl = document.getElementById('joy');
    canvas.addEventListener('touchstart', (e) => this._touchStart(e), { passive: false });
    joyEl.addEventListener('touchstart', (e) => this._touchStart(e), { passive: false });
    addEventListener('touchmove', (e) => this._touchMove(e), { passive: false });
    addEventListener('touchend', (e) => this._touchEnd(e));
    addEventListener('touchcancel', (e) => this._touchEnd(e));

    const bind = (id, action, hold) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.edges.add(action); if (hold) this.keys.add(hold); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (hold) this.keys.delete(hold); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.stopPropagation(); this.edges.add(action); });
    };
    bind('t-jump', 'jump', 'TouchJump');
    bind('t-act', 'interact');
    bind('t-ride', 'ride');
    bind('t-emote', 'emote');
    bind('t-chat', 'chat');
    this.padPrev = [];
    addEventListener('gamepadconnected', () => { this.hasPad = true; });
  }

  _touchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.42 && this.joy.id === null) {
        const r = document.getElementById('joy').getBoundingClientRect();
        const inside = t.clientX > r.left - 50 && t.clientX < r.right + 50 && t.clientY > r.top - 50 && t.clientY < r.bottom + 50;
        this.joy.id = t.identifier;
        this.joy.cx = inside ? r.left + r.width / 2 : t.clientX;
        this.joy.cy = inside ? r.top + r.height / 2 : t.clientY;
        this._updateJoy(t.clientX, t.clientY);
      } else if (this.lookTouch.id === null) {
        this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() };
      } else if (this.pinch == null) {
        this.pinch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  }

  _touchMove(e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) this._updateJoy(t.clientX, t.clientY);
      else if (t.identifier === this.lookTouch.id) {
        this.lookDelta.x += (t.clientX - this.lookTouch.x) * 1.5;
        this.lookDelta.y += (t.clientY - this.lookTouch.y) * 1.5;
        this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
      }
    }
  }

  _touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        this.joy.id = null; this.joy.x = this.joy.y = 0;
        if (this.knob) this.knob.style.transform = '';
      } else if (t.identifier === this.lookTouch.id) {
        const lt = this.lookTouch;
        if (Math.hypot(t.clientX - lt.sx, t.clientY - lt.sy) < 12 && performance.now() - lt.t < 300) this.edges.add('click');
        this.lookTouch = { id: null };
      } else if (this.pinch && t.identifier === this.pinch.id) this.pinch = null;
    }
  }

  _updateJoy(x, y) {
    const R = 55;
    let dx = x - this.joy.cx, dy = y - this.joy.cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    this.joy.x = dx / R; this.joy.y = dy / R;
    if (this.knob) this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Standard gamepad: sticks move/look, A jump, X interact, Y ride, B emote, Start pause, Back map.
  _pollPad() {
    if (!this.hasPad || !navigator.getGamepads) return null;
    const gp = [...navigator.getGamepads()].find((g) => g && g.connected);
    if (!gp) return null;
    const b = gp.buttons.map((x) => x.pressed);
    const edge = (i, a) => { if (b[i] && !this.padPrev[i]) this.edges.add(a); };
    edge(0, 'jump'); edge(0, 'advance'); edge(2, 'interact'); edge(3, 'ride'); edge(1, 'emote'); edge(9, 'pause'); edge(8, 'map');
    edge(12, 'n1'); edge(13, 'n2'); edge(14, 'n3'); edge(15, 'n4'); edge(5, 'horn');
    this.padRun = b[10] || b[6] || b[7];
    this.padPrev = b;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.lookDelta.x += dz(gp.axes[2] || 0) * 16;
    this.lookDelta.y += dz(gp.axes[3] || 0) * 10;
    return { x: dz(gp.axes[0] || 0), y: dz(gp.axes[1] || 0) };
  }

  pressed(a) { return this.edges.has(a); }
  consume(a) { const had = this.edges.has(a); this.edges.delete(a); return had; }
  held(code) { return this.keys.has(code); }

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
    if (len < 0.1) { x = 0; y = 0; }
    if (!this.enabled) { x = 0; y = 0; }
    this.move.x = x; this.move.y = y;
    this.run = k.has('ShiftLeft') || k.has('ShiftRight') || (this.joy.id !== null && len > 0.92) || !!this.padRun;
    this.jumpHeld = k.has('Space') || k.has('TouchJump');
  }

  takeLook() {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = this.lookDelta.y = 0;
    return d;
  }

  takeZoom() { const z = this.zoom; this.zoom = 0; return z; }

  endFrame() { this.edges.clear(); }
}
