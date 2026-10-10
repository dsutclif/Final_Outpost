import { content as defaultContent, type Content } from "@fo/content";
import data from "../data/sequencer.json";

// The sequencer turns a level index plus the levels the player has seen into a generator request:
// which modules, which goal, which layout template and what target difficulty. It is pure: the same
// index and history always give the same request. Every rule reads content data (modules.json) or
// data/sequencer.json; nothing names a level.

export type Phase = "core" | "teach" | "test" | "mix";

export interface SequencerConfig {
  packId: string;
  tutorialLength: number;
  tutorialTargets: { from: number; to: number };
  blockLength: number;
  band: { lo: number; hi: number };
  breatherTarget: number;
  teachTarget: number;
  testTarget: number;
  tutorialTeachDrop: number;
  funThresholds: { tutorial: number; band: number };
  recoveryDrop: number;
  maxOptional: number;
  mix: { min: number; max: number };
  recentWindow: number;
  duplicateWindow: number;
  testLevels: number;
  spacing: { untilBeat: number; levels: number }[];
  templates: string[];
  coIntroduce: Record<string, string>;
  implies: Record<string, string[]>;
  goals: Record<string, { needsAny: string[] }>;
  goalExcludes: Record<string, string[]>;
  goalPreference: string[];
  dependencyOnly: string[];
  anchored: string[];
  anchorGoals: string[];
  coreGoal: string;
}

export const DEFAULT_CONFIG = data as unknown as SequencerConfig;

/** What the sequencer needs to know about a level the player already saw. */
export interface HistoryEntry {
  modules: readonly string[];
  goal: string;
  template?: string | undefined;
  /** Failed attempts on that level (recovery rule). */
  fails?: number | undefined;
}

