import { mean, round, spearman, type Limits } from "./lib.js";
import type { LevelPulse, PulseFile } from "./pulse-core.js";
import type { LevelAgg, TelemetryAgg } from "./telemetry-core.js";

// The pure part of pnpm review:calibrate (the command is calibrate.ts): join the bot pulse and the
// player telemetry per level and report which measured things go with 👎. Rank correlation against
// each level's share of 👎, and for every number with a limit in boredom-limits.json the threshold that
// best splits the mostly-👎 levels from the mostly-👍 ones (largest TPR - FPR) as the suggested limit.
// With too few rated levels nothing is suggested and the report says what is missing.

type Dir = ">" | "<";

interface Predictor {
  name: string;
  get: (l: LevelPulse) => number | null;
  /** The limit this number is checked against, and which side of it is flagged. */
  limit?: { key: string; path: [keyof Limits, string]; dir: Dir };
}

const usefulActs = (l: LevelPulse): number => Object.entries(l.shape.acts).reduce((a, [k, n]) => (k === "died" ? a : a + n), 0);

export function predictors(): Predictor[] {
  const P: Predictor[] = [];
  for (const k of ["good", "average", "weak", "novice", "floor", "human"]) P.push({ name: `stars.${k}`, get: (l) => l.stars[k] ?? null });
  P.push({ name: "D", get: (l) => l.D }, { name: "F", get: (l) => l.F });
  for (const k of ["closeFinish", "lateUncertainty", "tensionRhythm", "decisiveness", "rewardCadence", "deadTime", "fairFailure", "novelty"]) {
    const lim = k === "deadTime" ? { key: "waitingOnTimer.deadTime", path: ["waitingOnTimer", "deadTime"] as [keyof Limits, string], dir: ">" as Dir }
      : k === "fairFailure" ? { key: "unfairLoss.fairFailureMin", path: ["unfairLoss", "fairFailureMin"] as [keyof Limits, string], dir: "<" as Dir }
      : k === "tensionRhythm" ? { key: "flatTension.minPeaks", path: ["flatTension", "minPeaks"] as [keyof Limits, string], dir: "<" as Dir }
      : undefined;
    P.push({ name: `proxy.${k}`, get: (l) => l.proxies[k]?.value ?? null, ...(lim ? { limit: lim } : {}) });
  }
  for (const k of ["skillNeeded", "marginRef", "marginMedian", "lifelineRisk", "concurrentDemand", "routeLoad", "threatPressure", "animalHits", "economyTightness", "moduleCount", "novelty"]) {
    P.push({ name: `metric.${k}`, get: (l) => l.metrics[k] ?? null });
  }
  P.push(
    { name: "shape.durS", get: (l) => l.shape.durS },
    { name: "shape.stillShare", get: (l) => (l.shape.durS > 0 ? l.shape.stillS / l.shape.durS : null) },
    { name: "shape.longestStillS", get: (l) => l.shape.longestStillS },
    { name: "shape.distU", get: (l) => l.shape.distU },
    { name: "shape.distPerAct", get: (l) => (usefulActs(l) > 0 ? l.shape.distU / usefulActs(l) : null) },
    { name: "shape.firstRewardS", get: (l) => l.shape.firstRewardS },
    { name: "shape.rewardGapMaxS", get: (l) => l.shape.rewardGapMaxS, limit: { key: "rewardDrought.gapS", path: ["rewardDrought", "gapS"], dir: ">" } },
    { name: "shape.sameRunMax", get: (l) => l.shape.sameRunMax, limit: { key: "repetition.deliveries", path: ["repetition", "deliveries"], dir: ">" } },
    { name: "loopMax", get: (l) => l.loopMax, limit: { key: "repetition.trips", path: ["repetition", "trips"], dir: ">" } },
    { name: "oneTaskS", get: (l) => l.oneTaskS, limit: { key: "noChoice.oneTaskS", path: ["noChoice", "oneTaskS"], dir: ">" } },
    { name: "noTaskS", get: (l) => l.noTaskS, limit: { key: "standingStill.noTaskS", path: ["standingStill", "noTaskS"], dir: ">" } },
    { name: "choiceShare", get: (l) => l.choiceShare },
  );
  return P;
}

