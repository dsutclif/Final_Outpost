import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readJsonl, repoRoot, loadLimits } from "./lib.js";
import {
  TaskSampler, assemble, compareToPrevious, lastRows, listLevels, medianShape, pulseCandidates, pulseLevel, readManifest, trackedFields,
  type HistoryRow, type LevelPulse,
} from "./pulse-core.js";

const L = loadLimits();
const golden = resolve(repoRoot, "levels/golden");

const shape = (over: Partial<LevelPulse["shape"]> = {}): LevelPulse["shape"] => ({
  durS: 100, stillS: 10, longestStillS: 3, distU: 500, acts: { gathered: 10, deposited: 10 }, firstRewardS: 5, rewardGapMaxS: 10, sameRunMax: 3, ...over,
});

/** A level that trips no check, for tests to bend. */
function lvl(id: string, over: Partial<LevelPulse> = {}): LevelPulse {
  return {
    levelId: id, pack: "p", index: 0, family: "shelter", goal: "build", template: "a|b", seeds: 3,
    stars: { good: 3, average: 3, weak: 2, novice: 2, floor: 1, human: 3 }, winRate: { good: 1, human: 1 },
    D: 0.5, F: 0.5, feasible: true, filters: [], metrics: {},
    proxies: { deadTime: { value: 0.01, y: 1 }, tensionRhythm: { value: 3, y: 1 }, fairFailure: { value: 1, y: 1 } },
    shape: shape(), oneTaskS: 5, oneTaskKinds: "gather", noTaskS: 1, choiceShare: 0.6, loopMax: 2, loopKey: "",
    human: { winRate: 1, earned: [{ kind: "time", n: 3 }], lossAfterS: -1, stalls: 0, seeds: 3 }, ...over,
  };
}

describe("pulse of one level", () => {
  const manifest = readManifest(listLevels(golden)[0]!);

  it("plays the ladder and the human bot and reports stars, proxies, shape and one-task time", () => {
    const p = pulseLevel(manifest, { seeds: 1, sampling: L.sampling, pack: "golden", index: 0 });
    expect(p.levelId).toBe("proto-L001");
    expect(Object.keys(p.stars).sort()).toEqual(["average", "floor", "good", "human", "novice", "weak"]);
    expect(p.stars["human"]).toBeGreaterThanOrEqual(0);
    expect(Object.keys(p.proxies)).toEqual(expect.arrayContaining(["deadTime", "tensionRhythm", "fairFailure", "rewardCadence"]));
    expect(p.shape.durS).toBeGreaterThan(30);
    expect(p.shape.acts["deposited"]).toBeGreaterThan(0);
    expect(p.oneTaskS).toBeGreaterThanOrEqual(0);
    expect(p.noTaskS).toBeGreaterThanOrEqual(0);
    expect(p.choiceShare).toBeGreaterThan(0);
    expect(p.choiceShare).toBeLessThanOrEqual(1);
    expect(p.human.seeds).toBe(1);
  });

  it("is deterministic: the same level twice gives the same numbers", () => {
    const a = pulseLevel(manifest, { seeds: 1, sampling: L.sampling });
    const b = pulseLevel(manifest, { seeds: 1, sampling: L.sampling });
    expect(b).toEqual(a);
  });
});

describe("task sampler", () => {
  it("measures the longest run of exactly one kind, and of none", () => {
    const s = new TaskSampler(15); // 0.5 s per sample
    for (const k of [["a", "b"], ["fuel"], ["fuel"], ["feed"], ["a", "b"], ["x"], [], [], [], ["x"]]) s.sample(k);
    expect(s.oneTaskS).toBe(1.5); // fuel, fuel, feed
    expect(s.bestKinds).toBe("feed+fuel");
    expect(s.noTaskS).toBe(1.5);
    expect(s.choiceShare).toBeCloseTo(0.2);
  });
});

