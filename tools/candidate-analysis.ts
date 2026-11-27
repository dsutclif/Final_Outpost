// outpost-ops#251 part 2: read raw candidate logs (levels/candidates/*.jsonl, the per-build archives
// levels/candidates/archive/*.jsonl.gz, the ops backup data/bot-runs/candidates) and report
//   1. failure causes: reject kinds overall, per family and per recipe;
//   2. noise: how far one bot's per-seed margin spreads within a candidate, and what that leaves for the
//      mean at 4 and 2 seeds, against the search tolerance (0.05) and the verify window (0.07);
//   3. knob sensitivity: per family, which knobs move D smoothly with them (rank correlation inside each
//      level's search, averaged) and how often a search step moved D against that knob's usual direction.
// Read-only. pnpm levels:analyse [files or folders ...] [--json]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

/** The fields of a candidate row this report reads (tools/build-levels.ts writes many more). */
export interface CandRow {
  id: string;
  family: string;
  recipeId?: string;
  run?: string;
  iteration?: number;
  /** The search's difficulty scalar; the knobs are set from it. */
  p?: number;
  knobs?: Record<string, number>;
  rejects: string[];
  shipped?: boolean;
  rating?: { D?: number } | null;
  runs?: { bot: string; seed: number; m?: number }[];
}

export const TOLERANCE = 0.05;
export const VERIFY_WINDOW = 0.07;

/** Candidate rows from one log's text: header, end and recipe rows (no `rejects` list) are skipped, as are broken lines. */
export function parseRows(text: string): CandRow[] {
  const out: CandRow[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let r: unknown;
    try { r = JSON.parse(line); } catch { continue; }
    const c = r as Partial<CandRow>;
    if (Array.isArray(c.rejects) && typeof c.id === "string" && typeof c.family === "string") out.push(c as CandRow);
  }
  return out;
}

/** Every log file under the given paths (.jsonl and .jsonl.gz), folders searched one level down. */
export function logFiles(paths: readonly string[]): string[] {
  const files: string[] = [];
  const isLog = (f: string): boolean => /\.jsonl(\.gz)?$/.test(f);
  for (const p of paths) {
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p)) {
        const q = join(p, f);
        if (statSync(q).isDirectory()) { for (const g of readdirSync(q)) if (isLog(g)) files.push(join(q, g)); }
        else if (isLog(f)) files.push(q);
      }
    } else if (isLog(p)) files.push(p);
  }
  return files;
}

export function readLog(file: string): CandRow[] {
  const buf = readFileSync(file);
  return parseRows((file.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8"));
}

/** Rows of several logs with exact repeats dropped: a build's live log and its archive (and the ops backup) hold the same rows. */
export function readLogs(files: readonly string[]): CandRow[] {
  const seen = new Set<string>(), out: CandRow[] = [];
  for (const f of files) for (const r of readLog(f)) { const k = JSON.stringify(r); if (!seen.has(k)) { seen.add(k); out.push(r); } }
  return out;
}

type Counts = Record<string, number>;
const bump = (c: Counts, k: string, n = 1): void => { c[k] = (c[k] ?? 0) + n; };
const sortDesc = (c: Counts): [string, number][] => Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

export interface Causes {
  rows: number;
  rejected: number;
  shipped: number;
  byKind: [string, number][];
  byFamily: Record<string, { rows: number; rejected: number; kinds: [string, number][] }>;
  byRecipe: { recipe: string; rows: number; rejected: number; top: string }[];
}

export function failureCauses(rows: readonly CandRow[]): Causes {
  const kinds: Counts = {};
  const fam: Record<string, { rows: number; rejected: number; kinds: Counts }> = {};
  const rec: Record<string, { rows: number; rejected: number; kinds: Counts }> = {};
  let rejected = 0, shipped = 0;
  for (const r of rows) {
    const f = (fam[r.family] ??= { rows: 0, rejected: 0, kinds: {} });
    const k = (rec[r.recipeId ?? "(none)"] ??= { rows: 0, rejected: 0, kinds: {} });
    f.rows++; k.rows++;
    if (r.shipped) shipped++;
    if (r.rejects.length === 0) continue;
    rejected++; f.rejected++; k.rejected++;
    for (const why of new Set(r.rejects)) { bump(kinds, why); bump(f.kinds, why); bump(k.kinds, why); }
  }
  return {
    rows: rows.length, rejected, shipped, byKind: sortDesc(kinds),
    byFamily: Object.fromEntries(Object.entries(fam).sort().map(([n, v]) => [n, { rows: v.rows, rejected: v.rejected, kinds: sortDesc(v.kinds) }])),
    byRecipe: Object.entries(rec).map(([recipe, v]) => ({ recipe, rows: v.rows, rejected: v.rejected, top: sortDesc(v.kinds)[0]?.[0] ?? "-" }))
      .sort((a, b) => b.rejected - a.rejected || a.recipe.localeCompare(b.recipe)),
  };
}

const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2; };
const sd = (xs: readonly number[]): number => { const n = xs.length; if (n < 2) return NaN; const m = xs.reduce((a, b) => a + b, 0) / n; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); };

