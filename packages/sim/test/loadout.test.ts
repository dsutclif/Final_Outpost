import { describe, expect, it } from "vitest";
import { canTake, gatherTicks, playerCap } from "../src/systems/common.js";
import { LEVEL_1, newSim } from "./helpers.js";

// Player loadout (docs/BACKLOG-R4.md batch 3): every player number is a param a level (and later,
// equipment) can set. The two added here default to no change; the golden replays prove that.

const params = (p: Record<string, number>) => ({ params: { ...(LEVEL_1 as { params?: Record<string, number> }).params, ...p } });

describe("player loadout", () => {
  it("gathers at the node rate by default and faster with a higher gather speed", () => {
    const base = newSim(), fast = newSim(params({ "player.gatherSpeed": 200 }));
    const node = base.state.nodes[0]!.type;
    expect(gatherTicks(base.compiled, node)).toBe(base.compiled.nodes[node]!.rateTicks);
    expect(gatherTicks(fast.compiled, node)).toBe(Math.floor(base.compiled.nodes[node]!.rateTicks / 2));
  });

  it("carries the resource cap by default and more with a carry bonus", () => {
    const base = newSim(), big = newSim(params({ "player.carryBonus": 2 }));
    const res = Object.keys(base.compiled.resources).find((r) => base.compiled.resources[r]!.cap !== null)!;
    const cap = base.compiled.resources[res]!.cap!;
    expect(playerCap(base.compiled, res)).toBe(cap);
    expect(playerCap(big.compiled, res)).toBe(cap + 2);
    const full = Array<string>(cap).fill(res);
    expect(canTake(base.compiled, full, res)).toBe(false);
    expect(canTake(big.compiled, full, res)).toBe(true);
  });
});
