import { LADDER, PROFILES, type BotResult } from "@fo/bots";
import { ENGINE_VERSION } from "@fo/sim";
import { PROXY_NAMES } from "./fun.js";
import { MEDIAN, METRIC_NAMES, REFERENCE, measure, type MeasureOptions, type Measurement } from "./measure.js";
import { DEFAULT_REFERENCE, DEFAULT_WEIGHTS, score, type RateOptions, type Rating } from "./rate.js";
import { defendTrace, type DefendTrace, type WaveTrace } from "./defendTrace.js";

// Side-file record of every sub-point of a rating (packages/rater/README.md, "Eval side file").
// Pure: numbers only, rounded to 4 dp, JSON-safe. Never stored in a pack manifest.

export const DETAIL_SCHEMA = 1;

export interface RunDetail { seed: number; won: boolean; margin: number; stars: number; reason: string; stalls: number; stallTick: number; ticks: number; goalTicks: number }
export interface RatingDetail {
  schema: 1;
  engineVersion: string;
  id: string;
  goal: string;
  family: string;
  D: number;
  F: number;
  ok: boolean;
  feasible: boolean;
  botsPassed: string[];
  difficulty: { bias: number; sum: number; metrics: Record<string, { raw: number; mean: number; sd: number; z: number; weight: number; contribution: number }> };
  fun: { bias: number; sum: number; proxies: Record<string, { raw: number; y: number; weight: number; contribution: number }> };
  runs: Record<string, { n: number; winRate: number; meanMargin: number; meanStars: number; runs: RunDetail[] }>;
  variants: RunDetail[];
  filters: Record<string, boolean>;
  evidence: Record<string, unknown>;
  terrain: Record<string, number>;
  extras: Record<string, number | string>;
  options: { refSeeds: number; otherSeeds: number; history: number };
  /** Reference bot, seed 1: one entry per manifest wave (empty without waves). */
  defendTrace: WaveTrace[];
  /** The same trace per ladder profile (seed 1), with run outcome. */
  defendTraceByProfile: DefendTrace[];
  /** What the pack manifest recorded at generation, when given. */
  packRecord?: Record<string, unknown>;
}

export const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
function clean<T>(v: T): T {
  if (typeof v === "number") return (Number.isFinite(v) ? round4(v) : 0) as T;
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) as T;
  return v;
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const runDetail = (r: BotResult): RunDetail => ({
  seed: r.seed, won: r.won, margin: r.margin, stars: r.stars, reason: r.reason, stalls: r.stalls, stallTick: r.stallStates[0]?.tick ?? -1, ticks: r.ticks, goalTicks: r.goalTicks,
});

/** Every sub-point of a measurement's rating. `rating` is computed from the measurement when not given. */
export function ratingDetail(ms: Measurement, ratingIn?: Rating, opts: RateOptions = {}): RatingDetail {
  const rating = ratingIn ?? score(ms, opts);
  const ref = opts.reference ?? DEFAULT_REFERENCE, W = opts.weights ?? DEFAULT_WEIGHTS;
  const goal = ms.manifest.goal.type;
  const metrics: RatingDetail["difficulty"]["metrics"] = {};
  let dsum = W.difficulty.bias;
  for (const k of METRIC_NAMES) {
    const s = ref.byGoal?.[goal]?.metrics[k] ?? ref.metrics[k];
    const w = W.difficulty.w[k] ?? 0;
    metrics[k] = { raw: ms.metrics[k], mean: s?.mean ?? 0, sd: s?.sd ?? 0, z: rating.z[k], weight: w, contribution: w * rating.z[k] };
    dsum += w * rating.z[k];
  }
  const proxies: RatingDetail["fun"]["proxies"] = {};
  let fsum = W.fun.bias;
  for (const k of PROXY_NAMES) {
    const v = W.fun.v[k] ?? 0;
    proxies[k] = { raw: rating.fun[k].value, y: rating.fun[k].y, weight: v, contribution: v * rating.fun[k].y };
    fsum += v * rating.fun[k].y;
  }
  const runs: RatingDetail["runs"] = {};
  for (const p of LADDER) {
    const rs = ms.runs[p.name] ?? [];
    runs[p.name] = { n: rs.length, winRate: mean(rs.map((r) => (r.won ? 1 : 0))), meanMargin: mean(rs.map((r) => r.margin)), meanStars: mean(rs.map((r) => r.stars)), runs: rs.map(runDetail) };
  }
  const out: RatingDetail = {
    schema: DETAIL_SCHEMA, engineVersion: ENGINE_VERSION, id: ms.manifest.id, goal, family: ms.manifest.family ?? "-",
    D: rating.D, F: rating.F, ok: rating.ok, feasible: rating.feasible, botsPassed: rating.botsPassed,
    difficulty: { bias: W.difficulty.bias, sum: dsum, metrics },
    fun: { bias: W.fun.bias, sum: fsum, proxies },
    runs, variants: ms.variants.map(runDetail),
    filters: { ...rating.filters }, evidence: { ...rating.evidence }, terrain: { ...rating.terrain },
    extras: {
      reference: REFERENCE, median: MEDIAN, playerKillShare: ms.playerKillShare, ladderLeft: ms.ladderLeft, depotPicks: ms.depotPicks, rallyShare: ms.rallyShare,
      guardLoss: ms.guardLoss, medicShare: ms.medicShare, capHoldMax: ms.capHoldMax, loopMax: ms.loopMax, loopKey: ms.loopKey, budgetTicks: ms.budgetTicks, template: ms.template,
      litSeconds: ms.story.litSeconds, joined: ms.story.joined, decoys: ms.story.decoys, retreats: ms.story.retreats, items: ms.story.items,
    },
    options: { refSeeds: ms.runs[REFERENCE]!.length, otherSeeds: ms.runs[MEDIAN]!.length, history: ms.history.length },
    defendTrace: [], defendTraceByProfile: [],
  };
  return clean(out);
}

/** Measure, rate and detail one manifest, adding the per-wave defend trace (one run per ladder profile, seed 1) on levels with waves. */
export function evalManifest(manifest: unknown, opts: RateOptions & MeasureOptions = {}): RatingDetail {
  const ms = measure(manifest, opts);
  const d = ratingDetail(ms, undefined, opts);
  if (ms.manifest.waves.length > 0) {
    const botOpts = { plan: ms.plan, ...(opts.content ? { content: opts.content } : {}), ...(opts.timeBudgetSeconds !== undefined ? { timeBudgetSeconds: opts.timeBudgetSeconds } : {}) };
    d.defendTraceByProfile = clean(LADDER.map((p) => defendTrace(ms.manifest, PROFILES[p.name]!, 1, botOpts)));
    d.defendTrace = d.defendTraceByProfile.find((t) => t.profile === REFERENCE)!.waves;
  }
  return d;
}
