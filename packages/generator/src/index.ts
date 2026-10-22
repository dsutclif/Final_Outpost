import { content as defaultContent, type Content, type Manifest } from "@fo/content";
import { HUMAN, LADDER, PROFILES, TIME_FIXED_GOALS, playBot, type BotResult } from "@fo/bots";
import { measure, score, type Metrics, type Rating, type ReferenceStats, type HistoryEntry as RaterHistory, type Measurement } from "@fo/rater";
import referenceData from "../data/reference.json";
import genData from "../data/generator.json";
import { closure, conflicts } from "@fo/sequencer";
import { GEN, TEMPLATES, buildLevel, knobsFor, templateById, timeTarget, type Built, type Family } from "./build.js";
import { Rand, clamp01 } from "./rand.js";
import { skinText } from "./text.js";

export { TEMPLATES, GEN, timeTarget, buildLevel, knobsFor, templateById, CHALLENGE_PLACEHOLDER, type Template, type Knobs, type Built, type Family, type Sizing } from "./build.js";
export { flowModel, type Flow } from "./flow.js";
export { skinText, dedupeTitles } from "./text.js";
export { Placer, unreadablePairs } from "./layout.js";

/** Contract 5 request, from the sequencer (family, features, goal kind, modules). */
export interface GenRequest {
  target: number;
  family: Family;
  secondary?: Family | null | undefined;
  features?: readonly string[] | undefined;
  modules: readonly string[];
  goalType: string;
  seed: number;
  template?: string | undefined;
  id?: string | undefined;
  introduced?: readonly string[] | undefined;
  /** Challenge kinds the star may use (sequencer: the family's list). */
  challenges?: readonly string[] | undefined;
  funThreshold?: number | undefined;
  /** Sequencer phase (teach levels may keep an easy star). */
  phase?: string | undefined;
}

export const GENERATOR_REFERENCE = referenceData as unknown as ReferenceStats;

export interface GenOptions {
  content?: Content;
  history?: readonly RaterHistory[];
  funThreshold?: number;
  tolerance?: number;
  maxIterations?: number;
  log?: (line: string) => void;
  reference?: ReferenceStats;
  seeds?: { quick: { ref: number; other: number }; full: { ref: number; other: number } };
  /** Stars must be earned by the human-view bot (default). False: the good bot's old rule, for comparisons. */
  humanStars?: boolean;
}

/** Star bar for the human-view bot (generator.json humanStars); levels:check reads the same block. */
export const HUMAN_STARS = genData.humanStars as { seeds: number; minEarned: number; regressTolerance: number };

export interface StarSummary {
  /** Mean stars of the good bot over its 10 seeds, and of the median (weak) bot over 3. */
  good: number;
  median: number;
  /** Share of good seeds with all three stars. */
  goodAll: number;
  /** Mean stars of the human-view bot over HUMAN_STARS.seeds, and its share of three-star seeds. */
  human?: number;
  humanAll?: number;
}

export interface Candidate {
  manifest: Manifest;
  rating: Rating;
  p: number;
  err: number;
  stars: StarSummary;
  /** Mean stars per rung (verification runs on the final objectives). */
  starsByRung: Record<string, number>;
}

export interface GenStats {
  iterations: number;
  /** Candidates discarded, by reason. */
  rejects: Record<string, number>;
  ratings: number;
}

export interface GenDetail { manifest: Manifest | null; best: Candidate | null; stats: GenStats }

export function generate(req: GenRequest, opts: GenOptions = {}): Manifest | null {
  return generateDetailed(req, opts).manifest;
}

const REF = PROFILES["good"]!;
const MEDIAN_RUNG = LADDER[Math.floor(LADDER.length / 2)]!.name;
const HUGE = 1_000_000;
/** Probe lengths, as multiples of the level length, tried in turn when the bot falls short of the goal. */
const PROBE_STRETCH = [1, 1.6, 2.4];

/** Main-goal params with N (or the deadline) replaced, mirrored into objective 0. */
function setGoal(m: Manifest, patch: Record<string, number | string>): void {
  const g = { ...(m.goal as Record<string, unknown>), ...patch } as Manifest["goal"];
  m.goal = g;
  const { type: _t, ...params } = g as Record<string, unknown>;
  void _t;
  if (m.objectives?.[0]) m.objectives[0] = { ...m.objectives[0], params: params as Record<string, number | string> };
}

/**
 * Size a rate goal (earn N, hunt N ...) from a probe: the good bot plays with an unreachable N for the
 * level's length (or to the end of the wave schedule), and N becomes most of what it reached. Fill goals
 * get their deadline from the time the probe filled the core.
 */
