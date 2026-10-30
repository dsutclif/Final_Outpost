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
export interface Station { id: string; x: number; y: number; r: number; key: boolean; on?: string | undefined; tight?: boolean | undefined; fp?: Box | undefined; solid?: boolean | undefined;
  /** First footprint key (the entity type for a building), for tools that draw the layout. */
  kind?: string | undefined;
  /** Plot layout: the drawn model alone (no hidden ground behind it), which packed gatherables must clear. */
  body?: Box | undefined }
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
  /** Plot layout: a spot where the slots are blocked may still take them mirrored left to right (standing spots stay: the sim never flips a machine). */
  mirror?: boolean;
  /** The station sits on a wall (a belt's own build pad): the wall test is skipped. */
  onWall?: boolean;
  /** false: rank by `near` alone, without the pull toward the core (a pad that must hug what it serves). */
  pull?: boolean;
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
  /** Lots and streets: streets cross at the core and repeat every block + street, lots between them (null: off). */
  lots: { block: number; street: number } | null = null;
  /** Plot layout: footprints keep off standing spots, not just station centres (off for packs). */
  boxSpots = false;
  /** Plot layout: model boxes without their hidden ground, by footprint key; a packed gatherable only has to clear these. */
  bodies: Readonly<Record<string, Box>> | null = null;
  /** The last place() call that found no valid spot: what it was and where it searched (the layout sandbox draws it). */
  lastMiss: { id: string; r: number; regions: readonly Rect[]; fp: Box | undefined } | null = null;
  constructor(readonly rand: Rand, readonly margin: number, readonly standR: number,
    readonly bounds: Rect, readonly core: Pt, readonly screen: readonly [number, number, number?], readonly c: Content = defaultContent,
    readonly footprints: Readonly<Record<string, Box>> = {}, readonly footprintGap = 0,
    /** Weight of the distance to the core when ranking candidates by `near`: keeps the base compact. */
    readonly corePull = 0) {}

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

  /** A footprint that keeps to the lots: anything but flat pads and gatherables. */
  building(fp: string | readonly string[] | undefined): boolean {
    const keys = fp === undefined ? [] : typeof fp === "string" ? [fp] : fp;
    return keys.some((k) => !k.startsWith("pad") && !k.startsWith("node."));
  }

  /** A building's ground box stays inside one lot along each axis it fits in, so streets stay open. */
  inLot(b: Box | undefined): boolean {
    if (!this.lots || !b) return true;
    const { block, street } = this.lots, P = block + street;
    const fits = (lo: number, hi: number, c: number): boolean => {
      if (hi - lo > block) return true;
      const o = c + street / 2;
      return hi <= o + Math.floor((lo - o) / P) * P + block;
    };
    return fits(b[0], b[2], this.core[0]) && fits(b[1], b[3], this.core[1]);
  }

  /** p shifted so the footprint's box sits inside the lot its centre falls in (unchanged off the grid). */
  toLot(p: Pt, fp: string | readonly string[] | undefined): Pt {
    const b = this.lots ? this.box(p, fp) : undefined;
    if (!this.lots || !b) return p;
    const { block, street } = this.lots, P = block + street;
    const shift = (lo: number, hi: number, c: number): number => {
      if (hi - lo > block) return 0;
      const o = c + street / 2, s = o + Math.floor(((lo + hi) / 2 - o) / P) * P;
      return lo < s ? s - lo : hi > s + block ? s + block - hi : 0;
    };
    return [p[0] + shift(b[0], b[2], this.core[0]), p[1] + shift(b[1], b[3], this.core[1])];
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
        const g = this.footprintGap, o = (opts.tight && s.body) || s.fp;
        if (fb[0] < o[2] + g && o[0] < fb[2] + g && fb[1] < o[3] + g && o[1] < fb[3] + g) return false;
      }
    }
    for (const sp of this.spots) if (dist(p, [sp.x, sp.y]) < r + sp.r) return false;
    // plot layout: a footprint may not cover a standing spot either (the queue's first square stays reachable)
    if (this.boxSpots && fb) for (const sp of this.spots) {
      const dx = Math.max(fb[0] - sp.x, 0, sp.x - fb[2]), dy = Math.max(fb[1] - sp.y, 0, sp.y - fb[3]);
      if (sp.id !== "start" && Math.hypot(dx, dy) < sp.r) return false;
    }
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
    // a building goes in a lot whenever some valid spot is in one (flat pads and gatherables may use the streets)
    const lot = this.lots !== null && this.building(opts.fp);
    const inLot: Pt[] = [];
    // a plot's pads may take the mirror layout where the usual one is blocked; remember which a spot needs
    const mirrored: PlaceOpts | null = opts.mirror && opts.slots ? { ...opts, slots: opts.slots.map((o) => ({ ...o, dx: -o.dx })) } : null;
    const flip = new Set<string>();
    for (let i = 0; i < n; i++) {
      const rg = regions[i % regions.length]!;
      // buildings on a lot grid snap to a 10-unit step so neighbours line up
      const q = (v: number) => (lot ? Math.round(v / 10) * 10 : Math.round(v));
      const raw: Pt = [q(rg[0] + this.rand.float() * rg[2]), q(rg[1] + this.rand.float() * rg[3])];
      const fits = (p: Pt, o: PlaceOpts) => (!o.key || this.onScreen(p)) && this.ok(id, p, r, o) && (!o.accept || o.accept(p));
      const valid = (p: Pt) => {
        if (fits(p, opts)) return true;
        if (mirrored && fits(p, mirrored)) { flip.add(`${p[0]},${p[1]}`); return true; }
        return false;
      };
      const lp = lot ? this.toLot(raw, opts.fp) : raw;
      if (lot && valid(lp)) inLot.push(lp);
      else if (valid(raw)) cands.push(raw);
    }
    if (inLot.length > 0) cands.splice(0, cands.length, ...inLot);
    if (cands.length === 0) { this.lastMiss = { id, r, regions, fp: this.box([0, 0], opts.fp) }; return null; }
    let best: Pt;
    if (opts.reach) {
      const from = opts.reach.from;
      cands.sort((a, b) => dist(a, from) - dist(b, from));
      best = cands[Math.min(cands.length - 1, Math.round(opts.reach.t * (cands.length - 1)))]!;
    } else if (opts.near) {
      const nr = opts.near;
      const w = opts.pull === false ? 0 : this.corePull;
      const cost = (q: Pt) => dist(q, nr) + w * dist(q, this.core);
      best = cands.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    } else best = cands[0]!;
    this.add(id, best, r, mirrored && flip.has(`${best[0]},${best[1]}`) ? mirrored : opts);
    return best;
  }

  add(id: string, p: Pt, r: number, opts: PlaceOpts = {}): void {
    // a footprint with anything beyond a flat pad stands up off the ground (traders walk around it)
    const solid = (opts.fp === undefined ? [] : typeof opts.fp === "string" ? [opts.fp] : opts.fp).some((k) => !k.startsWith("pad"));
    const kind = typeof opts.fp === "string" ? opts.fp : opts.fp?.find((k) => this.bodies?.[k]) ?? opts.fp?.[0];
    const bb = kind ? this.bodies?.[kind] : undefined;
    this.stations.push({ id, x: p[0], y: p[1], r, key: opts.key ?? false, on: opts.on, tight: opts.tight, fp: this.box(p, opts.fp), solid, kind,
      body: bb && [p[0] + bb[0], p[1] + bb[1], p[0] + bb[2], p[1] + bb[3]] });
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
    // a pad on what it acts on, or two pads on one thing (a tower's Lv2 and Lv3 share a spot, one shows at a time)
    if (a.on === b.id || b.on === a.id || (a.on !== undefined && a.on === b.on)) continue;
    if (dist([a.x, a.y], [b.x, b.y]) < Math.max(a.r, b.r)) out.push(`${a.id}~${b.id}`);
  }
  for (const s of stations) if (s.key && dist([s.x, s.y], core) > screenRadius) out.push(`offscreen ${s.id}`);
  return out;
}