const limitValue = (L: Limits, path: [keyof Limits, string]): number => Number((L[path[0]] as unknown as Record<string, unknown>)[path[1]]);

export interface Joined { levelId: string; pulse: LevelPulse; tele: LevelAgg; downShare: number }

export interface PredictorReport {
  name: string;
  n: number;
  /** Rank correlation with the share of 👎 (positive: the higher the number, the more 👎). */
  rho: number | null;
  limit: { key: string; current: number; dir: Dir } | null;
  /** Under the current limit: how many levels it flags and their mean 👎 share, against the rest. */
  atLimit: { flagged: number; flaggedDown: number | null; unflaggedDown: number | null } | null;
  /** The best split of mostly-👎 from mostly-👍 levels: flag levels where the number is on the `dir` side of `value`. */
  best: { value: number; dir: Dir; tpr: number; fpr: number; j: number } | null;
  suggested: number | null;
  note: string;
}

export interface Calibration {
  v: 1;
  generated: string;
  status: "ok" | "not_enough_data";
  reason: string;
  have: { pulseLevels: number; telemetryLevels: number; joined: number; withEnoughRatings: number; unmatched: string[]; ratings: number; bad: number; good: number };
  need: Limits["calibrate"];
  predictors: PredictorReport[];
  suggestedLimits: { key: string; current: number; suggested: number; basis: string }[];
  /** How well the human-view bot's shape tracks real players' on the same levels (rank correlation). */
  botVsPlayers: { field: string; n: number; rho: number | null }[];
}

export function join(pulse: PulseFile, tele: TelemetryAgg): { joined: Joined[]; unmatched: string[] } {
  const joined: Joined[] = [];
  const unmatched: string[] = [];
  for (const [id, t] of Object.entries(tele.levels)) {
    const p = pulse.levels[id];
    if (!p) { if (t.ratings.total > 0) unmatched.push(id); continue; }
    if (t.ratings.downShare !== null) joined.push({ levelId: id, pulse: p, tele: t, downShare: t.ratings.downShare });
  }
  return { joined, unmatched: unmatched.sort() };
}

/** Best threshold by TPR - FPR for flagging `bad` levels when x is on the `dir` side. */
export function bestSplit(xs: readonly number[], bad: readonly boolean[], dir: Dir): PredictorReport["best"] {
  const nBad = bad.filter(Boolean).length, nGood = bad.length - nBad;
  if (nBad === 0 || nGood === 0) return null;
  const vals = [...new Set(xs)].sort((a, b) => a - b);
  let best: NonNullable<PredictorReport["best"]> | null = null;
  for (let i = 0; i + 1 < vals.length; i++) {
    const t = (vals[i]! + vals[i + 1]!) / 2;
    let tp = 0, fp = 0;
    xs.forEach((x, k) => { if (dir === ">" ? x > t : x < t) { if (bad[k]) tp++; else fp++; } });
    const tpr = tp / nBad, fpr = fp / nGood, j = tpr - fpr;
    if (!best || j > best.j + 1e-9) best = { value: t, dir, tpr: round(tpr, 3), fpr: round(fpr, 3), j: round(j, 3) };
  }
  return best;
}

const rounded = (x: number): number => (Math.abs(x) >= 100 ? Math.round(x) : round(x, 2));

