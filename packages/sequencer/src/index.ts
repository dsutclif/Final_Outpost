import { content as defaultContent, type Content } from "@fo/content";
import data from "../data/sequencer.json";
import registerData from "../data/recipe-register.json";

// The sequencer turns a level index plus the levels the player has seen into a generator request:
// the level family (REDESIGN-R2 §5), its modules and features, the goal, a layout template and a
// target difficulty. It is pure: the same index and history always give the same request. Every
// rule reads data/sequencer.json or content (modules.json); nothing names a level.
//
// Arc: levels 1-5 teach the five families in story order (shelter, rescue, harvest, industrialize,
// defend); since the story levels (Doug, 2026-10-26) these are the hand-made levels/story manifests,
// so packs are generated from level 6, and `storyTaught` lists what those five already taught.
// Levels 6-15 add each family's deeper mechanics inside the family, two levels per family;
// after that the families rotate, with a two-family finale every 10th level.

export type Family = "shelter" | "rescue" | "harvest" | "industrialize" | "defend";
export type Phase = "teach" | "intro" | "mix" | "finale";

/** firstLevel: the first level index the feature may join a level of its own family; dStep: its measured difficulty step [lo, hi]. */
export interface FeatureDef { family: Family; modules: string[]; anchor?: boolean; with?: string[]; firstLevel?: number; dStep?: [number, number] }
export interface GoalDef { family: Family; kind?: string; needs: string[]; adds?: string[]; anchor?: boolean; avoid?: string[] }
/** guests: other families' features this family may borrow, with the first level each may join. */
export interface FamilyDef { modules: string[]; teachGoal: string; intro: string[][]; challenges: string[]; guests?: Record<string, number> }

/** The generator's add-on composer (sequencer.json notes.composer). */
export interface ComposerConfig {
  base: Record<Family, number>;
  moduleCap: [number, number][];
  extras: Record<string, number>;
  /** Families whose levels keep the sequencer's features (no composing, no swaps). */
  fixed: Family[];
  maxSwaps: number;
}

export interface SequencerConfig {
  packId: string;
  tutorialLength: number;
  tutorialTargets: { from: number; to: number };
  blockLength: number;
  band: { lo: number; hi: number };
  breatherTarget: number;
  teachTarget: number;
  tutorialTeachDrop: number;
  funThresholds: { tutorial: number; band: number; defend: number };
  recoveryDrop: number;
  /** Batch tuning from the player's results (adaptOffset). */
  adapt: AdaptConfig;
  duplicateWindow: number;
  storyLength: number;
  /**
   * Features the hand-made story levels (1..storyLength, levels/story) already teach (docs/STORY-LEVELS.md):
   * the intro arc does not introduce them again, and every family can use them from the first generated level.
   */
  storyTaught: string[];
  introLength: number;
  templates: string[];
  implies: Record<string, string[]>;
  familyOrder: Family[];
  finales: [Family, Family][];
  mixFeatures: { min: number; max: number };
  composer: ComposerConfig;
  features: Record<string, FeatureDef>;
  families: Record<Family, FamilyDef>;
  goals: Record<string, GoalDef>;
  /** Measured winnable D per goal id, add-on estimate taken out (tools/goal-ranges.ts writes it; "_" keys are notes). */
  goalRanges?: Record<string, GoalRange | string>;
}

/** A goal's winnable D less the composer estimate (mid) of the features each sample carried; n winnable samples, lost unwinnable ones. */
export interface GoalRange { lo: number | null; hi: number | null; n: number; lost?: number }

/**
 * How a new batch of levels leans on the player's recent results. Each cleared level reports its
 * stars (0-3) and attempts to clear it; the window's means are held inside the goal bands by moving
 * the whole batch's target difficulty a step at a time, within the offset bounds.
 */
export interface AdaptConfig {
  enabled: boolean;
  /** Most recent cleared levels considered. */
  window: number;
  /** Fewer cleared levels than this: keep the offset. */
  minSamples: number;
  /** Goal band for mean attempts per cleared level (1 = every level first try). */
  attempts: { lo: number; hi: number };
  /** Goal band for mean stars per cleared level. */
  stars: { lo: number; hi: number };
  /** Offset change per batch. */
  step: number;
  /** Bounds on the total offset. */
  offset: { lo: number; hi: number };
}

