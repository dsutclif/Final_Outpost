import { content as defaultContent, type Content } from "@fo/content";
import { DEFAULT_CONFIG, addonPool, conflicts, featureClosure, modulesFor, optionalOf, type SequencerConfig } from "@fo/sequencer";
import type { Family } from "./build.js";

/**
 * The add-on composer (outpost-ops REBUILD-PREP-RUN, rules in ops docs/reference/addons.md): which optional
 * features a level carries so that it can reach its target D. Pure; every number comes from sequencer.json
 * (`composer`, each feature's `firstLevel` and `dStep`). The generator's knob search then fine-tunes the
 * composed set, and composerSwap adds or drops one add-on when the measured D says the set is out of reach.
 */

export interface ComposeRequest {
  index: number;
  target: number;
  family: Family;
  secondary?: Family | null | undefined;
  phase?: string | undefined;
  goalType: string;
  /** The sequencer's pick: its extras are preferred on a tie (variety across the pack). */
  features?: readonly string[] | undefined;
  introduced?: readonly string[] | undefined;
}

export interface Estimate { lo: number; mid: number; hi: number }

export interface Composition {
  features: string[];
  modules: string[];
  /** Features the level must carry (introduced, goal needs, the finale's second family). */
  required: string[];
  /** Features the composer may add or drop. */
  pool: string[];
  estimate: Estimate;
  /** Optional-module cap for the target, and the optional modules the set carries. */
  cap: number;
  optionalModules: number;
  /** Sequencer extras left out, with why. */
  dropped: { feature: string; why: string }[];
  notes: string[];
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const lexLess = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
};

/** Optional-module cap for target D (first moduleCap row whose bound is at or above the target). */
export function moduleCap(target: number, cfg: SequencerConfig = DEFAULT_CONFIG): number {
  const rows = cfg.composer.moduleCap;
  return (rows.find(([upTo]) => target <= upTo) ?? rows[rows.length - 1]!)[1];
}

/** Estimated D of a family level carrying `features`: the family base plus each feature's step. */
export function estimateD(family: Family, features: readonly string[], cfg: SequencerConfig = DEFAULT_CONFIG): Estimate {
  let lo = cfg.composer.base[family] ?? 0, hi = lo;
  for (const f of features) { const [a, b] = cfg.features[f]?.dStep ?? [0, 0]; lo += a; hi += b; }
  return { lo: round3(lo), mid: round3((lo + hi) / 2), hi: round3(hi) };
}

const familiesOf = (r: ComposeRequest): Family[] => (r.secondary ? [r.family, r.secondary] : [r.family]);

/** Features the level cannot do without: introduced ones, the goal's needs, the finale's second family, and their companions. */
export function requiredFeatures(r: ComposeRequest, cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const goal = cfg.goals[r.goalType];
  const own = [...(r.introduced ?? []), ...(goal?.needs ?? [])].filter((f) => cfg.features[f] !== undefined);
  const second = r.secondary ? (r.features ?? []).filter((f) => cfg.features[f]?.family === r.secondary) : [];
  return featureClosure([...own, ...second], cfg);
}

/** Features the composer may choose from: unlocked for the family, allowed by the goal, and buildable with it. */
export function composerPool(r: ComposeRequest, conveyorGoals: readonly string[], c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const goal = cfg.goals[r.goalType];
  const avoid = new Set(goal?.avoid ?? []);
  const req = new Set(requiredFeatures(r, cfg));
  return addonPool(r.family, r.index, cfg).filter((f) => {
    if (req.has(f)) return false;
    const d = cfg.features[f]!;
    if (avoid.has(f) || (d.with ?? []).some((w) => avoid.has(w))) return false;
    // anchored features only work with an anchoring goal; belts only with a goal that rides the chain (build.ts drops them otherwise)
    if (d.anchor && !goal?.anchor) return false;
    if (f === "conveyors" && !conveyorGoals.includes(r.goalType)) return false;
    return conflicts(modulesFor(familiesOf(r), featureClosure([...req, f], cfg), c, cfg), c).length === 0;
  });
}

const firstAt = (f: string, fam: Family, cfg: SequencerConfig) =>
  cfg.features[f]!.family === fam ? cfg.features[f]!.firstLevel ?? 0 : cfg.families[fam]?.guests?.[f] ?? 0;

/** Build the composition for a chosen extras set. */
function compose(r: ComposeRequest, extras: readonly string[], pool: string[], c: Content, cfg: SequencerConfig): Composition {
  const required = requiredFeatures(r, cfg);
  const features = featureClosure([...required, ...extras], cfg);
  const modules = modulesFor(familiesOf(r), features, c, cfg);
  return { features, modules, required, pool, estimate: estimateD(r.family, features, cfg), cap: moduleCap(r.target, cfg),
    optionalModules: optionalOf(modules, c).length, dropped: [], notes: [] };
}

/**
 * Starting set: of every extras subset within the phase's extras cap and the target's optional-module cap,
 * the one whose estimate (mid) lands nearest the target. Ties go to the sequencer's own picks, then fewer
 * features, then older ones. The sequencer's extras that the chosen set leaves out are logged.
 */
