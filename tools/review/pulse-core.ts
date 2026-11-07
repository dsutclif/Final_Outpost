import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { createShape, HUMAN, playBot, shapeResult, shapeTick, type PlayShape } from "../../packages/bots/src/index.js";
import { historyEntry, measure, score, type HistoryEntry } from "../../packages/rater/src/index.js";
import { TPS } from "../../packages/sim/src/index.js";
import { candidate, median, mean, round, type Candidate, type Limits } from "./lib.js";

// The pure part of pnpm review:pulse (the command itself is pulse.ts): one level, the history comparison and
// the candidate findings. Docs/review/CONTRACT.md §3.
//
// For every level: the bot ladder and the human-view bot play it (the way tools/regress-levels.ts and the
// rater CLI do), the rater's metrics and fun proxies are read off the ladder, and the human bot's play is
// measured with the same PlayShape real players report.
//
// oneTaskS / noTaskS: every `sampling.everyTicks` ticks the human bot's planner is asked which kinds of
// task it has on offer that score at least `sampling.minScore` (Brain.taskKinds, read-only). A stretch
// where that is exactly one kind is a stretch with no real choice; none at all is a stretch with nothing
// worth doing. The numbers are the longest such stretch in seconds, median over the seeds.

export interface HumanSummary {
  winRate: number;
  /** Star objectives (after the goal) and on how many of the seeds the human bot earned each. */
  earned: { kind: string; n: number }[];
  /** Seconds played in the longest lost run (-1 when none was lost). */
  lossAfterS: number;
  stalls: number;
  seeds: number;
}

export interface LevelPulse {
  levelId: string;
  pack: string;
  index: number;
  family: string;
  goal: string;
  template: string;
  seeds: number;
  stars: Record<string, number>;
  winRate: Record<string, number>;
  D: number;
  F: number;
  feasible: boolean;
  /** Rater quality filters that fired. */
  filters: string[];
  metrics: Record<string, number>;
  proxies: Record<string, { value: number; y: number }>;
  /** The human bot's play shape: median over the seeds. */
  shape: PlayShape;
  oneTaskS: number;
  /** Task kinds on offer during that longest one-task stretch, "a+b". */
  oneTaskKinds: string;
  noTaskS: number;
  /** Share of samples with two or more kinds of task on offer. */
  choiceShare: number;
  /** Longest run of identical player trips (get, then put) in a row, median over the seeds, and the trip behind the worst run. */
  loopMax: number;
  loopKey: string;
  human: HumanSummary;
}

export interface PulseMeta {
  generated: string;
  engine: string;
  content: string;
  seeds: number;
  packs: string[];
  levels: number;
  runtimeS: number;
  errors: { levelId: string; message: string }[];
}

export interface Moved { levelId: string; field: string; prev: number; now: number; delta: number }

export interface PulseFile { v: 1; meta: PulseMeta; levels: Record<string, LevelPulse>; moved: Moved[] }

/** One line of the history file: a level's pulse plus when and on what it was measured. */
export interface HistoryRow extends LevelPulse { v: 1; date: string; build: string | null; engine: string; content: string }

// ---------- sampling ----------

export class TaskSampler {
  private run1 = 0;
  private run0 = 0;
  private stretch = new Set<string>();
  best1 = 0;
  best0 = 0;
  bestKinds = "";
  samples = 0;
  choice = 0;
  constructor(readonly everyTicks: number) {}

  sample(kinds: readonly string[]): void {
    this.samples++;
    if (kinds.length >= 2) this.choice++;
    if (kinds.length === 1) {
      this.run1++;
      this.stretch.add(kinds[0]!);
      if (this.run1 > this.best1) { this.best1 = this.run1; this.bestKinds = [...this.stretch].sort().join("+"); }
    } else { this.run1 = 0; this.stretch.clear(); }
    if (kinds.length === 0) { this.run0++; if (this.run0 > this.best0) this.best0 = this.run0; } else this.run0 = 0;
  }

