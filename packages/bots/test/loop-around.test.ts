import { describe, expect, it } from "vitest";
import { createSim, seedRng } from "@fo/sim";
import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";
import { Brain, PROFILES, planBot } from "../src/index.js";

// BACKLOG #43: the lasso tow loop must go around the captive through walkable ground, never inside a ring.

const ring = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [(x0 + x1) / 2, y0], [x1, y0], [x1, (y0 + y1) / 2], [x1, y1], [(x0 + x1) / 2, y1], [x0, y1], [x0, (y0 + y1) / 2]];

// A capture 14 units outside a prebuilt closed ring: the 24-radius loop crosses the wall.
const level = {
  id: "loop-around", seed: 1, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION,
  map: { w: 480, h: 900, zones: [] },
  modules: ["build_pads", "barrier_lines", "carry", "core", "gather", "lasso", "sales"],
  start: [240, 700],
  entities: [
    { type: "sink.core", id: "core", at: [240, 780], params: { fuel: 16, level: 1 } },
    { type: "barrier.line", id: "ring", res: "res.currency", costPerSection: 1, points: ring(100, 300, 380, 620), closed: true, gates: [0], prebuilt: [0, 1, 2, 3, 4, 5, 6, 7] },
    { type: "capture.recruit_container", at: [240, 286], freeze: 140 },
  ],
  people: [],
  params: { "housing.base": 6, "core.burn": 3 },
  goal: { type: "rescue_all" },
  family: "rescue",
  objectives: [{ id: "main", kind: "rescue_all", params: {} }, { id: "time", kind: "time_target", params: { seconds: 200 } }, { id: "challenge", kind: "tow_full_trip", params: { n: 2 } }],
  fail: ["meter.lifeline"],
};

describe("Brain.loopAround", () => {
  it("never places loop points inside a wall and keeps consecutive points connected", () => {
    const sim = createSim(level);
    const brain = new Brain(sim.compiled, planBot(level), { ...PROFILES["good"]!, reactionTicks: 0 }, seedRng(1));
    brain.nav.refresh(sim.state);
    const cap = sim.state.captures[0]!;
    const loop = (brain as unknown as { loopAround(c: unknown): { x: number; y: number }[] }).loopAround(cap.pos);
    expect(loop.length).toBeGreaterThanOrEqual(3);
    for (const p of loop) expect(brain.nav.isBlocked(p)).toBe(false);
    for (let i = 0; i < loop.length; i++) {
      expect(brain.nav.los(loop[i]!, loop[(i + 1) % loop.length]!, [])).toBe(true);
    }
  });
});
