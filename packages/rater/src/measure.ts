import { Manifest as ManifestSchema, content as defaultContent, type Content, type Manifest } from "@fo/content";
import { LADDER, PROFILES, TIME_FIXED_GOALS, planBot, playBot, type BotProfile, type BotResult, type Plan } from "@fo/bots";
import { TPS } from "@fo/sim";

// Measurement: run the bot ladder on a manifest and reduce the runs to the spec's raw metrics.
// Nothing here is normalised; rate.ts turns these into z-scores, D and F.

export const METRIC_NAMES = [
  "skillNeeded", "marginRef", "marginMedian", "lifelineRisk", "concurrentDemand", "routeLoad",
  "threatPressure", "economyTightness", "moduleCount", "novelty",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];
export type Metrics = Record<MetricName, number>;

/** A level the player saw recently, for novelty and duplicate checks. */
export interface HistoryEntry { id?: string; modules: string[]; goal: string; template?: string }

export interface MeasureOptions {
  content?: Content;
  /** Seeds for the reference (good) bot; spec default 10. */
  refSeeds?: number;
  /** Seeds for every other rung; default 3. */
  otherSeeds?: number;
  /** Most recent last. */
  history?: readonly HistoryEntry[];
  timeBudgetSeconds?: number;
  /** Layout template id; defaults to the manifest's map zones. */
  template?: string;
}

export interface Measurement {
  manifest: Manifest;
  plan: Plan;
  runs: Record<string, BotResult[]>;
  /** Reference bot replayed with priority-order variants (decisiveness). */
  variants: BotResult[];
  metrics: Metrics;
  budgetTicks: number;
  template: string;
  history: readonly HistoryEntry[];
}

export const REFERENCE = "good";
/** The spec scores fun on the median bot's runs: the middle rung of the ladder. */
export const MEDIAN = LADDER[Math.floor(LADDER.length / 2)]!.name;

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
export const winRate = (rs: readonly BotResult[]): number => mean(rs.map((r) => (r.won ? 1 : 0)));
export const meanMargin = (rs: readonly BotResult[]): number => mean(rs.map((r) => r.margin));

export function measure(manifestIn: unknown, opts: MeasureOptions = {}): Measurement {
  const content = opts.content ?? defaultContent;
  const manifest = ManifestSchema.parse(manifestIn);
  const plan = planBot(manifest, content);
  const refSeeds = opts.refSeeds ?? 10, otherSeeds = opts.otherSeeds ?? 3;
  const botOpts = { content, plan, ...(opts.timeBudgetSeconds !== undefined ? { timeBudgetSeconds: opts.timeBudgetSeconds } : {}) };
  const runs: Record<string, BotResult[]> = {};
  for (const p of LADDER) {
    const n = p.name === REFERENCE ? refSeeds : otherSeeds;
    runs[p.name] = Array.from({ length: n }, (_, i) => playBot(manifest, p, i + 1, botOpts));
  }
  // Decisiveness: the reference bot with deliberately shuffled priorities on the same seeds.
  const ref = PROFILES[REFERENCE]!;
  const variants = [0.2, 0.35].map((err, k): BotResult => {
    const v: BotProfile = { ...ref, name: `${ref.name}-order${k + 1}`, priorityErr: err };
    return playBot(manifest, v, 1, botOpts);
  });

  const P = (k: string): number => manifest.params[k] ?? content.defaults[k] ?? 0;
  const timer = P("timer.seconds");
  const budgetTicks = Math.round((timer > 0 ? timer : opts.timeBudgetSeconds ?? P("level.budgetSeconds")) * TPS);
  const template = opts.template ?? manifest.map.zones.join("|");
  const history = opts.history ?? [];
  const metrics = computeMetrics(manifest, content, plan, runs, budgetTicks, history);
  return { manifest, plan, runs, variants, metrics, budgetTicks, template, history };
}

function computeMetrics(m: Manifest, c: Content, plan: Plan, runs: Record<string, BotResult[]>, budgetTicks: number,
  history: readonly HistoryEntry[]): Metrics {
  const ref = runs[REFERENCE]!, med = runs[MEDIAN]!;
  // Weakest rung that still wins a majority of its runs; 1.25 when even the reference bot fails.
  let weakest = -1;
  LADDER.forEach((p, i) => { if (winRate(runs[p.name]!) >= 0.5) weakest = i; });
  const top = LADDER.length - 1;
  const skillNeeded = weakest < 0 ? 1.25 : (top - weakest) / top;

  const lifelineRisk = mean(med.map((r) => 0.5 * (1 - r.trace.lifelineMin) + 0.5 * (r.trace.lifelineLowTicks / Math.max(1, r.ticks))));
  const concurrentDemand = mean(ref.map((r) => r.trace.concurrentDemand));
  const routeLoad = mean(ref.map((r) => r.trace.routeShare));
  const baseHp = m.params["meters.baseHealth"] ?? c.defaults["meters.baseHealth"] ?? 15;
  // Over the whole ladder: on easy defense levels only the weakest rungs take damage at all.
  const threatPressure = m.waves.length === 0 ? 0 : mean(Object.values(runs).flat().map((r) => {
    const minutes = Math.max(1 / 6, r.ticks / TPS / 60);
    return (r.trace.baseHpLost / baseHp + 0.2 * r.trace.barriersBroken + 0.2 * r.trace.injuries) / minutes;
  }));
  // Currency the plan needs over what the reference bot's income rate yields in the time budget.
  const horizon = TIME_FIXED_GOALS.has(m.goal.type) ? mean(ref.map((r) => r.ticks)) : budgetTicks;
  const available = mean(ref.map((r) => (r.trace.currencyEarned / Math.max(1, r.ticks)) * horizon)) + (m.params["start.currency"] ?? 0);
  const economyTightness = plan.currencyNeeded / Math.max(1, available);
  const optional = m.modules.filter((id) => !c.modules[id]?.alwaysOn);
  const recent = history.slice(-5);
  const seen = new Set(recent.flatMap((h) => h.modules));
  const novelty = recent.length === 0 ? 0 : optional.filter((id) => !seen.has(id)).length;
  return {
    skillNeeded,
    marginRef: meanMargin(ref),
    marginMedian: meanMargin(med),
    lifelineRisk,
    concurrentDemand,
    routeLoad,
    threatPressure,
    economyTightness,
    moduleCount: optional.length,
    novelty,
  };
}
