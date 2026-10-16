import { describe, expect, it } from "vitest";
import { fp } from "../src/index.js";
import { LEVEL_4, newSim } from "./helpers.js";

// R3 playtest: surviving a wave sweeps its leftover loot (anything hostiles drop) into the hero's
// pack, up to the carry caps; drops no hostile makes stay where they fell.

describe("wave-clear loot sweep", () => {
  it("collects leftover hostile drops on wave clear, up to the cap, and leaves other drops", () => {
    const sim = newSim({}, LEVEL_4), st = sim.state;
    const cap = sim.compiled.resources["res.salvage"]!.cap!;
    st.player.stack.length = 0;
    for (let i = 0; i < cap + 3; i++) st.drops.push({ id: st.nextDropId++, res: "res.salvage", pos: { x: fp(20 + i), y: fp(880) } });
    const loot = new Set(Object.values(sim.compiled.hostiles).flatMap((h) => Object.keys(h.drops)));
    const other = Object.keys(sim.compiled.resources).find((r) => !loot.has(r) && sim.compiled.resources[r]!.cap !== null)!;
    st.drops.push({ id: st.nextDropId++, res: other, pos: { x: fp(30), y: fp(880) } });
    st.waves.idx = sim.compiled.waves.length; // every wave already spawned
    st.waves.active = true;
    st.waves.pending.length = 0;
    st.hostiles.length = 0;
    const ev = sim.step({ dx: 0, dy: 0 });
    expect(ev.some((e) => e.t === "wave_cleared")).toBe(true);
    expect(st.player.stack.filter((r) => r === "res.salvage").length).toBe(cap);
    expect(st.drops.filter((d) => d.res === "res.salvage").length).toBe(3);
    expect(st.drops.some((d) => d.res === other)).toBe(true);
  });

  it("picks up ground drops within the shooting range", () => {
    const sim = newSim({}, LEVEL_4);
    expect(sim.compiled.drops.pickupRange).toBe(fp(90));
  });
});
