import { describe, expect, it } from "vitest";
import { FILM_VERSIONS, STORY_CINEMATICS, cinematicFor } from "../src/cinematics.js";
import { PROGRESS_EPOCH, mergeProgress } from "../src/save.js";

describe("story cinematics", () => {
  it("registers crash_open before level 1 and helmet_reveal after level 5's win", () => {
    expect(cinematicFor("story-L001", "before", {})).toBe("crash_open");
    expect(cinematicFor("story-L005", "afterWin", {})).toBe("helmet_reveal");
    expect(cinematicFor("story-L001", "afterWin", {})).toBeNull();
    expect(Object.keys(STORY_CINEMATICS)).toEqual(["story-L001", "story-L005"]);
  });
  it("never replays a seen version, and saved `true` migrates to version 1", () => {
    const p = mergeProgress({ epoch: PROGRESS_EPOCH, cinematics: { crash_open: true } });
    expect(p.cinematics).toEqual({ crash_open: 1 });
    expect(cinematicFor("story-L001", "before", p.cinematics)).toBeNull();
    expect(cinematicFor("story-L005", "afterWin", p.cinematics)).toBe("helmet_reveal");
    expect(mergeProgress(null).cinematics).toEqual({});
  });
  it("plays again on a new version", () => {
    expect(cinematicFor("story-L001", "before", { crash_open: FILM_VERSIONS.crash_open - 1 })).toBe("crash_open");
    expect(cinematicFor("story-L001", "before", { crash_open: FILM_VERSIONS.crash_open })).toBeNull();
  });
  it("plays again after a level reset for an update, not when progress is kept", () => {
    const old = { epoch: PROGRESS_EPOCH - 1, cinematics: { crash_open: true }, cleared: {} };
    expect(mergeProgress(old, "reset").cinematics).toEqual({});
    expect(mergeProgress(old, "keep").cinematics).toEqual({ crash_open: 1 });
  });
});
