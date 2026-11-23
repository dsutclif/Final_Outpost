import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { DEFEND_FIT, countsHp, defendInput, waveBreakMult } from "@fo/bots";
import { placeDefendGap, type DefendGapCfg } from "../src/defendGap.js";
import gen from "../data/generator.json";

type Loose = Record<string, any>;
const base: Loose = JSON.parse(readFileSync(new URL("../../../levels/scratch/rebuild-7-25-newd/s1-L021.json", import.meta.url), "utf8"));
const cfg: DefendGapCfg = { ...(gen as Loose).defendGap, on: true };
// A stand-in for the model/sim: strategy t holds early waves best, g the middle, d the late ones (the best strategy crosses twice).
const mult = (k: number, s: string): number => {
  const best = k < 2 ? "turrets_first" : k < 4 ? "guards_first" : "drones_first";
  return s === best ? 5 : 3;
};
const stub = (cut: Loose, k: number, s: string): number => mult(k, s);
const place = (o: Partial<Parameters<typeof placeDefendGap>[2]> = {}) => placeDefendGap(base, content, { cfg, target: 0.5, gap: 20, warlords: 2, breakFn: stub as never, ...o });

describe("placeDefendGap (S4)", () => {
  const r = place();
  it("places every wave inside [V_lo, 0.9 V_hi] and logs gap positions", () => {
    expect(r.ok).toBe(true);
    for (const w of r.waves.slice(1)) { // wave 0 stays as sized when a probe is used
      expect(w.hp).toBeGreaterThanOrEqual(w.vLo - 1);
      expect(w.hp).toBeLessThanOrEqual(cfg.feasible * w.vHi + 2);
      expect(w.position).not.toBeNull();
    }
    expect(r.crossings).toBe(2);
  });
  it("keeps waves 0 and 1 at their times and compresses later ones to the gap, never before the build window", () => {
    const ws = r.manifest["waves"] as Loose[];
    expect(ws[0]!.t).toBe(base["waves"][0].t);
    expect(ws[1]!.t).toBe(base["waves"][1].t);
    for (let k = 2; k < ws.length; k++) expect(ws[k]!.t).toBe(Math.max(ws[1]!.t, ws[k - 1]!.t + 20));
  });
  it("escalates: the last two waves are above every earlier wave", () => {
    const hp = r.waves.map((w) => w.hp), n = hp.length, before = Math.max(...hp.slice(0, n - 2));
    expect(hp[n - 2]!).toBeGreaterThanOrEqual(before);
    expect(hp[n - 1]!).toBeGreaterThanOrEqual(before);
  });
  it("never repeats a wave (same counts and side pool)", () => {
    const sigs = (r.manifest["waves"] as Loose[]).map((w) => JSON.stringify([w.side, Object.entries(w.counts).sort()]));
    expect(new Set(sigs).size).toBe(sigs.length);
  });
  it("puts the warlords in the final wave", () => {
    const ws = r.manifest["waves"] as Loose[];
    expect(ws.at(-1)!.counts["hostile.boss"]).toBe(2);
    expect(ws.slice(0, -1).some((w) => w.counts["hostile.boss"])).toBe(false);
  });
  it("is deterministic and leaves the input alone", () => {
    const before = JSON.stringify(base);
    expect(JSON.stringify(place().manifest)).toBe(JSON.stringify(r.manifest));
    expect(JSON.stringify(base)).toBe(before);
  });
  it("rejects a wave no strategy holds (noHold) and leaves it as sized", () => {
    const dead = place({ breakFn: ((_: Loose, k: number) => (k === 3 ? 0 : 4)) as never });
    expect(dead.reason).toBe("noHold");
    expect(dead.notes.some((n) => n.includes("wave 3: no strategy holds"))).toBe(true);
  });
  it("rejects a level whose strategies never separate, with the reason noCrossing", () => {
    const flat = place({ breakFn: ((_: Loose, k: number) => 4 + 0 * k) as never });
    expect(flat.ok).toBe(false);
    expect(flat.reason).toBe("noCrossing");
  });
  it("accepts one best strategy when the gap ratio is wide on half the waves", () => {
    const wide = place({ breakFn: ((_: Loose, k: number, s: string) => (s === "turrets_first" ? 6 : 2)) as never });
    expect(wide.ok).toBe(true);
    expect(wide.crossings).toBe(0);
    expect(wide.ratioShare).toBeGreaterThanOrEqual(0.5);
  });
  it("model: a wave stacked on a live one holds less than the same wave alone (pair checked together)", () => {
    const solo = JSON.parse(JSON.stringify(base)) as Loose;
    solo.params["defense.maxLive"] = 1;
    const two = JSON.parse(JSON.stringify(base)) as Loose;
    two.params["defense.maxLive"] = 2;
    for (const m of [solo, two]) m.waves.forEach((w: Loose, k: number) => { w.t = 20 + 20 * k; });
    const a = defendInput(solo as never, content), b = defendInput(two as never, content);
    const prior = [1, 1];
    const vs = waveBreakMult(a, DEFEND_FIT, "turrets_first", DEFEND_FIT.eta, prior), vt = waveBreakMult(b, DEFEND_FIT, "turrets_first", DEFEND_FIT.eta, prior);
    expect(vt).toBeLessThanOrEqual(vs + 1e-9);
    expect(countsHp(base.waves[0].counts, content)).toBeGreaterThan(0);
  });
});
