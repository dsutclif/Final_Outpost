import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Manifest } from "@fo/content";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { describe, expect, it } from "vitest";
import { kilnLines } from "../src/kilnintro.js";
import { manifestObjectives, labelOf } from "../src/objectives.js";

// Goal lines name the real thing from the level (Doug, 2026-11-05), and KILN coaches a mechanic only
// the first time it appears on a regular level (docs/mockups/goal-voices.html).

const skin = getSkin(DEFAULT_SKIN);
const level = (n: number): Manifest => {
  const raw = JSON.parse(readFileSync(resolve(__dirname, `../../../levels/packs/s1/s1-L${String(n).padStart(3, "0")}.json`), "utf8"));
  return (raw.manifest ?? raw) as Manifest;
};
const labels = (n: number): string[] => { const m = level(n); return manifestObjectives(m).map((o) => labelOf(m, skin, o)); };

describe("goal lines name what the level counts", () => {
  it("names the product, the building in the plural, the machines and the sources", () => {
    expect(labels(4)[0]).toBe("Make 32 meals");
    expect(labels(20)).toContain("Build 2 hab pods");
    expect(labels(9)[0]).toBe("Upgrade the galley, smelter or parts works to Lv3");
    expect(labels(31)[0]).toMatch(/^Keep 2 of the galley, smelter and parts works running at once for 0:13$/);
    expect(labels(40)[0]).toBe("Unlock 2 grow domes");
    expect(labels(13)[0]).toBe("Fill 13 bulk orders");
  });
  it("leaves no placeholder unfilled on any level of the pack or the story", () => {
    for (let n = 1; n <= 5; n++) {
      const m = JSON.parse(readFileSync(resolve(__dirname, `../../../levels/story/story-L00${n}.json`), "utf8")) as Manifest;
      for (const o of manifestObjectives(m)) expect(labelOf(m, skin, o), `story L${n} ${o.kind}`).not.toMatch(/[{}]/);
    }
    for (let n = 1; n <= 60; n++) {
      let m: Manifest;
      try { m = level(n); } catch { continue; }
      for (const o of manifestObjectives(m)) expect(labelOf(m, skin, o), `L${n} ${o.kind}`).not.toMatch(/[{}]/);
    }
  });
});

describe("KILN's first-time lines", () => {
  it("coaches each new mechanic, naming this level's machine, and stays quiet once it has been met", () => {
    const m = level(4);
    const lines = kilnLines(m, skin, new Set());
    expect(lines.some((l) => l.startsWith("To run the galley, put greens in it"))).toBe(true);
    expect(lines.every((l) => !/[{}]/.test(l))).toBe(true);
    expect(kilnLines(m, skin, new Set(m.modules))).toEqual([]);
  });
});
