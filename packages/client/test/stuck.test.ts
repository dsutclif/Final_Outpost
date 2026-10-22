import { TPS, type State } from "@fo/sim";
import { describe, expect, it } from "vitest";
import { STUCK_SECONDS, StuckTimer } from "../src/guide.js";

// The helper arrow shows after STUCK_SECONDS with no progress toward the goals (backlog R4 item 9).

const st = (tick: number, progress: number, pads = 0, done = false): State =>
  ({ tick, objectives: [{ id: "main", kind: "produce", progress, target: 5, done, failed: false, doneTick: -1 }], pads: Array.from({ length: pads }, () => ({ done: true })) }) as unknown as State;

describe("StuckTimer", () => {
  const T = STUCK_SECONDS * TPS;
  it("turns on after the stretch with no progress, however long play runs", () => {
    const t = new StuckTimer();
    expect(t.stuck(st(0, 0))).toBe(false);
    expect(t.stuck(st(T - 1, 0))).toBe(false);
    expect(t.stuck(st(T, 0))).toBe(true);
  });
  it("resets on a new best, a finished pad or a done objective, not on a dip and recovery", () => {
    const t = new StuckTimer();
    t.stuck(st(0, 2));
    expect(t.stuck(st(T, 3))).toBe(false);
    expect(t.stuck(st(2 * T, 1))).toBe(true);
    expect(t.stuck(st(2 * T + 1, 3))).toBe(true);
    expect(t.stuck(st(2 * T + 2, 3, 1))).toBe(false);
    expect(t.stuck(st(3 * T + 2, 3, 1))).toBe(true);
    expect(t.stuck(st(3 * T + 3, 3, 1, true))).toBe(false);
  });
});
