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

describe("beat sheet accumulator", () => {
  it("keeps the first occurrence of each beat in order, with ticks", async () => {
    const { createBeats, beatsNote, beatsResult } = await import("../src/index.js");
    const acc = createBeats();
    const built = (build: string): SimEvent => ({ t: "built", pad: "p", build, at: { x: 0, y: 0 } });
    const hitPrey = (by: "player" | "structure"): SimEvent => ({ t: "hit", target: "prey", id: 1, at: { x: 0, y: 0 }, by });
    beatsNote(acc, 5, built("struct.a"));
    beatsNote(acc, 6, built("struct.a")); // repeat: ignored
    beatsNote(acc, 7, hitPrey("structure")); // not the player: no hunt
    beatsNote(acc, 9, hitPrey("player"));
    beatsNote(acc, 12, built("struct.b"));
    expect(beatsResult(acc)).toEqual([{ beat: "built:struct.a", tick: 5 }, { beat: "hunt", tick: 9 }, { beat: "built:struct.b", tick: 12 }]);
  });
});

// Doug, chat 2026-11-17 (outpost-ops#151): "repeated waves are beats. sales are beats if the are not just repeated
// loops. for sales, any loop of 4 or less actions does not count as new actions."
describe("play-shape beats (Doug's loop rule)", () => {
  const P = { x: 0, y: 0 };
  // each "collect" is three units gathered (one action), each "sell" one delivery to the sales point
  const collect = (res: string): SimEvent[] => [0, 1, 2].map(() => ({ t: "gathered", res, node: 1, at: P }));
  const sell = (res: string): SimEvent[] => [{ t: "deposited", res, to: "sink.sales_point", at: P }, { t: "sold", res, n: 1, pay: 5, premium: false, at: P, customer: 1, kind: "c" }];
  const mine = (): SimEvent[] => collect("res.material_basic");
  const feed = (): SimEvent[] => [{ t: "deposited", res: "res.fuel_1", to: "sink.core", at: P }];
  const greens = "res.food_raw_1", meal = "res.food_prepared", parts = "res.component";
  /** Plays the steps 10 ticks apart and returns the action beats (tick order). */
  async function acts(steps: SimEvent[][]): Promise<{ beat: string; tick: number }[]> {
    const { createBeats, beatsNote, shapeBeatsResult } = await import("../src/index.js");
    const acc = createBeats();
    steps.forEach((evs, i) => evs.forEach((e) => beatsNote(acc, i * 10, e)));
    return shapeBeatsResult(acc).filter((b) => b.beat.startsWith("act:"));
  }
  const ticks = (bs: { tick: number }[]): number[] => bs.map((b) => b.tick);

  it("collect greens, sell, collect greens ... registers nothing after its first pass", async () => {
    const steps = Array.from({ length: 6 }, () => [collect(greens), sell(greens)]).flat();
    expect(ticks(await acts(steps))).toEqual([0, 10]);
  });
  it("collect greens, sell, mine, feed reactor, collect greens ... registers nothing after its first pass", async () => {
    const steps = Array.from({ length: 4 }, () => [collect(greens), sell(greens), mine(), feed()]).flat();
    expect(ticks(await acts(steps))).toEqual([0, 10, 20, 30]);
  });
  it("collect greens, sell, collect meal, sell, collect parts, sell registers each step", async () => {
    const steps = [collect(greens), sell(greens), collect(meal), sell(meal), collect(parts), sell(parts)];
    expect(ticks(await acts(steps))).toEqual([0, 10, 20, 30, 40, 50]);
  });
  it("a step that breaks a loop is a beat, and the new loop registers its own first pass only", async () => {
    const loop = [collect(greens), sell(greens)];
    const steps = [...loop, ...loop, ...loop, collect(meal), sell(meal), collect(meal), sell(meal)];
    // first pass 0,10; greens loop repeats 20-50; meal 60 breaks it, sell 70 is its first pass; 80, 90 repeat
    expect(ticks(await acts(steps))).toEqual([0, 10, 60, 70]);
  });
  it("a cycle of 5 actions counts each pass as new", async () => {
    const five = [collect(greens), sell(greens), mine(), feed(), collect(parts)];
    const steps = [...five, ...five, ...five];
    expect((await acts(steps)).length).toBe(15);
  });
  it("every wave registers, repeats included, and loops do not hide them", async () => {
    const { createBeats, beatsNote, shapeBeatsResult, beatsResult } = await import("../src/index.js");
    const acc = createBeats();
    for (let i = 0; i < 5; i++) {
      [...collect(greens), ...sell(greens)].forEach((e) => beatsNote(acc, i * 100, e));
      beatsNote(acc, i * 100 + 50, { t: "wave_started", idx: i + 1 });
    }
    expect(shapeBeatsResult(acc).filter((b) => b.beat === "wave_started").map((b) => b.tick)).toEqual([50, 150, 250, 350, 450]);
    // the first-occurrence sheet the variety signature reads is unchanged
    expect(beatsResult(acc).map((b) => b.beat)).toEqual(["sold", "wave_started"]);
  });
  it("work done by residents is not a player action", async () => {
    const { createBeats, beatsNote, shapeBeatsResult } = await import("../src/index.js");
    const acc = createBeats();
    beatsNote(acc, 0, { t: "gathered", res: greens, node: 1, at: P, by: 3 });
    expect(shapeBeatsResult(acc)).toEqual([]);
  });
});
