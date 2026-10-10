import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { DEFAULT_CONFIG, type HistoryEntry, alwaysOn, closure, conflicts, introductionLevel, optionalOf, schedule, sequence, sequenceRange, targetFor, type LevelRequest } from "../src/index.js";

const N = 60;
const reqs: LevelRequest[] = sequenceRange(1, N);
const cfg = DEFAULT_CONFIG;
const key = (r: LevelRequest) => `${r.modules.join(",")}|${r.goalType}|${r.template}`;

describe("sequencer", () => {
  it("is pure: the same index and history give the same request", () => {
    const again = sequenceRange(1, N);
    expect(again).toEqual(reqs);
    const h = reqs.slice(0, 29).map((r) => ({ modules: r.modules, goal: r.goalType, template: r.template }));
    expect(sequence(30, h)).toEqual(reqs[29]);
  });

  it("introduces modules in content order (barrier lines no later than the lasso)", () => {
    const beats = schedule();
    const at = (m: string) => introductionLevel(m)!;
    const ordered = Object.entries(content.modules).filter(([, d]) => d.introducedAt !== null).sort((a, b) => a[1].introducedAt! - b[1].introducedAt!);
    for (let i = 1; i < ordered.length; i++) expect(at(ordered[i]![0])).toBeGreaterThanOrEqual(at(ordered[i - 1]![0]));
    expect(at("barrier_lines")).toBeLessThanOrEqual(at("lasso"));
    expect(beats[0]!.level).toBe(1);
    expect(beats.every((b, i) => i === 0 || b.level > beats[i - 1]!.level)).toBe(true);
    // Every optional module is introduced within the 60 levels.
    for (const id of Object.keys(content.modules)) if (!content.modules[id]!.alwaysOn) expect(at(id)).toBeLessThanOrEqual(N);
  });

  it("teach: the new mechanic with at most 2 familiar modules, at a low target", () => {
    for (const r of reqs.filter((x) => x.phase === "teach")) {
      expect(r.introduced.length).toBeGreaterThan(0);
      for (const m of r.introduced) expect(r.modules).toContain(m);
      // Dependencies are forced (salvage upgrades pull in defense, barrier lines and build pads).
      const deps = optionalOf(closure(r.introduced)).filter((m) => !r.introduced.includes(m));
      expect(optionalOf(r.modules).filter((m) => !r.introduced.includes(m)).length).toBeLessThanOrEqual(Math.max(2, deps.length));
      expect(r.target).toBeLessThanOrEqual(cfg.teachTarget);
    }
  });

  it("test: the next levels reuse the new mechanic with different companions", () => {
    const comp = (r: LevelRequest, intro: string[]) => optionalOf(r.modules).filter((m) => !intro.includes(m)).join(",");
    for (const t of reqs.filter((x) => x.phase === "teach")) {
      const tests = reqs.filter((x) => x.index > t.index && x.index <= t.index + cfg.testLevels && x.phase === "test");
      expect(tests.length).toBe(cfg.testLevels);
      // Companions can only differ once something else is unlocked.
      const deps = closure(t.introduced);
      const pool = Object.keys(content.modules).filter((m) => !content.modules[m]!.alwaysOn && !deps.includes(m)
        && !cfg.dependencyOnly.includes(m) && (introductionLevel(m) ?? 99) < t.index);
      for (const x of tests) {
        for (const m of t.introduced) expect(x.modules).toContain(m);
        if (pool.length > 0) expect(comp(x, t.introduced)).not.toBe(comp(t, t.introduced));
      }
    }
  });

  it("mix: 3 to 5 modules, always one introduced in the last 5 levels", () => {
    for (const r of reqs.filter((x) => x.phase === "mix")) {
      const opt = optionalOf(r.modules);
      expect(opt.length).toBeGreaterThanOrEqual(cfg.mix.min);
      const isRecent = (m: string) => { const at = introductionLevel(m)!; return at <= r.index && at > r.index - cfg.recentWindow; };
      // Once the introduction list has run out, no module is recent and the rule cannot apply.
      const anyRecent = Object.keys(content.modules).some((m) => !content.modules[m]!.alwaysOn && !cfg.dependencyOnly.includes(m) && isRecent(m));
      if (anyRecent) expect(opt.filter(isRecent).length).toBeGreaterThan(0);
    }
  });

  it("cap, dependencies, exclusions and always-on modules hold on every level", () => {
    for (const r of reqs) {
      expect(optionalOf(r.modules).length).toBeLessThanOrEqual(cfg.maxOptional);
      expect(closure(r.modules)).toEqual(r.modules);
      expect(conflicts(r.modules)).toEqual([]);
      for (const a of alwaysOn()) expect(r.modules).toContain(a);
    }
  });

  it("dependency-only modules never appear without a module that needs them", () => {
    for (const r of reqs) if (r.modules.includes("barrier_lines")) expect(r.modules.includes("lasso") || r.modules.includes("defense")).toBe(true);
  });

  it("goals exercise what the level needs: defense levels are waves, population needs recruits", () => {
    for (const r of reqs) {
      if (r.modules.includes("defense")) expect(r.goalType).toBe("waves");
      if (r.goalType === "population") expect(r.modules.includes("lasso") || r.modules.includes("housing")).toBe(true);
      if (r.goalType === "build" && r.phase !== "core") expect(r.modules).toContain("build_pads");
    }
    const housingTeach = reqs.find((r) => r.phase === "teach" && r.introduced.includes("housing"))!;
    expect(housingTeach.goalType).toBe("population");
    const defenseTeach = reqs.find((r) => r.phase === "teach" && r.introduced.includes("defense"))!;
    expect(defenseTeach.goalType).toBe("waves");
  });

  it("novelty: no two consecutive levels share module set, goal and template; no duplicate in the window", () => {
    for (let i = 1; i < reqs.length; i++) expect(key(reqs[i]!)).not.toBe(key(reqs[i - 1]!));
    for (let i = 0; i < reqs.length; i++) {
      const window = reqs.slice(Math.max(0, i - cfg.duplicateWindow), i).map(key);
      expect(window).not.toContain(key(reqs[i]!));
    }
  });

  it("curve: low tutorial arc, then a 0.4-0.8 sawtooth with a breather closing every block", () => {
    for (const r of reqs) {
      if (r.index <= cfg.tutorialLength) expect(r.target).toBeLessThanOrEqual(cfg.tutorialTargets.to + 1e-9);
      else { expect(r.target).toBeGreaterThanOrEqual(cfg.band.lo - 1e-9); expect(r.target).toBeLessThanOrEqual(cfg.band.hi + 1e-9); }
    }
    for (let b = cfg.tutorialLength + cfg.blockLength; b <= N; b += cfg.blockLength) expect(reqs[b - 1]!.breather).toBe(true);
    // Inside a block the mix targets rise.
    expect(targetFor(25, "mix").target).toBeLessThan(targetFor(28, "mix").target);
    const tut = reqs.filter((r) => r.index <= cfg.tutorialLength && r.phase !== "teach").map((r) => r.target);
    for (let i = 1; i < tut.length; i++) expect(tut[i]!).toBeGreaterThanOrEqual(tut[i - 1]!);
  });

  it("recovery (optional flag): after two failed attempts the next target drops by 0.1", () => {
    const h: HistoryEntry[] = reqs.slice(0, 33).map((r) => ({ modules: r.modules, goal: r.goalType, template: r.template }));
    const plain = sequence(34, h);
    h[h.length - 1] = { ...h[h.length - 1]!, fails: 2 };
    expect(sequence(34, h, { recovery: true }).target).toBeCloseTo(plain.target - cfg.recoveryDrop, 6);
    expect(sequence(34, h).target).toBe(plain.target);
  });

  it("level 1 is the core loop: always-on modules only", () => {
    expect(reqs[0]!.phase).toBe("core");
    expect(reqs[0]!.optional).toEqual([]);
  });
});
