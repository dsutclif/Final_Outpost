import type { Content, Manifest } from "@fo/content";
import { LADDER, TIME_FIXED_GOALS } from "@fo/bots";
import { REFERENCE, meanMargin, winRate, type HistoryEntry, type Measurement } from "./measure.js";
import { playShapeFails, playShapeNumbers, type PlayShapeParams } from "./playShape.js";
import filterData from "../data/filters.json";
import { sameAsEarlier, varietySignature } from "./variety.js";

// Quality filters from the spec. Each returns a flag plus the evidence behind it.

export interface Filters { idleModule: boolean; trivial: boolean; stall: boolean; unreadable: boolean; duplicate: boolean; ladderSpent: boolean; playShape: boolean }
export interface FilterEvidence { idleModules: string[]; unreadable: string[]; stallRuns: string[]; duplicateOf: string | null; playShape: string[] }

export const FILTER_PARAMS = filterData as { screenRadius: number; trivialBudgetShare: number; trivialWavesMargin: number; ladderLeftMin: number };

const PLAY_SHAPE = (filterData as unknown as { playShape: PlayShapeParams & { exempt: string[]; enforce: boolean } }).playShape;

/** Modules the manifest switches on that no winning run of any rung ever exercised. */
function idleModules(ms: Measurement, c: Content): string[] {
  const used = new Set<string>();
  for (const rs of Object.values(ms.runs)) for (const r of rs) if (r.won) r.trace.modulesUsed.forEach((m) => used.add(m));
  const anyWin = Object.values(ms.runs).some((rs) => rs.some((r) => r.won));
  if (!anyWin) return [];
  // A module pulled in only as a dependency, with nothing of its own in the level (build pads on a level
  // without a single pad), cannot be exercised and is not counted. Walls get that exemption only on a wall-free level (outpost-ops#208).
  const pads = ms.manifest.entities.some((e) => e.type === "pad.hire" || e.type === "pad.build");
  const walls = ms.manifest.entities.some((e) => e.type === "barrier.line");
  return ms.manifest.modules.filter((id) => !c.modules[id]?.alwaysOn && !used.has(id) && !(id === "build_pads" && !pads) && !(id === "barrier_lines" && !walls));
}

interface Station { id: string; x: number; y: number; r: number; key: boolean; target?: string | undefined; requires?: string | undefined }

/** Interaction radii from content (pads from params), positions from the manifest. */
function stations(m: Manifest, c: Content): Station[] {
  const P = (k: string) => m.params[k] ?? c.defaults[k] ?? 0;
  const out: Station[] = [];
  m.entities.forEach((e, i) => {
    const id = ("id" in e && e.id) || `${e.type}#${i}`;
    if (!("at" in e)) return;
    const [x, y] = e.at;
    if (e.type === "pad.hire" || e.type === "pad.build") {
      const big = e.type === "pad.build" && e.big;
      // turret sockets line the attack roads out to the map edge (Batch 3): meant to be out of the opening view
      const road = e.type === "pad.build" && e.build.startsWith("struct.ranged_defense");
      out.push({ id, x, y, r: big ? P("pads.bigRange") : P("pads.range"), key: !road, target: e.type === "pad.build" ? e.target : undefined, requires: e.requires?.pad });
    } else if (e.type === "sink.core") {
      const d = c.sinks["sink.core"];
      out.push({ id, x, y, r: d && d.kind === "core" ? d.range : 0, key: true });
    } else if (e.type === "sink.sales_point") {
      const d = c.sinks["sink.sales_point"];
      out.push({ id, x, y, r: d ? d.range : 0, key: true });
    } else if (e.type.startsWith("node.") && c.nodes[e.type]) {
      out.push({ id, x, y, r: c.nodes[e.type]!.range, key: false });
    } else if (e.type.startsWith("conv.") && c.converters[e.type]) {
      out.push({ id, x, y, r: c.converters[e.type]!.range, key: true });
    }
  });
  return out;
}

/**
 * Unreadable: one interaction centre sits inside another's radius (standing at one would trigger
 * the other), except a pad placed on the entity it acts on (or beside another acting on it); or a key station farther than a screen
 * from the core.
 */
