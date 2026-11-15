// Pads visible for their whole life (Doug, 2026-11-15). Walls and wall-line gates are not counted as occluders.
//   pnpm vite-node tools/pad-life.ts -- measure [--levels s1-L025,...] [--out f.json]
//   pnpm vite-node tools/pad-life.ts -- repair --levels s1-L025,... --out-dir <dir>   (writes repaired level files, prints moves)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lifetimeVisibility, padTimeline, repairPads, type Manifest } from "../packages/generator/src/padRepair.js";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const root = join(import.meta.dirname, "..");
const files: { id: string; path: string; n: number }[] = [];
for (const f of readdirSync(join(root, "levels/story")).filter((x) => /^story-L\d+\.json$/.test(x)).sort()) files.push({ id: f.replace(".json", ""), path: join(root, "levels/story", f), n: Number(f.match(/\d+/)![0]) });
const pack = JSON.parse(readFileSync(join(root, "levels/packs/s1/pack.json"), "utf8")) as { levels: { id: string; file: string }[] };
pack.levels.forEach((l, i) => files.push({ id: l.id, path: join(root, "levels/packs/s1", l.file), n: 6 + i }));
const want = arg("--levels")?.split(",");
const sel = files.filter((f) => !want || want.includes(f.id));

if (argv[0] === "measure") {
  const out: Record<string, unknown> = {};
  for (const f of sel) {
    const t0 = Date.now();
    const m = JSON.parse(readFileSync(f.path, "utf8")) as Manifest;
    const v = lifetimeVisibility(m);
    const hid = v.filter((p) => p.class === "hidden"), part = v.filter((p) => p.class === "partly");
    out[f.id] = { level: f.n, hidden: hid.length, partly: part.length, hiddenPads: hid.map((p) => `${p.id}:${p.hidden}:${p.by}`), partlyPads: part.map((p) => `${p.id}:${p.hidden}:${p.by}`), s: (Date.now() - t0) / 1000 };
    console.log(`Level ${f.n} (${f.id}): hidden ${hid.length} partly ${part.length} ${[...hid, ...part].map((p) => `${p.id}=${p.hidden}/${p.by}`).join(" ")} [${(Date.now() - t0) / 1000}s]`);
  }
  if (arg("--out")) writeFileSync(arg("--out")!, JSON.stringify(out, null, 1));
} else if (argv[0] === "repair") {
  const dir = arg("--out-dir")!;
  mkdirSync(dir, { recursive: true });
  const report: Record<string, unknown> = {};
  for (const f of sel) {
    const m = JSON.parse(readFileSync(f.path, "utf8")) as Manifest;
    const win = padTimeline(m);
    const r = repairPads(m, win, { push: !argv.includes("--no-push") });
    report[f.id] = { level: f.n, moves: r.moves, pushes: r.pushes, unresolved: r.unresolved };
    console.log(`Level ${f.n} (${f.id}): ${r.moves.length} moved, ${r.unresolved.length} left`);
    for (const mv of r.moves) console.log(`  moved ${mv.pads.join("+")} ${mv.from} -> ${mv.to} (owner ${mv.owner}, r ${mv.r}, moved ${mv.moved})`);
    for (const p of r.pushes) console.log(`  PUSHED ${p.what.join("+")} ${p.units} units ${p.dir} for ${p.for.join("+")} with pads ${p.pads.join(",") || "none"}`);
    for (const u of r.unresolved) console.log(`  LEFT ${u.pads.join("+")} at ${u.at} hidden ${u.hidden} by ${u.by}: ${u.why}`);
    if (r.moves.length || r.pushes.length) writeFileSync(join(dir, f.path.split(/[\\/]/).pop()!), JSON.stringify(r.manifest, null, 2) + "\n");
  }
  writeFileSync(join(dir, "repair-report.json"), JSON.stringify(report, null, 1));
}