export const DEFAULT_CONFIG = data as unknown as SequencerConfig;
export const FAMILIES: readonly Family[] = DEFAULT_CONFIG.familyOrder;

/** What the sequencer needs to know about a level the player already saw. */
export interface HistoryEntry {
  modules: readonly string[];
  goal: string;
  template?: string | undefined;
  family?: string | undefined;
  features?: readonly string[] | undefined;
  /** Failed attempts on that level (recovery rule). */
  fails?: number | undefined;
}

export interface LevelRequest {
  index: number;
  id: string;
  /** Target difficulty D in (0, 1). */
  target: number;
  family: Family;
  /** Second family of a finale level. */
  secondary: Family | null;
  /** Family mechanics in the level (sequencer.json `features`), sorted. */
  features: string[];
  /** Every module of the level, always-on ones included, sorted. */
  modules: string[];
  /** Optional (not always-on) modules. */
  optional: string[];
  /** Features this level introduces (teach and intro levels). */
  introduced: string[];
  /** Objective kind of the main goal (objectives.json). */
  goalType: string;
  /** Goal id in sequencer.json (differs from the kind for e.g. clear_pass / hire_ops). */
  goalId: string;
  /** Kinds the generator may pick the family challenge star from. */
  challenges: string[];
  template: string;
  seed: number;
  phase: Phase;
  breather: boolean;
  /** The arc's fun threshold: the generator ships a level only when F clears it. */
  funThreshold: number;
  /** Perimeter walls: defend levels and the rescue pen always have them; other families never (Doug 2026-11-16). */
  walls: boolean;
  /** Set when no goal's range reached the target and the nearest was taken (goal ranges, ops composer.md). */
  goalNote?: string;
}

export interface SequenceOptions {
  content?: Content;
  config?: SequencerConfig;
  /** Spec's optional recovery rule: after two failed attempts, target 0.1 lower. */
  recovery?: boolean;
  /** Added to every target (batch tuning, adaptOffset); the result stays in [0.05, 0.95]. */
  targetOffset?: number;
  /** Recipes proved impossible: never offered again (outpost-ops#198). Empty or absent: today's sequence. */
  register?: RecipeRegister;
  /** Current engine version: register entries found on an older engine are ignored. Absent: every entry counts. */
  engine?: string;
}

// ---------- recipe register (outpost-ops#198) ----------

/** A request's contents that decide whether it can be built; the register's key. */
export interface Recipe {
  family: Family;
  secondary: Family | null;
  features: string[];
  modules: string[];
  introduced: string[];
  goalId: string;
  template: string;
  /** Target difficulty rounded to the register's band: a recipe that cannot reach 0.8 may be fine at 0.3. */
  band: number;
}

export interface RegisterEntry {
  key: string;
  recipe: Recipe;
  /** Engine version the recipe failed on; entries from an older engine are ignored. */
  engine: string;
  date: string;
  /** What the failed search saw (informational, never part of the key). */
  target?: number;
  closestD?: number | null;
  seeds?: number;
  rejects?: Record<string, number>;
}

export interface RegisterSettings {
  /** A search failed when no level ships or the closest one is further than this from its target. */
  failGap: number;
  /** Re-rolls per slot before the build stops. */
  maxRerolls: number;
  /** Width of the target band in the recipe key. */
  targetBand: number;
}

export interface RecipeRegister { settings: RegisterSettings; entries: RegisterEntry[] }

/** The committed register (packages/sequencer/data/recipe-register.json). */
export const DEFAULT_REGISTER = registerData as unknown as RecipeRegister;

export const bandOf = (target: number, band: number): number => Math.round(Math.round(target / band) * band * 1000) / 1000;

export const recipeKey = (r: Recipe): string =>
  [`${r.family}+${r.secondary ?? "-"}`, `f:${[...r.features].sort().join(",")}`, `m:${[...r.modules].sort().join(",")}`,
    `i:${r.introduced.join(",")}`, `g:${r.goalId}`, `t:${r.template}`, `b:${r.band}`].join("|");

export const recipeOf = (r: LevelRequest, band: number = DEFAULT_REGISTER.settings.targetBand): Recipe => ({
  family: r.family, secondary: r.secondary, features: [...r.features], modules: [...r.modules], introduced: [...r.introduced],
  goalId: r.goalId, template: r.template, band: bandOf(r.target, band),
});

