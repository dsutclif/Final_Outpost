import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";

// outpost-ops#86 (86.1): every new defend level has a scrap heap the player can walk to from the core
// before the first wave starts (the fuel hauler is hired with that first scrap).
const reqs = sequenceRange(1, 60).filter((r) => r.family === "defend");
type Ent = { type: string; at?: number[] };
const SPEED = 155; // player.speed, units per second (content defaults.json)

describe("defend levels always have reachable scrap", () => {
  it("over 40 defend seeds every level has a heap within walking time of the first wave", () => {
    expect(reqs.length).toBeGreaterThan(0);
    let built = 0;
    const bad: string[] = [];
    for (let s = 1; s <= 40; s++) {
      const r = reqs[s % reqs.length]!;
      let b: ReturnType<typeof buildLevel> | null = null;
      for (let salt = 0; salt < GEN.search.layoutTries && !b; salt++) {
        try { b = buildLevel({ id: r.id, seed: s * 7919, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
          modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.5, {}), walls: true }, salt); } catch { /* next layout draw */ }
      }
      if (!b) continue;
      built++;
      const m = b.manifest as unknown as { entities: Ent[]; waves: { t: number }[] };
      const core = m.entities.find((e) => e.type === "sink.core")!.at!;
      const first = Math.min(...m.waves.map((w) => w.t));
      const walk = Math.min(...m.entities.filter((e) => e.type === "node.salvage_pile").map((e) => Math.hypot(e.at![0]! - core[0]!, e.at![1]! - core[1]!) / SPEED));
      if (!(walk < first)) bad.push(`seed ${s} ${r.id}: walk ${walk.toFixed(1)}s, first wave ${first}s`);
    }
    expect(built).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  });
});
