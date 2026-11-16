import { PITCH_DEG, YAW_DEG, ART_M } from "@fo/render-3d/units";
import occ from "../data/occluders.json";

/**
 * Is a build pad visible on screen? One pure function (no rendering) shared by the generator, the review tools and the
 * tests. It ports the renderer's own test (render-3d renderer.ts `padsBehind` / `segHitsBox`, the one that raises a pad's
 * pin on a pole of light): the camera is turned YAW_DEG and tilted PITCH_DEG, so the ground line from a point toward the
 * camera runs diagonally, and its reach is the occluder's top over tan(pitch). A pad is hidden where that line crosses an
 * occluder's footprint box, so a building hides a diagonal swath of ground to its north-west, not a band due north.
 *
 * Occluders are what the renderer draws and tests: buildings, resource nodes and gates (their hiding box and top come from
 * data/occluders.json, dumped from the renderer by tools/review/occluder-dump.cjs) and every built wall section (the panel
 * box, section by section, so the joints are as drawn). The camera constants are the game's own (render-3d units.ts).
 */
export type Pt = [number, number];
export interface ViewEnt {
  type: string; id?: string; at?: Pt; site?: Pt; points?: Pt[]; closed?: boolean; gates?: number[]; prebuilt?: number[]; params?: { level?: number } | Record<string, unknown>;
  [k: string]: unknown;
}
export interface Hider { name: string; fraction: number }
export interface PadView {
  id: string; type: string; at: Pt;
  /** Share of the sample points on the pad's disc that no occluder covers (1 = fully in view). */
  visible: number;
  /** Share covered by at least one occluder (visible + hidden = 1). */
  hidden: number;
  /** The occluder covering the most points (null when nothing does); `hiders` lists them all, biggest first. */
  by: string | null;
  hiders: Hider[];
  class: "visible" | "partly" | "hidden";
}
export interface ViewOpts {
  /** Which wall sections count: those prebuilt at level start (what is drawn then), or every section (what will stand). */
  walls?: "built" | "all" | "none";
  /** Pad disc radius in world units (default PAD_RADIUS; a landmark pad is x1.4). */
  radius?: number;
  /**
   * Also count every building a pad.build raises, at its final built size (and the Core at its top level), and every wall
   * section: what will hide pads once everything is built, not just what is drawn at level start.
   */
  final?: boolean;
}

/** Hidden when this share of the disc's points is covered (tools/review/pad-visibility.cjs, the audit). */
export const HIDDEN_AT = 0.75;
/** Pad disc radius: a quarter of the 43.2-unit decal plane, as measured in the renderer. */
export const PAD_RADIUS = 10.8;

const PITCH = (PITCH_DEG * Math.PI) / 180, YAW = (YAW_DEG * Math.PI) / 180;
/** The ground direction toward the camera (level x, y = three x, z) and the slope of the sight line. */
export const SIGHT = { ux: Math.sin(YAW), uz: Math.cos(YAW), slope: Math.tan(PITCH) };

type Box5 = readonly [number, number, number, number, number];
interface Table { future: Record<string, { scale: readonly [number, number, number]; y: number; box: Box5 }>; types: Record<string, { scale: readonly [number, number, number]; y: number; box: Box5 }>; wall: { box: Box5; fit: { len: number; depth: number } | null }; gate: { box: Box5; width: number } }
const T = occ as unknown as Table;

/** One occluder in the renderer's terms: root position, turn, per-axis scale and the model-space box and top. */
export interface Occluder { name: string; /** The entity id it was drawn for, when it has one (upgrades resize it). */ ref?: string; /** Index of the entity it was drawn for. */ ent?: number; /** The pad that raises this building (a pad is not hidden by the building it becomes). */ owner?: string; bx: number; bz: number; ang: number; sx: number; sz: number; sy: number; /** Root height above the ground. */ y: number; box: Box5 }

