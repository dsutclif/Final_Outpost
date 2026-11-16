import { describe, expect, it } from "vitest";
import { TOW_LOOP_R, fightArrowHidden, towGroup, towLoopPath } from "../src/guide.js";

describe("towLoopPath", () => {
  const pod = { x: 100, y: 100 };

  it("draws a lap around the pod, starting on the hero's side", () => {
    const hero = { x: 300, y: 100 };
    const p = towLoopPath([{ x: 200, y: 100 }, pod], hero, pod);
    expect(p[0]).toEqual({ x: 200, y: 100 });
    expect(p[1]!.x).toBeCloseTo(pod.x + TOW_LOOP_R);
    expect(p[1]!.y).toBeCloseTo(pod.y);
    const ring = p.slice(1);
    expect(ring).toHaveLength(12);
    for (const q of ring) expect(Math.hypot(q.x - pod.x, q.y - pod.y)).toBeCloseTo(TOW_LOOP_R);
  });

  it("never walks across the circle on the way in", () => {
    const hero = { x: 110, y: 100 };
    const p = towLoopPath([{ x: 120, y: 100 }, pod], hero, pod);
    expect(p).toHaveLength(12);
  });

  it("draws one loop around pods side by side, none around a far one", () => {
    const a = { x: 100, y: 100 }, b = { x: 160, y: 100 }, far = { x: 600, y: 100 };
    const group = towGroup([a, b, far], a);
    expect(group).toEqual([a, b]);
    const p = towLoopPath([{ x: 300, y: 100 }, a], { x: 300, y: 100 }, a, group);
    const ring = p.slice(1);
    for (const q of ring) {
      expect(Math.hypot(q.x - 130, q.y - 100)).toBeCloseTo(TOW_LOOP_R + 30);
      expect(Math.hypot(q.x - a.x, q.y - a.y)).toBeGreaterThanOrEqual(TOW_LOOP_R - 1e-6);
    }
  });
});

describe("fightArrowHidden (outpost-ops#188)", () => {
  const sq = [{ x: 0, y: 0 }, { x: 100000, y: 0 }, { x: 100000, y: 100000 }, { x: 0, y: 100000 }];
  const cp = { player: { rangedRange: 40000, attackRange: 10000 } } as never;
  const st = (px: number, py: number) => ({
    player: { pos: { x: px, y: py } }, core: { pos: { x: 50000, y: 50000 } },
    hostiles: [{ pos: { x: 200000, y: 50000 } }],
  }) as never;

  it("hides the arrow outside the gate and within range of the attack path", () => {
    expect(fightArrowHidden(st(150000, 80000), cp, [sq])).toBe(true);
  });
  it("shows it outside the gate but away from the attack path", () => {
    expect(fightArrowHidden(st(150000, 300000), cp, [sq])).toBe(false);
  });
  it("shows it inside the gate, however near the path", () => {
    expect(fightArrowHidden(st(60000, 50000), cp, [sq])).toBe(false);
  });
  it("shows it when the level has no gate ring", () => {
    expect(fightArrowHidden(st(150000, 80000), cp, [])).toBe(false);
  });
});
