import { describe, expect, it } from "vitest";
import type { LevelMeta } from "../src/levels.js";
import { isUnlocked, nextLevel } from "../src/progress.js";
import { DEFAULT_PROGRESS, mergeProgress, type Progress } from "../src/save.js";
import { progressReport } from "../src/supply.js";
import { LOG_MAX, logText, pushLog, type LogLine } from "../src/levellog.js";
import { getSkin } from "@fo/skins";

const meta = (i: number): LevelMeta => ({ id: `L${i}`, index: i, modules: [], goalType: "build", text: {}, engineVersion: "1", contentVersion: "1", url: `/p/L${i}.json` });
const levels = Array.from({ length: 12 }, (_, i) => meta(i));
const prog = (p: Partial<Progress>): Progress => ({ ...structuredClone(DEFAULT_PROGRESS), ...p });

describe("skipped levels (R5 #12)", () => {
  it("opens the next level and moves Play on, without being cleared", () => {
    const p = prog({ cleared: { L0: true }, skipped: { L1: true } });
    expect(isUnlocked(levels, levels[2]!, p)).toBe(true);
    expect(nextLevel(levels, p)!.id).toBe("L2");
    expect(p.cleared["L1"]).toBeUndefined();
  });

  it("loads old saves with no skipped field, and keeps it across a keep-progress epoch change", () => {
    expect(mergeProgress({ epoch: 99, cleared: { L0: true } }).skipped).toEqual({});
    expect(mergeProgress({ cleared: {}, skipped: { L3: true } }, "keep").skipped).toEqual({ L3: true });
  });

  it("is excluded from the tuning report and the level supply count", () => {
    const p = prog({ cleared: { L0: true, L1: true }, skipped: { L2: true, L5: true }, tries: { L2: 9 } });
    const r = progressReport(levels, p.cleared, () => 0, p.tries);
    expect(r.cleared).toBe(2);
    expect(r.played.map((x) => x.index)).toEqual([1, 2]);
  });
});

describe("level log", () => {
  const skin = getSkin(null);
  it("keeps milestones only and caps its length", () => {
    const cp = { entityById: {} } as never;
    expect(logText({ t: "gathered", res: "r", node: 0, at: { x: 0, y: 0 } }, skin, cp)).toBeNull();
    expect(logText({ t: "wave_started", idx: 0 }, skin, cp)).toBe("Raid 1 began");
    const log: LogLine[] = [];
    pushLog(log, 1, "a"); pushLog(log, 2, "a"); pushLog(log, 3, null);
    expect(log).toHaveLength(1);
    for (let i = 0; i < LOG_MAX + 5; i++) pushLog(log, i, `x${i}`);
    expect(log).toHaveLength(LOG_MAX);
  });
});
