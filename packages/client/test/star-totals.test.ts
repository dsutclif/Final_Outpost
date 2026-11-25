import { describe, expect, it } from "vitest";
import { storyLevelSource } from "../src/levels.js";
import { starText, starTotalOf } from "../src/progress.js";
import { PROGRESS_EPOCH, mergeProgress } from "../src/save.js";

// Star totals come from each level's own objectives (outpost-ops#123 part 2), never a fixed 3.
describe("per-level star totals", () => {
  it("story level metas carry their manifest's objective count", async () => {
    const src = storyLevelSource();
    const metas = await src.list();
    expect(metas.length).toBeGreaterThanOrEqual(5);
    for (const m of metas) {
      const man = await src.load(m.id);
      expect(starTotalOf(m), m.id).toBe(man.objectives?.length ?? 3);
    }
    expect(metas.some((m) => starTotalOf(m) > 3)).toBe(true);
  });

  it("levels without a count (pack levels) still have 3", () => {
    expect(starTotalOf({})).toBe(3);
    expect(starTotalOf(undefined)).toBe(3);
  });

  it("the star text fills to the level's total, and never past it", () => {
    expect(starText(2)).toBe("★★☆");
    expect(starText(4, 5)).toBe("★★★★☆");
    expect(starText(7, 5)).toBe("★★★★★");
    expect(starText(3, 7)).toBe("★ 3/7");
  });

  it("an old-format save (stars as a bare count, no starSet) still loads", () => {
    const old = { epoch: PROGRESS_EPOCH, cleared: { "story-L003": true }, best: { "story-L003": 900 }, stars: { "story-L003": 3 }, tries: {}, quits: {}, current: "story-L004", coach: {}, discovered: {} };
    const p = mergeProgress(old);
    expect(p.stars["story-L003"]).toBe(3);
    expect(p.starSet).toEqual({});
    expect(p.cleared["story-L003"]).toBe(true);
    expect(p.current).toBe("story-L004");
  });
});
