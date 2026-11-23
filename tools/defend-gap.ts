import { readFileSync, writeFileSync } from "node:fs";
import { content } from "../packages/content/src/index.js";
import { LADDER, PROFILES, gapProfile } from "../packages/bots/src/index.js";
import { judgmentShare, repin, s1Metrics, strategyGap } from "../packages/rater/src/index.js";
import { applyDefendS1 } from "../packages/generator/src/defendS1.js";
import { fitStrategyEtas, placeDefendGap, simBreak } from "../packages/generator/src/defendGap.js";
import gen from "../packages/generator/data/generator.json";

// Defend S4 proof (outpost-ops#273): re-place one manifest's waves with defendGap + the S1/S2 switches on (maxLive 2, gap 20, random
// sides, coin towers if --coin-towers), then exact replays per rung (good 4 seeds, the others 2) with win/loss and margin, judgmentShare,
// strategyGap, gap position per wave and crossings. No level generation.
//   pnpm exec vite-node tools/defend-gap.ts -- manifest.json [--coin-towers] [--gap 20] [--target 0.5] [--no-fit] [--place-only] [--json out.json]
const args = process.argv.slice(2).filter((a) => a !== "--");
const val = (n: string, d: number): number => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const file = args.find((a, i) => a.endsWith(".json") && args[i - 1] !== "--json")!;
let m = repin(JSON.parse(readFileSync(file, "utf8"))) as Record<string, any>;
const pool = [...new Set(((m["waves"] ?? []) as any[]).flatMap((w) => (Array.isArray(w.side) ? w.side : w.side ? [w.side] : ["n"])))];
m = applyDefendS1(m, { maxLive: 2, overlapMin: 6, ...(pool.length > 1 ? { randomSides: pool, warnSeconds: 6 } : {}), ...(args.includes("--coin-towers") ? { coinTowers: true, currencyPerSalvage: 1.5 } : {}) }) as Record<string, any>;
const cfg = { ...(gen as any).defendGap, on: true, iterations: 1, ...(args.includes("--no-window") ? { buildWindow: 0 } : {}) };
const t0 = Date.now();
const useSim = args.includes("--sim");
const etas = useSim || args.includes("--no-fit") ? undefined : fitStrategyEtas(m, content);
if (etas) console.log(`eta_s ${JSON.stringify(etas.etas)}  sim break multipliers ${JSON.stringify(etas.multipliers)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
const gp = placeDefendGap(m, content, { cfg, target: val("target", 0.5), gap: val("gap", 20), warlords: 1, ...(etas ? { etas: etas.etas } : {}), ...(useSim ? { breakFn: (cut: any, k: number, s: any) => simBreak(cut, k, s, { lo: 0.25, hi: 4, iterations: 4 }) } : {}) });
console.log(`${m["id"]}  placed ${gp.waves.length} waves  ok ${gp.ok} ${gp.reason ?? ""}  crossings ${gp.crossings}  ratioShare ${gp.ratioShare.toFixed(2)}`);
for (const w of gp.waves) console.log(`  w${w.k} t ${w.t}  hp ${w.hp.toFixed(0)}  V ${Object.entries(w.V).map(([s, v]) => `${s[0]} ${v.toFixed(0)}`).join(" ")}  best ${w.best}  position ${w.position === null ? "-" : w.position.toFixed(2)}  counts ${JSON.stringify((gp.manifest["waves"] as any[])[w.k].counts)}`);
for (const c of gp.compare ?? []) console.log(`  w${c.k} model mult ${JSON.stringify(Object.fromEntries(Object.entries(c.model).map(([s, v]) => [s[0], +v.toFixed(2)])))}  probe mult ${JSON.stringify(Object.fromEntries(Object.entries(c.probe).map(([s, v]) => [s[0], +v.toFixed(2)])))}`);
for (const n of gp.notes) console.log(`  note: ${n}`);
if (args.includes("--place-only")) process.exit(0);
const out = gp.manifest;
// the proof replays the placed waves even when the generator would have rejected the level (noCrossing), so the report shows why
const prof = gapProfile(out, content, { ...(etas ? { etas: etas.etas } : {}) });
console.log(`rater gapProfile: crossings ${prof.crossings}  positions ${prof.waves.map((w) => (w.position === null ? "-" : w.position.toFixed(2))).join(" ")}`);
const rows: Record<string, string[]> = {};
for (const p of [...LADDER, PROFILES["human"]!]) {
  const n = p.name === "good" ? 4 : 2;
  const row: string[] = [];
  let picks = "";
  for (let seed = 1; seed <= n; seed++) {
    const { result: r } = s1Metrics(out, p, seed);
    row.push(`${r.won ? "W" : "L"} ${r.margin.toFixed(2)}`);
    if (seed === 1 && r.judge) picks = `${r.judge.hits}/${r.judge.n} best; ${r.judge.picks.map((s) => s[0]).join("")}`;
  }
  rows[p.name] = row;
  console.log(`  ${p.name.padEnd(8)} ${row.join(" | ")}   ${picks}`);
}
const js = judgmentShare(out, [1, 2]);
console.log(`  judgmentShare ${js.share === null ? "n/a (no good-to-floor spread)" : js.share.toFixed(2)}  (good ${js.good.toFixed(2)}, floor ${js.floor.toFixed(2)}, good at floor judgment ${js.goodAtFloorJudgment.toFixed(2)})`);
const sg = strategyGap(out);
console.log(`  strategyGap ${sg.gap.toFixed(3)} ${JSON.stringify(sg.multipliers)} best ${sg.best} worst ${sg.worst}`);
const good = (rows["good"] ?? []).map((s) => ({ won: s[0] === "W", margin: Number(s.slice(2)) }));
const goodOk = good.every((r) => r.won && r.margin >= 0.2);
const losers = ["average", "weak", "novice"].filter((b) => (rows[b] ?? []).some((s) => s[0] === "L"));
console.log(`PASS rule: good all won margin >= 0.2: ${goodOk};  average/weak/novice losing a run: ${losers.join(",") || "none"}  => ${goodOk && losers.length >= 2 ? "PASS" : "FAIL"}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1]!, JSON.stringify({ id: m["id"], gp: { ok: gp.ok, crossings: gp.crossings, waves: gp.waves, notes: gp.notes }, rows, js, sg, goodOk, losers, manifest: out }, null, 1) + "\n");
