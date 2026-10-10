import { content as defaultContent, Manifest as ManifestSchema, type Content } from "@fo/content";
import { LADDER } from "@fo/bots";
import { funProxies, PROXY_NAMES, type Proxies } from "./fun.js";
import { qualityFilters, type FilterEvidence, type Filters } from "./filters.js";
import { METRIC_NAMES, REFERENCE, measure, meanMargin, winRate, type HistoryEntry, type MeasureOptions, type Measurement, type MetricName, type Metrics } from "./measure.js";
import referenceData from "../data/reference.json";
import weightsData from "../data/weights.json";

// D = σ(Σ w·z + b) over metrics normalised against a reference batch; F = σ(Σ v·y + c) over the
// fun proxies. Weights are hand-set in data/weights.json until calibration replaces them.

export interface ReferenceStats {
  /** What the stats were computed from. */
  source: string;
  n: number;
  metrics: Record<MetricName, { mean: number; sd: number }>;
  /**
   * Per goal type overrides (only for goal types with at least BY_GOAL_MIN levels in the batch).
   * Margins are time left for build/population/currency goals but health and integrity for waves,
   * so they only compare within a goal type.
   */
  byGoal?: Record<string, { n: number; metrics: Partial<Record<MetricName, { mean: number; sd: number }>> }>;
}

export const BY_GOAL_MIN = 3;
/** Metrics whose scale depends on the goal type. */
const GOAL_SCALED: readonly MetricName[] = ["marginRef", "marginMedian"];

export interface Weights {
  difficulty: { bias: number; w: Record<MetricName, number> };
  fun: { bias: number; v: Record<(typeof PROXY_NAMES)[number], number> };
}

export const DEFAULT_REFERENCE = referenceData as ReferenceStats;
export const DEFAULT_WEIGHTS = weightsData as Weights;

export interface RateOptions extends MeasureOptions {
  reference?: ReferenceStats;
  weights?: Weights;
}

export interface Rating {
  id: string;
  /** Difficulty index in (0, 1). */
  D: number;
  /** Fun index in (0, 1). */
  F: number;
  metrics: Metrics;
  z: Metrics;
  fun: Proxies;
  /** Rungs that won at least half their runs, strongest first. */
  botsPassed: string[];
  /** Mean margin per rung. */
  margin: Record<string, number>;
  winRate: Record<string, number>;
  /** Reference bot wins every seed with at least 20% margin (spec feasibility). */
  feasible: boolean;
  filters: Filters;
  evidence: FilterEvidence;
  /** Feasible and no filter fired. */
  ok: boolean;
}

const sigma = (x: number): number => 1 / (1 + Math.exp(-x));
/** Keep the indexes strictly inside (0, 1) even for extreme inputs. */
const open01 = (x: number): number => Math.min(1 - 1e-6, Math.max(1e-6, x));

export function zScores(m: Metrics, ref: ReferenceStats, goal?: string): Metrics {
  const z = {} as Metrics;
  for (const k of METRIC_NAMES) {
    const s = (goal !== undefined ? ref.byGoal?.[goal]?.metrics[k] : undefined) ?? ref.metrics[k];
    z[k] = s ? (m[k] - s.mean) / (s.sd > 1e-9 ? s.sd : 1) : 0;
  }
  return z;
}

/** Score a measurement: normalise, combine, filter. */
export function score(ms: Measurement, opts: RateOptions = {}): Rating {
  const content = opts.content ?? defaultContent;
  const ref = opts.reference ?? DEFAULT_REFERENCE;
  const W = opts.weights ?? DEFAULT_WEIGHTS;
  const z = zScores(ms.metrics, ref, ms.manifest.goal.type);
  let sd = W.difficulty.bias;
  for (const k of METRIC_NAMES) sd += (W.difficulty.w[k] ?? 0) * z[k];
  const novelty = noveltyElements(ms, content);
  const fun = funProxies(ms, novelty);
  let sf = W.fun.bias;
  for (const k of PROXY_NAMES) sf += (W.fun.v[k] ?? 0) * fun[k].y;
  const { filters, evidence } = qualityFilters(ms, content);
  const margin: Record<string, number> = {}, wr: Record<string, number> = {};
  for (const p of LADDER) { margin[p.name] = meanMargin(ms.runs[p.name]!); wr[p.name] = winRate(ms.runs[p.name]!); }
  const refRuns = ms.runs[REFERENCE]!;
  const feasible = refRuns.every((r) => r.won && r.margin >= 0.2);
  return {
    id: ms.manifest.id,
    D: open01(sigma(sd)),
    F: open01(sigma(sf)),
    metrics: ms.metrics,
    z,
    fun,
    botsPassed: LADDER.filter((p) => wr[p.name]! >= 0.5).map((p) => p.name),
    margin,
    winRate: wr,
    feasible,
    filters,
    evidence,
    ok: feasible && !Object.values(filters).some(Boolean),
  };
}

function noveltyElements(ms: Measurement, c: Content): { modules: number; goal: boolean; template: boolean } | null {
  const recent = ms.history.slice(-5);
  if (recent.length === 0) return null;
  const seen = new Set(recent.flatMap((h) => h.modules));
  const modules = ms.manifest.modules.filter((id) => !c.modules[id]?.alwaysOn && !seen.has(id)).length;
  return {
    modules,
    goal: !recent.some((h) => h.goal === ms.manifest.goal.type),
    template: !recent.some((h) => h.template === ms.template),
  };
}

/** Rate one manifest: run the ladder, compute metrics, D, F and the quality filters. */
export function rate(manifest: unknown, opts: RateOptions = {}): Rating {
  return score(measure(manifest, opts), opts);
}

export const historyEntry = (manifestIn: unknown, template?: string): HistoryEntry => {
  const m = ManifestSchema.parse(manifestIn);
  return { id: m.id, modules: [...m.modules], goal: m.goal.type, template: template ?? m.map.zones.join("|") };
};

/** Rate a batch in order; each level sees the earlier ones as history (novelty, duplicates). */
export function rateBatch(manifests: readonly unknown[], opts: RateOptions = {}): Rating[] {
  const history: HistoryEntry[] = [...(opts.history ?? [])];
  const out: Rating[] = [];
  for (const m of manifests) {
    out.push(rate(m, { ...opts, history: [...history] }));
    history.push(historyEntry(m));
  }
  return out;
}

/** Reference stats (mean and sd per metric) from a batch of measurements; goal-scaled metrics also per goal type. */
export function computeReference(batch: readonly Measurement[], source = "batch"): ReferenceStats {
  const stats = (rows: readonly Metrics[], keys: readonly MetricName[]) => {
    const out: Partial<Record<MetricName, { mean: number; sd: number }>> = {};
    for (const k of keys) {
      const xs = rows.map((r) => r[k]);
      const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1);
      out[k] = { mean: round(mean), sd: round(Math.sqrt(v)) };
    }
    return out;
  };
  const ref: ReferenceStats = { source, n: batch.length, metrics: stats(batch.map((b) => b.metrics), METRIC_NAMES) as ReferenceStats["metrics"] };
  const goals = [...new Set(batch.map((b) => b.manifest.goal.type))].sort();
  for (const g of goals) {
    const rows = batch.filter((b) => b.manifest.goal.type === g).map((b) => b.metrics);
    if (rows.length < BY_GOAL_MIN) continue;
    (ref.byGoal ??= {})[g] = { n: rows.length, metrics: stats(rows, GOAL_SCALED) };
  }
  return ref;
}

const round = (x: number): number => Math.round(x * 1e6) / 1e6;
