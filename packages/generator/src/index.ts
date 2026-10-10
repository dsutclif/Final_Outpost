import { content as defaultContent, type Content, type Manifest } from "@fo/content";
import { PROFILES, playBot } from "@fo/bots";
import { measure, rate, type Metrics, type Rating, type ReferenceStats, type HistoryEntry as RaterHistory } from "@fo/rater";
import referenceData from "../data/reference.json";
import { closure, conflicts } from "@fo/sequencer";
import { GEN, TEMPLATES, buildLevel, knobsFor, templateById, type Built } from "./build.js";
import { Rand, clamp01 } from "./rand.js";
import { skinText } from "./text.js";

export { TEMPLATES, GEN, buildLevel, knobsFor, templateById, type Template, type Knobs, type Built } from "./build.js";
export { flowModel, type Flow } from "./flow.js";
export { skinText } from "./text.js";
export { Placer, unreadablePairs } from "./layout.js";

/** Contract 5 request. Extra fields from the sequencer (id, introduced) are optional. */
export interface GenRequest {
  target: number;
  modules: readonly string[];
  goalType: string;
  seed: number;
  template?: string | undefined;
  id?: string | undefined;
  introduced?: readonly string[] | undefined;
  /** Fun threshold for this level's arc (overrides the option and the default). */
  funThreshold?: number | undefined;
}

/**
 * Normalisation for D and F. The rater's shipped reference holds the four golden levels only; the
 * generator rates against stats recomputed from a generated calibration batch (tools/build-levels
 * --calibrate), which is the recalibration step the rater's README prescribes.
 */
export const GENERATOR_REFERENCE = referenceData as unknown as ReferenceStats;

export interface GenOptions {
  content?: Content;
  /** Levels the player saw before this one (novelty and duplicate filters). */
  history?: readonly RaterHistory[];
  funThreshold?: number;
  tolerance?: number;
  maxIterations?: number;
  /** Log each candidate (CLI verbose mode). */
  log?: (line: string) => void;
  reference?: ReferenceStats;
  /** Override the rating seeds (tests use fewer; shipped levels use the spec's 10 + 3). */
  seeds?: { quick: { ref: number; other: number }; full: { ref: number; other: number } };
}

export interface Candidate {
  manifest: Manifest;
  rating: Rating;
  p: number;
  err: number;
}

export interface GenStats {
  iterations: number;
  /** Candidates discarded, by reason (flow, layout, infeasible, idleModule, trivial, stall, unreadable, duplicate, offTarget, lowFun). */
  rejects: Record<string, number>;
  ratings: number;
}

export interface GenDetail {
  /** On target (D within tolerance, F above threshold, feasible, no filter): the Contract 5 result. */
  manifest: Manifest | null;
  /** Best fully rated feasible candidate that passed every filter, even if off target. */
  best: Candidate | null;
  stats: GenStats;
}

/** Contract 5: a manifest within ±tolerance of the target with F above threshold, or null when the budget runs out. */
export function generate(req: GenRequest, opts: GenOptions = {}): Manifest | null {
  return generateDetailed(req, opts).manifest;
}

const REF = PROFILES["good"]!;

