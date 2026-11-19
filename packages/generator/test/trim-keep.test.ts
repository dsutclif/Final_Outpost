import { describe, expect, it } from "vitest";
import { keepTrim } from "../src/index.js";

// L25 (rebuild-7-25): candidates at D 0.56-0.62 (target 0.581) were replaced by trimmed versions at D 1.0 because they still passed.
describe("keepTrim", () => {
  it("refuses a passing trim that is further from target", () => expect(keepTrim(true, Math.abs(1.0 - 0.581), Math.abs(0.6 - 0.581))).toBe(false));
  it("keeps a passing trim that is closer or equal", () => {
    expect(keepTrim(true, 0.01, 0.02)).toBe(true);
    expect(keepTrim(true, 0.02, 0.02)).toBe(true);
  });
  it("refuses a trim that fails", () => expect(keepTrim(false, 0, 0.5)).toBe(false));
});
