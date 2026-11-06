import { describe, expect, it } from "vitest";
import { FP, TPS, createSim, type SimEvent, type State } from "@fo/sim";
import { createShape, shapeResult, shapeTick } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";

const at = (x: number, y = 0): State => ({ player: { pos: { x: x * FP, y: y * FP } } }) as unknown as State;
const dep = (res = "res.fuel_1", to = "sink.core"): SimEvent => ({ t: "deposited", res, to, at: { x: 0, y: 0 } });

describe("play shape", () => {
  it("counts still seconds, the longest still run and distance", () => {
    const acc = createShape();
    for (let t = 0; t < 3 * TPS; t++) shapeTick(acc, at(0), []); // 3 s still
    for (let t = 0; t < 2 * TPS; t++) shapeTick(acc, at(t / 10), []); // walks 6 u
    for (let t = 0; t < 4 * TPS; t++) shapeTick(acc, at(5.9), []); // 4 s still
    const r = shapeResult(acc);
    expect(r.durS).toBe(9);
    expect(r.stillS).toBe(7);
    expect(r.longestStillS).toBe(4);
    expect(r.distU).toBeCloseTo(5.9, 1);
  });

  it("measures reward gaps from level start to level end", () => {
    const acc = createShape();
    const reward: SimEvent = { t: "built", pad: "p", build: "b", at: { x: 0, y: 0 } };
    for (let t = 1; t <= 20 * TPS; t++) shapeTick(acc, at(0), t === 5 * TPS ? [reward] : t === 8 * TPS ? [reward] : []);
    const r = shapeResult(acc);
    expect(r.firstRewardS).toBe(5);
    expect(r.rewardGapMaxS).toBe(12); // 8 s → 20 s
  });

  it("counts identical delivery runs, broken by a milestone or a different delivery", () => {
    const acc = createShape();
    const seq: SimEvent[][] = [[dep()], [dep()], [dep()], [dep("res.food_1")], [dep()], [{ t: "wave_started", idx: 0 }], [dep()], [dep()]];
    for (const evs of seq) shapeTick(acc, at(0), evs);
    expect(shapeResult(acc).sameRunMax).toBe(3);
  });

  it("ignores work done by residents but counts the player's kills", () => {
    const acc = createShape();
    shapeTick(acc, at(0), [
      { t: "gathered", res: "r", node: 0, at: { x: 0, y: 0 }, by: 3 },
      { t: "gathered", res: "r", node: 0, at: { x: 0, y: 0 } },
      { t: "died", kind: "k", id: 1, at: { x: 0, y: 0 }, by: "structure" },
      { t: "died", kind: "k", id: 2, at: { x: 0, y: 0 }, by: "player" },
    ]);
    expect(shapeResult(acc).acts).toEqual({ gathered: 1, died: 1 });
  });

  it("runs on a real level without touching the sim", () => {
    const sim = createSim({ ...(level1 as object), seed: 1 });
    const acc = createShape();
    for (let t = 0; t < 10 * TPS; t++) shapeTick(acc, sim.state, sim.step({ dx: FP, dy: 0 }));
    const r = shapeResult(acc);
    expect(r.durS).toBe(10);
    expect(r.distU).toBeGreaterThan(0);
  });
});
