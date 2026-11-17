import occ from "../data/occluders.json";
import genData from "../data/generator.json";
import { HIDDEN_AT, PAD_RADIUS, discPoints, hides, viewOf, type Occluder, type Pt } from "./viewVisibility.js";
import { REPAIR_DIRS } from "./padRepair.js";
import { Rand } from "./rand.js";

/**
 * Wavefront placement (outpost-ops#202, algorithm agreed with Doug 2026-11-16). Stand-alone and pure: given the buildings of
 * a level in order of first appearance, it places them wavefront by wavefront along the camera's depth axis (x + y, north-west
 * first), checks each site before using it (two site checks, switchable), and falls back to the pad repair loop:
 *
 *   for distance = 0, 6, 12, ...        (0 = blocker where it was placed; runs once)
 *     for direction in [south, south-east, east]
 *       move the blocker with its pads to start + distance x direction
 *         off the map -> reject the seed; overlap -> put it back, next direction
 *       try the pad's 3 plot spots in order; the first visible one is kept
 *
 * Every visibility test is viewVisibility's renderer-matched one (`hides`/`viewOf`, hidden at HIDDEN_AT of the 17 points).
 * Walls are not part of the input. Not wired into build.ts.
 */

type Box4 = readonly [number, number, number, number];
type Box5 = readonly [number, number, number, number, number];
export interface OccShape { sx: number; sz: number; sy: number; y: number; box: Box5 }
export interface WfPad {
  id: string;
  /** Buildings that may stand while this pad is live (appeared, not yet spent). Only these can hide it. */
  coexist: readonly string[];
  /** Buildings that never hide it (the building it raises or upgrades). */
  ignore?: readonly string[];
  /** Disc radius (default PAD_RADIUS). */
  radius?: number;
}
export interface WfBuilding {
  id: string; kind: string;
  /** Footprint relative to the centre: [x0, y0, x1, y1]. */
  footprint: Box4;
  /** The model at its tallest upgrade (null: not drawn tall, hides nothing). */
  occ: OccShape | null;
  /** Order of first appearance: buildings with the same value share a wavefront. */
  appear: number;
  /** Linked buildings (a collector and its ore): the group joins the earliest one's wavefront. */
  links?: readonly string[];
  /** The pads that sit in this building's plot (one stack, on one of its 3 south-east spots). */
  pads: readonly WfPad[];
  /** Distance of the pad spots from the centre (default: the smallest that keeps a pad box off the footprint). */
  spotR?: number;
  /** "settlement": the pad spots face the already-placed settlement (a rockfall's clear pad sits on the side away from the zone it opens). */
  side?: "settlement";
}
export const SALVAGE_KIND = "node.salvage_pile";
export interface WfInput { buildings: readonly WfBuilding[]; map: { w: number; h: number } }
export interface WfOptions {
  seed: number;
  /** The two pre-placement site checks (a visible spot past locked buildings; no live pad under the new building's strip). */
  siteChecks: boolean;
  /** When the repair loop runs: after every placement ("always", default) or only when no site passed the two checks ("fallback"; with the checks off it behaves as "always"). */
  repair?: "always" | "fallback";
  /** Wavefront 0's anchor before jitter (default: the map centre moved ORIGIN_BACK north-west along the depth axis). */
  origin?: Pt;
  /** Seeded jitter of the anchor along both axes, +-units (default 30). */
  jitter?: number;
  /** Candidate site spacing and push step (default 6). */
  step?: number;
  /** Safety cap on repairs per seed (cascades); beyond it the remaining hidden pads stay hidden. */
  maxRepairs?: number;
  trace?: boolean;
}
export type TraceStep =
  | { t: "wave"; n: number; ids: string[]; front: number }
  | { t: "place"; id: string; at: Pt; spot: number; checked: boolean; fallback: boolean; tried: number }
  | { t: "hidden"; pad: string; by: string[] }
  | { t: "blocker"; pad: string; id: string; need: number | null }
  | { t: "move"; id: string; dir: string; d: number; to: Pt }
  | { t: "overlap"; id: string; dir: string; d: number }
  | { t: "spot"; pad: string; i: number; ok: boolean }
  | { t: "fixed"; pad: string; spot: number; pushed?: string; d: number; dir?: string }
  | { t: "unresolved"; pad: string; why: string }
  | { t: "reject"; id: string; kind: string; pad: string; d: number; dir: string }
  | { t: "lock"; n: number };
