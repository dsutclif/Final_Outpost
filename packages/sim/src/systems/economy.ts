import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { mulDiv, within } from "../fixed.js";
import type { State } from "../state.js";

// The economy rules from docs/ECONOMY-PLAN.md (Doug's answers):
// - Manual first: a hire pad flagged `manual` stays hidden until the player has done that kind of job
//   by hand once (the first greenhouse is worked before its collector can be hired; later ones are not
//   gated). Jobs are read from the player's own events each tick.
// - Automation tax: every worker hired, belt laid or upgrade bought this level raises the price of the
//   next by `pads.automationGrowth`; building machines does not count.

type HireEnt = Extract<Compiled["entityById"][string], { type: "pad.hire" }>;
type PadEnt = Extract<Compiled["entityById"][string], { type: "pad.hire" | "pad.build" }>;

/** The job a hire pad's worker does, as the player would do it by hand; null when the player can't. */
export function jobOf(cp: Compiled, e: HireEnt): string | null {
  const r = e.role, behavior = cp.roles[r.role]?.behavior;
  switch (behavior) {
    case "gather_deliver": case "collect_deliver": return r.from && r.to ? `carry:${r.from}>${r.to}` : null;
    case "stand_at": return r.to?.startsWith("conv.") ? `operate:${r.to}` : "clerk";
    case "hunt": return "hunt";
    case "guard": return "guard";
    default: return null; // couriers move warehouse stock, which the player never takes back out
  }
}

/** Has the player done this job by hand? */
export const jobDone = (st: State, job: string): boolean => !!st.manual?.done.includes(job);

/** Workers, belts and upgrades are automation; machines, buildings, unlocks and clearings are not. */
export function isAutomation(cp: Compiled, e: PadEnt): boolean {
  if (e.type === "pad.hire") return true;
  const b = e.build;
  return b === "struct.conveyor" || b === "conv.level" || b === "sink.core.level" || !!cp.upgrades[b];
}

/** What a pad costs now: its base cost, raised by the automation tax for automation pads. */
export function padCost(st: State, cp: Compiled, e: PadEnt): Record<string, number> {
  const n = isAutomation(cp, e) ? st.automation ?? 0 : 0;
  if (n === 0 || cp.pads.automationGrowthPm <= 1000) return e.cost;
  const out: Record<string, number> = {};
  for (const [res, base] of Object.entries(e.cost)) {
    let v = base * 1000;
    for (let i = 0; i < n; i++) v = mulDiv(v, cp.pads.automationGrowthPm, 1000);
    out[res] = Math.ceil(v / 1000);
  }
  return out;
}

/** Record jobs the player did by hand this tick (events without `by` are the player's). */
export function stepManual(st: State, cp: Compiled, out: readonly SimEvent[]): void {
  if (!cp.manualJobs) return;
  const m = (st.manual ??= { src: {}, done: [] });
  const mark = (job: string) => { if (!m.done.includes(job)) m.done.push(job); };
  const p = st.player.pos;
  for (const e of out) {
    switch (e.t) {
      case "gathered": if (e.by === undefined) { const n = st.nodes[e.node]; if (n) m.src[e.res] = n.type; } break;
      case "picked": if (e.by === undefined) {
        const cv = st.converters.find((c) => c.pickupPos.x === e.at.x && c.pickupPos.y === e.at.y);
        if (cv) m.src[e.res] = cv.type;
      } break;
      case "deposited": if (e.by === undefined && m.src[e.res]) mark(`carry:${m.src[e.res]}>${e.to}`); break;
      case "converted": {
        const cv = st.converters.find((c) => c.id === e.conv);
        if (cv && within(p, cv.operatorPos, cp.convParams.playerOperateRange)) mark(`operate:${cv.type}`);
        break;
      }
      case "sold": if (st.sales && within(p, st.sales.register, cp.sales.registerRange)) mark("clerk"); break;
      case "died":
        if (within(p, e.at, cp.player.rangedRange)) {
          if (e.kind.startsWith("node.prey") || e.kind.startsWith("unit.prey")) mark("hunt");
          else if (e.kind.startsWith("hostile.")) mark("guard");
        }
        break;
    }
  }
}