export interface LevelRequest {
  index: number;
  id: string;
  /** Target difficulty D in (0, 1). */
  target: number;
  /** Every module of the level, always-on ones included, sorted. */
  modules: string[];
  /** Optional (not always-on) modules. */
  optional: string[];
  /** Modules this level introduces (empty outside teach levels). */
  introduced: string[];
  goalType: string;
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

/** One introduction beat: the modules it teaches and the level index that teaches them. */
export interface Beat { order: number; modules: string[]; level: number }

// ---------- deterministic choice (no Math.random) ----------

export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Deterministic shuffle keyed by a string. */
function shuffled<T>(xs: readonly T[], key: string): T[] {
  return xs.map((x, i) => ({ x, k: hash32(`${key}#${i}`) })).sort((a, b) => a.k - b.k).map((e) => e.x);
}

// ---------- modules ----------

const optionalIds = (c: Content): string[] => Object.keys(c.modules).filter((id) => !c.modules[id]!.alwaysOn);
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

/** Goal types a module set can carry: the goal's needs are present and nothing it excludes is. */
export function compatibleGoals(mods: readonly string[], cfg: SequencerConfig = DEFAULT_CONFIG): string[] {
  const set = new Set(mods);
  const anchored = cfg.anchored.some((m) => set.has(m));
  return cfg.goalPreference.filter((g) => {
    const need = cfg.goals[g]?.needsAny ?? [];
    if (need.length > 0 && !need.some((m) => set.has(m))) return false;
    if ((cfg.goalExcludes[g] ?? []).some((m) => set.has(m))) return false;
    // Anchored modules need a pad the bot will certainly buy to hang their pads from.
    if (anchored && !cfg.anchorGoals.includes(g) && !set.has("workers")) return false;
    return true;
  });
}

// ---------- introduction schedule ----------

/** Introduction beats in content order (modules.introducedAt), co-introduced modules merged. */
export function schedule(c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): Beat[] {
  const byOrder = new Map<number, string[]>();
  for (const id of optionalIds(c)) {
    const at = c.modules[id]!.introducedAt;
    if (at === null) continue;
    // A module that cannot be taught alone joins the beat of its partner.
    const partner = cfg.coIntroduce[id];
    const order = partner !== undefined ? c.modules[partner]?.introducedAt ?? at : at;
    if (!byOrder.has(order)) byOrder.set(order, []);
    byOrder.get(order)!.push(id);
  }
  const orders = [...byOrder.keys()].sort((a, b) => a - b);
  const beats: Beat[] = [{ order: 0, modules: [], level: 1 }];
  let level = 1;
  orders.forEach((o, i) => {
    const gap = i === 0 ? 1 : gapAfter(i, cfg);
    level += gap;
    beats.push({ order: o, modules: byOrder.get(o)!.sort(), level });
  });
  return beats;
}

/** Levels between beat b and b+1 (b is 1-based over the beats after the core loop). */
function gapAfter(b: number, cfg: SequencerConfig): number {
  for (const s of cfg.spacing) if (b < s.untilBeat) return s.levels;
  return cfg.spacing[cfg.spacing.length - 1]!.levels;
}

/** Level index at which a module is introduced (1 for always-on modules), or null if never. */
export function introductionLevel(module: string, c: Content = defaultContent, cfg: SequencerConfig = DEFAULT_CONFIG): number | null {
  if (c.modules[module]?.alwaysOn) return 1;
  return schedule(c, cfg).find((b) => b.modules.includes(module))?.level ?? null;
}

// ---------- targets ----------

/** Target difficulty for a level from its index and phase (curve shaping). */
export function targetFor(index: number, phase: Phase, cfg: SequencerConfig = DEFAULT_CONFIG): { target: number; breather: boolean } {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  if (index <= cfg.tutorialLength) {
    // Tutorial arc: low targets with a gentle rise; teach levels sit a little lower still.
    const { from, to } = cfg.tutorialTargets;
    const t = from + ((to - from) * (index - 1)) / Math.max(1, cfg.tutorialLength - 1);
    return { target: r3(phase === "teach" ? Math.max(0.05, t - cfg.tutorialTeachDrop) : t), breather: false };
  }
  // Band: a sawtooth over each block, the block's last level a breather.
  const pos = (index - cfg.tutorialLength - 1) % cfg.blockLength;
  if (pos === cfg.blockLength - 1) return { target: r3(cfg.breatherTarget), breather: true };
  const { lo, hi } = cfg.band;
  const saw = lo + 0.05 + ((hi - lo - 0.05) * pos) / Math.max(1, cfg.blockLength - 2);
  if (phase === "teach") return { target: r3(Math.min(saw, cfg.teachTarget)), breather: false };
  if (phase === "test") return { target: r3(Math.min(saw, cfg.testTarget)), breather: false };
  return { target: r3(saw), breather: false };
}

// ---------- the sequencer ----------

interface Pick { modules: string[]; goal: string; template: string }

const key = (mods: readonly string[], goal: string, tpl: string | undefined) => `${[...mods].sort().join(",")}|${goal}|${tpl ?? ""}`;

/**
 * The request for level `index` (1-based) given the levels before it (most recent last). Pure.
 * Rules: teach (new mechanic + at most 2 familiar modules, low target), test (the next levels reuse
 * it with different companions at medium), mix (3 to 5 modules including one from the last 5
 * levels), cap of 6 optional modules, content exclusions, always-on modules, sawtooth curve,
 * novelty (no two consecutive levels share module set, goal and template) and no duplicate of the
 * last levels' module set + goal + template.
 */
export function sequence(index: number, history: readonly HistoryEntry[], opts: SequenceOptions = {}): LevelRequest {
  if (!Number.isInteger(index) || index < 1) throw new Error(`level index must be a positive integer, got ${index}`);
  const c = opts.content ?? defaultContent;
  const cfg = opts.config ?? DEFAULT_CONFIG;
  const beats = schedule(c, cfg);
  let beatIdx = 0;
  beats.forEach((b, i) => { if (b.level <= index) beatIdx = i; });
  const beat = beats[beatIdx]!;
  const since = index - beat.level;
  const phase: Phase = beatIdx === 0 ? (index === 1 ? "core" : "mix") : since === 0 ? "teach" : since <= cfg.testLevels ? "test" : "mix";
  const unlocked = beats.filter((b) => b.level <= index).flatMap((b) => b.modules);
  const recentMods = beats.filter((b) => b.level <= index && b.level > index - cfg.recentWindow && b.modules.length > 0).flatMap((b) => b.modules);
  const prev = history[history.length - 1];
  const salt = `${cfg.packId}:${index}`;

  const pick = choose(index, phase, beat, unlocked, recentMods, history, c, cfg, salt);
  let { target, breather } = targetFor(index, phase, cfg);
  if (opts.recovery && prev?.fails !== undefined && prev.fails >= 2) target = Math.max(0.05, Math.round((target - cfg.recoveryDrop) * 1000) / 1000);
  return {
    index,
    id: `${cfg.packId}-L${String(index).padStart(3, "0")}`,
    target,
    modules: pick.modules,
    optional: optionalOf(pick.modules, c),
    introduced: phase === "teach" || phase === "core" ? [...beat.modules].sort() : [],
    goalType: pick.goal,
    template: pick.template,
    seed: hash32(`${salt}:seed`) & 0x7fffffff,
    phase,
    breather,
    funThreshold: index <= cfg.tutorialLength ? cfg.funThresholds.tutorial : cfg.funThresholds.band,
  };
}

function choose(index: number, phase: Phase, beat: Beat, unlocked: string[], recent: string[], history: readonly HistoryEntry[],
  c: Content, cfg: SequencerConfig, salt: string): Pick {
  const prev = history[history.length - 1];
  // History may be partial (most recent last); the teach level sits `index - beat.level` entries back.
  const back = index - beat.level;
  const teachEntry = back > 0 && back <= history.length ? history[history.length - back] : undefined;
  const pickable = unlocked.filter((m) => !cfg.dependencyOnly.includes(m));
  const familiarPool = pickable.filter((m) => !beat.modules.includes(m));

  for (let attempt = 0; attempt < 400; attempt++) {
    const s = `${salt}:${attempt}`;
    let core: string[] = [];
    let extrasWanted = 0;
    let pool: string[] = [];
    if (phase === "core") {
      core = [];
    } else if (phase === "teach" || phase === "test") {
      core = [...beat.modules];
      const deps = optionalOf(closure(core, c, cfg), c).filter((m) => !beat.modules.includes(m));
      // Teach: at most 2 familiar modules, dependencies included. Test: 1 to 3 companions.
      extrasWanted = phase === "teach" ? Math.max(0, 2 - deps.length) : 1 + (hash32(s) % 3);
      pool = shuffled(familiarPool, s);
      // Prefer recently introduced companions on teach levels so the pool keeps moving.
      if (phase === "teach" && attempt < 20) pool = [...pool].sort((a, b) => (introductionLevel(b, c, cfg) ?? 0) - (introductionLevel(a, c, cfg) ?? 0));
    } else {
      const k = cfg.mix.min + (hash32(`${s}:k`) % (cfg.mix.max - cfg.mix.min + 1));
      const recentPick = recent.filter((m) => !cfg.dependencyOnly.includes(m));
      const rec = shuffled(recentPick.length > 0 ? recentPick : pickable, `${s}:r`)[0];
      core = rec ? [rec] : [];
      extrasWanted = Math.max(0, k - core.length);
      pool = shuffled(pickable.filter((m) => m !== rec), s);
    }
    let mods = closure(core, c, cfg);
    for (const m of pool) {
      if (extrasWanted <= 0) break;
      if (mods.includes(m)) continue;
      const next = closure([...mods, m], c, cfg);
      if (conflicts(next, c).length > 0) continue;
      if (optionalOf(next, c).length > cfg.maxOptional) continue;
      if (phase === "teach" && optionalOf(next, c).filter((x) => !beat.modules.includes(x)).length > 2) continue;
      mods = next;
      extrasWanted--;
    }
    if (conflicts(mods, c).length > 0 || optionalOf(mods, c).length > cfg.maxOptional) continue;
    if (phase === "mix" && optionalOf(mods, c).length < Math.min(cfg.mix.min, unlocked.length)) continue;
    // Test levels: different companions from the teach level (and from the previous test level).
    if (phase === "test") {
      const comp = (ms: readonly string[]) => optionalOf(ms, c).filter((m) => !beat.modules.includes(m)).sort().join(",");
      const mine = comp(mods);
      if (teachEntry && comp(teachEntry.modules) === mine && attempt < 300) continue;
      if (prev && comp(prev.modules) === mine && attempt < 300) continue;
    }
    const goals = phase === "core" ? [cfg.coreGoal] : compatibleGoals(mods, cfg);
    if (goals.length === 0) continue;
    const goal = pickGoal(goals, phase, beat, recent, prev, c, s);
    const template = pickTemplate(mods, goal, history, cfg, s);
    if (template === null) continue;
    return { modules: mods, goal, template };
  }
  throw new Error(`sequencer: no valid module set for level ${index} (${phase})`);
}

function pickGoal(goals: string[], phase: Phase, beat: Beat, recent: string[], prev: HistoryEntry | undefined, c: Content, s: string): string {
  // The goal that exercises the module being taught (goal registry), else one for a recent module.
  const exercising = (mods: readonly string[]) => goals.filter((g) => mods.includes(c.goals[g]?.exercises ?? ""));
  if (phase === "teach" || phase === "core") {
    const ex = exercising(beat.modules);
    if (ex.length > 0) return ex[0]!;
    return goals[0]!;
  }
  const ex = exercising(phase === "test" ? beat.modules : recent).filter((g) => g !== prev?.goal);
  if (ex.length > 0 && hash32(`${s}:g`) % 2 === 0) return ex[0]!;
  // Otherwise rotate: prefer a goal different from the previous level's.
  const fresh = goals.filter((g) => g !== prev?.goal);
  const list = fresh.length > 0 ? fresh : goals;
  return list[hash32(`${s}:goal`) % list.length]!;
}

function pickTemplate(mods: readonly string[], goal: string, history: readonly HistoryEntry[], cfg: SequencerConfig, s: string): string | null {
  const prev = history[history.length - 1];
  const recent = history.slice(-cfg.duplicateWindow);
  const used = new Set(recent.map((h) => key(h.modules, h.goal, h.template)));
  const order = shuffled(cfg.templates, `${s}:tpl`);
  // Prefer a template the previous level did not use, then any that is not a duplicate.
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
    h.push({ modules: r.modules, goal: r.goalType, template: r.template });
  }
  return out;
}
