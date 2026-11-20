import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { GENERATOR_REFERENCE } from "../packages/generator/src/index.js";
import { rerate } from "./rerate-log.js";
import { DEFAULT_CONFIG, compareVersions, estimateD, type Family, type GoalRange } from "../packages/sequencer/src/index.js";

// Goal ranges (ops docs/reference/composer.md): recompute each goal's winnable D range from build logs
// (levels/candidates/*.jsonl[.gz], the #251 archives) and level pools (level-pool.json), so the ranges in
// sequencer.json are never typed by hand. A sample is a rated, feasible candidate (or a pool entry): its D
// less the composer estimate (mid) of the features it carried. Unwinnable candidates (quick or full
// bot runs all lost) are counted as `lost`. A bound is only a limit where the search was asked past it:
// hi counts when some slot of that goal had a target above the highest winnable D by more than --tol
// (asked for more, never got it winnably); lo likewise below. Otherwise that side stays open (null).
//
//   vite-node tools/goal-ranges.ts -- <file or folder>... [--min-engine 0.35.0] [--min-n 3] [--exclude g,g] [--keep] [--write]

const args = process.argv.slice(2).filter((a) => a !== "--");
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1]! : d; };
const minEngine = opt("--min-engine", "0.35.0");
const minN = Number(opt("--min-n", "3"));
const tol = Number(opt("--tol", "0.05"));
const write = args.includes("--write");
const keep = args.includes("--keep"); // keep existing entries of goals these inputs do not cover (not re-measured)
const exclude = opt("--exclude", "").split(",").filter(Boolean); // goals that never get a range (e.g. stuck at ~0)
// --rerate <old reference.json>: candidate rows' D is re-derived from the log (tools/rerate-log.ts) under the current reference; pool files are read as saved
const oldRefPath = opt("--rerate", "");
const oldRef = oldRefPath ? JSON.parse(readFileSync(oldRefPath, "utf8")) : null;
const inputs = args.filter((a) => !a.startsWith("--"));

interface Sample { goal: string; D: number | null; res: number | null; target?: number; machines?: number; src: string }
const samples: Sample[] = [];

const files = (p: string): string[] => statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => files(join(p, f))) : [p];
const goalOf = (row: { recipeId?: string; goalType?: string }) => /\|g:([^|]+)/.exec(row.recipeId ?? "")?.[1] ?? row.goalType ?? "";
const okEngine = (e: unknown) => typeof e === "string" && compareVersions(e, minEngine) >= 0;

