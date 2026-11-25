import { describe, expect, it } from "vitest";
import { FP } from "@fo/sim";
import { Interp } from "../src/interp.js";

const world = (tick: number, x: number): never => ({ tick, player: { pos: { x: x * FP, y: 0 } } }) as never;

describe("a story line holds everyone still", () => {
  it("reports no velocity while the line is up, and the walk speed again after", () => {
    const it = new Interp();
    it.update(world(1, 0));
    it.update(world(2, 5));
    expect(it.vel("player").x).toBe(5);
    it.stepStaged(0.016, true);
    expect(it.vel("player")).toEqual({ x: 0, y: 0 });
    it.stepStaged(0.016, false);
    expect(it.vel("player").x).toBe(5);
  });
});
