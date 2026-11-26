import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { marsGreenhouse } from "../src/index.js";

// Level 1: KILN says it is nearly out of power, then that a storm is coming (outpost-ops#291); the screenplay carries the same words.
type Act = { line?: string };
type Cue = { on: { goal?: string; is?: string }; do: Act[] };
const lvl = (marsGreenhouse as unknown as { story: { levels: Record<string, { cues: Cue[] }> } }).story.levels["story-L001"]!;
const POWER = "Not yet, I'm nearly out of power. Keep the reactor burning till I can recharge my batteries and regain control of ship systems.";

describe("Level 1 KILN power line", () => {
  it.each(["done", "failed"])("fill %s: power line, then the storm line", (is) => {
    const cue = lvl.cues.find((c) => c.on.goal === "fill" && c.on.is === is)!;
    const lines = cue.do.map((a) => a.line).filter(Boolean);
    const i = lines.indexOf(POWER);
    expect(i).toBeGreaterThan(-1);
    expect(lines[i + 1]).toBe("A storm is coming...");
  });
  it("the screenplay carries the same text", () => {
    const sp = readFileSync(new URL("../../../docs/STORY-SCREENPLAY.md", import.meta.url), "utf8");
    expect(sp).toContain(`**KILN:** ${POWER}`);
    expect(sp).toContain("**KILN:** A storm is coming...");
  });
});