export interface WfStats { rejected: number; pushes: number; totalPushDistance: number; hiddenPads: number; fallbacks: number; repairs: number }
export interface WfResult {
  rejected: { id: string; kind: string; pad: string } | null;
  positions: Record<string, Pt>;
  /** Each building's pad stack spot (index into its 3 spots and the point). */
  padSpots: Record<string, { i: number; at: Pt }>;
  hidden: string[];
  stats: WfStats;
  trace: TraceStep[];
}

const T = occ as unknown as { future: Record<string, OccShape & { scale: number[] }>; types: Record<string, OccShape & { scale: number[] }> };
const GEN = genData as unknown as { footprints: Record<string, Box4> };
export const PAD_BOX: Box4 = GEN.footprints["pad"]!;
export const STEP = 6;
export const ORIGIN_BACK = 120;
const R2 = Math.SQRT1_2;
/** Depth axis (toward the camera, south-east) and the front's own axis. */
export const U: Pt = [R2, R2], V: Pt = [R2, -R2];
export const DIRS: readonly { name: "south" | "south-east" | "east"; d: Pt }[] = [{ name: "south", d: [0, 1] }, { name: "south-east", d: [R2, R2] }, { name: "east", d: [1, 0] }];

/** The tallest model of a kind (its top upgrade, the biggest scrap heap) from data/occluders.json; null when not drawn tall. */
export function tallestShape(kind: string): OccShape | null {
  const tabs = [...Object.keys(T.future).filter((k) => k.startsWith(kind + "@")).map((k) => T.future[k]!), ...Object.keys(T.types).filter((k) => k === kind || k.startsWith(kind + "@")).map((k) => T.types[k]!)];
  if (!tabs.length) return null;
  const top = (t: { y: number; box: Box5; scale: number[] }) => t.y + t.box[4] * t.scale[1]!;
  const t = tabs.reduce((a, b) => (top(b) > top(a) ? b : a));
  return { sx: t.scale[0]!, sz: t.scale[2]!, sy: t.scale[1]!, y: t.y, box: t.box };
}

const overlaps = (a: Box4, b: Box4) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const boxAt = (p: Pt, f: Box4): Box4 => [p[0] + f[0], p[1] + f[1], p[0] + f[2], p[1] + f[3]];
const depth = (p: Pt) => p[0] * U[0] + p[1] * U[1];

/** Smallest spot distance at which none of the 3 south-east pad boxes touches the footprint. */
export function defaultSpotR(fp: Box4, dirs: readonly Pt[] = REPAIR_DIRS): number {
  for (let r = 1; r < 1000; r++) if (dirs.every((d) => !overlaps(boxAt([Math.round((d[0] * r) / 1000), Math.round((d[1] * r) / 1000)], PAD_BOX), fp))) return r;
  return 1000;
}
/** A building's 3 plot spots, south-east first (padRepair.candidates' directions and rounding). */
export function spotsOf(at: Pt, r: number, dirs: readonly Pt[] = REPAIR_DIRS): Pt[] {
  return dirs.map((d) => [at[0] + Math.round((d[0] * r) / 1000), at[1] + Math.round((d[1] * r) / 1000)] as Pt);
}

interface Placed { b: WfBuilding; at: Pt; spot: number; wave: number; r: number; dirs: readonly Pt[] }
/**
 * The mutable layout the loop works on. Exported so tests can set positions by hand and run one repair.
 */
