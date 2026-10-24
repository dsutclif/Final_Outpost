import { describe, expect, it } from "vitest";
import { createSim } from "@fo/sim";
import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";
import { Brain, PROFILES, planBot, playBot } from "../src/index.js";
import { seedRng } from "@fo/sim";

// Redesign round 2 behaviours on crafted manifests: perimeter rings and gates, pods with freeze
// timers and supply crates, swarm waves paid for in salvage, star-objective policies, suggest().

const good = PROFILES["good"]!;
const forest = (cx: number, cy: number) => Array.from({ length: 9 }, (_, k) => ({ type: "node.fuel_scrap", at: [cx + (k % 3) * 30 - 30, cy + Math.floor(k / 3) * 30 - 30] }));
const ring = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [(x0 + x1) / 2, y0], [x1, y0], [x1, (y0 + y1) / 2], [x1, y1], [(x0 + x1) / 2, y1], [x0, y1], [x0, (y0 + y1) / 2]];
const base = (id: string) => ({ id, seed: 1, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION, map: { w: 480, h: 900, zones: [] } });

const rescue = {
  ...base("r2-rescue"),
  modules: ["build_pads", "barrier_lines", "carry", "core", "gather", "lasso", "sales"],
  start: [240, 540],
  entities: [
    { type: "sink.core", id: "core", at: [240, 450], params: { fuel: 16, level: 1 } },
    ...forest(330, 520),
    { type: "barrier.line", id: "ring", res: "res.currency", costPerSection: 1, points: ring(100, 300, 380, 620), closed: true, gates: [0], prebuilt: [0, 1, 2, 3, 4, 5, 6, 7] },
    { type: "capture.recruit_container", at: [130, 170], freeze: 70 },
    { type: "capture.recruit_container", at: [330, 190], freeze: 140 },
    { type: "capture.supply_crate", at: [240, 90] },
  ],
  people: [],
  params: { "housing.base": 6, "core.burn": 3 },
  goal: { type: "rescue_all" },
  family: "rescue",
  objectives: [{ id: "main", kind: "rescue_all", params: {} }, { id: "time", kind: "time_target", params: { seconds: 200 } }, { id: "challenge", kind: "tow_full_trip", params: { n: 2 } }],
  fail: ["meter.lifeline"],
};

const defend = {
  ...base("r2-defend"),
  modules: ["build_pads", "barrier_lines", "carry", "core", "defense", "gather", "sales"],
  start: [240, 540],
  entities: [
    { type: "sink.core", id: "core", at: [240, 450], params: { fuel: 18, level: 1 } },
    ...forest(330, 540),
    // North sections unbuilt (salvage), the rest prebuilt with the gate in the south.
    { type: "barrier.line", id: "ring", res: "res.salvage", costPerSection: 1, points: ring(60, 230, 420, 680), closed: true, gates: [5], prebuilt: [2, 3, 4, 5, 6, 7] },
    { type: "pad.build", id: "tower_n", at: [240, 330], cost: { "res.salvage": 8 }, build: "struct.ranged_defense" },
  ],
  people: [{ role: "idle" }, { role: "idle" }, { role: "idle" }],
  waves: [
    { t: 30, counts: { "hostile.swarmling": 8 }, side: "n", gap: 0.7 },
    { t: 80, counts: { "hostile.swarmling": 14, "hostile.raider_humanoid": 2 }, side: "n", gap: 0.7 },
    { t: 130, counts: { "hostile.swarmling": 16, "hostile.boss": 1 }, side: ["n", "e"], gap: 0.7 },
  ],
  params: { "housing.base": 6, "core.burn": 3, "meters.baseHealth": 16 },
  goal: { type: "waves" },
  family: "defend",
  objectives: [{ id: "main", kind: "waves", params: {} }, { id: "c2", kind: "hp_floor", params: { pct: 30 } }, { id: "challenge", kind: "gate_held", params: {} }],
  fail: ["meter.lifeline", "meter.base_health"],
};

