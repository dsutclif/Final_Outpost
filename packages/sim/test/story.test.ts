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
    // Stand on it: the player's auto-attack lands the hit that breaks it. The boss now spawns 120 units out and
    // walks in slowly, so the commander waits longer (the retreat lands ~300 ticks in) before it reaches his range.
    const seen: SimEvent[] = [];
    for (let i = 0; i < 900 && sim.state.hostiles.length > 0; i++) {
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

  // story level 5: the helmet lies where the warlord breaks off, hidden until dawn
  const carried = {
    ...bossLevel,
    objectives: [{ id: "main", kind: "survive", params: { seconds: 600 } }, { id: "dawn", kind: "survive", params: { seconds: 590 } }, { id: "b", kind: "no_colonist_freezes", params: {} }],
    entities: [...((LEVEL_4 as { entities: unknown[] }).entities), { type: "capture.helmet", id: "helmet", at: [100, 100], hiddenUntil: "dawn", heldBy: "boss" }],
  };

  it("a heldBy capture is left where the boss breaks off", () => {
    const sim = createSim(carried);
    const c = sim.state.captures.find((x) => x.type === "capture.helmet")!;
    expect(c.heldBy).toBe("boss");
    idle(sim, 90, () => sim.state.hostiles.length > 0);
    const h = sim.state.hostiles[0]!;
    h.hp = h.retreatHp! + 1;
    let broke: SimEvent | undefined;
    for (let i = 0; i < 300 && !broke; i++) {
      const p = sim.state.player.pos, q = sim.state.hostiles[0]!.pos;
      broke = sim.step({ dx: q.x - p.x, dy: q.y - p.y }).find((e) => e.t === "retreated");
    }
    expect(broke).toBeDefined();
    expect(c.pos).toEqual((broke as { at: { x: number; y: number } }).at);
    expect(c.heldBy).toBeUndefined();
    expect(c.state).toBe("hidden");
    // it stays put while the boss walks off
    const left = { ...c.pos };
    idle(sim, 60);
    expect(c.pos).toEqual(left);
  });

  it("checkManifest wants heldBy hidden and carried by a boss", () => {
    const helmetOf = (patch: Record<string, unknown>) => ({ ...carried, entities: [...((LEVEL_4 as { entities: unknown[] }).entities), { type: "capture.helmet", id: "helmet", at: [100, 100], ...patch }] });
    expect(() => checkManifest(Manifest.parse(helmetOf({ heldBy: "boss" })), content)).toThrow(/heldBy needs hiddenUntil/);
    expect(() => checkManifest(Manifest.parse({ ...helmetOf({ heldBy: "boss", hiddenUntil: "dawn" }), waves: [{ t: 2, counts: { "hostile.raider_humanoid": 2 } }] }), content)).toThrow(/heldBy needs a boss/);
  });

  it("checkManifest rejects bossRetreat on a wave without a boss", () => {
    const m = { ...bossLevel, waves: [{ t: 2, counts: { "hostile.raider_humanoid": 2 }, bossRetreat: 25 }] };
    expect(() => checkManifest(Manifest.parse(m), content)).toThrow(/bossRetreat/);
  });
});

describe("stand-off boss (bossStandoff)", () => {
  const standLevel = { ...bossLevel, waves: [{ t: 2, counts: { "hostile.boss": 1 }, bossStandoff: 85 }] };
  const gap = (sim: ReturnType<typeof createSim>): number => {
    const p = sim.state.player.pos, q = sim.state.hostiles[0]!.pos;
    return Math.hypot(q.x - p.x, q.y - p.y);
  };

  it("holds at its stand-off from the commander and shoots him from there (past its own shot range)", () => {
    const sim = createSim(standLevel);
    expect(sim.compiled.waves[0]!.standoff).toBe(fp(85));
    idle(sim, 90, () => sim.state.hostiles.length > 0);
    expect(sim.state.hostiles[0]!.standoff).toBe(fp(85));
    // walk out to meet it, then stand still and let it come
    let held = 0, shotAt = 0;
    for (let i = 0; i < 3000 && held < 60 && sim.state.hostiles.length > 0; i++) {
      const p = sim.state.player.pos, h = sim.state.hostiles[0]!, before = { ...h.pos };
      const far = gap(sim) > fp(150);
      const ev = sim.step(far ? { dx: h.pos.x - p.x, dy: h.pos.y - p.y } : { dx: 0, dy: 0 });
      for (const e of ev) if (e.t === "shot" && e.by === "hostile" && e.id === 0) shotAt = Math.max(shotAt, gap(sim));
      if (!far && h.pos.x === before.x && h.pos.y === before.y && sim.state.player.stun === 0) held++;
    }
    expect(held).toBe(60);
    expect(gap(sim)).toBeLessThanOrEqual(fp(85));
    expect(gap(sim)).toBeGreaterThan(fp(85) - sim.compiled.hostiles["hostile.boss"]!.speed * 2);
    expect(shotAt).toBeGreaterThan(sim.compiled.hostiles["hostile.boss"]!.shotRange);
  });

  it("checkManifest rejects bossStandoff on a wave without a boss", () => {
    const m = { ...bossLevel, waves: [{ t: 2, counts: { "hostile.raider_humanoid": 2 }, bossStandoff: 85 }] };
    expect(() => checkManifest(Manifest.parse(m), content)).toThrow(/bossStandoff/);
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
