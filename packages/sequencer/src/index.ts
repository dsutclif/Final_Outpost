import { content as defaultContent, type Content } from "@fo/content";
import data from "../data/sequencer.json";

// The sequencer turns a level index plus the levels the player has seen into a generator request:
// the level family (REDESIGN-R2 §5), its modules and features, the goal, a layout template and a
// target difficulty. It is pure: the same index and history always give the same request. Every
// rule reads data/sequencer.json or content (modules.json); nothing names a level.
//
// Arc: levels 1-5 teach the five families in story order (shelter, rescue, harvest, industrialize,
// defend); levels 6-15 add each family's deeper mechanics inside the family, two levels per family;
// after that the families rotate, with a two-family finale every 10th level.

export type Family = "shelter" | "rescue" | "harvest" | "industrialize" | "defend";
export type Phase = "teach" | "intro" | "mix" | "finale";

export interface FeatureDef { family: Family; modules: string[]; anchor?: boolean; with?: string[] }
export interface GoalDef { family: Family; kind?: string; needs: string[]; adds?: string[]; anchor?: boolean; avoid?: string[] }
export interface FamilyDef { modules: string[]; teachGoal: string; intro: string[][]; challenges: string[] }

export interface SequencerConfig {
  packId: string;
  tutorialLength: number;
  tutorialTargets: { from: number; to: number };
  blockLength: number;
  band: { lo: number; hi: number };
  breatherTarget: number;
  teachTarget: number;
  tutorialTeachDrop: number;
  funThresholds: { tutorial: number; band: number };
  recoveryDrop: number;
  duplicateWindow: number;
  storyLength: number;
  introLength: number;
  templates: string[];
  implies: Record<string, string[]>;
  familyOrder: Family[];
  finales: [Family, Family][];
  mixFeatures: { min: number; max: number };
  features: Record<string, FeatureDef>;
  families: Record<Family, FamilyDef>;
  goals: Record<string, GoalDef>;
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
}

export interface SequenceOptions {
  content?: Content;
  config?: SequencerConfig;
  /** Spec's optional recovery rule: after two failed attempts, target 0.1 lower. */
  recovery?: boolean;
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

/** Family, phase and introduced features of a level index (pure). */
export function slotFor(index: number, cfg: SequencerConfig = DEFAULT_CONFIG): Slot {
  const F = cfg.familyOrder;
  if (index <= cfg.storyLength) return { family: F[index - 1]!, secondary: null, phase: "teach", introduced: [] };
  if (index <= cfg.introLength) {
    const k = index - cfg.storyLength - 1;
    const fam = F[k % F.length]!;
    const round = Math.floor(k / F.length);
    return { family: fam, secondary: null, phase: "intro", introduced: [...(cfg.families[fam].intro[round] ?? [])] };
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
  const out: string[] = [];
  for (let i = cfg.storyLength + 1; i <= Math.min(index, cfg.introLength); i++) {
    const s = slotFor(i, cfg);
    if (s.family === family) out.push(...s.introduced);
  }
  return out;
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
  const pick = choose(index, slot, families, history, c, cfg, salt);
  let { target, breather } = targetFor(index, slot.phase, cfg);
  if (opts.recovery && prev?.fails !== undefined && prev.fails >= 2) target = Math.max(0.05, Math.round((target - cfg.recoveryDrop) * 1000) / 1000);
  return {
    index,
    id: `${cfg.packId}-L${String(index).padStart(3, "0")}`,
    target,
    family: slot.family,
    secondary: slot.secondary,
    features: pick.features,
    modules: pick.modules,
    optional: optionalOf(pick.modules, c),
    introduced: slot.phase === "teach" ? [`family:${slot.family}`] : [...slot.introduced].sort(),
    goalType: goalKind(pick.goal, cfg),
    goalId: pick.goal,
    challenges: [...cfg.families[slot.family].challenges],
    template: pick.template,
    seed: hash32(`${salt}:seed`) & 0x7fffffff,
    phase: slot.phase,
    breather,
    funThreshold: index <= cfg.tutorialLength ? cfg.funThresholds.tutorial : cfg.funThresholds.band,
  };
}

interface Pick { features: string[]; modules: string[]; goal: string; template: string }

function choose(index: number, slot: Slot, families: Family[], history: readonly HistoryEntry[], c: Content, cfg: SequencerConfig, salt: string): Pick {
  const fam = slot.family;
  const prevSame = [...history].reverse().find((h) => h.family === fam);
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
    const goals = goalsFor(fam, features, families, cfg);
    if (goals.length === 0) continue;
    const goal = pickGoal(goals, slot, history, cfg, s);
    const adds = (cfg.goals[goal]?.adds ?? []).filter((f) => !features.includes(f));
    if (adds.length > 0) {
      // The goal pulls in features of its own (shelves_full: a hunted good beside the farmed one).
      features = featureClosure([...features, ...adds], cfg);
      modules = modulesFor(families, features, c, cfg);
      if (conflicts(modules, c).length > 0) continue;
    }
    const template = pickTemplate(modules, goalKind(goal, cfg), history, cfg, s);
    if (template === null) continue;
    return { features, modules, goal, template };
  }
  throw new Error(`sequencer: no valid request for level ${index} (${slot.family}, ${slot.phase})`);
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

function pickTemplate(mods: readonly string[], goal: string, history: readonly HistoryEntry[], cfg: SequencerConfig, s: string): string | null {
  const prev = history[history.length - 1];
  const recent = history.slice(-cfg.duplicateWindow);
  const used = new Set(recent.map((h) => key(h.modules, h.goal, h.template)));
  const order = shuffled(cfg.templates, `${s}:tpl`);
  const ok = order.filter((t) => !used.has(key(mods, goal, t)));
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
