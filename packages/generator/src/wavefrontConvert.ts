// outpost-ops#202: converts a level manifest into the wavefront placement input (moved from tools/wavefront-convert.ts so build.ts can run it).
import { content as defaultContent } from "@fo/content";
import gen from "../data/generator.json";
import { dependents, ownerOf, staticWindows, type Manifest } from "./padRepair.js";
import { PAD_RADIUS, isUpgradePad, type ViewEnt } from "./viewVisibility.js";
import { SALVAGE_KIND, defaultSpotR, scrapShape, tallestShape, type WfBuilding, type WfInput, type WfMedic, type WfWallSpec } from "./wavefront.js";
type Box4 = [number, number, number, number];
const FP = (gen as unknown as { footprints: Record<string, Box4> }).footprints;
const CORE_RING = Math.max(...(defaultContent.sinks as unknown as Record<string, { levels: { safeRadius: number }[] }>)["sink.core"]!.levels.map((l) => l.safeRadius));
/** Not placed: walls, zones, the scrap fuel scatter (no model tall enough to hide a pad, no pads), wall-line gates. */
const SKIP = new Set(["node.fuel_scrap", "pad", "pad.big"]);

export interface Converted { input: WfInput; orphans: string[]; overlapPairs: { building: string; a: string; b: string }[] }
/** A level's buildings in order of first appearance, with their pads and live windows; positions are not carried over. */
/**
 * opts.skip: pads left out entirely (build.ts: wall towers and the ranger keep positions of their own). opts.place: entities normally left
 * out (the fuel scatter) that are placed too, as flat buildings without pads (build.ts: the fuel forest needs its room inside the ring).
 * opts.footprint: a kind's ground box in place of generator.json's (build.ts: the kiosk's with its standing spots).
 */
