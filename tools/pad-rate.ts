// Rate level files the way the pack build does (generator reference, full seed counts, history = the pack's earlier levels).
//   pnpm vite-node tools/pad-rate.ts -- <label> <file.json> [...more]      prints one JSON line per file
import { readFileSync } from "node:fs";
import { evalManifest, historyEntry, type HistoryEntry } from "../packages/rater/src/index.js";
import { GENERATOR_REFERENCE, GEN } from "../packages/generator/src/index.js";
import { LADDER } from "../packages/bots/src/index.js";

const [label, ...files] = process.argv.slice(2).filter((a) => a !== "--");
const pack = JSON.parse(readFileSync("levels/packs/s1/pack.json", "utf8")) as { levels: { id: string; file: string; target: number }[] };
const full = GEN.search.fullSeeds;
for (const f of files) {
  const m = JSON.parse(readFileSync(f, "utf8")) as { id: string; rating?: { difficulty: number } };
  const history: HistoryEntry[] = [];
  let target = NaN;
  for (const l of pack.levels) {
    if (l.id === m.id) { target = l.target; break; }
    history.push(historyEntry(JSON.parse(readFileSync(`levels/packs/s1/${l.file}`, "utf8"))));
  }
  const t0 = Date.now();
  const d = evalManifest(m, { history, reference: GENERATOR_REFERENCE, refSeeds: full.ref, otherSeeds: full.other });
  const wins = Object.fromEntries(LADDER.map((p) => [p.name, Math.round((d.runs[p.name]?.winRate ?? 0) * 100) / 100]));
  const failed = Object.entries(d.filters as unknown as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k);
  console.log(JSON.stringify({ label, id: m.id, target, recorded: m.rating?.difficulty, D: Math.round(d.D * 1000) / 1000, ok: d.ok, botsPassed: d.botsPassed, wins, failed, s: Math.round((Date.now() - t0) / 1000) }));
}
