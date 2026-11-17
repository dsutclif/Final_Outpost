import { describe, expect, it } from "vitest";
import { PROFILES, playBot, planBot } from "@fo/bots";
import { closure, sequenceRange } from "@fo/sequencer";
import { playShapeNumbers } from "@fo/rater";
import { GEN, buildLevel, knobsFor, templateById } from "../src/index.js";

// outpost-ops#151 (151.4): harvest levels spread the bot's purchases through the level with a ladder of dearer
// hires between the farm worker and the cashier, so no play-shape phase runs over Doug's 40%.
const reqs = sequenceRange(1, 25);
const build = (i: number, p = 0.3) => {
  const r = reqs[i - 1]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p), walls: true }, salt);
    } catch { /* next layout draw */ }
  }
  return null;
};

describe("play-shape beat-breakers (harvest)", () => {
  const lv = build(8);
  const m = lv!.manifest as unknown as { entities: { id: string; requires?: { pad: string }; cost?: Record<string, number> }[] };

  it("chains farm worker -> late hires -> cashier, each dearer than the last", () => {
    expect(reqs[7]!.family).toBe("harvest");
    const byId = (id: string) => m.entities.find((e) => e.id === id)!;
    const chain = ["hire_food", ...GEN.beatBreakers.lateHires.map((h) => h.id), "hire_cashier"];
    for (let k = 1; k < chain.length; k++) {
      expect(byId(chain[k]!).requires?.pad).toBe(chain[k - 1]);
      expect(byId(chain[k]!).cost!["res.currency"]!).toBeGreaterThan(byId(chain[k - 1]!).cost!["res.currency"]!);
    }
    // the bot plans every ladder hire
    const plan = planBot(lv!.manifest).steps.map((s) => s.pad);
    for (const id of chain) expect(plan).toContain(id);
  });

  it("keeps the bot's longest phase on the harvest beat sheet at or under 0.40", () => {
    const run = playBot(lv!.manifest, PROFILES["good"]!, 1);
    const pays = run.trace.shapeBeats.filter((b) => b.beat.startsWith("act:pay:")).map((b) => b.beat);
    expect(pays).toEqual(expect.arrayContaining(["act:pay:hire_food_b", "act:pay:hire_core_b"]));
    const n = playShapeNumbers(run.trace.beats, run.goalTicks ?? run.ticks, run.trace.shapeBeats);
    expect(n.maxPhaseShare).toBeLessThanOrEqual(0.4);
  });
});
