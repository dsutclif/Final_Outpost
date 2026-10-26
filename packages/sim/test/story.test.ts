import { describe, expect, it } from "vitest";
import { checkManifest, content, Manifest } from "@fo/content";
import { METER_MAX, createSim, fp, type SimEvent } from "../src/index.js";
import { LEVEL_1, LEVEL_2, LEVEL_4, assertIntegerState, at, grant, idle, newSim, walkTo } from "./helpers.js";

// Story-level mechanics (docs/STORY-LEVELS.md): a dark core lit by its first fuel, crew pods whose
// recruit starts work on release, an empty decoy pod, and a boss that breaks off and walks away.

type Ent = { type: string; [k: string]: unknown };
const withEntities = (level: { entities: Ent[] }, f: (e: Ent, i: number) => Ent): { entities: Ent[] } => ({ ...level, entities: level.entities.map(f) });

const darkCore = withEntities(LEVEL_1 as unknown as { entities: Ent[] }, (e) => (e.type === "sink.core" ? { ...e, params: { fuel: 0, level: 1, lit: false } } : e));

describe("dormant core (lit: false)", () => {
  it("burns nothing, runs no countdown and records no fuel-out until lit", () => {
    const sim = newSim({}, darkCore);
    expect(sim.state.core.dormant).toBe(true);
    const ev = idle(sim, 600);
    expect(ev.some((e) => e.t === "core_fuel_out")).toBe(false);
    expect(sim.state.core.dormant).toBe(true);
    expect(sim.state.freeze.active).toBe(false);
    expect(sim.state.core.lifeline).toBe(METER_MAX);
    expect(sim.state.stats.fuelOuts).toBe(0);
    expect(sim.state.over).toBe(false);
  });

  it("lights on its first fuel, then burns like any core", () => {
    const sim = newSim({}, darkCore);
    idle(sim, 30);
    grant(sim, { items: ["res.material_basic", "res.material_basic"] });
    const core = sim.state.core.pos;
    const ev = walkTo(sim, core, 60);
    ev.push(...idle(sim, 30));
    const lit = ev.filter((e) => e.t === "core_lit");
    expect(lit.length).toBe(1);
    expect(ev.some((e) => e.t === "core_fuel_restored")).toBe(false);
    expect(sim.state.core.dormant).toBeUndefined();
    expect(sim.state.stats.litTick).toBeGreaterThan(30);
    const fuel = sim.state.core.fuel;
    expect(fuel).toBeGreaterThan(0);
    idle(sim, sim.compiled.core.burnTicks * fuel + 5);
    expect(sim.state.core.fuel).toBe(0);
    expect(sim.state.stats.fuelOuts).toBe(1);
  });

  it("is off by default: levels without lit: false are unchanged", () => {
    expect(newSim().state.core.dormant).toBeUndefined();
  });
});

const podLevel = withEntities(LEVEL_2 as unknown as { entities: Ent[] }, (e, i) => {
  if (e.type !== "capture.recruit_container") return e;
  const first = (LEVEL_2 as unknown as { entities: Ent[] }).entities.findIndex((x) => x.type === "capture.recruit_container");
  if (i === first) return { ...e, id: "crew", joins: { role: "role.supplier", from: "node.material_source", to: "sink.core" } };
  if (i === first + 1) return { ...e, id: "empty", decoy: true };
  return e;
});

/** Release a capture at once (as if towed into the heat) and return the events of the next tick. */
function release(sim: ReturnType<typeof createSim>, idx: number): SimEvent[] {
  const c = sim.state.captures[idx]!;
  c.state = "releasing";
  c.timer = 1;
  return idle(sim, 1);
}

