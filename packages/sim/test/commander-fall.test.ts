import { describe, expect, it } from "vitest";
import { FP, TPS, createSim, fp, commanderDownLeft } from "../src/index.js";
import { LEVEL_4, idle } from "./helpers.js";

// Commander knock-down rules (backlog #167-#169): three modes by what the level has.

type Loose = Record<string, any>;
const base = LEVEL_4 as Loose;
const isBay = (e: Loose) => e.type === "struct.medical" || (e.type === "pad.build" && e.build === "struct.medical");
const make = (mode: "self" | "bay" | "medic") => createSim({
  ...base, id: "test-c3", params: { ...base.params, "player.commanderRules": 1 }, waves: [{ t: 9999, counts: { "hostile.creature": 1 }, side: "n", gap: 1 }],
  entities: mode === "self" ? base.entities.filter((e: Loose) => !isBay(e)) : base.entities,
  people: mode === "medic" ? [{ role: "role.medic" }] : [],
} as never);
const quiet = (sim: ReturnType<typeof make>) => { sim.state.hostiles.length = 0; sim.state.waves.quietUntil = 1e9; };

describe("commander modes", () => {
  it("legacy is the default: hp 0 is a short knock-down and a full refill, never a lost level", () => {
    const sim = createSim({ ...base, id: "test-legacy", waves: [{ t: 9999, counts: { "hostile.creature": 1 }, side: "n", gap: 1 }] } as never);
    expect(sim.compiled.player.mode).toBe("legacy");
    const st = sim.state, def = sim.compiled.hostiles["hostile.raider_humanoid"]!;
    st.hostiles.length = 0; st.player.hp = 1;
    for (let i = 0; i < 6; i++) st.hostiles.push({ id: st.nextHostileId++, type: "hostile.raider_humanoid", pos: { x: st.player.pos.x + fp(30 + i), y: st.player.pos.y }, hp: def.hp, hpMax: def.hp, side: "n", target: "core", acc: 0 } as never);
    const ev = idle(sim, 10 * TPS, (e) => e.some((x) => x.t === "downed"));
    expect(ev.some((e) => e.t === "downed")).toBe(true);
    expect(st.player.hp).toBe(sim.compiled.player.hp);
    expect(st.player.down).toBeUndefined();
    expect(st.over).toBe(false);
  });

  it("are picked from what the level has", () => {
    expect(make("self").compiled.player.mode).toBe("self");
    expect(make("bay").compiled.player.mode).toBe("bay");
    expect(make("medic").compiled.player.mode).toBe("medic");
  });

  it("self: he heals himself once left alone", () => {
    const sim = make("self"), K = sim.compiled.player;
    quiet(sim);
    sim.state.player.hp = 1; sim.state.player.healCd = K.healDelayTicks;
    idle(sim, K.healDelayTicks + K.healTicks * (K.hp + 2));
    expect(sim.state.player.hp).toBe(K.hp);
  });

  it("self: hp 0 loses the level, with no knock-down", () => {
    const sim = make("self");
    const st = sim.state, def = sim.compiled.hostiles["hostile.raider_humanoid"]!;
    sim.state.hostiles.length = 0;
    st.player.hp = 1; st.player.healCd = 1e9;
    for (let i = 0; i < 6; i++) st.hostiles.push({ id: st.nextHostileId++, type: "hostile.raider_humanoid", pos: { x: st.player.pos.x + fp(30 + i), y: st.player.pos.y }, hp: def.hp, hpMax: def.hp, side: "n", target: "core", acc: 0 } as never);
    const ev = idle(sim, 20 * TPS);
    expect(ev.some((e) => e.t === "downed")).toBe(false);
    expect(st.over).toBe(true);
    expect(st.won).toBe(false);
    expect(st.reason).toBe("commander_down");
  });

  it("bay: no regen on his own, so he stays hurt until the med bay heals him", () => {
    const sim = make("bay"), K = sim.compiled.player;
    quiet(sim);
    sim.state.player.hp = 2; sim.state.player.healCd = 0;
    idle(sim, K.healDelayTicks + K.healTicks * 4);
    expect(sim.state.player.hp).toBe(2);
    const bay = { id: "bay", type: "struct.medical", pos: { x: fp(300), y: fp(300) }, level: 1, acc: 0 };
    sim.state.structures.push(bay as never);
    const def = sim.compiled.structures["struct.medical"]!;
    sim.state.player.pos = { x: bay.pos.x + def.healOffset.x, y: bay.pos.y + def.healOffset.y };
    idle(sim, Math.max(1, def.healTicks) + 5);
    expect(sim.state.player.hp).toBe(K.hp);
  });

  it("medic: knocked down at the down line; with nobody to heal him the clock runs out and the level is lost", () => {
    const sim = make("medic"), K = sim.compiled.player;
    quiet(sim);
    sim.state.residents.length = 0;
    sim.state.player.down = 0; sim.state.player.hp = 3;
    expect(commanderDownLeft(sim.state, sim.compiled)).toBe(K.knockTicks);
    idle(sim, K.knockTicks - 5);
    expect(sim.state.over).toBe(false);
    expect(sim.state.player.hp).toBe(3);
    idle(sim, 10);
    expect(sim.state.over).toBe(true);
    expect(sim.state.reason).toBe("commander_down");
  });

  it("medic: a medic heals him in place after the fall and he is up at full hp", () => {
    const sim = make("medic"), K = sim.compiled.player, st = sim.state;
    quiet(sim);
    const m = st.residents.find((r) => sim.compiled.roles[r.role]?.behavior === "medic")!;
    m.pos = { x: st.player.pos.x + 20 * FP, y: st.player.pos.y };
    st.player.down = 0; st.player.hp = 3;
    const ev = idle(sim, K.knockTicks - 10, () => st.player.down === undefined);
    expect(st.player.down).toBeUndefined();
    expect(st.player.hp).toBe(K.hp);
    expect(st.over).toBe(false);
    expect(ev.some((e) => e.t === "medic_heal" && e.resident === -1)).toBe(true);
  });
});
