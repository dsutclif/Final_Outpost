import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { DEFEND_FIT_FILE, defendInput, predictRho } from "../src/index.js";

const L021 = JSON.parse(readFileSync(new URL("../../../levels/packs/s1/s1-L021.json", import.meta.url), "utf8"));

describe("defend model (outpost-ops#273)", () => {
  it("the fit file carries its engine and content version", () => {
    expect(DEFEND_FIT_FILE.engine).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DEFEND_FIT_FILE.content).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("reads the game numbers from the content tables and errors on a missing one", () => {
    const inp = defendInput(L021, content);
    expect(inp.speed).toBe(content.defaults["player.speed"]);
    expect(inp.pickupRange).toBe(content.defaults["drops.pickupRange"]);
    const noCore = { ...content, defaults: { ...content.defaults, "player.speed": undefined } } as never;
    expect(() => defendInput(L021, noCore)).toThrow(/missing game number player.speed/);
  });
  it("a slower pickup never helps: later kill drops can only lower what the defence holds", () => {
    const inp = defendInput(L021, content);
    const fast = predictRho(inp, { ...DEFEND_FIT_FILE, pickupDelay: 0, walkShare: 0 }, 1, { strategy: "turrets_first", volume: 8 });
    const slow = predictRho(inp, { ...DEFEND_FIT_FILE, pickupDelay: 20, walkShare: 2 }, 1, { strategy: "turrets_first", volume: 8 });
    expect(slow.damage).toBeGreaterThanOrEqual(fast.damage);
  });
});
