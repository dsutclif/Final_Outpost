import { readFileSync } from "node:fs";
import { HUMAN, PROFILES, playBot } from "../packages/bots/src/index.js";

// Dev helper (Batch 3): one line per defend level and bot rung: wins, length, stars, player kill share, ladder left, gate broken.
// pnpm vite-node tools/defence-sample.ts -- file.json [...]
for (const f of process.argv.slice(2).filter((a) => a.endsWith(".json"))) {
  const m = JSON.parse(readFileSync(f, "utf8"));
  const row = (name: string, prof: (typeof PROFILES)[string], seeds: number) => {
    const rs = Array.from({ length: seeds }, (_, i) => playBot(m, prof, i + 1));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : -1);
    const objs = (m.objectives ?? []).slice(1).map((o: { kind: string }, k: number) => `${o.kind} ${rs.filter((r) => r.objectives[k + 1]?.done).length}/${seeds}`).join(", ");
    return `  ${name.padEnd(6)} won ${rs.filter((r) => r.won).length}/${seeds}  end ${avg(rs.map((r) => r.ticks / 30)).toFixed(0)}s  stars ${avg(rs.map((r) => r.stars)).toFixed(2)} (3* ${rs.filter((r) => r.stars === 3).length})  playerKills ${(avg(rs.map((r) => r.trace.playerKillShare)) * 100).toFixed(0)}%  ladderLeft ${avg(rs.map((r) => r.trace.ladderLeft)).toFixed(0)}  gateBroken ${rs.filter((r) => r.runStats.barriersLost > 0).length}/${seeds}  [${objs}]`;
  };
  const ladder = m.entities.filter((e: { type: string; build?: string }) => e.type === "pad.build" && e.build?.startsWith("struct.ranged_defense"));
  const ladderCost = ladder.reduce((a: number, e: { cost: Record<string, number> }) => a + (e.cost["res.salvage"] ?? 0), 0);
  console.log(`${m.id} ${m.goal.type} D=${m.rating?.difficulty} F=${m.rating?.fun} waves ${m.waves.map((w: { t: number; counts: Record<string, number> }) => `${w.t}s:${Object.values(w.counts).reduce((a, b) => a + b, 0)}`).join(" ")}  sockets ${ladder.filter((e: { build: string }) => e.build === "struct.ranged_defense").length} ladder ${ladderCost} salvage`);
  console.log(row("good", PROFILES["good"]!, 6));
  console.log(row("human", HUMAN, 6));
  console.log(row("avg", PROFILES["average"]!, 3));
}
