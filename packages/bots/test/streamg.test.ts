import { describe, expect, it } from "vitest";
import { PROFILES, planBot, playBot } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level2 from "../../../levels/golden/proto-L002.json";
import level3 from "../../../levels/golden/proto-L003.json";

const good = PROFILES["good"]!;

describe("stream G bot fixes", () => {
  it("currency goal: L1 with goal currency 150 is won by the good bot without stalls", () => {
    const m = structuredClone(level1) as Record<string, unknown>;
    m["goal"] = { type: "currency", n: 150 };
    for (const s of [1, 2, 3]) {
      const r = playBot(m, good, s);
      expect({ s, won: r.won, reason: r.reason, stalls: r.stalls }).toEqual({ s, won: true, reason: "goal", stalls: 0 });
    }
  });

  it("running out of budget while earning toward a reachable price is a loss with reason budget, not a stall", () => {
    const m = structuredClone(level1) as { entities: { id?: string; cost?: Record<string, number> }[] };
    m.entities.find((e) => e.id === "landmark")!.cost = { "res.currency": 150 };
    const r = playBot(m, good, 1, { timeBudgetSeconds: 120 });
    expect({ won: r.won, reason: r.reason, stalls: r.stalls }).toEqual({ won: false, reason: "budget", stalls: 0 });
  });

  it("barrier lines on a build goal: the bot builds the unbuilt sections", () => {
    const m = structuredClone(level1) as { modules: string[]; entities: object[] };
    m.modules.push("barrier_lines");
    m.entities.push({
      type: "barrier.line", id: "fence", res: "res.currency", costPerSection: 8,
      sections: [{ a: [0, 300], b: [160, 300] }, { a: [160, 300], b: [320, 300], gate: true }, { a: [320, 300], b: [480, 300] }],
    });
    expect(planBot(m).barriers.length).toBe(3);
    const r = playBot(m, good, 1);
    expect(r.won).toBe(true);
    expect(r.trace.modulesUsed).toContain("barrier_lines");
  });

  it("hunting: on L3 without the hunter hire pad the bot hunts prey itself and the cooked goods get made", () => {
    const m = structuredClone(level3) as { entities: { id?: string }[] };
    m.entities = m.entities.filter((e) => e.id !== "hunter");
    const r = playBot(m, good, 1);
    expect(r.trace.modulesUsed).toContain("hunting");
    expect(r.trace.modulesUsed).toContain("converters");
    expect(r.stalls).toBe(0);
  });
});
