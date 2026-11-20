import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { marsGreenhouse } from "@fo/skins";

// A star for every goal in the story levels (outpost-ops#123 part 1): each goal the story shows is a manifest objective,
// so it has a star slot. The only step still without one is level 1's "Reach the light" (no objective kind for it yet).
// Goals per level today: 4, 3, 6, 4, 5 (the plan is 4, 3, 8, 5, 6 once levels 3-5 are rebuilt with more goals).
const here = dirname(fileURLToPath(import.meta.url));
const manifest = (n: number): { objectives: { id: string }[] } => JSON.parse(readFileSync(resolve(here, `../../../levels/story/story-L00${n}.json`), "utf8"));
const GOALS = [4, 3, 6, 4, 5];
const UNSTARRED = new Set(["story-L001:reach"]);

describe("story goals and stars", () => {
  for (let n = 1; n <= 5; n++) {
    const key = `story-L00${n}`;
    it(`${key}: every goal is a starred objective`, () => {
      const goals = marsGreenhouse.story!.levels[key]!.goals;
      expect(goals.length).toBe(GOALS[n - 1]);
      const ids = new Set(manifest(n).objectives.map((o) => o.id));
      for (const g of goals) {
        if (UNSTARRED.has(`${key}:${g.id}`)) expect(g.until).toBeDefined();
        else {
          expect(g.until, `${key}:${g.id} has no star slot`).toBeUndefined();
          expect(ids.has(g.id), `${key}:${g.id} is not a manifest objective`).toBe(true);
        }
      }
      expect(manifest(n).objectives.length).toBe((GOALS[n - 1] ?? 0) - (goals.some((g) => UNSTARRED.has(`${key}:${g.id}`)) ? 1 : 0));
    });
  }
});
