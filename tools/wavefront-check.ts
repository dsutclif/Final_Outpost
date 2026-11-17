// outpost-ops#202: run the stand-alone wavefront placement (packages/generator/src/wavefront.ts) over the building lists of
// the shipped levels (levels/packs/*, positions stripped) with the two site checks on and off, and print a compact table.
//   pnpm vite-node tools/wavefront-check.ts -- [--per 1] [--l20 20] [--json out.json]
// Read-only: writes nothing unless --json is given. Never touches the packs.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import content from "../packages/content/data/sinks.json";
import gen from "../packages/generator/data/generator.json";
import { dependents, ownerOf, staticWindows, type Manifest } from "../packages/generator/src/padRepair.js";
import { PAD_RADIUS, isUpgradePad, type ViewEnt } from "../packages/generator/src/viewVisibility.js";
import { defaultSpotR, placeWavefront, tallestShape, type WfBuilding, type WfInput, type WfResult } from "../packages/generator/src/wavefront.js";

type Box4 = [number, number, number, number];
const FP = (gen as unknown as { footprints: Record<string, Box4> }).footprints;
const CORE_RING = Math.max(...(content as unknown as Record<string, { levels: { safeRadius: number }[] }>)["sink.core"]!.levels.map((l) => l.safeRadius));
const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const PER = Number(arg("--per", "1")), L20 = Number(arg("--l20", "20")), OUT = arg("--json", "");
const root = fileURLToPath(new URL("../levels/packs/", import.meta.url));

/** Not placed: walls, zones, the scrap fuel scatter (no model tall enough to hide a pad, no pads), wall-line gates. */
const SKIP = new Set(["node.fuel_scrap", "pad", "pad.big"]);

