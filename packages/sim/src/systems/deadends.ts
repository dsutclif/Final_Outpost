import type { Compiled } from "../compile.js";
import type { ObjectiveState, State } from "../state.js";
import { padCost } from "./economy.js";

// R5 #21: goals that provably can't be reached any more. Only counted sources count as proof, and any
// source this can't count (a regrowing pile, a crate) means "not proven", so a live goal is never called dead.

const SCRAP = "res.salvage";
const worth = (cp: Compiled, hostile: string): number => cp.hostiles[hostile]?.drops[SCRAP] ?? 0;

/** Scrap still to be picked up on this level, or null when that can't be counted. */
export function scrapLeft(st: State, cp: Compiled): number | null {
  let n = st.drops.filter((d) => d.res === SCRAP).length;
  for (const node of st.nodes) {
    const def = cp.content.nodes[node.type];
    if (def?.yields !== SCRAP) continue;
    if (node.stock === null || def.regrow !== null) return null;
    n += node.stock;
  }
  for (const c of st.captures) if ((cp.lassoables[c.type] as { bundle?: Record<string, number> } | undefined)?.bundle?.[SCRAP]) return null;
  for (const a of Object.values(cp.animals)) if (a.drops[SCRAP]) return null;
  for (const h of st.hostiles) n += worth(cp, h.type);
  for (const p of st.waves?.pending ?? []) n += worth(cp, p.type);
  for (const w of cp.waves.slice(st.waves?.idx ?? 0)) for (const t of w.types) n += worth(cp, t);
  return n;
}

/** Scrap already picked up and not yet spent. */
function scrapHeld(st: State): number {
  let n = st.player.stack.filter((r) => r === SCRAP).length;
  for (const r of st.residents) if (r.carry === SCRAP) n++;
  n += st.depot?.stock[SCRAP] ?? 0;
  for (const b of st.conveyors ?? []) n += b.items.filter((i) => i.res === SCRAP).length;
  return n;
}

/** No open pad of this sort, or none the remaining scrap can pay for (the cheapest step is the lower bound). */
function padsOutOfReach(st: State, cp: Compiled, left: number, wanted: (e: Compiled["entityById"][string]) => boolean): boolean {
  let cheapest: number | null = null;
  for (const pad of st.pads) {
    if (pad.done) continue;
    const e = cp.entityById[pad.id];
    if (!e || (e.type !== "pad.build" && e.type !== "pad.hire") || !wanted(e)) continue;
    const scrap = padCost(st, cp, e)[SCRAP];
    if (scrap === undefined) return false;
    const owed = scrap - (pad.paid[SCRAP] ?? 0);
    if (cheapest === null || owed < cheapest) cheapest = owed;
  }
  return cheapest === null || left + scrapHeld(st) < cheapest;
}

/** True when this objective can no longer be reached. Only turret level, hire and scrap goals are ever proven dead. */
export function objectiveDead(st: State, cp: Compiled, kind: string, p: Record<string, number | string>, o: ObjectiveState): boolean {
  if (o.done || o.failed || (kind !== "turret_level" && kind !== "hire" && kind !== "salvage")) return false;
  const left = scrapLeft(st, cp);
  if (left === null) return false;
  if (kind === "salvage") return st.stats.salvage + left < Number(p["n"] ?? 0);
  if (kind === "hire") {
    const role = p["role"];
    return padsOutOfReach(st, cp, left, (e) => e.type === "pad.hire" && (role === undefined || (e as { role?: { role?: string } }).role?.role === role));
  }
  return padsOutOfReach(st, cp, left, (e) => e.type === "pad.build" && !!cp.structures[String((e as { build?: string }).build).replace(/\.t\d+$/, "")]?.tiers);
}

/** The main goal can't be reached any more. The player chooses what happens next, so this is asked by the client, never acted on here. */
export function mainGoalDead(st: State, cp: Compiled): boolean {
  const main = st.objectives[0], def = cp.objectives[0];
  return !!main && !!def && !st.over && objectiveDead(st, cp, def.kind, def.params, main);
}
