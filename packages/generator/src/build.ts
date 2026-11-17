import { CONTENT_VERSION, LOOK, PLOT, maxModelScale, content as defaultContent, type PlotFile, type Content, type Manifest } from "@fo/content";
import { padVisibilityReport, shadowTest, type PadVisibilityReport, type ViewEnt } from "./viewVisibility.js";
import { lifetimeVisibility, staticWindows, type Manifest as RepairManifest } from "./padRepair.js";
import { placeWavefront } from "./wavefront.js";
import { convert } from "./wavefrontConvert.js";
import { ENGINE_VERSION, createSim, salesLayout, type Compiled } from "@fo/sim";
import { MEDIC_FAR_BAY, planBot } from "@fo/bots";
import templatesData from "../data/templates.json";
import genData from "../data/generator.json";
import { flowModel, type Flow } from "./flow.js";
import { Placer, dist, inRect, segDist, type Box, type Pt, type Rect } from "./layout.js";
import { Rand, clamp01, hashStr, lerp, mix, round1, round2 } from "./rand.js";
import { placeTerrain, type TerrainData } from "./terrain.js";
import { traderRoute } from "./route.js";
import { FIRST_GUARDS, scrapNeed, waveScrap } from "./budget.js";

// Stages 2-4 of the spec, per level family (REDESIGN-R2 §6): layout from a template by constraint
// placement (fuel forests near the base in every level, perimeter rings only where walls are needed),
// economy parameters drawn from the knob ranges, then the goal, the star objectives and the fail
// conditions. Every number comes from data (templates.json, generator.json, content); nothing names a
// level. Rate goals (earn N, hunt N ...) get a placeholder N that index.ts sizes from a probe run.

export type Family = "shelter" | "rescue" | "harvest" | "industrialize" | "defend";

export interface Template {
  id: string;
  zones: string[];
  core: [number, number];
  start: [number, number];
  fields: { material: [number, number, number, number]; food: [number, number, number, number]; fuel: [number, number, number, number] };
  shop: [number, number];
  landmark: [number, number];
  prey: [number, number, number, number];
  depot: [number, number];
}
interface TemplatesFile { templates: Template[] }
export const TEMPLATES = templatesData as unknown as TemplatesFile;
type RingDims = { hw: number; hh: number; split: [number, number] };
export const GEN = genData as unknown as {
  knobs: Record<string, [number, number]>;
  dressing: string[];
  /** Dangerous prey: odds that a hunting level that earns any (knob `dangerPrey` rounds above 0) gets them, and the most in one zone. */
  danger: { chance: number; max: number };
  jitter: number;
  /** Every Nth level of a pack, by level number, gets manifest lighting "night" (renderer only, so ratings hold); 0: never. */
  nightEvery: number;
  /** Multiplier on the generated time target (time star seconds and level.budgetSeconds): the player-facing time allowance. */
  timeTargetK: number;
  costs: Record<string, number>;
  rings: { defend: RingDims; rescue: RingDims; rescueShop: RingDims; podGap: number; edge: number; podRoom: number };
  spacing: { margin: number; standR: number; screen: [number, number]; screenRadius: number; footprintGap: number; corePull: number; fieldPull?: number };
  traderRoute: { cell: number; clear: number; door: number };
  /** Ranger pad in the hunting grounds: the 3D renderer's art metre and its two burrow models' half sizes (art metres), and the gap kept to them. */
  ranger: { artM: number; burrowHalf: [number, number][]; gap: number };
  lots: { block: number; street: number };
  /** Ground rect [x0, y0, x1, y1] around the centre of each model the 3D renderer draws (render-3d tests keep these honest). */
  footprints: Record<string, [number, number, number, number]>;
  /** Hire pad offsets from a converter's centre for its input worker, operator and output worker. */
  crewStations: Record<"in" | "op" | "out", [number, number]>;
  /**
   * Plot layout (Doug's plot plan, 2026-10-25), off unless a tool sets it (the layout sandbox does; packs
   * never do): per building type, the pad slots of its plot as offsets from its centre. Each building then
   * reserves its slots (mirrored if blocked), and its pads stand on them: a machine's workers and upgrade
   * share its one staff slot, chained in hire order. Footprints are set alongside it by the same tool.
   */
  plots?: Record<string, { slots: { id: string; dx: number; dy: number }[]; alts?: { id: string; dx: number; dy: number }[][] }> | null;
  /** Plot layout: each plotted building's model box without the ground it hides (gatherables may lie there). */
  plotBodies?: Record<string, [number, number, number, number]> | null;
  /** Share of the way from the template's kiosk spot toward the core where the kiosk search centres. */
  shopPull: number;
  /** Most fuel nodes in the main forest on industrialize levels (their machines need the room). */
  busyForestMax: number;
  /** Reactor level pads: x either side of the core and y below its centre, just clear of its model. */
  corePadBeside: [number, number];
  /** Depot hire pad offsets from its centre: input worker left, output worker (hauler) right. */
  depotCrewStations: Record<"in" | "out", [number, number]>;
  /** Cashier hire pad offset from the clerk spot (south of it, clear of the queue lane). */
  /** Cashier pad offsets from the clerk spot, in preference order (y sign follows the clerk's side). */
  cashierPads: [number, number][];
  /** With a belt: the parts works stands this far from the smelter, at one of beltPairs' directions. */
  beltGap: number;
  beltPairs: [number, number][];
  /** Latest first-wave time, seconds, on single-family levels. */
  waveStartMax: number;
  /** Defend wave shape and wall towers (R3 item 3); see generator.json. */
  defendWaves: { maxPoints: number; waveCap: number; lateWaveGap: number; lateWaveMin: number; firstShare: number; earlyGrowth: number; lateFrom: number; lateGrowth: number; finaleGrowthK: number; raiders: number; lateRaiders: number; gap: number; lateGap: number; dropsPerNeed: number; dropsPerEarlyNeed: number; lateStep: number; surviveTail: number; fullGrowMax: number; growthStep: number; spawnMax: number; minGap: number; raid: { t: number; swarmlings: number; raiders: number; gap: number } };
  /** Goals a conveyor belt is laid for (it must be used before the goal lands). */
  /** Batch 3: scrap heaps on some defend levels; see generator.json. */
  storms: { warn: number; duration: number; growStep: number; maxDuration: number };
  rockslide: { rewards: { kind: string; weight: number; node: string; count: number; resource: string }[] };
  /** Play-shape beat-breakers (outpost-ops#151, 151.4); see generator.json. Costs are keys of `costs`. */
  beatBreakers: { families: string[]; skipGoals: string[]; lateHires: { id: string; from: "food" | "core"; cost: string }[]; cashierCost: string };
  scrapHeaps: { chance: number; n: [number, number]; outside: number; band: number; roadGap: number };
  /** Batch 3 turret sockets at each attack gate; see generator.json. */
  medicPad: { u: number; v: number; near: number };
  /** Camera view rules: no pad behind a building or wall; attack sides face the camera; see generator.json. */
  viewClear: { wallShadow: number; attackSides: ("n" | "e" | "s" | "w")[]; realCamera: boolean; placeShade?: boolean };
  defendSockets: { keepForest: number; startInside: number; inside: [number, number][]; insideEW: [number, number][]; edge: number; wallClear: number; laneClear: number; siteR: number; search: number };
  /** Wall-free defend levels (outpost-ops#208): the reactor-ring sockets, the lane cap and the early salvage floor; see generator.json. */
  defendFree: { refLevel: number; band: [number, number]; frac: number; sockets: number; start: number; minSockets: number; phase: number; angleSearch: number; padDepth: number; lanesBeforeCore2: number; firstTowerScale: number; earlyWaves: number; earlyDrops: number };
  /** Batch 3: the padded defend map and the socket-lined roads; see generator.json. */
  defendRoad: { pad: number; maxPairs: number; first: number; step: number; towerU: number; towerUEW: number; endGap: number; priceGrowth: number };
  conveyorGoals: string[];
  /** Geography: how often and how a level gets ridges, outcrops and chasms (terrain.ts). */
  terrain: TerrainData;
  search: { maxIterations: number; tolerance: number; funThreshold: number; quickSeeds: { ref: number; other: number }; fullSeeds: { ref: number; other: number }; layoutTries: number; humanCheck: { seeds: number; minWins: number }; verifyWithin: number; finalTries: number; maxWidens: number; outOfReachErr: number; loopCap: number; loopHireCut: number; loopEaseSteps: number; loopBurnEase: number; loopLengthCut: number; loopStartCurrency: number };
};

/** A wave's strength: the HP of everything in it. */
export const wavePoints = (counts: Record<string, number>, c: Content): number =>
  Object.entries(counts).reduce((t, [h, n]) => t + n * (c.hostiles[h]?.hp ?? 0), 0);

/** No wave above max points (rule 7, docs/LEVEL-RULES.md): swarmlings make up the difference, being the numbers of a wave. */
export function capWavePoints(waves: readonly { counts: Record<string, number> }[], c: Content, max: number): void {
  for (const w of waves) {
    const over = wavePoints(w.counts, c) - max;
    if (over > 0 && w.counts["hostile.swarmling"]) w.counts["hostile.swarmling"] = Math.max(0, w.counts["hostile.swarmling"] - over);
  }
}

type SplitWave = { t: number; counts: Record<string, number>; side?: string | string[]; gap?: number };
/**
 * Denser, not bigger (Doug: the last waves dragged on): every regular wave from the first one over cap points on is
 * split into even pieces of at most cap points, the pieces arriving `spacing` s apart from that wave's start. The
 * warlords are placed again by the count rule (the last wave, and the third from last when there are 5 or more); a
 * warlord added that way takes its points out of the swarmlings, so the level's total points and drops stay the same.
 * cap 0 is off. Returns whether anything changed.
 */
export function splitWaves(waves: SplitWave[], regular: Set<SplitWave>, c: Content,
  o: { cap: number; lateGap: number; spacing: number; minSpacing: number; spawnMax: number; sides: readonly string[]; bosses: boolean }): boolean {
  const BOSS = "hostile.boss", SW = "hostile.swarmling";
  const reg = waves.filter((w) => regular.has(w));
  const bossHp = c.hostiles[BOSS]?.hp ?? 0;
  const effCap = o.cap - (o.bosses ? bossHp : 0);
  const bare = (w: SplitWave) => wavePoints(w.counts, c) - (w.counts[BOSS] ?? 0) * bossHp;
  const from = reg.findIndex((w) => bare(w) > effCap);
  if (o.cap <= 0 || effCap <= 0 || from < 0) return false;
  const bossesOld = reg.reduce((a, w) => a + (w.counts[BOSS] ?? 0), 0);
  for (const w of reg) delete w.counts[BOSS];
  const head = reg.slice(0, from), tail: SplitWave[] = [];
  for (const w of reg.slice(from)) {
    // even shares, the remainder going to the first pieces (one more piece while a remainder tips one over)
    const share = (n: number, i: number) => {
      const counts: Record<string, number> = {};
      for (const [h, v] of Object.entries(w.counts)) { const q = Math.floor(v / n) + (i < v % n ? 1 : 0); if (q > 0) counts[h] = q; }
      return counts;
    };
    let n = Math.max(1, Math.ceil(bare(w) / effCap));
    while (wavePoints(share(n, 0), c) > effCap) n++;
    for (let i = 0; i < n; i++) {
      const counts = share(n, i);
      tail.push({ t: w.t, counts, gap: n > 1 ? Math.max(w.gap ?? o.lateGap, o.lateGap) : w.gap ?? o.lateGap });
    }
  }
  // The pieces fit into the time the old waves took: the last piece finishes spawning when the old last wave did, so
  // it starts no more than that wave's spawning time later (attempt 1 pushed it out by up to 3 minutes; packing them
  // before the old last start made the levels unwinnable). The spacing tightens down to minSpacing where there are
  // many pieces; past that the first pieces start earlier (never before the wave ahead of them), then close up further.
  const dur = (w: SplitWave) => Math.min(o.spawnMax, Object.values(w.counts).reduce((a, n) => a + n, 0) * (w.gap ?? o.lateGap));
  const end = reg.at(-1)!.t + dur(reg.at(-1)!) - dur(tail.at(-1)!), m = Math.max(1, tail.length - 1);
  const floor = from > 0 ? reg[from - 1]!.t + o.minSpacing : 0;
  let step = Math.max(o.minSpacing, Math.min(o.spacing, (end - reg[from]!.t) / m));
  const start = Math.max(floor, Math.min(reg[from]!.t, end - m * step));
  step = Math.min(step, Math.max(0, end - start) / m);
  tail.forEach((w, k) => { w.t = Math.round(start + k * step); });
  const all = [...head, ...tail];
  all.forEach((w, k) => { if (k >= from) w.side = o.sides[k % o.sides.length]!; });
  if (o.bosses && bossesOld > 0) {
    const at = [all.length - 1, ...(all.length >= 5 ? [all.length - 3] : [])];
    for (const k of at) all[k]!.counts[BOSS] = 1;
    // a warlord the longer list adds takes its points out of the swarmlings, largest pieces first
    let extra = (at.length - bossesOld) * bossHp;
    while (extra > 0) {
      const big = tail.reduce((a, w) => ((w.counts[SW] ?? 0) > (a.counts[SW] ?? 0) ? w : a), tail[0]!);
      if ((big.counts[SW] ?? 0) <= 3) break;
      big.counts[SW]! -= 1; extra--;
    }
  }
  const rest = waves.filter((w) => !regular.has(w));
  regular.clear();
  for (const w of all) regular.add(w);
  waves.length = 0;
  waves.push(...[...rest, ...all].sort((a, b) => a.t - b.t));
  return true;
}

/**
 * Doug (2026-11-17): where a defend level cannot be built with the denser waves (its search fails: humanLost or
 * infeasible on every seed), it is built with today's wave sizing instead (waveCap 0) rather than built worse or not
 * at all. Runs `run` once; on a defend level that `failed`, runs it again with waveCap 0 and puts the cap back.
 */
export function withWaveFallback<R>(defend: boolean, run: () => R, failed: (r: R) => boolean): { result: R; dense: boolean } {
  const DW = GEN.defendWaves, cap = DW.waveCap;
  const first = run();
  if (!defend || cap <= 0 || !failed(first)) return { result: first, dense: defend && cap > 0 };
  DW.waveCap = 0;
  try { return { result: run(), dense: false }; } finally { DW.waveCap = cap; }
}

/** Footprints of what the renderer draws larger (look.json buildScale: buildings and the greenhouse dome) grow with it. */
export const isSizedFootprint = (k: string): boolean => /^(sink|conv|struct)\./.test(k) || k === "node.food_source";
const GEN_BASE = structuredClone({ footprints: GEN.footprints, crewStations: GEN.crewStations, depotCrewStations: GEN.depotCrewStations, corePadBeside: GEN.corePadBeside, beltGap: GEN.beltGap });
let convAtLoad = 0;
/**
 * Size the footprints and hire-pad offsets for a building scale and per-building multipliers
 * (look.json buildScale and modelScale); each footprint takes its building's largest level. Run
 * once at load with look.json; the layout sandbox runs it again with its slider values.
 */
export function applyLookScale(buildScale: number, modelScale: Record<string, number>): void {
  const k = (id: string): number => buildScale * maxModelScale(modelScale, id);
  for (const [id, b] of Object.entries(GEN_BASE.footprints)) GEN.footprints[id] = (isSizedFootprint(id) ? b.map((v) => Math.round(v * k(id))) : [...b]) as typeof b;
  // hire pads stand just outside their building, so their offsets from its centre grow with it
  const off = (o: [number, number], s: number): [number, number] => [Math.round(o[0] * s), Math.round(o[1] * s)];
  const conv = Math.max(...Object.keys(GEN_BASE.footprints).filter((id) => id.startsWith("conv.")).map(k));
  for (const s of Object.keys(GEN_BASE.crewStations) as (keyof typeof GEN.crewStations)[]) GEN.crewStations[s] = off(GEN_BASE.crewStations[s], conv);
  for (const s of Object.keys(GEN_BASE.depotCrewStations) as (keyof typeof GEN.depotCrewStations)[]) GEN.depotCrewStations[s] = off(GEN_BASE.depotCrewStations[s], k("struct.depot"));
  GEN.corePadBeside = off(GEN_BASE.corePadBeside, k("sink.core"));
  // the belt gap was tuned at look.json's sizes (unscaled data), so it follows the converters from there
  convAtLoad ||= conv;
  GEN.beltGap = Math.round(GEN_BASE.beltGap * (conv / convAtLoad));
}
applyLookScale(LOOK.buildScale, LOOK.modelScale);
/** The cashier pad offsets before any plot layout (the layout sandbox works plots out from them). */
export const GEN_CASHIER_BASE = structuredClone(GEN.cashierPads);
/**
 * Turn the plot layout on with its data (content/data/plot.json, or the layout sandbox's live plots) or off (null).
 * Run after applyLookScale, whose footprints it overrides for the plotted buildings and pads.
 */
export function applyPlotLayout(g: PlotFile["generator"] | null): void {
  GEN.plots = g ? g.plots : null;
  GEN.plotBodies = g?.bodies ?? null;
  GEN.cashierPads = structuredClone(g ? g.cashierPads : GEN_CASHIER_BASE);
  if (g) for (const [k, b] of Object.entries(g.footprints)) GEN.footprints[k] = [...b];
}
applyPlotLayout(PLOT?.generator ?? null);

/** A generated time target (seconds) widened by the data factor; `step` rounds to that many seconds (1 = whole seconds). */
export const timeTarget = (seconds: number, step = 1): number => Math.round((seconds * GEN.timeTargetK) / step) * step;

export const templateById = (id: string): Template => {
  const t = TEMPLATES.templates.find((x) => x.id === id);
  if (!t) throw new Error(`unknown template ${id}`);
  return t;
};

export type Knobs = Record<keyof typeof genData.knobs, number>;

/** Knob values at pressure p, each jittered by its own mutation offset (in pressure units). */
export function knobsFor(p: number, mut: Partial<Record<string, number>> = {}): Knobs {
  const out = {} as Record<string, number>;
  for (const [k, [a, b]] of Object.entries(GEN.knobs)) out[k] = lerp(a, b, clamp01(p + (mut[k] ?? 0)));
  return out as Knobs;
}

/** Map-dressing knobs (GEN.dressing), each drawn between its two ends from the level seed alone, never from the search pressure (outpost-ops#85). */
export function dressingKnobs(seed: number): Record<string, number> {
  const r = new Rand((seed ^ 0x5bd1e995) >>> 0);
  const out: Record<string, number> = {};
  for (const k of GEN.dressing) { const [a, b] = GEN.knobs[k]!; out[k] = lerp(a, b, r.float()); }
  return out;
}

export interface BuildInput {
  id: string;
  seed: number;
  family: Family;
  secondary?: Family | null | undefined;
  features: readonly string[];
  /** Objective kind of the main goal. */
  goalType: string;
  modules: string[];
  template: Template;
  knobs: Knobs;
  /** 0..1: how far the search has eased worker hire prices to break a repeated player loop (REDESIGN-R3 item 7). */
  hireEase?: number;
  /** Perimeter wall ring (barrier.line). On for defend levels and the rescue pen unless false; other families never get one. */
  walls?: boolean;
  content?: Content;
}

/** How index.ts finishes the goal: `rate` goals get N from a probe run, `fill` goals their deadline. */
export type Sizing = "fixed" | "rate" | "fill" | "cost";

export interface Built { manifest: Manifest; flow: Flow; stations: Placer["stations"]; notes: string[]; sizing: Sizing; queue: Pt[]; layout: LayoutSnapshot;
  /** Pad visibility on screen under the real camera (viewVisibility.ts): reported only, never written into the level file. */
  padVisibility: PadVisibilityReport }

/** Everything the placer knew (world units, the manifest's frame): the layout sandbox draws it as a plan. */
export interface LayoutSnapshot {
  stations: Placer["stations"]; spots: Placer["spots"]; blocked: Rect[]; walls: [Pt, Pt][]; bounds: Rect; core: Pt;
  screen: readonly [number, number, number?]; lots: Placer["lots"]; miss: Placer["lastMiss"];
}
/** A layout the generator gave up on, with the partial layout at the moment it failed (when the placer had started). */
/**
 * The on-screen pad report for a finished layout (viewVisibility.ts, the renderer's own test). It is always measured and
 * reported. Only with generator.json viewClear.realCamera on does a pad hidden on screen reject the layout (tower pads stand
 * in the wall line by design and are exempt); off by default until the pads of the shipped levels have been moved.
 */
