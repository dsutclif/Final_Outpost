import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// outpost-ops#375: every full-screen WebGLRenderer the game opens beside the level's own (live scenes, the asset
// table) must release its context when it closes. dispose() alone leaves the context to the garbage collector,
// and iPhone Chrome ran out of contexts/memory a few story scenes in (Level 2 to 3, Level 5 start). Live scenes
// need a real GL, so this guards the source; corespirit.test.ts covers the portrait with an injected GL.
describe("extra WebGL renderers release their context", () => {
  for (const f of ["../src/scene/livescene.ts", "../src/assetTable.ts"]) {
    it(f, () => {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      const made = (src.match(/new WebGLRenderer\(/g) ?? []).length;
      const freed = (src.match(/\.forceContextLoss\(\)/g) ?? []).length;
      expect(made).toBeGreaterThan(0);
      expect(freed).toBeGreaterThanOrEqual(made);
    });
  }
});
