import { gunzipSync } from "node:zlib";
import { content as defaultContent } from "../packages/content/src/index.js";
import { TIME_FIXED_GOALS } from "../packages/bots/src/index.js";
import { DEFAULT_WEIGHTS, gradedSkillNeeded, type ReferenceStats } from "../packages/rater/src/index.js";
import { SD_FLOOR, Z_CLAMP } from "../packages/rater/src/rate.js";
import type { MetricName } from "../packages/rater/src/measure.js";

// Re-rate a logged candidate with a changed reference / z rule, without bot play (stuck-fixes).
// The log keeps the final D, the per-run won / margin rows and the gzipped manifest, but not the raw metrics. The terms that
// follow from those (skillNeeded from the runs, the two margins from the run margins, moduleCount from the manifest) are
// recomputed under the old and the new rule; every other term (lifeline, concurrency, route, threat, animals, economy, novelty)
// is backed out of the logged D and carried over unchanged. Approximation: the other terms' reference stats moved a little
// in the recalibration and their raw values are not logged. `tools/rerate-validate.ts` measures the error on replayed levels.

const logit = (d: number) => Math.log(d / (1 - d));
const sigma = (x: number) => 1 / (1 + Math.exp(-x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const DERIVED: MetricName[] = ["skillNeeded", "marginRef", "marginMedian", "moduleCount"];
const GOAL_SCALED: MetricName[] = ["marginRef", "marginMedian"];

type Run = { bot: string; won: boolean; m: number };
export interface RerateRow {
  recipeId?: string; family?: string; goalType?: string; runs?: Run[]; manifestGz?: string;
  rating?: { D: number; margin?: Record<string, number>; winRate?: Record<string, number> };
  settings?: { goal?: { type?: string }; modules?: string[] };
}
export interface Rerated { Dold: number; Dnew: number }

const clamp = (v: number) => Math.max(-Z_CLAMP, Math.min(Z_CLAMP, v));
const stat = (ref: ReferenceStats, k: MetricName, goal: string, family: string | undefined, rule: "old" | "new") => {
  const g = ref.byGoal?.[goal]?.metrics[k];
  const fam = rule === "new" && k === "moduleCount" && family ? ref.byFamily?.[family]?.metrics[k] : undefined;
  return { row: g ?? fam, s: g ?? fam ?? ref.metrics[k] };
};
export function z(k: MetricName, x: number, goal: string, family: string | undefined, ref: ReferenceStats, rule: "old" | "new"): number {
  const { row, s } = stat(ref, k, goal, family, rule);
  if (rule === "old" && !row && GOAL_SCALED.includes(k) && TIME_FIXED_GOALS.has(goal)) return 0;
  return s ? clamp((x - s.mean) / Math.max(s.sd, SD_FLOOR[k])) : 0;
}

export function rerate(row: RerateRow, oldRef: ReferenceStats, newRef: ReferenceStats, manifest?: { modules: string[]; goal: { type: string }; family?: string }): Rerated | null {
  if (!row.rating) return null;
  const m = manifest ?? (row.manifestGz ? JSON.parse(gunzipSync(Buffer.from(row.manifestGz, "base64")).toString("utf8"))
    : row.settings?.goal?.type && row.settings.modules ? { modules: row.settings.modules, goal: { type: row.settings.goal.type } } : null);
  if (!m) return null;
  // sweep logs keep no run rows: one pseudo-run per rung at the rung's mean margin (won when the rung's win rate is at least half)
  const runs: Run[] | undefined = row.runs && row.runs.length > 0 ? row.runs
    : row.rating.margin && row.rating.winRate ? Object.keys(row.rating.margin).map((b) => ({ bot: b, won: (row.rating!.winRate![b] ?? 0) >= 0.5, m: row.rating!.margin![b]! })) : undefined;
  if (!runs) return null;
  const goal: string = m.goal.type, family: string | undefined = m.family ?? row.family;
  const by = (bot: string) => runs.filter((r) => r.bot === bot);
  const rungs = Object.fromEntries(["good", "average", "weak", "novice", "floor"].map((b) => [b, by(b)]));
  if (rungs["good"]!.length === 0 || ["average", "weak", "novice", "floor"].some((b) => rungs[b]!.length === 0)) return null;
  const x: Record<string, number> = {
    skillNeeded: gradedSkillNeeded(Object.fromEntries(Object.entries(rungs).map(([b, rs]) => [b, rs.map((r) => ({ won: r.won, margin: r.m }))]))),
    marginRef: mean(rungs["good"]!.map((r) => r.m)),
    marginMedian: mean(rungs["weak"]!.map((r) => r.m)),
    moduleCount: m.modules.filter((id: string) => !defaultContent.modules[id]?.alwaysOn).length,
  };
  const W = DEFAULT_WEIGHTS.difficulty, bias = W.bias;
  let sumOld = 0, sumNew = 0;
  for (const k of DERIVED) {
    const w = W.w[k] ?? 0;
    sumOld += w * z(k, x[k]!, goal, family, oldRef, "old");
    sumNew += w * z(k, x[k]!, goal, family, newRef, "new");
  }
  const D = Math.min(1 - 1e-6, Math.max(1e-6, row.rating.D));
  const rest = logit(D) - bias - sumOld;
  return { Dold: D, Dnew: sigma(bias + rest + sumNew) };
}
