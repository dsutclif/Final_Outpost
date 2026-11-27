import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { failureCauses, knobSensitivity, logFiles, parseRows, readLog, readLogs, report, seedNoise, spearman } from "./candidate-analysis.js";

// outpost-ops#251 part 2: the analysis reads the full candidate log format (header, end and recipe rows mixed
// in with candidate rows, plain or gzipped archives) and reports failure causes, seed noise and dials.

const cand = (o: Record<string, unknown>): string => JSON.stringify({ id: "s1-L013", family: "harvest", recipeId: "r1", run: "A", rejects: [], ...o });
const LOG = [
  JSON.stringify({ build: { id: "b1", packId: "s1" } }),
  JSON.stringify({ recipe: { id: "r1" } }),
  cand({ iteration: 0, p: 0.2, knobs: { burn: 1, spawn: 5 }, rejects: ["layout"] }),
  cand({ iteration: 1, p: 0.3, knobs: { burn: 2, spawn: 5 }, rejects: ["offTarget"], rating: { D: 0.3 }, runs: [{ bot: "good", seed: 1, m: 0.5 }, { bot: "good", seed: 2, m: 0.6 }] }),
  cand({ iteration: 2, p: 0.4, knobs: { burn: 3, spawn: 4 }, rejects: ["offTarget", "offTarget"], rating: { D: 0.4 }, runs: [{ bot: "good", seed: 1, m: 0.4 }, { bot: "good", seed: 2, m: 0.6 }] }),
  cand({ iteration: 3, p: 0.5, knobs: { burn: 4, spawn: 6 }, rating: { D: 0.5 }, shipped: true, runs: [{ bot: "good", seed: 1, m: 0.5 }, { bot: "good", seed: 2, m: 0.5 }] }),
  cand({ iteration: 4, p: 0.6, knobs: { burn: 5, spawn: 3 }, rejects: ["layout"], rating: { D: 0.6 } }),
  cand({ id: "s1-L030", family: "defend", recipeId: "r2", rejects: ["objectives"] }),
  "{not json",
  JSON.stringify({ buildEnd: { shipped: 1 } }),
].join("\n");

describe("candidate log analysis", () => {
  it("keeps candidate rows and skips header, recipe, end and broken lines", () => {
    const rows = parseRows(LOG);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => Array.isArray(r.rejects))).toBe(true);
  });

  it("reads plain and gzipped logs from a folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "cand-"));
    writeFileSync(join(dir, "s1.jsonl"), LOG);
    writeFileSync(join(dir, "s1-b1.jsonl.gz"), gzipSync(Buffer.from(LOG)));
    writeFileSync(join(dir, "notes.txt"), "x");
    const files = logFiles([dir]);
    expect(files).toHaveLength(2);
    expect(files.flatMap(readLog)).toHaveLength(12);
    // the live log and its archive hold the same rows: counted once
    expect(readLogs(files)).toHaveLength(6);
  });

  it("counts failure causes once per row, overall, per family and per recipe", () => {
    const c = failureCauses(parseRows(LOG));
    expect(c).toMatchObject({ rows: 6, rejected: 5, shipped: 1 });
    expect(c.byKind).toEqual([["layout", 2], ["offTarget", 2], ["objectives", 1]]);
    expect(c.byFamily["harvest"]).toMatchObject({ rows: 5, rejected: 4 });
    expect(c.byRecipe[0]).toMatchObject({ recipe: "r1", rows: 5, rejected: 4 });
  });

  it("estimates seed noise from one bot's per-seed margin", () => {
    const [n] = seedNoise(parseRows(LOG));
    expect(n!.family).toBe("harvest");
    expect(n!.candidates).toBe(3);
    expect(n!.sdSeed).toBeCloseTo(Math.SQRT2 * 0.05, 6); // median of sd(0.5,0.6), sd(0.4,0.6), sd(0.5,0.5)
    expect(n!.sdMean4).toBeCloseTo(n!.sdSeed / 2, 9);
  });

  it("ranks a knob that moves with D as a smooth dial and one that does not lower, with p ranked too", () => {
    const k = knobSensitivity(parseRows(LOG))["harvest"]!;
    const by = Object.fromEntries(k.map((x) => [x.knob, x]));
    expect(by["p"]!.rho).toBeCloseTo(1, 9);
    expect(by["burn"]!.rho).toBeCloseTo(1, 9);
    expect(by["burn"]!.flipRate).toBe(0);
    expect(Math.abs(by["spawn"]!.rho)).toBeLessThan(1);
    expect(by["spawn"]!.flipRate).toBeGreaterThan(0);
  });

  it("rank correlation handles ties and no spread", () => {
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 9);
    expect(spearman([1, 1, 2], [1, 1, 2])).toBeCloseTo(1, 9);
    expect(Number.isNaN(spearman([1, 1, 1], [1, 2, 3]))).toBe(true);
  });

  it("prints a report naming the causes", () => {
    const text = report(parseRows(LOG), 1);
    expect(text).toContain("failure causes");
    expect(text).toContain("layout: 2");
    expect(text).toContain("seed noise");
  });
});
