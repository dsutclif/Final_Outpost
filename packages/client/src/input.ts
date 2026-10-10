import { FP, type Input } from "@fo/sim";

// Floating virtual joystick (drag anywhere on the stage) and arrow/WASD keys, both turned
// into one fixed-point direction per tick. The maths is pure so it is unit tested.

export const JOY_DEAD = 6;
export const JOY_SAT = 50;
/** Drag distance beyond which the joystick base follows the finger. */
export const JOY_FOLLOW = 70;

/** Drag offset in CSS px to a fixed-point direction: zero inside the dead zone, full at saturation. */
export function joystickVector(dx: number, dy: number, dead = JOY_DEAD, sat = JOY_SAT): Input {
  const m = Math.hypot(dx, dy);
  if (!(m >= dead)) return { dx: 0, dy: 0 };
  const k = Math.min(1, m / sat) / m;
  // trunc toward zero keeps the magnitude at or below FP
  return { dx: Math.trunc(dx * k * FP) || 0, dy: Math.trunc(dy * k * FP) || 0 };
}

/** Knob offset for drawing: the drag clamped to the saturation radius. */
export function knobOffset(dx: number, dy: number, sat = JOY_SAT): { x: number; y: number } {
  const m = Math.hypot(dx, dy);
  if (m <= sat || m === 0) return { x: dx, y: dy };
  return { x: (dx * sat) / m, y: (dy * sat) / m };
}

export interface KeyState { left: boolean; right: boolean; up: boolean; down: boolean }

/** Arrow/WASD keys to a unit fixed-point direction (diagonals normalised). */
export function keysVector(k: KeyState): Input {
  const x = (k.right ? 1 : 0) - (k.left ? 1 : 0);
  const y = (k.down ? 1 : 0) - (k.up ? 1 : 0);
  if (x === 0 && y === 0) return { dx: 0, dy: 0 };
  const m = Math.hypot(x, y);
  return { dx: Math.trunc((x / m) * FP) || 0, dy: Math.trunc((y / m) * FP) || 0 };
}

const KEYMAP: Record<string, keyof KeyState> = {
  arrowleft: "left", a: "left", arrowright: "right", d: "right",
  arrowup: "up", w: "up", arrowdown: "down", s: "down",
};

/** DOM side: pointer and keyboard listeners plus the joystick visuals. */
export class InputController {
  private keys: KeyState = { left: false, right: false, up: false, down: false };
  private pointer: number | null = null;
  private ox = 0;
  private oy = 0;
  private x = 0;
  private y = 0;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly off: (() => void)[] = [];
  /** When false, input reads as zero and the joystick is hidden (menus open). */
  enabled = false;

  constructor(private readonly stage: HTMLElement) {
    const doc = stage.ownerDocument;
    this.base = doc.createElement("div");
    this.base.className = "joy-base";
    this.knob = doc.createElement("div");
    this.knob.className = "joy-knob";
    this.base.appendChild(this.knob);
    stage.appendChild(this.base);
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
      el.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(stage, "pointerdown", (e) => {
      if (!this.enabled || this.pointer !== null) return;
      if ((e.target as HTMLElement).closest(".overlay, button, .hud")) return;
      this.pointer = e.pointerId;
      const r = stage.getBoundingClientRect();
      this.ox = this.x = e.clientX - r.left;
      this.oy = this.y = e.clientY - r.top;
      try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      this.draw();
      e.preventDefault();
    }, { passive: false });
    on(stage, "pointermove", (e) => {
      if (e.pointerId !== this.pointer) return;
      const r = stage.getBoundingClientRect();
      this.x = e.clientX - r.left;
      this.y = e.clientY - r.top;
      // floating base: dragging past the rim pulls the base along, so reversing is instant
      const dx = this.x - this.ox, dy = this.y - this.oy, m = Math.hypot(dx, dy);
      if (m > JOY_FOLLOW) { this.ox = this.x - (dx / m) * JOY_FOLLOW; this.oy = this.y - (dy / m) * JOY_FOLLOW; }
      this.draw();
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.draw();
    };
    on(stage, "pointerup", end);
    on(stage, "pointercancel", end);
    const win = doc.defaultView ?? window;
    on(win, "keydown", (e) => {
      const k = KEYMAP[(e as KeyboardEvent).key.toLowerCase()];
      if (k) { this.keys[k] = true; if (this.enabled) e.preventDefault(); }
    });
    on(win, "keyup", (e) => {
      const k = KEYMAP[(e as KeyboardEvent).key.toLowerCase()];
      if (k) this.keys[k] = false;
    });
    on(win, "blur", () => { this.keys = { left: false, right: false, up: false, down: false }; this.pointer = null; this.draw(); });
  }

  read(): Input {
    if (!this.enabled) return { dx: 0, dy: 0 };
    if (this.pointer !== null) return joystickVector(this.x - this.ox, this.y - this.oy);
    return keysVector(this.keys);
  }

  release(): void {
    this.pointer = null;
    this.keys = { left: false, right: false, up: false, down: false };
    this.draw();
  }

  private draw(): void {
    const on = this.pointer !== null && this.enabled;
    this.base.style.display = on ? "block" : "none";
    if (!on) return;
    this.base.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    const k = knobOffset(this.x - this.ox, this.y - this.oy);
    this.knob.style.transform = `translate(${k.x}px, ${k.y}px)`;
  }

  dispose(): void {
    for (const f of this.off) f();
    this.base.remove();
  }
}
