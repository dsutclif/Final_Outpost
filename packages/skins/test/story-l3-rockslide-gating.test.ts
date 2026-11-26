import { describe, expect, it } from "vitest";
import { marsGreenhouse } from "../src/index.js";

// Level 3 (outpost-ops#303): nothing about the rockslide (arrows, KILN lines, camera) before the protein tip that starts the hoppers.
type Act = Record<string, unknown>;
type Cue = { id?: string; on: Record<string, unknown>; do: Act[] };
type Rule = { when: Record<string, unknown>[]; to?: { entity?: string } };
const l3 = (marsGreenhouse as unknown as { story: { levels: Record<string, { cues: Cue[]; guideRules: Rule[] }> } }).story.levels["story-L003"]!;
const mentionsSlide = (a: Act) => JSON.stringify(a).toLowerCase().includes("rockslide") || /slide/i.test(String(a["line"] ?? ""));

describe("Level 3 rockslide text and arrows wait for the hoppers", () => {
  it("every guide rule to the rockslide needs the protein tip to have fired", () => {
    const rules = l3.guideRules.filter((r) => r.to?.entity === "rockslide");
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r.when.some((w) => w["fired"] === "proteinTip")).toBe(true);
  });
  it("the cues before the protein tip never mention the rockslide", () => {
    const early = l3.cues.slice(0, l3.cues.findIndex((c) => c.id === "proteinTip"));
    expect(early.length).toBeGreaterThan(2);
    for (const c of early) expect(c.do.filter(mentionsSlide), JSON.stringify(c.on)).toEqual([]);
  });
});
