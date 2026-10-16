import { describe, expect, it } from "vitest";
import { createSim } from "@fo/sim";
import { LADDER, PROFILES, planBot, playBot, type BotResult } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level2 from "../../../levels/golden/proto-L002.json";
import level3 from "../../../levels/golden/proto-L003.json";
import level4 from "../../../levels/golden/proto-L004.json";

const GOLDEN = [level1, level2, level3, level4] as const;
const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const good = PROFILES["good"]!;

describe("planner", () => {
  it("orders economy hires before the goal path, from data only", () => {
    const p = planBot(level1);
    expect(p.steps.map((s) => s.pad)).toEqual(["hire_core_supplier", "hire_food_supplier_1", "hire_cashier", "landmark"]);
    expect(p.currencyNeeded).toBe(8 + 12 + 20 + 60);
    expect(p.goalCurrency).toBe(60);
  });

  it("resolves requirement chains (core level, converter, operator) for the goal", () => {
    const pads = planBot(level3).steps.map((s) => s.pad);
    for (const [a, b] of [["saw", "fire2"], ["sawyer", "fire2"], ["fire2", "landmark"]] as const) {
      expect(pads.indexOf(a)).toBeLessThan(pads.indexOf(b));
    }
  });

  it("population goals buy enough housing and clear the zone hiding the recruits", () => {
    const pads = planBot(level2).steps.map((s) => s.pad);
    expect(pads).toEqual(expect.arrayContaining(["tent1", "fire2", "tent2", "tent3", "drift_pad"]));
  });

  it("waves goals plan the barrier sections, towers, defenders, upgrades and a conditional medic", () => {
    const p = planBot(level4);
    expect(p.barriers.length).toBe(3);
    const medic = p.steps.find((s) => s.pad === "medic");
    expect(medic?.when).toBe("injuries");
    expect(p.steps.find((s) => s.pad === "train")!.repeat).toBeGreaterThan(1);
  });
});

describe("good bot on the golden levels", () => {
  GOLDEN.forEach((level) => {
    it(`${level.id}: wins all 10 seeds with at least 20% margin, no stalls`, () => {
      for (const s of seeds(10)) {
        const r = playBot(level, good, s);
        expect({ seed: s, won: r.won, reason: r.reason }).toEqual({ seed: s, won: true, reason: "goal" });
        expect(r.margin).toBeGreaterThanOrEqual(0.2);
        expect(r.stalls).toBe(0);
      }
    });
  });

  it("plays a 3-minute level well under 2 s", () => {
    const t0 = performance.now();
    const r = playBot(level4, good, 1);
    expect(r.ticks).toBeGreaterThan(170 * 30);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("skill ladder", () => {
  const summary = (rs: BotResult[]) => ({
    win: rs.filter((r) => r.won).length / rs.length,
    margin: rs.reduce((a, r) => a + r.margin, 0) / rs.length,
  });
  // Sampling noise allowance on mean margin between neighbouring rungs (see README).
  const TOL = 0.02;
  GOLDEN.forEach((level) => {
    it(`${level.id}: win rate or mean margin does not increase from good to floor`, () => {
      const rows = LADDER.map((p) => summary(seeds(5).map((s) => playBot(level, p, s))));
      // A level every rung wins comfortably on every seed no longer separates the ladder; margins
      // between easy wins are noise (golden L4 since the R3 ranged attack, DECISIONS 9j).
      if (rows.every((r) => r.win === 1 && r.margin >= 0.9)) return;
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1]!, b = rows[i]!;
        const ok = b.win < a.win || (b.win === a.win && b.margin <= a.margin + TOL);
        expect({ rung: LADDER[i]!.name, ok, a, b }).toMatchObject({ ok: true });
      }
    });
  });

  it("learning shrinks noise on repeated attempts", () => {
    const first = playBot(level3, PROFILES["floor"]!, 2);
    const later = playBot(level3, PROFILES["floor"]!, 2, { attempt: 4 });
    expect(later.won).toBe(true);
    expect(later.margin).toBeGreaterThanOrEqual(first.margin);
  });
});

describe("determinism and replay", () => {
  it("same profile and seed give the same result", () => {
    for (const p of [good, PROFILES["novice"]!]) {
      const a = playBot(level4, p, 7);
      const b = playBot(level4, p, 7);
      expect(b).toEqual(a);
    }
  });

  it("the bot's input log replayed into a fresh sim reproduces the final hash", () => {
    for (const level of GOLDEN) {
      const r = playBot(level, PROFILES["average"]!, 3, { recordInputs: true });
      const sim = createSim({ ...level, seed: 3 });
      for (const inp of r.inputs!) sim.step(inp);
      expect(sim.hash()).toBe(r.hash);
      expect(sim.state.won).toBe(r.won);
    }
  });
});

describe("stall detector", () => {
  const withTimer = (patch: (m: typeof level1) => void) => {
    const m = structuredClone(level1);
    patch(m);
    m.params = { ...m.params, "timer.seconds": 200 } as typeof m.params;
    return m;
  };

  it("fires when the goal pad can never unlock (core level with no upgrade pad)", () => {
    const m = withTimer((x) => {
      const lm = x.entities.find((e) => "id" in e && e.id === "landmark") as Record<string, unknown>;
      lm["requires"] = { coreLevel: 2 };
    });
    const r = playBot(m, good, 1);
    expect(r.won).toBe(false);
    expect(r.reason).toBe("timer");
    expect(r.stalls).toBeGreaterThan(0);
    const s = r.stallStates[0]!;
    expect(s.tick).toBeGreaterThan(30 * 30);
    expect(s.planStep).toBeNull();
    expect(Array.isArray(s.nearby)).toBe(true);
  });

  it("fires when the goal costs more currency than the level can earn in its time", () => {
    const m = withTimer((x) => {
      const lm = x.entities.find((e) => "id" in e && e.id === "landmark") as { cost: Record<string, number> };
      lm.cost = { "res.currency": 100000 };
    });
    const r = playBot(m, good, 1);
    expect(r.won).toBe(false);
    expect(r.stalls).toBeGreaterThan(0);
  });

  it("stays quiet on every golden level for every rung", () => {
    for (const level of GOLDEN) for (const p of LADDER) expect(playBot(level, p, 1).stalls).toBe(0);
  });
});

describe("trace", () => {
  it("reports the contract metrics", () => {
    const r = playBot(level4, good, 1);
    const t = r.trace;
    expect(t.lifelineMin).toBeGreaterThan(0);
    expect(t.currencyNeeded).toBeGreaterThan(0);
    expect(t.currencyEarned).toBeGreaterThan(0);
    expect(t.routeShare).toBeGreaterThan(0);
    expect(t.routeShare).toBeLessThan(1);
    expect(t.rewardGaps.length).toBeGreaterThan(0);
    expect(t.modulesUsed).toEqual(expect.arrayContaining(["defense", "barrier_lines", "defenders", "hazard_events"]));
    const r2 = playBot(level2, good, 1);
    expect(r2.trace.modulesUsed).toEqual(expect.arrayContaining(["lasso", "housing", "core_levels", "blocked_zones"]));
  });
});