/** The renderer's slab test: does the segment from (px,pz) along (dx,dz) touch the box. */
export function segHitsBox(px: number, pz: number, dx: number, dz: number, x0: number, x1: number, z0: number, z1: number): boolean {
  if (x0 > x1 || z0 > z1) return false;
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[px, dx, x0, x1], [pz, dz, z0, z1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

/** Whether the ground point (x, z) is hidden behind the occluder from the camera (renderer padsBehind). */
export function hides(o: Occluder, x: number, z: number): boolean {
  const co = Math.cos(o.ang), si = Math.sin(o.ang), top = o.y + o.box[4] * o.sy, reach = top / SIGHT.slope;
  const wx = x - o.bx, wz = z - o.bz;
  return segHitsBox((wx * co - wz * si) / o.sx, (wx * si + wz * co) / o.sz, ((SIGHT.ux * co - SIGHT.uz * si) * reach) / o.sx, ((SIGHT.ux * si + SIGHT.uz * co) * reach) / o.sz, o.box[0], o.box[1], o.box[2], o.box[3]);
}

/**
 * A wall run laid along a section from fraction f0 to f1 (renderer wallRun): Meshy panels keep their proportions and are laid
 * end to end (one box per panel, so the joints are as drawn), the plain code panel stretches over the run.
 */
function wallRun(out: Occluder[], a: Pt, dx: number, dz: number, ang: number, len: number, f0: number, f1: number): void {
  const run = len * (f1 - f0), fit = T.wall.fit;
  if (run <= 0) return;
  if (!fit) {
    const f = (f0 + f1) / 2;
    out.push({ name: "wall", bx: a[0] + dx * f, bz: a[1] + dz * f, ang, sx: run, sz: ART_M, sy: ART_M, y: 0, box: T.wall.box });
    return;
  }
  const n = Math.max(1, Math.round(run / (fit.len * ART_M)));
  for (let j = 0; j < n; j++) {
    const f = f0 + ((j + 0.5) / n) * (f1 - f0);
    out.push({ name: "wall", bx: a[0] + dx * f, bz: a[1] + dz * f, ang, sx: run / n / fit.len, sz: ART_M * fit.depth, sy: ART_M, y: 0, box: T.wall.box });
  }
}

/** Everything in a level's entity list that the renderer would test a pad against. */
export function occluders(ents: readonly ViewEnt[], opts: ViewOpts = {}): Occluder[] {
  const out: Occluder[] = [];
  const level = (e: ViewEnt): number => Number((e.params as { level?: number } | undefined)?.level ?? 1);
  let nodeIdx = 0;
  for (const e of ents) {
    const nodeI = e.type.startsWith("node.") ? nodeIdx++ : -1;
    if (e.type.startsWith("pad.") || e.type === "barrier.line" || !e.at) continue;
    // a locked grow dome is drawn as a blueprint, not as a model
    if (e.type === "node.food_source" && e.enabled === false) continue;
    // scrap heaps take three models in turn by their place in the node list (renderer syncNodes)
    const t = (nodeI >= 0 && e.type === "node.salvage_pile" ? (T.types[`${e.type}@${1 + (nodeI % 3)}`] ?? T.types[`${e.type}@1`]) : undefined) ?? T.types[`${e.type}@${level(e)}`] ?? T.types[e.type];
    if (!t) continue;
    // walls "none": wall lines and their gates are not counted; a stand-alone gate is the survivors' arrival gate and stays
    if (opts.walls === "none" && e.type === "struct.gate" && !e["arrivals"]) continue;
    out.push({ name: e.type, ent: ents.indexOf(e), ...(e.id ? { ref: String(e.id) } : {}), bx: e.at[0], bz: e.at[1], ang: 0, sx: t.scale[0], sz: t.scale[2], sy: t.scale[1], y: t.y, box: t.box });
  }
  if (opts.final) {
    const top = (base: string): string | undefined => Object.keys(T.future).filter((k) => k.startsWith(base + "@")).sort((a, b) => Number(a.split("@")[1]) - Number(b.split("@")[1])).pop();
    // the Core stands at its top level once every level pad is paid
    if (ents.some((e) => e.type === "pad.build" && (e as { build?: string }).build === "sink.core.level")) {
      const k = top("sink.core"), t = k ? T.future[k] : undefined, core = out.find((o) => o.name === "sink.core");
      if (t && core) { core.sx = t.scale[0]; core.sz = t.scale[2]; core.sy = t.scale[1]; core.y = t.y; core.box = t.box; }
    }
    for (const e of ents) {
      const b = (e as { build?: string }).build, at = e.site ?? e.at;
      // an upgrade pad (a tier 2 or 3, a level pad) raises nothing new; a tower pad with a site raises the first tower there
      if (e.type !== "pad.build" || !b || !at || (/.td$/.test(b) && !e.site)) continue;
      const base = b.replace(/.td$/, ""), k = top(base), t = k ? T.future[k] : undefined;
      if (!t || out.some((o) => o.name === base && o.bx === at[0] && o.bz === at[1])) continue;
      out.push({ name: base, owner: String(e.id ?? ""), bx: at[0], bz: at[1], ang: 0, sx: t.scale[0], sz: t.scale[2], sy: t.scale[1], y: t.y, box: t.box });
    }
  }
  for (const e of ents) {
    if (e.type !== "barrier.line" || !e.points || opts.walls === "none") continue;
    const p = e.points, n = p.length, gates = new Set(e.gates ?? []), built = new Set(e.prebuilt ?? []);
    for (let i = 0; i < (e.closed ? n : n - 1); i++) {
      if (!opts.final && (opts.walls ?? "built") === "built" && !built.has(i)) continue;
      const a = p[i]!, b = p[(i + 1) % n]!;
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
      if (gates.has(i)) {
        // the Meshy gate keeps its own width with wall runs either side; a gate wider than the section stretches to it
        const mid: Pt = [a[0] + dx / 2, a[1] + dz / 2], gw = T.gate.width, own = gw > 0 && gw < len;
        out.push({ name: "struct.gate", bx: mid[0], bz: mid[1], ang, sx: own ? ART_M : len / 2.6, sz: ART_M, sy: ART_M, y: 0, box: T.gate.box });
        if (own) { const side = (1 - gw / len) / 2; wallRun(out, a, dx, dz, ang, len, 0, side); wallRun(out, a, dx, dz, ang, len, 1 - side, 1); }
      } else wallRun(out, a, dx, dz, ang, len, 0, 1);
    }
  }
  return out;
}

/** The sample points on a pad's disc: the centre, 8 at half radius, 8 at full radius (17, as the audit tool). */
export function discPoints(at: Pt, r: number): Pt[] {
  const pts: Pt[] = [[at[0], at[1]]];
  for (const f of [0.5, 1]) for (let i = 0; i < 8; i++) pts.push([at[0] + Math.cos((i * Math.PI) / 4) * r * f, at[1] + Math.sin((i * Math.PI) / 4) * r * f]);
  return pts;
}

/** Visibility of one point set against a set of occluders. */
export function viewOf(id: string, type: string, at: Pt, all: readonly Occluder[], r = PAD_RADIUS, skip?: ReadonlySet<string>): PadView {
  const occs = all.filter((o) => o.owner !== id && !(skip && ((o.owner !== undefined && skip.has(o.owner)) || (o.ref !== undefined && skip.has(o.ref)))));
  const pts = discPoints(at, r), per = new Map<string, number>();
  let hid = 0;
  for (const q of pts) {
    let any = false;
    const names = new Set<string>();
    for (const o of occs) if (hides(o, q[0], q[1])) { any = true; names.add(o.name); }
    if (any) hid++;
    for (const nm of names) per.set(nm, (per.get(nm) ?? 0) + 1);
  }
  const hiders = [...per].map(([name, n]) => ({ name, fraction: +(n / pts.length).toFixed(2) })).sort((x, y) => y.fraction - x.fraction);
  const hidden = hid / pts.length;
  return { id, type, at, visible: +(1 - hidden).toFixed(3), hidden: +hidden.toFixed(3), by: hiders[0]?.name ?? null, hiders, class: hidden >= HIDDEN_AT ? "hidden" : hidden > 0 ? "partly" : "visible" };
}

/** Per pad of a level: visible fraction, hidden fraction and the main occluder. Pads that stand in a wall line's gate are measured like any other. */
export function padVisibility(ents: readonly ViewEnt[], opts: ViewOpts = {}): PadView[] {
  const occs = occluders(ents, opts);
  const out: PadView[] = [];
  for (const e of ents) {
    if (!e.type.startsWith("pad.") || !e.at) continue;
    const big = e.type === "pad.build" && (e as { build?: string }).build === "struct.landmark";
    out.push(viewOf(String(e.id ?? e.type), e.type, e.at, occs, opts.radius ?? (big ? PAD_RADIUS * 1.4 : PAD_RADIUS)));
  }
  return out;
}

/**
 * The report a built level carries (never written into the level file): the pads as drawn at level start (`pads`, the
 * numbers the audit and the renderer's pins use), and again once everything is built (`final`: every pad's building at its
 * final size, the Core at its top level, every wall section).
 */
export interface PadVisibilityReport { pads: PadView[]; hidden: number; partly: number; visible: number; final: PadView[]; hiddenFinal: number; partlyFinal: number }
export function padVisibilityReport(ents: readonly ViewEnt[], opts: ViewOpts = {}): PadVisibilityReport {
  const pads = padVisibility(ents, { ...opts, final: false }), final = padVisibility(ents, { ...opts, final: true });
  const n = (l: PadView[], c: PadView["class"]) => l.filter((p) => p.class === c).length;
  return { pads, hidden: n(pads, "hidden"), partly: n(pads, "partly"), visible: n(pads, "visible"), final, hiddenFinal: n(final, "hidden"), partlyFinal: n(final, "partly") };
}

/**
 * The shadow a model of `kind` standing at `at` casts at its biggest size (its top level, every scrap heap model), as a test
 * "does it hide any sample point of a pad of radius r at q" (null: the kind is not drawn tall). The generator places with it
 * (Doug, 2026-11-15: no pad in a shadow, no tall thing whose shadow falls on a pad).
 */
export function shadowTest(kind: string, at: Pt, r = PAD_RADIUS): ((q: Pt) => boolean) | null {
  const fut = Object.keys(T.future).filter((k) => k.startsWith(kind + "@"));
  const typ = Object.keys(T.types).filter((k) => k === kind || k.startsWith(kind + "@"));
  const tabs = [...fut.map((k) => T.future[k]!), ...typ.map((k) => T.types[k]!)];
  if (!tabs.length) return null;
  const occs: Occluder[] = tabs.map((t) => ({ name: kind, bx: at[0], bz: at[1], ang: 0, sx: t.scale[0], sz: t.scale[2], sy: t.scale[1], y: t.y, box: t.box }));
  // nothing farther than the box's far corner plus the shadow's reach plus the pad can be hidden
  const far = Math.max(...occs.map((o) => Math.hypot(Math.max(Math.abs(o.box[0]), Math.abs(o.box[1])) * o.sx, Math.max(Math.abs(o.box[2]), Math.abs(o.box[3])) * o.sz) + (o.y + o.box[4] * o.sy) / SIGHT.slope)) + r + 1;
  return (q) => Math.hypot(q[0] - at[0], q[1] - at[1]) <= far && discPoints(q, r).some((d) => occs.some((o) => hides(o, d[0], d[1])));
}

const futureKey = (base: string, level: number): string | undefined => {
  const ks = Object.keys(T.future).filter((k) => k.startsWith(base + "@")).map((k) => Number(k.split("@")[1])).sort((a, b) => a - b);
  const l = ks.filter((k) => k <= level).pop() ?? ks[0];
  return l === undefined ? undefined : `${base}@${l}`;
};
const setDims = (o: Occluder, k: string | undefined): void => {
  const t = k ? T.future[k] : undefined;
  if (t) { o.sx = t.scale[0]; o.sz = t.scale[2]; o.sy = t.scale[1]; o.y = t.y; o.box = t.box; }
};
const buildOf = (e: ViewEnt): string => String((e as { build?: string }).build ?? "");
/** A pad that raises nothing new where it stands: an upgrade, a level, a dome switch, a clearing. */
export const isUpgradePad = (e: ViewEnt): boolean => {
  const b = buildOf(e);
  return e.type === "pad.build" && (/\.t\d$/.test(b) || b === "sink.core.level" || b === "conv.level" || b === "node.enable" || b === "zone.clear");
};

/**
 * Lifetime mode (Doug, 2026-11-15): the occluders standing once the pads in `built` are paid, with walls and wall-line gates
 * not counted (the survivors' arrival gate is). Each paid building stands at its real size for its paid upgrades, the Core
 * at its level after its paid level pads, and a switched-on grow dome is drawn.
 */
export function occludersAt(ents: readonly ViewEnt[], built: ReadonlySet<string>): Occluder[] {
  const out = occluders(ents, { walls: "none" });
  const paid = ents.filter((e) => e.type === "pad.build" && built.has(String(e.id ?? "")));
  const ups = (target: string): number => paid.filter((u) => /\.t\d$/.test(buildOf(u)) && String(u["target"]) === target).length;
  const coreUps = paid.filter((u) => buildOf(u) === "sink.core.level").length;
  if (coreUps > 0) {
    const core = out.find((o) => o.name === "sink.core"), ce = ents.find((e) => e.type === "sink.core");
    const start = Number((ce?.params as { level?: number } | undefined)?.level ?? 1);
    if (core) setDims(core, futureKey("sink.core", start + coreUps));
  }
  for (const u of paid) {
    const b = buildOf(u), tgt = u["target"] === undefined ? undefined : String(u["target"]);
    if (b === "node.enable" && tgt) {
      const n = ents.find((e) => e.id === tgt && e.at), t = n ? T.types[n.type] : undefined;
      if (n?.at && t && !out.some((o) => o.ref === tgt)) out.push({ name: n.type, ref: tgt, ent: ents.indexOf(n), bx: n.at[0], bz: n.at[1], ang: 0, sx: t.scale[0], sz: t.scale[2], sy: t.scale[1], y: t.y, box: t.box });
      continue;
    }
    if (/\.t\d$/.test(b) && tgt) {
      // an upgrade of a pre-placed structure (the barracks) resizes it; an upgrade of a paid building is applied below
      const o = out.find((x) => x.ref === tgt && x.owner === undefined);
      if (o) setDims(o, futureKey(b.replace(/\.t\d$/, ""), 1 + ups(tgt)));
      continue;
    }
    if (isUpgradePad(u)) continue;
    const at = u.site ?? u.at, id = String(u.id ?? ""), k = futureKey(b, 1 + ups(id));
    if (!at || !k) continue;
    const o: Occluder = { name: b, owner: id, ref: id, ent: ents.indexOf(u), bx: at[0], bz: at[1], ang: 0, sx: 1, sz: 1, sy: 1, y: 0, box: [0, 0, 0, 0, 0] };
    setDims(o, k);
    out.push(o);
  }
  return out;
}
