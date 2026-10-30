import { describe, expect, it } from "vitest";
import { STORY_CINEMATICS, cinematicFor } from "../src/cinematics.js";
import { mergeProgress } from "../src/save.js";

describe("story cinematics", () => {
  it("registers crash_open before level 1 and helmet_reveal after level 5's win", () => {
    expect(cinematicFor("story-L001", "before", {})).toBe("crash_open");
    expect(cinematicFor("story-L005", "afterWin", {})).toBe("helmet_reveal");
    expect(cinematicFor("story-L001", "afterWin", {})).toBeNull();
    expect(Object.keys(STORY_CINEMATICS)).toEqual(["story-L001", "story-L005"]);
  });
  it("never replays a seen cinematic, and the flag survives save merges", () => {
    const p = mergeProgress({ epoch: 3, cinematics: { crash_open: true } });
    expect(cinematicFor("story-L001", "before", p.cinematics)).toBeNull();
    expect(cinematicFor("story-L005", "afterWin", p.cinematics)).toBe("helmet_reveal");
    expect(mergeProgress(null).cinematics).toEqual({});
  });
});
