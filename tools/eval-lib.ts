import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evalManifest, historyEntry, type HistoryEntry, type RatingDetail } from "../packages/rater/src/index.js";

// Writer behind `pnpm levels:eval`: reads levels/packs/<pack>/pack.json and the level files (never writes there),
// rates each level and writes levels/eval/<pack>/<id>.json plus index.json.

export interface PackLevel { id: string; file: string }
export interface EvalIndexRow { id: string; goal: string; D: number; F: number; botsPassed: string[]; ok: boolean; waves: number; file: string }
export interface EvalOptions { root: string; pack: string; only?: readonly string[]; refSeeds?: number; otherSeeds?: number; log?: (s: string) => void }

export const readPack = (root: string, pack: string): { id: string; levels: PackLevel[] } =>
  JSON.parse(readFileSync(join(root, "levels", "packs", pack, "pack.json"), "utf8")) as { id: string; levels: PackLevel[] };

/** Rate one level of a pack (history = the pack's earlier levels, as in generation) and write its side file. Returns the detail. */
export function evalLevel(opts: EvalOptions, levelId: string): RatingDetail {
  const pack = readPack(opts.root, opts.pack);
  const dir = join(opts.root, "levels", "packs", opts.pack);
  const history: HistoryEntry[] = [];
  let target: unknown = null;
  for (const l of pack.levels) {
    const m = JSON.parse(readFileSync(join(dir, l.file), "utf8")) as { id: string; rating?: Record<string, unknown> };
    if (l.id === levelId) { target = m; break; }
    history.push(historyEntry(m));
  }
  if (!target) throw new Error(`level ${levelId} not in pack ${opts.pack}`);
  const m = target as { rating?: Record<string, unknown> };
  const d = evalManifest(target, { history, ...(opts.refSeeds ? { refSeeds: opts.refSeeds } : {}), ...(opts.otherSeeds ? { otherSeeds: opts.otherSeeds } : {}) });
  if (m.rating) d.packRecord = m.rating;
  const out = join(opts.root, "levels", "eval", opts.pack);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${levelId}.json`), JSON.stringify(d) + "\n");
  return d;
}

export function evalPack(opts: EvalOptions): EvalIndexRow[] {
  const pack = readPack(opts.root, opts.pack);
  const out = join(opts.root, "levels", "eval", opts.pack);
  const idxFile = join(out, "index.json");
  const rows = new Map<string, EvalIndexRow>();
  if (existsSync(idxFile)) for (const r of (JSON.parse(readFileSync(idxFile, "utf8")) as { levels: EvalIndexRow[] }).levels) rows.set(r.id, r);
  const ids = pack.levels.map((l) => l.id).filter((id) => !opts.only || opts.only.includes(id));
  for (const id of ids) {
    const t0 = Date.now();
    const d = evalLevel(opts, id);
    rows.set(id, { id, goal: d.goal, D: d.D, F: d.F, botsPassed: d.botsPassed, ok: d.ok, waves: d.defendTrace.length, file: `${id}.json` });
    opts.log?.(`${id} ${d.goal} D=${d.D} F=${d.F} ok=${d.ok} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const order = new Map(pack.levels.map((l, i) => [l.id, i] as const));
    mkdirSync(out, { recursive: true });
    writeFileSync(idxFile, JSON.stringify({ schema: 1, pack: opts.pack, levels: [...rows.values()].filter((r) => order.has(r.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!) }, null, 1) + "\n");
  }
  return [...rows.values()];
}
