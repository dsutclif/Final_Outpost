import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { DEFAULT_CONFIG, addonPool, featureUnlocked, optionalOf, sequence, sequenceRange, type SequencerConfig } from "@fo/sequencer";
import { GEN } from "../src/build.js";
import { composeStart, composerPool, composerSwap, estimateD, moduleCap, requiredFeatures } from "../src/composer.js";

const cfg = DEFAULT_CONFIG;
const reqs = sequenceRange(1, 60);
const at = (i: number) => reqs[i - 1]!;

describe("add-on unlock order", () => {
  it("every feature has a first level and a difficulty step", () => {
    for (const [f, d] of Object.entries(cfg.features)) {
      expect(d.firstLevel, f).toBeGreaterThan(cfg.storyLength);
      expect(d.dStep?.[0], f).toBeLessThanOrEqual(d.dStep![1]);
    }
  });

  it("no request of the pack uses a feature before it unlocks (shipped recipes stay valid)", () => {
    for (const r of reqs) for (const f of r.features)
      expect(featureUnlocked(f, r.family, r.index) || (!!r.secondary && featureUnlocked(f, r.secondary, r.index)), `${r.id} ${f}`).toBe(true);
  });

  it("rescue order: crates, then pod housing, with dust storms as a guest from the same level", () => {
    const first = (f: string) => reqs.find((r) => r.family === "rescue" && addonPool("rescue", r.index).includes(f))!.index;
    expect(first("crates")).toBeLessThan(first("pod_housing"));
    expect(first("pod_housing")).toBeLessThanOrEqual(first("dust_storms"));
    expect(featureUnlocked("dust_storms", "rescue", 11)).toBe(false);
    expect(featureUnlocked("dust_storms", "rescue", 12)).toBe(true);
    expect(featureUnlocked("dust_storms", "shelter", 12)).toBe(true);
  });

  it("borrowed add-ons: harvest and industrialize borrow dust storms, harvest the depot, industrialize bulk orders", () => {
    expect(featureUnlocked("dust_storms", "harvest", 12)).toBe(true);
    expect(featureUnlocked("depot", "harvest", 14)).toBe(false);
    expect(featureUnlocked("depot", "harvest", 15)).toBe(true);
    expect(featureUnlocked("dust_storms", "industrialize", 12)).toBe(true);
    expect(featureUnlocked("bulk_orders", "industrialize", 13)).toBe(false);
    expect(featureUnlocked("bulk_orders", "industrialize", 14)).toBe(true);
  });

  it("a guest joins only a level whose target reaches the low end of its dStep (fix 1)", () => {
    for (const r of reqs) {
      if (r.index <= cfg.storyLength) continue;
      const p = composerPool(r, GEN.conveyorGoals, content, cfg);
      for (const f of p) {
        const d = cfg.features[f]!;
        if (d.family !== r.family) expect(r.target, `${r.id} ${f}`).toBeGreaterThanOrEqual(d.dStep![0]);
      }
    }
    // a low-target harvest level never gets the depot (low end 0.08), a high one may
    const h = { ...reqs.find((r) => r.family === "harvest" && r.index >= 18 && r.phase === "mix")!, target: 0.05 };
    expect(composerPool(h, GEN.conveyorGoals, content, cfg)).not.toContain("depot");
    expect(composerPool({ ...h, target: 0.5 }, GEN.conveyorGoals, content, cfg)).toContain("depot");
  });

  it("a goal's adds count only once the feature is unlocked", () => {
    const c2 = structuredClone(cfg) as SequencerConfig;
    c2.goals["rescue_before_freeze"]!.adds = ["dust_storms"];
    c2.families["rescue"]!.guests = { dust_storms: 17 }; // pin the guest level later than Level 12 for this check
    const l12 = sequence(12, [], { config: c2 });
    expect(l12.goalType).toBe("rescue_before_freeze");
    expect(l12.features).not.toContain("dust_storms");
  });
});

