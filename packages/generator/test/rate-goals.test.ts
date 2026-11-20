import { describe, expect, it } from "vitest";
import { RATE_GOALS } from "../src/build.js";

describe("rate-probe goals", () => {
  it("sell_each is sized fixed: its progress is a goods count, so the n=1e6 rate probe would always fail", () => {
    expect(RATE_GOALS.has("sell_each")).toBe(false);
    expect(RATE_GOALS.has("earn")).toBe(true);
  });
});
