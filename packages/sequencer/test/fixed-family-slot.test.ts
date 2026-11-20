import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, sequence, slotFor, type GoalRange } from "../src/index.js";

const cfg = DEFAULT_CONFIG;
// first defend mix slot after the intro arc
const defendMix = Array.from({ length: 60 }, (_, k) => k + 1).filter((i) => { const s = slotFor(i, cfg); return s.phase === "mix" && s.family === "defend"; });

describe("a fixed family's slot goes to another family when no goal of it reaches the target", () => {
  const defendGoals = Object.entries(cfg.goals).filter(([, g]) => g.family === "defend").map(([k]) => k);
  const unreachable = Object.fromEntries(defendGoals.map((g) => [g, { lo: 5, hi: null, n: 9 } as GoalRange]));
  it("defend mix slot with every defend goal's range above the target takes another family, with a note", () => {
    const i = defendMix[0]!;
    const out = sequence(i, [], { config: { ...cfg, goalRanges: { ...cfg.goalRanges, ...unreachable } } });
    expect(out.family).not.toBe("defend");
    expect(cfg.composer.fixed).not.toContain(out.family);
    expect(out.goalNote).toMatch(/slot went to/);
  });
  it("keeps defend when a goal reaches the target (shipped ranges untouched by this test)", () => {
    const reach = Object.fromEntries(defendGoals.map((g) => [g, { lo: null, hi: null, n: 9 } as GoalRange]));
    const out = sequence(defendMix[0]!, [], { config: { ...cfg, goalRanges: { ...cfg.goalRanges, ...reach } } });
    expect(out.family).toBe("defend");
  });
  it("teach, intro and finale slots of defend are never moved", () => {
    for (let i = 1; i <= 15; i++) {
      const s = slotFor(i, cfg);
      if (s.family !== "defend") continue;
      expect(sequence(i, [], { config: { ...cfg, goalRanges: { ...cfg.goalRanges, ...unreachable } } }).family).toBe("defend");
    }
  });
});
