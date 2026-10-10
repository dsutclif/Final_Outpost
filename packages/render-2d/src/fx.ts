import type { DC } from "./draw/dc.js";
import { drawItem } from "./draw/items.js";
import { TAU, circle, label, lerp } from "./draw/prim.js";
import type { V } from "./view.js";

// Event juice: floaters, items arcing onto/off the back stack, coins flying to the HUD,
// particles, rings, hit flashes and build pops. Purely visual; nothing feeds back to the sim.

interface Floater { x: number; y: number; text: string; color: string; t: number; life: number; size: number }
interface Arc { res: string; from: V; to: V | null; t: number; dur: number; h: number }
interface Coin { from: V; to: V; t: number; dur: number; delay: number }
interface Part { x: number; y: number; vx: number; vy: number; grav: number; t: number; life: number; color: string; size: number; spin: number }
interface Ring { x: number; y: number; t: number; dur: number; r: number; color: string }
interface Knock { x: number; y: number; t: number }
interface Tracer { x1: number; y1: number; x2: number; y2: number; t: number; color: string }
interface Confetto { x: number; y: number; vx: number; vy: number; rot: number; vr: number; color: string; w: number; h: number; t: number }

const KNOCK_DUR = 0.22;

export class Fx {
  floaters: Floater[] = [];
  arcs: Arc[] = [];
  coins: Coin[] = [];
  parts: Part[] = [];
  rings: Ring[] = [];
  tracers: Tracer[] = [];
  confetti: Confetto[] = [];
  private knocks = new Map<string, Knock>();
  /** Visible world x range, so floaters near the edge stay readable. */
  viewX0 = -Infinity;
  viewX1 = Infinity;
  /** Particle count multiplier from the quality setting. */
  density = 1;
  private flashes = new Map<string, number>();
  private pops = new Map<string, number>();
  shake = 0;
  /** Seconds since init; set by the renderer before each update. */
  now = 0;
  /** Called once per coin that reaches the HUD. */
  onCoinLanded: (() => void) | null = null;

  update(dt: number): void {
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    for (const a of this.arcs) a.t += dt;
    this.arcs = this.arcs.filter((a) => a.t < a.dur);
    for (const c of this.coins) {
      const before = c.t;
      c.t += dt;
      if (before < c.delay + c.dur && c.t >= c.delay + c.dur) this.onCoinLanded?.();
    }
    this.coins = this.coins.filter((c) => c.t < c.delay + c.dur);
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const tr of this.tracers) tr.t += dt;
    this.tracers = this.tracers.filter((tr) => tr.t < 0.12);
    for (const c of this.confetti) { c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy = Math.min(140, c.vy + 260 * dt); c.vx *= 1 - dt * 0.8; c.rot += c.vr * dt; }
    this.confetti = this.confetti.filter((c) => c.t < 4.5);
    for (const [k, kn] of this.knocks) { kn.t += dt; if (kn.t >= KNOCK_DUR) this.knocks.delete(k); }
    this.shake = Math.max(0, this.shake - dt * 18);
    if (this.floaters.length > 40) this.floaters.splice(0, this.floaters.length - 40);
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  floater(x: number, y: number, text: string, color: string, size = 15): void {
    // stagger overlapping floaters so a burst of events stays readable
    const near = this.floaters.filter((f) => Math.abs(f.x - x) < 30 && Math.abs(f.y - y) < 14 && f.t < 0.4).length;
    this.floaters.push({ x, y: y - near * 14, text, color, t: 0, life: 1.1, size });
  }

  /** Item flying from a point to the player's back (to = null) or to a point. */
  arc(res: string, from: V, to: V | null, dur = 0.32): void {
    this.arcs.push({ res, from: { ...from }, to: to ? { ...to } : null, t: 0, dur, h: 34 });
  }

  inFlightToPlayer(res: string): number {
    let n = 0;
    for (const a of this.arcs) if (a.to === null && a.res === res) n++;
    return n;
  }

  coinsToHud(from: V, to: V, n: number): void {
    for (let i = 0; i < n; i++) this.coins.push({ from: { x: from.x + (i % 3) * 4 - 4, y: from.y - i * 2 }, to, t: 0, dur: 0.55, delay: i * 0.05 });
  }

  /** Push an entity away from a hit for a moment (drawn offset, never fed back). */
  knock(key: string, dx: number, dy: number): void {
    const m = Math.hypot(dx, dy) || 1;
    this.knocks.set(key, { x: (dx / m) * 7, y: (dy / m) * 7, t: 0 });
  }

  knockOff(key: string): V | null {
    const kn = this.knocks.get(key);
    if (!kn) return null;
    const k = 1 - kn.t / KNOCK_DUR;
    const e = k * k;
    return { x: kn.x * e, y: kn.y * e };
  }

