import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";

// outpost-ops#85: settings that are not difficulty levers are constants, and the map dressing comes from the level seed,
// so two candidates of one request at different search pressure share fuel, cash, prices and map dressing.
const reqs = sequenceRange(1, 60);
const mk = (i: number, p: number, mut: Record<string, number> = {}) => {
  const r = reqs[i]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p, mut), walls: true }, salt);
    } catch { /* next layout draw */ }
  }
  return null;
};
const jitter = Object.fromEntries(Object.keys(GEN.knobs).map((k, n) => [k, (n % 2 ? 1 : -1) * GEN.jitter]));
const dressing = (b: NonNullable<ReturnType<typeof mk>>) => {
  const m = b.manifest as unknown as { entities: { type: string; params?: Record<string, unknown> }[] };
  const counts: Record<string, number> = {};
  for (const e of m.entities) if (e.type.startsWith("node.") && e.type !== "node.salvage_pile" || e.type.startsWith("capture.")) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
};

describe("fixed generator settings (outpost-ops#85)", () => {
  it("has equal ends on every knob except the four real levers and the dressing knobs", () => {
    // pods and crates are rescue dials (familyKnobs.rescue): the search sets them from the slot's target
    const free = new Set(["burn", "length", "swarm", "waves", "pods", "crates", "machines", ...GEN.dressing]);
    for (const [k, [a, b]] of Object.entries(GEN.knobs)) if (!free.has(k)) expect(a, k).toBe(b);
    expect(GEN.knobs.reach).toBeUndefined();
    expect(GEN.knobs.fuel0).toEqual([0.75, 0.75]);
    expect(GEN.knobs.startCurrency).toEqual([0, 0]);
    expect(GEN.knobs.costScale).toEqual([1, 1]);
  });

  it("two candidates at different search pressure share fuel, cash, prices and map dressing", () => {
    let checked = 0;
    for (let i = 0; i < reqs.length && checked < 6; i++) {
      if (reqs[i]!.family === "defend" || reqs[i]!.family === "rescue") continue; // rescue: pod and crate counts are dials now (below) // defend prices are also resized by wave sizing
      const lo = mk(i, 0.1), hi = mk(i, 0.9, jitter);
      if (!lo || !hi) continue;
      checked++;
      const pm = (b: typeof lo) => b.manifest as unknown as { params: Record<string, unknown>; entities: { type: string; id?: string; params?: Record<string, unknown>; cost?: unknown }[] };
      expect(pm(hi).params["start.currency"], reqs[i]!.id).toBe(pm(lo).params["start.currency"]);
      expect(pm(lo).params["start.currency"]).toBe(0);
      expect(pm(hi).entities.find((e) => e.type === "sink.core")?.params?.fuel, reqs[i]!.id).toBe(pm(lo).entities.find((e) => e.type === "sink.core")?.params?.fuel);
      const costs = (b: typeof lo) => pm(b).entities.filter((e) => e.type === "pad.build").map((e) => [e.id, JSON.stringify(e.cost)]);
      expect(costs(hi), reqs[i]!.id).toEqual(costs(lo));
      expect(dressing(hi), reqs[i]!.id).toEqual(dressing(lo));
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it("rescue pod and crate counts are search dials (3-6 pods, 2-5 crates) and follow the pressure", () => {
    expect(GEN.dressing).not.toContain("pods");
    expect(GEN.dressing).not.toContain("crates");
    const fk = (GEN.familyKnobs as Record<string, Record<string, [number, number]>>).rescue!;
    expect(fk.pods).toEqual([3, 6]);
    expect(fk.crates).toEqual([2, 5]);
    expect(knobsFor(0, {}, "rescue").pods).toBe(3);
    expect(knobsFor(1, {}, "rescue").pods).toBe(6);
    expect(knobsFor(0, {}, "rescue").crates).toBe(2);
    expect(knobsFor(1, {}, "rescue").crates).toBe(5);
    // built: more captives at high pressure than at low, on a level that carries crates
    const count = (b: NonNullable<ReturnType<typeof mk>>, type: string) => (b.manifest as unknown as { entities: { type: string }[] }).entities.filter((e) => e.type === type).length;
    let checked = 0, moreCrates = 0;
    for (let i = 0; i < reqs.length && checked < 4; i++) {
      const r = reqs[i]!;
      if (r.family !== "rescue" || r.goalType === "crates" || !r.features.includes("crates")) continue;
      const build = (pr: number) => { for (let salt = 0; salt < GEN.search.layoutTries; salt++) { try {
        return buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
          modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(pr, {}, "rescue"), walls: true }, salt); } catch { /* next */ } } return null; };
      const lo = build(0), hi = build(1);
      if (!lo || !hi) continue;
      checked++;
      expect(count(hi, "capture.recruit_container")).toBeGreaterThan(count(lo, "capture.recruit_container"));
      // crowded maps can leave a crate unplaced, so the crate count is checked across levels
      if (count(hi, "capture.supply_crate") > count(lo, "capture.supply_crate")) moreCrates++;
    }
    expect(checked).toBeGreaterThanOrEqual(2);
    expect(moreCrates).toBeGreaterThanOrEqual(1);
  });
});