function checkPadView(m: Manifest, fail: (why: string) => never): PadVisibilityReport {
  const rep = padVisibilityReport(m.entities as unknown as ViewEnt[]);
  if (GEN.viewClear.realCamera) {
    const bad = rep.final.filter((p) => p.class === "hidden" && !/^tower/.test(p.id));
    if (bad.length) fail(`pad hidden on screen: ${bad.map((p) => `${p.id} by ${p.by}`).join(", ")}`);
  }
  return rep;
}
type Side = "n" | "e" | "s" | "w";
/** What the first pass leaves for the wavefront: its finished manifest before the defend padding, the placer's stations, the attack sides. */
interface Pass1 { m: Manifest; stations: readonly { id: string; x: number; y: number; r: number; fp?: Box | undefined }[]; sides: Side[]; /** The defend padding m carries (0 elsewhere). */ shift: number }
/**
 * The wavefront result as pass 2 uses it (outpost-ops#202): placer ids pinned to their sites (a build pad's id to its building's site, with
 * its own pad point), the ground they reserve, each pad's final point (and site), the wall ring, the gate rockfalls and other rockfalls.
 */
interface Pin {
  core: Pt;
  at: Map<string, { at: Pt; pad?: Pt; padR?: number }>;
  reserved: { id: string; x: number; y: number; r: number; fp?: Box | undefined; pad?: boolean }[];
  pads: Map<string, { at: Pt; site?: Pt }>;
  ring: { points: Pt[]; side: Side[]; rect: Rect; gates: number[] } | null;
  rock: Map<string, { rect: Rect; rest: Rect[]; side: Side }>;
  zones: Map<string, Rect>;
  sides: Side[];
}
/** Wall towers stand on the ring and its roads, and the ranger's pad in the hunting grounds: build.ts places those itself. */
const ownSpot = (e: ViewEnt): boolean => /^struct\.ranged_defense/.test(String((e as { build?: string }).build ?? "")) || (e["role"] as { role?: string } | undefined)?.role === "role.hunter";
/**
 * Wavefront placement (outpost-ops#202, Doug 2026-11-16) on the first pass's level: building sites, pad points, the wall ring, the medic's
 * pad, scrap heaps and gate rockfalls. A rejected seed or a pad it leaves hidden is a LayoutError (the caller's salt loop tries again);
 * there is no repair step after it.
 */
function wavefrontPins(pre: Pass1, seed: number, padR: number): Pin {
  const zr = pre.m.entities.filter((e) => e.type === "zone.blocked").map((e) => (e as unknown as { rect: number[] }).rect);
  const inZone = (p: readonly number[]) => zr.some((z) => p[0]! >= z[0]! && p[0]! <= z[0]! + z[2]! && p[1]! >= z[1]! && p[1]! <= z[1]! + z[3]!);
  // the fuel scatter needs its room too (inside a ring the ring is fitted to what the wavefront places; a rock slide's hidden reward stays under its slide)
  const { input } = convert(pre.m as unknown as RepairManifest, { skip: ownSpot, place: (e) => e.type === "node.fuel_scrap" && !!e.at && !inZone(e.at), footprint: (k) => (k === "sink.sales_point" ? kioskGround() : undefined) });
  // any cover at all counts as hidden here: the level's own check after pass 2 (hiddenPads) is that strict
  // the screen rule: every site and pad within the camera box and the rater's radius of the mid-settlement Core (Doug 2026-11-17)
  const sc = GEN.spacing, sm = 6;
  const wf = placeWavefront(input, { seed, siteChecks: true, hiddenAt: 1e-6, screen: { box: [sc.screen[0] - sm, sc.screen[1] - sm], r: sc.screenRadius - sm } });
  if (wf.rejected) throw new LayoutError(`wavefront: no site for ${wf.rejected.kind} ${wf.rejected.id}`);
  if (wf.hidden.length) throw new LayoutError(`wavefront: pad hidden ${wf.hidden.join(", ")}`);
  // defend levels are placed on the padded map (the long roads give the scrap its room) and pinned back in the unpadded frame
  const d = pre.shift;
  // A gate rockfall's band runs map-wide beyond the south (east) wall and the pods go beyond it: the whole layout moves north (west) as one
  // piece until there is room for them (a rigid move keeps every pad's visibility), never past the map's edge.
  const mv: [number, number] = [0, 0];
  for (const rk of Object.values(wf.rock)) {
    const ax = rk.side === "e" ? 0 : 1, W = (ax === 0 ? pre.m.map.w : pre.m.map.h) - d, far = rk.rect[ax + 2]!;
    const lo = Math.min(...Object.values(wf.positions).map((p) => p[ax]!), ...(wf.walls ? [wf.walls.rect[ax]!] : []), ...Object.values(wf.padAt).map((p) => p[ax]!)) - d;
    const room = W - GEN.rings.edge - (far - d + GEN.rings.podGap);
    mv[ax] = -Math.max(0, Math.min(lo - 14, GEN.rings.podRoom - room));
  }
  const rp = (p: readonly number[]): Pt => [Math.round(p[0]!) - d + mv[0], Math.round(p[1]!) - d + mv[1]];
  const rr = (b: readonly number[]): Rect => [Math.round(b[0]!) - d + mv[0], Math.round(b[1]!) - d + mv[1], Math.round(b[2]!) - Math.round(b[0]!), Math.round(b[3]!) - Math.round(b[1]!)];
  const padFp = GEN.footprints["pad"]!;
  const pin: Pin = { core: rp(wf.positions["core"] ?? [0, 0]), at: new Map(), reserved: [], pads: new Map(), ring: null, rock: new Map(), zones: new Map(), sides: [...pre.sides] };
  if (!wf.positions["core"]) throw new LayoutError("wavefront: no core");
  const reserve = (id: string, at: Pt, st: Pass1["stations"][number] | undefined, isPad: boolean) => {
    const fp = st?.fp ? [st.fp[0] - st.x, st.fp[1] - st.y, st.fp[2] - st.x, st.fp[3] - st.y] : isPad ? padFp : undefined;
    pin.reserved.push({ id, x: at[0], y: at[1], r: st?.r ?? padR, ...(fp ? { fp: [at[0] + fp[0]!, at[1] + fp[1]!, at[0] + fp[2]!, at[1] + fp[3]!] as Box } : {}), ...(isPad ? { pad: true } : {}) });
  };
  pre.m.entities.forEach((e0, i) => {
    const e = e0 as unknown as ViewEnt & { rect?: number[] };
    const wid = e.id !== undefined ? String(e.id) : `${e.type}#${i}`;
    const st = (e.id !== undefined ? pre.stations.find((s) => s.id === e.id) : undefined)
      ?? (e.at ? pre.stations.find((s) => s.x === e.at![0] && s.y === e.at![1] && !/[:@]/.test(s.id)) : undefined);
    const pid = st?.id ?? wid;
    if (e.type.startsWith("pad.")) {
      const q = wf.padAt[wid], site = wf.positions[wid];
      if (!q) return;
      const at = rp(q);
      if (site) {
        const s = rp(site);
        pin.at.set(pid, { at: s, pad: at, padR: (e as { big?: boolean }).big ? defaultContent.defaults["pads.bigRange"]! : padR }); pin.pads.set(wid, { at, site: s });
        reserve(pid, s, st, false); reserve(`${pid}:pad`, at, undefined, true);
      } else { pin.at.set(pid, { at }); pin.pads.set(wid, { at }); reserve(pid, at, st, true); }
      return;
    }
    const rk = wf.rock[wid];
    if (rk) { pin.rock.set(wid, { rect: rr(rk.rect), rest: rk.rest.map(rr), side: rk.side as Side }); return; }
    const p = wf.scrap[wid]?.at ?? wf.positions[wid];
    if (!p) return;
    if (Array.isArray(e.rect)) { const [, , w, h] = e.rect as number[]; pin.zones.set(wid, [Math.round(p[0] - w! / 2) - d + mv[0], Math.round(p[1] - h! / 2) - d + mv[1], w!, h!]); return; }
    pin.at.set(pid, { at: rp(p) });
    reserve(pid, rp(p), st, false);
  });
  if (wf.walls) {
    const w = wf.walls;
    pin.ring = { points: w.points.map(rp), side: [...w.side], rect: rr(w.rect), gates: [...w.gates].sort((a, b) => a - b) };
  }
  return pin;
}
/**
 * The kiosk's ground for the wavefront: its model plus the standing spots in front of it (register and coin pile, clerk south of the stall)
 * and the clearance the placer keeps between a standing spot and another station's centre (its reach past its footprint). The line is left
 * out: it bends, and with it in, big late buildings (a landmark) found no site far more often.
 */
function kioskGround(): [number, number, number, number] {
  const sp = salesSpots([0, 0], [0, -200], defaultContent, 0), f = GEN.footprints["sink.sales_point"]!;
  const reach = Math.max(...(["sink.core", "node.food_source", "node.material_source", "node.fuel_scrap"] as const).map((k) => {
    const r = k === "sink.core" ? (defaultContent.sinks[k] as { range: number }).range : defaultContent.nodes[k]!.range, b = GEN.footprints[k]!;
    return r - Math.min(-b[0], b[2], -b[1], b[3]);
  }));
  const m = GEN.spacing.standR + Math.max(0, reach);
  const pts = [sp.register, sp.pile];
  return [Math.min(f[0], ...pts.map((p) => p[0] - m)), Math.min(f[1], ...pts.map((p) => p[1] - m)), Math.max(f[2], ...pts.map((p) => p[0] + m)), Math.max(f[3], ...pts.map((p) => p[1] + m))];
}
/** Pass 2's last check: no pad (wall towers aside) is hidden during its window under the real camera. */
function hiddenPads(m: Manifest): string[] {
  const mm = m as unknown as RepairManifest;
  return lifetimeVisibility(mm, staticWindows(mm)).filter((v) => v.hidden > 0 && !/^tower/.test(v.id)).map((v) => `${v.id} (by ${v.by})`);
}
export class LayoutError extends Error {
  constructor(message: string, readonly layout?: LayoutSnapshot) { super(message); }
}
const snapshot = (P: Placer, d = 0): LayoutSnapshot => {
  const pt = (p: Pt): Pt => [p[0] + d, p[1] + d];
  const rect = (r: Rect): Rect => [r[0] + d, r[1] + d, r[2], r[3]];
  return {
    stations: P.stations, spots: P.spots.map((s) => ({ ...s, x: s.x + d, y: s.y + d })), blocked: P.blocked.map(rect),
    walls: P.walls.map(([a, b]) => [pt(a), pt(b)]), bounds: rect(P.bounds), core: pt(P.core), screen: P.screen, lots: P.lots,
    miss: P.lastMiss && { ...P.lastMiss, regions: P.lastMiss.regions.map(rect) },
  };
};

type Ent = Record<string, unknown> & { type: string };

/** The placeholder family challenge set before rating; index.ts settles the final one from the runs. */
export const CHALLENGE_PLACEHOLDER: Record<Family, { kind: string; params: Record<string, number | string> }> = {
  shelter: { kind: "heat_floor", params: { pct: 25 } },
  rescue: { kind: "tow_full_trip", params: { n: 2 } },
  harvest: { kind: "no_angry_customers", params: {} },
  industrialize: { kind: "settlement_never_freezes", params: {} },
  defend: { kind: "no_injuries", params: {} },
};

const RATE_GOALS = new Set(["hunt", "protein", "currency", "sell", "earn", "serve_premium", "streak", "sell_each", "bulk_order",
  "produce", "haul", "chain", "stockpile", "kills", "salvage", "earn_within"]);
const FILL_GOALS = new Set(["fuel_full"]);

// One compiled stub supplies the content's sales offsets to salesLayout (they do not depend on the level).
let stubCp: Compiled | null = null;
/** The kiosk content the stub was compiled from: a tool that edits it (the layout sandbox) gets a fresh stub. */
let stubKey = "";
function salesSpots(stall: Pt, core: Pt, c: Content, side = 0): { register: Pt; pile: Pt; queue: Pt[] } {
  const key = JSON.stringify(c.sinks["sink.sales_point"]);
  if (!stubCp || key !== stubKey) {
    stubKey = key;
    stubCp = createSim({
      id: "stub", seed: 1, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION, map: { w: 480, h: 900, zones: [] },
      modules: ["carry", "gather", "core", "sales"], start: [240, 500],
      entities: [{ type: "sink.core", at: [240, 450], params: { fuel: 10, level: 1 } }, { type: "sink.sales_point", at: [300, 600], sells: ["res.food_raw_1"] }],
      goal: { type: "currency", n: 5 }, fail: ["meter.lifeline"],
    }, { content: c }).compiled;
  }
  const F = 1000;
  const L = salesLayout(stubCp, { x: stall[0] * F, y: stall[1] * F }, { x: core[0] * F, y: core[1] * F }, side);
  const q: Pt[] = [];
  const qmax = (c.sinks["sink.sales_point"] as { queueMax: number }).queueMax;
  for (let k = 0; k < qmax; k++) q.push([(L.queueAt.x + k * L.queueStep.x) / F, (L.queueAt.y + k * L.queueStep.y) / F]);
  return { register: [L.register.x / F, L.register.y / F], pile: [L.pile.x / F, L.pile.y / F], queue: q };
}

/** A rectangle ring around the core, split into sections; points clockwise from the top-left corner. */
function ringPoints(core: Pt, dims: RingDims): { points: Pt[]; side: ("n" | "e" | "s" | "w")[]; rect: Rect } {
  const x0 = Math.max(14, core[0] - dims.hw), x1 = Math.min(466, core[0] + dims.hw);
  const y0 = Math.max(14, core[1] - dims.hh), y1 = Math.min(886, core[1] + dims.hh);
  const [h, v] = dims.split;
  const pts: Pt[] = [], side: ("n" | "e" | "s" | "w")[] = [];
  const r = (x: number) => Math.round(x);
  for (let k = 0; k < h; k++) { pts.push([r(x0 + ((x1 - x0) * k) / h), y0]); side.push("n"); }
  for (let k = 0; k < v; k++) { pts.push([x1, r(y0 + ((y1 - y0) * k) / v)]); side.push("e"); }
  for (let k = 0; k < h; k++) { pts.push([r(x1 - ((x1 - x0) * k) / h), y1]); side.push("s"); }
  for (let k = 0; k < v; k++) { pts.push([x0, r(y1 - ((y1 - y0) * k) / v)]); side.push("w"); }
  return { points: pts, side, rect: [x0, y0, x1 - x0, y1 - y0] };
}

const rectDist = (p: Pt, r: Rect): number => {
  const dx = Math.max(r[0] - p[0], 0, p[0] - (r[0] + r[2]));
  const dy = Math.max(r[1] - p[1], 0, p[1] - (r[1] + r[3]));
  return Math.hypot(dx, dy);
};

const m0People = (_p: unknown[]): string[] => [];


/** Move every position in the manifest by d on both axes and grow the map by d on every side. */
function padMap(m: Manifest, d: number): void {
  const mv = (p: readonly number[]): number[] => [p[0]! + d, p[1]! + d];
  const W = m.map.w, H = m.map.h;
  m.map = { ...m.map, w: W + 2 * d, h: H + 2 * d };
  m.start = mv(m.start) as Manifest["start"];
  m.entities = m.entities.map((e0) => {
    const e = structuredClone(e0) as Record<string, unknown>;
    for (const k of ["at", "site"]) if (Array.isArray(e[k])) e[k] = mv(e[k] as number[]);
    if (Array.isArray(e["points"])) e["points"] = (e["points"] as number[][]).map(mv);
    if (Array.isArray(e["queue"])) e["queue"] = (e["queue"] as number[][]).map(mv);
    if (Array.isArray(e["sections"])) e["sections"] = (e["sections"] as { a: number[]; b: number[] }[]).map((x) => ({ ...x, a: mv(x.a), b: mv(x.b) }));
    if (Array.isArray(e["rect"])) { const r = e["rect"] as number[]; e["rect"] = [r[0]! + d, r[1]! + d, r[2]!, r[3]!]; }
    if (Array.isArray(e["route"])) {
      // traders still come in from the (new) map edge
      const r = (e["route"] as number[][]).map(mv), f = r[0]!;
      const out = f[0]! <= d ? [0, f[1]!] : f[0]! >= W + d ? [W + 2 * d, f[1]!] : f[1]! <= d ? [f[0]!, 0] : f[1]! >= H + d ? [f[0]!, H + 2 * d] : null;
      e["route"] = out ? [out, ...r] : r;
    }
    return e as Manifest["entities"][number];
  });
}

/** Night lighting on every GEN.nightEvery-th level number (the pack build and tools/night-pack.ts both call this). */
export function applyNightCadence(m: Manifest, levelNo: number): void {
  if (GEN.nightEvery > 0 && levelNo % GEN.nightEvery === 0) m.lighting = "night";
  else delete m.lighting;
}

/**
 * Build one candidate manifest; throws a reason string (Error) when a constraint cannot be met. Two passes (outpost-ops#202): the first
 * lays the level out as before to learn its structure; the wavefront loop places its buildings, pads, walls, medic pad, scrap and gate
 * rockfall; the second builds the same input again with those pinned, so everything derived from positions follows the new sites.
 */
export function buildLevel(inp: BuildInput, layoutSalt = 0): Built {
  const first = buildOnce(inp, layoutSalt, null);
  const c = inp.content ?? defaultContent;
  const pin = wavefrontPins(first.pre!, (inp.seed ^ Math.imul(layoutSalt + 1, 0x9e3779b1)) >>> 0, c.defaults["pads.range"]!);
  const out = buildOnce(inp, layoutSalt, pin);
  delete out.pre;
  return out;
}

