import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, dist, mulDiv, within } from "../fixed.js";
import type { CaptureState, State } from "../state.js";
import { outsidePerimeter } from "./barriers.js";
import { pointInPoly, spawnDrops } from "./common.js";
import { safeRadius } from "./core.js";

const captureById = (st: State, id: number): CaptureState | undefined => st.captures.find((c) => c.id === id);

/** Drop one towed captive where it is: it goes back to idle (lassoable again) and counts as lost for this trip. */
export function dropTow(st: State, id: number, reason: "hit", out: SimEvent[]): void {
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
 * The tow line trails only while the player is outside the perimeter (barrier lines, or the heat circle when the level has none) with unrescued
 * containers left. Closing a loop captures every idle lassoable inside it; captives follow in a
 * chain and start releasing (recruits) or pay out (crates) once they enter the safe radius.
 *
 * Tow loss: a hostile hit drops the rearmost captive (defense.ts); standing still never does.
 * Pods with a freeze timer are lost when it runs out while idle or towed.
 */
export function stepLasso(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player, L = st.lasso;
  freezePods(st, out);
  pickUp(st, out);
  const remaining = st.captures.some((c) => c.state === "idle" && !c.pickup);
  L.engaged = remaining && p.tow.length < cp.lasso.maxTowed && outsidePerimeter(st, cp, p.pos);
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
          if (c.state !== "idle" || c.pickup || !pointInPoly(c.pos, poly)) continue;
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
    if (def.result === "item") {
      st.captures.splice(st.captures.indexOf(c), 1);
      out.push({ t: "crate_delivered", capture: c.id, at: { ...c.pos }, bundle: {}, item: true });
      continue;
    }
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
    out.push({ t: "pod_home", capture: c.id, at: { ...c.pos }, decoy: !!c.decoy });
  }
  // A trip ends when the tow empties; record the best haul, and the best one that lost nothing.
  if (p.tow.length === 0 && L.trip.delivered + L.trip.lost > 0) {
    st.stats.tripBest = Math.max(st.stats.tripBest, L.trip.delivered);
    if (L.trip.lost === 0) st.stats.tripBestClean = Math.max(st.stats.tripBestClean, L.trip.delivered);
    L.trip = { delivered: 0, lost: 0 };
  }
  L.towing = [...p.tow];
}

/** World units: how close the player walks to a pickup capture to take it. The kneel-and-lift clip stands about 12.9 back
 * (KNEEL_REACH in the renderer), so taking it from 12.9-15 makes the step-in at most a couple of units, with no slide back (outpost-ops#276). */
const PICKUP_R = 15 * FP;
/** Ticks a revealed pickup capture waits before it can be taken: the story's lines about it (about 3 s after the drop) come first. */
const PICKUP_WAIT = 100;

/**
 * A capture picked up by hand (manifest `pickup`, story level 5's helmet): idle and within PICKUP_R of the player,
 * it is taken at once, a loop and a delivery in one step (the same captured and delivered events).
 */
function pickUp(st: State, out: SimEvent[]): void {
  for (const c of [...st.captures]) {
    if (!c.pickup || c.hold || c.state !== "idle" || (c.takeAt !== undefined && st.tick < c.takeAt) || !within(c.pos, st.player.pos, PICKUP_R)) continue;
    st.captures.splice(st.captures.indexOf(c), 1);
    out.push({ t: "captured", capture: c.id, at: { ...c.pos } });
    out.push({ t: "crate_delivered", capture: c.id, at: { ...c.pos }, bundle: {}, item: true });
  }
}

/** After the objectives: a hidden capture whose objective is done appears, idle, where the manifest put it. */
export function revealCaptures(st: State, out: SimEvent[]): void {
  for (const c of st.captures) {
    if (c.state !== "hidden" || !st.objectives.some((o) => o.id === c.hiddenUntil && o.done)) continue;
    c.state = "idle";
    if (c.pickup) c.takeAt = st.tick + PICKUP_WAIT;
    delete c.hiddenUntil;
    out.push({ t: "capture_revealed", capture: c.id, at: { ...c.pos } });
  }
}

/** Pods with a freeze timer count down while idle or towed; at zero they are lost. */
function freezePods(st: State, out: SimEvent[]): void {
  for (const c of [...st.captures]) {
    if (c.freezeTicks <= 0 || c.state === "releasing" || c.state === "hidden") continue;
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
