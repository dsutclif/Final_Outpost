import occ from "../data/occluders.json";
import genData from "../data/generator.json";
import { ART_M } from "@fo/render-3d/units";
import { HIDDEN_AT, PAD_RADIUS, discPoints, hides, occluders, viewOf, type Occluder, type Pt } from "./viewVisibility.js";
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
  /** Pads of the same building that are live at the same time as this one (they cannot share its spot: side by side). */
  overlaps?: readonly string[];
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
  /** Scrap heap model variant 1..3 (renderer: 1 + node index % 3): 1 ship scrap (tall), 2 scrap field (flat), 3 the fuselage tube. */
  variant?: number;
  /** The pads that sit in this building's plot: pads live one after another share a spot, pads live together take the next spots in order. */
  pads: readonly WfPad[];
  /** Distance of the pad spots from the centre (default: the smallest that keeps a pad box off the footprint). */
  spotR?: number;
  /** "settlement": the pad spots face the already-placed settlement (a rockfall's clear pad sits on the side away from the zone it opens). */
  side?: "settlement";
  /**
   * A rockfall on a walled level: placed after the walls, directly outside a gate (south gate first, else east), centred on it, about the gate's
   * width (whole pad-sized squares), with a row of clear pads (one per square) between the gate and the rockfall, touching its gate-facing edge.
   * Its depth is the footprint's smaller side. Flat (no occluder).
   */
  gateRock?: boolean;
}
export const SALVAGE_KIND = "node.salvage_pile";
/** The perimeter wall ring a level has (defend / rescue levels): the shipped size (informational only: the ring is fitted to the settlement), sections per side, sides that carry a gate (moved to south / east). */
export interface WfWallSpec { dims: [number, number]; split: [number, number]; gateSides: readonly ("n" | "e" | "s" | "w")[] }
/** The medic's hire pad: standalone, not a Core pad; it stands outside the settlement. */
export interface WfMedic { id: string; coexist: readonly string[]; radius?: number }
export interface WfInput { buildings: readonly WfBuilding[]; map: { w: number; h: number }; walls?: WfWallSpec; medic?: WfMedic }
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
  /** Where the scrap heaps go: "after-walls" (default, after the walls, scattered outside them) or "nw-first" (the earlier rule: locked at the north-west edge before the wavefronts). */
  scrap?: "after-walls" | "nw-first";
  /** Scrap walking-distance range from the nearest gate (walled levels) or from the settlement edge (no walls). A difficulty knob; default SCRAP_RANGE. */
  scrapRange?: [number, number];
  /** Wall line clearance from buildings and pads on the north and west sides, beyond the wall's own half thickness (default 6). */
  wallClear?: number;
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
  | { t: "lock"; n: number }
  | { t: "walls"; rect: Box4; strip: { s: number; e: number }; gates: number[] }
  | { t: "medic"; at: Pt }
  | { t: "rock"; id: string; rect: Box4; side: string; pads: Pt[] }
  | { t: "scrap"; id: string; at: Pt; side: string; tries: number; relaxed: boolean };
