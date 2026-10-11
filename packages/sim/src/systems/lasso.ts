import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { dist, mulDiv, within } from "../fixed.js";
import type { CaptureState, State } from "../state.js";
import { outsideLines } from "./barriers.js";
import { pointInPoly, spawnDrops } from "./common.js";
import { safeRadius } from "./core.js";

const captureById = (st: State, id: number): CaptureState | undefined => st.captures.find((c) => c.id === id);

/** Drop one towed captive where it is: it goes back to idle (lassoable again) and counts as lost for this trip. */
export function dropTow(st: State, id: number, reason: "hit" | "slack", out: SimEvent[]): void {
  const p = st.player, c = captureById(st, id);
  const i = p.tow.indexOf(id);
  if (!c || i < 0) return;
  p.tow.splice(i, 1);
  c.state = "idle";
  st.lasso.trip.lost++;
  st.lasso.towing = [...p.tow];
  out.push({ t: "tow_dropped", capture: id, at: { ...c.pos }, reason });
}

/**
 * The tow line trails only while the player is outside the barrier lines with unrescued
 * containers left. Closing a loop captures every idle lassoable inside it; captives follow in a
 * chain and start releasing (recruits) or pay out (crates) once they enter the safe radius.
 *
 * Tow loss (0.5.0): a hostile hit drops the rearmost captive (defense.ts); standing still for
 * `lasso.slackTime` while towing outside the safe radius lets the line go slack and drops every
 * captive in place. Pods with a freeze timer are lost when it runs out while idle or towed.
 */
export function stepLasso(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player, L = st.lasso;
  freezePods(st, out);
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
    L.trip.delivered++;
    const def = cp.lassoables[c.type]!;
    if (def.result === "bundle") {
      // A supply crate pays on arrival: coins into hand, goods as drops to walk over.
      const items: Record<string, number> = {};
      for (const [res, n] of Object.entries(def.bundle)) {
        if (cp.resources[res]?.cap === null) st.currency += n;
        else items[res] = n;
      }
      spawnDrops(st, cp, items, c.pos, out);
      st.captures.splice(st.captures.indexOf(c), 1);
      out.push({ t: "crate_delivered", capture: c.id, at: { ...c.pos }, bundle: { ...def.bundle } });
      continue;
    }
    c.state = "releasing";
    c.timer = def.releaseTicks;
  }
  // Slack: standing still with a tow outside the heat drops the whole chain.
  if (p.tow.length > 0 && !p.moving && !within(p.pos, st.core.pos, R) && cp.lasso.slackTicks > 0) {
    L.slack++;
    if (L.slack >= cp.lasso.slackTicks) for (const id of [...p.tow].reverse()) dropTow(st, id, "slack", out);
  }
  if (p.tow.length === 0 || p.moving) L.slack = 0;
  // A trip ends when the tow empties; record the best haul, and the best one that lost nothing.
  if (p.tow.length === 0 && L.trip.delivered + L.trip.lost > 0) {
    st.stats.tripBest = Math.max(st.stats.tripBest, L.trip.delivered);
    if (L.trip.lost === 0) st.stats.tripBestClean = Math.max(st.stats.tripBestClean, L.trip.delivered);
    L.trip = { delivered: 0, lost: 0 };
  }
  L.towing = [...p.tow];
}

/** Pods with a freeze timer count down while idle or towed; at zero they are lost. */
function freezePods(st: State, out: SimEvent[]): void {
  for (const c of [...st.captures]) {
    if (c.freezeTicks <= 0 || c.state === "releasing") continue;
    c.freezeTicks--;
    if (c.freezeTicks > 0) continue;
    if (c.state === "towed") {
      st.player.tow.splice(st.player.tow.indexOf(c.id), 1);
      st.lasso.trip.lost++;
    }
    st.captures.splice(st.captures.indexOf(c), 1);
    out.push({ t: "pod_lost", capture: c.id, at: { ...c.pos } });
  }
}