describe("play shape across seeds", () => {
  it("takes the median of each field, and of each action count (a missing action is zero)", () => {
    const m = medianShape([shape({ stillS: 10, acts: { gathered: 4 } }), shape({ stillS: 30, acts: { gathered: 6, built: 2 } }), shape({ stillS: 20, acts: { gathered: 8 } })]);
    expect(m.stillS).toBe(20);
    expect(m.acts).toEqual({ built: 0, gathered: 6 });
  });
});

describe("history comparison", () => {
  const prevRow = (p: LevelPulse): HistoryRow => ({ v: 1, date: "2026-11-05", build: "abc", engine: "0.19.0", content: "0.18.0", ...p });

  it("flags what moved past tolerance since the previous row of the same level, and nothing else", () => {
    const before = prevRow(lvl("s1-L001"));
    const now = lvl("s1-L001", { stars: { good: 3, average: 3, weak: 2, novice: 2, floor: 1, human: 1.5 }, D: 0.55, shape: shape({ rewardGapMaxS: 60 }) });
    const moved = compareToPrevious(now, before, L.tolerance);
    expect(moved.map((m) => m.field).sort()).toEqual(["shape.rewardGapMaxS", "stars.human"]);
    expect(moved.find((m) => m.field === "stars.human")).toMatchObject({ levelId: "s1-L001", prev: 3, now: 1.5, delta: -1.5 });
    expect(compareToPrevious(lvl("s1-L001"), before, L.tolerance)).toEqual([]);
  });

  it("compares nothing when the run setup differs or there is no previous row", () => {
    const before = prevRow(lvl("s1-L001"));
    expect(compareToPrevious(lvl("s1-L001", { seeds: 5, D: 0.9 }), before, L.tolerance)).toEqual([]);
    expect(compareToPrevious(lvl("s1-L001", { D: 0.9 }), undefined, L.tolerance)).toEqual([]);
  });

  it("uses the latest row per level from a two-row history, then appends this run's rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-"));
    const file = join(dir, "history.jsonl");
    writeFileSync(file, JSON.stringify(prevRow(lvl("s1-L001", { D: 0.1 }))) + "\n" + JSON.stringify(prevRow(lvl("s1-L001", { D: 0.5 }))) + "\n");
    appendFileSync(file, "{ half a line");
    const previous = readJsonl<HistoryRow>(file);
    expect(previous).toHaveLength(2);
    expect(lastRows(previous).get("s1-L001")?.D).toBe(0.5);
    const meta = { generated: "2026-11-06T02:00:00.000Z", engine: "0.19.0", content: "0.18.0", seeds: 3, packs: ["p"], runtimeS: 1, errors: [] };
    const run = assemble([lvl("s1-L001", { D: 0.9 })], previous, L, meta, "def");
    expect(run.file.moved).toEqual([{ levelId: "s1-L001", field: "D", prev: 0.5, now: 0.9, delta: 0.4 }]);
    expect(run.rows).toHaveLength(1);
    expect(run.rows[0]).toMatchObject({ v: 1, date: "2026-11-06", build: "def", levelId: "s1-L001", D: 0.9 });
    expect(run.file.meta.levels).toBe(1);
    expect(run.file.levels["s1-L001"]).toBeDefined();
  });

  it("tracks the numbers the limits file gives tolerances for", () => {
    const f = trackedFields(lvl("x"));
    for (const k of ["stars.human", "winRate.human", "D", "F", "proxy.deadTime", "shape.longestStillS", "oneTaskS", "noTaskS", "loopMax"]) expect(f).toHaveProperty(k);
  });
});