  get oneTaskS(): number { return (this.best1 * this.everyTicks) / TPS; }
  get noTaskS(): number { return (this.best0 * this.everyTicks) / TPS; }
  get choiceShare(): number { return this.samples === 0 ? 0 : this.choice / this.samples; }
}

/** Median of each numeric field over several shapes; per-action counts too (a missing action is 0). */
export function medianShape(shapes: readonly PlayShape[]): PlayShape {
  const num = (f: (s: PlayShape) => number): number => round(median(shapes.map(f)), 1);
  const keys = [...new Set(shapes.flatMap((s) => Object.keys(s.acts)))].sort();
  const acts: Record<string, number> = {};
  for (const k of keys) acts[k] = round(median(shapes.map((s) => s.acts[k] ?? 0)), 1);
  return {
    durS: num((s) => s.durS), stillS: num((s) => s.stillS), longestStillS: num((s) => s.longestStillS), distU: num((s) => s.distU),
    acts, firstRewardS: num((s) => s.firstRewardS), rewardGapMaxS: num((s) => s.rewardGapMaxS), sameRunMax: num((s) => s.sameRunMax),
  };
}

// ---------- one level ----------

export interface PulseOptions {
  seeds: number;
  history?: readonly HistoryEntry[];
  sampling: Limits["sampling"];
  pack?: string;
  index?: number;
}

export function pulseLevel(manifestIn: unknown, o: PulseOptions): LevelPulse {
  const seeds = Math.max(1, o.seeds);
  const ms = measure(manifestIn, { refSeeds: seeds, otherSeeds: seeds, history: o.history ?? [] });
  const rating = score(ms);
  const m = ms.manifest;

  const humanRuns = Array.from({ length: seeds }, (_, i) => {
    const acc = createShape();
    const sampler = new TaskSampler(o.sampling.everyTicks);
    const r = playBot(m, HUMAN, i + 1, {
      plan: ms.plan,
      onTick: (st, brain, events) => {
        shapeTick(acc, st, events);
        if (!st.over && st.tick % o.sampling.everyTicks === 0) sampler.sample(brain.taskKinds(st, o.sampling.minScore));
      },
    });
    return { r, shape: shapeResult(acc), sampler };
  });

  const stars: Record<string, number> = {};
  const winRate: Record<string, number> = {};
  for (const [name, runs] of Object.entries(ms.runs)) {
    stars[name] = round(mean(runs.map((r) => r.stars)), 2);
    winRate[name] = round(mean(runs.map((r) => (r.won ? 1 : 0))), 2);
  }
  stars["human"] = round(mean(humanRuns.map((h) => h.r.stars)), 2);
  winRate["human"] = round(mean(humanRuns.map((h) => (h.r.won ? 1 : 0))), 2);

  const objs = m.objectives ?? [];
  const earned = objs.slice(1).map((ob, i) => ({ kind: ob.kind, n: humanRuns.filter((h) => h.r.objectives[i + 1]?.done).length }));
  const lost = humanRuns.filter((h) => !h.r.won);
  const longest = humanRuns.reduce((a, h) => (h.sampler.best1 > a.sampler.best1 ? h : a), humanRuns[0]!);

  const proxies: Record<string, { value: number; y: number }> = {};
  for (const [k, p] of Object.entries(rating.fun)) proxies[k] = { value: round(p.value, 3), y: round(p.y, 3) };
  const metrics: Record<string, number> = {};
  for (const [k, v] of Object.entries(rating.metrics)) metrics[k] = round(v, 3);

  return {
    levelId: m.id,
    pack: o.pack ?? "",
    index: o.index ?? 0,
    family: m.family ?? "-",
    goal: m.goal.type,
    template: ms.template,
    seeds,
    stars,
    winRate,
    D: round(rating.D, 3),
    F: round(rating.F, 3),
    feasible: rating.feasible,
    filters: Object.entries(rating.filters).filter(([, v]) => v).map(([k]) => k),
    metrics,
    proxies,
    shape: medianShape(humanRuns.map((h) => h.shape)),
    oneTaskS: round(median(humanRuns.map((h) => h.sampler.oneTaskS)), 1),
    oneTaskKinds: longest.sampler.bestKinds,
    noTaskS: round(median(humanRuns.map((h) => h.sampler.noTaskS)), 1),
    choiceShare: round(median(humanRuns.map((h) => h.sampler.choiceShare)), 3),
    loopMax: round(median(humanRuns.map((h) => h.r.trace.loopMax)), 1),
    loopKey: humanRuns.reduce((a, h) => (h.r.trace.loopMax > a.trace.loopMax ? h.r : a), humanRuns[0]!.r).trace.loopKey,
    human: {
      winRate: winRate["human"]!,
      earned,
      lossAfterS: lost.length === 0 ? -1 : round(Math.max(...lost.map((h) => h.r.ticks / TPS)), 1),
      stalls: humanRuns.reduce((a, h) => a + h.r.stalls, 0),
      seeds,
    },
  };
}

