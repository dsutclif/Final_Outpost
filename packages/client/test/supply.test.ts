import { describe, expect, it } from "vitest";
import type { LevelMeta } from "../src/levels.js";
import { REPORT_WINDOW, progressReport, supplyLow } from "../src/supply.js";

const meta = (i: number, url = true): LevelMeta => ({ id: `L${i}`, index: i, modules: [], goalType: "build", text: {}, engineVersion: "1", contentVersion: "1", ...(url ? { url: `/p/L${i}.json` } : {}) });

describe("level supply reporting", () => {
  const levels = Array.from({ length: 30 }, (_, i) => meta(i));

  it("reports the highest cleared level and the recent ones with stars and attempts", () => {
    const cleared: Record<string, true> = {};
    for (let i = 0; i < 25; i++) cleared[`L${i}`] = true;
    const r = progressReport(levels, cleared, (id) => (id === "L24" ? 2 : 3), { L24: 4 });
    expect(r.cleared).toBe(25);
    expect(r.played).toHaveLength(REPORT_WINDOW);
    expect(r.played.at(-1)).toEqual({ index: 25, stars: 2, attempts: 4 });
    expect(r.played[0]!.attempts).toBe(1);
  });

  it("ignores levels that are not from a shipped pack", () => {
    const r = progressReport([meta(0, false), meta(1)], { L0: true }, () => 3, {});
    expect(r).toEqual({ cleared: 0, played: [] });
  });

  it("asks for a batch only when one could add enough levels", () => {
    expect(supplyLow(60, 60)).toBe(true);
    expect(supplyLow(60, 9)).toBe(false);
    expect(supplyLow(60, 10)).toBe(true);
    expect(supplyLow(120, 59)).toBe(false);
  });
});
