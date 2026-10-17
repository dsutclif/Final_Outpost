import { content as defaultContent, type Content } from "@fo/content";
import type { Rand } from "./rand.js";

// Constraint placement. Every interaction centre is a station with a radius from content; a new
// station must keep every other centre out of its radius and stay out of theirs (the rater's
// unreadable rule, plus a margin), keep clear of standing spots (register, coin pile, converter
// operator and pickup spots), stay out of blocked rects, and sit inside its region.

export type Rect = readonly [number, number, number, number];
export type Pt = readonly [number, number];

/** [x0, y0, x1, y1] in world units. */
export type Box = readonly [number, number, number, number];
export interface Station { id: string; x: number; y: number; r: number; key: boolean; on?: string | undefined; tight?: boolean | undefined; fp?: Box | undefined }
/** A spot the player stands on to act (register, pile, operator): no station radius may cover it. */
export interface Spot { id: string; x: number; y: number; r: number }

export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const inRect = (p: Pt, r: Rect, m = 0): boolean => p[0] >= r[0] - m && p[0] <= r[0] + r[2] + m && p[1] >= r[1] - m && p[1] <= r[1] + r[3] + m;

export interface PlaceOpts {
  /** Prefer candidates near this point. */
  near?: Pt;
  /** 0..1: rank candidates by distance from `from` (0 nearest, 1 farthest) instead of `near`. */
  reach?: { from: Pt; t: number };
  /** Id of a station this one may sit on (a pad acting on that entity). */
  on?: string;
  key?: boolean;
  samples?: number;
  /** Extra standing spots this station brings (converter operator/pickup), relative offsets. */
  spots?: { id: string; dx: number; dy: number }[];
  /** Forest nodes: packed densely against other tight stations (only the rater's no-overlap rule applies). */
  tight?: boolean;
  /** Keep the centre at least r from each of these points (gatherables of another resource: see build.ts). */
  avoid?: { p: Pt; r: number }[];
  /** May stand right against a wall (inside it), not just clear of it: a wall tower's pad. */
  hugWall?: boolean;
  /** Footprint key(s) (Placer.footprints): the ground the drawn model covers, which must not touch another's. */
  fp?: string | readonly string[];
  /** Fixed worker slots (offsets from the centre) that are part of this placement: each must be free for a pad of radius r, and is reserved with it. */
  slots?: { id: string; dx: number; dy: number; r: number; fp: string | readonly string[] }[];
  /** The station sits on a wall (a belt's own build pad): the wall test is skipped. */
  onWall?: boolean;
  /** Extra candidate filter (a layout rule that depends on where the machine goes, e.g. its belt run). */
  accept?: (p: Pt) => boolean;
}

