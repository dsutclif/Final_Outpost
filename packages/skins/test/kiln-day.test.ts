import { describe, expect, it } from "vitest";
import { marsGreenhouse } from "../src/index.js";

// Story draft 5: KILN's clock runs from the relit reactor, so its first readout header in levels 1-4 carries the day.
type Act = { line?: string; who?: string; head?: string };
const levels = (marsGreenhouse as unknown as { story: { levels: Record<string, { cues: { do: Act[] }[] }> } }).story.levels;
const heads = (id: string): string[] =>
  levels[id]!.cues.flatMap((c) => c.do).filter((a) => a.who === "kiln" && a.head).map((a) => a.head!);

describe("KILN's readout carries the day", () => {
  it.each([["story-L001", 1], ["story-L002", 2], ["story-L003", 3], ["story-L004", 4]] as const)("%s", (id, day) => {
    const h = heads(id);
    expect(h.length).toBeGreaterThan(0);
    for (const x of h) expect(x).toMatch(new RegExp(`· DAY ${day}$`));
  });
});