describe("R2 planner policies", () => {
  it("derives tow targets, heat floors and serving policies from the goal and objectives", () => {
    expect(planBot(rescue).policies.towWant).toBe(2);
    expect(planBot(rescue).lasso).toBe(true);
    const shelter = { ...rescue, goal: { type: "heat_hold", pct: 60, seconds: 30 }, objectives: [{ id: "main", kind: "heat_hold", params: { pct: 60, seconds: 30 } }, { id: "a", kind: "heat_floor", params: { pct: 25 } }, { id: "b", kind: "no_colonist_freezes", params: {} }] };
    expect(planBot(shelter).policies.heatFloor).toBeGreaterThanOrEqual(0.6);
    expect(planBot(defend).policies.heatFloor).toBeGreaterThan(0);
    expect(planBot(defend).barriers.length).toBe(2);
  });
});

describe("R2 bot on rings", () => {
  it("rescues every pod (timers first) and the crate through the ring's gate", () => {
    for (const s of [1, 2, 3]) {
      const r = playBot(rescue, good, s);
      expect({ s, won: r.won, reason: r.reason, stalls: r.stalls }).toEqual({ s, won: true, reason: "goal", stalls: 0 });
      expect(r.runStats.podsLost).toBe(0);
      expect(r.used.lines).toContain("ring");
    }
  });

  it("builds the attacked ring sections from salvage, buys the tower with drops and holds three waves", () => {
    for (const s of [1, 2, 3]) {
      const r = playBot(defend, good, s);
      expect({ s, won: r.won, reason: r.reason, stalls: r.stalls }).toEqual({ s, won: true, reason: "goal", stalls: 0 });
      expect(r.used.pads).toContain("tower_n");
      expect(r.used.lines).toContain("ring");
      expect(r.trace.modulesUsed).toEqual(expect.arrayContaining(["defense", "barrier_lines"]));
    }
  });

  it("reports stars from the sim and run stats for objective sizing", () => {
    const r = playBot(rescue, good, 1);
    expect(r.stars).toBeGreaterThanOrEqual(1);
    expect(r.objectives.map((o) => o.kind)).toEqual(["rescue_all", "time_target", "tow_full_trip"]);
    expect(r.runStats.rescued).toBe(2);
  });
});

describe("suggest() for guide arrows", () => {
  it("names the step, and says gate when the target is across the ring", () => {
    const sim = createSim(rescue);
    const brain = new Brain(sim.compiled, planBot(rescue), { ...good, reactionTicks: 0 }, seedRng(1));
    let sawGate = false, sawTow = false;
    for (let t = 0; t < 30 * 40 && !sim.state.over; t++) {
      const inp = brain.tick(sim.state);
      if (t % 10 === 0) {
        const sg = brain.suggest(sim.state, sim.compiled);
        if (sg?.kind === "gate") sawGate = true;
        if (sg?.kind === "tow") sawTow = true;
      }
      sim.step(inp);
    }
    expect(sawGate).toBe(true);
    expect(sawTow).toBe(true);
    expect(brain.current).toBeDefined();
  });

  it("a guide-only brain says out or back in by the player's side, routes the whole walk, and holds a step until it is done", () => {
    const sim = createSim(rescue);
    const bot = new Brain(sim.compiled, planBot(rescue), { ...good, reactionTicks: 0 }, seedRng(1));
    // the client's guide: never ticked, only asked
    const guide = new Brain(sim.compiled, planBot(rescue), { ...good, reactionTicks: 0 }, seedRng(1));
    const inside = (p: { x: number; y: number }) => (guide as unknown as { insideRings(p: unknown): boolean }).insideRings(p);
    let out = 0, back = 0, prev: string | null = null, swaps = 0;
    for (let t = 0; t < 30 * 60 && !sim.state.over; t++) {
      const inp = bot.tick(sim.state);
      if (t % 15 === 0) {
        const sg = guide.suggest(sim.state, sim.compiled);
        if (sg) {
          expect(sg.path.length).toBeGreaterThan(0);
          if (sg.kind === "gate") { out++; expect(inside(sim.state.player.pos)).toBe(true); }
          if (sg.kind === "gateIn") { back++; expect(inside(sim.state.player.pos)).toBe(false); }
          const task = sg.key.slice(sg.key.indexOf(":") + 1);
          if (prev !== null && task !== prev) swaps++;
          prev = task;
        }
      }
      sim.step(inp);
    }
    expect(out).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
    // one task at a time: far fewer changes than asks
    expect(swaps).toBeLessThan(20);
  });
});