export function convert(m0: Manifest, opts: { skip?: (e: ViewEnt) => boolean; place?: (e: ViewEnt) => boolean; footprint?: (kind: string) => Box4 | undefined } = {}): Converted {
  const m = JSON.parse(JSON.stringify(m0)) as Manifest;
  m.entities.forEach((e, i) => { if (e.id === undefined) e.id = `${e.type}#${i}`; });
  const ents = m.entities, pads = ents.filter((e) => e.type.startsWith("pad.") && e.at && !opts.skip?.(e));
  const byId = new Map(ents.map((e) => [String(e.id), e]));
  const req = (e: ViewEnt) => (e["requires"] ?? {}) as { pad?: string; orPad?: string };
  const dmemo = new Map<string, number>();
  const padDepth = (id: string, seen = new Set<string>()): number => {
    if (dmemo.has(id)) return dmemo.get(id)!;
    const e = byId.get(id); if (!e || seen.has(id)) return 0;
    seen.add(id);
    const r = req(e), ds = [r.pad, r.orPad].filter((x): x is string => !!x).map((x) => 1 + padDepth(x, seen));
    const d = ds.length ? Math.min(...ds) : 0;
    dmemo.set(id, d); return d;
  };
  const build = (e: ViewEnt) => String((e as { build?: string }).build ?? "");
  // the pad that switches a locked grow dome on (it appears then)
  const enabler = new Map(pads.filter((e) => build(e) === "node.enable" && e["target"]).map((e) => [String(e["target"]), String(e.id)]));
  const start: WfBuilding[] = [], built: WfBuilding[] = [];
  const mk = (id: string, kind: string, appear: number, fp0: Box4, variant?: number): WfBuilding => {
    const fp = opts.footprint?.(kind) ?? fp0;
    const occ = variant !== undefined ? scrapShape(variant) : tallestShape(kind);
    const spotR = kind === "sink.core" ? Math.min(defaultSpotR(fp), CORE_RING) : undefined;
    return { id, kind, footprint: fp, occ, appear, pads: [], ...(spotR !== undefined ? { spotR } : {}), ...(variant !== undefined ? { variant } : {}) };
  };
  let nodeI = 0;
  for (const e of ents) {
    const ni = e.type.startsWith("node.") ? nodeI++ : -1;
    if (e.type.startsWith("pad.") || !e.at || (SKIP.has(e.type) && !opts.place?.(e))) continue;
    if (e.type === "struct.gate") {
      if (!e["arrivals"]) continue; // walls' gates are ignored; the survivors' arrival gate counts (gate_arrivals levels)
      const s = tallestShape("struct.gate")!;
      start.push(mk(String(e.id), e.type, 0, [s.box[0] * s.sx, s.box[2] * s.sz, s.box[1] * s.sx, s.box[3] * s.sz]));
      continue;
    }
    if (!FP[e.type]) continue;
    const en = e.type === "node.food_source" && e.enabled === false ? enabler.get(String(e.id)) : undefined;
    (en ? built : start).push(mk(String(e.id), e.type, en ? padDepth(en) : 0, FP[e.type]!, e.type === SALVAGE_KIND ? 1 + (ni % 3) : undefined));
  }
  // rockfall squares: flat (no occluder), one clear pad each, on the settlement side; the rockfall joins the wavefront of its clear pad
  for (const e of ents) if (e.type === "zone.blocked" && Array.isArray(e["rect"]) && pads.some((p) => p["target"] === e.id)) {
    const [, , w, h] = e["rect"] as number[];
    start.push({ id: String(e.id), kind: "zone.blocked", footprint: [-w! / 2, -h! / 2, w! / 2, h! / 2], occ: null, appear: Math.min(...pads.filter((p) => p["target"] === e.id).map((p) => padDepth(String(p.id)))), pads: [], side: "settlement", ...(ents.some((x) => x.type === "barrier.line") ? { gateRock: true } : {}) });
  }
  for (const e of pads) if (e.type === "pad.build" && !isUpgradePad(e) && FP[build(e)] && build(e) !== "pad") built.push(mk(String(e.id), build(e), padDepth(String(e.id)), FP[build(e)]!));
  built.sort((a, b) => a.appear - b.appear);
  const all = [...start, ...built], bmap = new Map(all.map((b) => [b.id, b]));
  const startIds = start.filter((b) => !(b.kind === "node.food_source" && byId.get(b.id)!.enabled === false)).map((b) => b.id);
  const win = staticWindows(m), orphans: string[] = [];
  const core = all.find((b) => b.kind === "sink.core");
  const links: [string, string][] = [];
  let medic: WfMedic | undefined;
  for (const e of pads) {
    const id = String(e.id);
    if (e.type === "pad.hire" && (e["role"] as { role?: string } | undefined)?.role === "role.medic") {
      const pd = win.get(id)!.paidBefore;
      medic = { id, coexist: [...startIds, ...all.filter((b) => !startIds.includes(b.id) && (pd.has(b.id) || (enabler.has(b.id) && pd.has(enabler.get(b.id)!)))).map((b) => b.id)] };
      continue;
    }
    let owner = bmap.has(id) ? id : undefined;
    if (!owner && build(e) === "struct.conveyor") {
      // a belt's pad goes beside the conveyor's start: the source-end machine (nearest of that kind to where the pad was)
      const from = (e["link"] as { from?: string } | undefined)?.from, d = (b: WfBuilding) => { const a = byId.get(b.id)?.at, q = e.at!; return a ? Math.hypot(a[0] - q[0], a[1] - q[1]) : 1e9; };
      owner = all.filter((b) => b.kind === from).sort((x, y) => d(x) - d(y))[0]?.id;
      // the machine at the belt's far end joins the same wavefront: with the Core mid-settlement (Doug 2026-11-17) a belt between wavefronts on
      // either side of it would run across the Core)
      const to = (e["link"] as { to?: string } | undefined)?.to, end = all.filter((b) => b.kind === to).sort((x, y) => d(x) - d(y))[0];
      if (owner && end) { links.push([owner, end.id]); end.beside = owner; end.besidePad = id; }
    }
    owner ??= ownerOf(m, [e])?.id;
    if (!owner || !bmap.has(owner)) { orphans.push(id); owner = core?.id; }
    if (!owner) continue;
    const paid = win.get(id)!.paidBefore;
    const coexist = [...startIds, ...all.filter((b) => !startIds.includes(b.id) && (paid.has(b.id) || (enabler.has(b.id) && paid.has(enabler.get(b.id)!)))).map((b) => b.id)];
    // a pad is not hidden by what it raises or upgrades (an upgrade or level pad sits in its own building's plot)
    const ignore = [id, ...(isUpgradePad(e) ? [owner] : [])];
    for (let t = e["target"] as string | undefined, i = 0; t && i < 4; i++) { ignore.push(t); t = byId.get(t)?.["target"] as string | undefined; }
    (bmap.get(owner)!.pads as WfBuilding["pads"][number][]).push({ id, coexist, ignore, ...(build(e) === "struct.landmark" ? { radius: PAD_RADIUS * 1.4 } : {}) });
    const r = (e["role"] ?? {}) as { node?: string; to?: string };
    if (r.node && r.to && /^conv\./.test(r.to)) { const c = ownerOf(m, [{ ...e, role: { to: r.to } } as ViewEnt]); if (c && bmap.has(r.node) && bmap.has(c.id)) links.push([r.node, c.id]); }
  }
  for (const [a, b] of links) { const x = bmap.get(a)!; x.links = [...(x.links ?? []), b]; }
  // pads of one building that are live at the same time: a pad needing the other spent is one after another (padRepair.dependents; a coreLevel
  // requirement counts as needing the core_level pad before it)
  const m2 = JSON.parse(JSON.stringify(m0)) as Manifest;
  m2.entities.forEach((e, i) => { if (e.id === undefined) e.id = `${e.type}#${i}`; });
  for (const e of m2.entities) {
    const r = ((e as { requires?: { coreLevel?: number; pad?: string } }).requires ??= {}) as { coreLevel?: number; pad?: string };
    if (e.type.startsWith("pad.") && r.coreLevel && r.coreLevel >= 2 && !r.pad && m2.entities.some((x) => x.id === `core_level${r.coreLevel! - 2}`) && e.id !== `core_level${r.coreLevel - 2}`) r.pad = `core_level${r.coreLevel - 2}`;
  }
  const overlapPairs: Converted["overlapPairs"] = [];
  for (const b of all) {
    const ps = b.pads as unknown as { id: string; overlaps?: string[] }[];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
      if (!dependents(m2, ps[i]!.id).has(ps[j]!.id) && !dependents(m2, ps[j]!.id).has(ps[i]!.id)) {
        (ps[i]!.overlaps ??= []).push(ps[j]!.id); (ps[j]!.overlaps ??= []).push(ps[i]!.id);
        overlapPairs.push({ building: b.id, a: ps[i]!.id, b: ps[j]!.id });
      }
  }
  // the wall ring: its own size, sections per side, and the sides its gates stand on
  const ring = ents.find((e) => e.type === "barrier.line") as unknown as { points: [number, number][]; gates?: number[] } | undefined;
  let walls: WfWallSpec | undefined;
  if (ring) {
    const xs = ring.points.map((q) => q[0]), ys = ring.points.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const hh = ring.points.filter((q) => q[1] === y0 && q[0] !== x1).length, vv = ring.points.length / 2 - hh;
    const sideOfI = (i: number): "n" | "e" | "s" | "w" => (i < hh ? "n" : i < hh + vv ? "e" : i < 2 * hh + vv ? "s" : "w");
    walls = { dims: [x1 - x0, y1 - y0], split: [hh, vv], gateSides: (ring.gates ?? []).map(sideOfI) };
  }
  return { input: { buildings: all, map: { w: m.map.w, h: m.map.h }, ...(walls ? { walls } : {}), ...(medic ? { medic } : {}) }, orphans, overlapPairs };
}
