import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { repoRoot, loadLimits } from "./lib.js";
import { analyseGuide } from "./guide-core.js";
import { followGuide } from "./guide-walk.js";
import { listLevels, readManifest } from "./pulse-core.js";

// The real client Guide walking a real level; this file is outside the tools typecheck with guide-walk.ts.
describe("following the guide arrow", () => {
  const ref = listLevels(resolve(repoRoot, "levels/story"))[0]!;

  it("walks a story level by the arrow and records its steps and progress", async () => {
    const r = await followGuide(readManifest(ref), ref.id, ref.pack, 30);
    expect(r.levelId).toBe("story-L001");
    expect(r.steps.length).toBeGreaterThan(3);
    expect(r.steps[0]!.tick).toBe(0);
    expect(r.progress.length).toBeGreaterThan(0);
    expect(r.ticks).toBeLessThanOrEqual(30 * 30);
    const g = analyseGuide(r, loadLimits().guide);
    expect(g.stepChanges).toBe(r.steps.length);
    expect(g.timeline[0]!.t).toBe(0);
  });

  it("is deterministic", async () => {
    const a = await followGuide(readManifest(ref), ref.id, ref.pack, 20);
    const b = await followGuide(readManifest(ref), ref.id, ref.pack, 20);
    expect(b).toEqual(a);
  });
});