/** Negative, zero or positive comparing dotted version numbers ("0.29.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Keys of the register entries that count on `engine` (all of them when no engine is given). */
export function activeKeys(reg: RecipeRegister | undefined, engine?: string): Set<string> {
  const out = new Set<string>();
  for (const e of reg?.entries ?? []) if (engine === undefined || compareVersions(e.engine, engine) >= 0) out.add(e.key);
  return out;
}

// ---------- deterministic choice (no Math.random) ----------

export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function shuffled<T>(xs: readonly T[], key: string): T[] {
  return xs.map((x, i) => ({ x, k: hash32(`${key}#${i}`) })).sort((a, b) => a.k - b.k).map((e) => e.x);
}

// ---------- modules ----------

export const alwaysOn = (c: Content = defaultContent): string[] => Object.keys(c.modules).filter((id) => c.modules[id]!.alwaysOn).sort();

/** Dependency closure: content `requires`, the config's `implies`, and every always-on module. */
export function closure(mods: readonly string[], c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const out = new Set<string>([...alwaysOn(c), ...mods]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of [...out]) {
      for (const r of [...(c.modules[m]?.requires ?? []), ...(cfg.implies[m] ?? [])]) {
        if (!out.has(r)) { out.add(r); grew = true; }
      }
    }
  }
  return [...out].sort();
}

/** Modules that exclude each other (content `excludes`, either direction). */
export function conflicts(mods: readonly string[], c: Content = defaultContent): string[] {
  const set = new Set(mods), out: string[] = [];
  for (const m of mods) for (const e of c.modules[m]?.excludes ?? []) if (set.has(e)) out.push(`${m}~${e}`);
  return out;
}

export const optionalOf = (mods: readonly string[], c: Content = defaultContent): string[] =>
  mods.filter((m) => c.modules[m] !== undefined && !c.modules[m]!.alwaysOn).sort();

/** Features plus their `with` companions. */
export function featureClosure(fs: readonly string[], cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const out = new Set(fs);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of [...out]) for (const w of cfg.features[f]?.with ?? []) if (!out.has(w)) { out.add(w); grew = true; }
  }
  return [...out].sort();
}

/** Modules of a family set plus features. */
export function modulesFor(families: readonly Family[], features: readonly string[], c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const mods = [...families.flatMap((f) => cfg.families[f].modules), ...features.flatMap((f) => cfg.features[f]?.modules ?? [])];
  return closure(mods, c, cfg);
}

/** The objective kind of a goal id. */
export const goalKind = (id: string, cfg: SequencerConfig = DEFAULT_CONFIG): string => cfg.goals[id]?.kind ?? id;

/** Goals of a family that the features support (anchored features need an anchoring goal). */
export function goalsFor(family: Family, features: readonly string[], families: readonly Family[], cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const fs = new Set(features);
  const anchoredFeature = features.some((f) => cfg.features[f]?.anchor);
  const twoGoods = families.includes("industrialize") || fs.has("hunting");
  return Object.entries(cfg.goals).filter(([, g]) => {
    if (g.family !== family) return false;
    for (const n of g.needs) {
      if (n === "@two_goods") { if (!twoGoods) return false; }
      else if (!fs.has(n)) return false;
    }
    if (anchoredFeature && !g.anchor) return false;
    if ((g.avoid ?? []).some((f) => fs.has(f))) return false;
    return true;
  }).map(([id]) => id);
}

// ---------- goal ranges (ops docs/reference/composer.md) ----------

export interface Estimate { lo: number; mid: number; hi: number }
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Composer estimate of a family level's D with `features`: the family base plus each feature's dStep. */
export function estimateD(family: Family, features: readonly string[], cfg: SequencerConfig = DEFAULT_CONFIG): Estimate {
  let lo = cfg.composer.base[family] ?? 0, hi = lo;
  for (const f of features) { const [a, b] = cfg.features[f]?.dStep ?? [0, 0]; lo += a; hi += b; }
  return { lo: round3(lo), mid: round3((lo + hi) / 2), hi: round3(hi) };
}