function sizeGoal(b: Built, c: Content, lengthS: number): string | null {
  const m = b.manifest;
  const g = m.goal as { type: string; n?: number; seconds?: number };
  if (b.sizing !== "rate" && b.sizing !== "fill") return null;
  const probe = structuredClone(m);
  const waveEnd = m.waves.length > 0 ? m.waves[m.waves.length - 1]!.t + 40 : 0;
  const T = g.type === "earn_within" ? (g.seconds ?? lengthS) : Math.max(lengthS, waveEnd);
  if (b.sizing === "fill") setGoal(probe, { seconds: 900 }); else setGoal(probe, { n: HUGE });
  const factor = g.type === "earn_within" ? 0.85 : 0.9;
  const min = g.type === "bulk_order" ? 1 : g.type === "chain" ? 2 : 3;
  // Manual-first jobs and the automation tax slow the bot on long chains: a probe that falls short of
  // the goal's own workers runs again for longer (the level runs longer) before the candidate is dropped.
  // A deadline goal keeps its deadline.
  const stretches = g.type === "earn_within" ? [1] : PROBE_STRETCH;
  let progress = 0, doneAt = -1;
  for (const stretch of stretches) {
    progress = 0; doneAt = -1;
    playBot(probe, REF, 1, { content: c, maxTicks: Math.round((b.sizing === "fill" ? 400 : T) * stretch * 30), onTick: (st) => {
      const o = st.objectives[0]!;
      progress = o.progress;
      if (o.done && doneAt < 0) doneAt = st.tick;
    } });
    if (b.sizing === "fill" ? doneAt >= 0 : Math.floor(progress * factor) >= min) break;
  }
  if (b.sizing === "fill") {
    if (doneAt < 0) return "probe: core never filled";
    setGoal(m, { seconds: Math.round((doneAt / 30) * 1.6 + 15) });
    return null;
  }
  const n = Math.floor(progress * factor);
  if (n < min) return `probe: ${g.type} reached only ${progress}`;
  setGoal(m, { n });
  return null;
}

/** Automation a level can do without: hires, belts, machine levels, upgrades and wall reinforcement. */
function optionalPad(e: Manifest["entities"][number], c: Content): boolean {
  if (e.type === "pad.hire") return true;
  if (e.type !== "pad.build") return false;
  return e.build === "conv.level" || e.build === "struct.conveyor" || e.build === "struct.barrier.reinforced" || !!c.upgrades[e.build];
}

/** Remove these pads and every pad that requires one of them. */
function dropPads(m: Manifest, ids: ReadonlySet<string>): void {
  const gone = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of m.entities) {
      const req = (e as { requires?: { pad?: string } }).requires?.pad;
      if ("id" in e && e.id && !gone.has(e.id) && req && gone.has(req)) { gone.add(e.id); grew = true; }
    }
  }
  m.entities = m.entities.filter((e) => !("id" in e && e.id && gone.has(e.id)));
}

/**
 * The level without each optional pad it can do without: one at a time, a pad goes when the good bot
 * still wins every quick seed and earns as many stars without it. Null when every pad earns its place.
 */
function spareCut(m: Manifest, c: Content): Manifest | null {
  const stars = (x: Manifest): number => {
    // a cut that takes a pad the goal names with it leaves no valid level
    let rs: BotResult[];
    try { rs = [1, 2, 3].map((s) => playBot(x, REF, s, { content: c })); } catch { return -1; }
    return rs.every((r) => r.won) ? rs.reduce((a, r) => a + r.stars, 0) : -1;
  };
  const base = stars(m);
  let cur = m, cut = false;
  for (const e of m.entities) {
    if (!("id" in e) || !e.id || !optionalPad(e, c) || !cur.entities.some((x) => "id" in x && x.id === e.id)) continue;
    const next = structuredClone(cur);
    dropPads(next, new Set([e.id]));
    if (stars(next) >= base) { cur = next; cut = true; }
  }
  return cut ? cur : null;
}

