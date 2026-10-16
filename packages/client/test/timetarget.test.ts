import { describe, expect, it } from "vitest";
import { createSim } from "@fo/sim";
import level1 from "../../../levels/golden/proto-L001.json";
import type { Manifest } from "@fo/content";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/save.js";
import { TIME_TARGET_STEPS, applyTimeTarget, normalizeTimeTargetPct } from "../src/timetarget.js";

const secs = (m: Manifest) => Number(m.objectives!.find((o) => o.kind === "time_target")!.params["seconds"]);

describe("time target setting", () => {
  const base = level1 as unknown as Manifest;
  it("defaults to 100% and leaves the manifest alone", () => {
    expect(DEFAULT_SETTINGS.timeTargetPct).toBe(100);
    expect(applyTimeTarget(base, 100)).toBe(base);
  });
  it("scales the time_target objective seconds, without mutating the source", () => {
    const before = secs(base);
    for (const p of TIME_TARGET_STEPS) expect(secs(applyTimeTarget(base, p))).toBe(Math.round((before * p) / 100));
    expect(secs(applyTimeTarget(base, 140))).toBeGreaterThan(before);
    expect(secs(base)).toBe(before);
  });
  it("reaches the sim's compiled objectives", () => {
    const sim = createSim(applyTimeTarget(base, 200));
    const o = sim.compiled.manifest.objectives!.find((x) => x.kind === "time_target")!;
    expect(Number(o.params["seconds"])).toBe(secs(base) * 2);
  });
  it("snaps junk saved values to the default", () => {
    expect(normalizeTimeTargetPct(150)).toBe(100);
    expect(mergeSettings({ timeTargetPct: "x" }).timeTargetPct).toBe(100);
    expect(mergeSettings({ timeTargetPct: 160 }).timeTargetPct).toBe(160);
  });
});
