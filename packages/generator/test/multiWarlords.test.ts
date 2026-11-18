import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";
import { warlordsFor } from "../src/build.js";

// Several warlords (outpost-ops#92 part 2): on levels with the bosses feature the final wave carries 2 or 3 warlords by
// difficulty target (generator.json defendWaves.warlords), and exactly one at the easy end.
type W = { t: number; counts: Record<string, number>; gap?: number };
const DW = GEN.defendWaves;
const BOSS = "hostile.boss";
const defs = sequenceRange(1, 80).filter((r) => r.family === "defend");
const withBosses = defs.filter((r) => r.features.includes("bosses"));
const pool = (withBosses.length >= 4 ? withBosses : defs.map((r) => ({ ...r, features: [...r.features, "bosses"] }))).slice(0, 6);
const finalWave = (target: number | undefined, r: (typeof pool)[number], p: number): W | null => {
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      const b = buildLevel({ id: r.id, seed: r.seed, target, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p), walls: true }, salt);
      const reg = (b.manifest as unknown as { waves: W[] }).waves.filter((w) => w.gap !== DW.raid.gap);
      return reg.reduce((a, w) => (w.t >= a.t ? w : a), reg[0]!);
    } catch { /* next layout draw */ }
  }
  return null;
};

describe("defend waves: several warlords", () => {
  it("the table maps difficulty to 1, 2 or 3 warlords", () => {
    expect(warlordsFor(undefined, DW.warlords)).toBe(1);
    expect(warlordsFor(0.3, DW.warlords)).toBe(1);
    expect(warlordsFor(0.6, DW.warlords)).toBe(2);
    expect(warlordsFor(0.7, DW.warlords)).toBe(2);
    expect(warlordsFor(0.8, DW.warlords)).toBe(3);
    expect(warlordsFor(0.95, DW.warlords)).toBe(3);
  });

  it("bosses levels: the final wave has more than one warlord at the hard end and exactly one at the easy end", () => {
    let built = 0;
    for (const r of pool) {
      for (const p of [0.25, 0.75]) {
        const hard = finalWave(0.85, r, p), easy = finalWave(0.3, r, p);
        if (!hard || !easy) continue;
        built++;
        const tag = `${r.id} p ${p}`;
        expect(hard.counts[BOSS] ?? 0, tag).toBeGreaterThan(1);
        expect(easy.counts[BOSS] ?? 0, tag).toBe(1);
        expect(size(hard) * (hard.gap ?? 0), tag).toBeLessThanOrEqual(DW.spawnMax);
      }
    }
    expect(built).toBeGreaterThanOrEqual(6);
  }, 600_000);
});
const size = (w: W) => Object.values(w.counts).reduce((a, n) => a + n, 0);