/** Every element of the level used on the good bot's winning runs (REDESIGN-R2: nothing superfluous). */
function idleElements(m: Manifest, runs: readonly BotResult[]): string[] {
  const wins = runs.filter((r) => r.won);
  if (wins.length === 0) return ["no winning run"];
  const pads = new Set(wins.flatMap((r) => r.used.pads));
  const lines = new Set(wins.flatMap((r) => r.used.lines));
  const nodes = new Set(wins.flatMap((r) => r.used.nodes));
  const convs = new Set(wins.flatMap((r) => r.used.converters));
  const out: string[] = [];
  for (const e of m.entities) {
    if ((e.type === "pad.hire" || e.type === "pad.build") && !pads.has(e.id)) out.push(`pad ${e.id}`);
    if (e.type === "barrier.line" && !lines.has(e.id)) out.push(`line ${e.id}`);
    // A converter counts once it is producing, or bought with its feed in place (a chain still filling when the goal lands).
    if (e.type === "pad.build" && e.build.startsWith("conv.") && e.build !== "conv.level" && !convs.has(e.id) && !pads.has(e.id)) out.push(`converter ${e.id}`);
  }
  // Gatherables count by what they yield: a fuel forest of scrap and material sources is one element.
  const yields = (t: string) => defaultContent.nodes[t]?.yields ?? t;
  const usedYields = new Set([...nodes].map(yields));
  for (const t of new Set(m.entities.filter((e) => e.type.startsWith("node.") && "at" in e && (e as { enabled?: boolean }).enabled !== false).map((e) => e.type))) {
    if (!usedYields.has(yields(t))) out.push(`nodes ${t}`);
  }
  if (m.entities.some((e) => e.type.startsWith("capture.")) && !wins.some((r) => r.used.captures > 0 || r.runStats.tripBest > 0)) out.push("captures");
  if (m.entities.some((e) => e.type === "zone.prey") && !wins.some((r) => r.used.preyKilled > 0)) out.push("prey");
  // Filling the shelves is using the stall, even before a customer buys.
  if (m.entities.some((e) => e.type === "sink.sales_point") && m.goal.type !== "shelves_full" && !wins.some((r) => r.used.sold > 0)) out.push("sales point");
  if (m.entities.some((e) => e.type === "struct.gate" && "arrivals" in e && e.arrivals) && !wins.some((r) => r.used.admitted > 0)) out.push("arrivals gate");
  if (m.events.length > 0 && !wins.some((r) => r.used.hazards > 0)) out.push("hazard");
  if (m.entities.some((e) => e.type === "pad.build" && e.build === "struct.conveyor") && !wins.some((r) => r.used.conveyed > 0)) out.push("conveyor");
  return out;
}

type Obj = { id: string; kind: string; params: Record<string, number | string> };

/** Did a run earn this objective? Exact for the kinds used as stars (time from ticks, guards from run stats). */
function earned(o: Obj, r: BotResult): boolean {
  const s = r.runStats;
  if (!r.won) return false;
  switch (o.kind) {
    case "time_target": return r.goalTicks <= Number(o.params["seconds"]) * 30;
    case "settlement_never_freezes": return s.fuelOuts === 0;
    case "no_colonist_freezes": return s.froze === 0;
    case "heat_floor": return s.heatMin >= Number(o.params["pct"]) * 10;
    case "no_angry_customers": return s.customersAngry === 0;
    case "no_injuries": return s.injured === 0;
    case "hp_floor": return s.hpMin >= Number(o.params["pct"]);
    case "no_wall_lost": return s.barriersLost === 0;
    case "no_stockpile_overload": return !s.overload;
    case "tow_full_trip": return s.tripBestClean >= Number(o.params["n"]);
    case "tow_trip": return s.tripBest >= Number(o.params["n"]);
    case "rescue_all": return s.podsLost === 0 && s.podsLeft === 0 && s.rescued > 0;
    case "streak": return s.streakMax >= Number(o.params["n"]);
    case "hire": return s.hired >= Number(o.params["n"]);
    case "rescue": return s.rescued >= Number(o.params["n"]);
    case "admit": return s.admitted >= Number(o.params["n"]);
    case "kills": return s.kills >= Number(o.params["n"]);
    case "salvage": return s.salvage >= Number(o.params["n"]);
    default: return false;
  }
}

/** Star-parameter caps: extreme challenges the good bot can hit are still unfair for people. */
export const STAR_CAPS = { streak: 20, hpFloor: 80, heatFloor: 50, timeSlack: 1.15 } as const;

const pctile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] ?? 0; };

