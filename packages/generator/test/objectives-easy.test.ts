import { describe, expect, it } from "vitest";
import type { BotResult } from "@fo/bots";
import type { Manifest } from "@fo/content";
import { settleObjectives } from "../src/index.js";

// Batch 3 (L44 after the compact layout): a goal that ends on the clock needs two star challenges; when
// only one of them is one some bot misses, an always-earned one stands in for the second (as tutorials may).

const run = (froze = 0): BotResult => ({
  won: true, goalTicks: 190 * 30, stars: 3, objectives: [],
  runStats: { fuelOuts: 0, froze, heatMin: 800, admitted: 5, hpMin: 100, injured: 0, barriersLost: 0, customersAngry: 0, overload: false,
    tripBest: 0, tripBestClean: 0, podsLost: 0, podsLeft: 0, rescued: 0, streakMax: 0, hired: 0, heatMean: 0.8, kills: 0, salvage: 0 },
}) as unknown as BotResult;

describe("star challenges on an easy time-fixed level", () => {
  it("takes an always-earned second challenge when only one challenge separates the ladder", () => {
    const m = { family: "shelter", goal: { type: "survive", seconds: 190 }, objectives: [{ id: "main", kind: "survive", params: { seconds: 190 } }] } as unknown as Manifest;
    // every rung earns everything, except the floor bot once lets a colonist freeze
    const ms = { runs: { good: [run(), run(), run()], floor: [run(1)] } } as never;
    const why = settleObjectives(m, ms, ["settlement_never_freezes", "no_colonist_freezes", "heat_floor", "admit"], 1);
    expect(why).toBeNull();
    expect(m.objectives).toHaveLength(3);
    const [, second, first] = m.objectives!;
    expect(first!.kind).toBe("no_colonist_freezes");
    expect(second!.id).toBe("challenge2");
    expect(second!.kind).not.toBe(first!.kind);
  });
});
