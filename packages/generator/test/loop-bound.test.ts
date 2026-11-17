import { describe, expect, it } from "vitest";
import { GEN } from "../src/index.js";
import { loopOverCap } from "../src/loops.js";

// outpost-ops#87: no level makes the player do the same hand leg more than 5 times with no affordable takeover.
const hireCore = { type: "pad.hire", cost: { "res.currency": 8 }, role: { from: "node.fuel_scrap", to: "sink.core" } };
const KEY = "node.fuel_scrap>res.fuel>sink.core";
const FOOD = "node.food_source>res.meat>sink.sales_point";

describe("loop bound (outpost-ops#87)", () => {
  it("is 5 trips", () => expect(GEN.search.loopCap).toBe(5));
  it("rejects a 6-trip hand leg with no takeover", () => {
    // a core-feeding leg on a level with no core hire at all stays exempt, as before: there is no takeover to offer
    expect(loopOverCap(6, KEY, [])).toBe(false);
    expect(loopOverCap(6, FOOD, [])).toBe(true);
    expect(loopOverCap(6, FOOD, [hireCore])).toBe(true);
  });
  it("passes a 6-trip hand leg that a hire pad takes over", () => {
    expect(loopOverCap(6, KEY, [hireCore])).toBe(false);
    expect(loopOverCap(6, FOOD, [{ type: "pad.hire", cost: { "res.currency": 12 }, role: { from: "node.food_source", to: "sink.sales_point" } }])).toBe(false);
  });
  it("does not count a takeover nobody can afford", () => {
    expect(loopOverCap(6, KEY, [{ ...hireCore, cost: { "res.currency": 500 } }])).toBe(true);
  });
  it("needs a takeover for every leg of a two-leg trip", () => {
    const two = `${KEY} + node.food_source>res.meat>sink.sales_point`;
    expect(loopOverCap(6, two, [hireCore])).toBe(true);
    expect(loopOverCap(6, two, [hireCore, { type: "pad.hire", cost: { "res.currency": 12 }, role: { from: "node.food_source", to: "sink.sales_point" } }])).toBe(false);
  });
  it("lets 5 trips through with no takeover", () => expect(loopOverCap(5, KEY, [])).toBe(false));
});