/** Candidate challenge objectives of a family, parameters sized from the good bot's runs. */
function challengeCandidates(fam: Family, goodRuns: BotResult[], allowed: readonly string[], goalKind: string): Obj[] {
  const S = goodRuns.filter((r) => r.won).map((r) => r.runStats);
  const out: Obj[] = [];
  const add = (kind: string, params: Record<string, number | string> = {}) => { if (kind !== goalKind && allowed.includes(kind)) out.push({ id: "challenge", kind, params }); };
  for (const k of allowed) {
    switch (k) {
      case "heat_floor": { const pct = Math.floor(pctile(S.map((s) => s.heatMin / 10), 0.2) / 5) * 5 - 5; if (pct >= 10) add(k, { pct: Math.min(STAR_CAPS.heatFloor, pct) }); break; }
      case "hp_floor": { const pct = Math.floor(pctile(S.map((s) => s.hpMin), 0.2) / 5) * 5 - 5; if (pct >= 20 && pct < 100) add(k, { pct: Math.min(STAR_CAPS.hpFloor, pct) }); break; }
      case "tow_full_trip": case "tow_trip": {
        const n = Math.min(3, Math.floor(pctile(S.map((s) => (k === "tow_trip" ? s.tripBest : s.tripBestClean)), 0.3)));
        if (n >= 2) add(k, { n });
        break;
      }
      case "admit": case "kills": case "salvage": {
        const v = (x: (typeof S)[number]) => (k === "admit" ? x.admitted : k === "kills" ? x.kills : x.salvage);
        const n = Math.floor(pctile(S.map(v), 0.3) * (k === "admit" ? 1 : 0.9));
        if (n >= 2) add(k, { n });
        break;
      }
      case "rescue": { const n = Math.floor(pctile(S.map((s) => s.rescued), 0.3)); if (n >= 2) add(k, { n }); break; }
      case "streak": { const n = Math.floor(pctile(S.map((s) => s.streakMax), 0.3) * 0.9); if (n >= 4) add(k, { n: Math.min(STAR_CAPS.streak, n) }); break; }
      case "hire": { const n = Math.floor(pctile(S.map((s) => s.hired), 0.3)); if (n >= 2) add(k, { n }); break; }
      default: add(k);
    }
  }
  void fam;
  return out;
}

/**
 * The final star objectives: a time target sized so the good bot makes it on every seed (time-fixed
 * goals take a second family challenge instead), and the family challenge the good bot earns on most
 * seeds that some ladder run misses (so it is never trivially satisfied). Preference rotates with the
 * level seed so the pack uses the whole family list.
 */
/**
 * Over the loop cap? Feeding the reactor by hand is exempt on a level with nobody to hire for it (no
 * hire pad delivers to the core): cheaper hires are then no fix to offer.
 */
function overLoopCap(ms: Measurement): boolean {
  if (ms.loopMax <= GEN.search.loopCap) return false;
  const coreHire = ms.manifest.entities.some((e) => e.type === "pad.hire" && (e as { role?: { to?: string } }).role?.to === "sink.core");
  return !(ms.loopKey.includes(">sink.core") && !coreHire);
}

