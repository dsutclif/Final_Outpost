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
import { gateStrip, SCRAP_RANGE, SALVAGE_KIND, defaultSpotR, placeWavefront, scrapShape, scrapStrip, tallestShape, wallStrip, WALL_HALF, type WfBuilding, type WfInput, type WfMedic, type WfResult, type WfWallSpec } from "../packages/generator/src/wavefront.js";
import { convert, type Converted } from "./wavefront-convert.js";
export { convert, type Converted };

type Box4 = [number, number, number, number];
const FP = (gen as unknown as { footprints: Record<string, Box4> }).footprints;
const CORE_RING = Math.max(...(content as unknown as Record<string, { levels: { safeRadius: number }[] }>)["sink.core"]!.levels.map((l) => l.safeRadius));
const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const PER = Number(arg("--per", "1")), L20 = Number(arg("--l20", "20")), OUT = arg("--json", "");
const root = fileURLToPath(new URL("../levels/packs/", import.meta.url));

/** Not placed: walls, zones, the scrap fuel scatter (no model tall enough to hide a pad, no pads), wall-line gates. */
const SKIP = new Set(["node.fuel_scrap", "pad", "pad.big"]);


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
{
  const main = runs.filter((x) => x.v === VARIANTS[0]!.name && !x.r.rejected);
  const ws = wallStrip(), sides: Record<string, number> = {}, vars: Record<string, Record<string, number>> = {};
  let relaxed = 0, packedSeeds = 0, pieces = 0, medics = 0, walled = 0;
  for (const x of main) {
    if (x.r.walls) walled++;
    if (x.r.medic) medics++;
    relaxed += x.r.stats.scrapRelaxed; packedSeeds += x.r.stats.scrapPacked;
    for (const [, sc] of Object.entries(x.r.scrap)) { pieces++; sides[sc.side] = (sides[sc.side] ?? 0) + 1; (vars[sc.variant] ??= {})[sc.side] = ((vars[sc.variant] ??= {})[sc.side] ?? 0) + 1; }
  }
  console.log(`wall strip from the centre line (south, east): ${ws.s}, ${ws.e}; wall half thickness ${WALL_HALF.toFixed(1)}; gate strip: ${JSON.stringify(gateStrip())}`);
  console.log("scrap strips beyond own back face (s, e) per variant:", JSON.stringify([1, 2, 3].map((v) => [v, scrapStrip(v)])), "wall back-face strip:", (ws.s - WALL_HALF).toFixed(1));
  console.log(`placed seeds: walled ${walled}, with a medic pad ${medics}; scrap pieces ${pieces}, relaxed range ${relaxed}, seeds repacked from the north-west ${packedSeeds}; by side ${JSON.stringify(sides)}; by variant ${JSON.stringify(vars)}; default scrap range ${SCRAP_RANGE}`);
  const gaps: number[] = [];
  for (const x of main) if (x.r.walls) for (const sc of Object.values(x.r.scrap)) gaps.push(Math.min(...x.r.walls.gates.map((g) => Math.hypot(sc.at[0] - x.r.walls!.points[g]![0], sc.at[1] - x.r.walls!.points[g]![1]))));
  gaps.sort((a, b) => a - b);
  console.log("scrap to section start of nearest gate in the new layouts (min/median/max):", gaps[0]?.toFixed(0), gaps[gaps.length >> 1]?.toFixed(0), gaps[gaps.length - 1]?.toFixed(0));
}

// Stacked pads: pads of one building live one after another share a spot; pads live at the same time stand side by side on its next spots.
const stackOverlaps: { level: string; building: string; a: string; b: string }[] = [];
for (const l of levels) for (const p of conv.get(l.id)!.overlapPairs) stackOverlaps.push({ level: l.id, ...p });
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
