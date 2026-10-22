import { describe, expect, it } from "vitest";
import { HUMAN, playBot } from "@fo/bots";
import { sequenceRange } from "@fo/sequencer";
import { HUMAN_STARS, generateDetailed } from "../src/index.js";

const reqs = sequenceRange(1, 3);
const light = { seeds: { quick: { ref: 2, other: 1 }, full: { ref: 3, other: 1 } }, maxIterations: 8 };

describe("stars are earned by the human-view bot (BACKLOG-R4 Batch 2)", () => {
  it("reads a sane bar from generator.json", () => {
    expect(HUMAN_STARS.seeds).toBeGreaterThanOrEqual(4);
    expect(HUMAN_STARS.minEarned).toBeLessThanOrEqual(HUMAN_STARS.seeds);
    expect(HUMAN_STARS.minEarned / HUMAN_STARS.seeds).toBeGreaterThanOrEqual(0.5);
    expect(HUMAN_STARS.regressTolerance).toBeGreaterThan(0);
  });

  it("keeps only star objectives the human-view bot earns on minEarned of its seeds, and records its stars", () => {
    const best = generateDetailed(reqs[0]!, light).best;
    expect(best).not.toBeNull();
    const m = best!.manifest;
    expect(best!.stars.human).toBeGreaterThan(0);
    expect(best!.starsByRung["human"]).toBe(best!.stars.human);
    expect((m.rating as { stars?: { human?: number } }).stars?.human).toBe(best!.stars.human);
    // the same seeds levels:check replays
    const rs = Array.from({ length: HUMAN_STARS.seeds }, (_, i) => playBot(m, HUMAN, i + 1));
    m.objectives!.slice(1).forEach((o, i) => {
      expect(rs.filter((r) => r.objectives[i + 1]?.done).length, o.kind).toBeGreaterThanOrEqual(HUMAN_STARS.minEarned);
    });
    expect(rs.some((r) => r.stars === 3)).toBe(true);
  }, 240_000);

  it("can still run the good bot's old rule for comparisons", () => {
    const best = generateDetailed(reqs[0]!, { ...light, humanStars: false }).best;
    expect(best).not.toBeNull();
    expect(best!.stars.human).toBeUndefined();
  }, 240_000);
});
