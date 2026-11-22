import { readFileSync } from "node:fs";
import { LADDER, PROFILES } from "../packages/bots/src/index.js";
import { judgmentShare, repin, s1Metrics, strategyGap } from "../packages/rater/src/index.js";
import { applyDefendS1 } from "../packages/generator/src/defendS1.js";

// Defend S3 replay (outpost-ops#273): one manifest with the S1/S2 switches on (maxLive 2, gap 20, random sides, coin towers when
// the level has them), exact replays per rung (good 4 seeds, the others 2), then judgmentShare and strategyGap. Report only.
//   pnpm exec vite-node tools/defend-judgment.ts -- manifest.json [--coin-towers] [--gap 20] [--max-live 2] [--off]
const args = process.argv.slice(2).filter((a) => a !== "--");
const val = (n: string, d: number): number => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const file = args.find((a) => a.endsWith(".json"))!;
let m = repin(JSON.parse(readFileSync(file, "utf8"))) as Record<string, any>;
if (!args.includes("--off")) {
  m = applyDefendS1(m, { gap: val("gap", 20), maxLive: val("max-live", 2), ...(args.includes("--coin-towers") ? { coinTowers: true, currencyPerSalvage: 1.5 } : {}) }) as Record<string, any>;
  const pool = [...new Set(((m["waves"] ?? []) as any[]).flatMap((w) => (Array.isArray(w.side) ? w.side : w.side ? [w.side] : ["n"])))];
  m["params"] = { ...m["params"], "defense.sideMode": 1, "defense.warnSeconds": 6 };
  for (const w of (m["waves"] ?? []) as any[]) w.side = pool;
}
console.log(`${m["id"]}  ${(m["waves"] ?? []).length} waves${args.includes("--off") ? " (switches off)" : ""}`);
for (const p of [...LADDER, PROFILES["human"]!]) {
  const n = p.name === "good" ? 4 : 2;
  const row: string[] = [];
  let picks = "";
  for (let seed = 1; seed <= n; seed++) {
    const { result: r } = s1Metrics(m, p, seed);
    row.push(`${r.won ? "W" : "L"} ${r.margin.toFixed(2)}`);
    if (seed === 1 && r.judge) picks = `${r.judge.hits}/${r.judge.n} best; ${r.judge.picks.map((s) => s[0]).join("")}`;
  }
  console.log(`  ${p.name.padEnd(8)} ${row.join(" | ")}   ${picks}`);
}
const js = judgmentShare(m, [1, 2]);
console.log(`  judgmentShare ${js.share === null ? "n/a (no good-to-floor spread)" : js.share.toFixed(2)}  (good ${js.good.toFixed(2)}, floor ${js.floor.toFixed(2)}, good at floor judgment ${js.goodAtFloorJudgment.toFixed(2)})`);
const sg = strategyGap(m);
console.log(`  strategyGap ${JSON.stringify(sg).slice(0, 400)}`);
