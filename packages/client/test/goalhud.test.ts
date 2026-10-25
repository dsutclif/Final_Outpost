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
  });

  it("L5: waves are pips; won goals draw a star and lost ones crack", () => {
    const { sim, m, cp } = level(5);
    const t = goalTokens(sim.state, m, cp, skin);
    expect(t[0]!.glyph).toBe("waves");
    expect(t[0]!.pips?.n).toBeGreaterThan(1);
    expect(goalIcon({ ...t[1]!, state: "done" })).toContain("gstar");
    expect(goalIcon({ ...t[1]!, state: "failed" })).toContain("gcrack");
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
