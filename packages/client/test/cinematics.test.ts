import { describe, expect, it } from "vitest";
import { FILM_VERSIONS, STORY_CINEMATICS, cinematicFor, filmDue } from "../src/cinematics.js";
import { PROGRESS_EPOCH, mergeProgress } from "../src/save.js";

describe("story cinematics", () => {
  it("registers crash_open before level 1; level 5's helmet_reveal plays from its story cues", () => {
    expect(cinematicFor("story-L001", "before", {})).toBe("crash_open");
    expect(cinematicFor("story-L005", "afterWin", {})).toBeNull();
    expect(cinematicFor("story-L001", "afterWin", {})).toBeNull();
    expect(Object.keys(STORY_CINEMATICS)).toEqual(["story-L001"]);
  });
  it("never replays a seen version, and saved `true` migrates to version 1", () => {
    const p = mergeProgress({ epoch: PROGRESS_EPOCH, cinematics: { crash_open: true } });
    expect(p.cinematics).toEqual({ crash_open: 1 });
    expect(cinematicFor("story-L001", "before", { crash_open: FILM_VERSIONS.crash_open }, false)).toBeNull();
    expect(mergeProgress(null).cinematics).toEqual({});
  });
  it("plays again on a new version", () => {
    expect(cinematicFor("story-L001", "before", { crash_open: FILM_VERSIONS.crash_open - 1 }, false)).toBe("crash_open");
    expect(cinematicFor("story-L001", "before", { crash_open: FILM_VERSIONS.crash_open }, false)).toBeNull();
  });
  it("replays a seen film while REPLAY_FILMS is on", () => {
    const seen = { crash_open: FILM_VERSIONS.crash_open, helmet_reveal: 9, empty_bays: 9 };
    expect(cinematicFor("story-L001", "before", seen, true)).toBe("crash_open");
    expect(filmDue("helmet_reveal", seen, true)).toBe(true);
    expect(filmDue("empty_bays", seen, true)).toBe(true);
    expect(filmDue("not_a_film", seen, true)).toBe(false);
  });
  it("plays again after a level reset for an update, not when progress is kept", () => {
    const old = { epoch: PROGRESS_EPOCH - 1, cinematics: { crash_open: true }, cleared: {} };
    expect(mergeProgress(old, "reset").cinematics).toEqual({});
    expect(mergeProgress(old, "keep").cinematics).toEqual({ crash_open: 1 });
  });
});