export interface Noise { family: string; candidates: number; sdSeed: number; sdMean4: number; sdMean2: number; overTolerance4: boolean; overTolerance2: boolean }

/**
 * Seed noise per family: for each candidate and bot with 2+ seeds, the spread (sd) of the per-seed margin;
 * the family's median of that, and the sd it leaves on a mean of 4 and of 2 seeds (sd / sqrt n). A margin
 * is the bot's own score, not D, so this is an estimate of D's noise, labelled as such in the report.
 */
export function seedNoise(rows: readonly CandRow[]): Noise[] {
  const per: Record<string, number[]> = {};
  for (const r of rows) {
    const byBot: Record<string, number[]> = {};
    for (const x of r.runs ?? []) if (typeof x.m === "number") (byBot[x.bot] ??= []).push(x.m);
    for (const ms of Object.values(byBot)) if (ms.length >= 2) (per[r.family] ??= []).push(sd(ms));
  }
  return Object.entries(per).sort().map(([family, sds]) => {
    const s = median(sds);
    return { family, candidates: sds.length, sdSeed: s, sdMean4: s / 2, sdMean2: s / Math.SQRT2, overTolerance4: s / 2 > TOLERANCE, overTolerance2: s / Math.SQRT2 > TOLERANCE };
  });
}

/** Spearman rank correlation; NaN when either side has no spread. */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
  const rank = (v: readonly number[]): number[] => {
    const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const a = rank(xs), b = rank(ys), n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2; }
  return da === 0 || db === 0 ? NaN : num / Math.sqrt(da * db);
}

export interface KnobRank { knob: string; searches: number; rho: number; flipRate: number }

/**
 * Per family, per knob: inside each search (one level in one run, rows with a D, in iteration order) the rank
 * correlation of the knob with D, averaged over searches (|rho| near 1 = a smooth dial); and the flip rate, the
 * share of steps where the knob moved and D moved against the sign of that average. Knobs that never move are left out.
 */
export function knobSensitivity(rows: readonly CandRow[], minRows = 4): Record<string, KnobRank[]> {
  const searches: Record<string, CandRow[]> = {};
  for (const r of rows) if (typeof r.rating?.D === "number" && r.knobs) (searches[`${r.family}|${r.run ?? ""}|${r.id}`] ??= []).push(r);
  const acc: Record<string, Record<string, { rhos: number[]; steps: [number, number][] }>> = {};
  for (const [key, list] of Object.entries(searches)) {
    if (list.length < minRows) continue;
    const fam = key.split("|")[0]!;
    list.sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));
    const D = list.map((r) => r.rating!.D!);
    // "p" is the search's own scalar: every knob is set from it (the 2026-11-18 report found |rho| >= 0.9 for all of them), so it is ranked too
    for (const knob of ["p", ...Object.keys(list[0]!.knobs!)]) {
      const v = list.map((r) => (knob === "p" ? r.p : r.knobs![knob]) ?? NaN);
      if (v.some((x) => !Number.isFinite(x))) continue;
      const rho = spearman(v, D);
      if (Number.isNaN(rho)) continue;
      const a = ((acc[fam] ??= {})[knob] ??= { rhos: [], steps: [] });
      a.rhos.push(rho);
      for (let i = 1; i < list.length; i++) if (v[i] !== v[i - 1]) a.steps.push([Math.sign(v[i]! - v[i - 1]!), Math.sign(D[i]! - D[i - 1]!)]);
    }
  }
  const out: Record<string, KnobRank[]> = {};
  for (const [fam, knobs] of Object.entries(acc).sort()) {
    out[fam] = Object.entries(knobs).map(([knob, a]) => {
      const rho = a.rhos.reduce((s, x) => s + x, 0) / a.rhos.length;
      const dir = Math.sign(rho);
      const moved = a.steps.filter(([, dd]) => dd !== 0);
      const flips = dir === 0 ? moved.length : moved.filter(([dk, dd]) => dk * dd !== dir).length;
      return { knob, searches: a.rhos.length, rho, flipRate: moved.length ? flips / moved.length : NaN };
    }).sort((x, y) => Math.abs(y.rho) - Math.abs(x.rho) || x.knob.localeCompare(y.knob));
  }
  return out;
}

