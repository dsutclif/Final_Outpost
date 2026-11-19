import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { activeEntries, emptyPool, type LevelPool, type PoolEntry } from "../packages/sequencer/src/pool.js";
import type { LevelRequest } from "../packages/sequencer/src/index.js";

// File side of the level pool (outpost-ops#254): level-pool.json holds the entries, the saved level
// JSON files sit in a folder next to it (level-pool.levels/<id>.json). Written whole and renamed.

export const levelsDirOf = (poolPath: string): string => join(dirname(poolPath), `${basename(poolPath, ".json")}.levels`);

export function loadPool(path: string): LevelPool {
  if (!existsSync(path)) return emptyPool();
  const p = JSON.parse(readFileSync(path, "utf8")) as LevelPool;
  return { settings: { ...emptyPool().settings, ...p.settings }, entries: p.entries ?? [] };
}

export function savePool(path: string, pool: LevelPool): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(pool, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
}

export const readPoolLevel = (path: string, e: PoolEntry): unknown => JSON.parse(readFileSync(join(levelsDirOf(path), e.file), "utf8"));

/** What a worker's candidate row has to carry to be pooled. */
export interface PoolRow {
  seed: number;
  attempt: number;
  iteration: number;
  rejects: string[];
  manifest?: unknown;
  rating?: { D: number; F: number; feasible: boolean };
  stars?: Record<string, number>;
}

/**
 * Candidates that passed every check but the slot's D target: the only reject is offTarget (the search
 * rejects on D after objectives, stars, filters and the idle check), it is feasible, and its fun clears the
 * slot's bar. Returns the saved entries (skipping ones already in the pool).
 */
export function savePassing(path: string, req: LevelRequest, recipeId: string, rows: readonly PoolRow[], o: { engine: string; date: string; skipD?: number | null }): PoolEntry[] {
  const pool = loadPool(path);
  const saved: PoolEntry[] = [];
  for (const c of rows) {
    if (!c.manifest || !c.rating || !c.rating.feasible || c.rejects.length === 0 || !c.rejects.every((r) => r === "offTarget")) continue;
    if (c.rating.F < req.funThreshold) continue;
    if (o.skipD !== undefined && o.skipD !== null && c.rating.D === o.skipD) continue; // the level that shipped
    const json = JSON.stringify(c.manifest, null, 2) + "\n";
    const id = createHash("sha256").update(json).digest("hex").slice(0, 12);
    if (pool.entries.some((e) => e.id === id)) continue;
    const e: PoolEntry = {
      id, file: `${id}.json`, D: c.rating.D, F: c.rating.F, family: req.family, secondary: req.secondary, goalId: req.goalId, goalType: req.goalType,
      template: req.template, features: [...req.features], modules: [...req.modules], introduced: [...req.introduced], engine: o.engine,
      recipeId, slotId: req.id, slotTarget: req.target, seed: c.seed, attempt: c.attempt, iteration: c.iteration, starsByRung: c.stars ?? {}, date: o.date,
    };
    mkdirSync(levelsDirOf(path), { recursive: true });
    writeFileSync(join(levelsDirOf(path), e.file), json);
    pool.entries.push(e);
    saved.push(e);
  }
  // the pool stays bounded: oldest entries (and entries from an older engine) go first
  if (saved.length > 0) {
    const keep = new Set(activeEntries(pool, o.engine).map((e) => e.id));
    const live = pool.entries.filter((e) => keep.has(e.id)).slice(-pool.settings.maxEntries);
    for (const e of pool.entries) if (!live.includes(e)) rmSync(join(levelsDirOf(path), e.file), { force: true });
    pool.entries = live;
    savePool(path, pool);
  }
  return saved;
}

/** Take an entry out of the pool once its level is used (or failed its re-check). */
export function removeEntry(path: string, id: string): boolean {
  const pool = loadPool(path);
  const e = pool.entries.find((x) => x.id === id);
  if (!e) return false;
  pool.entries = pool.entries.filter((x) => x.id !== id);
  rmSync(join(levelsDirOf(path), e.file), { force: true });
  savePool(path, pool);
  return true;
}
