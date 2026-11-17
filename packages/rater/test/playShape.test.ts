import { describe, expect, it } from "vitest";
import { TPS } from "@fo/sim";
import { content } from "@fo/content";
import { measure, qualityFilters } from "../src/index.js";
import { playShapeFails, playShapeNumbers } from "../src/playShape.js";
import level1 from "../../../levels/golden/proto-L001.json";
import filterData from "../data/filters.json";

const P = filterData.playShape as typeof filterData.playShape & { exempt: string[] };
const END = 300 * TPS;
const b = (beat: string, share: number) => ({ beat, tick: Math.round(share * END) });
const fails = (beats: { beat: string; tick: number }[], end = END) => playShapeFails(playShapeNumbers(beats, end), end, P);

describe("playShape", () => {
  const good = [b("a", 0.1), b("b", 0.3), b("c", 0.6), b("d", 0.9)];
  it("passes an even sheet", () => expect(fails(good)).toEqual([]));
  it("fails a phase over 45%", () => {
    const f = fails([b("a", 0.05), b("b", 0.1), b("c", 0.7), b("d", 0.95)]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatch(/phase/);
  });
  it("last phase runs to the level end", () => expect(fails([b("a", 0.05), b("b", 0.1), b("c", 0.2), b("d", 0.4)])[0]).toMatch(/phase/));
  it("fails too few beat types, passes three", () => {
    expect(fails([b("a", 0.3), b("b", 0.6), b("b", 0.9)]).join()).toMatch(/beat types/);
    expect(fails([b("a", 0.3), b("b", 0.6), b("c", 0.9)])).toEqual([]);
  });
  it("two beat types are enough under two minutes", () => {
    const two = [{ beat: "a", tick: 40 * TPS }, { beat: "b", tick: 80 * TPS }];
    expect(fails(two, 100 * TPS)).toEqual([]);
    expect(fails([{ beat: "a", tick: 80 * TPS }, { beat: "b", tick: 160 * TPS }], 200 * TPS).join()).toMatch(/beat types/);
  });
  it("fails when no beat comes after the first third", () => {
    expect(fails([b("a", 0.05), b("b", 0.15), b("c", 0.25), b("d", 0.3)]).join()).toMatch(/no new beat/);
  });
  it("phases and the late beat read the play-shape sheet, beat types read first occurrences (151.3)", () => {
    const first = [{ beat: "sold", tick: 10 }, { beat: "wave_started", tick: 20 }];
    const shape = [...first, { beat: "wave_started", tick: 50 }, { beat: "act:gather:res.food_raw_1", tick: 75 }];
    expect(playShapeNumbers(first, 100, shape)).toEqual({ maxPhaseShare: 0.3, beatTypes: 2, lastNewBeatShare: 0.75 });
    expect(playShapeNumbers(first, 100)).toEqual({ maxPhaseShare: 0.8, beatTypes: 2, lastNewBeatShare: 0.2 });
  });
  it("numbers", () => expect(playShapeNumbers(good, END)).toEqual({ maxPhaseShare: 0.3, beatTypes: 4, lastNewBeatShare: 0.9 }));
  it("exempt list skips the filter, an empty beat sheet never fires", () => {
    const ms = measure(level1, { refSeeds: 1, otherSeeds: 1 });
    const bad = { ...ms, beats: [{ beat: "a", tick: 1 }], shapeBeats: [{ beat: "a", tick: 1 }], beatsEnd: 100000 };
    // report-only until the limits are settled: the evidence lists the failures, the filter does not fire
    expect(P.enforce).toBe(false);
    expect(qualityFilters(bad, content).filters.playShape).toBe(false);
    expect(qualityFilters(bad, content).evidence.playShape.length).toBeGreaterThan(0);
    P.enforce = true;
    try { expect(qualityFilters(bad, content).filters.playShape).toBe(true); } finally { P.enforce = false; }
    const id = bad.manifest.id;
    P.exempt.push(id);
    P.enforce = true;
    try { expect(qualityFilters(bad, content).filters.playShape).toBe(false); } finally { P.exempt.pop(); P.enforce = false; }
    expect(qualityFilters({ ...bad, beats: [], beatsEnd: 0 }, content).filters.playShape).toBe(false);
  });
});
