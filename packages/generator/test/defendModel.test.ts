import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { DEFEND_FIT, defendInput, predictRho } from "../src/defendModel.js";

const load = (id: string) => defendInput(JSON.parse(readFileSync(new URL(`../../../levels/packs/s1/${id}.json`, import.meta.url), "utf8")), content);

describe("attack-defence model v0", () => {
  const inp = load("s1-L026");
  it("is deterministic and bounded", () => {
    const a = predictRho(inp, DEFEND_FIT, 1), b = predictRho(inp, DEFEND_FIT, 1);
    expect(a.rho).toBe(b.rho);
    expect(a.rho).toBeGreaterThanOrEqual(0);
  });
  it("a weaker rung never takes less damage than a stronger one", () => {
    const r = (s: number) => predictRho(inp, DEFEND_FIT, s).rho;
    expect(r(0.7)).toBeGreaterThanOrEqual(r(1) - 1e-9);
  });
  it("more starting scrap never raises rho", () => {
    expect(predictRho({ ...inp, start: inp.start + 40 }, DEFEND_FIT, 0.8).rho).toBeLessThanOrEqual(predictRho(inp, DEFEND_FIT, 0.8).rho + 1e-9);
  });
});
