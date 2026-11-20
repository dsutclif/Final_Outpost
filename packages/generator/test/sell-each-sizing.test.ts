import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG as cfg, featureClosure, modulesFor, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById } from "../src/index.js";

// gap-fill follow-up: sell_each's progress is a count of goods (0..k), not units, so the "rate" probe (n = HUGE)
// always read 0 and every candidate was dropped. It is a fixed-size goal ({n, k}); difficulty comes from n.
describe("sell_each sizing", () => {
  it("is a fixed-size goal, so the unit probe never runs on it", () => {
    const r = sequenceRange(1, 60).find((x) => x.index > 15 && x.family === "harvest" && x.phase === "mix")!;
    const features = featureClosure(["hunting"], cfg);
    const modules = modulesFor(["harvest", "rescue"], features);
    let built: ReturnType<typeof buildLevel> | null = null;
    for (let salt = 0; salt < 8 && !built; salt++) {
      try {
        built = buildLevel({ id: "se", seed: r.seed, family: "harvest", secondary: "rescue", features, goalType: "sell_each",
          modules, template: templateById(r.template), knobs: knobsFor(0.45, {}), walls: true }, salt);
      } catch { /* next layout draw */ }
    }
    expect(built).not.toBeNull();
    expect(built!.sizing).toBe("fixed");
    expect((built!.manifest.goal as { n: number; k: number }).k).toBeGreaterThanOrEqual(1);
  });
});
