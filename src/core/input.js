// Action-based input. Gameplay code reads actions ("throttle", "steer"), never raw keys,
// so keyboard, gamepad and touch all drive the same bike logic.

const KEYMAP = {
  KeyW: 'throttle', ArrowUp: 'throttle',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  KeyH: 'horn',
  KeyE: 'interact',
  KeyC: 'camera',
  KeyM: 'map',
  KeyP: 'phone', Tab: 'phone',
  Escape: 'pause',
  KeyL: 'indicator',
  KeyF: 'headlight',
  KeyR: 'radio',
  KeyO: 'photo',
  KeyV: 'ptt',
  KeyN: 'cam',
  Digit1: 'chat1', Digit2: 'chat2', Digit3: 'chat3', Digit4: 'chat4', Digit5: 'chat5', Digit6: 'chat6',
};

export class Input {
  constructor() {
    this.down = new Set();       // actions currently held
    this.pressed = new Set();    // actions pressed this frame (edge)
    this.axes = { steer: 0, throttle: 0, brake: 0 };
    this.mouse = { dx: 0, dy: 0, dragging: false };
    this.touch = { steer: 0, throttle: 0, brake: 0 };
    this.enabled = true;
    this.lastDevice = 'keyboard';
    this._gpPrev = {};
    this.tiltEnabled = false; this.tiltSteer = 0;
    window.addEventListener('deviceorientation', (e) => {
      if (!this.tiltEnabled || e.gamma == null) return;
      const landscape = (screen.orientation?.angle ?? window.orientation ?? 0) % 180 !== 0;
      const v = landscape ? (e.beta || 0) * (((screen.orientation?.angle ?? 90) === 90) ? 1 : -1) : e.gamma;
      this.tiltSteer = Math.max(-1, Math.min(1, v / 22));
    });

    const typing = (e) => { const t = e.target; return t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable); };
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      const a = KEYMAP[e.code];
      if (!a) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(a)) this.pressed.add(a);
      this.down.add(a);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.down.delete(a); });
    window.addEventListener('blur', () => this.down.clear());

    const canvasEl = () => document.getElementById('game-canvas');
    window.addEventListener('pointerdown', (e) => {
      if (e.target === canvasEl() && e.pointerType === 'mouse') { this.mouse.dragging = true; }
    });
    window.addEventListener('pointerup', () => { this.mouse.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (this.mouse.dragging) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
  }

  // Touch buttons call these
  setTouch(action, on) {
    this.lastDevice = 'touch';
    if (on) { if (!this.down.has(action)) this.pressed.add(action); this.down.add(action); }
    else this.down.delete(action);
  }

  isDown(a) { return this.enabled && this.down.has(a); }
  wasPressed(a) { return this.enabled && this.pressed.has(a); }

  poll() {
    // Gamepad (standard mapping)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    let gSteer = 0, gThrottle = 0, gBrake = 0;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      gSteer = dz(gp.axes[0] || 0);
      gThrottle = gp.buttons[7] ? gp.buttons[7].value : 0;
      gBrake = gp.buttons[6] ? gp.buttons[6].value : 0;
      const map = { 0: 'interact', 1: 'handbrake', 2: 'horn', 3: 'camera', 9: 'pause', 8: 'map', 5: 'boost', 12: 'phone' };
      for (const [idx, act] of Object.entries(map)) {
        const b = gp.buttons[idx]; const on = !!(b && b.pressed);
        if (on && !this._gpPrev[idx]) { this.pressed.add(act); }
        if (on) this.down.add(act); else if (this._gpPrev[idx]) this.down.delete(act);
        this._gpPrev[idx] = on;
      }
      if (Math.abs(gSteer) > 0 || gThrottle > 0.05 || gBrake > 0.05) this.lastDevice = 'gamepad';
      if (gp.axes[2] !== undefined && Math.abs(gp.axes[2]) > 0.2) this.mouse.dx += gp.axes[2] * 12;
    }
    const kSteer = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    const tilt = this.tiltEnabled && Math.abs(this.tiltSteer) > 0.08 ? this.tiltSteer : 0;
    this.axes.steer = this.enabled ? Math.max(-1, Math.min(1, kSteer + gSteer + tilt)) : 0;
    this.axes.throttle = this.enabled ? Math.max(this.down.has('throttle') ? 1 : 0, gThrottle) : 0;
    this.axes.brake = this.enabled ? Math.max(this.down.has('brake') ? 1 : 0, gBrake) : 0;
  }

  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; }
}
