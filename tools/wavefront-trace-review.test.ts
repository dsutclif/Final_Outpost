import { describe, expect, it } from "vitest";
import { reviewSeed } from "../packages/generator/src/wavefrontReview.js";
import { loadLevel } from "./wavefront-load.js";

describe("wavefront trace review, Level 20", () => {
  it("every pad is visible in its active window and no rule is broken, for 8 seeds", () => {
    const { input } = loadLevel("s1-L020");
    for (let seed = 1; seed <= 8; seed++) {
      const r = reviewSeed(input, seed);
      expect({ seed, rules: r.rules, pads: r.pads }).toEqual({ seed, rules: [], pads: [] });
    }
  });
});