for (const f of inputs.flatMap(files)) {
  if (f.endsWith(".json")) {
    // a level pool: every entry passed every check but the target, so it is winnable
    const pool = JSON.parse(readFileSync(f, "utf8")) as { entries?: { goalId: string; D: number; family: Family; features: string[]; engine: string }[] };
    for (const e of Array.isArray(pool.entries) ? pool.entries : []) if (okEngine(e.engine) && Array.isArray(e.features)) samples.push({ goal: e.goalId, D: e.D, res: e.D - estimateD(e.family, e.features).mid, src: "pool", ...(typeof (e as any).slotTarget === "number" ? { target: (e as any).slotTarget } : {}) });
    continue;
  }
  if (!/\.jsonl(\.gz)?$/.test(f)) continue;
  const text = (f.endsWith(".gz") ? gunzipSync(readFileSync(f)) : readFileSync(f)).toString("utf8");
  for (const line of text.split("\n")) {
    if (!line.includes('"recipeId"')) continue;
    let row: Record<string, any>;
    try { row = JSON.parse(line); } catch { continue; }
    if (!okEngine(row.engine) || row.kind) continue;
    const goal = goalOf(row);
    const machines = row.settings?.goal?.machines as number | undefined;
    const target = typeof row.target === "number" ? { target: row.target as number } : {};
    if (row.rating?.feasible === true && typeof row.rating.D === "number") {
      const D = oldRef ? rerate(row as never, oldRef, GENERATOR_REFERENCE)?.Dnew ?? null : row.rating.D;
      if (D === null) continue;
      samples.push({ goal, D, res: D - estimateD(row.family, row.features ?? []).mid, ...target, ...(machines ? { machines } : {}), src: f });
    } else if ((row.rejects ?? []).includes("infeasible")) samples.push({ goal, D: null, res: null, ...target, ...(machines ? { machines } : {}), src: f });
  }
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const ranges: Record<string, GoalRange> = {};
const goals = [...new Set(samples.map((s) => s.goal))].filter((g) => DEFAULT_CONFIG.goals[g] && !exclude.includes(g)).sort();
console.log("goal                   n  lost   D lo   D hi  res lo res hi  asked     limit");
for (const g of goals) {
  const won = samples.filter((s) => s.goal === g && s.res !== null);
  const lost = samples.filter((s) => s.goal === g && s.res === null).length;
  const Ds = won.map((s) => s.D!), rs = won.map((s) => s.res!);
  const row = won.length ? [r3(Math.min(...Ds)), r3(Math.max(...Ds)), r3(Math.min(...rs)), r3(Math.max(...rs))] : [];
  const Ts = samples.filter((s) => s.goal === g && s.target !== undefined).map((s) => s.target!);
  const capHi = won.length > 0 && Ts.some((t) => t > row[1]! + tol), capLo = won.length > 0 && Ts.some((t) => t < row[0]! - tol);
  const asked = Ts.length ? `${r3(Math.min(...Ts))}-${r3(Math.max(...Ts))}` : "-";
  console.log(`${g.padEnd(20)} ${String(won.length).padStart(4)} ${String(lost).padStart(5)}  ${row.map((x) => x.toFixed(3).padStart(6)).join(" ")}  ${asked.padEnd(11)} ${capLo ? "lo" : "  "} ${capHi ? "hi" : ""}`);
  if (won.length >= minN && (capLo || capHi)) ranges[g] = { lo: capLo ? row[2]! : null, hi: capHi ? row[3]! : null, n: won.length, lost };
  // automate: the same table per machine count (the dial)
  const ms = [...new Set(samples.filter((s) => s.goal === g && s.machines).map((s) => s.machines!))].sort();
  if (ms.length > 1) for (const m of ms) {
    const w = won.filter((s) => s.machines === m).map((s) => s.D!);
    console.log(`  machines ${m}: won ${w.length} (D ${w.length ? `${r3(Math.min(...w))}-${r3(Math.max(...w))}` : "-"}), lost ${samples.filter((s) => s.goal === g && s.machines === m && s.res === null).length}`);
  }
}

if (write) {
  const path = join(import.meta.dirname ?? __dirname, "..", "packages", "sequencer", "data", "sequencer.json");
  if (!existsSync(path)) throw new Error(`no ${path}`);
  const lines = readFileSync(path, "utf8").split("\n");
  if (keep) for (const [g, r] of Object.entries((JSON.parse(readFileSync(path, "utf8")).goalRanges ?? {}) as Record<string, GoalRange>)) if (g !== "_doc" && !(g in ranges) && !(goals.includes(g) && samples.filter((x) => x.goal === g && x.res !== null).length >= minN)) ranges[g] = r;
  const block = [
    `  "goalRanges": {`,
    `    "_doc": "Written by tools/goal-ranges.ts from build logs and level pools (engine ${minEngine}+, at least ${minN} winnable samples): per goal id, winnable D less the composer estimate (mid) of the features each sample carried; n winnable, lost unwinnable. A side is set only where a slot asked for more than ${tol} past it; null and unlisted goals are never ruled out on that side. Rules in ops docs/reference/composer.md.",`,
    ...Object.entries(ranges).map(([g, r], i, a) => `    ${JSON.stringify(g)}: ${JSON.stringify(r)}${i < a.length - 1 ? "," : ""}`),
    `  },`,
  ];
  const at = lines.findIndex((l) => l.startsWith(`  "goalRanges": {`));
  if (at >= 0) {
    const end = lines.findIndex((l, i) => i > at && /^  \},?\s*$/.test(l));
    lines.splice(at, end - at + 1, ...block);
  } else {
    const notes = lines.findIndex((l) => l.startsWith(`  "notes":`));
    lines.splice(notes, 0, ...block);
  }
  writeFileSync(path, lines.join("\n"));
  JSON.parse(readFileSync(path, "utf8"));
  console.log(`wrote ${Object.keys(ranges).length} goal ranges to ${path}`);
}
