import { FP, blockedAt, type Compiled, type State, type Vec } from "@fo/sim";

// Movement: straight-line steering when the way is clear, otherwise a coarse grid A* around
// blocked zones, built wall sections and the core (gates are passable, so a target across a
// line routes through the nearest gate on its own). Pads the bot does not want to pay are soft
// obstacles: the path avoids them unless there is no other way.

export interface Circle { x: number; y: number; r: number }

const CELL = 8 * FP;
const PROBE = 5 * FP;
const AVOID_COST = 80;

export class Nav {
  readonly w: number;
  readonly h: number;
  private blocked: Uint8Array;
  /** Connected-component label per free cell (0 = blocked). */
  private label: Int32Array;
  private key = "";
  private pathKey = "";
  private path: Vec[] = [];

  constructor(private readonly cp: Compiled) {
    this.w = Math.ceil(cp.map.w / CELL);
    this.h = Math.ceil(cp.map.h / CELL);
    this.blocked = new Uint8Array(this.w * this.h);
    this.label = new Int32Array(this.w * this.h);
  }

  /** Rebuild the blocked grid when walls or zones change. Cheap to call every tick. */
  refresh(st: State): void {
    let k = "";
    for (const z of st.zones) k += z.cleared ? "1" : "0";
    for (const l of st.barriers) for (const s of l.sections) k += s.built ? "1" : "0";
    if (k === this.key) return;
    this.key = k;
    this.pathKey = "";
    const cp = this.cp, r = cp.player.radius;
    const coreR = cp.player.walkThrough ? 0 : cp.core.exclusion + 6 * FP;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = i * CELL + CELL / 2, y = j * CELL + CELL / 2;
        let b = x < r || y < r || x > cp.map.w - r || y > cp.map.h - r;
        if (!b) {
          const dx = x - st.core.pos.x, dy = y - st.core.pos.y;
          b = dx * dx + dy * dy < coreR * coreR;
        }
        if (!b) b = blockedAt(st, cp, x, y) || blockedAt(st, cp, x + PROBE, y) || blockedAt(st, cp, x - PROBE, y)
          || blockedAt(st, cp, x, y + PROBE) || blockedAt(st, cp, x, y - PROBE);
        this.blocked[j * this.w + i] = b ? 1 : 0;
      }
    }
    this.labelComponents();
  }

  private labelComponents(): void {
    const W = this.w, N = W * this.h;
    this.label.fill(0);
    const q = new Int32Array(N);
    let next = 0;
    for (let s = 0; s < N; s++) {
      if (this.blocked[s] || this.label[s]) continue;
      next++;
      let head = 0, tail = 0;
      q[tail++] = s; this.label[s] = next;
      while (head < tail) {
        const c = q[head++]!;
        const ci = c % W, cj = Math.floor(c / W);
        if (ci > 0) this.visit(c - 1, next, q, tail) && tail++;
        if (ci < W - 1) this.visit(c + 1, next, q, tail) && tail++;
        if (cj > 0) this.visit(c - W, next, q, tail) && tail++;
        if (cj < this.h - 1) this.visit(c + W, next, q, tail) && tail++;
      }
    }
  }

  private visit(n: number, lab: number, q: Int32Array, tail: number): boolean {
    if (this.blocked[n] || this.label[n]) return false;
    this.label[n] = lab;
    q[tail] = n;
    return true;
  }

  cellOf(p: Vec): number {
    const i = Math.min(this.w - 1, Math.max(0, Math.floor(p.x / CELL)));
    const j = Math.min(this.h - 1, Math.max(0, Math.floor(p.y / CELL)));
    return j * this.w + i;
  }

  center(c: number): Vec {
    return { x: (c % this.w) * CELL + CELL / 2, y: Math.floor(c / this.w) * CELL + CELL / 2 };
  }

  isBlocked(p: Vec): boolean {
    return this.blocked[this.cellOf(p)] === 1;
  }

  /** Nearest free point to p (p itself when free). */
  free(p: Vec): Vec {
    if (!this.isBlocked(p)) return p;
    const c0 = this.cellOf(p);
    const i0 = c0 % this.w, j0 = Math.floor(c0 / this.w);
    for (let rad = 1; rad < 40; rad++) {
      let best = -1, bd = Infinity;
      for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const c = j * this.w + i;
        if (this.blocked[c]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = c; }
      }
      if (best >= 0) return this.center(best);
    }
    return p;
  }

  /** Clear straight line from a to b: no blocked cell and no avoided pad circle (unless an end is inside it). */
  los(a: Vec, b: Vec, avoid: readonly Circle[]): boolean {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const n = Math.ceil(len / (4 * FP));
    for (let k = 1; k <= n; k++) {
      const p = { x: a.x + (dx * k) / n, y: a.y + (dy * k) / n };
      if (this.blocked[this.cellOf(p)]) return false;
    }
    for (const c of avoid) {
      if (inCircle(a, c) || inCircle(b, c)) continue;
      if (segCircle(a, b, c)) return false;
    }
    return true;
  }

  /** The point to steer at this tick on the way to target. */
  waypoint(from: Vec, target: Vec, avoid: readonly Circle[]): Vec {
    const goal = this.free(target);
    if (this.los(from, goal, avoid)) return goal === target ? target : goal;
    if (!this.reachable(from, goal)) return goal;
    const gc = this.cellOf(goal);
    const key = `${gc}|${avoid.map((c) => `${c.x},${c.y}`).join(";")}`;
    if (key !== this.pathKey || this.path.length === 0 || !this.onPath(from)) {
      this.path = this.astar(from, goal, avoid);
      this.pathKey = key;
    }
    // Drop nodes already reached.
    while (this.path.length > 1) {
      const q = this.path[0]!, dx = q.x - from.x, dy = q.y - from.y;
      if (dx * dx + dy * dy > (5 * FP) * (5 * FP)) break;
      this.path.shift();
    }
    if (this.path.length === 0) return goal;
    // Drop nodes already passed, then aim at the farthest node still in sight.
    let best = 0;
    for (let k = 0; k < this.path.length && k < 14; k++) if (this.los(from, this.path[k]!, avoid)) best = k;
    if (best > 0) this.path.splice(0, best);
    return this.path[0]!;
  }

  private onPath(p: Vec): boolean {
    for (let k = 0; k < this.path.length && k < 6; k++) {
      const q = this.path[k]!;
      const dx = q.x - p.x, dy = q.y - p.y;
      if (dx * dx + dy * dy < (40 * FP) * (40 * FP)) return true;
    }
    return false;
  }

  private astar(from: Vec, goal: Vec, avoid: readonly Circle[]): Vec[] {
    const W = this.w, N = W * this.h;
    const start = this.cellOf(this.free(from)), end = this.cellOf(goal);
    const g = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new Heap();
    const ei = end % W, ej = Math.floor(end / W);
    const hcost = (c: number) => {
      const di = Math.abs((c % W) - ei), dj = Math.abs(Math.floor(c / W) - ej);
      return 10 * Math.max(di, dj) + 4 * Math.min(di, dj);
    };
    const softCost = (c: number) => {
      if (avoid.length === 0) return 0;
      const p = this.center(c);
      for (const a of avoid) if (inCircle(p, a)) return AVOID_COST;
      return 0;
    };
    g[start] = 0;
    heap.push(start, hcost(start));
    while (heap.size > 0) {
      const c = heap.pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === end) break;
      const ci = c % W, cj = Math.floor(c / W);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= this.h) continue;
        const n = j * W + i;
        if (this.blocked[n] || closed[n]) continue;
        // No corner cutting past a blocked cell.
        if (di !== 0 && dj !== 0 && (this.blocked[cj * W + i] || this.blocked[j * W + ci])) continue;
        const ng = g[c]! + (di !== 0 && dj !== 0 ? 14 : 10) + softCost(n);
        if (ng < g[n]!) { g[n] = ng; prev[n] = c; heap.push(n, ng + hcost(n)); }
      }
    }
    if (prev[end] === -1 && end !== start) return [];
    const out: Vec[] = [];
    for (let c = end; c !== -1 && c !== start; c = prev[c]!) out.push(this.center(c));
    out.reverse();
    if (out.length > 0) out[out.length - 1] = goal;
    return out;
  }

  /** Grid reachability from a point, for "can the bot get there at all" questions. */
  reachable(from: Vec, to: Vec): boolean {
    return this.label[this.cellOf(this.free(from))] === this.label[this.cellOf(this.free(to))];
  }
}