function settleObjectives(m: Manifest, ms: Measurement, allowed: readonly string[], seed: number, teach = false, human: readonly BotResult[] | null = null, log: (line: string) => void = () => {}): string | null {
  const fam = m.family as Family;
  const good = ms.runs["good"]!;
  const ladder = Object.values(ms.runs).flat();
  const kind = m.goal.type;
  const nonTrivial = (o: Obj) => ladder.some((r) => !earned(o, r));
  const goodShare = (o: Obj) => good.filter((r) => earned(o, r)).length / good.length;
  // With the human-view bot, challenges are sized from its runs and kept only when it earns them on
  // minEarned of its seeds: the omniscient good bot no longer decides what a person can do.
  const humanOk = (o: Obj) => human!.filter((r) => earned(o, r)).length >= HUMAN_STARS.minEarned;
  const sized = challengeCandidates(fam, human ? [...human] : good, allowed, kind);
  const all = sized.filter(human ? humanOk : (o) => goodShare(o) >= 0.6);
  log(`challenges: ${sized.map((o) => `${o.kind}${Object.keys(o.params).length ? JSON.stringify(o.params) : ""} good ${good.filter((r) => earned(o, r)).length}/${good.length}${human ? ` human ${human.filter((r) => earned(o, r)).length}/${human.length}` : ""}${all.includes(o) ? "" : " dropped"}`).join("; ")}`);
  const strict = all.filter(nonTrivial);
  // Tutorial levels may keep a star every rung earns when none separates them: an easy star is fine there.
  const cands = strict.length > 0 || !teach ? strict : all;
  const rot = (xs: Obj[]) => xs.map((o, i) => ({ o, k: (i + seed) % Math.max(1, xs.length) })).sort((a, b) => a.k - b.k).map((x) => x.o);
  // The family's own challenges first (the first three listed), fallbacks sized from the runs after.
  const ordered = [...rot(cands.filter((o) => allowed.indexOf(o.kind) < 3)), ...rot(cands.filter((o) => allowed.indexOf(o.kind) >= 3))];
  if (ordered.length === 0) return `no family challenge the ${human ? "human-view" : "good"} bot earns that the ladder can miss`;
  let second: Obj;
  // Goals that finish on the clock (or after a fixed hold) leave no room for a time star: a second challenge instead.
  if (TIME_FIXED_GOALS.has(kind) || kind === "heat_hold") {
    if (ordered.length < 2) return "time-fixed goal needs two family challenges";
    second = { ...ordered[1]!, id: "challenge2" };
  } else {
    const tMax = Math.max(...good.map((r) => r.goalTicks)) / 30;
    // Never tighter than 1.15x the good bot's median finish: humans are slower than the bot.
    const sorted = good.filter((r) => r.won).map((r) => r.goalTicks / 30).sort((a, b) => a - b);
    const floorSec = Math.ceil((sorted[Math.floor((sorted.length - 1) / 2)] ?? tMax) * STAR_CAPS.timeSlack);
    second = { id: "time", kind: "time_target", params: { seconds: Math.max(floorSec, Math.ceil(tMax * 1.04)) } };
    if (!nonTrivial(second)) {
      // Everyone finishes in time: tighten to the median rung's typical time if that still keeps the good bot.
      const med = ms.runs[MEDIAN_RUNG]!.filter((r) => r.won).map((r) => r.goalTicks / 30);
      const t = med.length > 0 ? Math.floor(Math.min(...med) / 5) * 5 : 0;
      if (t > tMax && t >= floorSec) second.params["seconds"] = t;
      // Defend levels end on the wave clock, so every rung can finish together: a second challenge instead.
      if (!nonTrivial(second) && fam === "defend" && ordered.length >= 2) second = { ...ordered[1]!, id: "challenge2" };
      else if (!nonTrivial(second)) return "time target trivially met";
    }
  }
  // The player-facing allowance is longer than the bot-derived finish time (data factor).
  if (second.kind === "time_target") {
    let sec = timeTarget(Number(second.params["seconds"]));
    // ... and never shorter than the human-view bot needs on minEarned of its seeds.
    const hs = human ? human.filter((r) => r.won).map((r) => r.goalTicks / 30).sort((a, b) => a - b) : [];
    const need = hs[HUMAN_STARS.minEarned - 1];
    if (need !== undefined && need * 1.04 > sec) sec = Math.ceil((need * 1.04) / 5) * 5;
    second.params["seconds"] = sec;
  }
  m.objectives = [m.objectives![0]!, second, { ...ordered[0]!, id: "challenge" }];
  return null;
}

