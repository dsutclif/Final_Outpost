import { describe, expect, it } from "vitest";
import { marsGreenhouse } from "../src/index.js";

// Level 2 staging (outpost-ops#127): the lander pod is drawn dark while it waits, and Rhee's aid station is gone from every story level (Doug 2026-11-24).
type Act = Record<string, unknown>;
type Lvl = { darkPods?: boolean; aidStation?: boolean; cues: { on: Record<string, unknown>; do: Act[] }[] };
const levels = (marsGreenhouse as unknown as { story: { levels: Record<string, Lvl> } }).story.levels;

it("level 2 draws the lander pod dark while it waits", () => { expect(levels["story-L002"]!.darkPods).toBe(true); });

describe("Rhee's aid station", () => {
  it.each(["story-L001", "story-L002", "story-L003", "story-L004", "story-L005"])("%s has none", (id) => {
    expect((levels[id] as unknown as Record<string, unknown>)["aidStation"]).toBeUndefined();
    expect(levels[id]!.cues.some((c) => c.do.some((a) => "aidStation" in a))).toBe(false);
  });
});
