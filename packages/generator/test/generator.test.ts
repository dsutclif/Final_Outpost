import { describe, expect, it } from "vitest";
import { content, checkManifest, Manifest as ManifestSchema } from "@fo/content";
import { createSim, outsideLines, fp } from "@fo/sim";
import { planBot } from "@fo/bots";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, flowModel, generate, knobsFor, skinText, templateById, unreadablePairs, TEMPLATES, GEN } from "../src/index.js";

const reqs = sequenceRange(1, 60);
const build = (i: number, p = 0.3) => {
  const r = reqs[i - 1]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try { return buildLevel({ id: r.id, seed: r.seed, modules: closure(r.modules), goalType: r.goalType, template: templateById(r.template), knobs: knobsFor(p) }, salt); }
    catch { /* next layout draw */ }
  }
  return null;
};

describe("module selection", () => {
  it("adds dependencies and always-on modules, and rejects exclusions", () => {
    expect(closure(["lasso"])).toEqual(expect.arrayContaining(["barrier_lines", "build_pads", "carry", "gather", "core", "sales"]));
    expect(closure(["defenders"])).toEqual(expect.arrayContaining(["defense", "workers", "barrier_lines"]));
    expect(() => generate({ target: 0.3, modules: ["lasso", "defense"], goalType: "waves", seed: 1 })).toThrow(/exclude/);
  });
});

describe("layout and economy (stages 2-4)", () => {
  // A spread of the sequence that covers every module and goal type; built once, on first use, so
  // collection stays fast and no single synchronous block starves the test worker.
  const SAMPLE = [1, 2, 5, 8, 9, 11, 14, 17, 20, 21, 24, 25, 28, 29, 33, 37, 41, 45, 49, 58];
  let cache: { r: (typeof reqs)[number]; b: ReturnType<typeof build> }[] | null = null;
  const builtLevels = () => (cache ??= SAMPLE.map((i) => ({ r: reqs[i - 1]!, b: build(i) })));

  it("builds a valid manifest for most of the sequence at moderate pressure", () => {
    const ok = builtLevels().filter((x) => x.b !== null);
    expect(ok.length).toBeGreaterThanOrEqual(SAMPLE.length - 1);
    for (const { b } of ok) {
      const m = ManifestSchema.parse(b!.manifest);
      expect(() => checkManifest(m, content)).not.toThrow();
      expect(() => createSim(m)).not.toThrow();
    }
  });

  it("keeps interaction radii apart and key stations within a screen of the core", () => {
    for (const { b } of builtLevels()) {
      if (!b) continue;
      const core = b.manifest.entities.find((e) => e.type === "sink.core")!.at;
      expect(unreadablePairs(b.stations, core, 450)).toEqual([]);
    }
  });

  it("barrier lines span the map with a gate; containers sit outside the lines; one pad per blocked zone", () => {
    for (const { b } of builtLevels()) {
      if (!b) continue;
      const m = b.manifest;
      const lines = m.entities.filter((e) => e.type === "barrier.line");
      for (const l of lines) {
        if (l.type !== "barrier.line") continue;
        expect(l.sections.some((s) => s.gate)).toBe(true);
        expect(l.sections[0]!.a[0]).toBe(0);
        expect(l.sections[l.sections.length - 1]!.b[0]).toBe(480);
      }
      const sim = createSim(m);
      for (const c of sim.state.captures) expect(outsideLines(sim.state, c.pos)).toBe(true);
      for (const z of m.entities.filter((e) => e.type === "zone.blocked")) {
        const clearers = m.entities.filter((e) => e.type === "pad.build" && e.build === "zone.clear" && e.target === (z as { id: string }).id);
        expect(clearers.length).toBe(1);
      }
    }
  });

  it("puts every anchored module's pads on the bot's plan", () => {
    for (const { r, b } of builtLevels()) {
      if (!b) continue;
      const plan = planBot(b.manifest).steps.map((s) => s.pad);
      if (r.modules.includes("source_gating")) expect(plan).toContain("unlock_food2");
      if (r.modules.includes("core_levels")) expect(plan).toContain("core_level");
      if (r.modules.includes("blocked_zones")) expect(plan).toContain("zone_pad");
      if (r.modules.includes("supply_routing")) expect(plan).toContain("depot");
    }
  });

  it("the flow model rejects a core the player cannot sustain alone", () => {
    const b = build(2)!;
    const m = structuredClone(b.manifest);
    m.params["core.burn"] = 0.4;
    const f = flowModel(m, planBot(m), content, 300);
    expect(f.ok).toBe(false);
    expect(f.reason).toMatch(/unsustainable/);
  });

  it("is deterministic: same request, seed and knobs give the same manifest", () => {
    expect(build(29)!.manifest).toEqual(build(29)!.manifest);
    expect(build(8)!.manifest).not.toEqual(build(8, 0.8)!.manifest);
  });

  it("templates are data and cover the sequencer's ids", () => {
    const ids = TEMPLATES.templates.map((t) => t.id);
    for (const r of reqs) expect(ids).toContain(r.template);
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });
});

describe("generate (search + rating)", () => {
  it("returns the same manifest for the same request and seed", () => {
    const r = reqs[0]!;
    const light = { seeds: { quick: { ref: 2, other: 1 }, full: { ref: 3, other: 1 } } };
    const a = generate(r, light), b = generate(r, light);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    const m = a!;
    expect(m.engineVersion).toBeDefined();
    expect((m.rating as { difficulty: number }).difficulty).toBeGreaterThan(0);
    expect(m.text["mars_greenhouse"]!.title.length).toBeGreaterThan(0);
  });

  it("titles and tips come from the skin, deterministically", () => {
    const m = build(8)!.manifest;
    const t = skinText(m, ["barrier_lines", "lasso"]);
    expect(t).toEqual(skinText(m, ["barrier_lines", "lasso"]));
    expect(t.tips.length).toBeGreaterThanOrEqual(1);
    expect(t.tips.length).toBeLessThanOrEqual(3);
    expect(fp(1)).toBe(1000);
  });
});