describe("crew pods (joins) and decoy pods", () => {
  it("a crew pod's recruit starts its job on release", () => {
    const sim = newSim({}, podLevel);
    const i = sim.state.captures.findIndex((c) => c.joins);
    expect(i).toBeGreaterThanOrEqual(0);
    const ev = release(sim, i);
    const joined = ev.find((e) => e.t === "joined");
    expect(joined).toBeDefined();
    const r = sim.state.residents.find((x) => x.id === (joined as { resident: number }).resident)!;
    expect(r.role).toBe("role.supplier");
    expect(r.assign).toEqual({ from: "node.material_source", to: "sink.core", node: null, post: null });
    expect(sim.state.stats.rescued).toBe(1);
    expect(sim.state.stats.joined).toBe(1);
    expect(sim.state.stats.hired).toBe(0);
  });

  it("a decoy opens empty and never counts as a rescue or a pod left", () => {
    const sim = newSim({}, podLevel);
    const pods = sim.state.captures.length;
    const residents = sim.state.residents.length;
    const i = sim.state.captures.findIndex((c) => c.decoy);
    const ev = release(sim, i);
    expect(ev.some((e) => e.t === "decoy_opened")).toBe(true);
    expect(ev.some((e) => e.t === "released")).toBe(false);
    expect(sim.state.captures.length).toBe(pods - 1);
    expect(sim.state.residents.length).toBe(residents);
    expect(sim.state.stats.rescued).toBe(0);
    expect(sim.state.stats.decoysOpened).toBe(1);
  });

  it("rescue_all is done with only the decoy left", () => {
    const m = { ...podLevel, goal: { type: "rescue_all" }, objectives: undefined };
    const sim = createSim(m);
    // Release every real pod; the decoy stays out in the dust.
    for (;;) {
      const i = sim.state.captures.findIndex((c) => !c.decoy && c.state === "idle");
      if (i < 0) break;
      release(sim, i);
    }
    idle(sim, 2);
    expect(sim.state.captures.length).toBe(1);
    expect(sim.state.captures[0]!.decoy).toBe(true);
    expect(sim.state.objectives[0]!.done).toBe(true);
  });

  it("checkManifest rejects joins or decoy on a crate, and both on one pod", () => {
    const bad = (patch: (e: Ent) => Ent): (() => void) => () => checkManifest(Manifest.parse(withEntities(podLevel, (e) => (e.id === "crew" ? patch(e) : e))), content);
    expect(bad((e) => ({ ...e, decoy: true }))).toThrow(/decoy pod/);
    expect(bad((e) => ({ ...e, type: "capture.supply_crate" }))).toThrow(/recruit lassoable/);
    expect(() => checkManifest(Manifest.parse(podLevel), content)).not.toThrow();
  });
});

const bossLevel = {
  ...(LEVEL_4 as Record<string, unknown>),
  waves: [{ t: 2, counts: { "hostile.boss": 1 }, bossRetreat: 25 }],
  // a long survive goal keeps the level running after the wave clears, so the walk-off can be watched
  goal: { type: "survive", seconds: 600 },
  objectives: undefined,
};

describe("retreating boss (bossRetreat)", () => {
  it("compiles the percentage onto the boss's spawn", () => {
    const sim = createSim(bossLevel);
    expect(sim.compiled.waves[0]!.retreatPct).toBe(25);
    idle(sim, 90, () => sim.state.hostiles.length > 0);
    const h = sim.state.hostiles[0]!;
    expect(h.retreatHp).toBe(Math.max(1, Math.floor((h.hpMax * 25) / 100)));
  });

  it("breaks off at its threshold: beaten for the goals, out of the fight, gone at its edge", () => {
    const sim = createSim(bossLevel);
    idle(sim, 90, () => sim.state.hostiles.length > 0);
    const h = sim.state.hostiles[0]!;
    h.hp = h.retreatHp! + 1;
    // Stand on it: the player's auto-attack lands the hit that breaks it.
    const seen: SimEvent[] = [];
    for (let i = 0; i < 300 && sim.state.hostiles.length > 0; i++) {
      const p = sim.state.player.pos, q = sim.state.hostiles[0]!.pos;
      seen.push(...sim.step({ dx: q.x - p.x, dy: q.y - p.y }));
    }
    expect(seen.some((e) => e.t === "retreated")).toBe(true);
    expect(seen.some((e) => e.t === "died" && e.kind === "hostile.boss")).toBe(false);
    expect(sim.state.stats.bossKills).toBe(1);
    expect(sim.state.stats.kills).toBe(1);
    expect(sim.state.stats.retreats).toBe(1);
    expect(sim.state.fleeing!.length).toBe(1);
    seen.push(...idle(sim, 3));
    expect(seen.some((e) => e.t === "wave_cleared")).toBe(true);
    idle(sim, 60 * 30, () => sim.state.fleeing!.length === 0);
    expect(sim.state.fleeing!.length).toBe(0);
  });

  it("checkManifest rejects bossRetreat on a wave without a boss", () => {
    const m = { ...bossLevel, waves: [{ t: 2, counts: { "hostile.raider_humanoid": 2 }, bossRetreat: 25 }] };
    expect(() => checkManifest(Manifest.parse(m), content)).toThrow(/bossRetreat/);
  });
});

describe("story mechanics: properties", () => {
  it("keep the state integer and plain, and replay bit for bit", () => {
    const levels = [darkCore, podLevel, bossLevel];
    for (const lv of levels) {
      const run = (): string => {
        const sim = createSim(lv);
        let k = 0;
        for (let i = 0; i < 1800 && !sim.state.over; i++) {
          k = (k * 1103515245 + 12345) & 0x7fffffff;
          sim.step({ dx: fp(((k >> 8) % 3) - 1), dy: fp(((k >> 12) % 3) - 1) });
        }
        assertIntegerState(sim.state);
        return JSON.stringify(sim.state);
      };
      expect(run()).toBe(run());
    }
  });

  it("at() is in world units (sanity for the helpers above)", () => {
    expect(at(1, 2)).toEqual({ x: fp(1), y: fp(2) });
  });
});