const inCircle = (p: Vec, c: Circle): boolean => {
  const dx = p.x - c.x, dy = p.y - c.y;
  return dx * dx + dy * dy < c.r * c.r;
};

function segCircle(a: Vec, b: Vec, c: Circle): boolean {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : ((c.x - a.x) * abx + (c.y - a.y) * aby) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = a.x + abx * t - c.x, py = a.y + aby * t - c.y;
  return px * px + py * py < c.r * c.r;
}

/** Binary min-heap of (cell, priority); ties break on insertion order so A* is deterministic. */
class Heap {
  private c: number[] = [];
  private p: number[] = [];
  get size(): number { return this.c.length; }
  push(cell: number, pr: number): void {
    const c = this.c, p = this.p;
    c.push(cell); p.push(pr);
    let i = c.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up]! <= pr) break;
      c[i] = c[up]!; p[i] = p[up]!; i = up;
    }
    c[i] = cell; p[i] = pr;
  }
  pop(): number {
    const c = this.c, p = this.p;
    const top = c[0]!;
    const lc = c.pop()!, lp = p.pop()!;
    if (c.length > 0) {
      let i = 0;
      const n = c.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mp = lp;
        if (l < n && p[l]! < mp) { m = l; mp = p[l]!; }
        if (r < n && p[r]! < mp) { m = r; mp = p[r]!; }
        if (m === i) break;
        c[i] = c[m]!; p[i] = p[m]!; i = m;
      }
      c[i] = lc; p[i] = lp;
    }
    return top;
  }
}