// ---------- history ----------

/** The numbers tracked from night to night, by field name. */
export function trackedFields(p: LevelPulse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.stars)) out[`stars.${k}`] = v;
  for (const [k, v] of Object.entries(p.winRate)) out[`winRate.${k}`] = v;
  out["D"] = p.D;
  out["F"] = p.F;
  for (const [k, v] of Object.entries(p.proxies)) out[`proxy.${k}`] = v.y;
  for (const k of ["durS", "stillS", "longestStillS", "distU", "firstRewardS", "rewardGapMaxS", "sameRunMax"] as const) out[`shape.${k}`] = p.shape[k];
  out["oneTaskS"] = p.oneTaskS;
  out["noTaskS"] = p.noTaskS;
  out["choiceShare"] = p.choiceShare;
  out["loopMax"] = p.loopMax;
  return out;
}

function toleranceFor(field: string, tol: Limits["tolerance"]): { abs: number; rel: number } {
  const exact = tol[field];
  if (exact) return exact;
  const dot = field.indexOf(".");
  const wild = dot >= 0 ? tol[`${field.slice(0, dot)}.*`] : undefined;
  return wild ?? tol["default"] ?? { abs: 0.5, rel: 0.25 };
}

/** What moved past tolerance between the previous row for this level and now. Nothing when the setups differ. */
export function compareToPrevious(cur: LevelPulse, prev: HistoryRow | undefined, tol: Limits["tolerance"]): Moved[] {
  if (!prev || prev.seeds !== cur.seeds) return [];
  const now = trackedFields(cur), before = trackedFields(prev);
  const out: Moved[] = [];
  for (const [field, v] of Object.entries(now)) {
    const p = before[field];
    if (p === undefined) continue;
    const delta = v - p;
    const t = toleranceFor(field, tol);
    if (Math.abs(delta) > t.abs && Math.abs(delta) > t.rel * Math.abs(p)) out.push({ levelId: cur.levelId, field, prev: p, now: v, delta: round(delta, 3) });
  }
  return out;
}

/** The latest history row per level. */
export function lastRows(rows: readonly HistoryRow[]): Map<string, HistoryRow> {
  const m = new Map<string, HistoryRow>();
  for (const r of rows) if (r && typeof r.levelId === "string") m.set(r.levelId, r);
  return m;
}

// ---------- candidates ----------

const usefulActs = (s: PlayShape): number => Object.entries(s.acts).reduce((a, [k, n]) => (k === "died" ? a : a + n), 0);
const fmt = (x: number, d = 1): string => String(round(x, d));

