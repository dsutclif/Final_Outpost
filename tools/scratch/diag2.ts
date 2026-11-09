import { readFileSync } from "node:fs";
import { PROFILES, playBot } from "../../packages/bots/src/index.js";
const id = process.argv[2] ?? "s1-L037";
const m = JSON.parse(readFileSync(`levels/packs/s1/${id}.json`, "utf8")); if (process.env.SPY) m.params = { ...m.params, "defense.spawnY": Number(process.env.SPY) };
let last = 0;
const r = playBot(m, PROFILES.good!, 1, { timeBudgetSeconds: 900, onTick: (st: any, _b: any, ev: any[]) => {
  for (const e of ev) if (e.t === "wave_started" || e.t === "wave_cleared" || e.t === "barrier_broken") console.log(Math.round(st.tick / 30) + "s", e.t, e.idx ?? "", "hostiles", st.hostiles.length);
  if (st.tick - last >= 600) { last = st.tick; const byT: any = {}; for (const h of st.hostiles) byT[h.target] = (byT[h.target] ?? 0) + 1; console.log(Math.round(st.tick / 30) + "s", "hostiles", st.hostiles.length, JSON.stringify(byT), "gate", st.barriers[0]?.sections.filter((s: any) => s.gate).map((s: any) => s.hp).join("/"), "base", st.meters.baseHealth); }
} } as any);
console.log(r.won, r.reason);