export function generateDetailed(req: GenRequest, opts: GenOptions = {}): GenDetail {
  const c = opts.content ?? defaultContent;
  const S = GEN.search;
  const tol = opts.tolerance ?? S.tolerance;
  const fmin = req.funThreshold ?? opts.funThreshold ?? S.funThreshold;
  const reference = opts.reference ?? GENERATOR_REFERENCE;
  const maxIt = opts.maxIterations ?? S.maxIterations;
  const mods = closure(req.modules, c);
  const bad = conflicts(mods, c);
  if (bad.length > 0) throw new Error(`modules exclude each other: ${bad.join(", ")}`);
  const rand = new Rand(req.seed);
  const tplId = req.template ?? rand.fork("tpl").pick(TEMPLATES.templates).id;
  const tpl = templateById(tplId);
  const id = req.id ?? `gen-${req.seed}`;
  const stats: GenStats = { iterations: 0, rejects: {}, ratings: 0 };
  const reject = (k: string) => { stats.rejects[k] = (stats.rejects[k] ?? 0) + 1; };
  const log = opts.log ?? (() => {});
  const history = opts.history ?? [];
  const allowed = req.challenges ?? [];
  const humanStars = opts.humanStars ?? true;

  let lo = 0, hi = 1;
  let p = clamp01((req.target - 0.08) / 0.8);
  let best: Candidate | null = null;
  const mrand = rand.fork("mutate");
  // Repeated-loop lever: 0..1 share of the worker hire price cut, raised after each `repetitive` reject.
  let ease = 0;
  // Optional pads the winning bot never needed; left out of later builds (see dropPads).
  const dropped = new Set<string>();
  // Same for the workers module when nothing on the level ever needs a worker (a shelves goal filled by hand).
  const droppedMods = new Set<string>();
  const easeUp = (): boolean => { if (ease >= 1) return false; ease = Math.min(1, ease + 1 / S.loopEaseSteps); return true; };

  for (let it = 0; it < maxIt; it++) {
    stats.iterations++;
    const mut: Record<string, number> = {};
    if (it > 0) for (const k of Object.keys(GEN.knobs)) mut[k] = (mrand.float() * 2 - 1) * GEN.jitter;
    const knobs = knobsFor(p, mut);
    // Levers against a repeated player loop, scaled by how often the search has had to ease it:
    // a slower burn (fewer core feeding trips), a shorter level (fewer trips overall), a little
    // more starting currency (the first worker hire arrives sooner). Hire prices ease in buildLevel.
    knobs.burn *= 1 + S.loopBurnEase * ease;
    knobs.length *= 1 - S.loopLengthCut * ease;
    knobs.startCurrency += S.loopStartCurrency * ease;
    let built: Built | null = null;
    let why = "";
    for (let salt = 0; salt < S.layoutTries && !built; salt++) {
      try {
        built = buildLevel({ id, seed: req.seed, family: req.family, secondary: req.secondary ?? null, features: req.features ?? [], goalType: req.goalType, modules: mods.filter((x) => !droppedMods.has(x)), template: tpl, knobs, hireEase: ease, content: c }, salt);
      } catch (e) { why = (e as Error).message; reject(why.startsWith("flow") ? "flow" : "layout"); }
    }
    if (!built) { log(`  it${it} p=${p.toFixed(2)} build failed: ${why}`); hi = p; p = (lo + p) / 2; continue; }
    const m = built.manifest;
    if (dropped.size > 0) dropPads(m, dropped);
    const sz = sizeGoal(built, c, knobs.length);
    if (sz) { reject("probe"); log(`  it${it} p=${p.toFixed(2)} ${sz}`); hi = p; p = (lo + p) / 2; continue; }
    let quick = [1, 2, 3].map((s) => playBot(m, REF, s, { content: c, timeBudgetSeconds: 900 }));
    // Hazards must land while the level is still running: pull them in when the good bot finishes early.
    if (m.events.length > 0 && m.goal.type !== "hazard_survive" && quick.every((r) => r.won)) {
      const tMin = Math.min(...quick.map((r) => r.goalTicks)) / 30;
      const last = Math.max(...m.events.map((e) => e.end));
      if (last > tMin * 0.85) {
        const shift = Math.round(last - tMin * 0.7);
        m.events = m.events.map((e) => ({ ...e, warnAt: Math.max(0, e.warnAt - shift), start: Math.max(4, e.start - shift), end: Math.max(10, e.end - shift) }));
        m.events.forEach((e) => { if (e.warnAt > e.start) e.warnAt = e.start; });
        quick = [1, 2, 3].map((s) => playBot(m, REF, s, { content: c, timeBudgetSeconds: 900 }));
      }
    }
    if (quick.some((r) => !r.won)) {
      reject("infeasible");
      log(`  it${it} p=${p.toFixed(2)} good bot lost (${quick.map((r) => `${r.reason}@${Math.round(r.ticks / 30)}s`).join(",")}) goal=${JSON.stringify(m.goal)}`);
      hi = p; p = (lo + p) / 2;
      continue;
    }
    if (!TIME_FIXED_GOALS.has(m.goal.type)) {
      const tMax = Math.max(...quick.map((r) => r.goalTicks)) / 30;
      m.params["level.budgetSeconds"] = timeTarget(Math.min(900, Math.max(60, Math.round(tMax / (1 - knobs.margin) / 10) * 10)), 10);
    }
    const rateIt = (seeds: { ref: number; other: number }) => {
      stats.ratings++;
      const ms = measure(m, { content: c, refSeeds: seeds.ref, otherSeeds: seeds.other, history });
      return { ms, r: score(ms, { content: c, reference }) };
    };
    log(`  it${it} good=${quick.map((q) => Math.round(q.goalTicks / 30)).join("/")}s budget=${m.params["level.budgetSeconds"]} goal=${JSON.stringify(m.goal)}`);
    let { ms, r } = rateIt(opts.seeds?.quick ?? S.quickSeeds);
    const flags = Object.entries(r.filters).filter(([, v]) => v).map(([k]) => k);
    log(`  it${it} p=${p.toFixed(2)} D=${r.D.toFixed(3)} F=${r.F.toFixed(3)} feasible=${r.feasible} loopMax=${ms.loopMax} [${ms.loopKey}] ${flags.join(",")} ${r.evidence.idleModules.join(",")}`);
    flags.forEach(reject);
    if (!r.feasible) reject("infeasible");
    const idleMods = r.evidence.idleModules;
    if (idleMods.includes("workers") && idleMods.every((x) => x === "workers" || x === "build_pads")
      && !mods.some((x) => !droppedMods.has(x) && x !== "workers" && c.modules[x]?.requires?.includes("workers"))) {
      droppedMods.add("workers");
      log(`  it${it} no worker needed: dropping the workers module`);
    }
    // No more than loopCap identical player trips in a row (see overLoopCap): a 6th repeat must be unnecessary, so the
    // level has to give a worker (cheaper hire pads here), a bigger carry, or a cheaper cost.
    if (r.feasible && overLoopCap(ms)) {
      reject("repetitive");
      const eased = easeUp();
      log(`  it${it} repetitive: ${ms.loopMax} x ${ms.loopKey}${eased ? ` (hire prices eased to ${ease.toFixed(2)})` : ""}`);
      if (eased) continue;
      p = clamp01(p + (mrand.float() - 0.5) * 0.2);
      continue;
    }
    const hardFlags = flags.filter((f) => f !== "trivial");
    if (!r.feasible || hardFlags.includes("stall")) { hi = p; p = (lo + p) / 2; continue; }
    if (flags.includes("trivial")) { lo = p; p = (p + hi) / 2; continue; }
    if (hardFlags.length > 0) { p = clamp01(p + (mrand.float() - 0.5) * 0.2); continue; }
    const close = Math.abs(r.D - req.target) <= tol;
    if (close || best === null || Math.abs(r.D - req.target) < best.err) {
      ({ ms, r } = rateIt(opts.seeds?.full ?? S.fullSeeds));
      const err = Math.abs(r.D - req.target);
      if (overLoopCap(ms)) {
        reject("repetitive");
        easeUp();
        log(`  it${it} repetitive on the full ladder: ${ms.loopMax} x ${ms.loopKey}`);
        continue;
      }
      const idle = idleElements(m, ms.runs["good"]!);
      if (!r.ok) Object.entries(r.filters).filter(([, v]) => v).forEach(([k]) => reject(k));
      else if (idle.length > 0) {
        reject("idleElement");
        // Optional automation the winning bot never needed (manual-first and the automation tax make the
        // late extras not worth buying): later builds of this level leave those pads out.
        const extra = idle.map((s) => s.startsWith("pad ") ? m.entities.find((e) => "id" in e && e.id === s.slice(4)) : undefined);
        if (extra.every((e) => e && optionalPad(e, c))) for (const e of extra) dropped.add((e as { id: string }).id);
        log(`  it${it} idle elements: ${idle.join(", ")}${dropped.size > 0 ? ` (dropping ${[...dropped].join(", ")})` : ""}`);
      }
      else {
        const human = humanStars ? playHuman(m, c) : null;
        const why2 = settleObjectives(m, ms, allowed, req.seed, req.phase === "teach", human, (s) => log(`  it${it} ${s}`));
        if (why2) { reject("objectives"); log(`  it${it} objectives: ${why2}`); }
        else {
          const v = verifyStars(m, c, humanStars);
          if (!v.feasible) { reject("infeasible"); log(`  it${it} good bot loses or wins narrowly on the final objectives`); }
          else if (!v.starsOk) { reject("stars"); log(`  it${it} ${humanStars ? `human-view bot misses a star on more than ${HUMAN_STARS.seeds - HUMAN_STARS.minEarned} of ${HUMAN_STARS.seeds} seeds or never earns all three` : "good bot never earns all three stars"}`); }
          else {
            // No pad the level can be finished (stars included) without: re-rate the trimmed level and keep it if it still passes.
            let fin = { m, r, v, err };
            const lean = spareCut(m, c);
            if (lean) {
              stats.ratings++;
              const ms2 = measure(lean, { content: c, refSeeds: (opts.seeds?.full ?? S.fullSeeds).ref, otherSeeds: (opts.seeds?.full ?? S.fullSeeds).other, history });
              const r2 = score(ms2, { content: c, reference });
              const v2 = r2.ok && !overLoopCap(ms2) && idleElements(lean, ms2.runs["good"]!).length === 0 ? verifyStars(lean, c, humanStars) : null;
              if (v2 && v2.feasible && v2.starsOk) fin = { m: lean, r: r2, v: v2, err: Math.abs(r2.D - req.target) };
              log(`  it${it} spare pads: ${m.entities.filter((e) => "id" in e && !lean.entities.some((x) => "id" in x && x.id === e.id)).map((e) => (e as { id: string }).id).join(", ")}${fin.m === lean ? " dropped" : " kept (the trimmed level fails)"}`);
            }
            attachRating(fin.m, fin.r, req.introduced ?? [], fin.v.summary);
            const cand: Candidate = { manifest: fin.m, rating: fin.r, p, err: fin.err, stars: fin.v.summary, starsByRung: fin.v.byRung };
            if (!best || cand.err < best.err) best = cand;
            if (fin.err <= tol && fin.r.F >= fmin) return { manifest: fin.m, best: cand, stats };
            if (fin.err <= tol) reject("lowFun"); else reject("offTarget");
          }
        }
      }
    } else reject("offTarget");
    if (r.D < req.target) lo = p; else hi = p;
    p = (lo + hi) / 2;
    if (hi - lo < 0.02) { lo = Math.max(0, lo - 0.15); hi = Math.min(1, hi + 0.15); }
  }
  return { manifest: null, best, stats };
}

