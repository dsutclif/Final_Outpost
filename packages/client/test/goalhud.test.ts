import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Manifest } from "@fo/content";
import { TPS, createSim } from "@fo/sim";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { describe, expect, it } from "vitest";
import { alertMarks, alertOf, goalIcon, goalTokens } from "../src/goalhud.js";

// The floating HUD's goal icons (docs/mockups/hud-header-options.html): each goal kind maps to a
// glyph and its channels, and the urgent alert picks the colony freezing over a goal at risk.

const skin = getSkin(DEFAULT_SKIN);
// levels 1-5 are the hand-made story levels; the pack holds 6-50 (regenerated, so goals are picked by kind)
const level = (n: number, over?: Partial<Manifest>) => {
  const file = n <= 5 ? `story/story-L${String(n).padStart(3, "0")}.json` : `packs/s1/s1-L${String(n).padStart(3, "0")}.json`;
  const raw = JSON.parse(readFileSync(resolve(__dirname, `../../../levels/${file}`), "utf8"));
  const sim = createSim({ ...(raw.manifest ?? raw), ...over } as Manifest);
  return { sim, m: sim.compiled.manifest, cp: sim.compiled };
};

describe("goal icons", () => {
  it("L1: heat hold is a thermometer with a hold ring and its 70% line; the stars guard fuel and the 35% floor", () => {
    // no shipped level holds heat any more, so the first story level is given one
    const { sim, m, cp } = level(1, {
      goal: { type: "heat_hold", pct: 70, seconds: 85 },
      objectives: [
        { id: "main", kind: "heat_hold", params: { pct: 70, seconds: 85 } },
        { id: "challenge2", kind: "settlement_never_freezes", params: {} },
        { id: "challenge", kind: "heat_floor", params: { pct: 35 } },
      ],
    } as Partial<Manifest>);
    const t = goalTokens(sim.state, m, cp, skin);
    expect(t.map((x) => x.glyph)).toEqual(["thermo", "flame", "thermo"]);
    expect(t[0]!.ring?.mode).toBe("hold");
    expect(t[0]!.tick).toBeCloseTo(0.7);
    expect(t[2]!.floor).toBe(true);
    expect(t[2]!.tick).toBeCloseTo(0.35);
    expect(t.every((x) => x.label.length > 0)).toBe(true);
  });

  it("protein fills, the time star is a full stopwatch at the start, tow trips are three pips", () => {
    const { sim, m, cp } = level(34);
    const t = goalTokens(sim.state, m, cp, skin);
    expect(t.map((x) => x.glyph)).toEqual(["meat", "stopwatch", "pod"]);
    expect(t[1]!.pie).toBeCloseTo(1);
    expect(t[2]!.pips).toEqual({ n: 3, done: 0, part: 0 });
    // only count goals carry a number: protein shows its target, the stopwatch and pips do not
    expect(t.map((x) => x.beside)).toEqual(["31", undefined, undefined]);
    // every tracker shows its current number: 0 protein, the stopwatch's full 3:55, 0 trips
    expect(t.map((x) => x.inner)).toEqual(["0", "3:55", "0"]);
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
    const { sim, m, cp } = level(34);
    const st = sim.state;
    const time = st.objectives.find((o) => o.kind === "time_target")!;
    time.target = 600;
    time.progress = 600 - 5 * TPS;
    expect(alertOf(st, m, cp, goalTokens(st, m, cp, skin))).toEqual({ kind: "goal", id: time.id });
    st.core.fuel = 0;
    expect(alertOf(st, m, cp, goalTokens(st, m, cp, skin)).kind).toBe("heat");
  });

  it("marks everything at risk at once, one mark per object, the worst case within each goal (R5 #16)", () => {
    const marks = (l: ReturnType<typeof level>) => alertMarks(l.sim.state, l.m, l.cp, goalTokens(l.sim.state, l.m, l.cp, skin));

    const calm = level(34);
    expect(marks(calm)).toEqual([]);
    calm.sim.state.core.fuel = 0;
    expect(marks(calm)).toEqual([{ kind: "core" }]);
    calm.sim.state.over = true;
    expect(marks(calm)).toEqual([]);

    // walls falling and a gate star at risk name the same gate: one mark, however many dangers point at it
    const g = level(5);
    const st = g.sim.state;
    const b = st.barriers.find((x) => x.sections.some((s) => s.gate))!;
    for (const s of b.sections) { s.built = true; s.hp = s.hpMax; }
    const i = b.sections.findIndex((s) => s.gate);
    b.sections[i]!.hp = 1;
    st.meters.baseHealthMax = 100;
    st.meters.baseHealth = 1;
    const gate = { kind: "gate", barrier: b.id, section: i };
    expect(marks(g).filter((k) => k.kind === "gate")).toEqual([gate]);

    // the freeze and a trader running out of patience show together; the most impatient trader only
    const h = level(8);
    const q = h.sim.state.sales!.queue;
    const base = { kind: "unit.customer", res: "res.food_raw_1", want: 1, patienceMax: 120, pos: { x: 0, y: 0 }, angry: false };
    q.push({ ...base, id: 998, patience: 15 } as never, { ...base, id: 999, patience: 10 } as never);
    h.sim.state.core.fuel = 0;
    expect(marks(h)).toEqual([{ kind: "core" }, { kind: "customer", id: 999 }]);
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
  it("always shows the time left; the pie sweeps just the last 30 seconds", () => {
    const { sim, m, cp } = level(34);
    const st = sim.state;
    const time = st.objectives.find((o) => o.kind === "time_target")!;
    time.target = 3000;
    time.progress = 3000 - 125 * TPS;
    const early = goalTokens(st, m, cp, skin).find((t) => t.id === time.id)!;
    expect(early.inner).toBe("2:05");
    expect(early.pie).toBeCloseTo(125 * TPS / 3000, 2);
    time.progress = 3000 - 28 * TPS + 5;
    const t = goalTokens(st, m, cp, skin).find((x) => x.id === time.id)!;
    expect(t.inner).toBe("28");
    expect(t.pie).toBeCloseTo(28 / 30, 1);
    expect(goalIcon(t)).toContain(">28</text>");
  });
});
