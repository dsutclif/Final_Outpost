import { describe, expect, it } from "vitest";
import { HUMAN, LADDER, playBot } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level4 from "../../../levels/golden/proto-L004.json";

// Brain.taskKinds is for review tools that sample what the planner could do; sampling must not change a run.
describe("Brain.taskKinds sampling", () => {
  for (const [name, level] of [["proto-L001", level1], ["proto-L004", level4]] as const) {
    it(`leaves ${name} exactly as it plays unsampled (human bot and good bot)`, () => {
      for (const profile of [HUMAN, LADDER[0]!]) {
        const plain = playBot(level, profile, 2);
        let samples = 0, seenKinds = 0;
        const sampled = playBot(level, profile, 2, {
          onTick: (st, brain) => {
            if (st.tick % 15 !== 0 || st.over) return;
            samples++;
            seenKinds += brain.taskKinds(st, 30).length;
          },
        });
        expect(samples).toBeGreaterThan(5);
        expect(seenKinds).toBeGreaterThan(0);
        expect(sampled.hash).toBe(plain.hash);
        expect(sampled.ticks).toBe(plain.ticks);
        expect(sampled.stars).toBe(plain.stars);
        expect(sampled.trace).toEqual(plain.trace);
        expect(sampled.stalls).toBe(plain.stalls);
      }
    });
  }

  it("never lists wait, lists each kind once, and respects the minimum score", () => {
    let checked = 0;
    playBot(level1, HUMAN, 1, {
      onTick: (st, brain) => {
        if (st.tick % 60 !== 0 || st.over) return;
        const all = brain.taskKinds(st, 0);
        const strong = brain.taskKinds(st, 60);
        expect(all).not.toContain("wait");
        expect(new Set(all).size).toBe(all.length);
        for (const k of strong) expect(all).toContain(k);
        expect(strong.length).toBeLessThanOrEqual(all.length);
        checked++;
      },
    });
    expect(checked).toBeGreaterThan(3);
  });
});