/** The human-view bot on HUMAN_STARS.seeds in-level seeds (the same seeds levels:check replays). */
function playHuman(m: Manifest, c: Content): BotResult[] {
  return Array.from({ length: HUMAN_STARS.seeds }, (_, i) => playBot(m, HUMAN, i + 1, { content: c }));
}

/**
 * Replay the final objectives in the sim: good bot 10 seeds, every other rung 3, and with `human` the
 * human-view bot. Stars pass when the good bot takes all three on some seed or, with `human`, when the
 * human-view bot earns every star objective on minEarned of its seeds and all three on at least one.
 */
function verifyStars(m: Manifest, c: Content, human = false): { summary: StarSummary; byRung: Record<string, number>; starsOk: boolean; feasible: boolean } {
  const byRung: Record<string, number> = {};
  let goodAll = 0, goodAny = 0, feasible = true;
  for (const prof of LADDER) {
    const n = prof.name === "good" ? 10 : 3;
    let sum = 0;
    for (let s = 1; s <= n; s++) {
      const r = playBot(m, prof, s, { content: c });
      sum += r.stars;
      // Star policies (salvage collection, tow targets) change play, so feasibility is re-checked on the final objectives.
      if (prof.name === "good" && (!r.won || r.margin < 0.2)) feasible = false;
      if (prof.name === "good" && r.stars === 3) { goodAll++; goodAny++; }
    }
    byRung[prof.name] = Math.round((sum / n) * 100) / 100;
  }
  const summary: StarSummary = { good: byRung["good"]!, median: byRung[MEDIAN_RUNG]!, goodAll: goodAll / 10 };
  if (!human) return { summary, byRung, starsOk: goodAny > 0, feasible };
  const hs = playHuman(m, c);
  const humanAll = hs.filter((r) => r.stars === 3).length;
  const each = (m.objectives ?? []).slice(1).every((_, i) => hs.filter((r) => r.objectives[i + 1]?.done).length >= HUMAN_STARS.minEarned);
  byRung["human"] = Math.round((hs.reduce((a, r) => a + r.stars, 0) / hs.length) * 100) / 100;
  summary.human = byRung["human"];
  summary.humanAll = Math.round((humanAll / hs.length) * 100) / 100;
  return { summary, byRung, starsOk: each && humanAll > 0, feasible };
}