describe("composer", () => {
  it("module cap follows the target bands", () => {
    expect(moduleCap(0.2)).toBe(4);
    expect(moduleCap(0.45)).toBe(5);
    expect(moduleCap(0.581)).toBe(6);
    expect(moduleCap(0.95)).toBe(7);
  });

  it("estimate is the family base plus the steps", () => {
    const e = estimateD("rescue", ["clearing_pass", "pod_timers"]);
    expect(e.lo).toBeCloseTo(cfg.composer.base.rescue + 0.45, 6);
    expect(e.hi).toBeCloseTo(cfg.composer.base.rescue + 0.75, 6);
  });

  it("required features: introduced plus goal needs; the pool leaves out avoided and locked ones", () => {
    expect(requiredFeatures(at(12))).toEqual(["pod_timers"]); // clearing_pass waits for a rescue level whose target reaches its step (L23)
    expect(requiredFeatures(at(23))).toEqual(["clearing_pass"]);
    const pool = composerPool(at(12), GEN.conveyorGoals);
    expect(pool).not.toContain("hunting"); // rescue_before_freeze avoids it
    expect(pool).toContain("dust_storms"); // a guest from Level 12, and the target (0.243) reaches its low end (0.05)
  });

  it("intro and teach levels keep only their required features", () => {
    for (const r of reqs.filter((x) => x.phase === "intro" && !cfg.composer.fixed.includes(x.family))) expect(composeStart(r, GEN.conveyorGoals).features, r.id).toEqual([...r.features].sort());
    for (const r of reqs.filter((x) => x.phase === "teach")) expect(composeStart(r, GEN.conveyorGoals).features).toEqual([]);
  });

  it("mix levels stay within the module cap unless the required set is already over it", () => {
    for (const r of reqs.filter((x) => x.phase === "mix" && !cfg.composer.fixed.includes(x.family))) {
      const c = composeStart(r, GEN.conveyorGoals);
      const base = optionalOf(composeStart({ ...r, phase: "intro", features: [] }, GEN.conveyorGoals).modules, content).length;
      expect(c.optionalModules, r.id).toBeLessThanOrEqual(Math.max(c.cap, base));
      // companions (`with`) ride along with the add-on that pulls them in
      const own = c.features.filter((f) => !c.required.includes(f) && !c.features.some((o) => o !== f && (cfg.features[o]?.with ?? []).includes(f)));
      expect(own.length, r.id).toBeLessThanOrEqual(cfg.composer.extras["mix"]!);
    }
  });

  it("the starting set's estimate is the nearest the pool allows (Level 25 takes the depot and the borrowed dust storms: closest to 0.581)", () => {
    const c = composeStart(at(25), GEN.conveyorGoals);
    expect(c.features).toEqual(["converter_levels", "depot", "dust_storms", "material_processor", "tier2"]);
    expect(c.estimate.mid).toBeLessThan(at(25).target);
  });

  it("over the cap the newest extra goes, and the drop is logged", () => {
    const c2 = structuredClone(cfg) as SequencerConfig;
    c2.composer.moduleCap = [[1, 4]];
    const r = { ...at(25) };
    const c = composeStart(r, GEN.conveyorGoals, content, c2);
    expect(c.optionalModules).toBeLessThanOrEqual(Math.max(4, optionalOf(composeStart({ ...r, phase: "intro", features: [] }, GEN.conveyorGoals, content, c2).modules, content).length));
    expect(c.dropped.length).toBeGreaterThan(0);
  });

  it("defend keeps the sequencer's set and never swaps", () => {
    const r = at(21);
    expect(composeStart(r, GEN.conveyorGoals).features).toEqual([...r.features].sort());
    expect(composerSwap(r, composeStart(r, GEN.conveyorGoals), [0.9], 0.05, 0).action).toBe("none");
  });

  it("swaps: drop the largest step when every D is over, add the best fit when every D is under, else keep; at most maxSwaps", () => {
    const r = at(17); // rescue protein mix level
    const c = composeStart(r, GEN.conveyorGoals);
    const hard = composerSwap(r, { ...c, features: [...c.features, "crates"].sort() }, [r.target + 0.3, r.target + 0.2], 0.05, 0);
    expect(hard.action).toBe("remove");
    expect(hard.next!.features).not.toContain(hard.feature);
    const easy = composerSwap(r, c, [r.target - 0.3], 0.05, 0);
    expect(easy.action).toBe("add");
    expect(easy.next!.features).toContain(easy.feature);
    expect(composerSwap(r, c, [r.target - 0.2, r.target + 0.2], 0.05, 0).action).toBe("none");
    expect(composerSwap(r, c, [r.target - 0.3], 0.05, cfg.composer.maxSwaps).action).toBe("none");
    // nothing feasible counts as too hard
    expect(composerSwap(r, { ...c, features: [...c.features, "crates"].sort() }, [], 0.05, 0).action).toBe("remove");
  });
});

