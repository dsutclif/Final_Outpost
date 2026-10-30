import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";

// pnpm levels:start-table <raw log> [<raw log> ...]
//
// From levels/candidates/<pack>.jsonl, the median D each goal reached per pressure bin, written to
// packages/generator/data/start.json. The search starts where the table says a goal lands nearest its
// target, so it spends fewer iterations getting there. Rerun after a full build on a new engine.

const BIN = 0.1, MIN_SAMPLES = 3;

interface Row { goalType: string; p: number; engine: string; rating?: { D: number } }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]!; };

/** Per goal, [pressure, median D] rows from the given engine's rated candidates. */
export function startTable(rows: readonly Row[], engine: string): Record<string, [number, number][]> {
  const bins = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.rating || r.engine !== engine) continue;
    const k = `${r.goalType}|${Math.round(Math.floor(r.p / BIN + 1e-9) * BIN * 10) / 10}`;
    bins.set(k, [...(bins.get(k) ?? []), r.rating.D]);
  }
  const out: Record<string, [number, number][]> = {};
  for (const [k, ds] of [...bins].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (ds.length < MIN_SAMPLES) continue;
    const [goal, p] = k.split("|") as [string, string];
    (out[goal] ??= []).push([Math.round((Number(p) + BIN / 2) * 100) / 100, Math.round(median(ds) * 1000) / 1000]);
  }
  return out;
}

if (process.argv.includes("--write")) {
  const files = process.argv.slice(process.argv.indexOf("--write") + 1);
  const rows = files.flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l) as Row));
  const table = startTable(rows, ENGINE_VERSION);
  const path = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "packages", "generator", "data", "start.json");
  writeFileSync(path, JSON.stringify({ engine: ENGINE_VERSION, goals: table }, null, 1) + "\n");
  console.log(`${Object.keys(table).length} goals written from ${rows.length} candidates`);
}
