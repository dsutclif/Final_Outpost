import { readFileSync } from "node:fs";
import { PROFILES, playBot } from "../../packages/bots/src/index.js";
const id = process.argv[2]!;
const m = JSON.parse(readFileSync(`levels/packs/s1/${id}.json`, "utf8"));
for (const p of ["good", "average"]) for (const seed of [1, 2]) {
  let salv = 0, inj = 0, hp = 99;
  const r = playBot(m, PROFILES[p]!, seed, { timeBudgetSeconds: 900, onTick: (st: any) => { salv = st.stats.salvage; inj = st.stats.injured; hp = Math.min(hp, st.meters.baseHealth); } } as any);
  console.log(id, p, seed, r.won, r.reason, "salvage", salv, "injured", inj, "minBase", hp, "stars", r.stars, Math.round(r.ticks / 30));
}
