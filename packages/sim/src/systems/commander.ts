import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { within } from "../fixed.js";
import type { State } from "../state.js";
import { endLevel } from "./common.js";

/**
 * Commander knock-down rules (backlog #167). Opt-in per level with the param `player.commanderRules` = 1; cp.player.mode:
 *  - "legacy" (param 0, the default; every pack and golden level): hp 0 = a ~2 s knock-down (player.downSeconds), the pack spills, hp refills.
 *  - "self": no med bay, no medic. He heals himself once out of the fight; hp 0 fails the level; the pack does not spill.
 *  - "bay": a med bay, no medic. Only the med bay heals him (to full); hp 0 fails the level; no spill.
 *  - "medic": a medic. No self-heal; at downPct of his health he is knocked down (the pack spills), lies
 *    player.knockSeconds until a medic heals him to full, else the level fails.
 */
export const isDown = (st: State): boolean => st.player.down !== undefined;

/** Ticks a downed commander has left before the level is lost (null when he is up): the HUD pill. */
export const commanderDownLeft = (st: State, cp: Compiled): number | null =>
  st.player.down === undefined ? null : st.player.healT !== undefined ? cp.player.knockTicks - Math.min(st.player.down, cp.player.knockTicks) : Math.max(0, cp.player.knockTicks - st.player.down);

/** Has the fall finished, so a medic may start healing him? */
export const commanderHealable = (st: State, cp: Compiled): boolean =>
  st.player.down !== undefined && st.player.healT === undefined && st.player.down >= cp.guards.fallTicks;

/**
 * After the commander loses hp: "ok" (carry on), "down" (knocked down: the caller spills the pack and drops the tow)
 * or "dead" (the level is lost, nothing spills).
 */
export function afterHpLoss(st: State, cp: Compiled, out: SimEvent[]): "ok" | "down" | "dead" {
  const p = st.player, K = cp.player;
  if (p.down !== undefined) return "ok";
  if (K.mode === "legacy") {
    if (p.hp > 0) return "ok";
    p.hp = K.hp; p.stun = K.downTicks; p.stunSlow = 0;
    out.push({ t: "downed", at: { ...p.pos } });
    return "down";
  }
  if (K.mode === "medic") {
    if (p.hp * 100 > K.downPct * K.hp) return "ok";
    p.down = 0; p.stun = 0; p.stunSlow = 0; p.bayT = 0;
    delete p.healT;
    out.push({ t: "downed", at: { ...p.pos } });
    return "down";
  }
  if (p.hp > 0) return "ok";
  endLevel(st, out, false, "commander_down");
  return "dead";
}

/** Per tick: the downed commander's clock, a medic's patch-up, and a med bay healing one who stands at it. */
export function stepCommander(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player, K = cp.player;
  if (p.down !== undefined) {
    if (p.healT !== undefined) {
      p.healT--;
      if (p.healT <= 0) { p.hp = K.hp; delete p.down; delete p.healT; p.healCd = 0; }
      return;
    }
    p.down++;
    if (p.down >= K.knockTicks) endLevel(st, out, false, "commander_down");
    return;
  }
  // a med bay heals a commander who stands at its heal spot, to full
  const bay = K.mode === "self" || K.mode === "legacy" ? undefined : st.structures.find((s) => s.type === "struct.medical");
  if (bay && p.hp < K.hp) {
    const def = cp.structures[bay.type]!;
    const spot = { x: bay.pos.x + def.healOffset.x, y: bay.pos.y + def.healOffset.y };
    if (within(p.pos, spot, cp.guards.reviveRange)) {
      p.bayT = (p.bayT ?? 0) + 1;
      if (p.bayT >= Math.max(1, def.healTicks)) { p.hp = K.hp; p.bayT = 0; }
    } else p.bayT = 0;
  }
}
