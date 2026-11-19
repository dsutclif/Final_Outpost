import { describe, expect, it } from "vitest";
import { earlyStopCheck, type StopEntry } from "../src/early-stop.js";

const e = (p: number, D: number | undefined, firstReject: string | null): StopEntry => ({ p, D, firstReject });

describe("earlyStopCheck", () => {
  it("waits for the minimum number of candidates", () => {
    expect(earlyStopCheck([e(0.5, 0.5, "objectives"), e(0.5, 0.5, "objectives"), e(0.5, 0.5, "objectives")], 0.5)).toBeNull();
  });
  // ramp: p climbs 0.1..1, D rises then goes flat; ramp(n, Ds) builds n entries, p linear to pEnd
  const seq = (ds: number[], p0: number, p1: number, fr = "offTarget"): StopEntry[] => ds.map((d, i) => e(p0 + ((p1 - p0) * i) / Math.max(1, ds.length - 1), d, fr));
  const flat12 = [0.2, 0.26, 0.29, 0.3, 0.3, 0.31, 0.3, 0.31, 0.3, 0.31, 0.3, 0.31];
  const flat20 = [...flat12, ...flat12.slice(4), ...flat12.slice(4)].slice(0, 20);
  it("(a) stops when D is flat, below target, p at its upper limit, after 20+ candidates", () => {
    const v = earlyStopCheck(seq(flat20, 0.3, 0.95), 0.8);
    expect(v?.rule).toBe("unreachable");
    expect(v?.Dmax).toBe(0.31);
    expect(v?.candidates).toBe(20);
  });
  it("(a) does not stop before 20 candidates even if flat and p at limit", () => {
    expect(earlyStopCheck(seq(flat20.slice(0, 19), 0.3, 0.95), 0.8)).toBeNull();
  });
  it("(a) does not stop while D still moves (last 4 span >= 0.03)", () => {
    expect(earlyStopCheck(seq([0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.42], 0.3, 0.95), 0.8)).toBeNull();
  });
  it("(a) L8-shaped: slow early D then reaches the target is never stopped", () => {
    // 5 flat-ish candidates, then 36 more that creep up and arrive; check every prefix
    const ds = [0.05, 0.06, 0.06, 0.07, 0.07, ...Array.from({ length: 36 }, (_, i) => 0.08 + i * 0.012)];
    const target = ds[ds.length - 1]!;
    for (let k = 4; k <= ds.length; k++) {
      const part = seq(ds.slice(0, k), 0.2, 0.95).map((x, i) => ({ ...x, p: Math.min(0.95, 0.2 + i * 0.02) }));
      expect(earlyStopCheck(part, target), "prefix " + k).toBeNull();
    }
  });
  it("(a) L7-shaped: D flat inside each seed but rising across seeds is not stopped", () => {
    const ds = [...Array(10).fill(0.057), ...Array(10).fill(0.082)];
    expect(earlyStopCheck(seq(ds, 0.13, 1), 0.183)).toBeNull();
  });
  it("(a) stops below Dmin with p at its lower limit when flat", () => {
    const v = earlyStopCheck(seq([0.8, 0.7, 0.66, 0.65, 0.65, 0.64, 0.65, 0.64, 0.65, 0.64, 0.65, 0.64, ...Array(8).fill(0.64)], 0.5, 0.05), 0.2);
    expect(v?.rule).toBe("unreachable");
  });
  it("(a) does not stop while p has room to move", () => {
    expect(earlyStopCheck(seq(flat20, 0.2, 0.5), 0.8)).toBeNull();
  });
  it("(a) tolerates a target within tolerance of the reached range", () => {
    expect(earlyStopCheck(seq(flat20, 0.3, 0.95), 0.34)).toBeNull();
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