describe("candidates from the limits", () => {
  it("raises nothing for a level inside every limit", () => {
    expect(pulseCandidates([lvl("a")], [], L)).toEqual([]);
  });

  it("flags each boredom pattern in its own category, with a fingerprint free of measured numbers", () => {
    const bad = lvl("s1-L007", {
      noTaskS: 12, oneTaskS: 40, oneTaskKinds: "fuel", loopMax: 9, loopKey: "node>res>sink",
      shape: shape({ rewardGapMaxS: 90 }),
      proxies: { deadTime: { value: 0.3, y: -1 }, tensionRhythm: { value: 0, y: -1 }, fairFailure: { value: 0.5, y: 0 } },
      human: { winRate: 0, earned: [{ kind: "time", n: 0 }], lossAfterS: 200, stalls: 0, seeds: 3 },
    });
    const c = pulseCandidates([bad], [], L);
    const byCheck = Object.fromEntries(c.map((x) => [x.fingerprint.split("|").slice(2).join("|"), x]));
    expect(Object.keys(byCheck).sort()).toEqual([
      "dead_time|timer", "loss|long_run", "loss|unexplained", "no_choice|one_task", "repetition|same_trip", "reward_gap|drought",
      "standing_still|idle", "star_time|unreachable", "human_bot|never_wins", "tension|flat",
    ].sort());
    expect(byCheck["no_choice|one_task"]).toMatchObject({ category: 9, via: "trace", pillar: 2, track: "main", levelId: "s1-L007", metric: { name: "oneTaskS", value: 40, limit: 20 } });
    expect(byCheck["loss|long_run"]!.category).toBe(10);
    for (const x of c) {
      const [cat, level, subject, check] = x.fingerprint.split("|");
      expect(cat).toBe(`cat${x.category}`);
      expect(level).toBe("s1-L007");
      expect(`${subject}|${check}`).not.toMatch(/(?<![A-Za-z_\d])\d/);
    }
  });

  it("flags a star drop of more than one against the previous level, and the third level of a run in one family", () => {
    const pack = [
      lvl("s1-L001", { index: 0, family: "defend", stars: { human: 3 } }),
      lvl("s1-L002", { index: 1, family: "defend", stars: { human: 1.5 } }),
      lvl("s1-L003", { index: 2, family: "defend", stars: { human: 1.5 } }),
      lvl("s1-L004", { index: 3, family: "defend", stars: { human: 1.5 } }),
    ];
    const c = pulseCandidates(pack, [], L).map((x) => x.fingerprint);
    expect(c).toContain("cat10|s1-L002|stars.human|spike");
    expect(c).toContain("cat11|s1-L003|family|repeat"); // only where the run first passes the limit
    expect(c).not.toContain("cat11|s1-L004|family|repeat");
  });

  it("flags walking over twice the pack median, but only in a pack big enough to have one", () => {
    const mk = (i: number, dist: number) => lvl(`p-L00${i}`, { index: i, shape: shape({ distU: dist }), family: i % 2 ? "a" : "b", template: `t${i}` });
    const pack = [mk(0, 500), mk(1, 520), mk(2, 480), mk(3, 510), mk(4, 2000)];
    expect(pulseCandidates(pack, [], L).map((x) => x.fingerprint)).toEqual(["cat9|p-L004|walking|long_walks"]);
    expect(pulseCandidates(pack.slice(0, 4), [], L)).toEqual([]);
  });

  it("turns a drop in human-view stars since the last run into a category 10 candidate (rises are not defects)", () => {
    const a = lvl("s1-L001", { stars: { human: 1 } });
    const down = pulseCandidates([a], [{ levelId: "s1-L001", field: "stars.human", prev: 3, now: 1, delta: -2 }], L);
    expect(down.map((x) => x.fingerprint)).toEqual(["cat10|s1-L001|stars.human|moved"]);
    expect(pulseCandidates([a], [{ levelId: "s1-L001", field: "stars.human", prev: 1, now: 3, delta: 2 }], L)).toEqual([]);
  });

  it("lists the golden pack in play order and a pack folder without pack.json by file name", () => {
    expect(listLevels(golden).map((r) => r.id)).toEqual(["proto-L001", "proto-L002", "proto-L003", "proto-L004"]);
    const story = listLevels(resolve(repoRoot, "levels/story"));
    expect(story.map((r) => r.id)).toEqual(["story-L001", "story-L002", "story-L003", "story-L004", "story-L005"]);
    expect(JSON.parse(readFileSync(join(story[0]!.packDir, story[0]!.file), "utf8")).id).toBe("story-L001");
  });
});
