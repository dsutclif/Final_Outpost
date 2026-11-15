import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAD_FILL_STEPS, padFillStep, padPinFillKey } from "../src/padring.js";

describe("pad ring fill steps", () => {
  it("steps 0..24 across every payment fraction and clamps outside", () => {
    expect(padFillStep(0)).toBe(0);
    expect(padFillStep(1)).toBe(PAD_FILL_STEPS);
    expect(padFillStep(-0.2)).toBe(0);
    expect(padFillStep(1.5)).toBe(PAD_FILL_STEPS);
    let last = 0;
    for (let i = 0; i <= 1000; i++) {
      const s = padFillStep(i / 1000);
      expect(s).toBe(Math.round((i / 1000) * 24));
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it("the pin fill key has at most 25 values per colour and ignores payment detail within a step", () => {
    const keys = new Set<string>();
    for (let i = 0; i <= 1000; i++) keys.add(padPinFillKey(padFillStep(i / 1000), "#fff", false));
    expect(keys.size).toBe(25);
  });

  it("ground ring and pin both read the shared step, and the pin art key is unchanged", () => {
    const src = readFileSync(new URL("../src/renderer.ts", import.meta.url), "utf8");
    expect(src).toContain("const fb = padFillStep(fill);");
    expect(src).toContain("this.padPin(p, pad.id, at, icon, color, lightMark, locked, fb);");
    expect(src).toContain("`pin|${icon}|${iconOk}|${color}|${light}|${locked}`");
  });
});
