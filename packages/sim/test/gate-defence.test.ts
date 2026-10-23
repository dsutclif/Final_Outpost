import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, TPS, attackGate, createSim, sectionMid, type SimEvent } from "../src/index.js";
import { LEVEL_4, at, idle } from "./helpers.js";

// Batch 3 defence (BACKLOG-R4): walls cannot be broken; each wave comes down a narrow lane to its side's
// gate and hits only the gate; a broken gate is never rebuilt and lets attackers through to the core;
// "gate held" is the star; turret sockets open as the waves grow; towers go to level 3.

type Loose = Record<string, any>;
const SIDES = ["n", "e", "s", "w"] as const;
// A ring of two sections per side around the core (240, 520), the first section of each side a gate.
const RING = {
  type: "barrier.line", id: "ring", res: "res.salvage", closed: true, costPerSection: 1,
  points: [[120, 400], [240, 400], [360, 400], [360, 520], [360, 640], [240, 640], [120, 640], [120, 520]],
  gates: [0, 2, 4, 6], prebuilt: [0, 1, 2, 3, 4, 5, 6, 7],
};
const level = (patch: Loose = {}, ring: Loose = RING): Loose => {
  const base = LEVEL_4 as Loose;
  return {
    ...base, id: "test-gates",
    entities: [...base.entities.filter((e: Loose) => e.type !== "barrier.line"), ring],
    params: { ...base.params, "player.rangedRange": 0 },
    ...patch,
  };
};
const all = <T extends SimEvent["t"]>(ev: SimEvent[], t: T) => ev.filter((e) => e.t === t) as Extract<SimEvent, { t: T }>[];

describe("attackers funnel to the gate", () => {
  it("come down a narrow lane in line with their side's gate and hit only that gate; walls never lose hp", () => {
    fc.assert(fc.property(fc.constantFrom(...SIDES), fc.integer({ min: 1, max: 1000 }), (side, seed) => {
      const sim = createSim(level({ seed, waves: [{ t: 1, counts: { "hostile.creature": 3 }, side, gap: 0.3 }] }));
      const st = sim.state;
      const g = attackGate(st, side)!;
      const mid = sectionMid(g.line.sections[g.idx]!);
      const half = sim.compiled.defense.laneHalfWidth;
      idle(sim, 2 * TPS);
      for (const h of st.hostiles) {
        const off = side === "n" || side === "s" ? h.pos.x - mid.x : h.pos.y - mid.y;
        expect(Math.abs(off)).toBeLessThanOrEqual(half + 2 * FP);
      }
      const ev = idle(sim, 20 * TPS, () => st.hostiles.length === 3 && st.hostiles.every((h) => h.target === "barrier"));
      expect(st.hostiles.length).toBe(3);
      for (const h of st.hostiles) expect(h.target).toBe("barrier");
      const walls = st.barriers[0]!.sections.filter((s) => !s.gate);
      for (const s of walls) expect(s.hp).toBe(s.hpMax);
      const gs = g.line.sections[g.idx]!;
      expect(gs.hp).toBeLessThan(gs.hpMax);
      expect(all(ev, "hit").filter((h) => h.target === "barrier").every((h) => h.id === g.idx)).toBe(true);
      expect(st.meters.baseHealth).toBe(st.meters.baseHealthMax);
    }), { numRuns: 8 });
  });

  it("go through an unbuilt wall section on their side instead of the gate", () => {
    const ring = { ...RING, prebuilt: [0, 2, 3, 4, 5, 6, 7] };
    const sim = createSim(level({ waves: [{ t: 1, counts: { "hostile.creature": 2 }, side: "n", gap: 0.3 }] }, ring));
    const ev = idle(sim, 25 * TPS, (e) => e.some((x) => x.t === "hit" && x.target === "base"));
    expect(all(ev, "hit").some((h) => h.target === "base")).toBe(true);
    expect(all(ev, "hit").some((h) => h.target === "barrier")).toBe(false);
    expect(sim.state.barriers[0]!.sections[0]!.hp).toBe(sim.state.barriers[0]!.sections[0]!.hpMax);
  });

  it("break the gate, fail gate_held, go on to the core; the gate is never rebuilt, even with salvage in hand", () => {
    const sim = createSim(level({
      waves: [{ t: 1, counts: { "hostile.boss": 2 }, side: "s", gap: 0.3 }],
      objectives: [{ id: "main", kind: "waves", params: {} }, { id: "gate", kind: "gate_held", params: {} }, { id: "safe", kind: "no_injuries", params: {} }],
    }));
    const st = sim.state;
    const gs = st.barriers[0]!.sections[4]!;
    const ev = idle(sim, 60 * TPS, (e) => e.some((x) => x.t === "barrier_broken"));
    expect(all(ev, "barrier_broken")).toEqual([{ t: "barrier_broken", line: "ring", section: 4 }]);
    expect(gs).toMatchObject({ built: false, broken: true });
    expect(st.objectives.find((o) => o.id === "gate")).toMatchObject({ failed: true, done: false });
    expect(st.over).toBe(false);
    // the hero stands on the broken gate with salvage: nothing is paid and nothing rebuilt
    st.player.pos = at(240, 640);
    st.player.stack = Array(4).fill("res.salvage");
    const after = idle(sim, 40 * TPS, (e) => e.some((x) => x.t === "hit" && x.target === "base"));
    expect(all(after, "barrier_progress")).toHaveLength(0);
    expect(gs.built).toBe(false);
    expect(st.player.stack.filter((r) => r === "res.salvage")).toHaveLength(4);
    expect(all(after, "hit").some((h) => h.target === "base")).toBe(true);
  });
});