export interface Converted { input: WfInput; orphans: string[] }
/** A level's buildings in order of first appearance, with their pads and live windows; positions are not carried over. */
export function convert(m0: Manifest): Converted {
  const m = JSON.parse(JSON.stringify(m0)) as Manifest;
  m.entities.forEach((e, i) => { if (e.id === undefined) e.id = `${e.type}#${i}`; });
  const ents = m.entities, pads = ents.filter((e) => e.type.startsWith("pad.") && e.at);
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
  const mk = (id: string, kind: string, appear: number, fp: Box4): WfBuilding => {
    const occ = tallestShape(kind);
    const spotR = kind === "sink.core" ? Math.min(defaultSpotR(fp), CORE_RING) : undefined;
    return { id, kind, footprint: fp, occ, appear, pads: [], ...(spotR !== undefined ? { spotR } : {}) };
  };
  for (const e of ents) {
    if (e.type.startsWith("pad.") || !e.at || SKIP.has(e.type)) continue;
    if (e.type === "struct.gate") {
      if (!e["arrivals"]) continue; // walls' gates are ignored; the survivors' arrival gate counts (gate_arrivals levels)
      const s = tallestShape("struct.gate")!;
      start.push(mk(String(e.id), e.type, 0, [s.box[0] * s.sx, s.box[2] * s.sz, s.box[1] * s.sx, s.box[3] * s.sz]));
      continue;
    }
    if (!FP[e.type]) continue;
    const en = e.type === "node.food_source" && e.enabled === false ? enabler.get(String(e.id)) : undefined;
    (en ? built : start).push(mk(String(e.id), e.type, en ? padDepth(en) : 0, FP[e.type]!));
  }
  // rockfall squares: flat (no occluder), one clear pad each, on the settlement side; the rockfall joins the wavefront of its clear pad
  for (const e of ents) if (e.type === "zone.blocked" && Array.isArray(e["rect"]) && pads.some((p) => p["target"] === e.id)) {
    const [, , w, h] = e["rect"] as number[];
    start.push({ id: String(e.id), kind: "zone.blocked", footprint: [-w! / 2, -h! / 2, w! / 2, h! / 2], occ: null, appear: Math.min(...pads.filter((p) => p["target"] === e.id).map((p) => padDepth(String(p.id)))), pads: [], side: "settlement" });
  }
  for (const e of pads) if (e.type === "pad.build" && !isUpgradePad(e) && FP[build(e)] && build(e) !== "pad") built.push(mk(String(e.id), build(e), padDepth(String(e.id)), FP[build(e)]!));
  built.sort((a, b) => a.appear - b.appear);
  const all = [...start, ...built], bmap = new Map(all.map((b) => [b.id, b]));
  const startIds = start.filter((b) => !(b.kind === "node.food_source" && byId.get(b.id)!.enabled === false)).map((b) => b.id);
  const win = staticWindows(m), orphans: string[] = [];
  const core = all.find((b) => b.kind === "sink.core");
  const links: [string, string][] = [];
  for (const e of pads) {
    const id = String(e.id);
    let owner = bmap.has(id) ? id : undefined;
    if (!owner && build(e) === "struct.conveyor") {
      // a belt's pad goes beside the conveyor's start: the source-end machine (nearest of that kind to where the pad was)
      const from = (e["link"] as { from?: string } | undefined)?.from, d = (b: WfBuilding) => { const a = byId.get(b.id)?.at, q = e.at!; return a ? Math.hypot(a[0] - q[0], a[1] - q[1]) : 1e9; };
      owner = all.filter((b) => b.kind === from).sort((x, y) => d(x) - d(y))[0]?.id;
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
  return { input: { buildings: all, map: { w: m.map.w, h: m.map.h } }, orphans };
}

type Variant = { name: string; checks: boolean; repair: "always" | "fallback" };
const VARIANTS: Variant[] = [
  { name: "checks on, repair every placement", checks: true, repair: "always" },
  { name: "checks on, repair as fallback only", checks: true, repair: "fallback" },
  { name: "checks off", checks: false, repair: "always" },
];
interface Row { level: string; seed: number; v: string; r: WfResult; ms: number }
const levels: { id: string; m: Manifest }[] = [];
for (const pack of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort())
  for (const f of readdirSync(root + pack).filter((f) => /^s1-L\d+\.json$/.test(f)).sort())
    levels.push({ id: f.replace(".json", ""), m: JSON.parse(readFileSync(`${root}${pack}/${f}`, "utf8")) as Manifest });

const conv = new Map(levels.map((l) => [l.id, convert(l.m)]));
const runs: Row[] = [];
const run = (level: string, seed: number, v: Variant) => { const t = performance.now(); const r = placeWavefront(conv.get(level)!.input, { seed, siteChecks: v.checks, repair: v.repair }); runs.push({ level, seed, v: v.name, r, ms: performance.now() - t }); };
run(levels[0]!.id, 1, VARIANTS[0]!); runs.pop(); // warm-up
for (const v of VARIANTS) {
  for (const l of levels) for (let s = 1; s <= PER; s++) run(l.id, s, v);
  if (conv.has("s1-L020")) for (let s = PER + 1; s <= PER + L20; s++) run("s1-L020", s, v);
}

const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) : "-") + "%";
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const table = (rows: Row[]) => {
  const ok = rows.filter((x) => !x.r.rejected), push = rows.map((x) => x.r.stats.pushes), dist = rows.map((x) => x.r.stats.totalPushDistance);
  const kinds: Record<string, number> = {};
  for (const x of rows) if (x.r.rejected) kinds[x.r.rejected.kind] = (kinds[x.r.rejected.kind] ?? 0) + 1;
  return {
    seeds: rows.length,
    allVisible: pct(ok.filter((x) => x.r.stats.hiddenPads === 0).length, rows.length),
    rejected: pct(rows.length - ok.length, rows.length),
    pushesMean: mean(push).toFixed(2), pushesMax: Math.max(0, ...push),
    distPerSeed: mean(dist).toFixed(1),
    hiddenPads: ok.reduce((a, x) => a + x.r.stats.hiddenPads, 0),
    fallbacks: mean(rows.map((x) => x.r.stats.fallbacks)).toFixed(2),
    repairs: mean(rows.map((x) => x.r.stats.repairs)).toFixed(2),
    msMean: mean(rows.map((x) => x.ms)).toFixed(2),
    msMax: Math.max(...rows.map((x) => x.ms)).toFixed(1),
    rejectKinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(" ") || "-",
  };
};
const orph = [...conv.values()].reduce((a, c) => a + c.orphans.length, 0);
console.log(`levels ${levels.length}, seeds per level ${PER}, Level 20 extra seeds ${L20}; pads with no owning building (put on the Core): ${orph}`);
const out: Record<string, unknown> = {};
for (const v of VARIANTS) {
  const rs = runs.filter((x) => x.v === v.name);
  out[`all: ${v.name}`] = table(rs);
  out[`L20: ${v.name}`] = table(rs.filter((x) => x.level === "s1-L020"));
}
console.table(out);
const hidden: Record<string, number> = {};
for (const x of runs) if (!x.r.rejected) for (const id of x.r.hidden) { const k = `${x.v} | ${id.replace(/\d+$/, "")}`; hidden[k] = (hidden[k] ?? 0) + 1; }
console.log("hidden pads by id prefix:", JSON.stringify(hidden));

