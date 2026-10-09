import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import type { State } from "../state.js";
import { hint } from "./common.js";

/** Hazard events run through warning → active → none on the manifest's schedule. */
export function stepHazard(st: State, cp: Compiled, out: SimEvent[]): void {
  const h = st.hazard;
  const ev = cp.events[h.idx];
  if (h.phase === "none") {
    if (!ev || st.tick < ev.warnTick) return;
    h.phase = "warning";
    h.until = ev.startTick;
    out.push({ t: "hazard_warning", start: ev.startTick });
    hint(st, out, "hazard_warning");
  }
  if (h.phase === "warning" && ev && st.tick >= ev.startTick) {
    h.phase = "active";
    h.until = ev.endTick;
    out.push({ t: "hazard_start", end: ev.endTick });
  }
  if (h.phase === "active" && ev && st.tick >= ev.endTick) {
    h.phase = "none";
    h.until = 0;
    h.idx++;
    out.push({ t: "hazard_end" });
  }
}
