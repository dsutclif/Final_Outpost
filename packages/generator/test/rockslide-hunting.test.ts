import { describe, expect, it } from "vitest";
import { PROFILES, playBot, planBot } from "@fo/bots";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";

// 88.4 (outpost-ops#88, Doug 2026-11-18): on a new hunting level whose catch is sold, a seeded chance puts a rock slide over the
// hunting grounds: the hopper flats lie beyond the rubble from the Core and the ranger's hire pad needs the slide cleared.
const reqs = sequenceRange(1, 120).filter((r) => r.features.includes("hunting") && r.goalType === "protein");
type Ent = { type: string; id?: string; rect?: number[]; at?: number[]; target?: string; build?: string; requires?: { pad?: string } };
const mid = (r: number[]) => [r[0]! + r[2]! / 2, r[1]! + r[3]! / 2];
const d = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

describe("rock slide over the hunting grounds", () => {
  const built: { id: string; seed: number; m: ReturnType<typeof buildLevel>["manifest"]; slide: boolean }[] = [];
  for (let s = 1; s <= 12; s++) for (const r of reqs) {
    for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
      try {
        const b = buildLevel({ id: r.id, seed: s * 7919, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
          modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.5, {}), walls: true }, salt);
        built.push({ id: r.id, seed: s * 7919, m: b.manifest, slide: (b.manifest.entities as unknown as Ent[]).some((e) => e.id === "rubble_hunt") });
        break;
      } catch { /* next layout draw */ }
    }
  }

  it("some hunting levels get the slide and some do not", () => {
    expect(reqs.length).toBeGreaterThan(0);
    const n = built.filter((b) => b.slide).length;
    expect(n).toBeGreaterThan(5);
    expect(built.length - n).toBeGreaterThan(5);
  });

  it("the flats lie beyond the rubble from the Core and the ranger needs the slide cleared", () => {
    for (const b of built.filter((x) => x.slide)) {
      const ents = b.m.entities as unknown as Ent[], at = `${b.id}@${b.seed}`;
      const rubble = ents.find((e) => e.id === "rubble_hunt")!, prey = ents.find((e) => e.type === "zone.prey")!;
      const core = ents.find((e) => e.type === "sink.core")!.at!;
      const clear = ents.find((e) => e.build === "zone.clear" && e.target === "rubble_hunt");
      expect(clear, at).toBeDefined();
      expect(d(core, mid(prey.rect!)), at).toBeGreaterThan(d(core, mid(rubble.rect!)));
      expect(d(core, clear!.at!), at).toBeLessThan(d(core, mid(rubble.rect!)));
      expect(ents.find((e) => e.id === "ranger")?.requires?.pad, at).toBe(clear!.id);
      // the bot plans the clear before the ranger
      const plan = planBot(b.m).steps.map((st) => st.pad);
      expect(plan.indexOf(clear!.id!), at).toBeGreaterThanOrEqual(0);
      if (plan.includes("ranger")) expect(plan.indexOf(clear!.id!), at).toBeLessThan(plan.indexOf("ranger"));
    }
  });

  it("the good bot wins three slide levels", () => {
    const pick = built.filter((x) => x.slide).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).slice(0, 3);
    expect(pick.length).toBe(3);
    for (const b of pick) {
      const run = playBot(b.m, PROFILES["good"]!, 1);
      expect(run.won, `${b.id}@${b.seed}`).toBe(true);
    }
  }, 300_000);
});
