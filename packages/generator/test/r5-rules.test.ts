import { describe, expect, it } from "vitest";
import { content, PLOT } from "@fo/content";
import { closure, sequenceRange } from "@fo/sequencer";
import sequencerData from "../../sequencer/data/sequencer.json";
import { buildLevel, knobsFor, scrapBudget, scrapNeed, stormSurvivedIdle, templateById, CHALLENGE_PLACEHOLDER, GEN } from "../src/index.js";

// R5 Sprint 2 generator rules (docs/BACKLOG-R5.md): overflow goal gone, defend scrap budget, storms, machine plots.
const reqs = sequenceRange(1, 60);
const build = (i: number, p = 0.3) => {
  const r = reqs[i - 1]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p) }, salt);
    } catch { /* next layout draw */ }
  }
  return null;
};

describe("R5 #7 overflow goal", () => {
  it("is no longer drawn, but stays registered for old manifests", () => {
    const fams = (sequencerData as { families: Record<string, { challenges: string[] }> }).families;
    for (const f of Object.values(fams)) expect(f.challenges).not.toContain("no_stockpile_overload");
    expect(Object.values(CHALLENGE_PLACEHOLDER).map((c) => c.kind)).not.toContain("no_stockpile_overload");
    expect(content.objectives["no_stockpile_overload"]).toBeDefined();
  });
});

describe("R5 defend scrap budget", () => {
  it("prices defence purchases at their rising prices, cheapest first", () => {
    const pads = [
      { type: "pad.build", build: "struct.ranged_defense", cost: { "res.salvage": 10 } },
      { type: "pad.build", build: "struct.ranged_defense.t2", cost: { "res.salvage": 20 } },
      { type: "pad.hire", role: { role: "role.defender" }, cost: { "res.salvage": 5 }, repeatable: true },
      { type: "pad.build", build: "struct.medical", cost: { "res.salvage": 7 } },
      { type: "pad.build", build: "conv.food_processor", cost: { "res.currency": 9 } },
    ];
    // flat: walls 4 + med bay 7; defence 5, 5, 10, 20 at x1, x2, x4, x8
    expect(scrapNeed(pads, 4, 2, 2, content)).toBe(4 + 7 + 5 + 10 + 40 + 160);
  });

  it("every defend level's attackers drop enough scrap for every purchase on it", () => {
    const defend = reqs.filter((r) => r.family === "defend").slice(0, 4);
    expect(defend.length).toBeGreaterThan(0);
    for (const r of defend) {
      const b = build(reqs.indexOf(r) + 1);
      if (!b) continue;
      const { need, drops } = scrapBudget(b.manifest, content);
      expect(drops, r.id).toBeGreaterThanOrEqual(need);
    }
  }, 120_000);
});

describe("R5 #29 storms", () => {
  it("a storm level is deadly once the player stops helping", () => {
    const i = reqs.findIndex((r) => (r.features ?? []).includes("dust_storms"));
    const b = build(i + 1);
    expect(b).not.toBeNull();
    const m = b!.manifest;
    // the check reports a storm the colony rides out alone; a level with an endless calm core would be one
    const calm = structuredClone(m);
    calm.events = calm.events.map((e) => ({ ...e, end: e.start + 1 }));
    expect(stormSurvivedIdle(calm, content)).not.toBeNull();
  }, 120_000);
});

describe("R5 #6 / #30b machine plots", () => {
  it("each machine has its own upgrade slot and its pickup tray on the front edge", () => {
    const plots = PLOT!.generator.plots;
    for (const t of ["conv.food_processor", "conv.material_processor", "conv.alloy_works"]) {
      const ids = plots[t]!.slots.map((s) => s.id);
      expect(ids, t).toContain("staff");
      expect(ids, t).toContain("upgrade");
      const cv = PLOT!.content.converters[t] as { operatorOffset: number[]; pickupOffset: number[] };
      expect(cv.pickupOffset[1], t).toBe(cv.operatorOffset[1]);
    }
  });

  it("the grill's level pad stands on the upgrade slot, not the staff slot", () => {
    const i = reqs.findIndex((r) => r.family === "industrialize" && (r.features ?? []).includes("converter_levels"));
    const b = build(i + 1);
    expect(b).not.toBeNull();
    const at = (id: string) => (b!.manifest.entities.find((e) => (e as { id?: string }).id === id) as { at: [number, number] } | undefined)?.at;
    const lv = at("grill_level"), cook = at("cook");
    expect(lv).toBeDefined();
    expect(lv).not.toEqual(cook);
  }, 60_000);
});
