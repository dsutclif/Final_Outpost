import { expect, it } from "vitest";
import { marsGreenhouse } from "../src/index.js";

// Level 1 storm (outpost-ops#292): no empty camera move; a storm camera cue must come with the line that names what it frames.
type Act = Record<string, unknown>;
type Cue = { on: { after?: string; event?: string }; do: Act[] };
const cues = (marsGreenhouse as unknown as { story: { levels: Record<string, { cues: Cue[] }> } }).story.levels["story-L001"]!.cues;

it("every storm camera cue also carries a line", () => {
  const storm = cues.filter((c) => c.on.after === "storm" || c.on.event === "node_revealed" || c.on.event === "hazard_start");
  const cams = storm.filter((c) => c.do.some((a) => "camera" in a));
  expect(cams.length).toBeGreaterThan(0);
  for (const c of cams) expect(c.do.some((a) => "line" in a)).toBe(true);
});