export class WfState {
  readonly by = new Map<string, WfBuilding>();
  readonly placed = new Map<string, Placed>();
  readonly padOwner = new Map<string, string>();
  locked = -1;
  pushes = 0; pushDist = 0; repairs = 0;
  rejected: WfResult["rejected"] = null;
  readonly trace: TraceStep[] = [];
  constructor(readonly input: WfInput, readonly opts: { step: number; trace: boolean; maxRepairs: number }) {
    for (const b of input.buildings) { this.by.set(b.id, b); for (const p of b.pads) this.padOwner.set(p.id, b.id); }
  }
  log(s: TraceStep): void { if (this.opts.trace) this.trace.push(s); }
  spotR(b: WfBuilding, dirs: readonly Pt[] = REPAIR_DIRS): number { return b.spotR ?? defaultSpotR(b.footprint, dirs); }
  /**
   * The 3 pad-spot directions (x1000) of `b` at `at`: south-east first for most; for side "settlement" (a rockfall) straight toward the
   * centre of the settlement placed so far, then 40 degrees either side. Salvage piles and other side buildings do not count as settlement.
   */
  dirsFor(b: WfBuilding, at: Pt): readonly Pt[] {
    if (b.side !== "settlement") return REPAIR_DIRS;
    let sx = 0, sy = 0, n = 0;
    for (const p of this.placed.values()) if (!p.b.side && p.b.kind !== SALVAGE_KIND) { sx += p.at[0]; sy += p.at[1]; n++; }
    if (!n) return REPAIR_DIRS;
    const len = Math.hypot(sx / n - at[0], sy / n - at[1]) || 1, ux = (sx / n - at[0]) / len, uy = (sy / n - at[1]) / len;
    const rot = (a: number): Pt => [Math.round(1000 * (ux * Math.cos(a) - uy * Math.sin(a))), Math.round(1000 * (ux * Math.sin(a) + uy * Math.cos(a)))];
    return [rot(0), rot(0.7), rot(-0.7)];
  }
  /** Dirs, spot distance and the 3 spots of `b` if it stood at `at`. */
  spotsAt(b: WfBuilding, at: Pt): { dirs: readonly Pt[]; r: number; spots: Pt[] } {
    const dirs = this.dirsFor(b, at), r = this.spotR(b, dirs);
    return { dirs, r, spots: spotsOf(at, r, dirs) };
  }
  place(id: string, at: Pt, wave: number, spot = 0): void { const b = this.by.get(id)!; const { dirs, r } = this.spotsAt(b, at); this.placed.set(id, { b, at, spot, wave, r, dirs }); }
  spotAt(id: string, i?: number): Pt { const p = this.placed.get(id)!; return spotsOf(p.at, p.r, p.dirs)[i ?? p.spot]!; }
  inMap(bx: Box4): boolean { return bx[0] >= 0 && bx[1] >= 0 && bx[2] <= this.input.map.w && bx[3] <= this.input.map.h; }
  /** Boxes standing on the map: every placed footprint and pad stack box, minus the excluded ids ("fp:id" / "pad:id"). */
  clear(bx: Box4, skip: ReadonlySet<string>): boolean {
    for (const [id, p] of this.placed) {
      if (!skip.has(`fp:${id}`) && overlaps(bx, boxAt(p.at, p.b.footprint))) return false;
      if (p.b.pads.length && !skip.has(`pad:${id}`) && overlaps(bx, boxAt(this.spotAt(id), PAD_BOX))) return false;
    }
    return true;
  }
  occOf(id: string): Occluder | null {
    const p = this.placed.get(id);
    if (!p || !p.b.occ) return null;
    const o = p.b.occ;
    return { name: p.b.kind, ref: id, bx: p.at[0], bz: p.at[1], ang: 0, sx: o.sx, sz: o.sz, sy: o.sy, y: o.y, box: o.box };
  }
  /** Occluders that can hide pad `pad` (placed, coexisting, not ignored), optionally only those passing `only`. */
  occsFor(pad: WfPad, only?: (id: string) => boolean): Occluder[] {
    const ign = new Set(pad.ignore ?? []), out: Occluder[] = [];
    for (const id of pad.coexist) { if (ign.has(id) || (only && !only(id))) continue; const o = this.occOf(id); if (o) out.push(o); }
    return out;
  }
  padHidden(pad: WfPad, at: Pt, only?: (id: string) => boolean): boolean {
    return viewOf(pad.id, "pad", at, this.occsFor(pad, only), pad.radius ?? PAD_RADIUS).hidden >= HIDDEN_AT;
  }
  /** The building ids that cover at least one sample point of the pad at `at`. */
  hiders(pad: WfPad, at: Pt): string[] {
    const pts = discPoints(at, pad.radius ?? PAD_RADIUS);
    return this.occsFor(pad).filter((o) => pts.some((q) => hides(o, q[0], q[1]))).map((o) => o.ref!);
  }
  stackHidden(id: string, at: Pt, only?: (id: string) => boolean): boolean { return this.by.get(id)!.pads.some((p) => this.padHidden(p, at, only)); }
  /** A spot the stack of `id` can use: on the map, off every other box. */
  spotLegal(id: string, at: Pt): boolean {
    const bx = boxAt(at, PAD_BOX);
    return this.inMap(bx) && this.clear(bx, new Set([`pad:${id}`]));
  }
  /** Every placed pad that is hidden now. */
  hiddenPads(): WfPad[] {
    const out: WfPad[] = [];
    for (const [id, p] of this.placed) for (const pad of p.b.pads) if (this.padHidden(pad, this.spotAt(id))) out.push(pad);
    return out;
  }

