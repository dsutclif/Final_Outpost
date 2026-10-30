import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// pnpm levels:digest
//
// levels/candidates/<pack>.jsonl (gitignored) grows by megabytes a build. This folds it into one small
// file per day and pack, levels/candidates/digest/<YYYY-MM-DD>.<pack>.json (committed; a file per pack because
// GitHub Actions and local builds land on the same day and one-line files cannot merge): outcome counts and pass/fail
// histograms of the settings rules are written against. levels:build runs it after every build.
// A run already in a day's digest is never counted twice. Raw records older than KEEP_DAYS are dropped.

const KEEP_DAYS = 14;

/** Bin widths: a setting's value is counted in the bin floor(value / width) * width. */
const WIDTHS: Record<string, number> = {
  p: 0.1, D: 0.1, F: 0.1, botShare: 0.1, budget: 60, botSeconds: 30, loopMax: 1, ladderLeft: 8,
  pads: 3, hires: 2, currencyCost: 50, salvageCost: 50, fuelNodes: 2, captures: 1,
  burn: 0.2, baseHealth: 1, startCurrency: 5,
  podFreeze: 20, spawn: 0.2, costScale: 0.1, length: 30, margin: 0.1,
  waves: 1, peakWave: 25, peakPoints: 25, towers: 2, perTower: 5, dropShare: 0.1, firstWave: 10,
};

/** A line of the raw log (the fields used here). */
export interface RawCandidate {
  run: string; engine: string; index: number; family: string; goalType: string; target: number;
  p: number; knobs: Record<string, number>; rejects: string[]; why?: string; kept: boolean; shipped: boolean; final?: boolean; ms?: number;
  settings?: {
    params: Record<string, number>; pads: number; hires: number; towers: number; salvageCost: number; currencyCost: number;
    fuelNodes: number; captures: number; waveTimes: number[]; waveSizes: number[]; waveDrops: number[]; wavePoints?: number[];
  };
  quick?: { seconds: number }[];
  rating?: { D: number; F: number; loopMax: number; ladderLeft: number; idleModules: string[]; budget?: number };
  idleElements?: string[];
}

export interface LevelDigest { family: string; goal: string; target: number; candidates: number; shipped: number; dMin: number | null; dMax: number | null }

export interface Digest {
  day: string;
  runs: string[];
  engines: string[];
  candidates: number;
  /** Flat counters: family|f|outcome, goal|g|outcome, reject|r, why|text, idle|f|what, hist|f|setting|bin|outcome, and ms|f|outcome for time spent. */
  counts: Record<string, number>;
  /** By build target ("<pack>:<index>" keys): the D range the search reached. */
  levels: Record<string, LevelDigest>;
}

/** What became of a candidate: shipped, kept, or its last reject (layout only when nothing was built). */
export function outcome(c: RawCandidate): string {
  if (c.shipped) return "shipped";
  if (c.kept) return "kept";
  const rs = c.settings ? c.rejects.filter((r) => r !== "layout" && r !== "flow") : c.rejects;
  return rs[rs.length - 1] ?? "closer";
}

/** The settings of a candidate, by the names in WIDTHS; absent ones were not reached or do not apply. */
export function settingsOf(c: RawCandidate): Record<string, number> {
  const k = c.knobs;
  const out: Record<string, number | undefined> = { p: c.p, burn: k["burn"], podFreeze: k["podFreeze"], spawn: k["spawn"], costScale: k["costScale"], length: k["length"], margin: k["margin"] };
  const s = c.settings;
  if (s) {
    Object.assign(out, { pads: s.pads, hires: s.hires, currencyCost: s.currencyCost, salvageCost: s.salvageCost, fuelNodes: s.fuelNodes, captures: s.captures,
      baseHealth: s.params["meters.baseHealth"], startCurrency: s.params["start.currency"] });
    if (s.waveSizes.length > 0) {
      const peak = Math.max(...s.waveSizes);
      const before = s.waveDrops.slice(0, -1).reduce((t, n) => t + n, 0);
      Object.assign(out, { waves: s.waveSizes.length, peakWave: peak, ...(s.wavePoints ? { peakPoints: Math.max(...s.wavePoints) } : {}), towers: s.towers, firstWave: s.waveTimes[0],
        ...(s.towers > 0 ? { perTower: peak / s.towers } : {}), ...(s.salvageCost > 0 ? { dropShare: before / s.salvageCost } : {}) });
    }
  }
  const top = c.quick && c.quick.length > 0 ? Math.max(...c.quick.map((q) => q.seconds)) : undefined;
  if (top !== undefined) out["botSeconds"] = top;
  const r = c.rating;
  if (r) {
    Object.assign(out, { D: r.D, F: r.F, loopMax: r.loopMax });
    if (r.ladderLeft >= 0) out["ladderLeft"] = r.ladderLeft;
    if (r.budget) { out["budget"] = r.budget; if (top !== undefined) out["botShare"] = top / r.budget; }
  }
  return Object.fromEntries(Object.entries(out).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])));
}

