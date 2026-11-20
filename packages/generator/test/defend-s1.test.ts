import { describe, expect, it } from "vitest";
import { applyDefendS1 } from "../src/defendS1.js";

type Loose = Record<string, any>;
const m: Loose = {
  id: "t", params: { "meters.baseHealth": 9 },
  waves: [{ t: 6, counts: { a: 1 }, side: "n", gap: 1 }, { t: 70, counts: { a: 2 }, side: "n", gap: 1 }, { t: 120, counts: { a: 3 }, side: "n", gap: 1 }],
  entities: [
    { type: "pad.build", id: "tw", build: "struct.ranged_defense", cost: { "res.salvage": 5 } },
    { type: "pad.build", id: "tw2", build: "struct.ranged_defense.t2", cost: { "res.salvage": 10 }, target: "tw" },
    { type: "pad.hire", id: "train", cost: { "res.salvage": 3 }, role: { role: "role.defender" } },
    { type: "pad.build", id: "bk", build: "struct.barracks.t2", cost: { "res.salvage": 27 } },
  ],
};

describe("applyDefendS1", () => {
  it("re-times waves, writes maxLive, and prices only tower pads in coins; the input is untouched", () => {
    const before = JSON.stringify(m);
    const o = applyDefendS1(m, { gap: 20, maxLive: 2, coinTowers: true, currencyPerSalvage: 1.5 }) as Loose;
    expect(JSON.stringify(m)).toBe(before);
    expect(o.waves.map((w: Loose) => w.t)).toEqual([6, 26, 46]);
    expect(o.params["defense.maxLive"]).toBe(2);
    expect(o.entities[0].cost).toEqual({ "res.currency": 8 });
    expect(o.entities[1].cost).toEqual({ "res.currency": 15 });
    expect(o.entities[2].cost).toEqual({ "res.salvage": 3 });
    expect(o.entities[3].cost).toEqual({ "res.salvage": 27 });
  });
  it("does nothing without options", () => {
    expect(applyDefendS1(m, {})).toEqual(m);
  });
});
