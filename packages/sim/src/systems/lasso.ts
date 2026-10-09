import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { dist, mulDiv, within } from "../fixed.js";
import type { CaptureState, State } from "../state.js";
import { outsideLines } from "./barriers.js";
import { pointInPoly } from "./common.js";
import { safeRadius } from "./core.js";

const captureById = (st: State, id: number): CaptureState | undefined => st.captures.find((c) => c.id === id);

/**
 * The tow line trails only while the player is outside the barrier lines with unrescued
 * containers left. Closing a loop captures every idle lassoable inside it; captives follow in a
 * chain and start releasing once they enter the safe radius.
 */
export function stepLasso(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player, L = st.lasso;
  const remaining = st.captures.some((c) => c.state === "idle");
  L.engaged = remaining && p.tow.length < cp.lasso.maxTowed && outsideLines(st, p.pos);
  if (!L.engaged) L.trail = [];
  else {
    const last = L.trail[L.trail.length - 1];
    if (!last || !within(last, p.pos, cp.lasso.pointSpacing)) {
      L.trail.push({ ...p.pos });
      if (L.trail.length > cp.lasso.trailMax) L.trail.shift();
      for (let i = 0; i < L.trail.length - cp.lasso.minLoopPoints; i++) {
        if (!within(L.trail[i]!, p.pos, cp.lasso.closeDist)) continue;
        const poly = L.trail.slice(i);
        let room = cp.lasso.maxTowed - p.tow.length;
        for (const c of st.captures) {
          if (room <= 0) break;
          if (c.state !== "idle" || !pointInPoly(c.pos, poly)) continue;
          c.state = "towed";
          p.tow.push(c.id);
          room--;
          out.push({ t: "captured", capture: c.id, at: { ...c.pos } });
        }
        L.trail = [];
        break;
      }
    }
  }
  // Captives follow the one ahead at a fixed spacing.
  let lead = p.pos;
  for (const id of p.tow) {
    const c = captureById(st, id)!;
    const spacing = cp.lassoables[c.type]!.towSpacing;
    const d = dist(c.pos, lead);
    if (d > spacing) {
      c.pos.x += mulDiv(lead.x - c.pos.x, d - spacing, d);
      c.pos.y += mulDiv(lead.y - c.pos.y, d - spacing, d);
    }
    lead = c.pos;
  }
  const R = safeRadius(st, cp);
  for (const id of [...p.tow]) {
    const c = captureById(st, id)!;
    if (!within(c.pos, st.core.pos, R)) continue;
    p.tow.splice(p.tow.indexOf(id), 1);
    c.state = "releasing";
    c.timer = cp.lassoables[c.type]!.releaseTicks;
  }
  L.towing = [...p.tow];
}
