import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTENT_VERSION, Manifest } from "@fo/content";
import { ENGINE_VERSION, createSim } from "@fo/sim";
import { PROFILES, playBot } from "../src/index.js";

// Level 2 staging (outpost-ops#127): the lander's escape pod starts dark and untowable until KILN names it after the pair,
// (Rhee's aid station was removed from the story, 2026-11-24).

const here = dirname(fileURLToPath(import.meta.url));
const manifest = (): Manifest => Manifest.parse({
  ...JSON.parse(readFileSync(resolve(here, "../../../levels/story/story-L002.json"), "utf8")),
  engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION,
});

describe("level 2: the lander pod", () => {
  it("starts hidden by the pair objective, so nothing can tow, see a pointer for or count it", () => {
    const m = manifest();
    const sim = createSim(m);
    const pod = sim.state.captures.find((c) => c.decoy)!;
    expect(pod.state).toBe("hidden");
    expect(pod.hiddenUntil).toBe("pair");
    expect(m.objectives!.some((o) => o.id === "pair")).toBe(true);
  });

  it("the bot still brings all five pods home once it is lit", () => {
    const r = playBot(manifest(), PROFILES["good"]!, 1);
    expect(r.won).toBe(true);
  });
});
