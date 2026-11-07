import { TPS, type State } from "../../packages/sim/src/index.js";
import { candidate, round, type Candidate, type Limits } from "./lib.js";

// The analysis half of pnpm review:guide (the walker that drives the client's Guide is guide.ts, which
// reaches into the client package and so stays outside the tools typecheck, like tools/guide-follow.ts).
// A follower that only walks to the guide arrow and stands there is recorded as the arrow's changes plus
// the moments the level made progress; this file turns that record into stalls, loops and gaps.

export interface StepChange { tick: number; key: string; text: string }

export interface GuideRecord {
  levelId: string;
  pack: string;
  /** Sim ticks played, and how the level ended ("" while it was still running at the limit). */
  ticks: number;
  over: boolean;
  won: boolean;
  reason: string;
  /** Every change of the arrow's step in order; the key is "none" while the guide had nothing to show. */
  steps: StepChange[];
  /** Ticks at which the level made progress (the client's StuckTimer definition). */
  progress: number[];
}

/**
 * Progress as the client's StuckTimer counts it: a new best on the main objective, another objective
 * done, or another pad finished. `note` returns true on the ticks where one of these happened.
 */
export class ProgressTracker {
  private best = -1;
  private done = -1;
  private pads = -1;
  note(st: Pick<State, "objectives" | "pads">): boolean {
    const main = st.objectives.find((o) => o.id === "main") ?? st.objectives[0];
    const p = main?.progress ?? 0, d = st.objectives.filter((o) => o.done).length, n = st.pads.filter((x) => x.done).length;
    if (p > this.best || d > this.done || n > this.pads) {
      this.best = Math.max(this.best, p);
      this.done = d;
      this.pads = n;
      return true;
    }
    return false;
  }
}

export interface GuideStall { key: string; s: number }
export interface GuideLoop { keys: string[]; changes: number; s: number }

export interface GuideLevel {
  levelId: string;
  pack: string;
  playedS: number;
  over: boolean;
  won: boolean;
  reason: string;
  stepChanges: number;
  /** The step held longest, whatever happened meanwhile. */
  longestStep: GuideStall | null;
  /** Steps held at least `stepStallS` with no progress at all: the follower stood on the arrow and nothing happened. */
  stalls: GuideStall[];
  noProgressMaxS: number;
  /** Longest stretch with no arrow at all and no progress. */
  noGuideMaxS: number;
  /** The tightest arrow loop inside a no-progress stretch: the arrow swaps between a few steps and nothing gets done. */
  loop: GuideLoop | null;
  timeline: { t: number; key: string; text: string }[];
}

/** A step key without the instance part (`gather:7` → `gather`, `register:` → `register`, `pay:pad.x` stays), so repeats compare. */
export const stepName = (key: string): string => key.replace(/:\d*$/, "");

const sec = (t: number): number => t / TPS;

export function analyseGuide(r: GuideRecord, L: Limits["guide"]): GuideLevel {
  const end = r.ticks;
  const prog = [...new Set(r.progress)].sort((a, b) => a - b);
  const noProgressAt = (a: number, b: number): boolean => !prog.some((p) => p > a && p <= b);

  // intervals the arrow held one step: [tick, nextTick)
  const held = r.steps.map((s, i) => ({ key: s.key, from: s.tick, to: r.steps[i + 1]?.tick ?? end }));
  let longest: GuideStall | null = null;
  const stallBest = new Map<string, number>();
  let noGuideMax = 0;
  for (const h of held) {
    const s = sec(h.to - h.from);
    if (h.key !== "none" && (!longest || s > longest.s)) longest = { key: stepName(h.key), s: round(s, 1) };
    // The longest quiet part of this hold: between progress ticks inside it.
    const marks = [h.from, ...prog.filter((p) => p > h.from && p <= h.to), h.to];
    let quiet = 0;
    for (let i = 1; i < marks.length; i++) quiet = Math.max(quiet, marks[i]! - marks[i - 1]!);
    if (h.key === "none") noGuideMax = Math.max(noGuideMax, sec(quiet));
    else if (sec(quiet) >= L.stepStallS) {
      const k = stepName(h.key);
      stallBest.set(k, Math.max(stallBest.get(k) ?? 0, sec(quiet)));
    }
  }
  const stalls = [...stallBest.entries()].map(([key, s]) => ({ key, s: round(s, 1) })).sort((a, b) => b.s - a.s);

  // quiet stretches of the whole level: start → first progress → ... → end
  const marks = [0, ...prog, end];
  let noProgressMax = 0;
  let loop: GuideLoop | null = null;
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1]!, b = marks[i]!;
    const len = sec(b - a);
    noProgressMax = Math.max(noProgressMax, len);
    if (len < L.loopS || !noProgressAt(a, b - 1)) continue;
    const inside = r.steps.filter((s) => s.tick > a && s.tick <= b && s.key !== "none").map((s) => stepName(s.key));
    const distinct = [...new Set(inside)].sort();
    // A swap loop: at least loopReps round trips between at most three steps.
    if (distinct.length >= 2 && distinct.length <= 3 && inside.length >= 2 * L.loopReps && (!loop || len > loop.s)) {
      loop = { keys: distinct, changes: inside.length, s: round(len, 1) };
    }
  }

  const timeline = r.steps.slice(0, 80).map((s) => ({ t: round(sec(s.tick), 1), key: s.key, text: s.text }));
  return {
    levelId: r.levelId, pack: r.pack, playedS: round(sec(end), 1), over: r.over, won: r.won, reason: r.reason,
    stepChanges: r.steps.length, longestStep: longest, stalls, noProgressMaxS: round(noProgressMax, 1), noGuideMaxS: round(noGuideMax, 1), loop, timeline,
  };
}