/** Distance from p to the segment ab. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export class Placer {
  readonly stations: Station[] = [];
  readonly spots: Spot[] = [];
  readonly blocked: Rect[] = [];
  /** Barrier sections: nothing interactive sits on a wall. */
  readonly walls: [Pt, Pt][] = [];
  constructor(readonly rand: Rand, readonly margin: number, readonly standR: number,
    readonly bounds: Rect, readonly core: Pt, readonly screen: readonly [number, number, number?], readonly c: Content = defaultContent,
    readonly footprints: Readonly<Record<string, Box>> = {}, readonly footprintGap = 0) {}

  /** Absolute ground box at p for the footprint key(s): the union of each key's box. */
  box(p: Pt, fp: string | readonly string[] | undefined): Box | undefined {
    const keys = fp === undefined ? [] : typeof fp === "string" ? [fp] : fp;
    let b: [number, number, number, number] | undefined;
    for (const k of keys) {
      const f = this.footprints[k];
      if (!f) continue;
      b = b ? [Math.min(b[0], f[0]), Math.min(b[1], f[1]), Math.max(b[2], f[2]), Math.max(b[3], f[3])] : [f[0], f[1], f[2], f[3]];
    }
    return b && [p[0] + b[0], p[1] + b[1], p[0] + b[2], p[1] + b[3]];
  }

  ok(id: string, p: Pt, r: number, opts: PlaceOpts = {}): boolean {
    if (!inRect(p, this.bounds)) return false;
    for (const b of this.blocked) if (inRect(p, b, r * 0.5 + 10)) return false;
    if (!opts.onWall) for (const w of this.walls) if (segDist(p, w[0], w[1]) < (opts.hugWall ? r - 4 : r + 10)) return false;
    for (const a of opts.avoid ?? []) if (dist(p, a.p) < a.r) return false;
    const fb = this.box(p, opts.fp);
    for (const s of this.stations) {
      if (opts.on === s.id) continue;
      const m = opts.tight && s.tight ? 3 : this.margin;
      if (dist(p, [s.x, s.y]) < Math.max(r, s.r) + m) return false;
      // drawn models never overlap (packed forest nodes excepted)
      if (fb && s.fp && !(opts.tight && s.tight)) {
        const g = this.footprintGap;
        if (fb[0] < s.fp[2] + g && s.fp[0] < fb[2] + g && fb[1] < s.fp[3] + g && s.fp[1] < fb[3] + g) return false;
      }
    }
    for (const sp of this.spots) if (dist(p, [sp.x, sp.y]) < r + sp.r) return false;
    for (const o of opts.spots ?? []) {
      const q: Pt = [p[0] + o.dx, p[1] + o.dy];
      if (!inRect(q, this.bounds)) return false;
      for (const s of this.stations) if (opts.on !== s.id && dist(q, [s.x, s.y]) < s.r + this.standR) return false;
      for (const b of this.blocked) if (inRect(q, b, 14)) return false;
      for (const w of this.walls) if (segDist(q, w[0], w[1]) < this.standR + 8) return false;
    }
    if (opts.slots) {
      const sl = opts.slots, gap = this.footprintGap;
      const qs = sl.map((o): Pt => [p[0] + o.dx, p[1] + o.dy]);
      const boxes = sl.map((o, i) => this.box(qs[i]!, o.fp));
      const hit = (u: Box | undefined, v: Box | undefined) => !!u && !!v && u[0] < v[2] + gap && v[0] < u[2] + gap && u[1] < v[3] + gap && v[1] < u[3] + gap;
      for (let i = 0; i < sl.length; i++) {
        const q = qs[i]!, o = sl[i]!;
        if (!this.ok(`${id}:${o.id}`, q, o.r, { fp: o.fp }) || (opts.key && !this.onScreen(q))) return false;
        if (dist(p, q) < Math.max(r, o.r) + this.margin || hit(boxes[i], fb)) return false;
        for (const t of opts.spots ?? []) if (dist(q, [p[0] + t.dx, p[1] + t.dy]) < o.r + this.standR) return false;
        for (let j = i + 1; j < sl.length; j++) if (dist(q, qs[j]!) < o.r + sl[j]!.r + this.margin || hit(boxes[i], boxes[j])) return false;
      }
    }
    return true;
  }

  /** Sample the region, keep valid candidates, return the best by the preference (or null). */
  place(id: string, r: number, region: Rect | readonly Rect[], opts: PlaceOpts = {}): Pt | null {
    const regions: readonly Rect[] = Array.isArray(region[0]) ? region as readonly Rect[] : [region as Rect];
    const n = opts.samples ?? 80;
    const cands: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const rg = regions[i % regions.length]!;
      const p: Pt = [Math.round(rg[0] + this.rand.float() * rg[2]), Math.round(rg[1] + this.rand.float() * rg[3])];
      if (opts.key && !this.onScreen(p)) continue;
      if (this.ok(id, p, r, opts) && (!opts.accept || opts.accept(p))) cands.push(p);
    }
    if (cands.length === 0) return null;
    let best: Pt;
    if (opts.reach) {
      const from = opts.reach.from;
      cands.sort((a, b) => dist(a, from) - dist(b, from));
      best = cands[Math.min(cands.length - 1, Math.round(opts.reach.t * (cands.length - 1)))]!;
    } else if (opts.near) {
      const nr = opts.near;
      best = cands.reduce((a, b) => (dist(b, nr) < dist(a, nr) ? b : a));
    } else best = cands[0]!;
    this.add(id, best, r, opts);
    return best;
  }

  add(id: string, p: Pt, r: number, opts: PlaceOpts = {}): void {
    this.stations.push({ id, x: p[0], y: p[1], r, key: opts.key ?? false, on: opts.on, tight: opts.tight, fp: this.box(p, opts.fp) });
    for (const o of opts.slots ?? []) {
      const q: Pt = [p[0] + o.dx, p[1] + o.dy];
      this.stations.push({ id: `${id}:${o.id}`, x: q[0], y: q[1], r: o.r, key: true, fp: this.box(q, o.fp) });
    }
    for (const o of opts.spots ?? []) this.spots.push({ id: `${id}:${o.id}`, x: p[0] + o.dx, y: p[1] + o.dy, r: this.standR });
  }

  spot(id: string, p: Pt, r = this.standR): void { this.spots.push({ id, x: p[0], y: p[1], r }); }

  onScreen(p: Pt): boolean {
    // the box the camera shows, and inside the rater's screen radius (the box's corners are not)
    return Math.abs(p[0] - this.core[0]) <= this.screen[0] && Math.abs(p[1] - this.core[1]) <= this.screen[1]
      && (this.screen[2] === undefined || dist(p, this.core) <= this.screen[2]);
  }
}

/** The rater's unreadable rule, reimplemented so the generator rejects layouts before any bot runs. */
export function unreadablePairs(stations: readonly Station[], core: Pt, screenRadius: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < stations.length; i++) for (let j = i + 1; j < stations.length; j++) {
    const a = stations[i]!, b = stations[j]!;
    if (a.on === b.id || b.on === a.id) continue;
    if (dist([a.x, a.y], [b.x, b.y]) < Math.max(a.r, b.r)) out.push(`${a.id}~${b.id}`);
  }
  for (const s of stations) if (s.key && dist([s.x, s.y], core) > screenRadius) out.push(`offscreen ${s.id}`);
  return out;
}