describe("defence purchases", () => {
  it("a pad that requires a wave shows once that many waves have started", () => {
    const base = LEVEL_4 as Loose;
    const sim = createSim({
      ...base,
      waves: [{ t: 1, counts: { "hostile.swarmling": 1 } }, { t: 3, counts: { "hostile.swarmling": 1 } }],
      entities: [...base.entities, { type: "pad.build", id: "socket9", at: [300, 420], cost: { "res.salvage": 2 }, build: "struct.ranged_defense", requires: { wave: 2 } }],
    });
    const pad = () => sim.state.pads.find((p) => p.id === "socket9")!;
    expect(pad().visible).toBe(false);
    idle(sim, 2 * TPS);
    expect(sim.state.waves.idx).toBe(1);
    expect(pad().visible).toBe(false);
    for (let i = 0; i < 60 * TPS && sim.state.waves.idx < 2; i++) { sim.state.hostiles = []; sim.step({ dx: 0, dy: 0 }); }
    expect(sim.state.waves.idx).toBe(2);
    expect(pad().visible).toBe(true);
  });

  it("level 3 towers fire on the third tier", () => {
    const tiers = createSim(LEVEL_4).compiled.structures["struct.ranged_defense"]!.tiers!;
    expect(tiers).toHaveLength(3);
    expect(tiers[2]!.range).toBeGreaterThan(tiers[1]!.range);
    expect(tiers[2]!.rateTicks).toBeLessThan(tiers[1]!.rateTicks);
  });

  it("counts each kill by who landed it", () => {
    const sim = createSim(level({ params: { ...(LEVEL_4 as Loose).params }, waves: [{ t: 1, counts: { "hostile.swarmling": 4 }, side: "s", gap: 0.3 }] }));
    sim.state.player.pos = at(240, 680);
    idle(sim, 30 * TPS, () => sim.state.stats.kills >= 4);
    const by = sim.state.stats.killsBy ?? {};
    expect(sim.state.stats.kills).toBe(4);
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBe(4);
    expect(by["player"]).toBeGreaterThan(0);
  });
});
