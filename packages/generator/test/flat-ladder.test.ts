import { describe, expect, it } from "vitest";
import { GEN, flatLadder } from "../src/index.js";

const spread = GEN.search.flatLadderSpread;
describe("flat-ladder guard (stuck-fixes)", () => {
  it("every rung wins at the same margin: the ladder measures nothing", () => {
    expect(flatLadder({ good: 1, average: 1, weak: 1, novice: 1, floor: 1 }, { good: 1, average: 1, weak: 1, novice: 1, floor: 1 }, spread)).toBe(true);
  });
  it("a rung that loses a run, or a margin spread, is a real ladder", () => {
    expect(flatLadder({ good: 1, average: 1, weak: 1, novice: 1, floor: 0.67 }, { good: 0.6, average: 0.6, weak: 0.6, novice: 0.6, floor: 0.5 }, spread)).toBe(false);
    expect(flatLadder({ good: 1, average: 1, weak: 1, novice: 1, floor: 1 }, { good: 0.7, average: 0.6, weak: 0.5, novice: 0.4, floor: 0.3 }, spread)).toBe(false);
  });
});