// Stacked pads: the pads of one building share one spot and must appear one after another. Two pads of a stack can be live at
// once unless one needs the other spent (padRepair.dependents; a coreLevel requirement counts as needing the core_level pad before it).
const stackOverlaps: { level: string; building: string; a: string; b: string }[] = [];
for (const l of levels) {
  const m = JSON.parse(JSON.stringify(l.m)) as Manifest;
  m.entities.forEach((e, i) => { if (e.id === undefined) e.id = `${e.type}#${i}`; });
  for (const e of m.entities) {
    const r = ((e as { requires?: { coreLevel?: number; pad?: string } }).requires ??= {}) as { coreLevel?: number; pad?: string };
    if (e.type.startsWith("pad.") && r.coreLevel && r.coreLevel >= 2 && !r.pad && m.entities.some((x) => x.id === `core_level${r.coreLevel! - 2}`) && e.id !== `core_level${r.coreLevel - 2}`) r.pad = `core_level${r.coreLevel - 2}`;
  }
  for (const b of conv.get(l.id)!.input.buildings) {
    const ids = b.pads.map((p) => p.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
      if (!dependents(m, ids[i]!).has(ids[j]!) && !dependents(m, ids[j]!).has(ids[i]!)) stackOverlaps.push({ level: l.id, building: b.id, a: ids[i]!, b: ids[j]! });
  }
}
const lvls = new Set(stackOverlaps.map((x) => x.level));
console.log(`stacked pads live at the same time: ${stackOverlaps.length} pairs in ${lvls.size} levels`);
for (const x of stackOverlaps.slice(0, 15)) console.log(`  ${x.level} ${x.building}: ${x.a} + ${x.b}`);
if (OUT) writeFileSync(OUT, JSON.stringify({ runs: runs.map((x) => ({ level: x.level, seed: x.seed, variant: x.v, ms: x.ms, rejected: x.r.rejected, stats: x.r.stats, hidden: x.r.hidden })), stackOverlaps }));

// belt pads sit in the stack of the conveyor's source-end machine; rockfall clear pads in their rockfall's own stack
let belts = 0, beltOk = 0, rocks = 0, rockOk = 0;
for (const l of levels) {
  const inp = conv.get(l.id)!.input;
  for (const e of l.m.entities) {
    if (e.type === "pad.build" && (e as { build?: string }).build === "struct.conveyor") { belts++; const o = inp.buildings.find((b) => b.pads.some((p) => p.id === e.id)); if (o && o.kind === (e as unknown as { link: { from: string } }).link.from) beltOk++; }
    if (e.type === "pad.build" && (e as { build?: string }).build === "zone.clear") { rocks++; const o = inp.buildings.find((b) => b.pads.some((p) => p.id === e.id)); if (o && o.kind === "zone.blocked" && o.id === e["target"]) rockOk++; }
  }
}
console.log(`belt pads on the source machine: ${beltOk}/${belts}; rockfall clear pads on their rockfall: ${rockOk}/${rocks}`);
