import { describe, expect, it } from "vitest";
import { PROFILES, defendMargin, playBot } from "../src/index.js";
import level4 from "../../../levels/golden/proto-L004.json";

// Wall-neutral defend margin (no-wall balance #207): the margin is core health only, so the same fight
// scores the same with walls present and absent. Also pins the per-run defend record.

type Loose = Record<string, any>;
const level = (walls: boolean): Loose => {
  const base = level4 as Loose;
  return {
    ...base, id: "test-wall-neutral",
    entities: [
      ...base.entities.filter((e: Loose) => !e.type.startsWith("pad.") && e.type !== "barrier.line"),
      ...(walls ? [{ type: "barrier.line", id: "north_wall", res: "res.salvage", costPerSection: 1, sections: [
        { a: [0, 230], b: [160, 230], prebuilt: true }, { a: [160, 230], b: [320, 230], gate: true, prebuilt: true }, { a: [320, 230], b: [480, 230], prebuilt: true }] }] : []),
    ],
    waves: [8, 50].map((t, k) => ({ t, counts: { "hostile.swarmling": 60 + 60 * k, "hostile.raider_humanoid": 12 + 12 * k }, side: "n", gap: 0.5 })),
  };
};

describe("wall-neutral defend margin", () => {
  it("scores core health only, whatever the walls did", () => {
    expect(defendMargin(true, 0.6, 0.2)).toBe(0.6);
    expect(defendMargin(false, 0.6, 0.25)).toBeCloseTo(-0.75);
  });

  it("a won defend run scores the core health fraction with walls present and absent", () => {
    for (const walls of [true, false]) {
      const r = playBot(level(walls), PROFILES["good"]!, 1);
      expect(r.defend, `walls ${walls}`).toBeDefined();
      if (!r.won) continue;
      const end = r.defend!.baseHp[r.defend!.baseHp.length - 1]!;
      expect(r.margin, `walls ${walls}`).toBeCloseTo(end, 10);
    }
  });

  it("writes the defend record as plain JSON", () => {
    const r = playBot(level(false), PROFILES["good"]!, 1);
    const d = r.defend!;
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    expect(d.baseHp).toHaveLength(2);
    expect(d.towers).toHaveLength(2);
    expect(d.leaks).toHaveLength(2);
    expect(d.win).toBe(r.won);
    expect(d.stars).toBe(r.stars);
    expect(d.firstCoreContactS === -1 || d.firstCoreContactS >= 0).toBe(true);
  });
});