export function calibrate(pulse: PulseFile, tele: TelemetryAgg, L: Limits, generated = new Date().toISOString()): Calibration {
  const C = L.calibrate;
  const { joined, unmatched } = join(pulse, tele);
  const rated = joined.filter((j) => j.tele.ratings.total >= C.minRatingsPerLevel);
  const bad = rated.map((j) => j.downShare >= C.badShare);
  const nBad = bad.filter(Boolean).length;
  const have = {
    pulseLevels: Object.keys(pulse.levels).length, telemetryLevels: Object.keys(tele.levels).length, joined: joined.length,
    withEnoughRatings: rated.length, unmatched, ratings: tele.overall.ratings.total, bad: nBad, good: rated.length - nBad,
  };
  const out: Calibration = { v: 1, generated, status: "ok", reason: "", have, need: C, predictors: [], suggestedLimits: [], botVsPlayers: [] };

  // bot against players: the same shape fields measured both ways
  const withShape = Object.entries(tele.levels).filter(([id, t]) => t.shape && t.shape.plays >= 3 && pulse.levels[id]);
  for (const f of ["durS", "stillS", "longestStillS", "distU", "firstRewardS", "rewardGapMaxS", "sameRunMax"] as const) {
    const a = withShape.map(([id]) => pulse.levels[id]!.shape[f]);
    const b = withShape.map(([, t]) => t.shape!.median[f] ?? 0);
    const rho = spearman(a, b);
    out.botVsPlayers.push({ field: `shape.${f}`, n: withShape.length, rho: rho === null ? null : round(rho, 3) });
  }

  if (rated.length < C.minLevels || nBad < C.minPerClass || rated.length - nBad < C.minPerClass) {
    out.status = "not_enough_data";
    const why: string[] = [];
    if (rated.length < C.minLevels) why.push(`${rated.length} levels have at least ${C.minRatingsPerLevel} ratings (need ${C.minLevels})`);
    if (nBad < C.minPerClass) why.push(`${nBad} mostly-👎 levels (need ${C.minPerClass})`);
    if (rated.length - nBad < C.minPerClass) why.push(`${rated.length - nBad} mostly-👍 levels (need ${C.minPerClass})`);
    out.reason = `Not enough rated levels yet: ${why.join("; ")}. Nothing is suggested.`;
    return out;
  }

  for (const P of predictors()) {
    const rows = rated.map((j, i) => ({ x: P.get(j.pulse), y: j.downShare, bad: bad[i]! })).filter((r): r is { x: number; y: number; bad: boolean } => r.x !== null);
    const xs = rows.map((r) => r.x), ys = rows.map((r) => r.y), flags = rows.map((r) => r.bad);
    const rho = spearman(xs, ys);
    const dir: Dir = rho !== null && rho < 0 ? "<" : ">";
    const best = rho === null ? null : bestSplit(xs, flags, dir);
    const cur = P.limit ? { key: P.limit.key, current: limitValue(L, P.limit.path), dir: P.limit.dir } : null;
    let atLimit: PredictorReport["atLimit"] = null;
    if (cur) {
      const hit = rows.filter((r) => (cur.dir === ">" ? r.x > cur.current : r.x < cur.current));
      const rest = rows.filter((r) => !hit.includes(r));
      atLimit = { flagged: hit.length, flaggedDown: hit.length ? round(mean(hit.map((r) => r.y)), 3) : null, unflaggedDown: rest.length ? round(mean(rest.map((r) => r.y)), 3) : null };
    }
    let note = "";
    let suggested: number | null = null;
    const strong = rho !== null && Math.abs(rho) >= C.minRho && best !== null && best.j >= C.minJ && rows.length >= C.minLevels;
    if (!strong) note = rho === null ? "no variation or too few levels" : "no clear link with 👎 yet";
    else if (cur && best!.dir !== cur.dir) note = `the data points the other way: a ${best!.dir === ">" ? "high" : "low"} value goes with 👎, but the limit flags the ${cur.dir === ">" ? "high" : "low"} side`;
    else if (cur) { suggested = rounded(best!.value); note = `levels ${best!.dir === ">" ? "above" : "below"} ${suggested} catch ${Math.round(best!.tpr * 100)}% of the 👎 levels and ${Math.round(best!.fpr * 100)}% of the 👍 ones`; }
    else note = `goes with 👎 (${best!.dir === ">" ? "high" : "low"} values) but has no limit yet; a first limit could be ${rounded(best!.value)}`;
    out.predictors.push({ name: P.name, n: rows.length, rho: rho === null ? null : round(rho, 3), limit: cur, atLimit, best, suggested, note });
    if (cur && suggested !== null && suggested !== cur.current) {
      out.suggestedLimits.push({ key: cur.key, current: cur.current, suggested, basis: `rank correlation ${round(rho!, 2)} with the 👎 share over ${rows.length} levels; ${note}` });
    }
  }
  out.predictors.sort((a, b) => Math.abs(b.rho ?? 0) - Math.abs(a.rho ?? 0));
  out.reason = out.suggestedLimits.length > 0 ? `${out.suggestedLimits.length} limit(s) look worth moving.` : "No limit has a clear better value yet.";
  return out;
}
