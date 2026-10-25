import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Manifest } from "@fo/content";
import { TPS, createSim } from "@fo/sim";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { describe, expect, it } from "vitest";
import { alertOf, goalIcon, goalTokens } from "../src/goalhud.js";

// The floating HUD's goal icons (docs/mockups/hud-header-options.html): each goal kind maps to a
// glyph and its channels, and the urgent alert picks the colony freezing over a goal at risk.

const skin = getSkin(DEFAULT_SKIN);
const level = (n: number) => {
  const raw = JSON.parse(readFileSync(resolve(__dirname, `../../../levels/packs/s1/s1-L${String(n).padStart(3, "0")}.json`), "utf8"));
  const sim = createSim((raw.manifest ?? raw) as Manifest);
  return { sim, m: sim.compiled.manifest, cp: sim.compiled };
};

describe("goal icons", () => {
  it("L1: heat hold is a thermometer with a hold ring and its 70% line; the stars guard fuel and the 35% floor", () => {
    const { sim, m, cp } = level(1);
    const t = goalTokens(sim.state, m, cp, skin);
    expect(t.map((x) => x.glyph)).toEqual(["thermo", "flame", "thermo"]);
    expect(t[0]!.ring?.mode).toBe("hold");
    expect(t[0]!.tick).toBeCloseTo(0.7);
    expect(t[2]!.floor).toBe(true);
    expect(t[2]!.tick).toBeCloseTo(0.35);
    expect(t.every((x) => x.label.length > 0)).toBe(true);
  });

  it("L7: protein fills, the time star is a full stopwatch at the start, tow trips are three pips", () => {
    const { sim, m, cp } = level(7);
    const t = goalTokens(sim.state, m, cp, skin);
    expect(t.map((x) => x.glyph)).toEqual(["meat", "stopwatch", "pod"]);
    expect(t[1]!.pie).toBeCloseTo(1);
    expect(t[2]!.pips).toEqual({ n: 3, done: 0, part: 0 });
    // only count goals carry a number: protein shows its target, the stopwatch and pips do not
    expect(t.map((x) => x.count)).toEqual([31, undefined, undefined]);
  });

  it("L5: waves are pips; won goals draw a star and missed ones are struck through", () => {
    const { sim, m, cp } = level(5);
    const t = goalTokens(sim.state, m, cp, skin);
    expect(t[0]!.glyph).toBe("waves");
    expect(t[0]!.pips?.n).toBeGreaterThan(1);
    expect(goalIcon({ ...t[1]!, state: "done" })).toContain("gstar");
    expect(goalIcon({ ...t[1]!, state: "failed" })).toContain("gslash");
  });
});

describe("urgent alert", () => {
  it("names a goal about to be missed, and the colony freezing ahead of it", () => {
    const { sim, m, cp } = level(7);
    const st = sim.state;
    const time = st.objectives.find((o) => o.kind === "time_target")!;
    time.target = 600;
    time.progress = 600 - 5 * TPS;
    expect(alertOf(st, m, cp, goalTokens(st, m, cp, skin))).toEqual({ kind: "goal", id: time.id });
    st.core.fuel = 0;
    expect(alertOf(st, m, cp, goalTokens(st, m, cp, skin)).kind).toBe("heat");
  });
});

describe("never-goals fill from whatever is closest to breaking them", () => {
  it("the gate star drains with the weakest gate, the customer star with the most impatient trader", () => {
    const { sim, m, cp } = level(5);
    const st = sim.state;
    const gates = st.barriers.flatMap((b) => b.sections).filter((s) => s.gate);
    expect(gates.length).toBeGreaterThan(0);
    for (const s of gates) { s.built = true; s.hp = s.hpMax; }
    gates[0]!.hp = Math.round(gates[0]!.hpMax * 0.1);
    const gate = goalTokens(st, m, cp, skin).find((t) => t.glyph === "gate")!;
    expect(gate.fill).toBeCloseTo(0.1, 1);
    expect(gate.risk).toBe(true);

    const h = level(8);
    const q = h.sim.state.sales!.queue;
    q.push({ ...(q[0] ?? {}), id: 999, kind: "unit.customer", res: "res.food_raw_1", want: 1, patience: 30, patienceMax: 120, pos: { x: 0, y: 0 }, angry: false } as never);
    const id = h.sim.state.objectives.find((o) => o.kind === "no_angry_customers")!.id;
    const face = goalTokens(h.sim.state, h.m, h.cp, skin).find((t) => t.id === id)!;
    expect(face.fill).toBeCloseTo(0.25, 2);
  });
});

describe("stopwatch face", () => {
  it("shows the whole seconds left only in the last 30", () => {
    const { sim, m, cp } = level(7);
    const st = sim.state;
    const time = st.objectives.find((o) => o.kind === "time_target")!;
    time.target = 3000;
    time.progress = 3000 - 31 * TPS;
    expect(goalTokens(st, m, cp, skin).find((t) => t.id === time.id)!.secs).toBeUndefined();
    time.progress = 3000 - 28 * TPS + 5;
    const t = goalTokens(st, m, cp, skin).find((x) => x.id === time.id)!;
    expect(t.secs).toBe(28);
    expect(goalIcon(t)).toContain(">28</text>");
  });
});
