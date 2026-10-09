import { describe, expect, it } from "vitest";
import { MIN_INTERACTIVE_CONTRAST, SKINS, contrast, luminance } from "../src/index.js";

describe("palette readability", () => {
  it("luminance and contrast follow WCAG", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 6);
    expect(contrast("#000", "#fff")).toBeCloseTo(21, 4);
    expect(contrast("#777", "#777")).toBe(1);
  });

  for (const skin of Object.values(SKINS)) {
    const p = skin.palette;
    it(`${skin.id}: interactive, accent and ok contrast with the ground`, () => {
      for (const [k, c] of [["interactive", p.interactive], ["accent", p.accent], ["ok", p.ok], ["structure", p.structure]] as const) {
        const r = contrast(c, p.ground);
        expect(r, `${k} ${c} on ${p.ground} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_INTERACTIVE_CONTRAST);
      }
    });

    it(`${skin.id}: every resource contrasts with the ground`, () => {
      for (const [id, c] of Object.entries(p.res)) {
        const r = contrast(c, p.ground);
        expect(r, `${id} ${c} on ${p.ground} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_INTERACTIVE_CONTRAST);
      }
    });

    it(`${skin.id}: role colours read against the ground`, () => {
      for (const [id, c] of Object.entries(p.role)) {
        const r = contrast(c, p.ground);
        expect(r, `${id} ${c} on ${p.ground} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(2);
      }
    });

    it(`${skin.id}: UI ink reads on the panel`, () => {
      expect(contrast(p.ui.ink, p.ui.panel)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.ui.muted, p.ui.panel)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("mars ground is a muted rust, not saturated red", () => {
    const g = SKINS["mars_greenhouse"]!.palette.ground;
    expect(luminance(g)).toBeLessThan(0.2);
  });
});
