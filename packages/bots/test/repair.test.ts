import { describe, expect, it } from "vitest";
import { PROFILES, playBot } from "../src/index.js";
import level4 from "../../../levels/golden/proto-L004.json";

const good = PROFILES["good"]!;
const withRepair = (k: number) => ({ ...level4, params: { ...level4.params, "barrier.repairK": k } });

describe("bot wall repair", () => {
  it("repairs damaged walls under attack when barrier.repairK is on, and never when it is off", () => {
    const on = [1, 2, 3, 4, 5, 6].map((s) => playBot(withRepair(0.5), good, s).trace.repairs);
    expect(on.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    for (const s of [1, 2, 3]) expect(playBot(withRepair(0), good, s).trace.repairs).toBe(0);
  });
});
