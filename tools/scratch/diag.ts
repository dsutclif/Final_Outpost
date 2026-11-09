import { readFileSync } from "node:fs";
import { PROFILES, playBot } from "../../packages/bots/src/index.js";
const id = process.argv[2] ?? "s1-L015";
const m = JSON.parse(readFileSync(`levels/packs/s1/${id}.json`, "utf8"));
const cnt: Record<string, number> = {};
const r = playBot(m, PROFILES.good!, 1, { timeBudgetSeconds: 900, onTick: (st: any, _b: any, ev: any[]) => { for (const e of ev) { const k = e.t + (e.by ? ":" + e.by : "") + (e.target ? ":" + e.target : ""); cnt[k] = (cnt[k] ?? 0) + 1; } } } as any);
console.log(id, r.won, r.reason, Math.round(r.ticks / 30) + "s", JSON.stringify(m.waves?.length));
console.log(JSON.stringify(cnt));