/** Optional-module cap for target D (first moduleCap row whose bound is at or above the target). */
export function moduleCap(target: number, cfg: SequencerConfig = DEFAULT_CONFIG): number {
  const rows = cfg.composer.moduleCap;
  return (rows.find(([upTo]) => target <= upTo) ?? rows[rows.length - 1]!)[1];
}

export interface GoalSlot { family: Family; secondary: Family | null; phase: Phase; introduced: readonly string[] }

/**
 * D a slot can reach with goal `goal`: the goal's measured range (relative to the estimate's mid) widened by
 * the add-ons the composer could give it here (lo: the required set alone; hi: the extras subset with the
 * highest estimate, within the phase's extras and the target's module cap; both by estimate mid). A finale
 * also gets its second family's largest step on hi.
 * Null when the goal has no measured range (it is never ruled out); an open side (null) is unbounded.
 */
export function goalReach(goal: string, slot: GoalSlot, index: number, target: number, c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): { lo: number; hi: number } | null {
  const r = cfg.goalRanges?.[goal];
  const g = cfg.goals[goal];
  if (!r || typeof r === "string" || !g) return null;
  const fams: Family[] = slot.secondary ? [slot.family, slot.secondary] : [slot.family];
  const required = featureClosure([...slot.introduced, ...g.needs].filter((f) => cfg.features[f] !== undefined), cfg);
  const avoid = new Set(g.avoid ?? []);
  const pool = addonPool(slot.family, index, cfg).filter((f) => {
    const d = cfg.features[f]!;
    return !required.includes(f) && !avoid.has(f) && !(d.with ?? []).some((w) => avoid.has(w)) && !(d.anchor && !g.anchor);
  }).slice(0, 12);
  const maxExtras = cfg.composer.extras[slot.phase] ?? cfg.mixFeatures.max;
  const baseOpt = optionalOf(modulesFor(fams, required, c, cfg), c).length;
  const cap = Math.max(moduleCap(target, cfg), baseOpt);
  let hi = estimateD(slot.family, required, cfg).mid;
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    const extras = pool.filter((_, i) => mask & (1 << i));
    if (extras.length > maxExtras) continue;
    const fs = featureClosure([...required, ...extras], cfg);
    const est = estimateD(slot.family, fs, cfg).mid;
    if (est <= hi) continue;
    const mods = modulesFor(fams, fs, c, cfg);
    if (conflicts(mods, c).length > 0 || optionalOf(mods, c).length > cap) continue;
    hi = est;
  }
  if (slot.secondary) hi += Math.max(0, ...unlockedFeatures(slot.secondary, index, cfg).filter((f) => !cfg.features[f]?.anchor).map((f) => { const [a, b] = cfg.features[f]?.dStep ?? [0, 0]; return (a + b) / 2; }));
  return { lo: r.lo === null ? -Infinity : round3(r.lo + estimateD(slot.family, required, cfg).mid), hi: r.hi === null ? Infinity : round3(r.hi + hi) };
}

/** Goals whose reach covers the target; when none does, the nearest one, with a note saying so. */
const reachCache = new WeakMap<SequencerConfig, Map<string, { lo: number; hi: number } | null>>();
const reachOf = (g: string, slot: GoalSlot, index: number, target: number, c: Content, cfg: SequencerConfig) => {
  let m = reachCache.get(cfg);
  if (!m) reachCache.set(cfg, (m = new Map()));
  const k = `${g}|${slot.family}|${slot.secondary}|${slot.phase}|${slot.introduced.join(",")}|${index}|${moduleCap(target, cfg)}`;
  if (!m.has(k)) m.set(k, goalReach(g, slot, index, target, c, cfg));
  return m.get(k)!;
};

export function goalsInReach(goals: readonly string[], target: number, slot: GoalSlot, index: number, c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): { goals: string[]; note?: string } {
  const gap = (g: string) => { const r = reachOf(g, slot, index, target, c, cfg); return r ? Math.max(0, r.lo - target, target - r.hi) : 0; };
  const fit = goals.filter((g) => gap(g) === 0);
  if (fit.length > 0) return { goals: fit };
  const best = Math.min(...goals.map(gap));
  const near = goals.filter((g) => gap(g) === best);
  return { goals: near, note: `no goal reaches D ${target}: nearest ${near.join("/")} (off by ${round3(best)})` };
}

// ---------- targets ----------

