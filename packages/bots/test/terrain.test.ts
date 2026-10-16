import { describe, expect, it } from "vitest";
import { createSim, fp } from "@fo/sim";
import { Nav, PROFILES, playBot } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level4 from "../../../levels/golden/proto-L004.json";

// Terrain (R3 item 17) is blocked ground to the nav, exactly like uncleared rubble.

const good = PROFILES["good"]!;
const withTerrain = (level: { entities: unknown[] }, pieces: { id: string; kind: string; rect: number[] }[]) => ({
  ...level, entities: [...level.entities, ...pieces.map((p) => ({ type: "zone.terrain", ...p }))],
});

// L001: a ridge between the start and the stall, a chasm on the way to the food source.
const L1 = withTerrain(level1 as { entities: unknown[] }, [
  { id: "terrain0", kind: "ridge", rect: [285, 480, 18, 90] },
  { id: "terrain1", kind: "chasm", rect: [300, 290, 70, 40] },
]);
// L004: a long ridge across the hostiles' lane.
const L4 = withTerrain(level4 as { entities: unknown[] }, [
  { id: "terrain0", kind: "ridge", rect: [90, 90, 300, 20] },
  { id: "terrain1", kind: "outcrop", rect: [200, 150, 60, 50] },
]);

describe("bots and terrain", () => {
  it("nav treats terrain as blocked and routes around it", () => {
    const sim = createSim(L1);
    const nav = new Nav(sim.compiled);
    nav.refresh(sim.state);
    expect(nav.isBlocked({ x: fp(294), y: fp(520) })).toBe(true);
    expect(nav.isBlocked({ x: fp(200), y: fp(520) })).toBe(false);
    const from = { x: fp(250), y: fp(525) }, to = { x: fp(340), y: fp(525) };
    expect(nav.los(from, to, [])).toBe(false);
  });

  it("the good bot still wins a harvest level with terrain in the way", () => {
    for (const s of [1, 2, 3]) {
      const r = playBot(L1, good, s);
      expect(r.won, `seed ${s}: ${r.reason}`).toBe(true);
    }
  });

  it("the good bot still wins a defend level with a ridge in the hostiles' lane", () => {
    const r = playBot(L4, good, 1);
    expect(r.won, r.reason).toBe(true);
  });
});
