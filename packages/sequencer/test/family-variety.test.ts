import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, FAMILIES, goalReach, goalsInReach, sequence, slotFor, targetFor, type Family } from "../src/index.js";

const cfg = DEFAULT_CONFIG;
const first = cfg.tutorialLength + 1;
// the mix slots of a 10-level sector (the finale, two families, is left out)
const mixSlots = (from: number, to: number) => {
  const out: { i: number; family: Family; target: number; pos: number }[] = [];
  for (let i = from; i <= to; i++) {
    const s = slotFor(i, cfg);
    if (s.phase !== "mix") continue;
    out.push({ i, family: s.family, target: targetFor(i, s.phase, cfg).target, pos: (i - 1) % cfg.blockLength });
  }
  return out;
};

describe("family variety across sectors (rotation shift, slotFor)", () => {
  const { lo, hi } = cfg.band;
  const third = (t: number) => (t < lo + (hi - lo) / 3 ? 0 : t < lo + (2 * (hi - lo)) / 3 ? 1 : 2);

  it("every family gets targets in the low, mid and high thirds of the band within any 50 levels", () => {
    for (let start = first; start <= first + 100; start++) {
      const slots = mixSlots(start, start + 49);
      for (const f of FAMILIES) {
        const thirds = new Set(slots.filter((s) => s.family === f).map((s) => third(s.target)));
        expect({ start, f, thirds: [...thirds].sort() }).toEqual({ start, f, thirds: [0, 1, 2] });
      }
    }
  });

  it("no family holds the same position in two consecutive sectors", () => {
    const sector0 = Math.ceil(first / cfg.blockLength);
    for (let k = sector0; k < sector0 + 15; k++) {
      const a = mixSlots(k * cfg.blockLength + 1, (k + 1) * cfg.blockLength), b = mixSlots((k + 1) * cfg.blockLength + 1, (k + 2) * cfg.blockLength);
      for (const f of FAMILIES) {
        const pa = a.filter((s) => s.family === f).map((s) => s.pos), pb = b.filter((s) => s.family === f).map((s) => s.pos);
        expect({ sector: k + 1, f, shared: pa.filter((p) => pb.includes(p)) }).toEqual({ sector: k + 1, f, shared: [] });
      }
    }
  });
});

describe("goal ranges (ops docs/reference/composer.md)", () => {
  it("Level 25 (industrialize, target 0.581) does not get automate: its winnable D tops out near 0.3", () => {
    const s = slotFor(25, cfg);
    const r = goalReach("automate", s, 25, 0.581, undefined, cfg);
    expect(r).not.toBeNull();
    expect(r!.hi).toBeLessThan(0.581);
    const req = sequence(25, []);
    expect(req.goalId).not.toBe("automate");
  });

  it("a goal with no usable range (heat_hold: stuck near 0) is never ruled out", () => {
    expect(goalReach("heat_hold", slotFor(25, cfg), 25, 0.581, undefined, cfg)).toBeNull();
  });

  it("when no goal reaches the target the nearest is taken, with a note", () => {
    const capped = { ...cfg, goalRanges: { a: { lo: null, hi: -0.5, n: 5 }, b: { lo: null, hi: -0.4, n: 5 } },
      goals: { ...cfg.goals, a: { family: "industrialize" as Family, needs: [] }, b: { family: "industrialize" as Family, needs: [] } } };
    const out = goalsInReach(["a", "b"], 0.6, slotFor(25, cfg), 25, undefined, capped);
    expect(out.goals).toEqual(["b"]);
    expect(out.note).toMatch(/no goal reaches D 0.6: nearest b/);
  });
});