function buildOnce(inp: BuildInput, layoutSalt: number, pin: Pin | null): Built & { pre?: Pass1 } {
  const c = inp.content ?? defaultContent;
  const K = { ...inp.knobs, ...dressingKnobs(inp.seed) };
  const fam = inp.family;
  const fams = new Set<Family>([fam, ...(inp.secondary ? [inp.secondary] : [])]);
  const feat = new Set(inp.features);
  // A belt only earns its place where the goal rides on the chain it automates; elsewhere the level
  // goes without it (and without the module), so no element sits idle.
  if (feat.has("conveyors") && !GEN.conveyorGoals.includes(inp.goalType)) feat.delete("conveyors");
  const has = (m: string) => inp.modules.includes(m);
  const goal = inp.goalType;
  const tpl = inp.template;
  const rand = new Rand((inp.seed ^ Math.imul(layoutSalt + 1, 0x9e3779b1)) >>> 0);
  const notes: string[] = [];
  const S = GEN.spacing;
  const core: Pt = pin?.core ?? tpl.core;
  const toward = (a: Pt, b: Pt, t: number): Pt => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];
  const hireK = 1 - GEN.search.loopHireCut * (inp.hireEase ?? 0);
  const cost = (k: string) => Math.max(1, Math.round((GEN.costs[k] ?? 10) * K.costScale * (k.startsWith("hire.") ? hireK : 1)));
  const salv = (k: string) => GEN.costs[k] ?? 6;
  const R = {
    node: c.nodes["node.material_source"]!.range, scrap: c.nodes["node.fuel_scrap"]!.range, food: c.nodes["node.food_source"]!.range,
    pad: c.defaults["pads.range"]!, big: c.defaults["pads.bigRange"]!,
    core: (c.sinks["sink.core"] as { range: number }).range, shop: (c.sinks["sink.sales_point"] as { range: number }).range,
    conv: c.converters["conv.food_processor"]!.range,
  };
  let placer: Placer | null = null;
  const fail = (why: string): never => { throw new LayoutError(why, placer ? snapshot(placer) : undefined); };
  const ents: Ent[] = [];
  const pads: Ent[] = [];
  const pad = (e: Ent) => { pads.push(e); return e; };

  // ---------- perimeter ring (defend: unbuilt where attacked; rescue: prebuilt with a gate) ----------
  const defend = fams.has("defend");
  // Doug 2026-11-16: defend levels and the rescue pen always have walls (without them the good bot loses defend
  // finales and stalls on rescue). Every other family never gets a ring. `walls: false` turns a ring off explicitly.
  const wallsOn = (defend || fams.has("rescue")) && inp.walls !== false;
  // Batch 3: every defend level has guards (the defend family's modules include defenders), not just the guards feature's.
  const guards = has("defenders");
  const rescue = fams.has("rescue");
  const needsCurrency = fams.has("harvest") || fams.has("industrialize") || feat.has("housing") || feat.has("gate_arrivals")
    || feat.has("core_levels") || feat.has("rockslides") || feat.has("clearing_pass") || goal === "protein" || goal === "perimeter_before_wave1";
  let ring: ReturnType<typeof ringPoints> | null = null;
  let ringGates: number[] = [];
  let sides: ("n" | "e" | "s" | "w")[] = [];
  if (defend || rescue) {
    const dims = defend ? GEN.rings.defend : needsCurrency ? GEN.rings.rescueShop : GEN.rings.rescue;
    // pass 2: the ring the wavefront fitted to the settlement
    ring = pin?.ring ? { points: pin.ring.points, side: pin.ring.side, rect: pin.ring.rect } : ringPoints(core, dims);
  }
  const inner: Rect = ring ? [ring.rect[0] + 12, ring.rect[1] + 12, ring.rect[2] - 24, ring.rect[3] - 24] : [16, 40, 448, 836];
  // fieldPull (0..1, default 0 = unchanged) draws the template's resource fields toward the core
  const fp0 = Math.min(0.95, Math.max(0, S.fieldPull ?? 0));
  const pullRect = (r: Rect): Rect => fp0 === 0 ? r
    : [Math.round(r[0] + (core[0] - (r[0] + r[2] / 2)) * fp0), Math.round(r[1] + (core[1] - (r[1] + r[3] / 2)) * fp0), r[2], r[3]];
  const P = new Placer(rand.fork("place"), S.margin, S.standR, inner, core, [S.screen[0], S.screen[1], S.screenRadius], c, GEN.footprints, S.footprintGap, S.corePull);
  placer = P;
  if (pin) { P.pins = pin.at; P.reserved = pin.reserved; }
  // real-camera shadows while placing (Doug, 2026-11-15): no pad in a shadow, nothing tall whose shadow falls on a pad
  // (wall towers stand in the wall line by design and are left out, as walls are)
  if (GEN.viewClear.placeShade) P.shadeOf = (kind, p) => {
    if (kind.startsWith("struct.ranged_defense")) return null;
    const t = shadowTest(kind, [p[0], p[1]]);
    return t ? (q) => t([q[0], q[1]]) : null;
  };
  if (ring && wallsOn) ring.points.forEach((p, i) => P.walls.push([p, ring!.points[(i + 1) % ring!.points.length]!]));
  P.lots = GEN.lots;
  // Plot layout (GEN.plots, set only by the layout sandbox): a building's pad slots come with its placement
  const plotOn = !!GEN.plots;
  P.boxSpots = plotOn;
  P.bodies = plotOn ? GEN.plotBodies ?? null : null;
  // a machine's upgrade slot is kept only where the level has its level pad (R5 #6: the food processor's, with converter levels)
  const levelled = new Set(feat.has("converter_levels") ? ["conv.food_processor"] : []);
  const slotList = (type: string, all: readonly { id: string; dx: number; dy: number }[]) => {
    const gone = all.find((o) => o.id === "upgrade" && type.startsWith("conv.") && !levelled.has(type));
    // the pads keep their south-east spots (the staff pad takes the first, so nothing moves up when the upgrade is gone)
    return all.filter((o) => o !== gone).map((o) => ({ id: o.id, dx: o.dx, dy: o.dy, r: R.pad, fp: "pad" }));
  };
  const plotSlots = (type: string) => slotList(type, GEN.plots?.[type]?.slots ?? []);
  // alternatives further along the south-east side (the same pads; one that only differs by a dropped upgrade slot is skipped)
  const plotAlts = (type: string) => {
    const main = JSON.stringify(plotSlots(type));
    return (GEN.plots?.[type]?.alts ?? []).map((a) => slotList(type, a)).filter((a, i, l) => JSON.stringify(a) !== main && l.findIndex((b) => JSON.stringify(b) === JSON.stringify(a)) === i);
  };
  const plotOpts = (type: string) => (plotOn && GEN.plots?.[type] ? { slots: plotSlots(type), alts: plotAlts(type), mirror: false } : {});
  const slotAt = (owner: string, slot: string): Pt => {
    const s = P.stations.find((x) => x.id === `${owner}:${slot}`);
    // pass 2: a pinned building has no slots; its pads take the wavefront's points at the end
    const own = pin ? P.pinAt(owner) : undefined;
    return s ? [s.x, s.y] : own ?? fail(`no ${slot} slot on ${owner}`);
  };

  let startPt: Pt = [core[0] + tpl.start[0], Math.max(inner[1] + 10, Math.min(inner[1] + inner[3] - 10, core[1] + tpl.start[1]))];
  // plot layout: the core's pads stay on its south-east side, inside its lit circle (Doug, 2026-11-15); a player start on
  // them steps out in front of them
  const coreSlots = plotOn ? plotSlots("sink.core") : [];
  if (plotOn && !coreSlots.every((o) => dist([core[0] + o.dx, core[1] + o.dy], startPt) >= R.pad + 4))
    startPt = [core[0], Math.round(core[1] + Math.max(...coreSlots.map((o) => o.dy)) + R.pad + 24)];
  // pass 2: the start spot nearest the usual one that keeps off every pinned station
  if (pin) {
    const want = startPt, free = (q: Pt) => pin.reserved.every((x) => x.id === "core" || dist(q, [x.x, x.y]) >= x.r + 4);
    let best: Pt | null = null;
    for (let d = 0; d <= 240 && !best; d += 6) for (let a = 0; a < 24 && !best; a++) {
      const q: Pt = [Math.round(want[0] + d * Math.cos((a * Math.PI) / 12)), Math.round(want[1] + d * Math.sin((a * Math.PI) / 12))];
      if (inRect(q, inner) && free(q)) best = q;
    }
    startPt = best ?? fail("no free start spot");
  }
  P.add("core", core, R.core, { key: true, fp: "sink.core", ...(plotOn ? { slots: coreSlots } : {}) });
  P.spot("start", startPt, 18);

  // The camera looks from the south, tilted: a wall hides the ground just north of it, and a building the
  // ground its footprint covers (the footprint already reaches over what the model hides), so no pad goes there.
  const VC = GEN.viewClear;
  const behindWall = (p: Pt): boolean => P.walls.some(([a, b]) => {
    if (a[0] === b[0] || p[0] <= Math.min(a[0], b[0]) || p[0] >= Math.max(a[0], b[0])) return false;
    const wy = a[1] + ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0]);
    return p[1] < wy && wy - p[1] < VC.wallShadow;
  });
  // pads placed so far: their stations (pad footprints) and the slots reserved for them with a building
  const coversPad = (p: Pt, fp: string): boolean => {
    const b = P.box(p, fp)!;
    return P.stations.some((s) => (s.kind === "pad" || s.kind === "pad.big" || (s.id.includes(":") && !s.kind))
      && s.x > b[0] && s.x < b[2] && s.y > b[1] && s.y < b[3]);
  };

  // ---------- core ----------
  const level1Cap = (c.sinks["sink.core"] as { levels: { fuelCap: number }[] }).levels[0]!.fuelCap;
  const fuel0 = goal === "fuel_full" ? Math.max(3, Math.round(level1Cap * 0.3)) : Math.max(4, Math.round(level1Cap * K.fuel0));
  ents.push({ type: "sink.core", id: "core", at: [...core], params: { fuel: fuel0, level: 1 } });

  // ---------- shop (only where currency buys something or selling is the point) ----------
  const sells: string[] = [];
  const hasCashierSlot = has("workers") && goal !== "shelves_full";
  // The cashier's slot is straight out from the stall past the clerk spot (the clerk stands between the stall and the pad):
  // south of the clerk when the clerk is south of the stall (cashierPad data is the distance, the sign follows the clerk's side).
  const cashierAt = (stall: Pt, reg: Pt, k = 0): Pt => {
    const o = GEN.cashierPads[k]!;
    return [reg[0] + o[0], reg[1] + (reg[1] >= stall[1] ? 1 : -1) * o[1]];
  };
  let cashierSlot = 0, clerkSide = 0;
  let shopAt: Pt | null = null;
  let register: Pt | null = null;
  let queue: Pt[] = [];
  let food1: Pt | null = null;
  if (needsCurrency) {
    const cands: { p: Pt; sp: ReturnType<typeof salesSpots>; d: number; slot: number; side: number; lot: boolean }[] = [];
    const why = { ok: 0, screen: 0, clear: 0, reg: 0, pile: 0 };
    // pass 2: the wavefront's kiosk site is the only candidate (its clerk side and line still chosen here)
    const shopPin = P.pinAt("shop");
    for (let i = 0; i < (shopPin ? 1 : 500); i++) {
      const base: Pt = ring ? [Math.min(inner[0] + inner[2] - 30, Math.max(inner[0] + 30, tpl.shop[0])), Math.min(inner[1] + inner[3] - 30, Math.max(inner[1] + 30, tpl.shop[1]))] : toward(tpl.shop, core, GEN.shopPull);
      const spread = i < 160 ? 160 : 400;
      const raw: Pt = shopPin ?? [Math.round(base[0] + (rand.float() - 0.5) * spread), Math.round(base[1] + (rand.float() - 0.5) * spread)];
      // the spot snapped into a lot first, then the spot as drawn
      const lp = shopPin ?? P.toLot(raw, "sink.sales_point"), n0 = cands.length;
      for (const p of lp[0] === raw[0] && lp[1] === raw[1] ? [raw] : [lp, raw]) {
        if (!shopPin && (!P.onScreen(p) || !P.ok("shop", p, R.shop) || coversPad(p, "sink.sales_point") || P.castsOnPad("sink.sales_point", p))) { why.ok++; continue; }
        // the clerk spot goes south of the stall if it fits, else east, else west (all in view of the camera)
        for (const side of [0, 1, 2]) {
          const sp = salesSpots(p, core, c, side);
          const ok = ((): { slot: number } | null => {
            // inside a ring the whole line stands inside it too (traders reach it through the gate)
            const onScreen = (q: Pt) => P.onScreen(q) && q[0] >= 14 && q[0] <= 466 && q[1] >= 14 && q[1] <= 886 && (!ring || inRect(q, inner));
            // plot layout: only the queue's first square belongs to the kiosk's plot; the rest of the line waits outside it and bends
            const qOwn = plotOn ? sp.queue.slice(0, 1) : sp.queue;
            if (![sp.register, sp.pile, ...qOwn].every(onScreen)) { why.screen++; return null; }
            const clear = (q: Pt, r: number) => P.stations.every((s) => dist(q, [s.x, s.y]) >= s.r + r) && P.spots.every((s) => s.id === "start" || dist(q, [s.x, s.y]) >= s.r + r)
              && P.walls.every((w) => segDist(q, w[0], w[1]) >= r + 2)
              && P.reserved.every((s) => s.id === "shop" || dist(q, [s.x, s.y]) >= s.r + r);
            if (!clear(sp.register, S.standR)) { why.reg++; return null; }
            if (!clear(sp.pile, S.standR)) { why.pile++; return null; }
            if (!qOwn.every((q) => clear(q, 10))) { why.clear++; if (process.env["FO_DEBUG"]) console.log(JSON.stringify({ p, q: sp.queue, st: P.stations.filter((s) => sp.queue.some((q) => dist(q, [s.x, s.y]) < s.r + 10)).map((s) => s.id), sp: P.spots.filter((s) => sp.queue.some((q) => dist(q, [s.x, s.y]) < s.r + 10)).map((s) => s.id) })); return null; }
            // The cashier's slot (south of the clerk spot) belongs to the kiosk's placement: it must be free for a pad
            // and stay out of the queue lane and the clerk/pile spots; reserved below even if the pad is never hired.
            let slot = 0;
            if (hasCashierSlot) {
              const fits = (cs: Pt): boolean => {
                const sb = P.box(p, "sink.sales_point"), cb = P.box(cs, "pad");
                if (sb && cb && cb[0] < sb[2] + S.footprintGap && sb[0] < cb[2] + S.footprintGap && cb[1] < sb[3] + S.footprintGap && sb[1] < cb[3] + S.footprintGap) return false;
                return P.ok("hire_cashier", cs, R.pad, { key: true, fp: "pad", hugWall: true }) && onScreen(cs) && !behindWall(cs)
                  && dist(cs, sp.register) >= R.pad + S.standR && dist(cs, sp.pile) >= R.pad + S.standR
                  && !qOwn.some((q) => dist(cs, q) < R.pad + 12 + 10);
              };
              // pass 2: the cashier's pad stands where the wavefront put it, so the slot is not searched
              slot = shopPin ? 0 : GEN.cashierPads.findIndex((_, k) => fits(cashierAt(p, sp.register, k)));
              if (slot < 0) { why.clear++; return null; }
            }
            return { slot };
          })();
          if (!ok) continue;
          cands.push({ p, sp, d: dist(p, base) + side * 40, slot: ok.slot, side, lot: P.inLot(P.box(p, "sink.sales_point")) });
          break;
        }
        if (cands.length > n0) break;
      }
    }
    if (cands.length === 0) fail(`no room for the sales point (${JSON.stringify(why)})`);
    // in a lot when any candidate is
    const best = (cands.some((x) => x.lot) ? cands.filter((x) => x.lot) : cands).reduce((a, b) => (b.d < a.d ? b : a));
    shopAt = best.p; register = best.sp.register; queue = best.sp.queue;
    P.add("shop", shopAt, R.shop, { key: true, fp: "sink.sales_point" });
    P.spot("register", best.sp.register); P.spot("pile", best.sp.pile);
    (plotOn ? best.sp.queue.slice(0, 1) : best.sp.queue).forEach((q, k) => P.spot(`queue${k}`, q, 12));
    cashierSlot = best.slot;
    clerkSide = best.side;
    if (hasCashierSlot && !shopPin) P.add("shop:cashier", cashierAt(shopAt, register, cashierSlot), R.pad, { key: true, fp: "pad" });
    sells.push("res.food_raw_1");
    ents.push({ type: "sink.sales_point", id: "shop", at: [...shopAt], sells });
    const fr = tpl.fields.food;
    const foodRegion: Rect = ring ? inner : pullRect([fr[0], fr[1], fr[2], fr[3]]);
    const f1Opts = { near: [(shopAt[0] + core[0]) / 2 + (shopAt[0] > core[0] ? 60 : -60), shopAt[1] - 40] as Pt, key: true, fp: "node.food_source", ...plotOpts("node.food_source") };
    food1 = P.place("food1", R.food, foodRegion, { ...f1Opts, samples: 160 }) ?? P.place("food1", R.food, foodRegion, { ...f1Opts, samples: 1200 })
      ?? fail("no room for food");
    ents.push({ type: "node.food_source", id: "food1", at: [...food1] });
  }

  // ---------- fuel forests ----------
  const forestDir = (() => {
    const f = tpl.fields.material;
    const cx = f[0] + f[2] / 2 - core[0], cy = f[1] + f[3] / 2 - core[1], L = Math.hypot(cx, cy) || 1;
    return [cx / L, cy / L] as const;
  })();
  const placeForest = (tag: string, dir: readonly [number, number], reach: number, n: number, mats: number): number => {
    const rr = reach * (1 - fp0);
    const cx = Math.min(inner[0] + inner[2] - 45, Math.max(inner[0] + 45, core[0] + dir[0] * rr));
    const cy = Math.min(inner[1] + inner[3] - 45, Math.max(inner[1] + 45, core[1] + dir[1] * rr));
    const region: Rect = [cx - 75, cy - 75, 150, 150];
    let got = 0;
    for (let i = 0; i < n + mats; i++) {
      const mat = i >= n; // fuel piles first: they are the forest, the tall material nodes fit around them
      const id = `${tag}${i + 1}`;
      // The sim gathers from the first node in range and stops there when that resource is full, so a
      // fuel node inside a food node's range could block fuel gathering: keep the ranges apart.
      const avoid = food1 ? [{ p: food1, r: R.food + (mat ? R.node : R.scrap) + 8 }] : [];
      const p = P.place(id, mat ? R.node : R.scrap, region, { near: [cx, cy], samples: 90, tight: true, avoid, fp: mat ? "node.material_source" : "node.fuel_scrap" });
      if (!p) continue;
      ents.push({ type: mat ? "node.material_source" : "node.fuel_scrap", at: [...p] });
      got++;
    }
    return got;
  };
  // Machine levels need the room near the base for their machines: a smaller forest and no second grove.
  const busy = fams.has("industrialize") && has("converters");
  const nForest = Math.min(ring && !defend ? 10 : Infinity, busy ? GEN.busyForestMax : Infinity, Math.round(K.forest));
  const got = placeForest("forest", forestDir, ring ? Math.min(K.forestReach, 100) : K.forestReach, nForest, 2);
  if (got < Math.max(6, nForest - 4)) fail("fuel forest too crowded");
  // A second, smaller forest on the far side at low pressure (fuel forests, plural).
  if (K.forest >= 11 && !ring && !busy) placeForest("grove", [-forestDir[0], -forestDir[1]], K.forestReach + 10, 5, 0);

  // A pad's ground footprint is its plate plus whatever it builds once paid, so nothing is placed where the building will stand.
  const placePad = (id: string, near: Pt, opts: { big?: boolean; region?: Rect; on?: string; build?: string; slots?: { id: string; dx: number; dy: number; r: number; fp: string }[]; mirror?: boolean } = {}): Pt => {
    const r = opts.big ? R.big : R.pad;
    const region: Rect = opts.region ?? [near[0] - 100, near[1] - 100, 200, 200];
    const fp = [opts.big ? "pad.big" : "pad", ...(opts.build ? [opts.build] : [])];
    // plain pads stand by what they serve; only a pad that raises a building leans toward the core
    const pull = !!opts.build, accept = (q: Pt) => !behindWall(q);
    const p = P.place(id, r, region, { near, key: true, fp, pull, accept, samples: 600, ...(opts.on ? { on: opts.on } : {}), ...(opts.slots ? { slots: opts.slots } : {}), ...(opts.mirror ? { mirror: true } : {}) })
      ?? P.place(id, r, inner, { near, key: true, samples: opts.slots ? 3000 : 260, fp, pull, accept, ...(opts.on ? { on: opts.on } : {}), ...(opts.slots ? { slots: opts.slots } : {}), ...(opts.mirror ? { mirror: true } : {}) });
    return p ?? fail(`no room for pad ${id}`);
  };
  // A machine's hire pads stand where each worker will work (R3 playtest), still together around it:
  // the input worker by the hopper (left), the operator below the operator spot, the output worker
  // by the output tray (right). Offsets from the machine centre are data (generator.json crewStations).
  // Strict: the slots were reserved with the machine's placement (crewSlots), so the pad is exactly there.
  const stationPad = (m: Pt, slot: "in" | "op" | "out"): Pt => {
    const o = GEN.crewStations[slot];
    return [m[0] + o[0], m[1] + o[1]];
  };
  const crewSlots = (only?: readonly ("in" | "op" | "out")[]) => (["in", "op", "out"] as const).filter((k) => !only || only.includes(k))
    .map((k) => ({ id: k, dx: GEN.crewStations[k][0], dy: GEN.crewStations[k][1], r: R.pad, fp: "pad" }));
  /** A machine's reserved pad slots: its plot slots in the plot layout, else the crew stations. */
  const machineSlots = (type: string, only?: readonly ("in" | "op" | "out")[]) => (plotOn ? plotSlots(type) : crewSlots(only));
  const forestC: Pt = [core[0] + forestDir[0] * K.forestReach, core[1] + forestDir[1] * K.forestReach];
  // A collector's pad stands beside the source it gathers from (playtest after 0.8.0), just clear of the
  // node nearest where the goods go, on that side; operators and output workers stay at their machine.
  const besideSource = (srcType: string, dest: Pt, nodeAt?: Pt): Pt => {
    const srcs = nodeAt ? [nodeAt] : ents.filter((e) => e.type === srcType).map((e) => e.at as Pt);
    if (srcs.length === 0) return dest;
    const n = srcs.reduce((a, b) => (dist(b, dest) < dist(a, dest) ? b : a));
    const r = (c.nodes[srcType]?.range ?? R.node) + R.pad + S.margin, L = dist(n, dest) || 1;
    return [Math.round(n[0] + ((dest[0] - n[0]) / L) * r), Math.round(n[1] + ((dest[1] - n[1]) / L) * r)];
  };

  // ---------- workers: core supplier, farm worker, cashier ----------
  const workers = has("workers") && shopAt !== null;
  // Batch 3: a defend level's town runs itself too: the reactor's ore hauler is hired with scrap.
  if (fams.has("defend") && !workers && has("workers")) {
    const a = plotOn ? slotAt("core", "collector") : placePad("hire_core", besideSource("node.fuel_scrap", core));
    pad({ type: "pad.hire", id: "hire_core", at: [...a], cost: { "res.salvage": salv("salvage.hireCore") }, role: { role: "role.supplier", from: "node.fuel_scrap", to: "sink.core" } });
  }
  let hireCashier: Ent | null = null;
  if (workers && shopAt && food1 && register) {
    const a = plotOn ? slotAt("core", "collector") : placePad("hire_core", besideSource("node.fuel_scrap", core));
    pad({ type: "pad.hire", id: "hire_core", at: [...a], cost: { "res.currency": cost("hire.core") }, role: { role: "role.supplier", from: "node.fuel_scrap", to: "sink.core" } });
    const b = plotOn ? slotAt("food1", "staff") : placePad("hire_food", besideSource("node.food_source", shopAt, food1));
    pad({ type: "pad.hire", id: "hire_food", at: [...b], cost: { "res.currency": cost("hire.food") }, role: { role: "role.supplier", from: "node.food_source", to: "sink.sales_point", node: "food1" } });
    // the cashier's pad is exactly on its slot, south of the clerk spot (reserved with the kiosk)
    const cpos: Pt | null = hasCashierSlot ? cashierAt(shopAt, register, cashierSlot) : null;
    if (cpos) hireCashier = pad({ type: "pad.hire", id: "hire_cashier", at: [...cpos], cost: { "res.currency": cost("hire.cashier") }, role: { role: "role.cashier", to: "sink.sales_point" } });
    // Beat-breakers (outpost-ops#151, 151.4): on harvest levels the bot used to buy its three hires in the first third
    // and then run one collect-and-sell loop to the end. A ladder of dearer hires (a second farm worker, a second
    // reactor supplier, then the cashier) chained farm worker -> ladder -> cashier spreads those purchases, each a
    // play-shape beat, through the middle and late level. Prices are generator.json beatBreakers, set from the bot's
    // measured purchase times; each ladder pad stands on its first hire's spot and shows once the one before is bought.
    const BB = GEN.beatBreakers;
    if (hireCashier && BB.families.some((f) => fams.has(f as Family)) && !BB.skipGoals.includes(goal)) {
      let prev = "hire_food";
      for (const h of BB.lateHires) {
        const first = h.from === "core" ? { at: a, role: { role: "role.supplier", from: "node.fuel_scrap", to: "sink.core" } }
          : { at: b, role: { role: "role.supplier", from: "node.food_source", to: "sink.sales_point", node: "food1" } };
        pad({ type: "pad.hire", id: h.id, at: [...first.at], cost: { "res.currency": cost(h.cost) }, role: first.role, requires: { pad: prev } });
        prev = h.id;
      }
      hireCashier.cost = { "res.currency": cost(BB.cashierCost) };
      hireCashier.requires = { pad: prev };
    }
  }

  // ---------- harvest mechanics ----------
  let gated = 0;
  if (feat.has("source_unlocks") && food1 && shopAt) {
    const n = 1;
    for (let k = 0; k < n; k++) {
      const id = `food${k + 2}`;
      const fOpts = { near: food1, key: true, fp: "node.food_source", ...plotOpts("node.food_source") };
      // its field first, then anywhere near the first dome (its pad must stay south-east of it and out of every shadow)
      const f = P.place(id, R.food, ring ? inner : pullRect(tpl.fields.food), { ...fOpts, samples: 160 })
        ?? P.place(id, R.food, inner, { ...fOpts, samples: 1200 }) ?? fail("no room for the gated food source");
      ents.push({ type: "node.food_source", id, at: [...f], enabled: false });
      P.add(`unlock_${id}`, f, R.pad, { key: true, on: id });
      pad({ type: "pad.build", id: `unlock_${id}`, at: [...f], cost: { "res.currency": cost("unlock") + 5 * k }, build: "node.enable", target: id, ...(workers ? { requires: { pad: "hire_food" } } : {}) });
      if (workers && goal !== "unlock") {
        const h = plotOn ? slotAt(id, "staff") : placePad(`hire_${id}`, besideSource("node.food_source", shopAt, f));
        pad({ type: "pad.hire", id: `hire_${id}`, at: [...h], cost: { "res.currency": cost("hire.food2") }, role: { role: "role.supplier", from: "node.food_source", to: "sink.sales_point", node: id }, requires: { pad: `unlock_${id}` } });
      }
      gated++;
    }
  }

  // ---------- industrialize: converters ----------
  const convSpots = (k: string) => {
    const d = c.converters[k]!;
    return [{ id: "op", dx: d.operatorOffset[0], dy: d.operatorOffset[1] }, { id: "pick", dx: d.pickupOffset[0], dy: d.pickupOffset[1] }];
  };
  const opPos = (k: string, at: Pt): Pt => [at[0] + c.converters[k]!.operatorOffset[0], at[1] + c.converters[k]!.operatorOffset[1]];
  const indus = fams.has("industrialize") && has("converters") && shopAt && food1;
  let saw = false, alloy = false;
  if (indus && shopAt && food1) {
    // the search area reaches well past the kiosk on every side: its own footprint fills the middle
    const gSlots = plotOn ? plotOpts("conv.food_processor") : { slots: crewSlots(["op", "out"]) };
    const g = P.place("grill", R.conv, ring ? inner : [shopAt[0] - 250, shopAt[1] - 280, 500, 440], { near: [shopAt[0] - 110, shopAt[1] - 30], key: true, pad: true, spots: convSpots("conv.food_processor"), ...gSlots, samples: 2000, fp: "conv.food_processor" })
      ?? P.place("grill", R.conv, inner, { near: [shopAt[0] - 110, shopAt[1] - 30], key: true, pad: true, spots: convSpots("conv.food_processor"), ...gSlots, samples: 4000, fp: "conv.food_processor" })
      ?? fail("no room for the food processor");
    pad({ type: "pad.build", id: "grill", at: [...g], cost: { "res.currency": cost("grill") }, build: "conv.food_processor" });
    // The food processor's feeder has its own field, so the shelf's farm worker does not starve it.
    const fg = P.place("food_g", R.food, ring ? inner : [g[0] - 160, g[1] - 160, 320, 320], { near: [g[0] - 70, g[1] - 60], key: true, samples: 200, fp: "node.food_source" }) ?? food1;
    if (fg !== food1) ents.push({ type: "node.food_source", id: "food_g", at: [...fg] });
    // Hire order per machine: input worker, operator, output worker.
    // plot layout: the Galley's staff slot hires the Dome collector, the cook and the server in turn; its upgrade (after the server, as before) has a slot of its own
    const gStaff = plotOn ? slotAt("grill", "staff") : null;
    const fd = gStaff ?? placePad("feeder", besideSource("node.food_source", g, fg));
    pad({ type: "pad.hire", id: "feeder", at: [...fd], cost: { "res.currency": cost("hire.feeder") }, role: { role: "role.supplier", from: "node.food_source", to: "conv.food_processor", node: fg === food1 ? "food1" : "food_g" }, requires: { pad: "grill" } });
    const cook = gStaff ?? stationPad(g, "op");
    pad({ type: "pad.hire", id: "cook", at: [...cook], cost: { "res.currency": cost("hire.cook") }, role: { role: "role.operator", to: "conv.food_processor" }, requires: { pad: "feeder" } });
    const sv = gStaff ?? stationPad(g, "out");
    pad({ type: "pad.hire", id: "server", at: [...sv], cost: { "res.currency": cost("hire.server") }, role: { role: "role.server", from: "conv.food_processor", to: "sink.sales_point" }, requires: { pad: "cook" } });
    sells.push("res.food_prepared");
    if (feat.has("converter_levels")) {
      const lp = plotOn ? slotAt("grill", "upgrade") : placePad("grill_level", [g[0] + 70, g[1] - 40]);
      // Repeatable only when the goal needs more than one level: a repeatable pad is never "done", so nothing could require it.
      const rep = false;
      pad({ type: "pad.build", id: "grill_level", at: [...lp], cost: { "res.currency": cost("conv.level") }, build: "conv.level", target: "grill", requires: { pad: gStaff ? "server" : "grill" }, ...(rep ? { repeatable: true } : {}) });
    }
    if (feat.has("material_processor")) {
      saw = true;
      // With a belt the smelter and parts works are placed as a pair: a smelter spot only counts if the parts works
      // fits exactly beltGap to its right (its slots included) with a clear belt run between them.
      let belted = feat.has("conveyors") && feat.has("tier2");
      const pk0 = c.converters["conv.material_processor"]!.pickupOffset;
      // the parts works stands past the smelter's tray side: right, diagonally, or nearly straight above or below
      const pairAt = new Map<string, Pt>();
      const alloyFor = (sp: Pt): Pt => pairAt.get(`${sp[0]},${sp[1]}`) ?? [sp[0] + GEN.beltGap, sp[1]];
      const pairOk = (sp: Pt): boolean => {
        const from: Pt = [sp[0] + pk0[0], sp[1] + pk0[1]];
        for (const [ox, oy] of GEN.beltPairs) {
          const q: Pt = [sp[0] + Math.round(ox * GEN.beltGap), sp[1] + Math.round(oy * GEN.beltGap)], mid = toward(from, q, 0.5);
          if (!P.ok("alloy", q, R.conv, { key: true, spots: convSpots("conv.alloy_works"), slots: machineSlots("conv.alloy_works", ["op", "out"]), fp: "conv.alloy_works" })) continue;
          if (P.stations.some((st) => !st.tight && segDist([st.x, st.y], from, q) < st.r + 8)) continue;
          if (!P.ok("belt", mid, R.pad, { key: true, fp: ["pad"], onWall: true })) continue;
          pairAt.set(`${sp[0]},${sp[1]}`, q);
          return true;
        }
        return false;
      };
      const sawOpts = { near: toward(forestC, core, 0.5), key: true, pad: true, spots: convSpots("conv.material_processor"), slots: machineSlots("conv.material_processor", ["op"]), ...(plotOn ? { alts: plotAlts("conv.material_processor") } : {}), mirror: false, fp: "conv.material_processor", ...(belted ? { accept: pairOk } : {}) };
      let s0 = P.place("saw", R.conv, ring ? inner : [forestC[0] - 150, forestC[1] - 150, 300, 300], { ...sawOpts, samples: 2000 })
        ?? P.place("saw", R.conv, inner, { ...sawOpts, samples: 4000 });
      if (!s0 && belted) {
        // no room for the belted pair: this level goes without the belt (and its module), like a goal that needs none
        belted = false;
        feat.delete("conveyors");
        const { accept: _pair, ...plainBase } = sawOpts as typeof sawOpts & { accept?: unknown };
        void _pair;
        const plain = { ...plainBase, slots: machineSlots("conv.material_processor", ["op"]) };
        s0 = P.place("saw", R.conv, ring ? inner : [forestC[0] - 150, forestC[1] - 150, 300, 300], { ...plain, samples: 2000 })
          ?? P.place("saw", R.conv, inner, { ...plain, samples: 4000 });
      }
      const s: Pt = s0 ?? fail("no room for the material processor");
      pad({ type: "pad.build", id: "saw", at: [...s], cost: { "res.currency": cost("saw") }, build: "conv.material_processor" });
      // Every converter has a feed path: a worker brings fuel scrap to the material processor (hired first).
      const sStaff = plotOn ? slotAt("saw", "staff") : null;
      const sf = sStaff ?? placePad("saw_feeder", besideSource("node.fuel_scrap", s));
      pad({ type: "pad.hire", id: "saw_feeder", at: [...sf], cost: { "res.currency": cost("hire.feeder") }, role: { role: "role.supplier", from: "node.fuel_scrap", to: "conv.material_processor" }, requires: { pad: "saw" } });
      const sw = sStaff ?? stationPad(s, "op");
      pad({ type: "pad.hire", id: "sawyer", at: [...sw], cost: { "res.currency": cost("hire.sawyer") }, role: { role: "role.operator", to: "conv.material_processor" }, requires: { pad: "saw_feeder" } });
      if (feat.has("tier2")) {
        alloy = true;
        // With a belt the parts works stands just past the smelter tray (to its right), so the run
        // is short and straight; the build check below rejects any layout where it would cross the base.
        const beside: Pt = alloyFor(s);
        // With a belt, a spot is only good if the run from the smelter's tray stays clear of everything placed and its
        // mid-run pad (on the belt) has room: checked here so a layout is not thrown away after the machine is placed.
        const pk = c.converters["conv.material_processor"]!.pickupOffset, runFrom: Pt = [s[0] + pk[0], s[1] + pk[1]];
        const beltOk = (q: Pt): boolean => {
          if (P.stations.some((st) => !["saw", "alloy"].includes(st.id) && !st.tight && segDist([st.x, st.y], runFrom, q) < st.r + 8)) return false;
          const mid = toward(runFrom, q, 0.5);
          if (!P.ok("belt", mid, R.pad, { key: true, fp: ["pad"], onWall: true })) return false;
          const mb = P.box(mid, "pad")!, g = S.footprintGap;
          const clash = (u: Box | undefined) => !!u && mb[0] < u[2] + g && u[0] < mb[2] + g && mb[1] < u[3] + g && u[1] < mb[3] + g;
          return dist(mid, q) >= Math.max(R.conv, R.pad) + S.margin && !clash(P.box(q, "conv.alloy_works"))
            && machineSlots("conv.alloy_works").every((o) => { const sq: Pt = [q[0] + o.dx, q[1] + o.dy]; return dist(mid, sq) >= R.pad + S.margin && !clash(P.box(sq, "pad")); });
        };
        // with a belt the belt is the parts works' input (no input hauler), so only its operator and output slots
        const alloyOpts = { near: feat.has("conveyors") ? beside : toward(s, shopAt, 0.5), key: true, pad: true, spots: convSpots("conv.alloy_works"), slots: machineSlots("conv.alloy_works", belted ? ["op", "out"] : undefined), ...(plotOn && !belted ? { alts: plotAlts("conv.alloy_works") } : {}), mirror: false, fp: "conv.alloy_works", ...(feat.has("conveyors") ? { accept: beltOk } : {}) };
        // with a belt the pair check already cleared the exact spot beside the smelter
        const a = (belted ? P.place("alloy", R.conv, [beside[0] - 1, beside[1] - 1, 2, 2], { ...alloyOpts, near: beside, samples: 40 }) : null)
          ?? P.place("alloy", R.conv, ring ? inner : [16, 340, 448, 500], { ...alloyOpts, samples: 8000 })
          ?? P.place("alloy", R.conv, inner, { ...alloyOpts, samples: 16000 })
          ?? fail("no room for the alloy works");
        pad({ type: "pad.build", id: "alloy", at: [...a], cost: { "res.currency": cost("alloy") }, build: "conv.alloy_works", requires: { pad: "sawyer" } });
        // a belt arrives at the hopper side, so with one the input worker stands lower, off its path
        // input worker, unless a belt feeds the parts works (it is then the input step; see below)
        const aStaff = plotOn ? slotAt("alloy", "staff") : null;
        // plot layout with a belt (plot plan Q7): the staff pad still offers the input worker first, withdrawn if the
        // player builds the belt first; the operator then follows either one
        const carrier = !belted || aStaff !== null;
        if (carrier) {
          const rc = aStaff ?? stationPad(a, "in");
          pad({ type: "pad.hire", id: "refined_carrier", at: [...rc], cost: { "res.currency": cost("hire.server") }, role: { role: "role.server", from: "conv.material_processor", to: "conv.alloy_works" }, requires: { pad: "alloy" }, ...(belted ? { dropWhen: { pad: "belt" } } : {}) });
        }
        const sm = aStaff ?? stationPad(a, "op");
        pad({ type: "pad.hire", id: "smith", at: [...sm], cost: { "res.currency": cost("hire.smith") }, role: { role: "role.operator", to: "conv.alloy_works" }, requires: belted ? (carrier ? { pad: "refined_carrier", orPad: "belt" } : { pad: "belt" }) : { pad: "refined_carrier" } });
        const cs = aStaff ?? stationPad(a, "out");
        pad({ type: "pad.hire", id: "component_server", at: [...cs], cost: { "res.currency": cost("hire.server") }, role: { role: "role.server", from: "conv.alloy_works", to: "sink.sales_point" }, requires: { pad: "smith" } });
        if (feat.has("conveyors")) {
          // The step after haulers (R3 item 16): a belt from the smelter's tray to the parts works,
          // bought once the hauler runs. Its run is kept clear: nothing already placed may sit on
          // it, and later stations treat it like a wall.
          const d = c.converters["conv.material_processor"]!.pickupOffset;
          const from: Pt = [s[0] + d[0], s[1] + d[1]];
          for (const st of P.stations) {
            // (pass 2: the machines' own build pads are spent before the belt can be bought)
            if (["saw", "alloy", "saw:pad"].includes(st.id) || st.id.startsWith("alloy:") || st.tight) continue;
            if (segDist([st.x, st.y], from, a) < st.r + 8) fail(`belt run blocked by ${st.id}`);
          }
          P.walls.push([from, a]);
          // the belt's own build pad sits on the belt, at the middle of the run (the run is a wall, so it is exempt)
          const bp = toward(from, a, 0.5);
          if (!P.pinAt("belt") && !P.ok("belt", bp, R.pad, { key: true, fp: ["pad"], onWall: true })) fail("no room for the belt pad on its run");
          P.add("belt", bp, R.pad, { key: true, fp: ["pad"] });
          pad({ type: "pad.build", id: "belt", at: [...bp], cost: { "res.currency": cost("belt") }, build: "struct.conveyor", link: { from: "conv.material_processor", to: "conv.alloy_works" }, requires: { pad: "alloy" } });
        }
        sells.push("res.component");
      }
    }
  }
  if (feat.has("depot") && workers) {
    // the hauler's pad, then the warehouse's own pads: drop-off and one pickup per storable resource (content offsets)
    const dDef = c.structures["struct.depot"]!;
    const dSlots = [
      ...(["out"] as const).map((k) => ({ id: k, dx: GEN.depotCrewStations[k][0], dy: GEN.depotCrewStations[k][1], r: R.pad, fp: "pad" })),
      ...[dDef.dropOffset ?? [0, 0], ...(dDef.pickupOffsets ?? [])].map((o, k) => ({ id: k === 0 ? "drop" : `pick${k - 1}`, dx: o[0], dy: o[1], r: dDef.padRange ?? R.pad, fp: "pad" })),
    ];
    // plot layout: one staff slot, the courier (hauler) first, then the input collector; the player only drops here
    const dp = placePad("depot", tpl.depot, { build: "struct.depot", ...(plotOn ? plotOpts("struct.depot") : { slots: dSlots }) });
    pad({ type: "pad.build", id: "depot", at: [...dp], cost: { "res.currency": cost("depot") }, build: "struct.depot" });
    const dStaff = plotOn ? slotAt("depot", "staff") : null;
    // Haulers drain the depot, so a stockpile goal has none.
    const hauls = goal !== "stockpile";
    const hauler = (at: Pt) => pad({ type: "pad.hire", id: "hauler", at: [...at], cost: { "res.currency": cost("hire.hauler") }, role: { role: "role.hauler", from: "store.depot" }, requires: { pad: "depot" } });
    if (dStaff && hauls) hauler(dStaff);
    const ds = dStaff ?? placePad("depot_supplier", besideSource("node.fuel_scrap", dp));
    pad({ type: "pad.hire", id: "depot_supplier", at: [...ds], cost: { "res.currency": cost("hire.depotSupplier") }, role: { role: "role.supplier", from: "node.fuel_scrap", to: "store.depot" }, requires: { pad: dStaff && hauls ? "hauler" : "depot" } });
    if (!dStaff && hauls) hauler([dp[0] + GEN.depotCrewStations.out[0], dp[1] + GEN.depotCrewStations.out[1]]);
  }

  // ---------- shelter mechanics ----------
  let arrivals = 0;
  const gatePos: Pt | null = feat.has("gate_arrivals") ? (P.pinAt("gate") ?? (ring ? [core[0], Math.min(880, ring.rect[1] + ring.rect[3] + 26)] : [core[0], Math.min(860, core[1] + 300)])) : null;
  if (gatePos) {
    arrivals = Math.round(K.arrivals);
    P.spot("admit", [gatePos[0], gatePos[1] - 20], 22);
    ents.push({ type: "struct.gate", id: "gate", at: [...gatePos], arrivals: { every: Math.round(K.arrivalEvery), total: arrivals } });
  }
  const corePads: Ent[] = [];
  if (feat.has("core_levels") || feat.has("rockslides") || feat.has("clearing_pass") || goal === "core_level") {
    // A core-level goal with rubble needs a second level pad to hang the clearing pad from.
    const nLv = goal === "core_level" && feat.has("rockslides") ? 2 : 1;
    for (let k = 0; k < nLv; k++) {
      // plot layout: one upgrade slot on the core's plot takes L2, then L3
      const lp = plotOn ? slotAt("core", "upgrade") : placePad(`core_level${k}`, [core[0] + (k === 0 ? -1 : 1) * GEN.corePadBeside[0], core[1] + GEN.corePadBeside[1]], { region: [core[0] - 130, core[1] - 60, 260, 170] });
      corePads.push(pad({ type: "pad.build", id: `core_level${k}`, at: [...lp], cost: { "res.currency": cost("core.level") + 12 * k }, build: "sink.core.level", ...(plotOn && k > 0 ? { requires: { pad: `core_level${k - 1}` } } : {}) }));
    }
  }
  let zones = 0;
  if (feat.has("rockslides") && !ring) {
    const n = 1;
    for (let k = 0; k < n; k++) {
      // Rubble over part of a fuel grove: clearing it opens more fuel near the base.
      let zr: Rect | null = pin?.zones.get(`rubble${k}`) ?? null;
      for (let t = 0; t < 40 && !zr; t++) {
        const ang = rand.float() * Math.PI * 2, d = 130 + rand.float() * 90;
        const zc: Pt = [Math.round(core[0] + Math.cos(ang) * d), Math.round(core[1] + Math.sin(ang) * d * 1.2)];
        const cand: Rect = [Math.max(20, Math.min(340, zc[0] - 60)), Math.max(60, Math.min(770, zc[1] - 35)), 120, 70];
        const clear = !P.stations.some((s) => s.id !== "core" && rectDist([s.x, s.y], cand) < s.r + 6) && rectDist(core, cand) >= R.core + 30
          && !P.spots.some((s) => rectDist([s.x, s.y], cand) < s.r + 6) && P.blocked.every((b) => rectDist([b[0] + b[2] / 2, b[1] + b[3] / 2], cand) > 90)
          && P.onScreen([cand[0] + 60, cand[1] + 35]);
        if (clear) zr = cand;
      }
      if (!zr) throw new Error("no room for rubble");
      ents.push({ type: "zone.blocked", id: `rubble${k}`, rect: [...zr] });
      P.blocked.push(zr);
      // What the slide hides: drawn from generator.json, only kinds whose resource this level uses (rock slides
      // only occur on wall-free levels, which never use salvage). Its own stream, so the rest of the level never shifts.
      const rsr = new Rand(mix(inp.seed >>> 0, hashStr("rockslide") + k));
      const pool = GEN.rockslide.rewards.filter((w) => w.weight > 0 && (w.resource !== "res.salvage" || !!ring));
      let pick = rsr.float() * pool.reduce((a, w) => a + w.weight, 0), reward = pool[0]!;
      for (const w of pool) { if (pick < w.weight) { reward = w; break; } pick -= w.weight; }
      for (let i = 0; i < reward.count; i++) ents.push({ type: reward.node, at: [Math.round(zr[0] + zr[2] / 2 + 35 * (i - (reward.count - 1) / 2)), Math.round(zr[1] + zr[3] / 2)] });
      const zp = placePad(`clear${k}`, [zr[0] + zr[2] / 2, zr[1] + (zr[1] > core[1] ? -45 : zr[3] + 45)]);
      void zp;
      pad({ type: "pad.build", id: `clear${k}`, at: [...zp], cost: { "res.currency": cost("zone") }, build: "zone.clear", target: `rubble${k}`, requires: { coreLevel: 2 } });
      zones++;
    }
  }

  // Hunting zones: 3 animals, some of them dangerous variants on later levels (the `dangerPrey` knob rounds to the
  // count, gated by a data chance). Its own random stream, so layouts and the rest of the level never shift.
  const preyZones = (r: Rect): void => {
    const drand = new Rand((inp.seed ^ hashStr("danger") ^ Math.imul(layoutSalt + 1, 0x85ebca6b)) >>> 0);
    const want = Math.min(GEN.danger.max, Math.max(0, Math.round(K.dangerPrey)));
    const dn = want > 0 && drand.chance(GEN.danger.chance) ? want : 0;
    ents.push({ type: "zone.prey", id: "prey", rect: [...r], animal: "node.prey", n: 3 - dn });
    if (dn > 0) ents.push({ type: "zone.prey", id: "prey_danger", rect: [...r], animal: "node.prey_dangerous", n: dn });
  };

  // Traders come in through a gate: the ring always has one in the section nearest the kiosk.
  const kioskGate = (gates: number[]): number[] => {
    if (!ring || !shopAt) return gates;
    const pts = ring.points, at = shopAt;
    const near = pts.map((p, i) => i).reduce((a, i) => (segDist(at, pts[i]!, pts[(i + 1) % pts.length]!) < segDist(at, pts[a]!, pts[(a + 1) % pts.length]!) ? i : a), 0);
    return [...new Set([...gates, near])].sort((a, b) => a - b);
  };

  // ---------- rescue: pods, crates, the pass, prey ----------
  let pods = 0, crates = 0;
  if (rescue && ring) {
    const rr = ring.rect;
    const north = pin?.ring ? false : core[1] - rr[1] < 0 ? false : rr[1] > 900 - (rr[1] + rr[3]);
    const gateSide = north ? "n" : "s";
    // Gate: the middle-most section on the pods' side.
    const gIdx = ring.side.map((s, i) => ({ s, i })).filter((x) => x.s === gateSide);
    ringGates = pin?.ring ? [...pin.ring.gates] : kioskGate([gIdx[Math.floor(gIdx.length / 2)]!.i]);
    if (wallsOn) ents.push({ type: "barrier.line", id: "ring", res: "res.currency", costPerSection: 1, points: ring.points.map((p) => [...p]), closed: true,
      gates: ringGates, prebuilt: ring.points.map((_, i) => i) });
    const E = GEN.rings.edge, gap = GEN.rings.podGap;
    let passRect: Rect | null = null;
    // pass 2 (Doug 2026-11-16): a gate-width rockfall outside the gate replaces the map-wide pass; the rest of the band out to the map
    // edges is static and clears with it (clearsWith)
    const gateRock = pin?.rock.get("pass");
    const band: Rect[] = gateRock?.rest ?? [];
    const podSide: Side = gateRock?.side ?? (pin?.ring ? (ringGates.some((i) => ring!.side[i] === "s") ? "s" : "e") : north ? "n" : "s");
    if (feat.has("clearing_pass") && gateRock) {
      passRect = gateRock.rect;
      ents.push({ type: "zone.blocked", id: "pass", rect: [...passRect] });
      band.forEach((b, k) => ents.push({ type: "zone.blocked", id: `pass_band${k}`, rect: [...b], clearsWith: "pass" }));
      const zp = P.pinAt("clear_pass") ?? fail("no pad for the gate rockfall");
      if (!P.onScreen(zp)) fail("pass pad off screen");
      P.add("clear_pass", zp, R.pad, { key: true, fp: "pad" });
      pad({ type: "pad.build", id: "clear_pass", at: [...zp], cost: { "res.currency": cost("zone") }, build: "zone.clear", target: "pass", requires: { coreLevel: 2 } });
      zones++;
    } else if (feat.has("clearing_pass")) {
      const y = north ? Math.round(rr[1] * 0.42) - 20 : Math.round(900 - (900 - rr[1] - rr[3]) * 0.42) - 24;
      passRect = [0, y, 480, 44];
      ents.push({ type: "zone.blocked", id: "pass", rect: [...passRect] });
      const padY = north ? y + 44 + Math.round((rr[1] - y - 44) / 2) : rr[1] + rr[3] + Math.round((y - rr[1] - rr[3]) / 2);
      const zp: Pt = [core[0] + 70, padY];
      if (!P.onScreen(zp)) fail("pass pad off screen");
      P.add("clear_pass", zp, R.pad, { key: true, fp: "pad" });
      pad({ type: "pad.build", id: "clear_pass", at: [...zp], cost: { "res.currency": cost("zone") }, build: "zone.clear", target: "pass", requires: { coreLevel: 2 } });
      zones++;
    }
    const sideOk = (p: Pt) => (podSide === "n" ? p[1] <= rr[1] + rr[3] : podSide === "s" ? p[1] >= rr[1] : podSide === "e" ? p[0] >= rr[0] : p[0] <= rr[0] + rr[2]);
    const outside = (p: Pt) => rectDist(p, rr) >= gap && p[0] >= E && p[0] <= 480 - E && p[1] >= E && p[1] <= 900 - E
      && !(passRect && rectDist(p, passRect) < 50) && !band.some((b) => rectDist(p, b) < 50) && sideOk(p);
    const behind = (p: Pt) => passRect !== null && (podSide === "n" ? p[1] < passRect[1] : podSide === "s" ? p[1] > passRect[1] + passRect[3]
      : podSide === "e" ? p[0] > passRect[0] + passRect[2] : p[0] < passRect[0]);
    const placed: Pt[] = [];
    const take = (n: number, type: string, wantBehind: number, freeze: (k: number, p: Pt) => number | null) => {
      let k = 0, b = 0;
      for (let tries = 0; tries < 900 && k < n; tries++) {
        const p: Pt = [rand.int(E, 480 - E), rand.int(E, 900 - E)];
        // Tow goals spread the captives out, so gathering a full chain is a route, not a grab.
        const spread = goal === "tow_trip" || goal === "tow_full_trip" ? 150 : 90;
        if (!outside(p) || placed.some((q) => dist(p, q) < spread)) continue;
        // Recruits behind the pass fill the "behind" quota first; the rest stay on the near side.
        const isBehind = behind(p);
        if (passRect && wantBehind >= 0 && isBehind !== b < wantBehind) continue;
        placed.push(p);
        const fz = freeze(k, p);
        ents.push({ type, at: [...p], ...(fz !== null ? { freeze: fz } : {}) });
        k++; if (isBehind) b++;
      }
      return k;
    };
    const nPods = goal === "crates" ? 1 + Math.round(K.pods / 3) : Math.round(K.pods);
    // a gate rockfall's band hugs the gate, leaving no near side: the pods go beyond the band, the crates on either side of it
    pods = take(nPods, "capture.recruit_container", passRect ? (gateRock ? nPods : Math.ceil(nPods / 2)) : 0,
      (k, p) => feat.has("pod_timers") ? Math.round(K.podFreeze + 18 * k + dist(p, core) / 8) : null);
    if (pods < 2) fail("no room for pods");
    if ((goal === "tow_trip" || goal === "tow_full_trip") && pods + crates < 3) fail("a tow goal needs three captives");
    if (feat.has("crates")) {
      crates = take(Math.round(K.crates), "capture.supply_crate", gateRock ? -1 : 0, () => null);
      if (crates < 1) fail("no room for crates");
    }
    if (feat.has("hunting")) {
      const side = core[0] > 240 ? 0 : 1;
      const pr: Rect = side === 0 ? [20, rr[1] + 30, Math.max(60, rr[0] - 40), 150] : [rr[0] + rr[2] + 20, rr[1] + 30, Math.max(60, 480 - (rr[0] + rr[2]) - 40), 150];
      if (pr[2] < 60) {
        // No side strip: roam inside the ring instead.
        const ir: Rect = [inner[0] + 10, inner[1] + 10, 120, 90];
        preyZones(ir);
      } else preyZones(pr);
      const drops = Object.keys(c.animals["node.prey"]!.drops);
      if (shopAt) for (const r of drops) if (!sells.includes(r) && (c.resources[r]?.price ?? 0) > 0) sells.push(r);
    }
  } else if (feat.has("hunting")) {
    const pr = tpl.prey;
    preyZones(pr);
    if (shopAt) for (const r of Object.keys(c.animals["node.prey"]!.drops)) if (!sells.includes(r) && (c.resources[r]?.price ?? 0) > 0) sells.push(r);
  }


  // ---------- defend: ring, towers, upgrades, defenders, med bay, waves ----------
  const waves: { t: number; counts: Record<string, number>; side?: string | string[]; gap?: number }[] = [];
  const towers: Ent[] = [];
  /** Attack lanes (gate middle, then a point past the map edge), kept clear of terrain. */
  const lanes: [Pt, Pt][] = [];
  const regular = new Set<(typeof waves)[number]>();
  /** Attack-gate spot for a medic's hire pad (R5): needs the socket search, so it is set inside the sockets block. */
  let medicSpot: () => Pt | null = () => null;
  let medicHire = false;
  /** Wall-free levels: the reactor ring of sockets, set inside the sockets block (needs its helpers) and run after the buildings are placed, so they keep their room. */
  let ringSockets: () => void = () => {};
  if (defend && ring) {
    const all: ("n" | "e" | "s" | "w")[] = ["n", "e", "w", "s"];
    // a two-family finale splits attention with its other family: at most two attack sides there
    // Attacks come only from the sides facing the camera (viewClear.attackSides), so a multi-side level takes as many of them as there are.
    const facing = VC.attackSides;
    // Wall-free levels (outpost-ops#208): at most defendFree.lanesBeforeCore2 attack lanes. A lane opened later, once the core
    // reaches its second level, needs a wave rule the sim does not have, so for now the cap holds for the whole level.
    const laneCap = wallsOn ? Infinity : GEN.defendFree.lanesBeforeCore2;
    const nSides = Math.min(facing.length, laneCap, feat.has("multi_side") ? (K.waves >= 4 && !inp.secondary ? 3 : 2) : 1);
    const first = facing[rand.int(0, facing.length - 1)]!;
    sides = pin ? [...pin.sides] : [first, ...facing.filter((s) => s !== first)].slice(0, nSides);
    const quiet = all.filter((s) => !sides.includes(s));
    // R3 playtest: every side attackers come from has a gate and tower posts, so the probe raid comes
    // from the first attack side (through its still-unbuilt wall, never its gate) like the early raids.
    const raidSide = feat.has("med_bay") ? sides[0]! : null;
    // A gate faces every attack side (R3 item 11), on that side's middle section; arrivals keep an exit
    // on the south side, where their gate stands. The med bay's probe raid comes through the first attack
    // side's unbuilt wall sections (beside its gate), so that raid still hurts someone.
    const gateSides = [...new Set([...sides, ...(feat.has("gate_arrivals") ? ["s" as const] : [])])];
    ringGates = gateSides.map((gs) => {
      const gIdx = ring!.side.map((s, i) => ({ s, i })).filter((x) => x.s === gs);
      return gIdx[Math.floor(gIdx.length / 2)]!.i;
    });
    ringGates = pin?.ring ? [...pin.ring.gates] : kioskGate(ringGates);
    // Doug 2026-11-16: the wavefront's ring has gates on the south and east sides only
    if (pin?.ring && sides.some((sd) => !ringGates.some((i) => ring!.side[i] === sd))) fail(`attack side without a gate (${sides.join("")}; gates stand on the south and east sides only)`);
    const wallsCurrency = goal === "perimeter_before_wave1";
    const pre: number[] = [];
    // Gates stand from the start. Where towers are to be bought, so do the corner sections, so the
    // scrap goes to the defence: the player builds the wall either side of each gate.
    const n0 = ring.points.length;
    const corner = (i: number) => ring!.side[(i + n0 - 1) % n0] !== ring!.side[i] || ring!.side[(i + 1) % n0] !== ring!.side[i];
    // The med bay's probe raid comes through a breach (its quiet side's wall, corners aside, is still
    // to build), so someone is hurt before the player can wall it.
    const breach = (i: number) => ring!.side[i] === raidSide && !corner(i) && !ringGates.includes(i);
    ring.side.forEach((s, i) => {
      if (breach(i)) return;
      // a two-family finale starts walled (but for the one section kept to build below): its defence work is towers and guards
      if (!sides.includes(s) || ringGates.includes(i) || (feat.has("turrets") && corner(i)) || inp.secondary) pre.push(i);
      else if (rand.float() < K.prebuiltRing && !wallsCurrency) pre.push(i);
    });
    if (pre.length === ring.points.length) pre.splice(pre.indexOf(ring.side.findIndex((s) => s === sides[0])), 1);
    if (wallsOn) ents.push({ type: "barrier.line", id: "ring", res: wallsCurrency ? "res.currency" : "res.salvage", costPerSection: Math.max(1, Math.round(K.ringCost)),
      points: ring.points.map((p) => [...p]), closed: true, gates: ringGates, prebuilt: pre });
    {
      // Batch 3 (tower defence, after Kingshot): every defend level has turret sockets. Each attack gate has a few
      // inside the wall beside it, and the road out of it is lined with sockets on both sides the whole way to the
      // map edge (the map is padded by defendRoad.pad so the road is long): the nearest pair stands from the start
      // and one more pair per road opens with each wave. A socket is a tower pad, then its Lv2 and Lv3 pads on the
      // same spot (each needs the one before); every defence purchase raises the next price (pads.defenceGrowth).
      const SK = GEN.defendSockets, RD = GEN.defendRoad;
      const OUT: Record<string, Pt> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
      const tf = GEN.footprints["struct.ranged_defense"]!, g = S.footprintGap;
      const lo: Pt = [-RD.pad + SK.edge, -RD.pad + SK.edge], hi: Pt = [480 + RD.pad - SK.edge, 900 + RD.pad - SK.edge];
      const segHits = (a: Pt, c: Pt, r: Box) => segDist([(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], a, c) < Math.hypot(r[2] - r[0], r[3] - r[1]) / 2
        && Math.max(Math.min(a[0], c[0]), r[0]) <= Math.min(Math.max(a[0], c[0]), r[2]) && Math.max(Math.min(a[1], c[1]), r[1]) <= Math.min(Math.max(a[1], c[1]), r[3]);
      // A footprint box clear of the (padded) map edge, every wall, every lane (unless onRoad) and every station and standing spot.
      const boxOk = (q: Pt, fp: string, r: number, onRoad: boolean): boolean => {
        const b = P.box(q, fp)!;
        if (b[0] < lo[0] || b[1] < lo[1] || b[2] > hi[0] || b[3] > hi[1]) return false;
        const fat: Box = [b[0] - SK.wallClear, b[1] - SK.wallClear, b[2] + SK.wallClear, b[3] + SK.wallClear];
        for (const w of P.walls) if (segHits(w[0], w[1], fat)) return false;
        const lw = SK.laneClear;
        if (!onRoad) for (const [a, c] of lanes) if (segHits(a, c, [b[0] - lw, b[1] - lw, b[2] + lw, b[3] + lw])) return false;
        for (const s of P.stations) {
          if (s.tight) continue; // gatherables give way (clearTight)
          if (dist(q, [s.x, s.y]) < s.r + r) return false;
          if (s.fp && b[0] < s.fp[2] + g && s.fp[0] < b[2] + g && b[1] < s.fp[3] + g && s.fp[1] < b[3] + g) return false;
        }
        for (const sp of P.spots) if (dist(q, [sp.x, sp.y]) < sp.r + r) return false;
        // pass 2: a tower never hides one of the wavefront's pads (there is no repair step after placement)
        const shade = pin && fp === "struct.ranged_defense" ? shadowTest(fp, [q[0], q[1]]) : null;
        if (shade && P.padPoints().some((p) => shade([p[0], p[1]]))) return false;
        return true;
      };
      // Gatherables (forest nodes) under a socket's tower or its pad are taken off the map, while the forest keeps enough.
      const clearTight = (q: Pt, fp: string, r: number): void => {
        const b = P.box(q, fp)!;
        for (let i = P.stations.length - 1; i >= 0; i--) {
          const s = P.stations[i]!;
          if (!s.tight) continue;
          const hit = dist(q, [s.x, s.y]) < s.r + r
            || (!!s.fp && b[0] < s.fp[2] + g && s.fp[0] < b[2] + g && b[1] < s.fp[3] + g && s.fp[1] < b[3] + g);
          if (!hit) continue;
          const k = ents.findIndex((e) => e.type.startsWith("node.") && Array.isArray(e["at"]) && (e["at"] as number[])[0] === s.x && (e["at"] as number[])[1] === s.y);
          // never thin the reactor's ore scrap below keepForest
          if (k >= 0 && ents[k]!.type === "node.fuel_scrap" && ents.filter((e) => e.type === "node.fuel_scrap").length <= SK.keepForest) continue;
          P.stations.splice(i, 1);
          if (k >= 0) ents.splice(k, 1);
        }
      };
      // The free spot nearest the wanted one (gate frame: u along the side, v outward), never drifting across the wall.
      const find = (m: Pt, al: Pt, o: Pt, uv: readonly [number, number], fp: string, r: number, onRoad: boolean): Pt | null => {
        const want: Pt = [Math.round(m[0] + al[0] * uv[0] + o[0] * uv[1]), Math.round(m[1] + al[1] * uv[0] + o[1] * uv[1])];
        const tries: Pt[] = [];
        for (let du = -SK.search; du <= SK.search; du += 6) for (let dv = -SK.search; dv <= SK.search; dv += 6) tries.push([du, dv]);
        tries.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
        for (const [du, dv] of tries) {
          if (Math.sign(uv[1]) !== Math.sign(uv[1] + dv)) continue;
          const q: Pt = [want[0] + al[0] * du + o[0] * dv, want[1] + al[1] * du + o[1] * dv];
          if (boxOk(q, fp, r, onRoad)) return q;
        }
        return null;
      };
      const nW0 = Math.max(Math.round(K.waves), GEN.defendWaves.lateFrom + 2);
      const made: Record<string, number> = {};
      const socket = (sd: string, site: Pt, tp: Pt, wave: number): void => {
        const id = `tower_${sd}${(made[sd] = (made[sd] ?? 0) + 1)}`;
        P.add(`${id}@site`, site, 0, { fp: "struct.ranged_defense" });
        // far road pads are meant to be out of the opening view: key only within the screen radius
        const key = dist(tp, core) <= S.screenRadius;
        P.add(id, tp, R.pad, { key, fp: ["pad"], on: `${id}@site` });
        towers.push(pad({ type: "pad.build", id, at: [...tp], cost: { "res.salvage": salv("salvage.tower") }, build: "struct.ranged_defense", site: [...site], ...(wave > 0 ? { requires: { wave } } : {}) }));
        // Lv2 and Lv3 take the tower pad's spot, which is free once the one before is bought.
        P.add(`${id}_up`, tp, R.pad, { key, on: id });
        pad({ type: "pad.build", id: `${id}_up`, at: [...tp], cost: { "res.salvage": salv("salvage.towerUp") }, build: "struct.ranged_defense.t2", target: id, requires: { pad: id } });
        P.add(`${id}_up3`, tp, R.pad, { key, on: id });
        pad({ type: "pad.build", id: `${id}_up3`, at: [...tp], cost: { "res.salvage": salv("salvage.towerUp3") }, build: "struct.ranged_defense.t3", target: id, requires: { pad: `${id}_up` } });
      };
      type Gate = { sd: string; m: Pt; o: Pt; al: Pt };
      const gates: Gate[] = sides.map((sd) => {
        // the side's attack gate: of its gates the one nearest the core (as the sim picks it)
        const mids = ringGates.filter((i) => ring!.side[i] === sd).map((i) => {
          const a = ring!.points[i]!, b = ring!.points[(i + 1) % ring!.points.length]!;
          return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt;
        });
        const m = mids.reduce((p, q) => (dist(q, core) < dist(p, core) ? q : p)), o = OUT[sd]!, al: Pt = [Math.abs(o[1]), Math.abs(o[0])];
        lanes.push([m, [m[0] + o[0] * (900 + 2 * RD.pad), m[1] + o[1] * (900 + 2 * RD.pad)]]);
        return { sd, m, o, al };
      });
      // inside the wall: a few sockets beside each gate, standing from the start
      for (const G of gates) {
        const { sd, m, o, al } = G;
        const spots = [...(sd === "e" || sd === "w" ? SK.insideEW : SK.inside)];
        let n = 0;
        while (n < SK.startInside && spots.length > 0) {
          const site = find(m, al, o, spots.shift()!, "struct.ranged_defense", SK.siteR, false);
          if (!site) continue;
          clearTight(site, "struct.ranged_defense", SK.siteR);
          // its pad inward of it
          const inward: Pt = [-o[0], -o[1]];
          const depth = (inward[0] + inward[1] > 0 ? tf[inward[0] ? 2 : 3]! : -tf[inward[0] ? 0 : 1]!) + g + 26;
          const near: Pt = [Math.round(site[0] + inward[0] * depth), Math.round(site[1] + inward[1] * depth)];
          P.add("probe@site", site, 0, { fp: "struct.ranged_defense" });
          clearTight(near, "pad", R.pad + S.margin);
          const tp = P.place("probe", R.pad, [near[0] - 24, near[1] - 24, 48, 48], { near, key: true, fp: ["pad"], hugWall: true, pull: false, samples: 120 })
            ?? P.place("probe", R.pad, [near[0] - 60, near[1] - 60, 120, 120], { near, key: true, fp: ["pad"], pull: false, samples: 400 });
          for (const id of ["probe", "probe@site"]) { const k = P.stations.findIndex((x) => x.id === id); if (k >= 0) P.stations.splice(k, 1); }
          if (!tp) continue;
          socket(sd, site, tp, 0);
          n++;
        }
        if (n < SK.startInside) fail(`no room for ${SK.startInside} turret sockets inside the ${sd} gate`);
      }
      // along each road: a pair of sockets every roadStep from the wall out to the edge, the nearest pair open from
      // the start and each next pair once that many waves have started (the last ones with the last wave)
      for (const G of gates) {
        const { sd, m, o, al } = G;
        const reach = sd === "n" ? m[1] + RD.pad : sd === "s" ? 900 + RD.pad - m[1] : sd === "w" ? m[0] + RD.pad : 480 + RD.pad - m[0];
        let pair = 0, opened = 0;
        for (let v = RD.first; v <= reach - RD.endGap && pair < RD.maxPairs; v += RD.step, pair++) {
          const wave = Math.min(pair, nW0 - 1);
          for (const sg of [-1, 1]) {
            const site = find(m, al, o, [sg * (sd === "e" || sd === "w" ? RD.towerUEW : RD.towerU), v], "struct.ranged_defense", SK.siteR, false);
            if (!site) continue;
            // its pad directly behind it, on the side away from the road (clear of the footprint, which is longer along y)
            const away: Pt = [sg * al[0], sg * al[1]];
            const ext = (away[0] + away[1] > 0 ? tf[away[0] ? 2 : 3]! : -tf[away[0] ? 0 : 1]!) + g + 26;
            const u0 = (site[0] - m[0]) * al[0] + (site[1] - m[1]) * al[1] + sg * ext;
            const pv: [number, number] = [u0, (site[0] - m[0]) * o[0] + (site[1] - m[1]) * o[1]];
            P.add("probe@site", site, 0, { fp: "struct.ranged_defense" });
            const tp = find(m, al, o, pv, "pad", R.pad + S.margin, true);
            P.stations.splice(P.stations.findIndex((x) => x.id === "probe@site"), 1);
            if (!tp) continue;
            clearTight(site, "struct.ranged_defense", SK.siteR);
            clearTight(tp, "pad", R.pad + S.margin);
            socket(sd, site, tp, wave);
            if (wave === 0) opened++;
          }
        }
        if (opened === 0) fail(`no room for a turret socket on the ${sd} road`);
      }
      // Wall-free levels (outpost-ops#208): the main defence is a ring of sockets around the reactor, inside its level-refLevel
      // heat circle (so inside every later one too), the nearest `start` standing from the start and one more opening per wave.
      // The road pairs above stay as the early forward post.
      if (!wallsOn) ringSockets = () => {
        const FR = GEN.defendFree;
        const lv = (c.sinks["sink.core"] as { levels: { safeRadius: number }[] }).levels;
        const refR = lv[Math.min(Math.max(1, FR.refLevel), lv.length) - 1]!.safeRadius;
        const rLo = FR.band[0] * refR, rHi = FR.band[1] * refR;
        // Gatherables under a ring tower or pad give way, but never below keepForest ore scrap nodes (clearTight): a spot that would
        // leave one standing under it is no spot (the rater calls that overlap unreadable).
        const forestOk = (spots: [Pt, string, number][]): boolean => {
          const gone = new Set<number>();
          for (const [q, fp, rr] of spots) {
            const b = P.box(q, fp)!;
            for (const s of P.stations) {
              if (!s.tight) continue;
              const hit = dist(q, [s.x, s.y]) < s.r + rr || (!!s.fp && b[0] < s.fp[2] + g && s.fp[0] < b[2] + g && b[1] < s.fp[3] + g && s.fp[1] < b[3] + g);
              if (!hit) continue;
              const k = ents.findIndex((e) => e.type === "node.fuel_scrap" && Array.isArray(e["at"]) && (e["at"] as number[])[0] === s.x && (e["at"] as number[])[1] === s.y);
              if (k >= 0) gone.add(k);
            }
          }
          return gone.size === 0 || ents.filter((e) => e.type === "node.fuel_scrap").length - gone.size >= SK.keepForest;
        };
        // sockets facing the attack sides first, so the ones standing from the start meet the first raids
        const att = sides.reduce((v, sd) => [v[0] + OUT[sd]![0], v[1] + OUT[sd]![1]] as Pt, [0, 0] as Pt);
        const slots = Array.from({ length: FR.sockets }, (_, k) => (FR.phase + (360 * k) / FR.sockets) * Math.PI / 180)
          .sort((a, b) => (Math.cos(b) * att[0] + Math.sin(b) * att[1]) - (Math.cos(a) * att[0] + Math.sin(a) * att[1]));
        const fracs = [0, 1, 2, 3, 4].map((i) => FR.band[0] + (FR.band[1] - FR.band[0]) * i / 4).sort((a, b) => Math.abs(a - FR.frac) - Math.abs(b - FR.frac));
        const dirs: Pt[] = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]];
        const step = Math.max(1, FR.angleSearch / 5);
        let placed = 0;
        for (const th0 of slots) {
          let done = false;
          for (let da = 0; da <= FR.angleSearch && !done; da += step) for (const sg of da === 0 ? [1] : [1, -1]) {
            if (done) break;
            const th = th0 + (sg * da * Math.PI) / 180;
            for (const f of fracs) {
              const r = f * refR;
              if (r < rLo - 1e-6 || r > rHi + 1e-6) continue;
              const site: Pt = [Math.round(core[0] + Math.cos(th) * r), Math.round(core[1] + Math.sin(th) * r)];
              if (dist(site, core) < rLo || dist(site, core) > rHi) continue;
              if (!boxOk(site, "struct.ranged_defense", SK.siteR, false)) continue;
              if (!forestOk([[site, "struct.ranged_defense", SK.siteR]])) continue;
              // a ring tower never hides a pad already placed (the pad safety net would push it out of the ring to fix that)
              const shade = shadowTest("struct.ranged_defense", [site[0], site[1]]);
              if (shade && P.padPoints().some((q) => shade([q[0], q[1]]))) continue;
              P.add("probe@site", site, 0, { fp: "struct.ranged_defense" });
              let tp: Pt | null = null;
              for (const shade of [false, true]) {
                for (const dv of dirs) {
                  const dl = Math.hypot(dv[0], dv[1]);
                  const q: Pt = [Math.round(site[0] + (dv[0] / dl) * FR.padDepth), Math.round(site[1] + (dv[1] / dl) * FR.padDepth)];
                  if (boxOk(q, "pad", R.pad + S.margin, true) && forestOk([[site, "struct.ranged_defense", SK.siteR], [q, "pad", R.pad + S.margin]]) && (shade || !P.inShade(q))) { tp = q; break; }
                }
                if (tp) break;
              }
              P.stations.splice(P.stations.findIndex((x) => x.id === "probe@site"), 1);
              if (!tp) continue;
              clearTight(site, "struct.ranged_defense", SK.siteR);
              clearTight(tp, "pad", R.pad + S.margin);
              socket("r", site, tp, placed < FR.start ? 0 : Math.min(placed - FR.start + 1, nW0 - 1));
              placed++;
              done = true;
              break;
            }
          }
        }
        if (placed < FR.minSockets) fail(`no room for ${FR.minSockets} ring sockets around the reactor (found ${placed})`);
      };
      // A medic's pad (Doug): outside the wall, beside an attack gate, off its road.
      medicSpot = () => {
        const pm = P.pinAt("medic_hire");
        if (pm) return pm;
        const MP = GEN.medicPad;
        for (const { m, o, al } of gates) for (const sg of [1, -1]) {
          const q = find(m, al, o, [sg * MP.u, MP.v], "pad", R.pad + S.margin, false);
          if (q && dist(q, m) <= MP.near && !P.inShade(q)) return q;
        }
        return null;
      };
      // Scrap heaps out in the wilds beyond the wall, off the roads: the player scavenges them for the first
      // defences (Doug). Their own random stream, so the rest of the level never shifts.
      const SH = GEN.scrapHeaps, hr = new Rand(mix(inp.seed >>> 0, hashStr("scrapHeaps")));
      if (hr.float() < SH.chance) {
        const want = hr.int(SH.n[0], SH.n[1]), rr = ring.rect;
        const rFp = c.nodes["node.salvage_pile"]!.range;
        for (let k = 0, tries = 0; k < want && tries < 400; tries++) {
          // pass 2: the wavefront's scrap site (after the walls, within a gate's walking range)
          const hp = P.pinAt(`heap${k}`);
          const q: Pt = hp ?? [Math.round(lo[0] + hr.float() * (hi[0] - lo[0])), Math.round(lo[1] + hr.float() * (hi[1] - lo[1]))];
          if (!hp && pin) fail(`no wavefront site for heap${k}`);
          if (!hp && (rectDist(q, rr) < SH.outside || rectDist(q, rr) > SH.outside + SH.band)) continue;
          if (!hp && lanes.some(([a, b2]) => segDist(q, a, b2) < SH.roadGap)) continue;
          if (!hp && (!boxOk(q, "node.salvage_pile", rFp, false) || P.castsOnPad("node.salvage_pile", q))) continue;
          P.add(`heap${k}`, q, rFp, { fp: "node.salvage_pile" });
          ents.push({ type: "node.salvage_pile", at: [...q] });
          k++;
        }
      }
    }
    if (guards) {
      // Batch 3: the guard post stands from the start, so the first defence purchase is hiring guards.
      // away from the attack gates, where the turret sockets go
      const away = sides.reduce((v, sd) => [v[0] - (sd === "e" ? 1 : sd === "w" ? -1 : 0), v[1] - (sd === "s" ? 1 : sd === "n" ? -1 : 0)] as Pt, [0, 0] as Pt);
      const aw = Math.hypot(away[0], away[1]) || 1, bkDir: Pt = Math.hypot(away[0], away[1]) > 0 ? [away[0] / aw, away[1] / aw] : [-0.7, 0.7];
      const bk = placePad("barracks", [Math.round(core[0] + bkDir[0] * 110), Math.round(core[1] + bkDir[1] * 110)], { build: "struct.barracks", ...plotOpts("struct.barracks") });
      ents.push({ type: "struct.barracks", id: "barracks", at: [...bk] });
      const tr = plotOn ? slotAt("barracks", "staff") : placePad("train", [bk[0], bk[1] + 70]);
      pad({ type: "pad.hire", id: "train", at: [...tr], cost: { "res.salvage": salv("salvage.train") }, role: { role: "role.defender" }, repeatable: true });
      // Lv2 guard post: trains soldiers on its own at a steady beat (content struct.barracks troops)
      const bu = plotOn ? slotAt("barracks", "upgrade") : placePad("barracks_up", [bk[0] + 70, bk[1]]);
      pad({ type: "pad.build", id: "barracks_up", at: [...bu], cost: { "res.salvage": salv("salvage.barracksUp") }, build: "struct.barracks.t2", target: "barracks" });
    }
    if (feat.has("med_bay")) {
      const md = placePad("medic", [core[0] + 100, core[1] + 110], { build: "struct.medical" });
      pad({ type: "pad.build", id: "medic", at: [...md], cost: { "res.salvage": salv("salvage.medic") }, build: "struct.medical" });
    }
    if (guards) {
      // Guards fall at the gates: with no med bay near one, a medic can be hired there (the bots' rule, plan.ts).
      const bay = feat.has("med_bay") && has("medical") ? pads.find((p) => p.build === "struct.medical") : undefined;
      const gateMids = ringGates.map((i) => { const a = ring!.points[i]!, b = ring!.points[(i + 1) % ring!.points.length]!; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt; });
      if (!bay || !gateMids.some((g) => dist(bay.at as Pt, g) <= MEDIC_FAR_BAY)) {
        const q = medicSpot() ?? fail("no room for the medic's pad by a gate");
        P.add("medic_hire", q, R.pad, { fp: ["pad"] });
        pad({ type: "pad.hire", id: "medic_hire", at: [...q], cost: { "res.salvage": salv("salvage.hireMedic") }, role: { role: "role.medic" } });
        medicHire = true;
      }
    }

    ringSockets();
    const DW = GEN.defendWaves;
    const buyable = feat.has("turrets") || guards;
    // With defence to buy there are always two waves past the weak ones, so it has to carry some.
    const lateFrom = DW.lateFrom;
    const nW = Math.max(Math.round(K.waves), buyable ? lateFrom + 2 : 0);
    // The first raid lands within waveStartMax seconds (R3 playtest), except on a two-family level,
    // where a hauler or similar has to be set up before the player turns to defence.
    const t0 = K.firstWave + (wallsCurrency ? 25 : 0);
    const early = inp.secondary ? 0 : Math.max(0, t0 - GEN.waveStartMax);
    // R3 item 3: the first waves are weak, single-file raids the player shoots for scrap; from wave
    // `lateFrom` on (only where there is defence to buy) they grow fast and arrive packed, so the
    // towers and guards that scrap bought have to carry them.
    for (let k = 0; k < nW; k++) {
      const late = buyable && k >= lateFrom;
      const mult = k === 0 ? DW.firstShare : late ? 1 + DW.earlyGrowth * (lateFrom - 1) + DW.lateGrowth * (inp.secondary ? DW.finaleGrowthK : 1) * (k - lateFrom + 1) : 1 + DW.earlyGrowth * (k - 1);
      const counts: Record<string, number> = { "hostile.swarmling": Math.max(3, Math.round(K.swarm * mult)) };
      if (k >= 1) counts["hostile.raider_humanoid"] = Math.max(1, Math.round(K.swarm * (late ? DW.lateRaiders : DW.raiders) * k));
      if (feat.has("bosses") && (k === nW - 1 || (k === nW - 3 && nW >= 5))) counts["hostile.boss"] = 1;
      // Every wave hits one side, and the next wave moves on to the next attack side (Doug, 2026-10-18):
      // the guards rally to it and the player meets it there. The first wave (and the med bay's probe raid) is the first side's.
      const wSides = sides[k % sides.length]!;
      const w = { t: Math.round(t0 - early + k * K.waveGap), counts, side: wSides, gap: late ? DW.lateGap : DW.gap };
      waves.push(w);
      regular.add(w);
    }
    // Early salvage floor on wall-free levels (outpost-ops#208; both knobs default to 1 = off): a cheaper first tower, and more
    // attackers (so more scrap dropped) in the first waves.
    if (!wallsOn) {
      const FR = GEN.defendFree;
      const first = towers.find((t) => !(t.requires as { wave?: number } | undefined)?.wave);
      if (first && FR.firstTowerScale !== 1) { const cs = first.cost as Record<string, number>; cs["res.salvage"] = Math.max(1, Math.round(cs["res.salvage"]! * FR.firstTowerScale)); }
      if (FR.earlyDrops !== 1) for (const w of waves.slice(0, FR.earlyWaves)) w.counts["hostile.swarmling"] = Math.max(1, Math.round((w.counts["hostile.swarmling"] ?? 0) * FR.earlyDrops));
    }
    // The med bay needs patients: its dense probe raid comes through the breach on a quiet, unguarded
    // side before the player has the scrap to wall it, so some of it reaches the base.
    if (raidSide) {
      const R0 = DW.raid;
      waves.push({ t: Math.min(R0.t, waves[0]!.t), counts: { "hostile.swarmling": R0.swarmlings, ...(R0.raiders > 0 ? { "hostile.raider_humanoid": R0.raiders } : {}) }, side: raidSide, gap: R0.gap });
      waves.sort((a, b) => a.t - b.t);
    }
  }

  // ---------- housing ----------
  const housingPads: Ent[] = [];
  const perHousing = c.defaults["housing.perBuilding"]!;
  const housingOn = feat.has("housing") || goal === "rescue_housed";
  if (housingOn) {
    const newcomers = arrivals + pods;
    const nH = Math.max(1, Math.ceil(newcomers / perHousing));
    for (let k = 0; k < nH; k++) {
      const hp = placePad(`housing${k}`, [core[0] + (k % 2 === 0 ? 95 : -95), core[1] + 95 + 55 * Math.floor(k / 2)], { build: "struct.housing" });
      housingPads.push(pad({ type: "pad.build", id: `housing${k}`, at: [...hp], cost: { "res.currency": cost("housing") + 3 * k }, build: "struct.housing" }));
    }
  }

  // ---------- landmark (industrialize build goal) ----------
  let landmark: Ent | null = null;
  if (goal === "build") {
    const lp = placePad("landmark", ring ? [core[0], inner[1] + 50] : tpl.landmark, { big: true, build: "struct.landmark" });
    landmark = pad({ type: "pad.build", id: "landmark", at: [...lp], cost: { "res.currency": 40 }, build: "struct.landmark", big: true });
  }

  // pass 2: every pad the wavefront placed stands on its own point (a build pad's building on its site); none may stand on a spot
  // the player or a worker stands on to act (register, pile, line, converter spots, the gate's admit spot)
  if (pin) for (const e of pads) {
    const q = pin.pads.get(String(e.id));
    if (!q) continue;
    e.at = [...q.at];
    if (q.site) e.site = [...q.site];
    const sp = P.spots.find((x) => x.id !== "start" && dist(q.at, [x.x, x.y]) < R.pad + x.r - 8);
    if (sp) fail(`pad ${String(e.id)} on the ${sp.id} spot`);
    // key pads stay within a screen of the core (the rater's offscreen rule)
    if (dist(q.at, core) > S.screenRadius) fail(`pad ${String(e.id)} off screen`);
  }
  for (const s of P.stations) if (s.id !== "core" && dist([s.x, s.y], startPt) < s.r + 4) fail(`start overlaps ${s.id}`);

  // ---------- goal ----------
  const params0 = (): Record<string, number | string> => {
    switch (goal) {
      case "heat_hold": return { pct: Math.round(K.heatPct / 5) * 5, seconds: Math.round(K.length * 0.45 / 5) * 5 };
      case "fuel_full": return { seconds: 60 };
      // On defend levels the hold lasts through the wave before the last, so the bought defence is tested.
      case "survive": return { seconds: Math.round(Math.max(K.length, defend && waves.length >= 2 ? waves[waves.length - 2]!.t + GEN.defendWaves.surviveTail : 0) / 10) * 10 };
      case "hazard_survive": return {};
      case "population": return { n: 0 };
      case "build_count": return { build: "struct.housing", n: housingPads.length };
      case "core_level": return { n: 1 + corePads.length };
      case "admit": return { n: arrivals };
      case "clear_zones": return { n: Math.max(1, zones) };
      case "house_all": return {};
      case "rescue": return { n: pods };
      case "rescue_all": return {};
      case "tow_trip": return { n: Math.min(3, pods + crates) };
      case "rescue_before_freeze": return { n: Math.max(1, pods - (K.pods < 4 && !feat.has("clearing_pass") ? 1 : 0)) };
      case "rescue_housed": return { n: pods };
      case "tow_full_trip": return { n: Math.min(3, pods + crates) };
      case "crates": return { n: crates };
      case "sell": return { res: "res.food_raw_1", n: 10 };
      case "sell_each": return { n: 3, k: Math.min(2, sells.length) };
      case "unlock": return { n: gated };
      case "shelves_full": return {};
      // defend: more guards than the first purchase, so the level runs on into the waves
      case "hire": return fam === "defend" ? { n: 4, role: "role.defender" } : { n: 2 };
      case "earn_within": return { n: 20, seconds: Math.round(K.length) };
      case "bulk_order": return { n: 1 };
      case "produce": return { n: 10, res: alloy ? "res.component" : "res.food_prepared" };
      case "converters_running": return { k: 2, seconds: Math.round(8 + K.length * 0.05) };
      case "chain": return { n: 3 };
      // machines: the hands-off clock only runs while this many converters do (the grill, plus the smelter when built)
      case "automate": return { seconds: Math.round(20 + K.length * 0.1), machines: Math.min(2, 1 + (saw ? 1 : 0)) };
      case "stockpile": return { res: "res.material_basic", n: 8 };
      case "build": return { target: "landmark" };
      case "converter_level": return { n: 2 };
      case "waves": return {};
      case "waves_survived": return { n: Math.max(1, waves.length - 1) };
      case "boss": return { n: waves.reduce((a, w) => a + (w.counts["hostile.boss"] ?? 0), 0) };
      case "turret_level": return { n: 3 };
      case "perimeter_before_wave1": return {};
      default: return { n: 5 };
    }
  };
  const gparams = params0();
  if (goal === "hire" && fam !== "defend") gparams["n"] = Math.max(2, pads.filter((p) => p.type === "pad.hire").length);
  const sizing: Sizing = RATE_GOALS.has(goal) ? "rate" : FILL_GOALS.has(goal) ? "fill" : goal === "build" ? "cost" : "fixed";

  // People: idle residents for every hire the plan will buy, plus spares; colonists to defend.
  const people: { role: string }[] = [];
  const events: { type: string; warnAt: number; start: number; end: number }[] = [];
  const startCurrency = goal === "perimeter_before_wave1" ? 6 : Math.round(K.startCurrency);

  // the level's defence price growth (pads.defenceGrowth): eased below defendRoad.priceGrowth when the drops cannot pay for the full ladder
  let defGrowth = GEN.defendRoad.priceGrowth;
  const finish = (landmarkCost: number, refined: number, extraPeople: number): Manifest => {
    const ps: Ent[] = pads.map((p) => structuredClone(p));
    if (landmark) ps.find((p) => p.id === "landmark")!.cost = { "res.currency": landmarkCost, ...(refined > 0 ? { "res.material_refined": refined } : {}) };
    const pp = [...people.map((p) => ({ ...p })), ...Array.from({ length: extraPeople }, () => ({ role: "idle" }))];
    const nPeople = pp.length;
    const base = housingOn ? Math.max(1, nPeople) : nPeople + arrivals + pods + 2;
    const params: Record<string, number> = {
      "start.currency": startCurrency,
      "core.burn": round1(K.burn),
      "housing.base": Math.max(1, base),
      // the renderer paves the lots in use and the streets between them
      "lots.block": GEN.lots.block, "lots.street": GEN.lots.street,
    };
    if (shopAt) {
      params["customers.spawn"] = round1(K.spawn);
      if (clerkSide !== 0) params["sales.clerkSide"] = clerkSide;
      params["customers.orderMin"] = 1;
      params["customers.orderMax"] = Math.round(K.orderMax);
    }
    if (has("customer_variety")) { params["customers.impatientShare"] = round2(K.impatient); params["customers.premiumShare"] = round2(K.premium); }
    if (feat.has("bulk_orders")) params["customers.bulkShare"] = round2(K.bulkShare);
    if (defend) { params["meters.baseHealth"] = Math.round(K.baseHealth); params["pads.defenceGrowth"] = defGrowth; }
    const gp = { ...gparams };
    if (goal === "population") gp["n"] = nPeople + arrivals + pods;
    const g = { type: goal, ...gp } as Manifest["goal"];
    const ch = CHALLENGE_PLACEHOLDER[fam];
    const m = {
      id: inp.id, seed: inp.seed >>> 0, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION,
      map: { w: 480, h: 900, zones: [...tpl.zones] },
      modules: [...inp.modules].filter((m) => m !== "conveyors" || feat.has("conveyors")).sort(),
      start: [...startPt],
      entities: [...ents, ...ps],
      people: pp,
      waves: structuredClone(waves), events: structuredClone(events),
      params, goal: g,
      family: fam,
      objectives: [
        { id: "main", kind: goal, params: gp },
        { id: "time", kind: "time_target", params: { seconds: 900 } },
        { id: "challenge", kind: ch.kind, params: { ...ch.params } },
      ],
      fail: defend ? ["meter.lifeline", "meter.base_health"] : ["meter.lifeline"],
      text: {},
    } as unknown as Manifest;
    return m;
  };

  // Hopper flats stay within zones.preyReach of the walls (a fixed design setting): a flat further out slides
  // toward the wall box until it is in reach. Levels without walls keep their template flats.
  {
    const reach = c.defaults["zones.preyReach"]!;
    const wallPts = ents.filter((e) => e.type === "barrier.line").flatMap((e) => e["points"] as Pt[]);
    if (wallPts.length > 0) {
      const wx0 = Math.min(...wallPts.map((q) => q[0])), wx1 = Math.max(...wallPts.map((q) => q[0]));
      const wy0 = Math.min(...wallPts.map((q) => q[1])), wy1 = Math.max(...wallPts.map((q) => q[1]));
      for (const e of ents) if (e.type === "zone.prey" && Array.isArray(e["rect"])) {
        const r = e["rect"] as number[];
        const gx = Math.max(wx0 - (r[0]! + r[2]!), r[0]! - wx1, 0), gy = Math.max(wy0 - (r[1]! + r[3]!), r[1]! - wy1, 0);
        if (Math.max(gx, gy) <= reach) continue;
        if (gx > reach) r[0] = r[0]! + (r[0]! > wx1 ? -(gx - reach) : gx - reach);
        if (gy > reach) r[1] = r[1]! + (r[1]! > wy1 ? -(gy - reach) : gy - reach);
      }
    }
  }

  // ---------- geography (R3 item 17): impassable ridges, outcrops and chasms on some levels ----------
  // Placed last so every station is where it would be without terrain; its own random stream leaves other draws alone.
  {
    const walkPoints: Pt[] = ents.flatMap((e) => (/^(node|conv|sink|struct)\./.test(e.type) && Array.isArray(e["at"]) ? [[(e["at"] as number[])[0]!, (e["at"] as number[])[1]!] as Pt] : []));
    const pieces = placeTerrain({
      rand: new Rand(mix(inp.seed >>> 0, hashStr("terrain") ^ Math.imul(layoutSalt + 1, 0x9e3779b1))), P, T: GEN.terrain,
      families: [fam, ...(inp.secondary ? [inp.secondary] : [])], defend, core, start: startPt, ring: ring ? ring.rect : null, attackSides: sides, lanes,
      walkPoints, shop: shopAt ? { queue, edgeRight: shopAt[0] * 2 >= 480 } : null,
    });
    for (const t of pieces) ents.push({ type: "zone.terrain", id: t.id, kind: t.kind, rect: [...t.rect] });
    if (pieces.length > 0) notes.push(`terrain ${pieces.map((t) => t.kind).join(",")}`);
  }

  // Ranger (plot plan Q6; Doug, 2026-11-07): on a hunting level that sells the catch, a hunter hire pad inside the
  // hunting grounds (off the opening view, so not a key pad), clear of their burrow models. Failing that, just inside the gate nearest them, or with no wall
  // on the settlement's edge facing them. Manual first like every first hire.
  if (feat.has("hunting") && shopAt) {
    const zones = ents.filter((e) => e.type === "zone.prey");
    const zr = zones[0]?.["rect"] as number[] | undefined;
    const catchRes = Object.keys(c.animals["node.prey"]!.drops).some((r) => sells.includes(r));
    if (zr && catchRes) {
      const T: Pt = [zr[0]! + zr[2]! / 2, zr[1]! + zr[3]! / 2];
      // The 3D renderer's burrows in each prey zone (renderer.ts syncZones: same count and spots), as boxes in map units.
      const burrows: Box[] = zones.flatMap((z) => {
        const [x, y, w, h] = z["rect"] as number[] as [number, number, number, number], id = String(z["id"]);
        const n = Math.max(2, Math.min(3, Math.round((w * h) / (GEN.ranger.artM * GEN.ranger.artM * 40))));
        return Array.from({ length: n }, (_, k): Box => {
          const half = GEN.ranger.burrowHalf[k % 2]!, hx = Math.min(w / 2, half[0] * GEN.ranger.artM), hz = Math.min(h / 2, half[1] * GEN.ranger.artM);
          const fx = 0.2 + 0.6 * (((k + 1) * 0.618 + id.length * 0.13) % 1), fz = 0.25 + 0.5 * ((k * 0.382 + 0.31) % 1);
          const cx = Math.min(x + w - hx, Math.max(x + hx, x + w * fx)), cz = Math.min(y + h - hz, Math.max(y + hz, y + h * fz));
          return [cx - hx, cz - hz, cx + hx, cz + hz];
        });
      });
      const clearOfBurrows = (p: Pt): boolean => {
        const pb = P.box(p, "pad")!, g = GEN.ranger.gap;
        return burrows.every((u) => !(pb[0] < u[2] + g && u[0] < pb[2] + g && pb[1] < u[3] + g && u[1] < pb[3] + g));
      };
      // The grounds usually lie outside the wall, past the placer's bounds: search them on a grid, with the placer's own
      // clearances (walls, stations, spots) and the map edge, nearest the middle of the grounds first.
      const inZone: Pt[] = [];
      for (let yy = zr[1]!; yy <= zr[1]! + zr[3]!; yy += 3) for (let xx = zr[0]!; xx <= zr[0]! + zr[2]!; xx += 3) inZone.push([xx, yy]);
      inZone.sort((a, b) => dist(a, T) - dist(b, T) || a[1] - b[1] || a[0] - b[0]);
      const pb0 = P.box([0, 0], "pad")!;
      let rp: Pt | null = inZone.find((q) => q[0] + pb0[0] >= 0 && q[0] + pb0[2] <= 480 && q[1] + pb0[1] >= 0 && q[1] + pb0[3] <= 900
        && clearOfBurrows(q) && P.walls.every((w) => segDist(q, w[0], w[1]) >= R.pad + 10)
        && P.stations.every((st) => dist(q, [st.x, st.y]) >= Math.max(R.pad, st.r) + P.margin)
        && P.spots.every((sp) => dist(q, [sp.x, sp.y]) >= R.pad + sp.r)) ?? null;
      if (rp) P.add("ranger", rp, R.pad, { fp: ["pad"] });
      if (!rp) {
        let near: Pt;
        if (ring && ringGates.length > 0) {
          const pts = ring.points;
          const mids = ringGates.map((i): Pt => { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
          const g = mids.reduce((a, b) => (dist(b, T) < dist(a, T) ? b : a));
          near = toward(g, core, Math.min(0.5, 30 / Math.max(1, dist(g, core))));
        } else {
          const dT = dist(core, T);
          const edge = P.stations.filter((st) => st.key && dist([st.x, st.y], core) < dT).reduce((m, st) => Math.max(m, dist([st.x, st.y], core) + st.r), 0);
          near = toward(core, T, Math.min(edge + 25, Math.max(0, dT - 40)) / Math.max(1, dT));
        }
        rp = P.place("ranger", R.pad, ring ? inner : [near[0] - 70, near[1] - 70, 140, 140], { near, key: true, fp: ["pad"], samples: 600 });
        if (rp) notes.push("ranger pad outside the hunting grounds (no clear spot inside)");
      }
      if (rp) pad({ type: "pad.hire", id: "ranger", at: [...rp], cost: { "res.currency": cost("hire.hunter") }, role: { role: "role.hunter", from: "node.prey", to: "sink.sales_point" } });
      else notes.push("no room for the ranger pad");
    }
  }

  // Traders walk in from the map edge around every building and through a gate (sim sales.ts).
  if (shopAt) {
    const RT = GEN.traderRoute;
    const solid: Box[] = P.stations.flatMap((s) => (s.solid && s.fp && s.id !== "shop" ? [s.fp] : []));
    for (const e of ents) if ((e.type === "zone.terrain" || e.type === "zone.blocked") && Array.isArray(e["rect"])) {
      const r = e["rect"] as number[];
      solid.push([r[0]!, r[1]!, r[0]! + r[2]!, r[1]! + r[3]!]);
    }
    const walls = ents.filter((e) => e.type === "barrier.line").flatMap((e) => {
      const pts = e["points"] as Pt[], gates = new Set(e["gates"] as number[]);
      return pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length]!, gate: gates.has(i) }));
    });
    if (plotOn && queue.length > 1) {
      // Plot plan: the first square is the kiosk's; the rest of the line starts straight on and bends round
      // anything in the way (buildings, pads, spots, walls, terrain), turning as little as it can.
      const shopBox = P.box(shopAt, "sink.sales_point")!;
      const free = (q: Pt, prev: Pt, placed: Pt[]): boolean => {
        if (q[0] < 14 || q[0] > 466 || q[1] < 14 || q[1] > 886 || (ring && !inRect(q, inner))) return false;
        const mid: Pt = [(q[0] + prev[0]) / 2, (q[1] + prev[1]) / 2];
        for (const b of [...solid, shopBox]) for (const x of [q, mid]) if (x[0] > b[0] - 8 && x[0] < b[2] + 8 && x[1] > b[1] - 8 && x[1] < b[3] + 8) return false;
        if (walls.some((w) => segDist(q, w.a, w.b) < 12 || segDist(mid, w.a, w.b) < 12)) return false;
        if (P.stations.some((st) => st.id !== "shop" && dist(q, [st.x, st.y]) < st.r + 10)) return false;
        if (P.spots.some((sp) => sp.id !== "start" && !sp.id.startsWith("queue") && dist(q, [sp.x, sp.y]) < sp.r + 10)) return false;
        return placed.every((o) => dist(q, o) >= 0.8 * dist(queue[0]!, queue[1]!));
      };
      const L = dist(queue[0]!, queue[1]!);
      let ang = Math.atan2(queue[1]![1] - queue[0]![1], queue[1]![0] - queue[0]![0]);
      const bent: Pt[] = [queue[0]!];
      for (let k = 1; k < queue.length; k++) {
        const prev = bent[k - 1]!;
        let next: Pt | null = null;
        for (const turn of [0, 45, -45, 90, -90, 135, -135]) {
          const a = ang + (turn * Math.PI) / 180, q: Pt = [Math.round(prev[0] + Math.cos(a) * L), Math.round(prev[1] + Math.sin(a) * L)];
          if (free(q, prev, bent)) { next = q; ang = a; break; }
        }
        // boxed in: the rest of the line stands straight on, as before the plot layout
        if (!next) { for (let j = k; j < queue.length; j++) bent.push([Math.round(prev[0] + Math.cos(ang) * L * (j - k + 1)), Math.round(prev[1] + Math.sin(ang) * L * (j - k + 1))]); break; }
        bent.push(next);
      }
      queue = bent;
      ents.find((e) => e.id === "shop")!["queue"] = bent.map((q) => [...q]);
    }
    // the route ends on the last queue slot (clear of every wall), so the walk along the line stays inside
    // (plot layout: the line bends round whatever stands there, so the route only has to reach one of its squares)
    const world = { w: 480, h: 900, solid: [...solid, P.box(shopAt, "sink.sales_point")!], walls, clear: RT.clear, door: RT.door, cell: RT.cell };
    const route = plotOn ? queue.reduce<ReturnType<typeof traderRoute>>((got, q) => got ?? traderRoute(world, q), null)
      : traderRoute(world, queue[queue.length - 1]!);
    if (!route) fail("no trader route from the map edge to the line");
    ents.find((e) => e.id === "shop")!["route"] = route;
  }

  // Hazards: dust storms at fractions of the estimated length.
  if (feat.has("dust_storms")) {
    const T = Math.max(70, K.length);
    const n = goal === "hazard_survive" && K.length > 150 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const start = Math.round(T * (n === 1 ? 0.4 : 0.3 + 0.4 * k));
      events.push({ type: "event.hazard", warnAt: Math.max(0, start - GEN.storms.warn), start, end: start + GEN.storms.duration });
    }
  }

  // Draft plan: chain unplanned pads off an anchor (a pad certainly on the plan) through requires.pad.
  const draftPeople = workers ? 6 : feat.has("gate_arrivals") || housingOn ? 2 : defend ? 3 : 0;
  let draft = finish(40, saw && !alloy ? 6 : 0, draftPeople);
  let plan0 = planBot(draft, c);
  const planned = () => new Set(plan0.steps.filter((s) => s.when === "always").map((s) => s.pad));
  // Medical waits for injuries; housing pads wait for recruits unless the goal ends first (then they are chained).
  // ...and an input worker the belt can withdraw (plot plan Q7) is the player's alternative, off the bot's plan.
  const conditional = (p: Ent) => p.build === "struct.medical" || (p.role as { role?: string } | undefined)?.role === "role.medic" || !!p.dropWhen;
  // Pads the plan would only reach after the goal is done count as unplanned too: the level ends at the goal.
  const lastGoal = plan0.steps.map((s, i) => (s.goalPath && s.when === "always" ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  const late = lastGoal >= 0 ? new Set(plan0.steps.filter((s, i) => i > lastGoal && s.when === "always").map((s) => s.pad)) : new Set<string>();
  // The defence ladder (sockets, their levels, guards) is bought all through the level, never chained to the goal.
  const ladder = (p: Ent) => String(p.build ?? "").startsWith("struct.ranged_defense") || p.build === "struct.barracks.t2" || (p.type === "pad.hire" && (p.role as { role: string }).role === "role.defender");
  const unplanned = pads.filter((p) => (!planned().has(String(p.id)) || (late.has(String(p.id)) && !ladder(p))) && !conditional(p));
  if (unplanned.length > 0) {
    const steps = plan0.steps.filter((s) => s.when === "always");
    const anchorStep = [...steps].reverse().find((s) => s.goalPath) ?? steps[steps.length - 1];
    // Without an anchor, housing pads stay conditional (bought once recruits wait); anything else fails.
    if (!anchorStep && unplanned.some((p) => p.build !== "struct.housing")) fail("no anchor for the unplanned pads");
    const byId = (id: string) => pads.find((p) => p.id === id)!;
    const root = (e: Ent): Ent => { let x = e; for (let i = 0; i < 10; i++) { const r = (x.requires as { pad?: string } | undefined)?.pad; if (!r) break; x = byId(r); } return x; };
    const chainOf = (e: Ent): Set<string> => { const out = new Set<string>(); let x: Ent | undefined = e; for (let i = 0; i < 10 && x; i++) { out.add(String(x.id)); const r: string | undefined = (x.requires as { pad?: string } | undefined)?.pad; x = r ? byId(r) : undefined; } return out; };
    for (const u of anchorStep ? unplanned : []) {
      if (planned().has(String(u.id)) && !late.has(String(u.id))) continue;
      // A repeatable pad is never "done", so nothing may require it.
      if (u.repeatable) continue;
      // The anchor: the last goal-path step (else the last step) that does not itself depend on u.
      const ch0 = chainOf(u);
      const all = plan0.steps.filter((x) => x.when === "always");
      const pick = [...all].reverse().find((x) => x.goalPath && !ch0.has(x.pad) && x.repeat === 1) ?? [...all].reverse().find((x) => !ch0.has(x.pad) && x.repeat === 1);
      if (!pick) continue;
      const a = byId(pick.pad);
      const prevReq = (a.requires as { pad?: string } | undefined)?.pad;
      const ch = chainOf(u);
      if (ch.has(String(a.id))) continue;
      const r = root(u);
      // Any edit that would close a requirement loop is undone and u is left for the checks below.
      const snapshot = pads.map((p) => (p.requires ? { ...(p.requires as object) } : undefined));
      const loops = () => pads.some((p) => { let x: Ent | undefined = p; for (let i = 0; i <= pads.length && x; i++) { const q: string | undefined = (x.requires as { pad?: string } | undefined)?.pad; x = q ? byId(q) : undefined; if (x === p) return true; } return false; });
      const revert = () => pads.forEach((p, i) => { if (snapshot[i]) p.requires = snapshot[i]; else delete p.requires; });
      if (prevReq && !ch.has(prevReq)) {
        // The anchor's chain and u's chain may share a pad (two hires both needing the depot): splice u in
        // just above the shared pad, so the requirement chain stays a single line.
        const pc: string[] = []; let x: Ent | undefined = byId(prevReq);
        for (let i = 0; i < 12 && x; i++) { pc.push(String(x.id)); const q: string | undefined = (x.requires as { pad?: string } | undefined)?.pad; x = q ? byId(q) : undefined; }
        const common = pc.findIndex((id) => ch.has(id));
        if (common > 0) {
          const above = byId(pc[common - 1]!);
          above.requires = { ...((above.requires as object) ?? {}), pad: String(u.id) };
          if (loops()) { revert(); continue; }
          draft = finish(40, saw && !alloy ? 6 : 0, draftPeople);
          plan0 = planBot(draft, c);
          continue;
        }
        if (common < 0) r.requires = { ...((r.requires as object) ?? {}), pad: prevReq };
      }
      a.requires = { ...((a.requires as object) ?? {}), pad: String(u.id) };
      if (loops()) { revert(); continue; }
      draft = finish(40, saw && !alloy ? 6 : 0, draftPeople);
      plan0 = planBot(draft, c);
    }
    const still = pads.filter((p) => !planned().has(String(p.id)) && !conditional(p) && !(p.build === "struct.housing" && !anchorStep) && !p.repeatable);
    if (still.length > 0) fail(`pads off the plan: ${still.map((p) => p.id).join(",")}`);
  }
  // Guard training opens with the guard post, not at the end of the defence chain (R3 playtest).
  {
    const train = pads.find((p) => p.id === "train"), bk = pads.find((p) => p.id === "barracks");
    if (train && bk) train.requires = { ...((train.requires as object) ?? {}), pad: "barracks" };
  }
  // Manual first (docs/ECONOMY-PLAN.md): the first hire pad of each job kind waits until the player has
  // done that job by hand; later pads of the same kind do not. Couriers have no hand-done job.
  {
    const seen = new Set<string>();
    for (const p of pads) {
      if (p.type !== "pad.hire") continue;
      const r = p.role as { role: string; from?: string; to?: string };
      const beh = c.roles[r.role]?.behavior;
      const job = beh === "gather_deliver" || beh === "collect_deliver" ? (r.from && r.to ? `carry:${r.from}>${r.to}` : null)
        : beh === "stand_at" ? (r.to?.startsWith("conv.") ? `operate:${r.to}` : "clerk")
          : beh === "hunt" ? "hunt" : beh === "guard" ? "guard" : null;
      if (!job || seen.has(job)) continue;
      seen.add(job);
      p.manual = true;
    }
  }
  // The plan must be buyable in order: every requirement met by an earlier step (no requirement loops).
  {
    const done = new Set<string>(m0People(people));
    let level = 1;
    for (const st of plan0.steps.filter((x) => x.when === "always")) {
      const e = pads.find((p) => p.id === st.pad)!;
      const req = e.requires as { pad?: string; orPad?: string; coreLevel?: number } | undefined;
      if (req?.pad && !done.has(req.pad) && !(req.orPad && done.has(req.orPad))) fail(`plan order: ${st.pad} needs ${req.pad} first (${plan0.steps.map((x) => x.pad + "<" + ((pads.find((p) => p.id === x.pad)?.requires as { pad?: string } | undefined)?.pad ?? "")).join(" ")})`);
      if (req?.coreLevel && level < req.coreLevel) fail(`plan order: ${st.pad} needs core level ${req.coreLevel}`);
      done.add(st.pad);
      if (e.build === "sink.core.level") level++;
    }
  }
  // Nothing staffs, feeds or upgrades a machine before it stands: its build pad must be up the requires chain.
  {
    const byId = new Map(pads.map((p) => [String(p.id), p]));
    const upChain = (p: Ent): Set<string> => {
      const out = new Set<string>();
      for (let x: Ent | undefined = p, i = 0; x && i <= pads.length; i++) {
        const q = (x.requires as { pad?: string } | undefined)?.pad;
        if (!q) break;
        out.add(q);
        x = byId.get(q);
      }
      return out;
    };
    for (const p of pads) {
      if (typeof p.build === "string" && /\.t\d$/.test(p.build) && p.target && byId.has(String(p.target)) && !upChain(p).has(String(p.target))) fail(`pad order: ${String(p.id)} upgrades ${String(p.target)} before it builds`);
      const role = p.role as { from?: string; to?: string } | undefined;
      const machines = [role?.from, role?.to].filter((t): t is string => !!t?.startsWith("conv."));
      const needs = pads.filter((b) => machines.includes(String(b.build))).map((b) => String(b.id));
      if (p.build === "conv.level" && p.target) needs.push(String(p.target));
      const up = upChain(p);
      for (const n of needs) if (!up.has(n)) fail(`pad order: ${String(p.id)} works a machine before ${n} builds it`);
    }
  }

  // People from the plan: one idle resident per hire step (repeats included), plus spares.
  const hires = plan0.steps.filter((s) => s.kind === "hire" && s.when === "always").reduce((a, s) => a + s.repeat, 0);
  let extra = hires > 0 ? hires + Math.round(K.spareIdle) : 0;
  if (guards) extra = Math.max(extra, 2 + Math.round(K.spareIdle) + (goal === "hire" ? Number(gparams["n"] ?? 2) : 0));
  if (defend) extra = Math.max(extra, 3);
  // Injuries need colonists who are not defenders, or the med bay never has a patient.
  if (feat.has("med_bay") && guards) extra += 2;
  // The medic is a colonist too.
  if (medicHire) extra += 1;
  // Injured colonists cannot be trained, so a train-N goal keeps a few spare.
  if (goal === "hire" && fam === "defend") extra += 3;

  // The scrap economy must pay for the defense (generator.json defendWaves).
  if (defend && waves.length > 0) {
    // Batch 3: the waves are sized against the purchase ladder. Their scrap must buy its core (the walls,
    // the first guards, a tower on every socket standing from the start, and anything else the plan spends
    // scrap on); tower levels, more guards and the sockets that open later are the surplus left to build.
    const salvOf = (id: string) => ((pads.find((p) => p.id === id)?.cost as Record<string, number> | undefined)?.["res.salvage"] ?? 0);
    const ladderStep = (id: string) => { const p = pads.find((q) => q.id === id); return !!p && (String(p.build ?? "").startsWith("struct.ranged_defense") || p.id === "train"); };
    // bought in the bot's order (the first guards, then the open towers), each at the price the purchases before it raised (pads.defenceGrowth)
    const open = towers.filter((t) => !(t.requires as { wave?: number } | undefined)?.wave);
    const order = [...(pads.some((p) => p.id === "train") ? Array(FIRST_GUARDS).fill("train") : []), ...open.map((t) => String(t.id))] as string[];
    const coreLadder = order.reduce((a, id, k) => a + Math.ceil(salvOf(id) * GEN.defendRoad.priceGrowth ** k), 0);
    const need = plan0.steps.filter((x) => x.when === "always" && !ladderStep(x.pad)).reduce((a, x) => a + (x.cost["res.salvage"] ?? 0) * x.repeat, 0)
      + plan0.barriers.reduce((a, b) => a + (b.res === "res.salvage" ? b.cost : 0), 0)
      + pads.filter((p) => p.build === "struct.medical").reduce((a, p) => a + ((p.cost as Record<string, number>)["res.salvage"] ?? 0), 0)
      + coreLadder;
    const dropsOf = (ws: typeof waves) => ws.reduce((a, w) => a + Object.entries(w.counts).reduce((b, [h, n]) => b + n * (c.hostiles[h]?.drops["res.salvage"] ?? 0), 0), 0);
    const grow = (ws: typeof waves) => { for (const w of ws) if (regular.has(w)) w.counts["hostile.swarmling"] = Math.ceil((w.counts["hostile.swarmling"] ?? 0) * 1.25); };
    const DW = GEN.defendWaves;
    // The weak early raids must pay for the walls and one tower per attack side before the packed
    // waves arrive (R3 item 3: fighting buys the defence that carries the rest).
    const firstLate = waves.findIndex((w) => regular.has(w) && w.gap === DW.lateGap && w !== waves[0]);
    if (firstLate > 0) {
      const early = plan0.barriers.reduce((a, b) => a + (b.res === "res.salvage" ? b.cost : 0), 0)
        + sides.reduce((a, sd) => a + salvOf(`tower_${sd}1`), 0) + FIRST_GUARDS * salvOf("train");
      for (let k = 0; k < 12 && dropsOf(waves.slice(0, firstLate)) < early * DW.dropsPerEarlyNeed; k++) grow(waves.slice(0, firstLate));
    }
    // Drops of the last wave come too late to spend (the level runs to it on every goal since Batch 3), so
    // only the earlier waves count; the packed waves grow together (the early raids keep the size the walls
    // and first purchases need, the med bay's fixed raid stays as it is), keeping their shape.
    const spendable = () => waves.slice(0, -1);
    const growing = firstLate > 0 ? waves.slice(firstLate) : waves;
    for (let k = 0; k < 12 && dropsOf(spendable()) < need * DW.dropsPerNeed; k++) grow(growing);
    // R5: the attackers pay for every upgrade and purchase on the level, not only the ladder's core.
    const walls = plan0.barriers.reduce((a, b) => a + (b.res === "res.salvage" ? b.cost : 0), 0);
    const guardsN = Math.max(FIRST_GUARDS, goal === "hire" ? Number(gparams["n"] ?? 0) : 0);
    const fullAt = (g: number) => scrapNeed(pads, walls, guardsN, g, c);
    // Grown early raids must not outsize the packed waves after them: each of those stays lateStep bigger.
    const shape = () => {
      let prev = 0;
      for (const w of waves) {
        if (!regular.has(w)) continue;
        const n = w.counts["hostile.swarmling"] ?? 0;
        if (w.gap === DW.lateGap && n < prev * DW.lateStep) w.counts["hostile.swarmling"] = Math.ceil(prev * DW.lateStep);
        prev = w.counts["hostile.swarmling"] ?? 0;
      }
    };
    shape();
    // A wave's attackers arrive one by one, and a bigger wave has to finish arriving in time to be cleared: it grows
    // only as far as spawnMax seconds at the tightest gap, and its gap tightens to fit.
    const size = (w: (typeof waves)[number]) => Object.values(w.counts).reduce((a, n) => a + n, 0);
    const room = () => Math.max(...waves.filter((w) => regular.has(w)).map(size)) * 1.25 * DW.minGap <= DW.spawnMax
      && Math.max(...waves.filter((w) => regular.has(w)).map((w) => wavePoints(w.counts, c))) < DW.maxPoints;
    for (let k = 0; k < DW.fullGrowMax && waveScrap(waves, c) < fullAt(defGrowth) && room(); k++) { grow(growing); shape(); }
    capWavePoints(waves, c, DW.maxPoints);
    if (splitWaves(waves, regular, c, { cap: DW.waveCap, lateGap: DW.lateGap, spacing: K.waveGap * DW.lateWaveGap, minSpacing: DW.lateWaveMin, spawnMax: DW.spawnMax, sides, bosses: feat.has("bosses") })
      && (goal === "survive" || goal === "waves_survived" || goal === "boss")) Object.assign(gparams, params0());
    for (const w of waves) if (regular.has(w) && size(w) * w.gap! > DW.spawnMax) w.gap = Math.max(DW.minGap, Math.floor((DW.spawnMax / size(w)) * 100) / 100);
    // Waves alone would take thousands of attackers (rising prices make the full ladder several times its base
    // price): what they cannot pay within spawnMax, the level's price growth eases to cover, and only then its scrap prices.
    const drops = waveScrap(waves, c);
    while (defGrowth > 1 && fullAt(defGrowth) > drops) defGrowth = Math.max(1, Math.round((defGrowth - DW.growthStep) * 1000) / 1000);
    for (let k = 0; k < 8 && fullAt(defGrowth) > drops; k++) {
      const f = (drops / fullAt(defGrowth)) * 0.98;
      for (const p of pads) {
        const cs = p.cost as Record<string, number> | undefined;
        if (cs?.["res.salvage"]) cs["res.salvage"] = Math.max(1, Math.floor(cs["res.salvage"] * f));
      }
    }
    if (drops < fullAt(defGrowth)) fail(`scrap budget: waves drop ${drops} of ${fullAt(defGrowth)}`);
  }
  if ((feat.has("gate_arrivals") || housingOn) && !workers) extra = Math.max(extra, 2);

  // ---------- economy sizing ----------
  const evalCost = (cst: number) => {
    const m = finish(cst, saw && !alloy ? 12 : 0, extra);
    return { m, f: flowModel(m, planBot(m, c), c, 1e9) };
  };
  let chosen = evalCost(40);
  if (sizing === "cost") {
    let lo = 10, hi = 400;
    for (let i = 0; i < 12; i++) {
      const mid = Math.round((lo + hi) / 2);
      if (evalCost(mid).f.T < K.length) lo = mid; else hi = mid;
    }
    chosen = evalCost(Math.max(15, lo));
  }
  const m = chosen.m;
  const waveEnd = waves.length > 0 ? waves[waves.length - 1]!.t : 0;
  const evEnd = events.reduce((a, e) => Math.max(a, e.end), 0);
  const fixedEnd = Math.max(waveEnd, evEnd, goal === "survive" ? Number(gparams["seconds"]) : 0);
  m.params["level.budgetSeconds"] = timeTarget(Math.min(900, Math.max(90, Math.round(Math.max(fixedEnd + 60, chosen.f.T / (1 - K.margin)) / 10) * 10)), 10);
  const flow = flowModel(m, planBot(m, c), c, m.params["level.budgetSeconds"]!);
  if (!flow.ok) fail(`flow: ${flow.reason}`);
  void register;
  for (const e of ents) {
    if (e.type !== "zone.blocked" || !String(e.id).startsWith("rubble")) continue;
    const r = e.rect as Rect, kinds = new Set(GEN.rockslide.rewards.map((w) => w.node));
    if (!ents.some((n) => kinds.has(n.type) && (n.at as Pt)[0] >= r[0] && (n.at as Pt)[0] <= r[0] + r[2] && (n.at as Pt)[1] >= r[1] && (n.at as Pt)[1] <= r[1] + r[3])) fail(`${String(e.id)} hides nothing`);
  }
  // pass 1 hands its level to the wavefront (before the defend padding); pass 2 checks no pad is left hidden (there is no repair step)
  const pass1 = (shift: number): Pass1 | undefined => pin ? undefined : { m: structuredClone(m), stations: P.stations.map((s) => ({ id: s.id, x: s.x, y: s.y, r: s.r, fp: s.fp })), sides: [...sides], shift };
  if (pin) { const h = hiddenPads(m); if (h.length) fail(`pad hidden after placement: ${h.join(", ")}`); }
  if (defend) {
    // Batch 3: the defend map is padded on every side (the long roads); everything moves by the padding.
    const d = GEN.defendRoad.pad;
    padMap(m, d);
    for (const s of P.stations) { s.x += d; s.y += d; if (s.fp) s.fp = [s.fp[0] + d, s.fp[1] + d, s.fp[2] + d, s.fp[3] + d]; }
    const pre = pass1(d);
    return { manifest: m, flow, stations: P.stations, notes, sizing, queue: queue.map((q) => [q[0] + d, q[1] + d] as Pt), layout: snapshot(P, d), padVisibility: checkPadView(m, fail), ...(pre ? { pre } : {}) };
  }
  const pre = pass1(0);
  return { manifest: m, flow, stations: P.stations, notes, sizing, queue, layout: snapshot(P), padVisibility: checkPadView(m, fail), ...(pre ? { pre } : {}) };
}
