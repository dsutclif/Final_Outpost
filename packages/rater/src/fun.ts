import type { BotResult } from "@fo/bots";
import { MEDIAN, REFERENCE, type Measurement } from "./measure.js";

// Fun proxies from the spec, each scored y in [-1, 1] where 1 means on its starting target.
// The raw value is kept next to the score so calibration can refit the targets later.

export const PROXY_NAMES = [
  "closeFinish", "lateUncertainty", "tensionRhythm", "decisiveness", "rewardCadence", "deadTime", "fairFailure", "novelty",
] as const;
export type ProxyName = (typeof PROXY_NAMES)[number];
export interface Proxy { value: number; y: number }
export type Proxies = Record<ProxyName, Proxy>;

const clamp = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);
const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
/** 1 inside [lo, hi], falling linearly to -1 at `soft` outside the band. */
const band = (x: number, lo: number, hi: number, soft: number): number =>
  x >= lo && x <= hi ? 1 : clamp(1 - (2 * (x < lo ? lo - x : x - hi)) / soft);

/** Peaks of a smoothed threat signal (hysteresis 0.3 → 0.5) and the longest squeeze above 0.5, as a share of the level. */
export function tension(signal: readonly number[]): { peaks: number; longest: number } {
  const s = signal.map((_, i) => mean(signal.slice(Math.max(0, i - 4), i + 1)));
  let peaks = 0, armed = true, run = 0, longest = 0;
  for (const v of s) {
    if (armed && v > 0.5) { peaks++; armed = false; }
    if (!armed && v < 0.3) armed = true;
    run = v > 0.5 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return { peaks, longest: s.length > 0 ? longest / s.length : 0 };
}

/** Outcome still open at 70% of the run: goal progress short of done and the threat signal above calm. */
const openLate = (r: BotResult): boolean => {
  const i = Math.floor(r.trace.progress.length * 0.7);
  const prog = r.trace.progress[i] ?? 1, threat = r.trace.threat[i] ?? 0;
  return prog < 0.9 && threat >= 0.25;
};

export function funProxies(ms: Measurement, noveltyElements: { modules: number; goal: boolean; template: boolean } | null): Proxies {
  const med = ms.runs[MEDIAN]!;
  const all = Object.values(ms.runs).flat();

  const close = mean(med.map((r) => r.margin));
  const late = mean(med.map((r) => (openLate(r) ? 1 : 0)));
  const tens = med.map((r) => tension(r.trace.threat));
  const rhythm = mean(tens.map((t) => clamp((t.peaks >= 2 && t.peaks <= 5 ? 1 : t.peaks === 1 || t.peaks === 6 ? 0 : -1) - (t.longest > 0.25 ? 1 : 0))));
  const ref = ms.runs[REFERENCE]![0]!;
  const margins = [ref.margin, ...ms.variants.map((v) => v.margin)];
  const spread = Math.max(...margins) - Math.min(...margins);
  const cadence = mean(med.map((r) => (r.trace.rewardGapMedian < 8 ? 0.5 : -0.5) + (r.trace.rewardGapMax < 30 ? 0.5 : -0.5)));
  const medianGap = mean(med.map((r) => r.trace.rewardGapMedian));
  const dead = mean(med.map((r) => r.trace.deadTicks / Math.max(1, r.ticks)));
  const fails = all.filter((r) => !r.won && r.reason !== "goal");
  const fairShare = fails.length === 0 ? 1 : mean(fails.map((r) => (r.trace.warningLead >= 10 || r.reason === "timer" || r.reason === "time_budget" ? 1 : 0)));
  let noveltyY = 0, noveltyV = 0;
  if (noveltyElements) {
    const n = noveltyElements;
    noveltyV = (n.modules > 0 ? 1 : 0) + (n.goal ? 1 : 0) + (n.template ? 1 : 0);
    noveltyY = n.modules > 1 ? -1 : noveltyV >= 1 ? 1 : -0.5;
  }
  return {
    closeFinish: { value: close, y: band(close, 0.05, 0.2, 0.5) },
    lateUncertainty: { value: late, y: late >= 0.5 ? 1 : clamp(-1 + 4 * late) },
    tensionRhythm: { value: mean(tens.map((t) => t.peaks)), y: rhythm },
    decisiveness: { value: spread, y: spread >= 0.1 ? 1 : clamp(-1 + (2 * spread) / 0.1) },
    rewardCadence: { value: medianGap, y: cadence * 2 > 1 ? 1 : cadence * 2 < -1 ? -1 : cadence * 2 },
    deadTime: { value: dead, y: dead < 0.1 ? 1 : clamp(1 - (dead - 0.1) * 10) },
    fairFailure: { value: fairShare, y: clamp(2 * fairShare - 1) },
    novelty: { value: noveltyV, y: noveltyY },
  };
}
