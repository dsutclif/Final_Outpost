import fs from "node:fs"; import zlib from "node:zlib";
import { earlyStopCheck, EARLY_STOP } from "../packages/generator/src/early-stop.js";
const files = process.argv.slice(2);
const old = { ...EARLY_STOP, unreachableMinCandidates: 4, flatWindow: 0, flatRange: 9, progressGain: 9 };
const rows: any[] = [];
for (const f of files) { const b = fs.readFileSync(f); const t = (f.endsWith(".gz") ? zlib.gunzipSync(b) : b).toString("utf8"); for (const l of t.split("\n")) if (l.trim()) { try { rows.push(JSON.parse(l)); } catch {} } }
const seqs = new Map<string, any[]>();
for (const o of rows) { if (!o.recipeId || o.kind) continue; const k = [o.run, o.index, o.recipeId, o.reroll].join("|"); (seqs.get(k) ?? seqs.set(k, []).get(k)!).push(o); }
function replay(s: any[], cfg: any) { const ent: any[] = []; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c.final) continue; ent.push({ p: c.p, D: c.rating?.D, firstReject: c.rejects?.[0] ?? null }); const v = earlyStopCheck(ent, c.target, cfg); if (v) return { at: i + 1, v }; } return null; }
const res = { new: { lost: [] as string[], saved: 0 }, old: { lost: [] as string[], saved: 0 } }; let total = 0; let shippedSeq = 0; const stops = { new: 0, old: 0 };
const perLevel: Record<string, any> = {};
for (const [k, s] of seqs) {
  total += s.length; const sh = s.findIndex((c) => c.shipped); if (sh >= 0) shippedSeq++;
  const idx = s[0].index;
  for (const [name, cfg] of [["new", EARLY_STOP], ["old", old]] as const) {
    const r = replay(s, cfg); if (!r) continue; stops[name]++;
    if (sh >= 0 && r.at <= sh) res[name].lost.push((Math.abs((s[sh].rating?.D ?? 9) - s[0].target) <= 0.05 ? "ONTARGET " : "offtarget-fallback ") + `L${idx} run ${k.split("|")[0].slice(11, 19)} shipped@${sh + 1}/${s.length} stop@${r.at} ${r.v.rule} (D ${r.v.Dmin}-${r.v.Dmax} target ${s[0].target})`);
    else res[name].saved += s.length - r.at;
  }
}
console.log(JSON.stringify({ sequences: seqs.size, candidates: total, shippedSeq, stops, new: res.new, old: res.old }, null, 1));
