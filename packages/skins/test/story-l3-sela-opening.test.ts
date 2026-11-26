import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { marsGreenhouse } from "../src/index.js";

// Level 3 (outpost-ops#312): Sela's opening keeps her old line with only "Well, I guess" put in front; no literal ellipsis. The screenplay matches.
type Cue = { id?: string; do: { line?: string; who?: string }[] };
const cues = (marsGreenhouse as unknown as { story: { levels: Record<string, { cues: Cue[] }> } }).story.levels["story-L003"]!.cues;
const LINE = "Well, I guess somebody's living out here. I'm Sela.";

it("Sela's first line is the card's wording", () => {
  const first = cues.find((c) => c.id === "selaMet")!.do.find((a) => a.who === "sela")!;
  expect(first.line).toBe(LINE);
});
it("the screenplay carries the same line", () => {
  const sp = readFileSync(new URL("../../../docs/STORY-SCREENPLAY.md", import.meta.url), "utf8");
  expect(sp).toContain(`**SELA:** ${LINE}`);
});
