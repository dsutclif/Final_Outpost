import { describe, expect, it } from "vitest";
import { earlyStopCheck, type StopEntry } from "../src/early-stop.js";

const e = (p: number, D: number | undefined, firstReject: string | null): StopEntry => ({ p, D, firstReject });

describe("earlyStopCheck", () => {
  it("waits for the minimum number of candidates", () => {
    expect(earlyStopCheck([e(0.9, 0.3, "offTarget"), e(0.95, 0.31, "offTarget"), e(0.97, 0.3, "offTarget")], 0.8)).toBeNull();
  });
  it("(a) stops when the target is above Dmax and p is at its upper limit", () => {
    const v = earlyStopCheck([e(0.5, 0.2, "offTarget"), e(0.75, 0.28, "offTarget"), e(0.88, 0.3, "offTarget"), e(0.94, 0.31, "offTarget")], 0.8);
    expect(v?.rule).toBe("unreachable");
    expect(v?.Dmax).toBe(0.31);
  });
  it("(a) does not stop while p has room to move", () => {
    expect(earlyStopCheck([e(0.2, 0.2, "offTarget"), e(0.3, 0.22, "offTarget"), e(0.4, 0.25, "offTarget"), e(0.5, 0.3, "offTarget")], 0.8)).toBeNull();
  });
  it("(a) stops below Dmin with p at its lower limit", () => {
    const v = earlyStopCheck([e(0.5, 0.8, "offTarget"), e(0.25, 0.7, "offTarget"), e(0.12, 0.65, "offTarget"), e(0.06, 0.62, "offTarget")], 0.2);
    expect(v?.rule).toBe("unreachable");
  });
  it("(a) tolerates a target within tolerance of the reached range", () => {
    expect(earlyStopCheck([e(0.5, 0.2, "x"), e(0.75, 0.28, "x"), e(0.88, 0.3, "x"), e(0.94, 0.31, "x")], 0.34)).toBeNull();
  });
  it("(b) stops when one non-difficulty reject dominates with D in band", () => {
    const v = earlyStopCheck([e(0.5, 0.48, "objectives"), e(0.55, 0.5, "objectives"), e(0.52, 0.51, "objectives"), e(0.53, 0.5, "offTarget")], 0.5);
    expect(v?.rule).toBe("dominant_reject");
    expect(v?.kind).toBe("objectives");
    expect(v?.share).toBe(0.75);
  });
  it("(b) needs D within 0.07 of target", () => {
    expect(earlyStopCheck([e(0.5, 0.2, "objectives"), e(0.5, 0.2, "objectives"), e(0.5, 0.2, "objectives"), e(0.5, 0.2, "objectives")], 0.4)).toBeNull();
  });
  it("(b) ignores offTarget and below-75% dominance", () => {
    expect(earlyStopCheck([e(0.5, 0.5, "offTarget"), e(0.5, 0.5, "offTarget"), e(0.5, 0.5, "offTarget"), e(0.5, 0.5, "offTarget")], 0.5)).toBeNull();
    expect(earlyStopCheck([e(0.5, 0.5, "layout"), e(0.5, 0.5, "layout"), e(0.5, 0.5, "offTarget"), e(0.5, 0.5, null)], 0.5)).toBeNull();
  });
});
