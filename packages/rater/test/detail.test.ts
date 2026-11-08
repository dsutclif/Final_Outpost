import { describe, expect, it } from "vitest";
import { PROFILES, playBot } from "@fo/bots";
import { ENGINE_VERSION } from "@fo/sim";
import { PROXY_NAMES, METRIC_NAMES, defendTrace, measure, ratingDetail, rate, DEFAULT_WEIGHTS } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level4 from "../../../levels/golden/proto-L004.json";

const sigma = (x: number): number => 1 / (1 + Math.exp(-x));

describe("ratingDetail (golden proto-L001)", () => {
  const ms = measure(level1, { refSeeds: 2, otherSeeds: 1 });
  const d = ratingDetail(ms);
  const r = rate(level1, { refSeeds: 2, otherSeeds: 1 });

  it("carries the schema, engine and every sub-point", () => {
    expect(d.schema).toBe(1);
    expect(d.engineVersion).toBe(ENGINE_VERSION);
    expect(Object.keys(d.difficulty.metrics)).toEqual([...METRIC_NAMES]);
    expect(Object.keys(d.fun.proxies)).toEqual([...PROXY_NAMES]);
    expect(Object.keys(d.runs)).toEqual(["good", "average", "weak", "novice", "floor"]);
    expect(d.runs["good"]!.runs).toHaveLength(2);
    expect(d.runs["good"]!.runs[0]).toHaveProperty("reason");
    expect(d.runs["good"]!.runs[0]).toHaveProperty("ticks");
  });

  it("D and F reproduce from the listed contributions", () => {
    expect(d.D).toBeCloseTo(Math.min(1 - 1e-6, Math.max(1e-6, sigma(d.difficulty.sum))), 3);
    expect(d.F).toBeCloseTo(sigma(d.fun.sum), 3);
    const dsum = Object.values(d.difficulty.metrics).reduce((a, m) => a + m.contribution, DEFAULT_WEIGHTS.difficulty.bias);
    expect(dsum).toBeCloseTo(d.difficulty.sum, 2);
    expect(d.D).toBeCloseTo(r.D, 3);
    expect(d.F).toBeCloseTo(r.F, 3);
    expect(d.botsPassed).toEqual(r.botsPassed);
  });

  it("is JSON-safe", () => { expect(JSON.parse(JSON.stringify(d))).toEqual(d); });
});

describe("defendTrace", () => {
  it("observes without changing the run (same hash as the untraced run) and has one entry per wave", () => {
    const p = PROFILES["good"]!;
    const plain = playBot(level4, p, 1);
    const t = defendTrace(level4, p, 1);
    expect(t.hash).toBe(plain.hash);
    expect(t.ticks).toBe(plain.ticks);
    expect(t.waves).toHaveLength((level4 as { waves: unknown[] }).waves.length);
    expect(t.waves[0]!.started).toBe(true);
    expect(t.waves[0]!.attackers).toBeGreaterThan(0);
    expect(t.waves[0]!.hpSpawned).toBeGreaterThan(0);
  });
});
