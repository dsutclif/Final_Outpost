import { TPS } from "../../packages/sim/src/index.js";
import { round } from "./lib.js";

// Arrow audit (outpost-ops#346): does the guide arrow point at the thing the goal names, and when does it start?
// The walker (guide-walk.ts) records goals and where the arrow rests; this file judges the record. Warnings only for now.

export interface GoalRec { id: string; kind: string; target: string; doneTick: number }
/** One change of the arrow's target: what the nearest entity to the arrow's point is. */
export interface ArrowChange { tick: number; key: string; entityId: string; entityType: string }
export interface ArrowRecord { levelId: string; ticks: number; goals: GoalRec[]; arrows: ArrowChange[] }
export interface ArrowWarning { level: string; rule: "arrow-wrong-target" | "arrow-early" | "arrow-late" | "arrow-missing"; goal: string; message: string }

/** Entity types a goal's arrow may sit on (ore, the reactor and the kiosk excepted: any goal may need those on the way). */
const GOAL_TARGET: Record<string, (type: string, id: string, goalTarget: string) => boolean> = {
  build: (t, id, g) => t === "pad.build" && (g === "" || id === g),
  unlock: (t) => t === "pad.build",
  hire: (t) => t === "pad.hire",
  crates: (t) => t.startsWith("capture."),
  rescue: (t) => t.startsWith("capture."),
  rescue_all: (t) => t.startsWith("capture."),
  tow_trip: (t) => t.startsWith("capture."),
  admit: (t) => t === "struct.gate",
  clear_zones: (t) => t === "pad.build" || t.startsWith("zone."),
  sales_opened: (t) => t === "sink.sales_point" || t === "pad.build",
  earn: (t) => t === "sink.sales_point" || t.startsWith("node.") || t === "pad.hire",
  sell: (t) => t === "sink.sales_point" || t.startsWith("node.") || t.startsWith("conv."),
};
/** Goals that tell the player to follow or walk to something: the arrow must show soon after they start. */
const FOLLOWS = new Set(["build", "unlock", "hire", "crates", "rescue", "admit", "clear_zones", "sales_opened"]);
const ALWAYS_OK = (t: string): boolean => t.startsWith("node.") || t === "sink.core" || t.startsWith("store.") || t === "sink.sales_point";

/**
 * Goals activate in order: goal k starts when goal k-1 is done (the first when the level starts).
 *  wrong-target: while a goal is active, an arrow rests for `wrongS` on an entity that goal does not name
 *  early: the arrow already points at the named pad before the goal is active
 *  late / missing: no arrow on the named entity within `lateS` after a follow or walk goal activates
 */
export function auditArrows(r: ArrowRecord, lateS = 10, wrongS = 5): ArrowWarning[] {
  const out: ArrowWarning[] = [];
  const goals = r.goals.filter((g) => g.id !== "main");
  const ok = (g: GoalRec, type: string, id: string): boolean => GOAL_TARGET[g.kind]?.(type, id, g.target) === true;
  const held = r.arrows.map((a, k) => ({ a, from: a.tick, to: r.arrows[k + 1]?.tick ?? r.ticks })).filter((h) => h.a.key !== "none");
  goals.forEach((g, i) => {
    if (!GOAL_TARGET[g.kind]) return;
    const from = i === 0 ? 0 : goals[i - 1]!.doneTick;
    if (from < 0) return; // an earlier goal never finished: this one never activated
    const to = g.doneTick >= 0 ? g.doneTick : r.ticks;
    for (const h of held) {
      const s = Math.min(h.to, to) - Math.max(h.from, from);
      if (s >= wrongS * TPS && !ok(g, h.a.entityType, h.a.entityId) && !ALWAYS_OK(h.a.entityType)) {
        out.push({ level: r.levelId, rule: "arrow-wrong-target", goal: g.id, message: `goal "${g.id}" (${g.kind}) is active but the arrow rests on ${h.a.entityId} (${h.a.entityType}) for ${round(s / TPS, 0)} s` });
        break;
      }
    }
    if (g.kind === "build" && g.target) {
      const early = held.find((h) => h.a.entityId === g.target && h.from < from - TPS);
      if (early) out.push({ level: r.levelId, rule: "arrow-early", goal: g.id, message: `arrow points at ${g.target} at ${round(early.from / TPS, 0)} s, before goal "${g.id}" is active (${round(from / TPS, 0)} s)` });
    }
    if (FOLLOWS.has(g.kind) && to > from) {
      const first = held.find((h) => h.to > from && h.from < to && ok(g, h.a.entityType, h.a.entityId));
      if (!first) out.push({ level: r.levelId, rule: "arrow-missing", goal: g.id, message: `goal "${g.id}" (${g.kind}) never gets an arrow on what it names` });
      else if ((Math.max(first.from, from) - from) / TPS > lateS) out.push({ level: r.levelId, rule: "arrow-late", goal: g.id, message: `arrow for goal "${g.id}" starts ${round((Math.max(first.from, from) - from) / TPS, 0)} s after it activates (limit ${lateS} s)` });
    }
  });
  return out;
}
