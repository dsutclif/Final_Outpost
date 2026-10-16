import { beforeAll, describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { computeReference, historyEntry, measure, qualityFilters, rate, rateBatch, type Rating } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level2 from "../../../levels/golden/proto-L002.json";
import level3 from "../../../levels/golden/proto-L003.json";
import level4 from "../../../levels/golden/proto-L004.json";

const GOLDEN = [level1, level2, level3, level4];
const FAST = { refSeeds: 2, otherSeeds: 1 };
const l1 = () => structuredClone(level1) as typeof level1 & { params: Record<string, number> };
const landmark = (m: typeof level1) => m.entities.find((e) => "id" in e && e.id === "landmark") as Record<string, unknown>;

describe("golden ratings", () => {
  let batch: Rating[];
  // Rates all four levels with the default seeds (44 bot runs): give the hook room under parallel load.
  beforeAll(() => { batch = rateBatch(GOLDEN); }, 180_000);

  it("D and F are strictly inside (0, 1)", () => {
    for (const r of batch) {
      for (const v of [r.D, r.F]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
    }
  });

  it("are deterministic", () => {
    const again = rate(level1);
    expect(again).toEqual(batch[0]);
  });

  it("are ordered sensibly: level 1 is the easiest, level 4 the hardest", () => {
    const D = batch.map((r) => r.D);
    expect(Math.min(...D)).toBe(D[0]);
    expect(Math.max(...D)).toBe(D[3]);
  });

  it("every golden level is feasible for the reference bot", () => {
    for (const r of batch) { expect(r.feasible).toBe(true); expect(r.botsPassed[0]).toBe("good"); }
  });

  it("reports the spec metrics", () => {
    const m = batch[3]!.metrics;
    expect(m.moduleCount).toBe(9);
    expect(m.economyTightness).toBeGreaterThan(0);
    expect(batch[1]!.metrics.novelty).toBeGreaterThan(0); // level 2 adds modules level 1 never had
  });
});

describe("quality filters", () => {
  it("idle module: level 1's source gating is never needed on a winning path", () => {
    const r = rate(level1, FAST);
    expect(r.filters.idleModule).toBe(true);
    expect(r.evidence.idleModules).toEqual(["source_gating"]);
  });

  it("trivial: a goal so cheap the weakest bot wins in well under 40% of the budget", () => {
    const m = l1();
    landmark(m)["cost"] = { "res.currency": 4 };
    // prices only: no automation tax, so the goal stays as cheap as it says; a long budget, so even the
    // weakest bot (about 130 s here) finishes well inside the trivial share of it
    (m as { params: Record<string, number> }).params["pads.automationGrowth"] = 1;
    (m as { params: Record<string, number> }).params["level.budgetSeconds"] = 600;
    // Without the golden heat-floor star, whose policy keeps every bot feeding the core (bots README).
    delete (m as { objectives?: unknown }).objectives;
    expect(rate(m, FAST).filters.trivial).toBe(true);
    expect(rate(level3, FAST).filters.trivial).toBe(false);
  });

  it("stall: a goal pad that can never unlock", () => {
    const m = l1();
    landmark(m)["requires"] = { coreLevel: 2 };
    m.params = { ...m.params, "timer.seconds": 120 };
    const r = rate(m, FAST);
    expect(r.filters.stall).toBe(true);
    expect(r.feasible).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("unreadable: overlapping interaction radii, or a key station off-screen from the core", () => {
    const near = l1();
    landmark(near)["at"] = [250, 450]; // inside the core's range
    expect(rate(near, FAST).evidence.unreadable.some((s) => s.startsWith("overlap"))).toBe(true);
    const far = l1();
    landmark(far)["at"] = [240, 880];
    const r = rate(far, FAST);
    expect(r.filters.unreadable).toBe(true);
    expect(r.evidence.unreadable.some((s) => s.startsWith("offscreen landmark"))).toBe(true);
    expect(rate(level3, FAST).filters.unreadable).toBe(false);
  });

  it("duplicate: same module set, goal and template as a recent level", () => {
    const r = rate(level1, { ...FAST, history: [historyEntry(level2), historyEntry(level1)] });
    expect(r.filters.duplicate).toBe(true);
    expect(r.evidence.duplicateOf).toBe("proto-L001");
    expect(rate(level1, { ...FAST, history: [historyEntry(level2)] }).filters.duplicate).toBe(false);
  });
});

describe("reference stats", () => {
  it("recomputes mean and sd per metric from a batch", () => {
    const ms = [level1, level3].map((m) => measure(m, FAST));
    const ref = computeReference(ms, "test");
    expect(ref.n).toBe(2);
    const mr = ms.map((x) => x.metrics.marginRef);
    expect(ref.metrics.marginRef.mean).toBeCloseTo((mr[0]! + mr[1]!) / 2, 5);
    expect(ref.metrics.marginRef.sd).toBeGreaterThan(0);
    expect(ref.byGoal).toBeUndefined(); // fewer than three levels per goal type
  });
});