  /**
   * The pad repair loop for one hidden pad, exactly as agreed: blocker = the unlocked (current wavefront) building that needs
   * the smallest push to clear the pad; distance 0 runs once (spots only), then for each distance south, south-east, east.
   * Returns the pads a move newly hid (the cascade), or null when the seed is rejected.
   */
  repair(pad: WfPad): WfPad[] | null {
    this.repairs++;
    const own = this.padOwner.get(pad.id)!;
    if (!this.padHidden(pad, this.spotAt(own))) return [];
    const by = this.hiders(pad, this.spotAt(own));
    this.log({ t: "hidden", pad: pad.id, by });
    const before = new Set(this.hiddenPads().map((p) => p.id));
    // distance 0: the blocker where it was placed; try the 3 spots
    const s0 = this.trySpots(own, pad.id);
    if (s0 !== null) { this.setSpot(own, s0); this.log({ t: "fixed", pad: pad.id, spot: s0, d: 0 }); return this.newlyHidden(before); }
    const max = Math.max(this.input.map.w, this.input.map.h);
    // candidates: buildings of the current (unlocked) wavefront that cover the pad, not the pad's own building
    const cands = by.filter((id) => id !== own && this.placed.get(id)!.wave > this.locked);
    if (!cands.length) { this.log({ t: "unresolved", pad: pad.id, why: "hidden only by locked buildings" }); return []; }
    // the push each candidate needs (a dry run of the same loop); smallest wins, the newest on a tie
    let best: { id: string; need: number } | null = null;
    for (const id of cands) {
      const need = this.dryRun(id, own, pad.id, max);
      this.log({ t: "blocker", pad: pad.id, id, need });
      if (need !== null && (!best || need <= best.need)) best = { id, need };
    }
    const blocker = best?.id ?? cands[cands.length - 1]!;
    const res = this.pushLoop(blocker, own, pad.id, max, false);
    if (res === "reject") return null;
    if (res === null) { this.log({ t: "unresolved", pad: pad.id, why: `no push of ${blocker} up to ${max} clears it` }); return []; }
    this.pushes++; this.pushDist += res.d;
    this.log({ t: "fixed", pad: pad.id, spot: res.spot, pushed: blocker, d: res.d, dir: res.dir });
    return this.newlyHidden(before);
  }
  private newlyHidden(before: ReadonlySet<string>): WfPad[] { return this.hiddenPads().filter((p) => !before.has(p.id)); }
  private setSpot(id: string, i: number): void { this.placed.get(id)!.spot = i; }
  /** P's 3 spots in order; the first legal one where every pad of the stack is visible. */
  private trySpots(own: string, padId: string, dry = false): number | null {
    for (let i = 0; i < 3; i++) {
      const at = this.spotAt(own, i), ok = this.spotLegal(own, at) && !this.stackHidden(own, at);
      if (!dry) this.log({ t: "spot", pad: padId, i, ok });
      if (ok) return i;
    }
    return null;
  }
  private dryRun(blocker: string, own: string, padId: string, max: number): number | null {
    const r = this.pushLoop(blocker, own, padId, max, true);
    return r && r !== "reject" ? r.d : null;
  }
  /** The push loop from distance `step` (distance 0 already ran). Dry runs put everything back. */
  private pushLoop(blocker: string, own: string, padId: string, max: number, dry: boolean): { d: number; dir: string; spot: number } | "reject" | null {
    const p = this.placed.get(blocker)!, start = p.at, b = p.b;
    const skip = new Set([`fp:${blocker}`, `pad:${blocker}`]);
    for (let d = this.opts.step; d <= max; d += this.opts.step) {
      for (const dir of DIRS) {
        const to: Pt = [start[0] + dir.d[0] * d, start[1] + dir.d[1] * d];
        const fp = boxAt(to, b.footprint), pb = b.pads.length ? boxAt(spotsOf(to, p.r, p.dirs)[p.spot]!, PAD_BOX) : null;
        if (!this.inMap(fp) || (pb && !this.inMap(pb))) {
          if (!dry) { this.rejected = { id: blocker, kind: b.kind, pad: padId }; this.log({ t: "reject", id: blocker, kind: b.kind, pad: padId, d, dir: dir.name }); }
          return "reject";
        }
        if (!this.clear(fp, skip) || (pb && !this.clear(pb, skip))) { if (!dry) this.log({ t: "overlap", id: blocker, dir: dir.name, d }); continue; }
        p.at = to;
        if (!dry) this.log({ t: "move", id: blocker, dir: dir.name, d, to });
        const s = this.trySpots(own, padId, dry);
        if (s !== null && !dry) { this.setSpot(own, s); return { d, dir: dir.name, spot: s }; }
        p.at = start;
        if (s !== null) return { d, dir: dir.name, spot: s };
      }
    }
    return null;
  }
}

