import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Shared by the review commands (docs/review/CONTRACT.md §3-4): argument parsing, the candidate
// finding shape, the limits file, and the few statistics the tools share. Nothing here touches the sim.

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** Where the user ran the command (pnpm sets INIT_CWD), so relative paths mean what they typed. */
export const baseDir = process.env["INIT_CWD"] ?? process.cwd();

/** A path from the command line: as typed (against the caller's folder), else against the repo root. */
export function resolveIn(p: string): string {
  if (isAbsolute(p)) return p;
  const here = resolve(baseDir, p);
  return existsSync(here) ? here : existsSync(resolve(repoRoot, p)) ? resolve(repoRoot, p) : here;
}

export class Args {
  constructor(private readonly argv: readonly string[]) {}
  get(name: string, fallback?: string): string | undefined {
    const i = this.argv.indexOf(name);
    return i >= 0 && i + 1 < this.argv.length ? this.argv[i + 1] : fallback;
  }
  num(name: string, fallback: number): number {
    const v = this.get(name);
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  has(name: string): boolean { return this.argv.includes(name); }
  list(name: string, fallback: readonly string[] = []): string[] {
    const v = this.get(name);
    return v === undefined ? [...fallback] : v.split(",").map((s) => s.trim()).filter((s) => s !== "");
  }
  /** A required option: prints the usage and exits when it is missing. */
  need(name: string, usage: string): string {
    const v = this.get(name);
    if (v === undefined) { console.error(`missing ${name}\nusage: ${usage}`); process.exit(2); }
    return v;
  }
}

export const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

export function writeJson(dir: string, name: string, data: unknown): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return file;
}

export function appendJsonl(file: string, rows: readonly unknown[]): void {
  if (rows.length === 0) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, rows.map((r) => JSON.stringify(r) + "\n").join(""));
}

/** Rows of a JSONL file; lines that are not JSON are skipped (a half-written last line must not stop a night). */
export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const out: T[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try { out.push(JSON.parse(line) as T); } catch { /* skip */ }
  }
  return out;
}

// ---------- statistics ----------

export const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

export function percentile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]!;
}

/** Middle value; the mean of the two middle values for an even count. */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 === 1 ? s[h]! : (s[h - 1]! + s[h]!) / 2;
}

export const round = (x: number, places = 2): number => { const k = 10 ** places; return Math.round(x * k) / k; };