export function guideCandidates(levels: readonly GuideLevel[], L: Limits["guide"]): Candidate[] {
  const out: Candidate[] = [];
  if (!L.enabled) return out;
  const add = (c: Omit<Parameters<typeof candidate>[0], "via">): void => { out.push(candidate({ via: "trace", ...c })); };
  for (const g of levels) {
    const id = g.levelId;
    for (const s of g.stalls) {
      add({ category: L.category, severity: L.severity, levelId: id, subject: `guide:${s.key}`, check: "stall",
        title: `${id}: the guide arrow sits on "${s.key}" for ${round(s.s, 0)} s and nothing happens`,
        detail: `A player who only follows the arrow stood on the "${s.key}" step for ${s.s} s with no progress (limit ${L.stepStallS} s).`,
        metric: { name: "stepStallS", value: s.s, limit: L.stepStallS } });
    }
    if (g.loop) {
      add({ category: L.category, severity: L.severity, levelId: id, subject: `guide:${g.loop.keys.join("+")}`, check: "loop",
        title: `${id}: the guide arrow swaps between ${g.loop.keys.join(" and ")} for ${round(g.loop.s, 0)} s`,
        detail: `${g.loop.changes} changes of step among ${g.loop.keys.join(", ")} over ${g.loop.s} s with no progress (limit ${L.loopReps} round trips in ${L.loopS} s).`,
        metric: { name: "loopS", value: g.loop.s, limit: L.loopS } });
    }
    if (g.noGuideMaxS > L.noGuideS) {
      add({ category: L.category, severity: L.severity, levelId: id, subject: "guide", check: "no_arrow",
        title: `${id}: no guide arrow for ${round(g.noGuideMaxS, 0)} s while nothing progresses`,
        detail: `The guide had nothing to show for ${g.noGuideMaxS} s in a row without progress (limit ${L.noGuideS} s).`,
        metric: { name: "noGuideS", value: g.noGuideMaxS, limit: L.noGuideS } });
    }
    // A stall or a loop already explains a level that does not finish; only the unexplained ones get their own finding.
    const explained = g.stalls.length > 0 || g.loop !== null;
    if (L.unfinished && !g.over && !explained) {
      add({ category: L.category, severity: L.severity, levelId: id, subject: "guide", check: "unfinished",
        title: `${id}: following only the arrow does not finish the level`,
        detail: `Still running after ${g.playedS} s of following the arrow; the longest quiet stretch was ${g.noProgressMaxS} s.`,
        metric: { name: "levelFinished", value: 0, limit: 1 } });
    }
    if (L.unfinished && g.over && !g.won && !explained) {
      add({ category: L.category, severity: L.severity, levelId: id, subject: "guide", check: "loses",
        title: `${id}: following only the arrow loses the level`,
        detail: `Lost after ${g.playedS} s (${g.reason || "no reason given"}) by walking to each arrow and standing there.`,
        metric: { name: "levelFinished", value: 0, limit: 1 } });
    }
  }
  return out;
}