/** The wavefronts: groups of linked buildings join the earliest one's; north-west (earliest) first, input order inside. */
export function wavefronts(bs: readonly WfBuilding[]): WfBuilding[][] {
  const parent = new Map(bs.map((b) => [b.id, b.id]));
  const find = (x: string): string => { let r = x; while (parent.get(r)! !== r) r = parent.get(r)!; return r; };
  for (const b of bs) for (const l of b.links ?? []) if (parent.has(l)) parent.set(find(b.id), find(l));
  const wave = new Map<string, number>();
  for (const b of bs) { const r = find(b.id); wave.set(r, Math.min(wave.get(r) ?? Infinity, b.appear)); }
  const keys = [...new Set(bs.map((b) => wave.get(find(b.id))!))].sort((a, b) => a - b);
  return keys.map((k) => bs.filter((b) => wave.get(find(b.id)) === k));
}

/** Candidate site offsets (along the depth axis a >= 0, along the front b), nearest first. */
let OFFS: { step: number; list: [number, number][] } | null = null;
function offsets(step: number, max: number): [number, number][] {
  if (OFFS && OFFS.step === step) return OFFS.list;
  const n = Math.ceil(max / step), list: [number, number][] = [];
  for (let a = 0; a <= n; a++) for (let b = -n; b <= n; b++) if (a * a + b * b <= n * n) list.push([a * step, b * step]);
  list.sort((x, y) => x[0] * x[0] + x[1] * x[1] - (y[0] * y[0] + y[1] * y[1]) || Math.abs(x[1]) - Math.abs(y[1]) || x[0] - y[0] || y[1] - x[1]);
  OFFS = { step, list };
  return list;
}