function unreadable(m: Manifest, c: Content): string[] {
  const st = stations(m, c);
  const out: string[] = [];
  // pads on one spot chained by requires show one at a time (a machine's staff pad: its hires in order, then its upgrade)
  const byId = new Map(st.map((s) => [s.id, s] as const));
  const after = (a: Station, b: Station): boolean => {
    for (let s: Station | undefined = a, n = 0; s?.requires !== undefined && n < 32; n++) { if (s.requires === b.id) return true; s = byId.get(s.requires); }
    return false;
  };
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    const a = st[i]!, b = st[j]!;
    // a pad on the entity it acts on, or two pads acting on one target (a tower's Lv2 and Lv3: one shows at a time)
    if (a.target === b.id || b.target === a.id || (a.target !== undefined && a.target === b.target)) continue;
    if (a.x === b.x && a.y === b.y && (after(a, b) || after(b, a))) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < Math.max(a.r, b.r)) out.push(`overlap ${a.id}~${b.id} (${d.toFixed(0)} < ${Math.max(a.r, b.r)})`);
  }
  const core = st.find((s) => m.entities.some((e) => e.type === "sink.core" && "at" in e && e.at[0] === s.x && e.at[1] === s.y));
  if (core) {
    for (const s of st) {
      if (!s.key || s === core) continue;
      const d = Math.hypot(s.x - core.x, s.y - core.y);
      if (d > FILTER_PARAMS.screenRadius) out.push(`offscreen ${s.id} (${d.toFixed(0)} > ${FILTER_PARAMS.screenRadius})`);
    }
  }
  return out;
}

/** The rule replaced a 10-level window on modules, goal and template (outpost-ops#150): the whole pack, on the full signature.
 * History entries without a signature (planned requests, levels from before the rule) cannot match. */
function duplicateOf(ms: Measurement, history: readonly HistoryEntry[]): string | null {
  return sameAsEarlier(ms.manifest.id, varietySignature(ms.manifest, ms.template, ms.beats), history);
}

export function qualityFilters(ms: Measurement, c: Content): { filters: Filters; evidence: FilterEvidence } {
  const idle = idleModules(ms, c);
  const weakest = ms.runs[LADDER[LADDER.length - 1]!.name]!;
  let trivial: boolean;
  if (TIME_FIXED_GOALS.has(ms.manifest.goal.type)) {
    trivial = winRate(weakest) === 1 && meanMargin(weakest) >= FILTER_PARAMS.trivialWavesMargin;
  } else {
    const ticks = weakest.filter((r) => r.won).map((r) => r.goalTicks);
    trivial = winRate(weakest) === 1 && ticks.length > 0 && Math.max(...ticks) < FILTER_PARAMS.trivialBudgetShare * ms.budgetTicks;
  }
  const stallRuns: string[] = [];
  for (const [p, rs] of Object.entries(ms.runs)) for (const r of rs) if (r.stalls > 0) stallRuns.push(`${p}#${r.seed}@${r.stallStates[0]?.tick ?? 0}`);
  const unread = unreadable(ms.manifest, c);
  const dup = duplicateOf(ms, ms.history);
  const shape = PLAY_SHAPE.exempt.includes(ms.manifest.id) || ms.beats.length === 0 ? [] : playShapeFails(playShapeNumbers(ms.beats, ms.beatsEnd), ms.beatsEnd, PLAY_SHAPE);
  return {
    // Batch 3: a defend level always leaves something to build; a reference bot that bought the whole turret ladder ran out of it.
    filters: { idleModule: idle.length > 0, trivial, stall: stallRuns.length > 0, unreadable: unread.length > 0, duplicate: dup !== null,
      ladderSpent: ms.ladderLeft >= 0 && ms.ladderLeft < FILTER_PARAMS.ladderLeftMin, playShape: PLAY_SHAPE.enforce && shape.length > 0 },
    evidence: { idleModules: idle, unreadable: unread, stallRuns, duplicateOf: dup, playShape: shape },
  };
}
