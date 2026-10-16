import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { isqrt, type Vec } from "../fixed.js";
import type { ConveyorState, ConverterState, State } from "../state.js";
import { feedCoreWith } from "./core.js";

// Conveyors (R3 item 16): a belt a build pad lays between a source (a converter's pickup tray or
// the warehouse) and a target (a converter's hopper, the kiosk shelves, the reactor or the
// warehouse). It takes one unit every `everyTicks`, carries units along at `speed`, keeps `gap`
// between them and delivers by the same acceptance rules a worker uses; a full target backs the
// belt up rather than dropping goods. Endpoints are looked up by type each tick, like worker roles.

const converterOf = (st: State, type: string): ConverterState | null => st.converters.find((c) => c.type === type) ?? null;

/** Where the belt starts and ends this tick, or null while an endpoint is missing. */
export function beltEnds(st: State, b: Pick<ConveyorState, "from" | "to">): { a: Vec; b: Vec } | null {
  const from = b.from === "store.depot" ? st.depot?.pos ?? null : converterOf(st, b.from)?.pickupPos ?? null;
  const to = b.to === "store.depot" ? st.depot?.pos ?? null
    : b.to === "sink.sales_point" ? st.sales?.pos ?? null
      : b.to === "sink.core" ? st.core.pos
        : converterOf(st, b.to)?.pos ?? null;
  return from && to ? { a: from, b: to } : null;
}

/** Take one unit from the source, or null when it has none. */
function take(st: State, cp: Compiled, from: string): string | null {
  if (from === "store.depot") {
    const d = st.depot;
    const res = d ? Object.keys(d.stock).sort().find((r) => (d.stock[r] ?? 0) > 0) : undefined;
    if (!d || !res) return null;
    d.stock[res]!--;
    return res;
  }
  const cv = converterOf(st, from);
  if (!cv || cv.out <= 0) return null;
  cv.out--;
  return cp.converters[cv.type]!.output;
}

/** Hand one unit to the target if it accepts it now. */
function give(st: State, cp: Compiled, to: string, res: string, out: SimEvent[]): boolean {
  if (to === "sink.core") return feedCoreWith(st, cp, res, out);
  if (to === "store.depot") {
    if (!st.depot) return false;
    st.depot.stock[res] = (st.depot.stock[res] ?? 0) + 1;
    return true;
  }
  if (to === "sink.sales_point") {
    const s = st.sales;
    if (!s || !s.sells.includes(res) || (s.shelf[res] ?? 0) >= cp.sales.shelfCap) return false;
    s.shelf[res] = (s.shelf[res] ?? 0) + 1;
    return true;
  }
  const cv = converterOf(st, to);
  if (!cv) return false;
  const def = cp.converters[cv.type]!;
  if (!def.inputs.includes(res) || cv.inQ.length >= def.inCap) return false;
  cv.inQ.push(res);
  return true;
}

export function stepConveyors(st: State, cp: Compiled, out: SimEvent[]): void {
  const C = cp.conveyor;
  for (const belt of st.conveyors ?? []) {
    const ends = beltEnds(st, belt);
    if (!ends) continue;
    const dx = ends.b.x - ends.a.x, dy = ends.b.y - ends.a.y;
    const len = isqrt(dx * dx + dy * dy);
    // advance, front first: nobody passes the unit ahead, the front stops at the end
    belt.items.forEach((it, i) => {
      const limit = i === 0 ? len : belt.items[i - 1]!.d - C.gap;
      it.d = Math.max(it.d, Math.min(it.d + C.speed, limit));
    });
    const front = belt.items[0];
    if (front && front.d >= len && give(st, cp, belt.to, front.res, out)) {
      belt.items.shift();
      st.stats.conveyed = (st.stats.conveyed ?? 0) + 1;
      out.push({ t: "conveyed", belt: belt.id, res: front.res, at: { ...ends.b } });
    }
    // intake at the start once the last unit has cleared it
    if (belt.acc < C.everyTicks) belt.acc++;
    const last = belt.items[belt.items.length - 1];
    if (belt.acc >= C.everyTicks && belt.items.length < C.capacity && (!last || last.d >= C.gap)) {
      const res = take(st, cp, belt.from);
      if (res !== null) { belt.items.push({ res, d: 0 }); belt.acc = 0; }
    }
  }
}
