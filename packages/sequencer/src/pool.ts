import { DEFAULT_CONFIG, compareVersions, featureClosure, goalKind, goalsFor, slotFor, unlockedFeatures, type Family, type HistoryEntry, type LevelRequest, type SequencerConfig } from "./index.js";

// Level pool (outpost-ops#254, "pool and place"). A candidate that passes every check except its
// slot's difficulty target is kept instead of thrown away; before a slot is generated the builder
// looks for a pool level that fits it. This file is the pure part: the entry shape and the fit rule.
// tools/level-pool.ts does the file work. The sequencer's own request logic is untouched: the rule
// below reads the same sequencer.json (intro order, goals' needs/avoid, duplicateWindow).

export interface PoolEntry {
  /** Content hash of the manifest; also the name of its file next to the pool. */
  id: string;
  /** Saved manifest, relative to the pool's level folder. */
  file: string;
  /** Rated difficulty and fun of the saved level. */
  D: number;
  F: number;
  family: Family;
  secondary: Family | null;
  goalId: string;
  goalType: string;
  template: string;
  features: string[];
  modules: string[];
  introduced: string[];
  /** Engine the level was built and rated on; entries from an older engine are ignored. */
  engine: string;
  /** Recipe key of the slot it was built for, and that slot's id and target. */
  recipeId: string;
  slotId: string;
  slotTarget: number;
  /** Replay key: the search seed, attempt and iteration that produced it (the manifest file is the level itself). */
  seed: number;
  attempt: number;
  iteration: number;
  /** Mean stars per rung on the final objectives, kept so a placed level reports them. */
  starsByRung: Record<string, number>;
  /** YYYY-MM-DD. */
  date: string;
}

export interface LevelPool { settings: { maxEntries: number }; entries: PoolEntry[] }

export const emptyPool = (): LevelPool => ({ settings: { maxEntries: 400 }, entries: [] });

/** Entries that count on `engine`: the register's rule, an older engine is ignored. */
export const activeEntries = (pool: LevelPool, engine?: string): PoolEntry[] =>
  pool.entries.filter((e) => engine === undefined || compareVersions(e.engine, engine) >= 0);

const dupKey = (mods: readonly string[], goal: string, tpl: string | undefined) => `${[...mods].sort().join(",")}|${goal}|${tpl ?? ""}`;

export interface FitOptions {
  /** The register's failGap: how far D may sit from the slot's target. */
  failGap: number;
  funThreshold?: number;
  config?: SequencerConfig;
}

/**
 * Why `e` does not fit the slot `req` (null when it fits). `history` is the requests before the slot
 * (most recent last). Order of the checks: difficulty, family, goal, features, duplicate.
 */
export function whyNotFit(e: PoolEntry, req: LevelRequest, history: readonly HistoryEntry[], o: FitOptions): string | null {
  const cfg = o.config ?? DEFAULT_CONFIG;
  if (Math.abs(e.D - req.target) > o.failGap) return `D ${e.D} is ${(Math.abs(e.D - req.target)).toFixed(3)} from target ${req.target} (gap ${o.failGap})`;
  if (e.F < (o.funThreshold ?? req.funThreshold)) return `fun ${e.F} below ${o.funThreshold ?? req.funThreshold}`;
  if (e.family !== req.family || e.secondary !== req.secondary) return `family ${e.family}${e.secondary ? `+${e.secondary}` : ""} is not ${req.family}${req.secondary ? `+${req.secondary}` : ""}`;
  const families: Family[] = req.secondary ? [req.family, req.secondary] : [req.family];
  // The goal must be one the entry's own features support (needs/avoid/anchor) and of the slot's goal kind family.
  if (!goalsFor(req.family, e.features, families, cfg).includes(e.goalId)) return `goal ${e.goalId} is not allowed with features [${e.features.join(",")}]`;
  if (goalKind(e.goalId, cfg) !== e.goalType) return `goal ${e.goalId} does not match its type ${e.goalType}`;
  const slot = slotFor(req.index, cfg);
  if (slot.phase === "teach" || slot.phase === "intro") {
    // teach and intro levels teach one fixed thing: same introduced features, same features and goal
    if (e.introduced.join(",") !== req.introduced.join(",")) return `introduces [${e.introduced.join(",")}], slot introduces [${req.introduced.join(",")}]`;
    if (e.features.join(",") !== req.features.join(",") || e.goalId !== req.goalId) return `teach/intro slot wants features [${req.features.join(",")}] and goal ${req.goalId}`;
  } else {
    if (e.introduced.length > 0) return "introduces a feature in a mix slot";
    const unlocked = new Set([...unlockedFeatures(req.family, req.index, cfg), ...(req.secondary ? unlockedFeatures(req.secondary, req.index, cfg) : [])]);
    const locked = e.features.filter((f) => !unlocked.has(f));
    if (locked.length > 0) return `features [${locked.join(",")}] not unlocked at level ${req.index}`;
    // cap: features nobody else pulls in (the picks) stay within mixFeatures.max, plus the goal's own adds and a finale's second-family extra
    const pulled = new Set(e.features.flatMap((f) => featureClosure([f], cfg).filter((x) => x !== f)));
    const roots = e.features.filter((x) => !pulled.has(x));
    const adds = cfg.goals[e.goalId]?.adds ?? [];
    const extra = adds.length + (req.secondary ? 1 : 0);
    if (roots.length > cfg.mixFeatures.max + extra) return `${roots.length} features exceeds the cap ${cfg.mixFeatures.max}+${extra}`;
  }
  const used = new Set(history.slice(-cfg.duplicateWindow).map((h) => dupKey(h.modules, h.goal, h.template)));
  if (used.has(dupKey(e.modules, e.goalType, e.template))) return `duplicate of a level in the last ${cfg.duplicateWindow}`;
  return null;
}

/** The closest-in-D active pool entry that fits (oldest first on a tie), or null. `claimed` entry ids are skipped. */
export function findFit(pool: LevelPool, req: LevelRequest, history: readonly HistoryEntry[], o: FitOptions & { engine?: string; claimed?: ReadonlySet<string> }): PoolEntry | null {
  const fits = activeEntries(pool, o.engine).filter((e) => !o.claimed?.has(e.id) && whyNotFit(e, req, history, o) === null);
  fits.sort((a, b) => Math.abs(a.D - req.target) - Math.abs(b.D - req.target) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.id < b.id ? -1 : 1));
  return fits[0] ?? null;
}