/**
 * Target difficulty for a level (curve shaping). Tutorial arc (levels 1-20): low with a gentle rise,
 * teach and intro levels lower still. After it, a sawtooth per 10-level block: a breather opens the
 * block, the targets rise, and the block's two-family finale closes it at the top of the band.
 */
export function targetFor(index: number, phase: Phase, cfg: SequencerConfig = DEFAULT_CONFIG): { target: number; breather: boolean } {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  if (index <= cfg.tutorialLength) {
    const { from, to } = cfg.tutorialTargets;
    const t = from + ((to - from) * (index - 1)) / Math.max(1, cfg.tutorialLength - 1);
    const low = phase === "teach" || phase === "intro";
    return { target: r3(low ? Math.max(0.05, t - cfg.tutorialTeachDrop) : t), breather: false };
  }
  const pos = (index - cfg.tutorialLength - 1) % cfg.blockLength;
  if (pos === 0) return { target: r3(cfg.breatherTarget), breather: true };
  const { lo, hi } = cfg.band;
  const saw = lo + 0.05 + ((hi - lo - 0.05) * (pos - 1)) / Math.max(1, cfg.blockLength - 2);
  return { target: r3(Math.min(hi, saw)), breather: false };
}

// ---------- the arc ----------

interface Slot { family: Family; secondary: Family | null; phase: Phase; introduced: string[] }

/**
 * Family, phase and introduced features of a level index (pure). A feature whose difficulty step starts
 * above its intro slot's target is not introduced there: it moves to the next later mix slot of its family
 * whose target reaches the step's low end (that level becomes an intro-phase level carrying it).
 */
export function slotFor(index: number, cfg: SequencerConfig = DEFAULT_CONFIG): Slot {
  const base = baseSlot(index, cfg);
  const moved = deferredIntros(cfg);
  if (base.phase === "intro") return { ...base, introduced: base.introduced.filter((f) => !moved.has(f)) };
  if (base.phase === "mix") {
    const here = [...moved].filter(([, at]) => at === index).map(([f]) => f);
    if (here.length > 0) return { ...base, phase: "intro", introduced: here };
  }
  return base;
}

const deferCache = new WeakMap<SequencerConfig, Map<string, number>>();
/** Features whose introduction moved off their intro slot (target below the step's low end) -> the level that introduces them. */
export function deferredIntros(cfg: SequencerConfig = DEFAULT_CONFIG): Map<string, number> {
  const hit = deferCache.get(cfg);
  if (hit) return hit;
  const out = new Map<string, number>();
  for (let i = cfg.storyLength + 1; i <= cfg.introLength; i++) {
    const s = baseSlot(i, cfg);
    const { target } = targetFor(i, "intro", cfg);
    for (const f of s.introduced) {
      const lo = cfg.features[f]?.dStep?.[0] ?? 0;
      if (lo <= target) continue;
      for (let j = cfg.introLength + 1; j <= cfg.introLength + 400; j++) {
        const m = baseSlot(j, cfg);
        if (m.phase === "mix" && m.family === s.family && targetFor(j, "mix", cfg).target >= lo) { out.set(f, j); break; }
      }
    }
  }
  deferCache.set(cfg, out);
  return out;
}

function baseSlot(index: number, cfg: SequencerConfig): Slot {
  const F = cfg.familyOrder;
  if (index <= cfg.storyLength) return { family: F[index - 1]!, secondary: null, phase: "teach", introduced: [] };
  if (index <= cfg.introLength) {
    const k = index - cfg.storyLength - 1;
    const fam = F[k % F.length]!;
    const round = Math.floor(k / F.length);
    // a feature the story levels already taught is not introduced again
    const introduced = (cfg.families[fam].intro[round] ?? []).filter((f) => !cfg.storyTaught.includes(f));
    return { family: fam, secondary: null, phase: "intro", introduced };
  }
  if (index % cfg.blockLength === 0) {
    const [a, b] = cfg.finales[(index / cfg.blockLength - 2 + cfg.finales.length) % cfg.finales.length]!;
    return { family: a, secondary: b, phase: "finale", introduced: [] };
  }
  // Rotation after the intro arc, skipping finale slots.
  let n = 0;
  for (let i = cfg.introLength + 1; i < index; i++) if (i % cfg.blockLength !== 0) n++;
  return { family: F[n % F.length]!, secondary: null, phase: "mix", introduced: [] };
}

