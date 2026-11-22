import { describe, expect, it } from "vitest";
import { marsGreenhouse } from "../src/index.js";

// Level 2 staging (outpost-ops#127): the lander pod is drawn dark while it waits, and Rhee's aid station stands beside the reactor from her line on.
type Act = Record<string, unknown>;
type Lvl = { darkPods?: boolean; aidStation?: boolean; cues: { on: Record<string, unknown>; do: Act[] }[] };
const levels = (marsGreenhouse as unknown as { story: { levels: Record<string, Lvl> } }).story.levels;

it("level 2 draws the lander pod dark while it waits", () => { expect(levels["story-L002"]!.darkPods).toBe(true); });

describe("Rhee's aid station", () => {
  it("is not set in level 2 (outpost-ops#297: no big med box beside Rhee when she arrives)", () => {
    const cue = levels["story-L002"]!.cues.find((c) => c.on["event"] === "joined" && (c.on["match"] as { capture?: number } | undefined)?.capture === 1)!;
    expect(cue.do.some((a) => a["aidStation"] === true)).toBe(false);
    expect(levels["story-L002"]!.aidStation).toBeUndefined();
  });
  it.each(["story-L003", "story-L004", "story-L005"])("%s has it from the start", (id) => {
    expect(levels[id]!.aidStation).toBe(true);
  });
  it("level 1 has none", () => {
    expect(levels["story-L001"]!.aidStation).toBeUndefined();
  });
});