/** Rating block and launch-skin text on the manifest. */
export function attachRating(m: Manifest, r: Rating, introduced: readonly string[], stars?: StarSummary): void {
  (m as unknown as { rating: unknown }).rating = {
    difficulty: round3(r.D), fun: round3(r.F), botMargin: round3(r.margin["good"] ?? 0), botsPassed: [...r.botsPassed],
    ...(stars ? { stars } : {}),
  };
  m.text = { mars_greenhouse: skinText(m, introduced) };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** One unsearched sample at the pressure the target suggests, measured with the full ladder (reference stats). */
export function calibrationSample(req: GenRequest, opts: { content?: Content } = {}): { goal: string; metrics: Metrics } | null {
  const c = opts.content ?? defaultContent;
  const mods = closure(req.modules, c);
  const tpl = templateById(req.template ?? TEMPLATES.templates[0]!.id);
  const knobs = knobsFor(clamp01((req.target - 0.08) / 0.8));
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    let built: Built;
    try { built = buildLevel({ id: req.id ?? "calib", seed: req.seed, family: req.family, secondary: req.secondary ?? null, features: req.features ?? [], goalType: req.goalType, modules: mods, template: tpl, knobs, content: c }, salt); }
    catch { continue; }
    if (sizeGoal(built, c, knobs.length)) return null;
    const m = built.manifest;
    const quick = [1, 2, 3].map((s) => playBot(m, REF, s, { content: c, timeBudgetSeconds: 900 }));
    if (quick.some((r) => !r.won)) return null;
    if (!TIME_FIXED_GOALS.has(m.goal.type)) m.params["level.budgetSeconds"] = timeTarget(Math.round(Math.max(...quick.map((r) => r.goalTicks)) / 30 / (1 - knobs.margin) / 10) * 10, 10);
    const ms = measure(m, { content: c, refSeeds: GEN.search.fullSeeds.ref, otherSeeds: GEN.search.fullSeeds.other });
    return { goal: m.goal.type, metrics: ms.metrics };
  }
  return null;
}
