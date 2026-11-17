import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";
import { mixWaves, wavePoints } from "../src/build.js";

// Mixed waves (outpost-ops#92): the late, packed defend waves bring swarmlings, raiders and creatures together and a
// few more attackers, still spawning within spawnMax and within the wave cap. Over 40 defend builds.
type W = { t: number; counts: Record<string, number>; side?: unknown; gap?: number };
const DW = GEN.defendWaves;
const defs = sequenceRange(1, 60).filter((r) => r.family === "defend");
const cases = Array.from({ length: 40 }, (_, j) => ({ r: defs[j % defs.length]!, seed: defs[j % defs.length]!.seed + Math.floor(j / defs.length) * 7919, p: (j % 5) / 4 }));
const mk = ({ r, seed, p }: (typeof cases)[number]) => {
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p), walls: true }, salt);
    } catch { /* next layout draw */ }
  }
  return null;
};
const wavesOf = (b: ReturnType<typeof mk>) => (b?.manifest as unknown as { waves: W[] } | undefined)?.waves ?? null;
const size = (w: W) => Object.values(w.counts).reduce((a, n) => a + n, 0);
const types = (w: W) => Object.entries(w.counts).filter(([, n]) => n > 0).length;

describe("defend waves: mixed attackers", () => {
  it("mixWaves keeps points when it swaps swarmlings for creatures, and adds only within spawnMax and the cap", () => {
    const reg: W[] = [
      { t: 0, counts: { "hostile.swarmling": 10 }, gap: DW.gap },
      { t: 40, counts: { "hostile.swarmling": 30, "hostile.raider_humanoid": 2 }, gap: DW.gap },
      { t: 80, counts: { "hostile.swarmling": 100 }, gap: DW.lateGap },
    ];
    const before = reg.map((w) => wavePoints(w.counts, content));
    mixWaves(reg, new Set(reg), content, { mid: { creature: 0.2 }, late: { creature: 0.3, extra: 0 } }, { lateGap: DW.lateGap, spawnMax: DW.spawnMax, cap: 150, maxPoints: DW.maxPoints });
    expect(reg.map((w) => wavePoints(w.counts, content))).toEqual(before);
    expect(reg[0]!.counts).toEqual({ "hostile.swarmling": 10 });
    expect(reg[1]!.counts["hostile.creature"]).toBe(2);
    expect(types(reg[2]!)).toBe(3);
    const late: W[] = [{ t: 0, counts: { "hostile.swarmling": 5 }, gap: DW.gap }, { t: 50, counts: { "hostile.swarmling": 140 }, gap: DW.lateGap }];
    mixWaves(late, new Set(late), content, { mid: { creature: 0 }, late: { creature: 0.3, extra: 0.5 } }, { lateGap: DW.lateGap, spawnMax: DW.spawnMax, cap: 150, maxPoints: DW.maxPoints });
    expect(wavePoints(late[1]!.counts, content)).toBeLessThanOrEqual(150);
    expect(wavePoints(late[1]!.counts, content)).toBeGreaterThan(140);
    expect(size(late[1]!) * DW.lateGap).toBeLessThanOrEqual(DW.spawnMax);
  });

  it("40 defend seeds: late waves hold 3 or more attacker types, spawn within spawnMax and stay within the cap", () => {
    let built = 0, late = 0, creatures = 0;
    for (const cs of cases) {
      const ws = wavesOf(mk(cs));
      if (!ws) continue;
      built++;
      const tag = `${cs.r.id} seed ${cs.seed} p ${cs.p}`;
      const reg = ws.filter((w) => w.gap !== DW.raid.gap);
      for (const w of reg) {
        expect(size(w) * (w.gap ?? 0), tag).toBeLessThanOrEqual(DW.spawnMax);
        expect(wavePoints(w.counts, content), tag).toBeLessThanOrEqual(DW.waveCap);
        creatures += w.counts["hostile.creature"] ?? 0;
      }
      for (const w of reg.slice(1).filter((x) => x.gap !== DW.gap)) {
        late++;
        expect(types(w), `${tag} wave at ${w.t}: ${JSON.stringify(w.counts)}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(built).toBeGreaterThanOrEqual(36);
    expect(late).toBeGreaterThan(built);
    expect(creatures).toBeGreaterThan(0);
  }, 900000);
});
