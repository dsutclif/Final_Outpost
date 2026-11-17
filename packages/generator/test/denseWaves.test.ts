import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";
import { wavePoints } from "../src/build.js";

// Denser waves, not only bigger ones (Doug: the last defend waves dragged on). Over 40 defend builds: no wave above
// defendWaves.waveCap points, the same total points as the old sizing (waveCap 0 reproduces it), the later waves
// arriving no further apart than the early ones, the last one done spawning no later than before, every wave spawning within spawnMax, and the warlord rule kept.
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
const pts = (ws: W[]) => ws.reduce((a, w) => a + wavePoints(w.counts, content), 0);
const size = (w: W) => Object.values(w.counts).reduce((a, n) => a + n, 0);

describe("defend waves: denser, not only bigger", () => {
  it("40 defend seeds: capped waves, same total points, late waves no further apart, warlords kept", () => {
    expect(DW.waveCap).toBeGreaterThan(0);
    // mixed waves (outpost-ops#92, mixWaves) change sizes and add points on purpose; this checks the split alone
    const mix = DW.mix;
    DW.mix = { mid: { creature: 0 }, late: { creature: 0, extra: 0 } };
    try {
    let built = 0;
    for (const cs of cases) {
      const cap = DW.waveCap;
      DW.waveCap = 0;
      const old = wavesOf(mk(cs));
      DW.waveCap = cap;
      const now = wavesOf(mk(cs));
      if (!old || !now) continue;
      built++;
      const tag = `${cs.r.id} seed ${cs.seed} p ${cs.p}`;
      for (const w of now) expect(wavePoints(w.counts, content), tag).toBeLessThanOrEqual(cap);
      expect(Math.abs(pts(now) - pts(old)) / pts(old), tag).toBeLessThanOrEqual(0.05);
      const reg = now.filter((w) => w.gap !== DW.raid.gap);
      const step = reg.slice(1).map((w, k) => ({ d: w.t - reg[k]!.t, late: w.gap !== DW.gap }));
      const early = step.filter((s) => !s.late).map((s) => s.d), late = step.filter((s) => s.late).map((s) => s.d);
      if (early.length && late.length) expect(Math.max(...late), tag).toBeLessThanOrEqual(Math.min(...early));
      for (const w of reg) expect(size(w) * (w.gap ?? 0), tag).toBeLessThanOrEqual(DW.spawnMax);
      // the last wave finishes spawning no later than before (attempt 1 started it up to 3 minutes later)
      const oldReg = old.filter((w) => w.gap !== DW.raid.gap);
      const ends = (w: W) => w.t + size(w) * (w.gap ?? 0);
      expect(ends(reg.at(-1)!), tag).toBeLessThanOrEqual(ends(oldReg.at(-1)!) + 5); // rounding and the spawnMax gap trim
      expect(reg.at(-1)!.t - oldReg.at(-1)!.t, tag).toBeLessThanOrEqual(DW.spawnMax);
      const bosses = reg.map((w) => w.counts["hostile.boss"] ?? 0);
      if (bosses.some((n) => n > 0)) {
        expect(Math.max(...bosses), tag).toBe(1);
        expect(bosses.at(-1), tag).toBe(1);
        expect(bosses.reduce((a, n) => a + n, 0), tag).toBe(reg.length >= 5 ? 2 : 1);
      }
    }
    expect(built).toBeGreaterThanOrEqual(36);
    } finally { DW.mix = mix; }
  }, 900000);
});
