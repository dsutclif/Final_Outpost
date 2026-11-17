import { describe, expect, it } from "vitest";
import type { TraceStep, WfBuilding, WfInput } from "../src/wavefront.js";
import { reviewTrace } from "../src/wavefrontReview.js";

const b = (id: string, appear: number): WfBuilding => ({ id, kind: "sink.core", footprint: [-10, -10, 10, 10], occ: null, appear, pads: [] });
const input: WfInput = { buildings: [b("A", 0), b("B", 1)], map: { w: 1000, h: 1000 } };
const head: TraceStep[] = [
  { t: "wave", n: 0, ids: ["A"], front: 0 }, { t: "place", id: "A", at: [100, 100], spot: 0, checked: true, fallback: false, tried: 1 }, { t: "lock", n: 0 },
  { t: "wave", n: 1, ids: ["B"], front: 10 }, { t: "place", id: "B", at: [200, 200], spot: 0, checked: true, fallback: false, tried: 1 },
];
const review = (trace: TraceStep[], positions: Record<string, [number, number]>) => reviewTrace(input, { trace, positions, hidden: [], rejected: null });

describe("wavefront trace review (synthetic)", () => {
  it("accepts a clean trace with a legal repair", () => {
    const t: TraceStep[] = [...head, { t: "hidden", pad: "p", by: ["B"] },
      { t: "move", id: "B", dir: "south", d: 6, to: [200, 206] }, { t: "move", id: "B", dir: "south-east", d: 6, to: [200 + 6 * Math.SQRT1_2, 200 + 6 * Math.SQRT1_2] },
      { t: "fixed", pad: "p", spot: 0, pushed: "B", d: 6, dir: "south-east" }];
    const r = review(t, { A: [100, 100], B: [200 + 6 * Math.SQRT1_2, 200 + 6 * Math.SQRT1_2] });
    expect(r.rules).toEqual([]);
  });
  it("catches a locked building that moves", () => {
    const t: TraceStep[] = [...head, { t: "hidden", pad: "p", by: ["A"] }, { t: "move", id: "A", dir: "south", d: 6, to: [100, 106] }, { t: "fixed", pad: "p", spot: 0, pushed: "A", d: 6, dir: "south" }];
    const r = review(t, { A: [100, 106], B: [200, 200] });
    expect(r.rules.some((x) => x.includes("locked"))).toBe(true);
  });
  it("catches directions out of order and a skipped distance", () => {
    const m = (dir: string, d: number, to: [number, number]): TraceStep => ({ t: "move", id: "B", dir, d, to });
    const east = review([...head, { t: "hidden", pad: "p", by: ["B"] }, m("east", 6, [206, 200])], { A: [100, 100], B: [206, 200] });
    expect(east.rules.some((x) => x.includes("expects 6 south"))).toBe(true);
    const skip = review([...head, { t: "hidden", pad: "p", by: ["B"] }, m("south", 6, [200, 206]), m("south", 12, [200, 212])], { A: [100, 100], B: [200, 212] });
    expect(skip.rules.some((x) => x.includes("expects 6 south-east"))).toBe(true);
    const odd = review([...head, { t: "hidden", pad: "p", by: ["B"] }, m("south", 7, [200, 207])], { A: [100, 100], B: [200, 207] });
    expect(odd.rules.some((x) => x.includes("multiple of 6"))).toBe(true);
  });
  it("reports unresolved pads, hidden pads and a rejected seed as pad problems", () => {
    const r = reviewTrace(input, { trace: [...head, { t: "unresolved", pad: "p", why: "x" }], positions: { A: [100, 100], B: [200, 200] }, hidden: ["p"], rejected: null });
    expect(r.pads.length).toBe(2);
    expect(r.rules).toEqual([]);
  });
});