const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)}%` : "-");
const f2 = (x: number): string => (Number.isFinite(x) ? x.toFixed(3) : "-");

export function report(rows: readonly CandRow[], files: number): string {
  const c = failureCauses(rows), noise = seedNoise(rows), knobs = knobSensitivity(rows);
  const L: string[] = [];
  L.push(`candidate rows: ${c.rows} from ${files} log file(s); rejected ${c.rejected} (${pct(c.rejected, c.rows)}); shipped ${c.shipped}`);
  L.push("", "failure causes (a row counts once per reason):");
  for (const [k, n] of c.byKind) L.push(`  ${k}: ${n} (${pct(n, c.rejected)} of rejected rows)`);
  L.push("", "per family:");
  for (const [f, v] of Object.entries(c.byFamily)) L.push(`  ${f}: ${v.rows} rows, ${pct(v.rejected, v.rows)} rejected; ${v.kinds.slice(0, 4).map(([k, n]) => `${k} ${n}`).join(", ") || "-"}`);
  L.push("", "recipes with the most rejects (top 10):");
  for (const r of c.byRecipe.slice(0, 10)) L.push(`  ${r.rejected}/${r.rows} ${r.top.padEnd(14)} ${r.recipe.slice(0, 90)}`);
  L.push("", `seed noise (median sd of one bot's per-seed margin; an estimate of D's noise) vs tolerance ${TOLERANCE} and verify window ${VERIFY_WINDOW}:`);
  for (const n of noise) L.push(`  ${n.family}: ${n.candidates} samples, per seed ${f2(n.sdSeed)}, mean of 4 ${f2(n.sdMean4)}${n.overTolerance4 ? " (over tolerance)" : ""}, mean of 2 ${f2(n.sdMean2)}${n.overTolerance2 ? " (over tolerance)" : ""}`);
  L.push("", "difficulty dials per family (knob: mean rank correlation with D inside a search, flip rate of steps; smooth = |rho| high, flips low).");
  L.push("  The search moves every knob together from p, so knobs that all track p are not separable here; a sweep that moves one knob at a time is.");
  for (const [f, ks] of Object.entries(knobs)) {
    L.push(`  ${f}:`);
    for (const k of ks.slice(0, 6)) L.push(`    ${k.knob.padEnd(14)} rho ${f2(k.rho)}  flips ${Number.isFinite(k.flipRate) ? pct(k.flipRate * 1000, 1000) : "-"}  (${k.searches} searches)`);
  }
  if (Object.keys(knobs).length === 0) L.push("  (no search had 4+ rated rows)");
  return L.join("\n");
}

// run by `pnpm levels:analyse` (which passes --run, as levels:digest passes --digest); importing it does nothing
if (process.argv.includes("--run")) {
  const args = process.argv.slice(2).filter((a) => a !== "--" && a !== "--run");
  const json = args.includes("--json");
  const root = resolve(import.meta.dirname, "..");
  const paths = args.filter((a) => !a.startsWith("--"));
  const files = logFiles(paths.length ? paths : [join(root, "levels", "candidates"), join(root, "..", "outpost-ops", "data", "bot-runs", "candidates"), join(root, "..", "data", "bot-runs", "candidates")]);
  const rows = readLogs(files);
  if (json) console.log(JSON.stringify({ files: files.length, causes: failureCauses(rows), noise: seedNoise(rows), knobs: knobSensitivity(rows) }, null, 1));
  else console.log(report(rows, files.length));
}