export function pulseCandidates(levels: readonly LevelPulse[], moved: readonly Moved[], L: Limits): Candidate[] {
  const out: Candidate[] = [];
  const add = (c: Omit<Parameters<typeof candidate>[0], "via">, _p?: LevelPulse): void => { out.push(candidate({ via: "trace", ...c })); };

  const byPack = new Map<string, LevelPulse[]>();
  for (const p of levels) { const a = byPack.get(p.pack) ?? []; a.push(p); byPack.set(p.pack, a); }
  for (const a of byPack.values()) a.sort((x, y) => x.index - y.index);

  for (const p of levels) {
    const s = p.shape;
    const dur = Math.max(1, s.durS);
    const id = p.levelId;

    const ss = L.standingStill;
    if (ss.enabled && p.noTaskS > ss.noTaskS) {
      add({ category: ss.category, severity: ss.severity, levelId: id, subject: "standing_still", check: "idle",
        title: `${id}: ${fmt(p.noTaskS)} s with nothing worth doing`,
        detail: `The human-view bot's planner had no sensible task for ${fmt(p.noTaskS)} s in a row (limit ${ss.noTaskS} s); it stood still ${fmt(s.longestStillS)} s at most and ${fmt((s.stillS / dur) * 100, 0)}% of the level overall.`,
        metric: { name: "noTaskS", value: p.noTaskS, limit: ss.noTaskS } }, p);
    }

    const wt = L.waitingOnTimer;
    const dead = p.proxies["deadTime"]?.value ?? 0;
    if (wt.enabled && dead > wt.deadTime) {
      add({ category: wt.category, severity: wt.severity, levelId: id, subject: "dead_time", check: "timer",
        title: `${id}: ${fmt(dead * 100, 0)}% of the level spent with nothing to do`,
        detail: `The rater's dead-time proxy is ${fmt(dead, 3)} for the median bot (band ends at ${wt.deadTime}). Waiting on a timer or a machine.`,
        metric: { name: "deadTime", value: dead, limit: wt.deadTime } }, p);
    }

    const rp = L.repetition;
    if (rp.enabled && p.loopMax > rp.trips) {
      add({ category: rp.category, severity: rp.severity, levelId: id, subject: "repetition", check: "same_trip",
        title: `${id}: the same trip ${fmt(p.loopMax, 0)} times in a row`,
        detail: `The human-view bot repeated one trip (${p.loopKey || "?"}) ${fmt(p.loopMax, 0)} times with nothing new in between (limit ${rp.trips}); ${s.sameRunMax} identical deliveries in a row.`,
        metric: { name: "loopMax", value: p.loopMax, limit: rp.trips } }, p);
    }

    const nc = L.noChoice;
    if (nc.enabled && p.oneTaskS > nc.oneTaskS) {
      add({ category: nc.category, severity: nc.severity, levelId: id, subject: "no_choice", check: "one_task",
        title: `${id}: ${fmt(p.oneTaskS, 0)} s with only one thing to do`,
        detail: `The planner offered a single sensible task (${p.oneTaskKinds || "?"}) for ${fmt(p.oneTaskS)} s in a row (limit ${nc.oneTaskS} s).`,
        metric: { name: "oneTaskS", value: p.oneTaskS, limit: nc.oneTaskS } }, p);
    }

    const rd = L.rewardDrought;
    if (rd.enabled && s.rewardGapMaxS > rd.gapS) {
      add({ category: rd.category, severity: rd.severity, levelId: id, subject: "reward_gap", check: "drought",
        title: `${id}: ${fmt(s.rewardGapMaxS, 0)} s without a reward`,
        detail: `The longest stretch between rewards (a sale, a build, a rescue, an objective) was ${fmt(s.rewardGapMaxS)} s for the human-view bot (limit ${rd.gapS} s); the first came at ${fmt(s.firstRewardS)} s.`,
        metric: { name: "rewardGapMaxS", value: s.rewardGapMaxS, limit: rd.gapS } }, p);
    }

    const ft = L.flatTension;
    const peaks = p.proxies["tensionRhythm"]?.value ?? 0;
    if (ft.enabled && peaks < ft.minPeaks) {
      add({ category: ft.category, severity: ft.severity, levelId: id, subject: "tension", check: "flat",
        title: `${id}: threat never rises`,
        detail: `The rater counts ${fmt(peaks, 2)} tension peaks on average for the median bot (at least ${ft.minPeaks} expected).`,
        metric: { name: "tensionPeaks", value: peaks, limit: ft.minPeaks } }, p);
    }

    const ul = L.unfairLoss;
    const fair = p.proxies["fairFailure"]?.value ?? 1;
    if (ul.enabled && fair < ul.fairFailureMin) {
      add({ category: ul.category, severity: ul.severity, levelId: id, subject: "loss", check: "unexplained",
        title: `${id}: some losses come with no warning`,
        detail: `Only ${fmt(fair * 100, 0)}% of the bots' losses gave 10 s of warning or ended on the timer (the rater's fair-failure share; expected ${fmt(ul.fairFailureMin * 100, 0)}%).`,
        metric: { name: "fairFailure", value: fair, limit: ul.fairFailureMin } }, p);
    }

    const lr = L.longRunLoss;
    if (lr.enabled && p.human.lossAfterS > lr.lossAfterS) {
      add({ category: lr.category, severity: lr.severity, levelId: id, subject: "loss", check: "long_run",
        title: `${id}: a loss after ${fmt(p.human.lossAfterS, 0)} s of play`,
        detail: `The human-view bot lost a run after ${fmt(p.human.lossAfterS)} s (limit ${lr.lossAfterS} s): a long run thrown away.`,
        metric: { name: "lossAfterS", value: p.human.lossAfterS, limit: lr.lossAfterS } }, p);
    }

    const uh = L.humanCannotWin;
    if (uh.enabled && p.seeds >= uh.minSeeds && p.human.winRate === 0) {
      add({ category: uh.category, severity: uh.severity, levelId: id, subject: "human_bot", check: "never_wins",
        title: `${id}: the human-view bot never wins`,
        detail: `Lost all ${p.seeds} seeds while the good bot won ${fmt((p.winRate["good"] ?? 0) * 100, 0)}% of its runs.`,
        metric: { name: "humanWinRate", value: 0, limit: 0.01 } }, p);
    }

    const us = L.unreachableStars;
    if (us.enabled && p.seeds >= us.minSeeds) {
      for (const e of p.human.earned) {
        if (e.n > 0) continue;
        add({ category: us.category, severity: us.severity, levelId: id, subject: `star_${e.kind}`, check: "unreachable",
          title: `${id}: the "${e.kind}" star was never earned`,
          detail: `The human-view bot earned the ${e.kind} star objective on 0 of ${p.seeds} seeds.`,
          metric: { name: "starEarnedSeeds", value: 0, limit: 1 } }, p);
      }
    }
  }

  for (const a of byPack.values()) {
    const sp = L.difficultySpike;
    if (sp.enabled) {
      for (let i = 1; i < a.length; i++) {
        const drop = (a[i - 1]!.stars["human"] ?? 0) - (a[i]!.stars["human"] ?? 0);
        if (drop > sp.starDrop) {
          add({ category: sp.category, severity: sp.severity, levelId: a[i]!.levelId, subject: "stars.human", check: "spike",
            title: `${a[i]!.levelId}: human-view stars fall ${fmt(drop)} after ${a[i - 1]!.levelId}`,
            detail: `The human-view bot averages ${fmt(a[i]!.stars["human"] ?? 0, 2)} stars here after ${fmt(a[i - 1]!.stars["human"] ?? 0, 2)} on the level before (limit: a drop of ${sp.starDrop}).`,
            metric: { name: "starDrop", value: drop, limit: sp.starDrop } }, a[i]!);
        }
      }
    }
    const sl = L.sameAsLast;
    if (sl.enabled) {
      for (const [key, name] of [["family", "family"], ["template", "template"]] as const) {
        let run = 1;
        for (let i = 1; i < a.length; i++) {
          run = a[i]![key] === a[i - 1]![key] ? run + 1 : 1;
          if (run === sl.maxRun + 1) {
            add({ category: sl.category, severity: sl.severity, levelId: a[i]!.levelId, subject: name, check: "repeat",
              title: `${a[i]!.levelId}: ${sl.maxRun + 1} levels in a row of the same ${name}`,
              detail: `${a[i - 2]?.levelId ?? "?"}, ${a[i - 1]!.levelId} and ${a[i]!.levelId} share the ${name} "${a[i]![key]}" (limit: more than ${sl.maxRun} in a row).`,
              metric: { name: `${name}Run`, value: run, limit: sl.maxRun } }, a[i]!);
          }
        }
      }
    }
    const lw = L.longWalks;
    if (lw.enabled && a.length >= lw.minLevels) {
      const per = a.map((p) => ({ p, acts: usefulActs(p.shape) })).filter((x) => x.acts >= lw.minActs).map((x) => ({ p: x.p, perAct: x.p.shape.distU / x.acts }));
      const med = median(per.map((x) => x.perAct));
      if (med > 0) {
        for (const x of per) {
          if (x.perAct > lw.ratioToPackMedian * med) {
            add({ category: lw.category, severity: lw.severity, levelId: x.p.levelId, subject: "walking", check: "long_walks",
              title: `${x.p.levelId}: ${fmt(x.perAct / med)}× the pack's walking per action`,
              detail: `${fmt(x.perAct)} units walked per useful action against a pack median of ${fmt(med)} (limit ${lw.ratioToPackMedian}×).`,
              metric: { name: "walkPerActRatio", value: x.perAct / med, limit: lw.ratioToPackMedian } }, x.p);
          }
        }
      }
    }
  }

  const mc = L.movedCandidates;
  const byId = new Map(levels.map((p) => [p.levelId, p]));
  for (const mv of moved) {
    const p = byId.get(mv.levelId);
    if (!p || !mc.fields.includes(mv.field) || mv.delta >= 0) continue;
    add({ category: mc.category, severity: mc.severity, levelId: mv.levelId, subject: mv.field, check: "moved",
      title: `${mv.levelId}: ${mv.field} fell from ${fmt(mv.prev, 2)} to ${fmt(mv.now, 2)} since the last run`,
      detail: `Moved past tolerance between the previous history row and this run.`,
      metric: { name: mv.field, value: mv.now, limit: mv.prev } }, p);
  }

  return out;
}

