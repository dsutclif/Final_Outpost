import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TITLE_VIDEO_HOLD_MS, createGate } from "../src/gate.js";

describe("background-download gate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds the work before the playing event and runs it once at the event", () => {
    const g = createGate(TITLE_VIDEO_HOLD_MS), fn = vi.fn();
    g.run(fn);
    vi.advanceTimersByTime(TITLE_VIDEO_HOLD_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    g.open();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TITLE_VIDEO_HOLD_MS * 2);
    g.open();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs at 8 s when the video never plays", () => {
    const g = createGate(TITLE_VIDEO_HOLD_MS), fn = vi.fn();
    g.run(fn);
    vi.advanceTimersByTime(TITLE_VIDEO_HOLD_MS);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs straight away once the gate is open", () => {
    const g = createGate(TITLE_VIDEO_HOLD_MS), fn = vi.fn();
    g.open();
    g.run(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