describe("composer knob ranges and automate keep-up", () => {
  it("family knob ranges replace the shared ones (cost scale up to 1.4, fuel burn, rescue pod clock)", async () => {
    const { knobsFor } = await import("../src/build.js");
    const fk = GEN.familyKnobs as Record<string, Record<string, [number, number]>>;
    for (const fam of ["shelter", "rescue", "harvest", "industrialize", "defend"] as const) {
      expect(fk[fam]!["costScale"], fam).toBeDefined();
      expect(knobsFor(1, {}, fam).costScale).toBeCloseTo(fk[fam]!["costScale"]![1], 6);
      expect(fk[fam]!["costScale"]![1]).toBeLessThanOrEqual(1.4);
    }
    expect(knobsFor(0, {}, "rescue").podFreeze).toBeGreaterThan(knobsFor(1, {}, "rescue").podFreeze);
    expect(knobsFor(1, {}, "industrialize").burn).toBeLessThan(knobsFor(1).burn);
    // without a family the shared ends hold
    expect(knobsFor(1).costScale).toBe(GEN.knobs["costScale"]![1]);
  });

  it("automate: a server's carry covers a round trip at the fastest rate each converter can reach on the level", async () => {
    const { buildLevel, knobsFor, templateById } = await import("../src/build.js");
    const { closure } = await import("@fo/sequencer");
    // Level 25's slot: goal ranges move it off automate, so the goal is set here
    const slot = { ...at(25), goalType: "automate", goalId: "automate" };
    const r = composeStart(slot, GEN.conveyorGoals);
    const req = { ...slot, features: r.features, modules: r.modules };
    let m = null;
    for (let salt = 0; salt < GEN.search.layoutTries && !m; salt++) {
      try { m = buildLevel({ id: req.id, seed: req.seed, target: req.target, family: req.family, secondary: null, features: req.features, goalType: req.goalType, modules: closure(req.modules), template: templateById(req.template), knobs: knobsFor(0.5, {}, req.family) }, salt).manifest; } catch { /* next salt */ }
    }
    expect(m).not.toBeNull();
    const pads = m!.entities.filter((e) => e.type === "pad.build") as unknown as { id: string; at: [number, number]; build: string; target?: string; repeatable?: boolean }[];
    const shop = m!.entities.find((e) => e.type === "sink.sales_point") as unknown as { at: [number, number] } | undefined;
    expect(shop).toBeDefined();
    const convs = pads.filter((p) => p.build.startsWith("conv.") && p.build !== "conv.level");
    expect(convs.length).toBeGreaterThan(0);
    const rate = (p: (typeof convs)[number]) => {
      const d = content.converters[p.build]!, ups = pads.filter((q) => q.build === "conv.level" && q.target === p.id);
      const lv = ups.length === 0 ? 0 : ups.some((q) => q.repeatable) ? d.upgradeRates.length : Math.min(ups.length, d.upgradeRates.length);
      return 1 / (lv === 0 ? d.rate : d.upgradeRates[lv - 1]!);
    };
    const carry = m!.params["residents.serverCarry"]!;
    expect(carry).toBeGreaterThanOrEqual(3);
    // a converter that cannot be upgraded on this level never needs the top-level carry
    if (shop) for (const p of convs) {
      const trip = (2 * (Math.hypot(p.at[0] - shop.at[0], p.at[1] - shop.at[1]) + 60)) / 160 + 3;
      expect(carry).toBeGreaterThanOrEqual(Math.min(40, Math.ceil(rate(p) * trip)));
    }
  }, 120_000);
});
