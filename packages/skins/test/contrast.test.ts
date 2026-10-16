import { describe, expect, it } from "vitest";
import { MIN_INTERACTIVE_CONTRAST, SKINS, contrast, luminance, parseHex } from "../src/index.js";

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

    // The grey debug skin is colourless on purpose.
    const colourful = skin.id !== "debug";
    it.runIf(colourful)(`${skin.id}: items pop against every ground tone and are saturated`, () => {
      for (const [id, c] of Object.entries(p.res)) {
        for (const g of [p.ground, p.groundAlt, p.groundDark]) {
          const r = contrast(c, g);
          // The lighter ground patch is allowed a little less.
          expect(r, `${id} ${c} on ${g} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(g === p.groundAlt ? 2.5 : MIN_INTERACTIVE_CONTRAST);
        }
        const [r, g, b] = parseHex(c);
        const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        // Bars and plates are near-white by design; every other good is clearly coloured.
        if (id !== "res.material_refined") expect(chroma, `${id} ${c} chroma`).toBeGreaterThanOrEqual(0.3);
      }
    });

    it.runIf(colourful)(`${skin.id}: resources are distinguishable from each other and from rock grey`, () => {
      const ids = Object.keys(p.res);
      const dist = (a: string, b: string) => {
        const x = parseHex(a), y = parseHex(b);
        return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
      };
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const d = dist(p.res[ids[i]!]!, p.res[ids[j]!]!);
          expect(d, `${ids[i]} vs ${ids[j]} = ${d.toFixed(0)}`).toBeGreaterThanOrEqual(60);
        }
      }
      // The ore must not read as the grey boulders it is dug from.
      const [r, g, b] = parseHex(p.res["res.material_basic"]!);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThanOrEqual(90);
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
