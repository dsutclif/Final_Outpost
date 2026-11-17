import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";

// Every rock slide hides a reward from generator.json (rockslide.rewards), and the level uses that reward's resource.
const reqs = sequenceRange(1, 60).filter((r) => r.features.includes("rockslides") && r.family !== "defend" && r.family !== "rescue");
type Ent = { type: string; id?: string; rect?: number[]; at?: number[] };

describe("rock slide rewards", () => {
  it("every rubble rect holds an allowed reward over 40 seeds, with at least 2 kinds", () => {
    expect(reqs.length).toBeGreaterThan(0);
    const allowed = new Map(GEN.rockslide.rewards.map((w) => [w.node, w.resource]));
    const kinds = new Set<string>();
    let rubble = 0;
    for (let s = 1; s <= 40; s++) {
      const r = reqs[s % reqs.length]!;
      let b: ReturnType<typeof buildLevel> | null = null;
      for (let salt = 0; salt < GEN.search.layoutTries && !b; salt++) {
        try { b = buildLevel({ id: r.id, seed: s * 7919, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
          modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.5, {}), walls: true }, salt); } catch { /* next layout draw */ }
      }
      if (!b) continue;
      const ents = (b.manifest as unknown as { entities: Ent[] }).entities;
      for (const z of ents.filter((e) => e.type === "zone.blocked" && String(e.id).startsWith("rubble"))) {
        rubble++;
        const [x, y, w, h] = z.rect!;
        const inside = ents.filter((e) => allowed.has(e.type) && e.at && e.at[0]! >= x! && e.at[0]! <= x! + w! && e.at[1]! >= y! && e.at[1]! <= y! + h!);
        expect(inside.length, `seed ${s}`).toBeGreaterThan(0);
        for (const e of inside) kinds.add(e.type);
      }
    }
    expect(rubble).toBeGreaterThan(20);
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });
});
