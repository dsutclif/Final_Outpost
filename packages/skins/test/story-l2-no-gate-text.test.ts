import { expect, it } from "vitest";
import { marsGreenhouse } from "../src/index.js";

// Level 2 has no gate (outpost-ops#300): the guide and coach lines that point the player through the wall say "opening", never "gate".
const text = (marsGreenhouse as unknown as { text: { guide: Record<string, string>; coach: Record<string, string> } }).text;

it("the through-the-wall guide and coach lines never say gate", () => {
  for (const s of [text.guide["gate"], text.guide["gateIn"], text.coach["leave_gate"]]) {
    expect(s).toBeTruthy();
    expect(s!.toLowerCase()).not.toContain("gate");
  }
});
