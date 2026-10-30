import { describe, expect, it } from "vitest";
import { startPressure } from "../packages/generator/src/index.js";
import { startTable } from "./start-table.js";

const row = (p: number, D: number, engine = "1") => ({ goalType: "earn", p, engine, rating: { D } });

describe("start table", () => {
  it("keeps the median per pressure bin, for this engine, with enough samples", () => {
    const t = startTable([row(0.31, 0.2), row(0.32, 0.4), row(0.35, 0.3), row(0.71, 0.9), row(0.5, 0.5, "0"), { goalType: "earn", p: 0.9, engine: "1" }], "1");
    expect(t).toEqual({ earn: [[0.35, 0.3]] });
  });

  it("starts where the goal lands nearest the target, or at the formula with no data", () => {
    const table = { earn: [[0.15, 0.1], [0.55, 0.5], [0.95, 0.9]] as [number, number][] };
    expect(startPressure("earn", 0.55, table)).toBe(0.55);
    expect(startPressure("earn", 1, table)).toBe(0.95);
    expect(startPressure("hunt", 0.48, table)).toBeCloseTo(0.5);
  });
});
