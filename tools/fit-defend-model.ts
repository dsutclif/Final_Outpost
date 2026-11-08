import { readFileSync, readdirSync, existsSync } from "node:fs";
import { content } from "../packages/content/src/index.js";
import { defendInput, predictRho, DEFEND_FIT, type DefendFit, type DefendInput } from "../packages/generator/src/defendModel.js";

// pnpm exec vite-node tools/fit-defend-model.ts [--write]
// Fits the attack-defence model's few numbers (eta, presence, one skill per rung) to the bot-measured
// rho in levels/eval/<pack>/<id>.json (the per-wave defend trace), and states the error. Read-only.

const RUNGS = ["good", "average", "weak", "novice", "floor"];
interface Row { id: string; inp: DefendInput; meas: number[] }
const rows: Row[] = [];
for (const pack of ["s1", "s1-061"]) {
  const dir = `levels/eval/${pack}`;
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (f === "index.json") continue;
    const ev = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    if (!ev.defendTrace?.length) continue;
    const m = JSON.parse(readFileSync(`levels/packs/${pack}/${f}`, "utf8"));
    const inp = defendInput(m, content);
    const B = inp.gateHp + inp.baseHp;
    rows.push({ id: ev.id, inp, meas: RUNGS.map((_, i) => Math.min(1, (ev.defendTraceByProfile[i].waves as { leak: number }[]).reduce((a, w) => a + w.leak, 0) / B)) });
  }
}
const mk = (p: number[]): DefendFit => ({ eta: p[0]!, presence: p[1]!, guardsMax: Math.round(p[2]!), reach: p[7]!, skill: { good: 1, average: p[3]!, weak: p[4]!, novice: p[5]!, floor: p[6]! } });
const pred = (r: Row, fit: DefendFit) => RUNGS.map((k) => Math.min(1, predictRho(r.inp, fit, fit.skill[k]!).rho));
const sse = (rs: Row[], p: number[]) => { const fit = mk(p); let s = 0; for (const r of rs) pred(r, fit).forEach((v, i) => { s += (v - r.meas[i]!) ** 2; }); return s; };
const lo = [0.05, 0, 1, 0.3, 0.1, 0.05, 0.02, 40], hi = [2, 3, 6, 1, 1, 1, 1, 400];
function fit(rs: Row[]): number[] {
  let best = [0.5, 0.5, 3, 0.85, 0.65, 0.5, 0.35, 100], bs = sse(rs, best);
  let step = 0.3;
  for (let it = 0; it < 14; it++, step *= 0.65) {
    for (let k = 0; k < best.length; k++) {
      for (const d of k === 2 ? [-1, 1] : [-step * (k === 7 ? 200 : 1), step * (k === 7 ? 200 : 1)]) {
        const q = [...best]; q[k] = Math.min(hi[k]!, Math.max(lo[k]!, q[k]! + d));
        const s = sse(rs, q);
        if (s < bs) { bs = s; best = q; }
      }
    }
  }
  return best;
}
const n = rows.length * RUNGS.length;
const p = fit(rows);
const f = mk(p);
const rmse = Math.sqrt(sse(rows, p) / n);
// leave-one-level-out
let cv = 0;
for (let i = 0; i < rows.length; i++) { const tr = rows.filter((_, j) => j !== i); const q = fit(tr); cv += sse([rows[i]!], q); }
const cvRmse = Math.sqrt(cv / n);
const base = Math.sqrt(rows.reduce((a, r) => a + r.meas.reduce((b, v) => b + v * v, 0), 0) / n);
let lostOk = 0, lostN = 0;
const lines = rows.map((r) => { const pr = pred(r, f); pr.forEach((v, i) => { lostN++; if ((v >= 0.99) === (r.meas[i]! >= 0.99)) lostOk++; }); return `${r.id}\tmeas ${r.meas.map((v) => v.toFixed(2)).join(" ")}\tpred ${pr.map((v) => v.toFixed(2)).join(" ")}`; });
console.log(lines.join("\n"));
console.log(`levels ${rows.length}, points ${n}`);
console.log(`fit reach=${f.reach.toFixed(0)} eta=${f.eta.toFixed(3)} presence=${f.presence.toFixed(3)} guardsMax=${f.guardsMax} skill=${JSON.stringify(Object.fromEntries(Object.entries(f.skill).map(([k, v]) => [k, +v.toFixed(3)])))}`);
console.log(`RMSE in-sample ${rmse.toFixed(3)}, leave-one-level-out ${cvRmse.toFixed(3)}, predict-zero baseline ${base.toFixed(3)}, lost/not-lost agreement ${lostOk}/${lostN}`);
void DEFEND_FIT;
{
  const xs: number[] = [], ys: number[] = [];
  for (const r of rows) pred(r, f).forEach((v, i) => { xs.push(v); ys.push(r.meas[i]!); });
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const cov = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
  const r = cov / Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) * ys.reduce((a, y) => a + (y - my) ** 2, 0));
  const lm = rows.map((rw) => [pred(rw, f).reduce((a, b) => a + b, 0), rw.meas.reduce((a, b) => a + b, 0)] as const);
  const ax = lm.map((l) => l[0]), ay = lm.map((l) => l[1]);
  const bx = ax.reduce((a, b) => a + b, 0) / ax.length, by = ay.reduce((a, b) => a + b, 0) / ay.length;
  const rl = ax.reduce((a, x, i) => a + (x - bx) * (ay[i]! - by), 0) / Math.sqrt(ax.reduce((a, x) => a + (x - bx) ** 2, 0) * ay.reduce((a, y) => a + (y - by) ** 2, 0));
  console.log(`Pearson r all points ${r.toFixed(2)}; across levels (summed over rungs) ${rl.toFixed(2)}`);
}
