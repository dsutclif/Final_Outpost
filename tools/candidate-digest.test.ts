import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digestLog, outcome, settingsOf, type Digest, type RawCandidate } from "./candidate-digest.js";

const cand = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  run: "2026-10-30T12:00:00.000Z", engine: "0.14.0", index: 26, family: "defend", goalType: "survive", target: 0.6,
  p: 0.5, knobs: { burn: 2.5 }, rejects: [], kept: false, shipped: false, ...over,
});
const line = (c: RawCandidate) => JSON.stringify(c) + "\n";
const setup = () => { const dir = mkdtempSync(join(tmpdir(), "digest-")); return { raw: join(dir, "s1.jsonl"), out: join(dir, "digest") }; };
const read = (out: string, day: string) => JSON.parse(readFileSync(join(out, `${day}.s1.json`), "utf8")) as Digest;
const NOW = Date.parse("2026-10-30T13:00:00.000Z");

describe("candidate digest", () => {
  it("names the outcome: shipped, kept, the last real reject, layout only when nothing was built", () => {
    expect(outcome(cand({ shipped: true, kept: true }))).toBe("shipped");
    expect(outcome(cand({ kept: true, rejects: ["offTarget"] }))).toBe("kept");
    expect(outcome(cand({ rejects: ["layout"] }))).toBe("layout");
    const built = cand({ rejects: ["layout", "infeasible", "layout"], settings: { params: {}, pads: 1, hires: 0, towers: 0, salvageCost: 0, currencyCost: 0, fuelNodes: 0, captures: 0, waveTimes: [], waveSizes: [], waveDrops: [] } });
    expect(outcome(built)).toBe("infeasible");
    expect(outcome(cand())).toBe("closer");
  });

  it("derives the defence ratios, skipping what does not apply", () => {
    const s = settingsOf(cand({ settings: { params: { "meters.baseHealth": 9 }, pads: 5, hires: 1, towers: 8, salvageCost: 100, currencyCost: 0, fuelNodes: 8, captures: 0, waveTimes: [20, 60], waveSizes: [50, 200], waveDrops: [50, 240] } }));
    expect(s).toMatchObject({ peakWave: 200, perTower: 25, dropShare: 0.5, baseHealth: 9, firstWave: 20 });
    expect(settingsOf(cand())).not.toHaveProperty("peakWave");
  });

  it("counts a run once however often it is digested, and adds later runs to the day", () => {
    const { raw, out } = setup();
    writeFileSync(raw, line(cand({ rejects: ["infeasible"] })) + line(cand({ kept: true, ms: 40 })));
    expect(digestLog(raw, out, NOW)).toEqual(["2026-10-30"]);
    expect(digestLog(raw, out, NOW)).toEqual([]);
    expect(read(out, "2026-10-30").candidates).toBe(2);
    appendFileSync(raw, line(cand({ run: "2026-10-30T12:30:00.000Z", shipped: true, kept: true })));
    digestLog(raw, out, NOW);
    const d = read(out, "2026-10-30");
    expect(d.candidates).toBe(3);
    expect(d.runs).toHaveLength(2);
    expect(d.counts["family|defend|infeasible"]).toBe(1);
    expect(d.counts["ms|defend|kept"]).toBe(40);
    expect(d.levels["s1:26"]!.shipped).toBe(1);
  });

  it("drops raw records past the retention window, keeping them in the digest", () => {
    const { raw, out } = setup();
    writeFileSync(raw, line(cand({ run: "2026-10-01T12:00:00.000Z" })) + line(cand()));
    expect(digestLog(raw, out, NOW)).toEqual(["2026-10-01", "2026-10-30"]);
    expect(read(out, "2026-10-01").candidates).toBe(1);
    expect(readFileSync(raw, "utf8").trim().split("\n")).toHaveLength(1);
  });
});