export interface WfStats { rejected: number; pushes: number; totalPushDistance: number; hiddenPads: number; fallbacks: number; repairs: number; scrapRelaxed: number; sidePads: number }
export interface WfWalls { rect: Box4; points: Pt[]; side: ("n" | "e" | "s" | "w")[]; gates: number[]; /** Hidden ground beyond the wall's centre line, south and east (the strips the lines were placed by). */ strip: { s: number; e: number } }
export interface WfResult {
  rejected: { id: string; kind: string; pad: string } | null;
  positions: Record<string, Pt>;
  /** Each building's pad stack spot (index into its 3 spots and the point). */
  padSpots: Record<string, { i: number; at: Pt }>;
  /** Every pad's own point (a stack's pads that are live together stand on different spots). */
  padAt: Record<string, Pt>;
  walls: WfWalls | null;
  medic: Pt | null;
  /** The gate rockfall (walled levels): its rectangle, the gate side, and one clear-pad point per square (the pad's own padAt entry is the first). */
  rock: Record<string, { rect: Box4; side: string; pads: Pt[] }>;
  scrap: Record<string, { at: Pt; variant: number; side: string }>;
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

/** Scrap walking range default (units from the nearest gate, or from the settlement edge with no walls): min and max of the 103 scrap heaps of the 25 shipped levels that have them. */
export const SCRAP_RANGE: [number, number] = [177, 718];
/** The scrap heap model of a variant (renderer: ship scrap, scrap field, the fuselage tube), null when it is flat. */
export function scrapShape(variant: number): OccShape | null {
  const t = T.types[`node.salvage_pile@${variant}`];
  return t ? { sx: t.scale[0]!, sz: t.scale[2]!, sy: t.scale[1]!, y: t.y, box: t.box } : null;
}
const WALL = (occ as unknown as { wall: { box: Box5; fit: { len: number; depth: number } | null } }).wall;
/** Half the wall's thickness, in world units (the panel's depth as the renderer scales it). */
export const WALL_HALF = Math.max(-WALL.box[2], WALL.box[3]) * ART_M * (WALL.fit?.depth ?? 1);
const wallOcc = (ang: number): Occluder => ({ name: "wall", bx: 0, bz: 0, ang, sx: (WALL.fit?.len ?? 1) * ART_M * 4, sz: ART_M * (WALL.fit?.depth ?? 1), sy: ART_M, y: 0, box: WALL.box });
/**
 * How far the ground is hidden from the camera along one axis, measured from the occluder's centre over every offset along the other axis
 * (the camera looks along a diagonal, so a finite model hides furthest off to one side): s = north of it (-y), e = west of it (-x), and so on.
 */
export function hiddenReach(o: Occluder, dir: "n" | "s" | "e" | "w"): number {
  const d = dir === "s" ? [0, -1] : dir === "e" ? [-1, 0] : dir === "n" ? [0, 1] : [1, 0], lat = [-d[1]!, d[0]!];
  let last = 0;
  for (let l = -500; l <= 500; l += 2) for (let t = Math.floor(last); t <= 600; t += 0.5) if (hides(o, d[0]! * t + lat[0]! * l, d[1]! * t + lat[1]! * l)) last = Math.max(last, t);
  return last;
}
/** Wall hidden strips from the centre line: the south wall (ring side "s", angle pi) hides north of it, the east wall ("e", angle -pi/2) west of it. */
export function wallStrip(): { s: number; e: number } { return (WS ??= { s: hiddenReach(wallOcc(Math.PI), "s"), e: hiddenReach(wallOcc(-Math.PI / 2), "e") }); }
let WS: { s: number; e: number } | null = null, GS: { s: number; e: number } | null = null;
const SS = new Map<number, { s: number; e: number }>();
const GATE = (occ as unknown as { gate: { box: Box5; width: number } }).gate;
const gateOcc = (ang: number): Occluder => ({ name: "struct.gate", bx: 0, bz: 0, ang, sx: ART_M, sz: ART_M, sy: ART_M, y: 0, box: GATE.box });
/** The wall-line gate's hidden strips from the centre line (the gate model is taller than a wall panel, so it hides more ground). */
export function gateStrip(): { s: number; e: number } { return (GS ??= { s: hiddenReach(gateOcc(Math.PI), "s"), e: hiddenReach(gateOcc(-Math.PI / 2), "e") }); }
/** A scrap model's hidden strip beyond its own back face (north of its north edge for a south placement, west of its west edge for east). */
export function scrapStrip(variant: number): { s: number; e: number } {
  const c = SS.get(variant);
  if (c) return c;
  const sh = scrapShape(variant);
  if (!sh) return { s: 0, e: 0 };
  const o: Occluder = { name: "scrap", bx: 0, bz: 0, ang: 0, sx: sh.sx, sz: sh.sz, sy: sh.sy, y: sh.y, box: sh.box };
  const r = { s: Math.max(0, hiddenReach(o, "s") + sh.box[2] * sh.sz), e: Math.max(0, hiddenReach(o, "e") + sh.box[0] * sh.sx) };
  SS.set(variant, r);
  return r;
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

/** A placed building. `spots[j]` is the spot (0..2, spot order) that slot j of its pads stands on; a slot holds the pads that are live one after another. */
class Placed {
  constructor(readonly b: WfBuilding, public at: Pt, public spots: number[], public wave: number, public r: number, public dirs: readonly Pt[]) {}
  get spot(): number { return this.spots[0] ?? 0; }
  set spot(i: number) { if (this.spots.length) this.spots[0] = i; else this.spots = [i]; }
}
/**
 * The mutable layout the loop works on. Exported so tests can set positions by hand and run one repair.
 */
export class WfState {
  readonly by = new Map<string, WfBuilding>();
  readonly placed = new Map<string, Placed>();
  readonly padOwner = new Map<string, string>();
  /** Slot of each pad in its building: pads live one after another share a slot, pads live together take different ones. */
  readonly slot = new Map<string, number>();
  readonly slots = new Map<string, number>();
  /** Occluders beyond the buildings that every pad is tested against (the finished wall ring): set after the walls. */
  extra: Occluder[] = [];
  medicAt: Pt | null = null;
  /** Extra pad boxes that nothing may stand on (the gate rockfall's clear pads). */
  reserved: Box4[] = [];
  locked = -1;
  pushes = 0; pushDist = 0; repairs = 0;
  rejected: WfResult["rejected"] = null;
  readonly trace: TraceStep[] = [];
  constructor(readonly input: WfInput, readonly opts: { step: number; trace: boolean; maxRepairs: number }) {
    for (const b of input.buildings) {
      this.by.set(b.id, b);
      const inSlot: string[][] = [];
      for (const p of b.pads) {
        this.padOwner.set(p.id, b.id);
        const live = (q: string) => (p.overlaps ?? []).includes(q) || (b.pads.find((x) => x.id === q)?.overlaps ?? []).includes(p.id);
        let j = inSlot.findIndex((ids) => !ids.some(live));
        if (j < 0) { j = inSlot.length; inSlot.push([]); }
        inSlot[j]!.push(p.id); this.slot.set(p.id, j);
      }
      this.slots.set(b.id, inSlot.length);
    }
  }
  /** The slot (0..) of a pad. */
  slotOf(pad: string): number { return this.slot.get(pad) ?? 0; }
  /** The building's pads of one slot. */
  slotPads(id: string, j: number): WfPad[] { return this.by.get(id)!.pads.filter((p) => this.slotOf(p.id) === j); }
  /** The point a pad stands on now. */
  padAt(pad: WfPad): Pt { const id = this.padOwner.get(pad.id)!; return this.spotAt(id, this.placed.get(id)!.spots[this.slotOf(pad.id)]); }
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
  /** Place a building; `spot` is slot 0's spot, or all slots' spots. Slots not given take the first spots not in use, in spot order. */
  place(id: string, at: Pt, wave: number, spot: number | readonly number[] = 0): void {
    const b = this.by.get(id)!, { dirs, r } = this.spotsAt(b, at), n = this.slots.get(id) ?? 0;
    const spots = (typeof spot === "number" ? [spot] : [...spot]).slice(0, n);
    for (let i = 0; spots.length < n; i = (i + 1) % 3) if (!spots.includes(i) || spots.length >= 3) spots.push(i);
    this.placed.set(id, new Placed(b, at, spots, wave, r, dirs));
  }
  spotAt(id: string, i?: number): Pt { const p = this.placed.get(id)!; return spotsOf(p.at, p.r, p.dirs)[i ?? p.spot]!; }
  /** The boxes of a building's pad spots in use (one per distinct spot). */
  padBoxes(id: string, p = this.placed.get(id)!): Box4[] { return [...new Set(p.spots)].map((i) => boxAt(spotsOf(p.at, p.r, p.dirs)[i]!, PAD_BOX)); }
  inMap(bx: Box4): boolean { return bx[0] >= 0 && bx[1] >= 0 && bx[2] <= this.input.map.w && bx[3] <= this.input.map.h; }
  /** Boxes standing on the map: every placed footprint and pad stack box, minus the excluded ids ("fp:id" / "pad:id"). */
  clear(bx: Box4, skip: ReadonlySet<string>): boolean {
    for (const [id, p] of this.placed) {
      if (!skip.has(`fp:${id}`) && overlaps(bx, boxAt(p.at, p.b.footprint))) return false;
      if (p.b.pads.length && !skip.has(`pad:${id}`) && this.padBoxes(id).some((q) => overlaps(bx, q))) return false;
    }
    if (this.reserved.some((q) => overlaps(bx, q))) return false;
    if (this.medicAt && !skip.has("pad:medic") && overlaps(bx, boxAt(this.medicAt, PAD_BOX))) return false;
    return true;
  }
  occOf(id: string): Occluder | null {
    const p = this.placed.get(id);
    const o = p?.b.variant !== undefined ? scrapShape(p.b.variant) : p?.b.occ;
    if (!p || !o) return null;
    return { name: p.b.kind, ref: id, bx: p.at[0], bz: p.at[1], ang: 0, sx: o.sx, sz: o.sz, sy: o.sy, y: o.y, box: o.box };
  }
  /** Occluders that can hide pad `pad` (placed, coexisting, not ignored), optionally only those passing `only`. */
  occsFor(pad: WfPad, only?: (id: string) => boolean): Occluder[] {
    const ign = new Set(pad.ignore ?? []), out: Occluder[] = [];
    for (const id of pad.coexist) { if (ign.has(id) || (only && !only(id))) continue; const o = this.occOf(id); if (o) out.push(o); }
    if (!only) out.push(...this.extra);
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
  /** Any pad of slot `j` of building `id` hidden if the slot stood at `at`. */
  slotHidden(id: string, j: number, at: Pt, only?: (id: string) => boolean): boolean { return this.slotPads(id, j).some((p) => this.padHidden(p, at, only)); }
  /**
   * Spots for every slot of building `id` (already placed at its site): slot by slot, the first spot in order that is legal, not used by an
   * earlier slot and where the slot's pads are visible (past `only` buildings). With `vis` off visibility is ignored. Null when a slot has none.
   */
  assign(id: string, legal: readonly boolean[], only?: (id: string) => boolean, vis = true): number[] | null {
    const p = this.placed.get(id)!, spots = spotsOf(p.at, p.r, p.dirs), out: number[] = [];
    for (let j = 0; j < (this.slots.get(id) ?? 0); j++) {
      const i = spots.findIndex((q, k) => legal[k] && !out.includes(k) && (!vis || !this.slotHidden(id, j, q, only)));
      if (i < 0) return null;
      out.push(i);
    }
    return out;
  }
  /** A spot the stack of `id` can use: on the map, off every other box. */
  spotLegal(id: string, at: Pt): boolean {
    const bx = boxAt(at, PAD_BOX);
    return this.inMap(bx) && this.clear(bx, new Set([`pad:${id}`]));
  }
  /** Spot legality of every spot of `id` at its current site. */
  legalSpots(id: string): boolean[] { const p = this.placed.get(id)!; return spotsOf(p.at, p.r, p.dirs).map((q) => this.spotLegal(id, q)); }
  /** The medic's hire pad as a pad (null without one). */
  medicPad(): WfPad | null { const m = this.input.medic; return m ? { id: m.id, coexist: m.coexist, ...(m.radius ? { radius: m.radius } : {}) } : null; }
  /** Every placed pad that is hidden now. */
  hiddenPads(): WfPad[] {
    const out: WfPad[] = [];
    for (const [, p] of this.placed) for (const pad of p.b.pads) if (this.padHidden(pad, this.padAt(pad))) out.push(pad);
    const m = this.medicPad();
    if (m && this.medicAt && this.padHidden(m, this.medicAt)) out.push(m);
    return out;
  }

  /**
   * The pad repair loop for one hidden pad, exactly as agreed: blocker = the unlocked (current wavefront) building that needs
   * the smallest push to clear the pad; distance 0 runs once (spots only), then for each distance south, south-east, east.
   * Returns the pads a move newly hid (the cascade), or null when the seed is rejected.
   */
  repair(pad: WfPad): WfPad[] | null {
    this.repairs++;
    if (pad.id === this.input.medic?.id) { this.log({ t: "unresolved", pad: pad.id, why: "medic pad is not a Core pad" }); return []; }
    const own = this.padOwner.get(pad.id)!;
    if (!this.padHidden(pad, this.padAt(pad))) return [];
    const by = this.hiders(pad, this.padAt(pad));
    this.log({ t: "hidden", pad: pad.id, by });
    const before = new Set(this.hiddenPads().map((p) => p.id));
    // distance 0: the blocker where it was placed; try the 3 spots
    const s0 = this.trySpots(own, pad.id);
    if (s0 !== null) { this.setSpot(own, this.slotOf(pad.id), s0); this.log({ t: "fixed", pad: pad.id, spot: s0, d: 0 }); return this.newlyHidden(before); }
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
  private setSpot(id: string, slot: number, i: number): void { this.placed.get(id)!.spots[slot] = i; }
  /** The building's 3 spots in order for the pad's slot: the first one no other slot stands on, legal, where the slot's pads are visible. */
  private trySpots(own: string, padId: string, dry = false): number | null {
    const slot = this.slotOf(padId), used = this.placed.get(own)!.spots;
    for (let i = 0; i < 3; i++) {
      if (used.some((u, j) => j !== slot && u === i)) continue;
      const at = this.spotAt(own, i), ok = this.spotLegal(own, at) && !this.slotHidden(own, slot, at);
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
        const fp = boxAt(to, b.footprint), pbs = b.pads.length ? [...new Set(p.spots)].map((i) => boxAt(spotsOf(to, p.r, p.dirs)[i]!, PAD_BOX)) : [];
        if (!this.inMap(fp) || pbs.some((q) => !this.inMap(q))) {
          if (!dry) { this.rejected = { id: blocker, kind: b.kind, pad: padId }; this.log({ t: "reject", id: blocker, kind: b.kind, pad: padId, d, dir: dir.name }); }
          return "reject";
        }
        if (!this.clear(fp, skip) || pbs.some((q) => !this.clear(q, skip))) { if (!dry) this.log({ t: "overlap", id: blocker, dir: dir.name, d }); continue; }
        p.at = to;
        if (!dry) this.log({ t: "move", id: blocker, dir: dir.name, d, to });
        const s = this.trySpots(own, padId, dry);
        if (s !== null && !dry) { this.setSpot(own, this.slotOf(padId), s); return { d, dir: dir.name, spot: s }; }
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
  let fallbacks = 0, scrapRelaxed = 0, walls: WfWalls | null = null;
  const scrapOut: WfResult["scrap"] = {}, rockOut: WfResult["rock"] = {};
  const done = (): WfResult => {
    const hidden = S.rejected ? [] : S.hiddenPads().map((p) => p.id);
    const padAt: Record<string, Pt> = {};
    for (const [, p] of S.placed) for (const pad of p.b.pads) padAt[pad.id] = S.padAt(pad);
    if (S.medicAt && input.medic) padAt[input.medic.id] = S.medicAt;
    for (const [id, r] of Object.entries(rockOut)) for (const pad of input.buildings.find((x) => x.id === id)?.pads ?? []) padAt[pad.id] = r.pads[0]!;
    return {
      rejected: S.rejected,
      positions: Object.fromEntries([...S.placed].map(([id, p]) => [id, p.at])),
      padSpots: Object.fromEntries([...S.placed].filter(([, p]) => p.b.pads.length).map(([id, p]) => [id, { i: p.spot, at: S.spotAt(id) }])),
      padAt, walls, medic: S.medicAt, rock: rockOut, scrap: scrapOut,
      hidden,
      stats: { rejected: S.rejected ? 1 : 0, pushes: S.pushes, totalPushDistance: S.pushDist, hiddenPads: hidden.length, fallbacks, repairs: S.repairs, scrapRelaxed, sidePads: [...S.slots.values()].reduce((a, n) => a + Math.max(0, n - 1), 0) },
      trace: S.trace,
    };
  };
  // scrap heaps: after the walls by default; "nw-first" puts them first, at the north-west edge of the map, locked (wave -1) so they are never pushed
  const piles = input.buildings.filter((b) => b.kind === SALVAGE_KIND);
  if (piles.length && o.scrap === "nw-first") {
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
  const gateRocks = input.walls ? input.buildings.filter((b) => b.gateRock) : [];
  const waves = wavefronts(input.buildings.filter((b) => b.kind !== SALVAGE_KIND && !(input.walls && b.gateRock)));
  let front = depth(origin);
  for (let n = 0; n < waves.length; n++) {
    const wave = waves[n]!;
    if (n > 0) front = Math.max(front, ...waves[n - 1]!.map((b) => depth(S.placed.get(b.id)!.at)));
    const anchor: Pt = [origin[0] + U[0] * (front - depth(origin)), origin[1] + U[1] * (front - depth(origin))];
    S.log({ t: "wave", n, ids: wave.map((b) => b.id), front: Math.round(front) });
    for (const b of wave) {
      const flip = rng.chance(0.5) ? -1 : 1;
      let firstFree: Pt | null = null, chosen: { at: Pt; spots: number[] } | null = null, tried = 0, fb = false;
      for (const [a, bv] of offs) {
        const at: Pt = [anchor[0] + U[0] * a + V[0] * bv * flip, anchor[1] + U[1] * a + V[1] * bv * flip];
        // a band that spans the whole map width (a rockfall pass) can only stand centred across it
        if (b.footprint[2] - b.footprint[0] >= w - 2) at[0] = w / 2 - (b.footprint[0] + b.footprint[2]) / 2;
        const fp = boxAt(at, b.footprint);
        if (!S.inMap(fp) || !S.clear(fp, new Set())) continue;
        const spots = S.spotsAt(b, at).spots;
        const legal = b.pads.length ? spots.map((q) => { const bx = boxAt(q, PAD_BOX); return S.inMap(bx) && S.clear(bx, new Set()) && overlaps(bx, fp) === false; }) : [];
        if (b.pads.length && legal.filter(Boolean).length < (S.slots.get(b.id) ?? 0)) continue;
        firstFree ??= at;
        tried++;
        if (!o.siteChecks) break;
        S.place(b.id, at, n);
        const locked = (id: string) => (S.placed.get(id)?.wave ?? Infinity) <= S.locked;
        // check 1: one of B's spots is visible past locked buildings
        const vis = b.pads.length ? S.assign(b.id, legal, locked) : [];
        // check 2: B's strip (tallest upgrade) does not hide a live pad that was visible
        let covers = false;
        if (vis && b.occ) {
          for (const [id, p] of S.placed) {
            if (id === b.id || !p.b.pads.length) continue;
            for (const pad of p.b.pads) {
              if (!pad.coexist.includes(b.id) || pad.ignore?.includes(b.id)) continue;
              const q = S.padAt(pad);
              if (S.padHidden(pad, q) && !S.padHidden(pad, q, (x) => x !== b.id)) { covers = true; break; }
            }
            if (covers) break;
          }
        }
        S.placed.delete(b.id);
        if (vis && !covers) {
          // pads on the first visible spots (against everything placed), else the first visible past locked buildings
          S.place(b.id, at, n);
          const all = b.pads.length ? S.assign(b.id, legal) : [];
          S.placed.delete(b.id);
          chosen = { at, spots: all ?? vis };
          break;
        }
      }
      if (!chosen) {
        if (!firstFree) { S.rejected = { id: b.id, kind: b.kind, pad: "" }; S.log({ t: "reject", id: b.id, kind: b.kind, pad: "", d: 0, dir: "no free site" }); return done(); }
        if (o.siteChecks) { fallbacks++; fb = true; }
        // the fallback site: legal spots in order, visible or not
        S.place(b.id, firstFree, n);
        const lg = S.legalSpots(b.id);
        const as = b.pads.length ? S.assign(b.id, lg, undefined, false) : [];
        S.placed.delete(b.id);
        chosen = { at: firstFree, spots: as ?? [] };
      }
      S.place(b.id, chosen.at, n, chosen.spots);
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
  // walls, once every building is locked (south and east lines a wall strip beyond the furthest pad)
  const strip = wallStrip();
  if (input.walls) {
    const fit = fitWalls(S, input.walls, o.wallClear ?? 6, strip);
    if (!fit) { S.rejected = { id: "ring", kind: "barrier.line", pad: "" }; S.log({ t: "reject", id: "ring", kind: "barrier.line", pad: "", d: 0, dir: "off the map" }); return done(); }
    walls = fit;
    S.extra = occluders([{ type: "barrier.line", id: "ring", points: fit.points, closed: true, gates: fit.gates, prebuilt: fit.points.map((_, i) => i) } as never], { final: true });
    S.log({ t: "walls", rect: fit.rect, strip, gates: fit.gates });
  }
  // gate rockfalls, outside a gate, before the medic and the scrap (which stay clear of them)
  for (const b of gateRocks) {
    const r = placeGateRock(S, b, walls!);
    if (!r) { S.rejected = { id: b.id, kind: b.kind, pad: b.pads[0]?.id ?? "" }; S.log({ t: "reject", id: b.id, kind: b.kind, pad: b.pads[0]?.id ?? "", d: 0, dir: "no gate rockfall site" }); return done(); }
    rockOut[b.id] = r;
  }
  // the medic's hire pad, outside the settlement
  if (input.medic) {
    const at = placeMedic(S, walls, strip);
    if (!at) { S.rejected = { id: input.medic.id, kind: "pad.hire", pad: input.medic.id }; S.log({ t: "reject", id: input.medic.id, kind: "pad.hire", pad: input.medic.id, d: 0, dir: "no room outside" }); return done(); }
    S.medicAt = at;
    S.log({ t: "medic", at });
  }
  // scrap, after the walls
  if (piles.length && o.scrap !== "nw-first") {
    const sr = new Rand((Math.imul(o.seed >>> 0, 2654435761) ^ 0x5c4a9) >>> 0);
    for (const b of piles) {
      const r = scatterScrap(S, sr, b, walls, strip, o.scrapRange ?? SCRAP_RANGE);
      if (!r) { S.rejected = { id: b.id, kind: b.kind, pad: "" }; S.log({ t: "reject", id: b.id, kind: b.kind, pad: "", d: 0, dir: "no scrap site" }); return done(); }
      if (r.relaxed) scrapRelaxed++;
      scrapOut[b.id] = { at: r.at, variant: b.variant ?? 0, side: r.side };
      S.log({ t: "scrap", id: b.id, at: r.at, side: r.side, tries: r.tries, relaxed: r.relaxed });
    }
  }
  return done();
}

type Side = "n" | "e" | "s" | "w";
const SIDES: readonly Side[] = ["n", "e", "s", "w"];
const NORMAL: Record<Side, Pt> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const GATE_WIDTH = (occ as unknown as { gate: { width: number } }).gate.width;

/** Settlement extent: every placed building footprint (scrap heaps excluded) and pad box, plus the pads' furthest reach. */
function settlementBox(S: WfState): { box: Box4; padMaxX: number; padMaxY: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, px = -Infinity, py = -Infinity;
  const add = (b: Box4) => { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); };
  for (const [id, p] of S.placed) {
    if (p.b.kind === SALVAGE_KIND) continue;
    add(boxAt(p.at, p.b.footprint));
    for (const bx of S.padBoxes(id)) add(bx);
    for (const pad of p.b.pads) { const q = S.padAt(pad), r = pad.radius ?? PAD_RADIUS; px = Math.max(px, q[0] + r); py = Math.max(py, q[1] + r); }
  }
  return { box: [x0, y0, x1, y1], padMaxX: px, padMaxY: py };
}

/** Gate sides after Doug's rule (2026-11-16): gates stand on the south and east sides only; a north gate moves to the south, a west gate to the east. South first. */
export function gateSidesOf(sides: readonly Side[]): Side[] {
  const set = new Set<Side>(sides.map((x) => (x === "n" ? "s" : x === "w" ? "e" : x)));
  if (!set.size) set.add("s");
  return (["s", "e"] as Side[]).filter((x) => set.has(x));
}

/**
 * The wall ring, fitted once all buildings are locked: the north and west lines keep the wall's half thickness + wallClear from every
 * building and pad box; the south and east lines go at least the hidden strip beyond the furthest south / east pad (plus its radius).
 * The ring fits the settlement only (spec.dims is not used). Gates stand on the south and east sides only (see gateSidesOf). Null when a required line is off the map.
 */
export function fitWalls(S: WfState, spec: WfWallSpec, clear: number, strip: { s: number; e: number }, edge = 14): WfWalls | null {
  const { box, padMaxX, padMaxY } = settlementBox(S), c = WALL_HALF + clear, { w, h } = S.input.map;
  // Doug 2026-11-16: the ring fits the settlement only (no shipped-size minimum). The south and east lines sit at least the gate's hidden strip
  // beyond the furthest pad, since gates go on those two sides.
  const gs = gateStrip(), need = { s: Math.max(strip.s, gs.s), e: Math.max(strip.e, gs.e) };
  let x0 = box[0] - c, y0 = box[1] - c, x1 = Math.max(box[2] + c, padMaxX + need.e), y1 = Math.max(box[3] + c, padMaxY + need.s);
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  if (x0 < edge || y0 < edge || x1 > w - edge || y1 > h - edge) { S.log({ t: "walls", rect: [x0, y0, x1, y1], strip, gates: [] }); return null; }
  const [hh, vv] = spec.split, points: Pt[] = [], side: Side[] = [], r = Math.round;
  for (let k = 0; k < hh; k++) { points.push([r(x0 + ((x1 - x0) * k) / hh), y0]); side.push("n"); }
  for (let k = 0; k < vv; k++) { points.push([x1, r(y0 + ((y1 - y0) * k) / vv)]); side.push("e"); }
  for (let k = 0; k < hh; k++) { points.push([r(x1 - ((x1 - x0) * k) / hh), y1]); side.push("s"); }
  for (let k = 0; k < vv; k++) { points.push([x0, r(y1 - ((y1 - y0) * k) / vv)]); side.push("w"); }
  const gates = gateSidesOf(spec.gateSides).map((gs) => { const ix = side.map((sd, i) => ({ sd, i })).filter((q) => q.sd === gs); return ix[Math.floor(ix.length / 2)]!.i; });
  return { rect: [x0, y0, x1, y1], points, side, gates, strip };
}

/** One rockfall square is as wide as a pad box. */
export const ROCK_SQUARE = PAD_BOX[2] - PAD_BOX[0];
/** Squares in a gate-width rockfall. */
export const gateRockSquares = (): number => Math.max(1, Math.round(GATE_WIDTH / ROCK_SQUARE));

/**
 * The gate rockfall (Doug's drawing): beyond the first gate on the south side (else east) the wall, a row of clear pads (one per square, a pad
 * box wide, clear of the wall band), then the rockfall touching the row's outer edge, centred on the gate, gateRockSquares() squares wide.
 * A gate whose pads would be hidden, off the map or on something is skipped; null when no gate works. The rockfall is registered as a flat building.
 */
export function placeGateRock(S: WfState, b: WfBuilding, wl: WfWalls): { rect: Box4; side: string; pads: Pt[] } | null {
  const n = gateRockSquares(), depthR = Math.min(b.footprint[2] - b.footprint[0], b.footprint[3] - b.footprint[1]), pad = b.pads[0], band = ringBand(wl), half = ROCK_SQUARE / 2;
  const order = [...wl.gates].sort((x, y) => (wl.side[x] === "s" ? 0 : 1) - (wl.side[y] === "s" ? 0 : 1));
  for (const gi of order) {
    const sd = wl.side[gi]!, a = wl.points[gi]!, c = wl.points[(gi + 1) % wl.points.length]!;
    const mid: Pt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], nrm = NORMAL[sd], tan: Pt = [-nrm[1], nrm[0]];
    const at = (t: number, o: number): Pt => [Math.round(mid[0] + tan[0] * t + nrm[0] * o), Math.round(mid[1] + tan[1] * t + nrm[1] * o)];
    // offsets along the outward normal from the ring line: the wall band's outer edge, then the pad row, then the rockfall
    const o0 = (sd === "s" ? band[3] - mid[1] : band[2] - mid[0]) + 1;
    const pads: Pt[] = [];
    for (let k = 0; k < n; k++) pads.push(at((k - (n - 1) / 2) * ROCK_SQUARE, o0 + half));
    const p0 = at(-n * half, o0 + ROCK_SQUARE), p1 = at(n * half, o0 + ROCK_SQUARE + depthR);
    const rect: Box4 = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])];
    const boxes = pads.map((q) => boxAt(q, PAD_BOX));
    if (![...boxes, rect].every((bx) => S.inMap(bx) && S.clear(bx, new Set()))) continue;
    if (pad && pads.some((q) => S.padHidden(pad, q))) continue;
    const ctr: Pt = [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2];
    S.by.set(b.id, { ...b, footprint: [rect[0] - ctr[0], rect[1] - ctr[1], rect[2] - ctr[0], rect[3] - ctr[1]], pads: [], occ: null });
    S.place(b.id, ctr, -1);
    S.reserved.push(...boxes);
    S.log({ t: "rock", id: b.id, rect, side: sd, pads });
    return { rect, side: sd, pads };
  }
  return null;
}

/** The ring's wall band: the ring rectangle grown by the wall's half thickness and a small gap (a box inside it touches a wall or is inside the ring). */
const ringBand = (wl: WfWalls): Box4 => { const g = WALL_HALF + 4; return [wl.rect[0] - g, wl.rect[1] - g, wl.rect[2] + g, wl.rect[3] + g]; };

/**
 * The medic's hire pad (Doug: not a Core pad, outside the settlement). Rule chosen: walled levels put it outside the wall beside the first
 * gate (clear of the door, a pad radius off the wall face; on a north or west gate a wall strip off the wall); levels without walls put it
 * a pad radius + 12 past the settlement's south edge (then east, north, west), scanning outward from the middle. The first spot that is on the
 * map, off every box and visible with every wall and building standing wins.
 */
export function placeMedic(S: WfState, wl: WfWalls | null, strip: { s: number; e: number }): Pt | null {
  const m = S.medicPad()!, R = m.radius ?? PAD_RADIUS;
  const ok = (q: Pt): boolean => {
    const bx = boxAt(q, PAD_BOX);
    if (!S.inMap(bx) || !S.clear(bx, new Set())) return false;
    if (wl) { const b = ringBand(wl); if (bx[0] < b[2] && b[0] < bx[2] && bx[1] < b[3] && b[1] < bx[3]) return false; }
    return !S.padHidden(m, q);
  };
  if (wl) {
    for (const gi of wl.gates) {
      const sd = wl.side[gi]!, a = wl.points[gi]!, b = wl.points[(gi + 1) % wl.points.length]!, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nrm = NORMAL[sd], tan: Pt = [-nrm[1], nrm[0]];
      const out = sd === "s" || sd === "e" ? WALL_HALF + R + 8 : (sd === "n" ? strip.s : strip.e) + R + 6, half = Math.min(GATE_WIDTH, len) / 2 + R + 12;
      for (const t of [half, -half, half + R * 2, -half - R * 2]) { const q: Pt = [mid[0] + tan[0] * t + nrm[0] * out, mid[1] + tan[1] * t + nrm[1] * out]; if (ok(q)) return [Math.round(q[0]), Math.round(q[1])]; }
    }
    // no gate spot: scan the ring's outside, nearest the first gate first
    const g0 = wl.points[wl.gates[0] ?? 0]!, cands: Pt[] = [], rr = wl.rect, d = R + WALL_HALF + 12;
    for (let x = rr[0] - d; x <= rr[2] + d; x += 6) { cands.push([x, rr[1] - d - strip.s], [x, rr[3] + d]); }
    for (let y = rr[1] - d; y <= rr[3] + d; y += 6) { cands.push([rr[0] - d - strip.e, y], [rr[2] + d, y]); }
    cands.sort((p, q) => Math.hypot(p[0] - g0[0], p[1] - g0[1]) - Math.hypot(q[0] - g0[0], q[1] - g0[1]));
    for (const q of cands) if (ok(q)) return [Math.round(q[0]), Math.round(q[1])];
    return null;
  }
  const { box } = settlementBox(S), cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, d = R + 12;
  const lines: { fixed: number; horiz: boolean }[] = [{ fixed: box[3] + d, horiz: true }, { fixed: box[2] + d, horiz: false }, { fixed: box[1] - d, horiz: true }, { fixed: box[0] - d, horiz: false }];
  for (const ln of lines) {
    const mid = ln.horiz ? cx : cy;
    for (let k = 0; k < 400; k++) {
      for (const sg of k ? [1, -1] : [1]) {
        const t = mid + sg * k * 6, q: Pt = ln.horiz ? [t, ln.fixed] : [ln.fixed, t];
        if (ok(q)) return [Math.round(q[0]), Math.round(q[1])];
      }
    }
  }
  return null;
}

/**
 * One scrap heap, at random outside the walls (or around the settlement with none) within the walking range of a gate (the settlement edge
 * with no walls). A heap whose own hidden strip beyond its back face is longer than the wall's goes only on the north and west sides (it
 * could hide a pad one wall strip inside a south or east wall). It stays off walls, gates, buildings, pads and other heaps, and never hides a pad.
 * After 400 tries inside the range it relaxes the range once (counted); null when nothing fits.
 */
export function scatterScrap(S: WfState, rng: Rand, b: WfBuilding, wl: WfWalls | null, strip: { s: number; e: number }, range: [number, number]): { at: Pt; side: string; tries: number; relaxed: boolean } | null {
  const { w, h } = S.input.map, st = b.variant !== undefined ? scrapStrip(b.variant) : { s: 0, e: 0 };
  const restricted = !!wl && (st.s > strip.s - WALL_HALF || st.e > strip.e - WALL_HALF);
  const band = wl ? ringBand(wl) : null, { box: sb } = settlementBox(S);
  const gates = wl ? wl.gates.map((i) => { const a = wl.points[i]!, c = wl.points[(i + 1) % wl.points.length]!; return [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] as Pt; }) : [];
  const dist = (q: Pt): number => wl ? Math.min(...gates.map((g) => Math.hypot(q[0] - g[0], q[1] - g[1]))) : Math.hypot(Math.max(sb[0] - q[0], 0, q[0] - sb[2]), Math.max(sb[1] - q[1], 0, q[1] - sb[3]));
  const sideOf = (q: Pt): string => !wl ? "-" : q[1] > wl.rect[3] ? "s" : q[0] > wl.rect[2] ? "e" : q[1] < wl.rect[1] ? "n" : q[0] < wl.rect[0] ? "w" : "in";
  const base = S.hiddenPads().length;
  let tries = 0;
  for (const relaxed of [false, true]) {
    for (let k = 0; k < 400; k++) {
      tries++;
      const q: Pt = [Math.round(rng.range(0, w)), Math.round(rng.range(0, h))], fp = boxAt(q, b.footprint);
      if (!S.inMap(fp)) continue;
      if (band && fp[0] < band[2] && band[0] < fp[2] && fp[1] < band[3] && band[1] < fp[3]) continue;
      const sd = sideOf(q);
      if (restricted && sd !== "n" && sd !== "w") continue;
      if (!relaxed) { const dd = dist(q); if (dd < range[0] || dd > range[1]) continue; }
      if (!S.clear(fp, new Set())) continue;
      S.place(b.id, q, -1);
      if (S.hiddenPads().length > base) { S.placed.delete(b.id); continue; }
      return { at: q, side: sd, tries, relaxed };
    }
  }
  return null;
}