export function composeStart(r: ComposeRequest, conveyorGoals: readonly string[], c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): Composition {
  const pool = composerPool(r, conveyorGoals, c, cfg);
  if (cfg.composer.fixed.includes(r.family)) {
    const kept = compose(r, (r.features ?? []).filter((f) => cfg.features[f] !== undefined), pool, c, cfg);
    kept.notes.push(`${r.family} keeps the sequencer's set`);
    return kept;
  }
  const maxExtras = cfg.composer.extras[r.phase ?? "mix"] ?? cfg.mixFeatures.max;
  const cap = moduleCap(r.target, cfg);
  const picked = new Set(r.features ?? []);
  const base = compose(r, [], pool, c, cfg);
  let best: { comp: Composition; key: number[] } | null = null;
  // the pool is small (at most ~8 per family), so every subset is tried
  const n = Math.min(pool.length, 12);
  for (let mask = 0; mask < 1 << n; mask++) {
    const extras = pool.filter((_, i) => mask & (1 << i));
    if (extras.length > maxExtras) continue;
    const comp = compose(r, extras, pool, c, cfg);
    // over the cap: this set is out unless it adds no optional module beyond what the required set already needs
    if (comp.optionalModules > Math.max(cap, base.optionalModules)) continue;
    const key = [round3(Math.abs(comp.estimate.mid - r.target)), -extras.filter((f) => picked.has(f)).length, extras.length,
      extras.reduce((a, f) => a + firstAt(f, r.family, cfg), 0)];
    if (!best || lexLess(key, best.key)) best = { comp, key };
  }
  const out = best?.comp ?? base;
  if (base.optionalModules > cap) out.notes.push(`required set carries ${base.optionalModules} optional modules, over the cap ${cap}`);
  const req = new Set(out.required);
  // the sequencer's extras the composer left out: over the cap (newest first) or off the estimate
  const seqExtras = [...picked].filter((f) => !req.has(f) && !out.features.includes(f));
  for (const f of seqExtras.sort((a, b) => firstAt(b, r.family, cfg) - firstAt(a, r.family, cfg))) {
    const why = !pool.includes(f) ? "not in the pool (locked, avoided by the goal, or unbuildable)"
      : compose(r, featureClosure([...out.features.filter((x) => !req.has(x)), f], cfg), pool, c, cfg).optionalModules > Math.max(cap, base.optionalModules) ? `over the module cap ${cap}` : "estimate further from the target";
    out.dropped.push({ feature: f, why });
  }
  return out;
}

export interface SwapDecision { action: "add" | "remove" | "none"; feature?: string; why: string; next?: Composition }

/**
 * After the knob search on a set: when every measured D sits above the target (or no candidate was
 * feasible), drop the extra with the largest step (newest on a tie); when every one sits below, add the pool
 * feature whose step best fills the gap within the caps. Otherwise the set can reach the target and stays.
 */
export function composerSwap(r: ComposeRequest, comp: Composition, measured: readonly number[], tol: number, swapsDone: number,
  c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): SwapDecision {
  if (cfg.composer.fixed.includes(r.family)) return { action: "none", why: `${r.family} keeps the sequencer's set` };
  if (swapsDone >= cfg.composer.maxSwaps) return { action: "none", why: `swap limit ${cfg.composer.maxSwaps} reached` };
  const req = new Set(comp.required);
  const extras = comp.features.filter((f) => !req.has(f));
  const tooHard = measured.length === 0 || Math.min(...measured) > r.target + tol;
  const tooEasy = measured.length > 0 && Math.max(...measured) < r.target - tol;
  const mid = (f: string) => { const [a, b] = cfg.features[f]?.dStep ?? [0, 0]; return (a + b) / 2; };
  if (tooHard) {
    // a companion goes with the feature that pulled it in, so only drop whole features
    const droppable = extras.filter((f) => !extras.some((o) => o !== f && (cfg.features[o]?.with ?? []).includes(f)));
    if (droppable.length === 0) return { action: "none", why: measured.length === 0 ? "nothing feasible and no extra to drop" : `every D (min ${round3(Math.min(...measured))}) over the target and no extra to drop` };
    const f = [...droppable].sort((a, b) => mid(b) - mid(a) || firstAt(b, r.family, cfg) - firstAt(a, r.family, cfg))[0]!;
    const next = compose(r, extras.filter((x) => x !== f && !(cfg.features[f]?.with ?? []).includes(x)), comp.pool, c, cfg);
    return { action: "remove", feature: f, why: measured.length === 0 ? "no feasible candidate" : `every D (min ${round3(Math.min(...measured))}) over the target`, next };
  }
  if (tooEasy) {
    const gap = r.target - Math.max(...measured);
    const maxExtras = cfg.composer.extras[r.phase ?? "mix"] ?? cfg.mixFeatures.max;
    const base = compose(r, [], comp.pool, c, cfg);
    const options = comp.pool.filter((f) => !comp.features.includes(f)).map((f) => compose(r, [...extras, f], comp.pool, c, cfg))
      .filter((x) => x.features.length - req.size <= maxExtras && x.optionalModules <= Math.max(x.cap, base.optionalModules));
    if (options.length === 0) return { action: "none", why: `every D (max ${round3(Math.max(...measured))}) under the target and no add-on fits the caps` };
    const added = (x: Composition) => x.features.find((f) => !comp.features.includes(f) && !(cfg.features[f]?.with ?? []).length) ?? x.features.find((f) => !comp.features.includes(f))!;
    const step = (x: Composition) => x.estimate.mid - comp.estimate.mid;
    const next = options.sort((a, b) => Math.abs(step(a) - gap) - Math.abs(step(b) - gap) || firstAt(added(a), r.family, cfg) - firstAt(added(b), r.family, cfg))[0]!;
    return { action: "add", feature: added(next), why: `every D (max ${round3(Math.max(...measured))}) under the target by ${round3(gap)}`, next };
  }
  return { action: "none", why: `measured D ${round3(Math.min(...measured))}-${round3(Math.max(...measured))} spans the target` };
}
