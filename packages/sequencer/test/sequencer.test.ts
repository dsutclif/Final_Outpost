import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import {
  DEFAULT_CONFIG, FAMILIES, adaptOffset, alwaysOn, closure, conflicts, familyCounts, goalKind, historyOf, sequence, sequenceRange, slotFor, targetFor,
  type HistoryEntry, type LevelRequest, type SequencerConfig,
} from "../src/index.js";

const N = 60;
const reqs: LevelRequest[] = sequenceRange(1, N);
const cfg = DEFAULT_CONFIG;
const key = (r: LevelRequest) => `${r.modules.join(",")}|${r.goalType}|${r.template}`;

describe("sequencer (level families, REDESIGN-R2 §5)", () => {
  it("is pure: the same index and history give the same request", () => {
    expect(sequenceRange(1, N)).toEqual(reqs);
    const h: HistoryEntry[] = reqs.slice(0, 29).map(historyOf);
    expect(sequence(30, h)).toEqual(reqs[29]);
  });

  it("levels 1-5 teach the families in story order with a low target", () => {
    expect(reqs.slice(0, 5).map((r) => r.family)).toEqual(["shelter", "rescue", "harvest", "industrialize", "defend"]);
    for (const r of reqs.slice(0, 5)) {
      expect(r.phase).toBe("teach");
      expect(r.features).toEqual([]);
      expect(r.goalId).toBe(cfg.families[r.family].teachGoal);
      expect(r.target).toBeLessThanOrEqual(0.2);
    }
  });

  it("levels 6-15 introduce every family's deeper mechanics inside the family", () => {
    const intro = reqs.slice(5, 15);
    for (const r of intro) {
      expect(r.phase).toBe("intro");
      expect(r.introduced.length).toBeGreaterThan(0);
      for (const f of r.introduced) {
        expect(cfg.features[f]!.family).toBe(r.family);
        expect(r.features).toContain(f);
      }
    }
    const introduced = new Set(intro.flatMap((r) => r.features));
    for (const f of Object.keys(cfg.features)) expect({ f, introduced: introduced.has(f) }).toEqual({ f, introduced: true });
    // Each intro goal exercises a newly introduced feature.
    for (const r of intro) expect(cfg.goals[r.goalId]!.needs.some((n) => r.introduced.includes(n) || r.features.includes(n)) || cfg.goals[r.goalId]!.needs.length === 0).toBe(true);
  });

  it("after 15 the families rotate, with a two-family finale every 10th level", () => {
    for (const r of reqs) {
      if (r.index % 10 === 0 && r.index > 15) { expect(r.phase).toBe("finale"); expect(r.secondary).not.toBeNull(); expect(r.secondary).not.toBe(r.family); }
      else expect(r.secondary).toBeNull();
    }
    const mix = reqs.filter((r) => r.phase === "mix");
    for (let i = 1; i < mix.length; i++) expect(mix[i]!.family).not.toBe(mix[i - 1]!.family);
  });

  it("every family appears equally often over 60 levels", () => {
    const counts = familyCounts(reqs);
    for (const f of FAMILIES) expect(counts[f]).toBe(12);
  });

  it("goals belong to the level's family and their needed features are present", () => {
    for (const r of reqs) {
      const g = cfg.goals[r.goalId]!;
      expect(g.family).toBe(r.family);
      expect(r.goalType).toBe(goalKind(r.goalId));
      expect(content.objectives[r.goalType]?.main).toBe(true);
      for (const n of g.needs) if (!n.startsWith("@")) expect(r.features).toContain(n);
      // Anchored features (pads only bought from the plan) only with goals that put a pad on it.
      if (r.features.some((f) => cfg.features[f]!.anchor)) expect(g.anchor).toBe(true);
    }
  });

  it("dependencies, exclusions and always-on modules hold on every level (rescue never with defend)", () => {
    for (const r of reqs) {
      expect(closure(r.modules)).toEqual(r.modules);
      expect(conflicts(r.modules)).toEqual([]);
      for (const a of alwaysOn()) expect(r.modules).toContain(a);
      for (const m of cfg.families[r.family].modules) expect(r.modules).toContain(m);
    }
  });

  it("novelty: no two consecutive levels share module set, goal and template; no duplicate in the window", () => {
    for (let i = 1; i < reqs.length; i++) expect(key(reqs[i]!)).not.toBe(key(reqs[i - 1]!));
    for (let i = 0; i < reqs.length; i++) {
      const window = reqs.slice(Math.max(0, i - cfg.duplicateWindow), i).map(key);
      expect(window).not.toContain(key(reqs[i]!));
    }
  });

  it("curve: low tutorial arc, then a band sawtooth opening on a breather and closing on the finale", () => {
    for (const r of reqs) {
      if (r.index <= cfg.tutorialLength) expect(r.target).toBeLessThanOrEqual(cfg.tutorialTargets.to + 1e-9);
      else { expect(r.target).toBeGreaterThanOrEqual(cfg.band.lo - 1e-9); expect(r.target).toBeLessThanOrEqual(cfg.band.hi + 1e-9); }
    }
    for (let b = cfg.tutorialLength + 1; b <= N; b += cfg.blockLength) expect(reqs[b - 1]!.breather).toBe(true);
    expect(targetFor(25, "mix").target).toBeLessThan(targetFor(28, "mix").target);
    expect(targetFor(30, "finale").target).toBeCloseTo(cfg.band.hi, 6);
    const tut = reqs.filter((r) => r.index <= cfg.tutorialLength && r.phase === "mix").map((r) => r.target);
    for (let i = 1; i < tut.length; i++) expect(tut[i]!).toBeGreaterThanOrEqual(tut[i - 1]!);
  });

  it("recovery (optional flag): after two failed attempts the next target drops by 0.1", () => {
    const h: HistoryEntry[] = reqs.slice(0, 33).map(historyOf);
    const plain = sequence(34, h);
    h[h.length - 1] = { ...h[h.length - 1]!, fails: 2 };
    expect(sequence(34, h, { recovery: true }).target).toBeCloseTo(plain.target - cfg.recoveryDrop, 6);
    expect(sequence(34, h).target).toBe(plain.target);
  });

  it("slots are a pure function of the index", () => {
    expect(slotFor(1).family).toBe("shelter");
    expect(slotFor(6)).toMatchObject({ family: "shelter", phase: "intro" });
    expect(slotFor(15)).toMatchObject({ family: "defend", phase: "intro" });
    expect(slotFor(20).phase).toBe("finale");
  });
});