/** Average ranks (ties share the mean of their ranks), 1-based. */
export function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
  const out = new Array<number>(xs.length).fill(0);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]!] === xs[idx[i]!]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]!] = r;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation; null when fewer than 3 pairs or either side never varies. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const a = ranks(xs.slice(0, n)), b = ranks(ys.slice(0, n));
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i]! - ma) * (b[i]! - mb); saa += (a[i]! - ma) ** 2; sbb += (b[i]! - mb) ** 2; }
  if (saa === 0 || sbb === 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

// ---------- candidate findings (CONTRACT §4) ----------

export type Via = "probe" | "trace" | "data" | "eye";

export interface Candidate {
  fingerprint: string;
  category: number;
  severity: 1 | 2 | 3 | 4;
  via: Via;
  /** null only for category 18 (data health has no pillar in the review plan). */
  pillar: number | null;
  track: "main" | "story";
  levelId: string;
  title: string;
  detail: string;
  metric: { name: string; value: number; limit: number };
  evidence: string[];
}

/** The pillar each category serves (PLAYTEST-REVIEW-PLAN §1: the first pillar where the table lists two). */
export const CATEGORY_PILLAR: Readonly<Record<number, number | null>> = {
  1: 1, 2: 4, 3: 1, 4: 4, 5: 5, 6: 1, 7: 1, 8: 4, 9: 2, 10: 3, 11: 6, 12: 4, 13: 7, 14: 1, 15: 1, 17: 2, 18: null,
};

/**
 * One segment of a fingerprint. Numbers that name a measured value, index or time are replaced
 * (`gather:3` → `gather:#`), so a repeat on another night matches; digits inside a canonical id
 * (`res.food_raw_1`, `struct.ranged_defense.t2`) are part of the name and stay.
 */
export function segment(s: string): string {
  return s.replace(/[|\s]+/g, "_").replace(/(?<![A-Za-z_\d])\d+(?:\.\d+)?/g, "#");
}

export const fingerprint = (category: number, levelId: string, subject: string, check: string): string =>
  `cat${category}|${levelId}|${segment(subject)}|${segment(check)}`;

export interface CandidateInput {
  category: number;
  severity: 1 | 2 | 3 | 4;
  via: Via;
  levelId: string;
  subject: string;
  check: string;
  title: string;
  detail: string;
  metric: { name: string; value: number; limit: number };
  evidence?: string[];
}

export function candidate(c: CandidateInput): Candidate {
  const metric = { name: c.metric.name, value: round(c.metric.value, 3), limit: round(c.metric.limit, 3) };
  return {
    fingerprint: fingerprint(c.category, c.levelId, c.subject, c.check),
    category: c.category,
    severity: c.severity,
    via: c.via,
    pillar: CATEGORY_PILLAR[c.category] ?? null,
    track: c.category === 5 ? "story" : "main",
    levelId: c.levelId,
    title: c.title,
    detail: c.detail,
    metric,
    evidence: c.evidence ?? [],
  };
}

// ---------- limits ----------

export const limitsFile = join(repoRoot, "tools", "review", "boredom-limits.json");

export interface Check { category: number; severity: 1 | 2 | 3 | 4; enabled: boolean }

export interface Limits {
  /** noTaskS: bots (no sensible task for this long). The real* pair is for players, whose PlayShape only knows movement. */
  standingStill: Check & { noTaskS: number; realLongestStillS: number; realStillShare: number };
  waitingOnTimer: Check & { deadTime: number };
  /** trips: identical trips in a row (bots, BotTrace.loopMax). deliveries: PlayShape.sameRunMax, which counts every item (players). */
  repetition: Check & { trips: number; deliveries: number };
  longWalks: Check & { ratioToPackMedian: number; minLevels: number; minActs: number };
  noChoice: Check & { oneTaskS: number };
  rewardDrought: Check & { gapS: number };
  flatTension: Check & { minPeaks: number };
  difficultySpike: Check & { starDrop: number };
  sameAsLast: Check & { maxRun: number };
  unfairLoss: Check & { fairFailureMin: number; minLosses: number };
  longRunLoss: Check & { lossAfterS: number };
  unreachableStars: Check & { minSeeds: number };
  humanCannotWin: Check & { minSeeds: number };
  /** Sample every this many ticks; a task "scores sensibly" at or above minScore (Brain.taskKinds). */
  sampling: { everyTicks: number; minScore: number };
  /** History comparison: a field moved when |delta| exceeds both abs and rel × |previous|. */
  tolerance: Record<string, { abs: number; rel: number }>;
  /** Fields whose movement also becomes a candidate (the rest is reported in pulse.json only). */
  movedCandidates: { fields: string[]; category: number; severity: 1 | 2 | 3 | 4 };
  guide: Check & { stepStallS: number; loopReps: number; loopS: number; noGuideS: number; unfinished: boolean };
  telemetry: {
    ratings: { minRatings: number; downShare: number; severity: 1 | 2 | 3 | 4 };
    perf: { p95Ms: number; minSamples: number; severity: 1 | 2 | 3 | 4 };
    coldStart: { medianMs: number; minSessions: number; severity: 1 | 2 | 3 | 4 };
    errors: { severity: 1 | 2 | 3 | 4 };
    realShape: { minPlays: number; severity: 1 | 2 | 3 | 4 };
    health: { minRatingsTotal: number; minLevelEnds: number; ratingRateMin: number; newPlayerShareMin: number; minInstalls: number; perfCoverageMin: number; unansweredShareMax: number };
  };
  calibrate: { minLevels: number; minRatingsPerLevel: number; badShare: number; minRho: number; minJ: number; minPerClass: number };
}

export function loadLimits(file: string = limitsFile): Limits {
  return readJson<Limits>(file);
}