/** Features a family has unlocked by level `index`. */
export function unlockedFeatures(family: Family, index: number, cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const out: string[] = index > cfg.storyLength ? cfg.storyTaught.filter((f) => cfg.features[f]?.family === family) : [];
  for (let i = cfg.storyLength + 1; i <= index; i++) {
    const s = slotFor(i, cfg);
    if (s.phase === "intro" && s.family === family) out.push(...s.introduced);
  }
  return out;
}

/** Whether feature `f` may join a level of `family` at index `index` (its own family from firstLevel on, or as the family's guest). */
export function featureUnlocked(f: string, family: Family, index: number, cfg: SequencerConfig = DEFAULT_CONFIG): boolean {
  const def = cfg.features[f];
  if (!def) return false;
  if (def.family === family && index >= (deferredIntros(cfg).get(f) ?? def.firstLevel ?? Number.POSITIVE_INFINITY)) return true;
  const g = cfg.families[family]?.guests?.[f];
  return g !== undefined && index >= g;
}

/** Every feature a level of `family` at `index` may carry, sorted by first level (oldest first), then id. */
export function addonPool(family: Family, index: number, cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const at = (f: string) => (cfg.features[f]!.family === family ? deferredIntros(cfg).get(f) ?? cfg.features[f]!.firstLevel ?? 0 : cfg.families[family]?.guests?.[f] ?? 0);
  return Object.keys(cfg.features).filter((f) => featureUnlocked(f, family, index, cfg)).sort((a, b) => at(a) - at(b) || a.localeCompare(b));
}

const key = (mods: readonly string[], goal: string, tpl: string | undefined) => `${[...mods].sort().join(",")}|${goal}|${tpl ?? ""}`;

/** The request for level `index` (1-based) given the levels before it (most recent last). Pure. */
export function sequence(index: number, history: readonly HistoryEntry[], opts: SequenceOptions = {}): LevelRequest {
  if (!Number.isInteger(index) || index < 1) throw new Error(`level index must be a positive integer, got ${index}`);
  const c = opts.content ?? defaultContent;
  const cfg = opts.config ?? DEFAULT_CONFIG;
  const slot = slotFor(index, cfg);
  const salt = `${cfg.packId}:${index}`;
  const prev = history[history.length - 1];
  const families: Family[] = slot.secondary ? [slot.family, slot.secondary] : [slot.family];
  let { target, breather } = targetFor(index, slot.phase, cfg);
  // goals are chosen for the curve's target: a batch offset or recovery drop only moves the target
  const curveTarget = target;
  if (opts.targetOffset) target = Math.min(0.95, Math.max(0.05, Math.round((target + opts.targetOffset) * 1000) / 1000));
  if (opts.recovery && prev?.fails !== undefined && prev.fails >= 2) target = Math.max(0.05, Math.round((target - cfg.recoveryDrop) * 1000) / 1000);
  // Target, breather and introduced mechanics come from the slot; the register only steers the rest.
  const introduced = slot.phase === "teach" ? [`family:${slot.family}`] : [...slot.introduced].sort();
  const keys = activeKeys(opts.register, opts.engine);
  const band = bandOf(target, opts.register?.settings.targetBand ?? DEFAULT_REGISTER.settings.targetBand);
  // With nothing registered nothing is blocked, so the pick is exactly the unregistered one.
  // Template "*" asks whether the features + goal failed with any template (see choose).
  const near = new Set([...(opts.register?.entries ?? [])].filter((e) => keys.has(e.key)).map((e) => recipeKey({ ...e.recipe, template: "*" })));
  const blocked: Blocked | null = keys.size === 0 ? null : (features, modules, goalId, template) =>
    (template === "*" ? near : keys).has(recipeKey({ family: slot.family, secondary: slot.secondary, features, modules, introduced, goalId, template, band }));
  const pick = choose(index, slot, families, history, c, cfg, salt, blocked, curveTarget);
  return {
    index,
    id: `${cfg.packId}-L${String(index).padStart(3, "0")}`,
    target,
    family: slot.family,
    secondary: slot.secondary,
    features: pick.features,
    modules: pick.modules,
    optional: optionalOf(pick.modules, c),
    introduced,
    goalType: goalKind(pick.goal, cfg),
    goalId: pick.goal,
    challenges: [...cfg.families[slot.family].challenges],
    template: pick.template,
    seed: hash32(`${salt}:seed`) & 0x7fffffff,
    phase: slot.phase,
    breather,
    // defend levels and the rescue pen always have walls; the generator never builds a ring for other families
    walls: true,
    ...(pick.note ? { goalNote: pick.note } : {}),
    funThreshold: index <= cfg.tutorialLength ? cfg.funThresholds.tutorial : slot.family === "defend" ? cfg.funThresholds.defend : cfg.funThresholds.band,
  };
}

