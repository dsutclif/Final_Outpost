import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import type { State } from "../state.js";
import { hint } from "./common.js";

/** Hazard events run through warning → active → none on the manifest's schedule. */
export function stepHazard(st: State, cp: Compiled, out: SimEvent[]): void {
  const h = st.hazard;
  const ev = cp.events[h.idx];
  // hazardsFromLit: the schedule counts from the lighting, and an unlit core has no schedule yet.
  const shift = cp.manifest.hazardsFromLit ? st.stats.litTick : 0;
  if (shift === undefined) return;
  if (h.phase === "none") {
    if (!ev || st.tick < ev.warnTick + shift) return;
    h.phase = "warning";
    h.until = ev.startTick + shift;
    out.push({ t: "hazard_warning", start: ev.startTick + shift });
    hint(st, out, "hazard_warning");
  }
  if (h.phase === "warning" && ev && st.tick >= ev.startTick + shift) {
    h.phase = "active";
    h.until = ev.endTick + shift;
    out.push({ t: "hazard_start", end: ev.endTick + shift });
  }
  if (h.phase === "active" && ev && st.tick >= ev.endTick + shift) {
    h.phase = "none";
    h.until = 0;
    h.idx++;
    out.push({ t: "hazard_end" });
  }
}
