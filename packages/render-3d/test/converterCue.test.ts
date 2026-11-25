import { describe, expect, it } from "vitest";
import { converterCue, padPulse } from "../src/converterCue.js";

const base = { out: 0, outCap: 6, inQ: 0, inCap: 10, manned: true };

describe("converter cue", () => {
  it("shows nothing for a healthy machine", () => {
    expect(converterCue(base)).toEqual({ outputFull: false, inputFull: false, red: false, warn: null });
  });
  it("a full output tray shows the red '!' as before", () => {
    const c = converterCue({ ...base, out: 6 });
    expect(c).toMatchObject({ outputFull: true, inputFull: false, red: true, warn: "!" });
  });
  it("a full input tray shows the red '!' and the red light", () => {
    const c = converterCue({ ...base, inQ: 10 });
    expect(c).toMatchObject({ outputFull: false, inputFull: true, red: true, warn: "!" });
  });
  it("an input one short of full shows nothing", () => {
    expect(converterCue({ ...base, inQ: 9 }).warn).toBeNull();
  });
  it("unmanned still shows '?', even with a full input (staffing is the first fix)", () => {
    expect(converterCue({ ...base, manned: false }).warn).toBe("?");
    expect(converterCue({ ...base, manned: false, inQ: 10 }).warn).toBe("?");
    expect(converterCue({ ...base, manned: false, out: 6 }).warn).toBe("?");
  });
  it("the upgrade pad pulses only while the cue holds, and clears after", () => {
    let grew = false;
    for (let t = 0; t < 2; t += 0.05) { const k = padPulse(true, t); expect(k).toBeGreaterThanOrEqual(1); if (k > 1.05) grew = true; expect(padPulse(false, t)).toBe(1); }
    expect(grew).toBe(true);
  });
});