interface Pick { features: string[]; modules: string[]; goal: string; template: string; note?: string }
type Blocked = (features: string[], modules: string[], goalId: string, template: string) => boolean;

function choose(index: number, slot: Slot, families: Family[], history: readonly HistoryEntry[], c: Content, cfg: SequencerConfig, salt: string, blocked: Blocked | null = null, target?: number): Pick {
  const fam = slot.family;
  const prevSame = [...history].reverse().find((h) => h.family === fam);
  // With a register, a first pass also avoids features + goal that already failed with another
  // template (a re-roll then changes what the level asks for, not just its layout); the second pass
  // only skips the registered recipes themselves. Without a register there is one pass, as before.
  for (let pass = blocked ? 0 : 1; pass < 2; pass++)
  for (let attempt = 0; attempt < 300; attempt++) {
    const s = `${salt}:${attempt}`;
    let features: string[];
    if (slot.phase === "teach") features = [];
    else if (slot.phase === "intro") features = featureClosure(slot.introduced, cfg);
    else {
      const pool = unlockedFeatures(fam, index, cfg);
      const { min, max } = cfg.mixFeatures;
      const k = min + (hash32(`${s}:k`) % (max - min + 1));
      // Lean toward features the family's previous level did not use, so every mechanic keeps coming back.
      const fresh = shuffled(pool, s).sort((a, b) => Number(prevSame?.features?.includes(a) ?? false) - Number(prevSame?.features?.includes(b) ?? false));
      features = featureClosure(fresh.slice(0, k), cfg);
      if (slot.secondary) {
        const sec = shuffled(unlockedFeatures(slot.secondary, index, cfg), `${s}:sec`);
        const extra = sec.find((f) => !cfg.features[f]?.anchor);
        if (extra) features = featureClosure([...features, extra], cfg);
      }
    }
    let modules = modulesFor(families, features, c, cfg);
    if (conflicts(modules, c).length > 0) continue;
    const all = goalsFor(fam, features, families, cfg);
    if (all.length === 0) continue;
    const { goals, note } = target === undefined || slot.phase === "teach" ? { goals: all, note: undefined } : goalsInReach(all, target, slot, index, c, cfg);
    const goal = pickGoal(goals, slot, history, cfg, s);
    // a goal's adds count only once the feature is unlocked for this family (composer unlock order)
    const adds = (cfg.goals[goal]?.adds ?? []).filter((f) => !features.includes(f) && featureUnlocked(f, fam, index, cfg));
    if (adds.length > 0) {
      // The goal pulls in features of its own (shelves_full: a hunted good beside the farmed one).
      features = featureClosure([...features, ...adds], cfg);
      modules = modulesFor(families, features, c, cfg);
      if (conflicts(modules, c).length > 0) continue;
    }
    const fm = features, mm = modules;
    if (pass === 0 && blocked!(fm, mm, goal, "*")) continue;
    const template = pickTemplate(modules, goalKind(goal, cfg), history, cfg, s, blocked && ((t) => blocked(fm, mm, goal, t)));
    if (template === null) continue;
    return { features, modules, goal, template, ...(note ? { note } : {}) };
  }
  throw new Error(`sequencer: no valid request for level ${index} (${slot.family}, ${slot.phase})${blocked ? " outside the recipe register" : ""}`);
}