describe("batch tuning", () => {
  const on: SequencerConfig = { ...cfg, adapt: { ...cfg.adapt, enabled: true } };
  const played = (stars: number, attempts: number, n = 10) => Array.from({ length: n }, (_, i) => ({ index: 61 + i, stars, attempts }));

  it("shifts every target by the offset, the sequence otherwise unchanged", () => {
    const base = sequenceRange(61, 80);
    const eased = sequenceRange(61, 80, [], { targetOffset: -0.1 });
    for (let i = 0; i < base.length; i++) {
      expect(eased[i]!.target).toBeCloseTo(Math.max(0.05, base[i]!.target - 0.1), 3);
      expect({ ...eased[i]!, target: 0 }).toEqual({ ...base[i]!, target: 0 });
    }
  });

  it("holds when off, or with too few cleared levels", () => {
    expect(adaptOffset(0.1, played(1, 5)).offset).toBe(0);
    expect(adaptOffset(0.1, played(1, 5, on.adapt.minSamples - 1), on).offset).toBe(0.1);
  });

  it("eases a struggling player, hardens for a cruising one, holds in band", () => {
    expect(adaptOffset(0, played(3, 3), on).offset).toBe(-on.adapt.step);
    expect(adaptOffset(0, played(1, 1), on).offset).toBe(-on.adapt.step);
    expect(adaptOffset(0, played(3, 1), on).offset).toBe(on.adapt.step);
    expect(adaptOffset(0.05, played(2, 1.2), on).offset).toBe(0.05);
  });

  it("stays inside the offset bounds", () => {
    let o = 0;
    for (let k = 0; k < 20; k++) o = adaptOffset(o, played(0, 6), on).offset;
    expect(o).toBe(on.adapt.offset.lo);
    for (let k = 0; k < 20; k++) o = adaptOffset(o, played(3, 1), on).offset;
    expect(o).toBe(on.adapt.offset.hi);
  });
});
