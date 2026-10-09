import { FP } from "@fo/sim";
import type { V, WorldView } from "./view.js";

// Keeps the previous tick's mover positions so frames between ticks can interpolate.
// Only positions are kept (not whole snapshots): cheap, and enough for smooth motion.

/** A jump longer than this (world units) is a teleport or a re-indexed entity: snap. */
const SNAP = 30;

export function capturePositions(w: WorldView): Map<string, V> {
  const m = new Map<string, V>();
  const put = (k: string, v: V | undefined): void => { if (v) m.set(k, { x: v.x / FP, y: v.y / FP }); };
  put("player", w.player.pos);
  for (const r of w.residents ?? []) put(`r:${r.id}`, r.pos);
  for (const h of w.hostiles ?? []) put(`h:${h.id}`, h.pos);
  for (const p of w.prey ?? []) put(`p:${p.id}`, p.pos);
  for (const c of w.captures ?? []) put(`c:${c.id}`, c.pos);
  w.sales?.queue.forEach((q, i) => put(`q:${i}`, q.pos));
  w.sales?.leaving.forEach((q, i) => put(`l:${i}`, q.pos));
  return m;
}

export class Interp {
  private prev = new Map<string, V>();
  private curr = new Map<string, V>();
  private tick = Number.NaN;

  /** Call every frame; it only rolls the buffers when the sim tick changed. */
  update(w: WorldView): void {
    if (w.tick === this.tick) return;
    // A restart (tick went backwards) must not lerp from the old level.
    this.prev = w.tick < this.tick ? capturePositions(w) : this.curr;
    this.curr = capturePositions(w);
    if (this.prev.size === 0) this.prev = this.curr;
    this.tick = w.tick;
  }

  reset(): void {
    this.prev = new Map();
    this.curr = new Map();
    this.tick = Number.NaN;
  }

  /** Interpolated world-unit position for a key; falls back to the fixed-point pos given. */
  pos(key: string, fpPos: V, alpha: number): V {
    const c = this.curr.get(key);
    if (!c) return { x: fpPos.x / FP, y: fpPos.y / FP };
    const p = this.prev.get(key);
    if (!p) return c;
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > SNAP * SNAP) return c;
    return { x: p.x + dx * alpha, y: p.y + dy * alpha };
  }

  vel(key: string): V {
    const c = this.curr.get(key), p = this.prev.get(key);
    if (!c || !p) return { x: 0, y: 0 };
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > SNAP * SNAP) return { x: 0, y: 0 };
    return { x: dx, y: dy };
  }
}
