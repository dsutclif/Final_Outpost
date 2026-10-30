import { describe, expect, it } from "vitest";
import { createSim, mainGoalDead, scrapLeft, starsOf } from "../src/index.js";
import { LEVEL_4 } from "./helpers.js";

// R5 #21: the level ends lost once the main goal has failed; turret, hire and scrap goals with no way left to pay
// are proven dead. A star is lost at once, the main goal is left for the player to decide.

type Loose = Record<string, any>;
const base = LEVEL_4 as Loose;
const noScrap = (objectives: Loose[]): Loose => ({ ...base, id: "test-deadends", objectives: [...objectives, { id: "hull", kind: "hp_floor", params: { pct: 60 } }, { id: "safe", kind: "no_injuries", params: {} }].slice(0, 3), waves: [{ t: 9999, counts: { "hostile.swarmling": 1 } }] });
const main = { id: "main", kind: "waves", params: {} };

describe("cannot win (R5 #21)", () => {
  it("counts scrap on the ground, in piles and in the waves still to come", () => {
    const sim = createSim(base);
    const n = scrapLeft(sim.state, sim.compiled);
    expect(n).toBeGreaterThan(0);
    sim.state.drops.push({ id: 999, res: "res.salvage", pos: { x: 0, y: 0 } });
    expect(scrapLeft(sim.state, sim.compiled)).toBe(n! + 1);
    sim.state.drops.push({ id: 1000, res: "res.food_raw_1", pos: { x: 0, y: 0 } });
    expect(scrapLeft(sim.state, sim.compiled)).toBe(n! + 1);
  });

  it("a regrowing scrap pile is not countable, so nothing is proven", () => {
    const sim = createSim(base);
    sim.state.nodes.push({ id: "x", type: "node.salvage_pile", pos: { x: 0, y: 0 }, stock: null, regrowAcc: 0, enabled: true });
    expect(scrapLeft(sim.state, sim.compiled)).toBeNull();
  });

  it("a scrap star out of reach fails at once without ending the level", () => {
    const sim = createSim(noScrap([main, { id: "scrap", kind: "salvage", params: { n: 5000 } }]));
    sim.step({ dx: 0, dy: 0 });
    const star = sim.state.objectives[1]!;
    expect(star.failed).toBe(true);
    expect(sim.state.over).toBeFalsy();
  });

  it("a scrap goal within reach stays open", () => {
    const sim = createSim(noScrap([main, { id: "scrap", kind: "salvage", params: { n: 1 } }]));
    sim.step({ dx: 0, dy: 0 });
    expect(sim.state.objectives[1]!.failed).toBe(false);
  });

  it("a main goal out of reach is reported, not acted on", () => {
    const sim = createSim(noScrap([main]));
    sim.compiled.objectives[0] = { ...sim.compiled.objectives[0]!, kind: "salvage", params: { n: 5000 } };
    expect(mainGoalDead(sim.state, sim.compiled)).toBe(true);
    expect(sim.state.objectives[0]!.failed).toBe(false);
    expect(sim.state.over).toBeFalsy();
  });

  it("a failed main goal ends the level lost with no stars", () => {
    const sim = createSim(noScrap([main]));
    sim.state.objectives[0]!.failed = true;
    sim.step({ dx: 0, dy: 0 });
    expect(sim.state.over).toBe(true);
    expect(sim.state.won).toBe(false);
    expect(sim.state.reason).toBe("goal_failed");
    expect(starsOf(sim.state)).toBe(0);
  });
});
