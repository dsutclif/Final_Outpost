import { describe, expect, it } from "vitest";
import { TPS } from "../../packages/sim/src/index.js";
import { loadLimits } from "./lib.js";
import { ProgressTracker, analyseGuide, guideCandidates, stepName, type GuideRecord } from "./guide-core.js";

const G = loadLimits().guide;
const t = (s: number): number => Math.round(s * TPS);

const rec = (steps: [number, string][], progress: number[], endS: number, over: Partial<GuideRecord> = {}): GuideRecord => ({
  levelId: "s1-L003", pack: "s1", ticks: t(endS), over: true, won: true, reason: "goal",
  steps: steps.map(([s, key]) => ({ tick: t(s), key, text: key })), progress: progress.map(t), ...over,
});

describe("guide analysis", () => {
  it("finds nothing in a level that steadily progresses", () => {
    const r = rec([[0, "gather:3"], [10, "feed:"], [20, "pay:pad.a"], [30, "gather:4"]], [5, 15, 25, 35, 45, 55], 60);
    const g = analyseGuide(r, G);
    expect(g.stalls).toEqual([]);
    expect(g.loop).toBeNull();
    expect(g.noProgressMaxS).toBe(10);
    expect(g.longestStep).toEqual({ key: "gather", s: 30 });
    expect(guideCandidates([g], G)).toEqual([]);
  });

  it("finds an arrow that sits on one step with no progress", () => {
    const r = rec([[0, "gather:1"], [5, "register:"]], [3], 120, { won: false, reason: "meter.lifeline" });
    const g = analyseGuide(r, G);
    expect(g.stalls).toEqual([{ key: "register", s: 115 }]);
    const c = guideCandidates([g], G);
    expect(c.map((x) => x.fingerprint)).toEqual(["cat6|s1-L003|guide:register|stall"]); // the loss is explained by the stall
    expect(c[0]).toMatchObject({ category: 6, via: "trace", pillar: 1, track: "main", metric: { name: "stepStallS", value: 115, limit: 40 } });
  });

  it("does not call a long step a stall when the level progresses during it", () => {
    const r = rec([[0, "pay:pad.big"]], [10, 30, 50, 70], 90);
    expect(analyseGuide(r, G).stalls).toEqual([]);
  });

  it("finds an arrow that swaps between a few steps with nothing getting done", () => {
    const steps: [number, string][] = [];
    for (let i = 0; i < 20; i++) steps.push([i * 3, i % 2 ? "gather:5" : "gate:start"]);
    const g = analyseGuide(rec(steps, [1], 90, { over: false, won: false, reason: "" }), G);
    expect(g.loop).toMatchObject({ keys: ["gate:start", "gather"] });
    expect(g.loop!.s).toBeGreaterThanOrEqual(G.loopS);
    const fp = guideCandidates([g], G).map((x) => x.fingerprint);
    expect(fp).toEqual(["cat6|s1-L003|guide:gate:start+gather|loop"]);
  });

  it("reports an arrow that disappears while nothing progresses, and a level that never finishes unexplained", () => {
    const g = analyseGuide(rec([[0, "gather:1"], [5, "none"]], [2, 3, 50], 70, { over: false, won: false, reason: "" }), G);
    expect(g.noGuideMaxS).toBe(45);
    expect(guideCandidates([g], G).map((x) => x.fingerprint).sort()).toEqual(["cat6|s1-L003|guide|no_arrow", "cat6|s1-L003|guide|unfinished"]);
  });

  it("reports a loss that no stall or loop explains", () => {
    const g = analyseGuide(rec([[0, "gather:1"], [10, "fight:"], [20, "gather:2"]], [5, 15, 25], 40, { won: false, reason: "base.destroyed" }), G);
    const c = guideCandidates([g], G);
    expect(c.map((x) => x.fingerprint)).toEqual(["cat6|s1-L003|guide|loses"]);
    expect(c[0]!.detail).toMatch(/base.destroyed/);
  });

  it("keeps step names free of instance numbers", () => {
    expect(stepName("gather:7")).toBe("gather");
    expect(stepName("register:")).toBe("register");
    expect(stepName("pay:pad.build.x")).toBe("pay:pad.build.x");
    expect(stepName("gate:turret1")).toBe("gate:turret1");
  });

  it("counts progress the way the client's stuck timer does", () => {
    const tr = new ProgressTracker();
    const st = (progress: number, done: boolean, pads: number) => ({ objectives: [{ id: "main", progress, done }], pads: Array.from({ length: 3 }, (_, i) => ({ done: i < pads })) }) as unknown as Parameters<ProgressTracker["note"]>[0];
    expect(tr.note(st(0, false, 0))).toBe(true); // first look
    expect(tr.note(st(0, false, 0))).toBe(false);
    expect(tr.note(st(3, false, 0))).toBe(true); // new best
    expect(tr.note(st(2, false, 0))).toBe(false);
    expect(tr.note(st(2, false, 1))).toBe(true); // a pad finished
    expect(tr.note(st(2, true, 1))).toBe(true); // an objective done
  });
});