const bin = (x: number, w: number) => Math.round(Math.floor(x / w + 1e-9) * w * 1000) / 1000;

const emptyDigest = (day: string): Digest => ({ day, runs: [], engines: [], candidates: 0, counts: {}, levels: {} });

/** Add one candidate of a pack to a digest. */
export function addCandidate(d: Digest, pack: string, c: RawCandidate): void {
  const add = (k: string) => { d.counts[k] = (d.counts[k] ?? 0) + 1; };
  const o = outcome(c);
  d.candidates++;
  add(`family|${c.family}|${o}`);
  add(`goal|${c.goalType}|${o}`);
  if (c.ms !== undefined) d.counts[`ms|${c.family}|${c.final ? "final" : o}`] = (d.counts[`ms|${c.family}|${c.final ? "final" : o}`] ?? 0) + c.ms;
  c.rejects.forEach((r) => add(`reject|${r}`));
  // numbers and ids vary per level: the shape of the message is what repeats
  if (c.why) add(`why|${c.why.replace(/[-0-9.]+/g, "#").slice(0, 80)}`);
  c.rating?.idleModules.forEach((m) => add(`idle|${c.family}|${m}`));
  c.idleElements?.forEach((e) => add(`idle|${c.family}|${e.split(" ")[0]}`));
  for (const [name, v] of Object.entries(settingsOf(c))) add(`hist|${c.family}|${name}|${bin(v, WIDTHS[name]!)}|${o}`);
  const key = `${pack}:${c.index}`;
  const l = d.levels[key] ??= { family: c.family, goal: c.goalType, target: c.target, candidates: 0, shipped: 0, dMin: null, dMax: null };
  l.candidates++;
  if (c.shipped) l.shipped++;
  if (c.rating) {
    l.dMin = l.dMin === null ? c.rating.D : Math.min(l.dMin, c.rating.D);
    l.dMax = l.dMax === null ? c.rating.D : Math.max(l.dMax, c.rating.D);
  }
}

/** Fold a pack's raw log into the day digests and drop records older than KEEP_DAYS. Returns the days touched. */
export function digestLog(rawPath: string, digestDir: string, now = Date.now()): string[] {
  if (!existsSync(rawPath)) return [];
  const pack = rawPath.split(/[\\/]/).pop()!.replace(/\.jsonl$/, "");
  const lines = readFileSync(rawPath, "utf8").split("\n").filter((l) => l.length > 0);
  const open = new Map<string, Digest>();
  const seen = new Map<string, boolean>();
  const load = (day: string): Digest => {
    let d = open.get(day);
    if (!d) {
      const p = join(digestDir, `${day}.${pack}.json`);
      d = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) as Digest : emptyDigest(day);
      open.set(day, d);
    }
    return d;
  };
  // A run counts once across all of a day's files, the older shared one included.
  const dayRuns = (day: string): string[] => (existsSync(digestDir) ? readdirSync(digestDir) : [])
    .filter((f) => f === `${day}.json` || f.startsWith(`${day}.`))
    .flatMap((f) => (JSON.parse(readFileSync(join(digestDir, f), "utf8")) as Digest).runs);
  const touched = new Set<string>();
  const kept: string[] = [];
  const cutoff = now - KEEP_DAYS * 86_400_000;
  for (const line of lines) {
    const c = JSON.parse(line) as RawCandidate;
    const day = c.run.slice(0, 10);
    const d = load(day);
    const runKey = `${pack}@${c.run}`;
    // a run is new only if the digest did not list it when this pass began
    if (!seen.has(runKey)) seen.set(runKey, !dayRuns(day).includes(runKey));
    if (seen.get(runKey)) {
      addCandidate(d, pack, c);
      if (!d.runs.includes(runKey)) d.runs.push(runKey);
      if (!d.engines.includes(c.engine)) d.engines.push(c.engine);
      touched.add(day);
    }
    if (Date.parse(c.run) >= cutoff) kept.push(line);
  }
  mkdirSync(digestDir, { recursive: true });
  for (const day of touched) writeFileSync(join(digestDir, `${day}.${pack}.json`), stableJson(open.get(day)!) + "\n");
  if (kept.length < lines.length) {
    writeFileSync(`${rawPath}.tmp`, kept.length > 0 ? kept.join("\n") + "\n" : "");
    renameSync(`${rawPath}.tmp`, rawPath);
  }
  return [...touched].sort();
}

/** Sorted keys, so a day's file diffs cleanly when a second build lands on it. */
function stableJson(d: Digest): string {
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify({ ...d, counts: sorted(d.counts), levels: sorted(d.levels) }, null, 0);
}

if (process.argv.includes("--digest")) {
  const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "levels", "candidates");
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    if (!f.endsWith(".jsonl") || f.startsWith("sweep-")) continue;
    console.log(`${f}: ${digestLog(join(dir, f), join(dir, "digest")).join(", ") || "nothing new"}`);
  }
}
