import { describe, expect, it } from "vitest";
import { startPressure } from "../packages/generator/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/sim.js";
import startData from "../packages/generator/data/start.json";
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

  it("uses the shipped table only when its engine matches, else the formula", () => {
    const goals = startData.goals as unknown as Record<string, [number, number][]>;
    const goal = Object.keys(goals).find((g) => goals[g]!.length > 0)!;
    const target = 0.5;
    const nearest = goals[goal]!.reduce((a, r) => (Math.abs(r[1] - target) < Math.abs(a[1] - target) ? r : a))[0];
    expect(startPressure(goal, target, undefined, ENGINE_VERSION)).toBe(nearest);
    expect(startPressure(goal, target, undefined, "0.0.0-stale")).toBeCloseTo((target - 0.08) / 0.8);
    // an explicit table applies regardless of engine
    expect(startPressure("earn", 0.55, { earn: [[0.3, 0.55]] }, "0.0.0-stale")).toBe(0.3);
  });
});
