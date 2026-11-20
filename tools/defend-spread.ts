import { readFileSync, writeFileSync } from "node:fs";
import { LADDER } from "../packages/bots/src/index.js";
import { repin, s1Metrics } from "../packages/rater/src/index.js";
import { applyDefendS1 } from "../packages/generator/src/defendS1.js";

// Defend redesign S1 spread check (outpost-ops#264 section 4): override a logged manifest's waves and rate it on the build's
// own seeds (good 4, the other rungs 2: 12 runs, floor included as in the build). No level build.
//   pnpm exec vite-node tools/defend-spread.ts -- manifest.json [--gap 20] [--max-live 2] [--coin-towers] [--cps 1.5] [--good-seeds 4] [--other-seeds 2] [--json out.json]
// Pass: good wins every run with margin >= 0.2 and at least two of average/weak/novice lose a run.
const args = process.argv.slice(2).filter((a) => a !== "--");
const val = (n: string): string | undefined => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => a.endsWith(".json") && args[i - 1] !== "--json");
if (!file) { console.error("usage: defend-spread.ts manifest.json [--gap S] [--max-live N] [--coin-towers] [--cps X] [--json out.json]"); process.exit(1); }
const opt: Parameters<typeof applyDefendS1>[1] = {};
if (val("gap")) opt.gap = Number(val("gap"));
if (val("max-live")) opt.maxLive = Number(val("max-live"));
if (args.includes("--coin-towers")) { opt.coinTowers = true; opt.currencyPerSalvage = Number(val("cps") ?? 1.5); }
const m = applyDefendS1(repin(JSON.parse(readFileSync(file, "utf8"))), opt);
const goodSeeds = Number(val("good-seeds") ?? 4), otherSeeds = Number(val("other-seeds") ?? 2);
const rows: { bot: string; seed: number; won: boolean; reason: string; margin: number; live: number; overlapS: number; coins: number }[] = [];
for (const p of LADDER) {
  const n = p.name === "good" ? goodSeeds : otherSeeds;
  for (let seed = 1; seed <= n; seed++) {
    const { metrics, result } = s1Metrics(m, p, seed);
    rows.push({ bot: p.name, seed, won: result.won, reason: result.reason, margin: Number(result.margin.toFixed(3)), live: metrics.liveWavesPeak, overlapS: Number(metrics.overlapSeconds.toFixed(1)), coins: Number(metrics.coinsToDefence.toFixed(2)) });
    const r = rows.at(-1)!;
    console.log(`${r.bot.padEnd(8)} seed ${r.seed}  ${r.won ? "won " : "LOST"} ${r.reason.padEnd(8)} margin ${r.margin.toFixed(3)}  livePeak ${r.live}  overlap ${r.overlapS}s  coinsToDefence ${r.coins}`);
  }
}
const good = rows.filter((r) => r.bot === "good");
const goodOk = good.every((r) => r.won && r.margin >= 0.2);
const losers = ["average", "weak", "novice"].filter((b) => rows.some((r) => r.bot === b && !r.won));
const pass = goodOk && losers.length >= 2;
console.log(`${m.id}  good all won with margin >= 0.2: ${goodOk} (min margin ${Math.min(...good.map((r) => r.margin)).toFixed(3)});  average/weak/novice losing a run: ${losers.join(",") || "none"} (${losers.length})  => ${pass ? "PASS" : "FAIL"}`);
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1]!, JSON.stringify({ id: m.id, options: opt, rows, goodOk, losers, pass }, null, 1) + "\n");
