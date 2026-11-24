import { content } from "../packages/content/src/index.js";
import { TPS } from "../packages/sim/src/fixed.js";
import { playBot, strategyProfile, LADDER, type Strategy } from "../packages/bots/src/index.js";
import { loadLevel, shapeWaves, type SimStrategy, type Variant } from "./defend-lib.js";

// Defend sim trace (outpost-ops#350, F2): one bot run of a defend level, logged every 5 s: attackers alive / at the gate, kills by source,
// attacker hits by target (gate, base, guard, commander), guards alive, commander downs, gate and base hp. Used to see why the model holds
// a wave the sim loses.
//   pnpm exec vite-node tools/defend-trace.ts -- --level scratch-L021 --variant s1 --strategy turrets_first --seed 1 --mult 1,1,5
const args = process.argv.slice(2).filter((a) => a !== "--");
const val = (n: string, d: string): string => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1]! : d; };
const level = val("level", "scratch-L021"), variant = val("variant", "s1") as Variant, strat = val("strategy", "turrets_first") as SimStrategy;
const seed = Number(val("seed", "1")), mult = val("mult", "1,1,5").split(",").map(Number), every = Number(val("every", "5"));
const m = shapeWaves(loadLevel(level, variant), mult);
const profile = strat === "fastest" ? (() => { const { judgment: _j, ...rest } = LADDER[0]!; return { ...rest, name: "good:fastest" }; })() : strategyProfile(strat as Strategy);

const tally = { kills: {} as Record<string, number>, hits: {} as Record<string, number>, shotsAt: {} as Record<string, number>, downs: 0, guardDied: 0 };
let nextAt = 0;
const rows: string[] = [];
const r = playBot(m, profile, seed, {
  content,
  onTick: (st: any, _b, ev: any[]) => {
    for (const e of ev) {
      if (e.t === "died" && String(e.kind).startsWith("hostile")) tally.kills[e.by ?? "?"] = (tally.kills[e.by ?? "?"] ?? 0) + 1;
      else if (e.t === "died") tally.guardDied++;
      else if (e.t === "hit" && e.by === "hostile") tally.hits[e.target] = (tally.hits[e.target] ?? 0) + 1;
      else if (e.t === "downed") tally.downs++;
    }
    const sec = st.tick / TPS;
    if (sec < nextAt) return;
    nextAt += every;
    const hs = st.hostiles as any[];
    const byType: Record<string, number> = {};
    for (const h of hs) byType[h.type.replace("hostile.", "")] = (byType[h.type.replace("hostile.", "")] ?? 0) + 1;
    const atGate = hs.filter((h) => h.target === "barrier").length, atBase = hs.filter((h) => h.target === "base").length, onTroop = hs.filter((h) => h.target === "troop").length;
    const guards = (st.residents as any[]).filter((x) => x.status === "ok" && content.roles[x.role]?.behavior === "guard");
    const gate = (st.barriers as any[]).flatMap((l) => l.sections.filter((s: any) => s.gate).map((s: any) => s.hp));
    const towers = (st.structures as any[]).filter((s) => String(s.type).startsWith("struct.ranged_defense")).map((s) => s.level);
    rows.push(`${sec.toFixed(0).padStart(4)}s alive ${String(hs.length).padStart(4)} ${JSON.stringify(byType)} gate-q ${atGate} base ${atBase} fight ${onTroop} | gate ${gate.join("/")} base ${st.meters.baseHealth.toFixed(1)} | towers [${towers.join(",")}] guards ${guards.length} hp ${guards.map((g) => g.hp ?? "f").join(",")} cmdr ${st.player.hp} | kills ${JSON.stringify(tally.kills)} hits ${JSON.stringify(tally.hits)} downs ${tally.downs} unitsDied ${tally.guardDied}`);
  },
});
console.log(`${level} ${variant} ${strat} seed ${seed} mult ${mult.join(",")}: won ${r.won} reason ${r.reason} ticks ${r.ticks} (${(r.ticks / TPS).toFixed(0)} s)`);
console.log(rows.join("\n"));
