import { FP, type State } from "@fo/sim";

export interface V { x: number; y: number }
type WorldView = State;

// Copy of @fo/render-2d interp.ts, kept local so this package never pulls the 2D draw code.
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
  for (const h of w.fleeing ?? []) put(`h:${h.id}`, h.pos);
  for (const h of w.approaching ?? []) put(`h:${h.id}`, h.pos);
  for (const t of w.troops ?? []) put(`tr:${t.id}`, t.pos);
  for (const p of w.prey ?? []) put(`p:${p.id}`, p.pos);
  for (const c of w.captures ?? []) put(`c:${c.id}`, c.pos);
  w.sales?.queue.forEach((q, i) => put(`q:${i}`, q.pos));
  w.sales?.leaving.forEach((q, i) => put(`l:${i}`, q.pos));
  return m;
}

/** Story walks, world units a second. */
const WALK = 70;
const NONE: ReadonlySet<string> = new Set();

export class Interp {
  private prev = new Map<string, V>();
  private curr = new Map<string, V>();
  private tick = Number.NaN;
  private holding = false;
  /** Keys the scene still moves while holding (a stage step's walker). */
  private movers: ReadonlySet<string> = NONE;
  /** Movers the story holds at a drawn place (the sim keeps its own); `to` null walks back to the sim's spot, then lets go. */
  private readonly staged = new Map<string, { at: V | null; to: V | null; v: V; face: boolean }>();

  /** Walk a mover to `to` and hold it there (drawn only); null walks it back. */
  stage(key: string, to: V | null, opts?: { from?: V; face?: boolean }): void {
    const s = this.staged.get(key);
    if (s) { s.to = to; s.face = !!opts?.face && !!to; }
    else if (to) this.staged.set(key, { at: opts?.from ? { ...opts.from } : null, to, v: { x: 0, y: 0 }, face: !!opts?.face });
  }

  /** The mover stands still at a staged spot meant to face the commander (story: a speaker turns to the one they talk to). */
  facesPlayer(key: string): boolean {
    const s = this.staged.get(key);
    return !!s?.face && !!s.at && s.v.x === 0 && s.v.y === 0;
  }

  /** Per frame: move the staged movers along, `dt` seconds. `hold`: a story scene holds everyone but `movers` still. */
  stepStaged(dt: number, hold = false, movers: ReadonlySet<string> = NONE): void {
    this.holding = hold;
    this.movers = hold ? movers : NONE;
    for (const [key, s] of this.staged) {
      // a scene is on: everyone stands still in idle (no walk cycle) and resumes after it, but the scene's own walkers
      if (hold && !movers.has(key)) { s.v = { x: 0, y: 0 }; continue; }
      const home = this.curr.get(key);
      s.at ??= home ? { ...home } : null;
      const goal = s.to ?? home;
      if (!s.at || !goal) { this.staged.delete(key); continue; }
      const dx = goal.x - s.at.x, dy = goal.y - s.at.y, d = Math.hypot(dx, dy), step = WALK * dt;
      if (d <= step) {
        s.at = { ...goal };
        s.v = { x: 0, y: 0 };
        if (!s.to) this.staged.delete(key);
        continue;
      }
      s.at = { x: s.at.x + (dx / d) * step, y: s.at.y + (dy / d) * step };
      // per-tick velocity, as vel() reports the sim's
      s.v = { x: (dx / d) * WALK / 30, y: (dy / d) * WALK / 30 };
    }
  }

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
    this.staged.clear();
    this.prev = new Map();
    this.curr = new Map();
    this.tick = Number.NaN;
  }

  /** Interpolated world-unit position for a key; falls back to the fixed-point pos given. */
  pos(key: string, fpPos: V, alpha: number): V {
    const held = this.staged.get(key)?.at;
    if (held) return held;
    const c = this.curr.get(key);
    if (!c) return { x: fpPos.x / FP, y: fpPos.y / FP };
    const p = this.prev.get(key);
    if (!p) return c;
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > SNAP * SNAP) return c;
    return { x: p.x + dx * alpha, y: p.y + dy * alpha };
  }

  vel(key: string): V {
    // under a story line the sim is frozen but the last tick's step would still read as walking: report standing still
    const held = this.staged.get(key);
    if (this.holding && !(this.movers.has(key) && held?.at)) return { x: 0, y: 0 };
    if (held?.at) return held.v;
    const c = this.curr.get(key), p = this.prev.get(key);
    if (!c || !p) return { x: 0, y: 0 };
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > SNAP * SNAP) return { x: 0, y: 0 };
    return { x: dx, y: dy };
  }
}