function pickGoal(goals: string[], slot: Slot, history: readonly HistoryEntry[], cfg: SequencerConfig, s: string): string {
  if (slot.phase === "teach") {
    const t = cfg.families[slot.family].teachGoal;
    return goals.includes(t) ? t : goals[0]!;
  }
  if (slot.phase === "intro") {
    // The goal that exercises the most newly introduced features.
    const score = (g: string) => cfg.goals[g]!.needs.filter((n) => slot.introduced.includes(n)).length;
    const best = Math.max(...goals.map(score));
    const top = goals.filter((g) => score(g) === best);
    return top[hash32(`${s}:g`) % top.length]!;
  }
  // Rotate through the family's goals: least recently used first.
  const used = (g: string) => {
    const k = goalKind(g, cfg);
    for (let i = history.length - 1; i >= 0; i--) if (history[i]!.family === slot.family && history[i]!.goal === k) return i;
    return -1;
  };
  const sorted = shuffled(goals, `${s}:goal`).sort((a, b) => used(a) - used(b));
  return sorted[0]!;
}

function pickTemplate(mods: readonly string[], goal: string, history: readonly HistoryEntry[], cfg: SequencerConfig, s: string, blocked: ((t: string) => boolean) | null = null): string | null {
  const prev = history[history.length - 1];
  const recent = history.slice(-cfg.duplicateWindow);
  const used = new Set(recent.map((h) => key(h.modules, h.goal, h.template)));
  const order = shuffled(cfg.templates, `${s}:tpl`);
  const ok = order.filter((t) => !used.has(key(mods, goal, t)) && !(blocked?.(t) ?? false));
  const fresh = ok.filter((t) => t !== prev?.template);
  return fresh[0] ?? ok[0] ?? null;
}

/** Requests for levels `from..to`, each seeing the earlier requests as history. */
export function sequenceRange(from: number, to: number, history: readonly HistoryEntry[] = [], opts: SequenceOptions = {}): LevelRequest[] {
  const h: HistoryEntry[] = [...history];
  const out: LevelRequest[] = [];
  for (let i = from; i <= to; i++) {
    const r = sequence(i, h, opts);
    out.push(r);
    h.push(historyOf(r));
  }
  return out;
}

export const historyOf = (r: LevelRequest): HistoryEntry => ({ modules: r.modules, goal: r.goalType, template: r.template, family: r.family, features: r.features });

/** Levels per family over a range (the primary family of finales). */
export function familyCounts(reqs: readonly LevelRequest[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reqs) out[r.family] = (out[r.family] ?? 0) + 1;
  return out;
}

// ---------- batch tuning ----------

/** One cleared level as the player played it. */
export interface PlayedLevel { index: number; stars: number; attempts: number }

export interface AdaptResult { offset: number; reason: string; meanStars: number | null; meanAttempts: number | null; samples: number }

/**
 * The next batch's target offset from the previous one and the player's recent cleared levels.
 * Struggling (too many attempts, or too few stars) eases the batch; cruising (first-try clears
 * with stars to spare) hardens it; inside both bands it holds. Attempts win a conflict: the
 * spec's research finds failures cost engagement more than easy wins do. Pure.
 */
export function adaptOffset(prev: number, played: readonly PlayedLevel[], cfg: SequencerConfig = DEFAULT_CONFIG): AdaptResult {
  const a = cfg.adapt;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const recent = [...played].sort((x, y) => x.index - y.index).slice(-a.window);
  if (!a.enabled) return { offset: 0, reason: "adaptation off", meanStars: null, meanAttempts: null, samples: recent.length };
  if (recent.length < a.minSamples) return { offset: prev, reason: `only ${recent.length} cleared levels`, meanStars: null, meanAttempts: null, samples: recent.length };
  const meanStars = r3(recent.reduce((t, p) => t + p.stars, 0) / recent.length);
  const meanAttempts = r3(recent.reduce((t, p) => t + Math.max(1, p.attempts), 0) / recent.length);
  let step = 0, reason = "inside the goal bands";
  if (meanAttempts > a.attempts.hi) { step = -a.step; reason = `attempts ${meanAttempts} above ${a.attempts.hi}`; }
  else if (meanStars < a.stars.lo) { step = -a.step; reason = `stars ${meanStars} below ${a.stars.lo}`; }
  else if (meanAttempts <= a.attempts.lo && meanStars > a.stars.hi) { step = a.step; reason = `first-try clears with stars ${meanStars} above ${a.stars.hi}`; }
  const offset = r3(Math.min(a.offset.hi, Math.max(a.offset.lo, prev + step)));
  return { offset, reason, meanStars, meanAttempts, samples: recent.length };
}
