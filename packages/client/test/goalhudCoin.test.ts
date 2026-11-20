import { describe, expect, it } from "vitest";
import { tokenSvg } from "../src/goalhud";

describe("credit coin glyph", () => {
  it("draws the hexagonal C, not the Halcyon H", () => {
    const svg = tokenSvg({ glyph: "coin", fill: 1 }, 24);
    expect(svg).toContain("M15.6 9.9L13.8 7.6"); // the C
    expect(svg).not.toContain("M8.6 7.4v9.2M15.4 7.4v9.2"); // the H
  });
});
