import { readFileSync } from "node:fs";
import { repin, sideMetrics } from "../packages/rater/src/index.js";
import { PROFILES, STRATEGIES, strategyProfile } from "../packages/bots/src/index.js";

// Defend redesign S2 (outpost-ops#273): replay one logged candidate with random attack sides (defense.sideMode 1) on, and
// report sideReadTime, wrongSideShare and the bot's win/loss per rung (the ladder's profiles) and per fixed strategy. Report only.
// pnpm exec vite-node tools/defend-sides.ts -- manifest.json [--seed 1] [--off]   (--off: the same replay in rotate mode)
const args = process.argv.slice(2).filter((a) => a !== "--");
const flag = (n: string, d: number): number => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const file = args.find((a) => a.endsWith(".json"));
if (!file) { console.error("usage: defend-sides.ts manifest.json [--seed N] [--off]"); process.exit(1); }
const m = repin(JSON.parse(readFileSync(file, "utf8"))) as Record<string, any>;
const seed = flag("seed", 1);
if (!args.includes("--off")) {
  const pool = [...new Set(((m["waves"] ?? []) as any[]).flatMap((w) => (Array.isArray(w.side) ? w.side : w.side ? [w.side] : ["n"])))];
  m["params"] = { ...m["params"], "defense.sideMode": 1, "defense.warnSeconds": 6 };
  for (const w of (m["waves"] ?? []) as any[]) w.side = pool;
  console.log(`${m["id"]}  random sides on, pool ${pool.join("")}, ${(m["waves"] ?? []).length} waves, seed ${seed}`);
} else console.log(`${m["id"]}  rotate (off), seed ${seed}`);
const rows: [string, ReturnType<typeof strategyProfile>][] = [...Object.entries(PROFILES).map(([k, p]) => [k, p] as [string, any]), ...STRATEGIES.map((s) => [`strategy:${s}`, strategyProfile(s)] as [string, any])];
for (const [name, p] of rows) {
  const t0 = Date.now();
  const r = sideMetrics(m, p, seed);
  console.log(`  ${name.padEnd(24)} ${r.won ? "WIN " : "LOSS"}  warned ${String(r.warned).padStart(2)}  sideReadTime ${r.sideReadTime === null ? "-" : r.sideReadTime.toFixed(2) + " s"}  wrongSideShare ${r.wrongSideShare === null ? "-" : r.wrongSideShare.toFixed(2)}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
