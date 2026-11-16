import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { historyEntry, measure, ratingDetail, type HistoryEntry } from "../packages/rater/src/index.js";

// pnpm exec vite-node tools/rerate-margin.ts -- <out.json> [--only id,id]
// Replay-only re-rating of every defend level (waves > 0) of the shipped s1 pack: rates each with the current
// bots/rater, in pack order with the earlier levels as history (as in generation), and writes D, F, ok, the
// ladder rungs that pass, plus each rung's win rate and mean margin. Reads levels/packs only; writes nothing there.
// Run it on two checkouts (before/after a rater change) and diff the two outputs.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const out = args[0]!;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1]!.split(",") : null;
const dir = join(root, "levels", "packs", "s1");
const pack = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8")) as { levels: { id: string; file: string }[] };
const history: HistoryEntry[] = [];
const rows: unknown[] = [];
pack.levels.forEach((l, i) => {
  const m = JSON.parse(readFileSync(join(dir, l.file), "utf8")) as { id: string; waves?: unknown[]; rating?: Record<string, unknown> };
  if ((m.waves ?? []).length > 0 && (!only || only.includes(l.id))) {
    const d = ratingDetail(measure(m, { history }));
    const rungs: Record<string, { winRate: number; meanMargin: number; meanStars: number }> = {};
    for (const [p, r] of Object.entries(d.runs)) { const x = r as { winRate: number; meanMargin: number; meanStars: number }; rungs[p] = { winRate: x.winRate, meanMargin: x.meanMargin, meanStars: x.meanStars }; }
    rows.push({ id: l.id, level: i + 1, D: d.D, F: d.F, ok: d.ok, botsPassed: d.botsPassed, pinned: m.rating ?? null, rungs });
    console.log(`${l.id} #${i + 1} D=${d.D} F=${d.F}`);
  }
  history.push(historyEntry(m));
});
writeFileSync(out, JSON.stringify(rows, null, 1) + "\n");