export function placeWavefront(input: WfInput, o: WfOptions): WfResult {
  const step = o.step ?? STEP, rng = new Rand(o.seed);
  const S = new WfState(input, { step, trace: o.trace ?? false, maxRepairs: o.maxRepairs ?? 400 });
  const { w, h } = input.map, jit = o.jitter ?? 30;
  const base: Pt = o.origin ?? [w / 2 - ORIGIN_BACK * R2, h / 2 - ORIGIN_BACK * R2];
  const ju = rng.range(-jit, jit), jv = rng.range(-jit, jit);
  const origin: Pt = [base[0] + U[0] * ju + V[0] * jv, base[1] + U[1] * ju + V[1] * jv];
  const offs = offsets(step, Math.hypot(w, h));
  let fallbacks = 0;
  const done = (): WfResult => {
    const hidden = S.rejected ? [] : S.hiddenPads().map((p) => p.id);
    return {
      rejected: S.rejected,
      positions: Object.fromEntries([...S.placed].map(([id, p]) => [id, p.at])),
      padSpots: Object.fromEntries([...S.placed].filter(([, p]) => p.b.pads.length).map(([id, p]) => [id, { i: p.spot, at: S.spotAt(id) }])),
      hidden,
      stats: { rejected: S.rejected ? 1 : 0, pushes: S.pushes, totalPushDistance: S.pushDist, hiddenPads: hidden.length, fallbacks, repairs: S.repairs },
      trace: S.trace,
    };
  };
  // the salvage piles go first, at the north-west edge of the map, locked (wave -1) so they are never pushed
  const piles = input.buildings.filter((b) => b.kind === SALVAGE_KIND);
  if (piles.length) {
    const sites: Pt[] = [];
    for (let y = 0; y <= h; y += step) for (let x = 0; x <= w; x += step) sites.push([x, y]);
    sites.sort((p, q) => p[0] + p[1] - (q[0] + q[1]) || p[1] - q[1]);
    for (const b of piles) {
      const at = sites.find((q) => { const fp = boxAt(q, b.footprint); return S.inMap(fp) && S.clear(fp, new Set()); });
      if (!at) { S.rejected = { id: b.id, kind: b.kind, pad: "" }; S.log({ t: "reject", id: b.id, kind: b.kind, pad: "", d: 0, dir: "no free site" }); return done(); }
      S.place(b.id, at, -1);
      S.log({ t: "place", id: b.id, at, spot: 0, checked: false, fallback: false, tried: 0 });
    }
  }
  const waves = wavefronts(input.buildings.filter((b) => b.kind !== SALVAGE_KIND));
  let front = depth(origin);
  for (let n = 0; n < waves.length; n++) {
    const wave = waves[n]!;
    if (n > 0) front = Math.max(front, ...waves[n - 1]!.map((b) => depth(S.placed.get(b.id)!.at)));
    const anchor: Pt = [origin[0] + U[0] * (front - depth(origin)), origin[1] + U[1] * (front - depth(origin))];
    S.log({ t: "wave", n, ids: wave.map((b) => b.id), front: Math.round(front) });
    for (const b of wave) {
      const flip = rng.chance(0.5) ? -1 : 1;
      let firstFree: Pt | null = null, chosen: { at: Pt; spot: number } | null = null, tried = 0, fb = false;
      for (const [a, bv] of offs) {
        const at: Pt = [anchor[0] + U[0] * a + V[0] * bv * flip, anchor[1] + U[1] * a + V[1] * bv * flip];
        // a band that spans the whole map width (a rockfall pass) can only stand centred across it
        if (b.footprint[2] - b.footprint[0] >= w - 2) at[0] = w / 2 - (b.footprint[0] + b.footprint[2]) / 2;
        const fp = boxAt(at, b.footprint);
        if (!S.inMap(fp) || !S.clear(fp, new Set())) continue;
        const spots = S.spotsAt(b, at).spots;
        const legal = b.pads.length ? spots.map((q) => { const bx = boxAt(q, PAD_BOX); return S.inMap(bx) && S.clear(bx, new Set()) && overlaps(bx, fp) === false; }) : [];
        if (b.pads.length && !legal.some(Boolean)) continue;
        firstFree ??= at;
        tried++;
        if (!o.siteChecks) break;
        S.place(b.id, at, n);
        const locked = (id: string) => (S.placed.get(id)?.wave ?? Infinity) <= S.locked;
        // check 1: one of B's spots is visible past locked buildings
        const vis = b.pads.length ? spots.findIndex((q, i) => legal[i] && !S.stackHidden(b.id, q, locked)) : 0;
        // check 2: B's strip (tallest upgrade) does not hide a live pad that was visible
        let covers = false;
        if (vis >= 0 && b.occ) {
          for (const [id, p] of S.placed) {
            if (id === b.id || !p.b.pads.length) continue;
            const q = S.spotAt(id);
            for (const pad of p.b.pads) {
              if (!pad.coexist.includes(b.id) || pad.ignore?.includes(b.id)) continue;
              if (S.padHidden(pad, q) && !S.padHidden(pad, q, (x) => x !== b.id)) { covers = true; break; }
            }
            if (covers) break;
          }
        }
        S.placed.delete(b.id);
        if (vis >= 0 && !covers) {
          // pads on the first visible spot (against everything placed), else the first visible past locked buildings
          S.place(b.id, at, n);
          const all = b.pads.length ? spots.findIndex((q, i) => legal[i] && !S.stackHidden(b.id, q)) : 0;
          S.placed.delete(b.id);
          chosen = { at, spot: all >= 0 ? all : vis };
          break;
        }
      }
      if (!chosen) {
        if (!firstFree) { S.rejected = { id: b.id, kind: b.kind, pad: "" }; S.log({ t: "reject", id: b.id, kind: b.kind, pad: "", d: 0, dir: "no free site" }); return done(); }
        if (o.siteChecks) { fallbacks++; fb = true; }
        const spots = S.spotsAt(b, firstFree).spots;
        const i = b.pads.length ? Math.max(0, spots.findIndex((q) => S.spotLegal(b.id, q))) : 0;
        chosen = { at: firstFree, spot: i };
      }
      S.place(b.id, chosen.at, n, chosen.spot);
      if (b.pads.length && !chosen.spot && !S.spotLegal(b.id, S.spotAt(b.id))) {
        // the fallback site's spot with no free box: keep the first legal one if any
        const i = S.spotsAt(b, chosen.at).spots.findIndex((q) => S.spotLegal(b.id, q));
        if (i >= 0) S.placed.get(b.id)!.spot = i;
      }
      S.log({ t: "place", id: b.id, at: chosen.at, spot: S.placed.get(b.id)!.spot, checked: o.siteChecks, fallback: fb, tried });
      // repair every live pad that is hidden now (the fallback's repair; a no-op when the checks held), cascades included
      const queue = o.repair === "fallback" && o.siteChecks && !fb ? [] : S.hiddenPads();
      const seen = new Map<string, number>();
      while (queue.length) {
        const pad = queue.shift()!;
        if (S.repairs >= S.opts.maxRepairs || (seen.get(pad.id) ?? 0) >= 3) { S.log({ t: "unresolved", pad: pad.id, why: "repair cap" }); continue; }
        seen.set(pad.id, (seen.get(pad.id) ?? 0) + 1);
        const more = S.repair(pad);
        if (more === null) return done();
        queue.push(...more.filter((p) => !queue.some((q) => q.id === p.id)));
      }
    }
    S.locked = n;
    S.log({ t: "lock", n });
  }
  return done();
}
