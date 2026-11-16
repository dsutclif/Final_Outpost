import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sequenceRange } from "../packages/sequencer/src/index.js";
import { assess, modelInput, score, type FixtureRow } from "./defend-model.js";
import { buildCandidate, latinHypercube } from "./walls-sweep.js";

// outpost-ops #210: the no-sim defend filter only rejects. Calibration rows are real good-bot runs from
// tools/walls-sweep.ts --audit (knob points spread over the sweep's ranges, walls on and off); the filter
// must never reject a row the good bot won on any seed.
const rows = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "defend-model.fixture.json"), "utf8")) as FixtureRow[];

describe("defend-model filter", () => {
  it("never rejects a calibration run the good bot won", () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.some((r) => r.walls) && rows.some((r) => !r.walls)).toBe(true);
    const won = rows.filter((r) => r.wins > 0);
    expect(won.length).toBeGreaterThan(0);
    const rejected = won.filter((r) => assess(r.input).reject).map((r) => `point ${r.point} level ${r.level}`);
    expect(rejected).toEqual([]);
  });

  it("still rejects some of the losses (it is not a pass-everything filter)", () => {
    const s = score(rows);
    expect(s.falseRejects).toBe(0);
    expect(s.rejectedLosses).toBeGreaterThan(0);
  });

  it("reads a scratch build and reports every wave it reaches", () => {
    const req = sequenceRange(1, 10)[9]!;
    const { built } = buildCandidate(req, false, { baseHealth: 1, swarm: 1, earlyGrowth: 1, waveGap: 1, firstWave: 20, towerCost: 1 });
    const inp = modelInput(built.manifest);
    expect(inp.gates).toEqual({});
    expect(inp.buys.length).toBeGreaterThan(0);
    const a = assess(inp);
    expect(a.perWave.length).toBeGreaterThan(0);
    expect(Number.isFinite(a.ratio)).toBe(true);
  });

  it("samples a seeded Latin hypercube (one point per stratum in every dimension)", () => {
    const a = latinHypercube(10, 3, 5), b = latinHypercube(10, 3, 5);
    expect(a).toEqual(b);
    for (let d = 0; d < 3; d++) expect(a.map((p) => Math.floor(p[d]! * 10)).sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
