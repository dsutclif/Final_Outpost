import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim, blockedAt, fp, FP, type Sim } from "../src/index.js";

// outpost-ops#82 (Doug, 2026-11-08, level 17): "rangers walk through walls to reach hoppers unless the commander is
// outside the gate". Fixed in engine 0.22.0; this pins it. The in-game name of the role is "protein hunter".
// Level 17 is the shipped pack level s1-L017: a walled ring with two gates, the prey and the hire pad outside it,
// the shop (the hopper he delivers to) inside.

type Loose = Record<string, any>;
const level = () => JSON.parse(readFileSync("levels/packs/s1/s1-L017.json", "utf8")) as Loose;
const RING_X = 398; // east wall of the ring; the prey zone lies beyond it

const distToSegment = (px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
};

function run(commander: "inside" | "outside") {
  const lv = level();
  const ring = lv.entities.find((e: Loose) => e.type === "barrier.line");
  const gates = (ring.gates as number[]).map((i) => {
    const a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
    return { a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } };
  });
  const sim: Sim = createSim(lv);
  const st = sim.state as Loose;
  st.manual = { src: {}, done: ["hunt"] }; // the manual-first rule is not under test
  st.currency = 50;
  const pad = st.pads.find((p: Loose) => p.id === "ranger");
  st.player.pos = { ...pad.pos };
  let hired = false;
  for (let i = 0; i < 400 && !hired; i++) hired = sim.step({ dx: 0, dy: 0 }).some((e) => e.t === "hired");
  expect(hired).toBe(true);
  const core = st.core.pos;
  st.player.pos = commander === "inside" ? { x: core.x, y: core.y + fp(40) } : { x: fp(RING_X + 80), y: fp(560) };
  const r = st.residents.find((x: Loose) => x.role === "role.hunter");
  expect(r).toBeTruthy();

  let wallTicks = 0, nearGate = Infinity, wentOut = false, picked = false, backIn = false;
  for (let i = 0; i < 6000 && !backIn; i++) {
    for (const e of sim.step({ dx: 0, dy: 0 })) if (e.t === "picked" && (e as Loose).by === r.id) picked = true;
    if (blockedAt(sim.state, sim.compiled, r.pos.x, r.pos.y)) wallTicks++;
    for (const g of gates) nearGate = Math.min(nearGate, distToSegment(r.pos.x / FP, r.pos.y / FP, g.a, g.b));
    if (r.pos.x > fp(RING_X + 20)) wentOut = true;
    if (picked && wentOut && r.pos.x < fp(RING_X - 20)) backIn = true;
  }
  return { wallTicks, nearGate, wentOut, picked, backIn };
}

describe("s1-L017: a hired protein hunter leaves and returns by the gate", () => {
  for (const where of ["inside", "outside"] as const) {
    it(`never stands in a wall and passes a gate, commander ${where} the walls`, () => {
      const res = run(where);
      expect(res.wentOut).toBe(true);
      expect(res.picked).toBe(true);
      expect(res.backIn).toBe(true);
      expect(res.wallTicks).toBe(0);
      expect(res.nearGate).toBeLessThan(10);
    });
  }
});