// ---------- packs ----------

export interface LevelRef { pack: string; packDir: string; file: string; id: string; index: number }

/** Levels of a pack folder in play order: pack.json when there is one, else every manifest in the folder by name. */
export function listLevels(packDir: string): LevelRef[] {
  const pack = basename(packDir);
  const pj = join(packDir, "pack.json");
  const entries = existsSync(pj)
    ? (JSON.parse(readFileSync(pj, "utf8")) as { levels: { id: string; file: string }[] }).levels
    : readdirSync(packDir).filter((f) => f.endsWith(".json")).sort().map((f) => ({ id: f.replace(/\.json$/, ""), file: f }));
  return entries.map((e, index) => ({ pack, packDir, file: e.file, id: e.id, index }));
}

export const readManifest = (ref: LevelRef): unknown => JSON.parse(readFileSync(join(ref.packDir, ref.file), "utf8")) as unknown;

/** The five levels before this one in its pack, for the rater's novelty proxy (as the rater CLI does for a folder). */
export function historyBefore(ref: LevelRef, all: readonly LevelRef[]): HistoryEntry[] {
  const before = all.filter((r) => r.packDir === ref.packDir && r.index < ref.index).slice(-5);
  return before.map((r) => historyEntry(readManifest(r)));
}


export interface PulseRun { file: PulseFile; candidates: Candidate[]; rows: HistoryRow[] }

/** Assemble the output from level pulses and the previous history. Pure, so tests can drive it. */
export function assemble(levels: readonly LevelPulse[], previous: readonly HistoryRow[], L: Limits, meta: Omit<PulseMeta, "levels">, build: string | null): PulseRun {
  const last = lastRows(previous);
  const moved = levels.flatMap((p) => compareToPrevious(p, last.get(p.levelId), L.tolerance));
  const file: PulseFile = { v: 1, meta: { ...meta, levels: levels.length }, levels: Object.fromEntries(levels.map((p) => [p.levelId, p])), moved };
  const date = meta.generated.slice(0, 10);
  const rows: HistoryRow[] = levels.map((p) => ({ v: 1, date, build, engine: meta.engine, content: meta.content, ...p }));
  return { file, candidates: pulseCandidates(levels, moved, L), rows };
}
