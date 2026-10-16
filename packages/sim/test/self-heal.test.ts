import { describe, expect, it } from "vitest";
import { TPS } from "../src/index.js";
import { LEVEL_1, newSim } from "./helpers.js";

// R3 playtest (level 54): without a med bay an injured colonist used to stay injured for good, so a
// training pad said "no free colonist" with two of them standing right there. On a level with no med
// bay to build, the injured now mend on their own after residents.selfHealSeconds.

const injureOne = (sim: ReturnType<typeof newSim>) => {
  const r = sim.state.residents.find((x) => x.status === "ok")!;
  r.status = "injured";
  r.timer = sim.compiled.residents.selfHealTicks;
  return r;
};

describe("self-healing without a med bay", () => {
  it("an injured colonist recovers after selfHealSeconds and is free to hire again", () => {
    const sim = newSim();
    const r = injureOne(sim);
    const ticks = sim.compiled.residents.selfHealTicks;
    expect(ticks).toBe(20 * TPS);
    for (let i = 0; i < ticks - 2; i++) sim.step({ dx: 0, dy: 0 });
    expect(r.status).toBe("injured");
    let healed = false;
    for (let i = 0; i < 4; i++) healed ||= sim.step({ dx: 0, dy: 0 }).some((e) => e.t === "healed" && e.resident === r.id);
    expect(r.status).toBe("ok");
    expect(healed).toBe(true);
  });

  it("on a level with a med bay pad the injured wait for the med bay", () => {
    const withMed = { ...LEVEL_1, entities: [...LEVEL_1.entities, { type: "pad.build", id: "medic", at: [400, 760], cost: { "res.currency": 5 }, build: "struct.medical" }] };
    const sim = newSim({}, withMed);
    expect(sim.compiled.residents.selfHealTicks).toBe(0);
    const r = injureOne(sim);
    // keep the reactor fed so nobody freezes while we wait
    for (let i = 0; i < 40 * TPS; i++) { sim.state.core.fuel = Math.max(sim.state.core.fuel, 10); sim.step({ dx: 0, dy: 0 }); }
    expect(r.status).toBe("injured");
  });
});
