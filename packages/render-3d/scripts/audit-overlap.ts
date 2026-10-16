import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { content } from "@fo/content";
import { createBuildCtx } from "../src/assets/context.js";
import { buildModel, hasModel } from "../src/assets/registry.js";
import { ART_M } from "../src/units.js";
import { marsGreenhouse } from "@fo/skins";
import { Box3 } from "three";

// pnpm --filter @fo/render-3d exec vite-node scripts/audit-overlap.ts -- [--pack levels/packs/s1] [--gap 4] [--verbose]
//
// Lists objects that overlap on the ground in every level of a pack, using each 3D model's real
// footprint (its x/z bounds at ART_M): buildings, converters with their trays and operator plates,
// the reactor, the kiosk, hire and build pads, and what each build pad turns into once paid.
// Gatherable nodes may touch each other (fuel forests are packed on purpose) but not anything else.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const argv = process.argv.slice(2);
const arg = (n: string, d: string): string => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const packDir = resolve(root, arg("--pack", "levels/packs/s1"));
const gap = Number(arg("--gap", "4"));
const verbose = argv.includes("--verbose");

type Rect = { id: string; kind: string; x0: number; z0: number; x1: number; z1: number };
const ctx = createBuildCtx(marsGreenhouse);
const foot = new Map<string, { x0: number; z0: number; x1: number; z1: number }>();
function footprint(id: string): { x0: number; z0: number; x1: number; z1: number } {
  let f = foot.get(id);
  if (!f) {
    const m = buildModel(id, ctx);
    m.root.updateMatrixWorld(true);
    const b = new Box3().setFromObject(m.root);
    f = { x0: b.min.x * ART_M, z0: b.min.z * ART_M, x1: b.max.x * ART_M, z1: b.max.z * ART_M };
    foot.set(id, f);
  }
  return f;
}
const rectAt = (id: string, kind: string, model: string, x: number, z: number): Rect => {
  const f = footprint(model);
  return { id, kind, x0: x + f.x0, z0: z + f.z0, x1: x + f.x1, z1: z + f.z1 };
};

const files = readdirSync(packDir).filter((f) => /^[a-z0-9]+-L\d+\.json$/.test(f)).sort();
let total = 0;
const byKind = new Map<string, number>();
for (const f of files) {
  const m = JSON.parse(readFileSync(join(packDir, f), "utf8")) as { entities: Record<string, unknown>[] };
  const rects: Rect[] = [];
  for (const e of m.entities) {
    const id = String(e["id"] ?? e["type"]), type = String(e["type"]);
    const at = e["at"] as [number, number] | undefined;
    if (!at) continue;
    if (type.startsWith("node.")) rects.push(rectAt(id, "node", type, at[0], at[1]));
    else if (type === "sink.core" || type === "sink.sales_point") rects.push(rectAt(id, type, type, at[0], at[1]));
    else if (type === "pad.hire" || type === "pad.build") {
      const build = String(e["build"] ?? "");
      const big = e["big"] === true;
      // a pad's plate, or what it builds once paid, whichever is bigger
      const plate = rectAt(id, "pad", type, at[0], at[1]);
      // an unlock pad sits on the node it unlocks by design
      if (build === "node.enable" && e["target"]) plate.id = `${String(e["target"])}>${id}`;
      if (big) { const k = 1.4; plate.x0 = at[0] + (plate.x0 - at[0]) * k; plate.x1 = at[0] + (plate.x1 - at[0]) * k; plate.z0 = at[1] + (plate.z0 - at[1]) * k; plate.z1 = at[1] + (plate.z1 - at[1]) * k; }
      rects.push(plate);
      if (type === "pad.build" && hasModel(build) && !content.upgrades[build]) rects.push(rectAt(`${id}>${build}`, "built", build, at[0], at[1]));
    }
  }
  const hits: string[] = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i]!, b = rects[j]!;
    if (a.kind === "node" && b.kind === "node") continue;
    const base = (s: string): string => s.split(">")[0]!;
    if (base(a.id) === base(b.id)) continue; // a pad and what it builds share the spot by design
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    if (ox > gap && oz > gap) {
      hits.push(`${a.id}(${a.kind}) x ${b.id}(${b.kind}) ${Math.round(ox)}x${Math.round(oz)}`);
      const k = [a.kind, b.kind].sort().join("+");
      byKind.set(k, (byKind.get(k) ?? 0) + 1);
    }
  }
  total += hits.length;
  if (hits.length) console.log(`${f}: ${hits.length}${verbose ? "\n  " + hits.join("\n  ") : ""}`);
}
console.log(`\n${total} overlapping pairs in ${files.length} levels`);
console.log([...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${k}: ${n}`).join("\n"));
console.log("\nfootprints (w x d, world units):");
for (const [id, f] of [...foot.entries()].sort()) console.log(`  ${id}: ${Math.round(f.x1 - f.x0)} x ${Math.round(f.z1 - f.z0)}  [${[f.x0, f.z0, f.x1, f.z1].map((v) => Math.round(v)).join(", ")}]`);