  tracer(from: V, to: V, color: string): void {
    this.tracers.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, t: 0, color });
  }

  /** Screen-space confetti shower from the top edge (CSS px). */
  confettiShower(w: number, colors: readonly string[], n = 110): void {
    const count = Math.round(n * this.density);
    for (let i = 0; i < count; i++) {
      this.confetti.push({
        x: Math.random() * w, y: -20 - Math.random() * 180, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 90,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, color: colors[i % colors.length]!, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, t: 0,
      });
    }
  }

  burst(x: number, y: number, colors: readonly string[], n: number, speed = 90, grav = 160, size = 3, life = 0.7): void {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.6;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.6, grav, t: 0, life: life * (0.7 + Math.random() * 0.6), color: colors[i % colors.length]!, size: size * (0.6 + Math.random() * 0.8), spin: Math.random() * TAU });
    }
  }

  dust(x: number, y: number, color: string, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.parts.push({ x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 4, vx: Math.cos(a) * 50, vy: Math.sin(a) * 18 - 10, grav: -10, t: 0, life: 0.6, color, size: 6 + Math.random() * 4, spin: 0 });
    }
  }

  ring(x: number, y: number, color: string, r = 40, dur = 0.5): void {
    this.rings.push({ x, y, t: 0, dur, r, color });
  }

  flash(key: string, sec = 0.14): void { this.flashes.set(key, this.now + sec); }
  flashK(key: string): number {
    const until = this.flashes.get(key);
    if (until === undefined) return 0;
    const left = until - this.now;
    if (left <= 0) { this.flashes.delete(key); return 0; }
    return Math.min(1, left / 0.1);
  }

  pop(key: string): void { this.pops.set(key, this.now); }
  popAge(key: string): number {
    const s = this.pops.get(key);
    if (s === undefined) return Infinity;
    const age = this.now - s;
    if (age > 2) { this.pops.delete(key); return Infinity; }
    return age;
  }

  clear(): void {
    this.floaters = []; this.arcs = []; this.coins = []; this.parts = []; this.rings = [];
    this.tracers = []; this.confetti = []; this.knocks.clear();
    this.flashes.clear(); this.pops.clear(); this.shake = 0;
  }

  /** World-space effects; call inside the camera transform. */
  drawWorld(dc: DC, player: V): void {
    const g = dc.g;
    for (const r of this.rings) {
      const k = r.t / r.dur;
      g.beginPath(); g.ellipse(r.x, r.y, r.r * (0.3 + 0.7 * k), r.r * 0.45 * (0.3 + 0.7 * k), 0, 0, TAU);
      g.strokeStyle = r.color; g.globalAlpha = 1 - k; g.lineWidth = 4 * (1 - k) + 1; g.stroke(); g.globalAlpha = 1;
    }
    for (const p of this.parts) {
      const k = p.t / p.life;
      g.globalAlpha = 1 - k;
      if (p.spin) {
        g.save(); g.translate(p.x, p.y); g.rotate(p.spin + p.t * 8);
        g.fillStyle = p.color; g.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        g.restore();
      } else circle(g, p.x, p.y, p.size * (0.6 + k * 0.6), p.color);
    }
    g.globalAlpha = 1;
    for (const tr of this.tracers) {
      g.globalAlpha = 1 - tr.t / 0.12;
      g.beginPath(); g.moveTo(tr.x1, tr.y1); g.lineTo(tr.x2, tr.y2);
      g.strokeStyle = tr.color; g.lineWidth = 3; g.lineCap = "round"; g.stroke();
    }
    g.globalAlpha = 1;
    for (const a of this.arcs) {
      const k = a.t / a.dur;
      const to = a.to ?? { x: player.x, y: player.y - 34 };
      const x = lerp(a.from.x, to.x, k), y = lerp(a.from.y, to.y, k) - Math.sin(k * Math.PI) * a.h;
      drawItem(dc, a.res, x, y, 1 + Math.sin(k * Math.PI) * 0.25);
    }
    for (const f of this.floaters) {
      const k = f.t / f.life;
      const rise = (1 - (1 - k) * (1 - k)) * 34;
      const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : k < 0.3 ? 1.1 - ((k - 0.15) / 0.15) * 0.1 : 1;
      g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const half = f.text.length * f.size * 0.3 + 4;
      const fx = Math.max(this.viewX0 + half, Math.min(this.viewX1 - half, f.x));
      label(g, f.text, fx, f.y - rise, f.size * s, f.color);
      g.globalAlpha = 1;
    }
  }

  /** Screen-space effects (coins flying to the HUD); call with an identity * dpr transform. */
  drawScreen(dc: DC): void {
    const g = dc.g;
    for (const c of this.confetti) {
      g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.scale(1, Math.abs(Math.cos(c.rot * 1.3)) * 0.8 + 0.2);
      g.globalAlpha = c.t > 3.8 ? Math.max(0, 1 - (c.t - 3.8) / 0.7) : 1;
      g.fillStyle = c.color; g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      g.restore();
    }
    g.globalAlpha = 1;
    for (const c of this.coins) {
      if (c.t < c.delay) continue;
      const k = Math.min(1, (c.t - c.delay) / c.dur);
      const e = k * k * (3 - 2 * k);
      const x = lerp(c.from.x, c.to.x, e), y = lerp(c.from.y, c.to.y, e) - Math.sin(k * Math.PI) * 60;
      drawItem(dc, "res.currency", x, y, 1.3 - 0.4 * k);
    }
  }
}