export function generateDetailed(req: GenRequest, opts: GenOptions = {}): GenDetail {
  const c = opts.content ?? defaultContent;
  const S = GEN.search;
  const tol = opts.tolerance ?? S.tolerance;
  const fmin = req.funThreshold ?? opts.funThreshold ?? S.funThreshold;
  const reference = opts.reference ?? GENERATOR_REFERENCE;
  const maxIt = opts.maxIterations ?? S.maxIterations;
  const mods = closure(req.modules, c);
  const bad = conflicts(mods, c);
  if (bad.length > 0) throw new Error(`modules exclude each other: ${bad.join(", ")}`);
  const rand = new Rand(req.seed);
  const tplId = req.template ?? rand.fork("tpl").pick(TEMPLATES.templates).id;
  const tpl = templateById(tplId);
  const id = req.id ?? `gen-${req.seed}`;
  const stats: GenStats = { iterations: 0, rejects: {}, ratings: 0 };
  const reject = (k: string) => { stats.rejects[k] = (stats.rejects[k] ?? 0) + 1; };
  const log = opts.log ?? (() => {});
  const history = opts.history ?? [];

  let lo = 0, hi = 1;
  let p = clamp01((req.target - 0.08) / 0.8);
  let best: Candidate | null = null;
  const mrand = rand.fork("mutate");

  for (let it = 0; it < maxIt; it++) {
    stats.iterations++;
    const mut: Record<string, number> = {};
    if (it > 0) for (const k of Object.keys(GEN.knobs)) mut[k] = (mrand.float() * 2 - 1) * GEN.jitter;
    const knobs = knobsFor(p, mut);
    let built: Built | null = null;
    let why = "";
    for (let salt = 0; salt < S.layoutTries && !built; salt++) {
      try { built = buildLevel({ id, seed: req.seed, modules: mods, goalType: req.goalType, template: tpl, knobs, content: c }, salt); }
      catch (e) { why = (e as Error).message; reject(why.startsWith("flow") ? "flow" : "layout"); }
    }
    if (!built) {
      log(`  it${it} p=${p.toFixed(2)} build failed: ${why}`);
      // A flow rejection usually means too hard (burn, distances); ease off.
      hi = p; p = (lo + p) / 2;
      continue;
    }
    const m = built.manifest;
    // Quick feasibility with the reference bot, which also calibrates the budget to measured play.
    // Run uncapped (a generous budget) so the measurement sets the budget, not the other way round.
    const quick = [1, 2, 3].map((s) => playBot(m, REF, s, { content: c, timeBudgetSeconds: 900 }));
    if (quick.some((r) => !r.won)) {
      reject("infeasible");
      log(`  it${it} p=${p.toFixed(2)} good bot lost (${quick.map((r) => `${r.reason}@${Math.round(r.ticks / 30)}s`).join(",")}) flowT=${Math.round(built.flow.T)}`);
      hi = p; p = (lo + p) / 2;
      continue;
    }
    if (m.goal.type !== "waves") {
      const tMax = Math.max(...quick.map((r) => r.ticks)) / 30;
      const margin = knobs.margin;
      m.params["level.budgetSeconds"] = Math.min(900, Math.max(60, Math.round(tMax / (1 - margin) / 10) * 10));
    }
    const finalize = (seeds: { ref: number; other: number }) => {
      stats.ratings++;
      return rate(m, { content: c, refSeeds: seeds.ref, otherSeeds: seeds.other, history, reference });
    };
    log(`  it${it} flowT=${Math.round(built.flow.T)} good=${quick.map((q) => Math.round(q.ticks / 30)).join("/")}s budget=${m.params["level.budgetSeconds"]}`);
    let r = finalize(opts.seeds?.quick ?? S.quickSeeds);
    const flags = Object.entries(r.filters).filter(([, v]) => v).map(([k]) => k);
    log(`  it${it} p=${p.toFixed(2)} D=${r.D.toFixed(3)} F=${r.F.toFixed(3)} feasible=${r.feasible} ${flags.join(",")}`);
    flags.forEach(reject);
    if (!r.feasible) reject("infeasible");
    const hardFlags = flags.filter((f) => f !== "trivial");
    if (!r.feasible || hardFlags.includes("stall")) { hi = p; p = (lo + p) / 2; continue; }
    if (flags.includes("trivial")) { lo = p; p = (p + hi) / 2; continue; }
    if (hardFlags.length > 0) {
      // Idle modules and unreadable layouts are fixed by a different draw, not by pressure.
      p = clamp01(p + (mrand.float() - 0.5) * 0.2);
      continue;
    }
    const close = Math.abs(r.D - req.target) <= tol;
    if (close || best === null || Math.abs(r.D - req.target) < best.err) {
      r = finalize(opts.seeds?.full ?? S.fullSeeds);
      const ok = r.ok;
      const err = Math.abs(r.D - req.target);
      if (ok) {
        attachRating(m, r, req.introduced ?? []);
        const cand = { manifest: m, rating: r, p, err };
        if (!best || err < best.err) best = cand;
        if (err <= tol && r.F >= fmin) return { manifest: m, best, stats };
        if (err <= tol) reject("lowFun"); else reject("offTarget");
      } else Object.entries(r.filters).filter(([, v]) => v).forEach(([k]) => reject(k));
    } else reject("offTarget");
    if (r.D < req.target) lo = p; else hi = p;
    p = (lo + hi) / 2;
    if (hi - lo < 0.02) { lo = Math.max(0, lo - 0.15); hi = Math.min(1, hi + 0.15); }
  }
  return { manifest: null, best, stats };
}

/** Rating block and launch-skin text on the manifest. */
export function attachRating(m: Manifest, r: Rating, introduced: readonly string[]): void {
  (m as unknown as { rating: unknown }).rating = {
    difficulty: round3(r.D), fun: round3(r.F), botMargin: round3(r.margin["good"] ?? 0), botsPassed: [...r.botsPassed],
  };
  m.text = { mars_greenhouse: skinText(m, introduced) };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * One unsearched sample at the pressure the target suggests, measured with the full ladder: the
 * input for recomputing the generator's reference stats (tools/build-levels --calibrate).
 */
export function calibrationSample(req: GenRequest, opts: { content?: Content } = {}): { goal: string; metrics: Metrics } | null {
  const c = opts.content ?? defaultContent;
  const mods = closure(req.modules, c);
  const tpl = templateById(req.template ?? TEMPLATES.templates[0]!.id);
  const p = clamp01((req.target - 0.08) / 0.8);
  const knobs = knobsFor(p);
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    let built: Built;
    try { built = buildLevel({ id: req.id ?? "calib", seed: req.seed, modules: mods, goalType: req.goalType, template: tpl, knobs, content: c }, salt); }
    catch { continue; }
    const m = built.manifest;
    const quick = [1, 2, 3].map((s) => playBot(m, REF, s, { content: c, timeBudgetSeconds: 900 }));
    if (quick.some((r) => !r.won)) return null;
    if (m.goal.type !== "waves") m.params["level.budgetSeconds"] = Math.round(Math.max(...quick.map((r) => r.ticks)) / 30 / (1 - knobs.margin) / 10) * 10;
    const ms = measure(m, { content: c, refSeeds: GEN.search.fullSeeds.ref, otherSeeds: GEN.search.fullSeeds.other });
    return { goal: m.goal.type, metrics: ms.metrics };
  }
  return null;
}
