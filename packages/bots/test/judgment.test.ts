import { describe, expect, it } from "vitest";
import { createSim, seedRng } from "@fo/sim";
import { content } from "@fo/content";
import { Brain, LADDER, PROFILES, STRATEGIES, playBot, planBot, strategyProfile } from "../src/index.js";
import { Judge, gauss } from "../src/judgment.js";
import level4 from "../../../levels/golden/proto-L004.json";

// Defend S3 (outpost-ops#273): the judgment dial. Same constructed defend level as strategy.test.ts.
type Loose = Record<string, any>;
const tower = (id: string, at: [number, number], site: [number, number]): Loose[] => [
  { type: "pad.build", id, at, cost: { "res.salvage": 3 }, build: "struct.ranged_defense", site },
  { type: "pad.build", id: `${id}_up`, at, cost: { "res.salvage": 6 }, build: "struct.ranged_defense.t2", target: id, requires: { pad: id } },
];
const level = (): Loose => {
  const base = level4 as Loose;
  return {
    ...base, id: "test-judgment",
    entities: [
      ...base.entities.filter((e: Loose) => !e.type.startsWith("pad.") && e.type !== "barrier.line"),
      { type: "barrier.line", id: "north_wall", res: "res.salvage", costPerSection: 1, sections: [
        { a: [0, 230], b: [160, 230], prebuilt: true }, { a: [160, 230], b: [320, 230], gate: true, prebuilt: true }, { a: [320, 230], b: [480, 230], prebuilt: true }] },
      { type: "struct.barracks", id: "barracks", at: [150, 640] },
      { type: "pad.hire", id: "train", at: [150, 720], cost: { "res.salvage": 3 }, role: { role: "role.defender" }, repeatable: true },
      { type: "pad.build", id: "barracks_up", at: [200, 720], cost: { "res.salvage": 12 }, build: "struct.barracks.t2", target: "barracks" },
      ...tower("tower_n1", [190, 290], [190, 260]), ...tower("tower_n2", [290, 290], [290, 260]),
    ],
    waves: [8, 50, 90, 130, 170].map((t, k) => ({ t, counts: { "hostile.swarmling": 8 + 8 * k, "hostile.raider_humanoid": 2 + k }, side: "n", gap: 0.5 })),
  };
};

describe("judgment profiles", () => {
  it("every rung and the human bot has a judgment, descending down the ladder", () => {
    expect(LADDER.map((p) => p.judgment)).toEqual([1, 0.8, 0.6, 0.4, 0.2]);
    expect(PROFILES["human"]!.judgment).toBe(0.85);
    expect(strategyProfile("turrets_first").judgment).toBeUndefined();
  });

  it("is deterministic per seed: the same profile and seed give the same hash and picks", () => {
    for (const name of ["average", "floor"]) {
      const a = playBot(level(), PROFILES[name]!, 3), b = playBot(level(), PROFILES[name]!, 3);
      expect(a.hash).toBe(b.hash);
      expect(a.judge).toEqual(b.judge);
      expect(a.judge!.n).toBeGreaterThan(0);
    }
  });

  it("noise is a hash of the bot's own seed: it leaves the sim rng alone", () => {
    expect(gauss(7, 2, 1)).toBe(gauss(7, 2, 1));
    expect(gauss(7, 2, 1)).not.toBe(gauss(8, 2, 1));
  });
});

describe("Judge: strategy choice on a constructed state", () => {
  const sim = createSim(level(), { content });
  // some salvage in hand, so the buy orders have something to buy and differ in the dps they stand with
  const st = sim.state;
  for (let i = 0; i < 10; i++) st.player.stack.push("res.salvage");
  const judgeAt = (j: number, seed: number): Judge => {
    const jd = new Judge(sim.compiled, content, j, seed);
    jd.refresh(st);
    return jd;
  };

  it("at judgment 1 picks the model's best strategy for every seed", () => {
    const first = judgeAt(1, 1).log[0]!;
    const spread = Math.max(...STRATEGIES.map((s) => first.margins[s])) - Math.min(...STRATEGIES.map((s) => first.margins[s]));
    expect(spread, JSON.stringify(first.margins)).toBeGreaterThan(0.02);
    for (let seed = 1; seed <= 40; seed++) {
      const l = judgeAt(1, seed).log[0]!;
      expect(l.pick).toBe(l.best);
    }
  });

  it("lower judgment picks the best less often over many seeds", () => {
    const hit = (j: number): number => { let n = 0; for (let seed = 1; seed <= 300; seed++) { const l = judgeAt(j, seed).log[0]!; if (l.pick === l.best) n++; } return n / 300; };
    const rates = [1, 0.8, 0.6, 0.4, 0.2].map(hit);
    expect(rates[0]).toBe(1);
    expect(rates[4]!).toBeLessThan(rates[2]!);
    expect(rates[2]!).toBeLessThan(rates[0]!);
    expect(rates[4]!).toBeLessThan(0.95);
  });

  it("the Brain builds a Judge only for judgment profiles on defend levels", () => {
    const lv = level();
    expect(new Brain(sim.compiled, planBot(lv), PROFILES["good"]!, seedRng(1), content).judge).not.toBeNull();
    expect(new Brain(sim.compiled, planBot(lv), strategyProfile("guards_first"), seedRng(1), content).judge).toBeNull();
    expect(new Brain(sim.compiled, planBot(lv), PROFILES["good"]!, seedRng(1)).judge).toBeNull();
  });
});
