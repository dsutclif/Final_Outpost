import { describe, expect, it } from "vitest";
import type { BotResult } from "@fo/bots";
import type { Manifest } from "@fo/content";
import { sequenceRange } from "@fo/sequencer";
import { generateDetailed, newSearchMemory, settleObjectives, type CandidateRecord } from "../src/index.js";

// outpost-ops#251 part 1: the candidate log says why a candidate failed (with numbers), can replay it, and never changes a decision.

const run = (): BotResult => ({
  profile: "good", seed: 1, won: true, goalTicks: 60 * 30, stars: 3, objectives: [], margin: 0.5,
  runStats: { fuelOuts: 0, froze: 0, heatMin: 800, admitted: 5, hpMin: 100, injured: 0, barriersLost: 0, customersAngry: 0, overload: false,
    tripBest: 3, tripBestClean: 3, podsLost: 0, podsLeft: 0, rescued: 3, streakMax: 0, hired: 0, heatMean: 0.8, kills: 0, salvage: 0 },
}) as unknown as BotResult;

describe("objectives reject detail", () => {
  it("names each challenge candidate with what the bots earned when no challenge separates the ladder", () => {
    // a rescue level whose every rung earns the tow trip: no family challenge the ladder can miss
    const m = { family: "rescue", goal: { type: "rescue_all" }, objectives: [{ id: "main", kind: "rescue_all", params: {} }, { id: "time", kind: "time_target", params: { seconds: 900 } }, { id: "challenge", kind: "tow_full_trip", params: { n: 2 } }] } as unknown as Manifest;
    const ms = { runs: { good: [run(), run(), run()], floor: [run()] } } as never;
    const detail: Record<string, unknown> = {};
    const why = settleObjectives(m, ms, ["tow_full_trip"], 1, false, null, () => {}, detail);
    expect(why).toMatch(/no family challenge/);
    const ch = detail["challenges"] as { kind: string; params: { n: number }; good: string; kept: boolean; ladderMisses: number; ladderRuns: number }[];
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ kind: "tow_full_trip", params: { n: 3 }, good: "3/3", kept: true, ladderMisses: 0, ladderRuns: 4 });
  });
});

describe("candidate rows", () => {
  const r = sequenceRange(1, 60)[0]!;
  const light = { seeds: { quick: { ref: 2, other: 1 }, full: { ref: 3, other: 1 } }, maxIterations: 6 };

  it("carry a detail per reject, the search step, timings, per-run results and a replayable manifest", () => {
    const recs: CandidateRecord[] = [];
    const plain: CandidateRecord[] = [];
    const a = generateDetailed({ ...r, target: 0.99 }, { ...light, memory: newSearchMemory(), onCandidate: (c) => recs.push(c) });
    const b = generateDetailed({ ...r, target: 0.99 }, { ...light, memory: newSearchMemory(), onCandidate: (c) => plain.push(c) });
    // deterministic, and the same decisions with or without a reader
    expect(recs.map((c) => [c.p, c.rejects])).toEqual(plain.map((c) => [c.p, c.rejects]));
    expect(a.stats.iterations).toBe(b.stats.iterations);
    expect(recs.length).toBeGreaterThan(1);
    for (const c of recs) {
      expect(c.rejectDetail?.map((d) => d.kind) ?? []).toEqual(c.rejects);
      expect(c.layoutSeed).toBe(r.seed);
      if (!c.final) expect(c.step).toBeDefined();
      const s = c.msSplit!;
      expect(s.build + s.bots + s.rate).toBe(c.ms);
    }
    expect(recs[0]!.step!.prev).toBe(-1);
    expect(recs[1]!.step!.prev).toBe(recs[0]!.iteration);
    const rated = recs.filter((c) => c.rating);
    expect(rated.length).toBeGreaterThan(0);
    for (const c of rated) {
      expect(c.runs!.length).toBeGreaterThan(5);
      expect(c.runs![0]).toMatchObject({ bot: expect.any(String), seed: expect.any(Number), won: expect.any(Boolean) });
      expect(c.target).toBe(0.99);
      expect(c.gap).toBeCloseTo(c.rating!.D - 0.99, 2);
      const mf = c.manifest!;
      expect(mf.id).toBe(r.id);
      const off = c.rejectDetail!.find((d) => d.kind === "offTarget");
      if (off) expect(off).toMatchObject({ target: 0.99, D: c.rating!.D });
    }
    // a rated step reports dD against the previous rated candidate
    expect(rated.slice(1).some((c) => typeof c.step!.dD === "number")).toBe(true);
  }, 120_000);
});
