import { readFileSync } from "node:fs";
import { STRATEGIES, playBot, strategyProfile } from "../packages/bots/src/index.js";
import { repin, strategyGap } from "../packages/rater/src/index.js";
import { applyDefendS1 } from "../packages/generator/src/defendS1.js";

// Defend S4 diagnostic: do the strategy bots get to build before the waves arrive? Per strategy (seed 1): tick of the first defence
// purchase (tower/barracks built, guard hired), tick the first wave starts, and the S0 breaking multiplier. No placement, no ladder.
//   pnpm exec vite-node tools/defend-timing.ts -- manifest.json
const file = process.argv.slice(2).find((a) => a.endsWith(".json"))!;
const base = repin(JSON.parse(readFileSync(file, "utf8"))) as Record<string, any>;
const variants: [string, Record<string, any>][] = [
  ["(a) today's timing, maxLive 1", base],
  ["(b) maxLive 2, today's gaps", applyDefendS1(base, { maxLive: 2, overlapMin: 6 }) as Record<string, any>],
  ["(c) maxLive 2, gap 20, wave 0 at its own time", applyDefendS1(base, { maxLive: 2, overlapMin: 6, gap: 20 }) as Record<string, any>],
];
console.log(`${base["id"]}  wave times (a) ${base["waves"].map((w: any) => w.t).join(",")}  (c) ${variants[2]![1]["waves"].map((w: any) => w.t).join(",")}`);
for (const [name, m] of variants) {
  console.log(name);
  for (const s of STRATEGIES) {
    let firstBuy = -1, firstWave = -1, buys = 0;
    const r = playBot(m, strategyProfile(s), 1, {
      onTick: (st, _b, evs) => {
        if (firstWave < 0 && st.waves.idx > 0) firstWave = st.tick;
        for (const e of evs) if ((e.t === "built" && /tower|barracks/.test(e.pad)) || (e.t === "hired" && /train/.test(String((e as any).pad ?? "")))) { buys++; if (firstBuy < 0) firstBuy = st.tick; }
      },
    });
    console.log(`  ${s.padEnd(14)} first defence purchase tick ${firstBuy}  wave 0 starts tick ${firstWave}  purchases ${buys}  ${r.won ? "W" : "L"} ${r.margin.toFixed(2)}  ticks ${r.ticks}`);
  }
  const g = strategyGap(m);
  console.log(`  S0 breaking multiplier ${STRATEGIES.map((s) => `${s} ${g.multipliers[s]!.toFixed(2)}`).join("  ")}  strategyGap ${g.gap.toFixed(3)}`);
}
