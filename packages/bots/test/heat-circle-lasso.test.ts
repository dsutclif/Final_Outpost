import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROFILES, playBot } from "../src/index.js";

// No-wall balance slice 1: with the rescue ring stripped the lasso engages on leaving the heat circle,
// so a rescue level with captures stays winnable (before, nothing was ever captured).
describe("rescue level with no wall line", () => {
  it("the good bot captures the pods and wins", () => {
    const m = JSON.parse(readFileSync(new URL("../../../levels/packs/s1/s1-L030.json", import.meta.url), "utf8"));
    m.entities = m.entities.filter((e: { type: string }) => e.type !== "barrier.line");
    const r = playBot(m, PROFILES["good"]!, 1, { timeBudgetSeconds: 900 });
    expect(r.won).toBe(true);
    expect((r.used as unknown as { captures: number }).captures).toBeGreaterThan(0);
  });
});
