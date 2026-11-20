import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { rate, type Rating } from "../src/index.js";

// Hand-made Cadet / Captain copies of three shipped levels (made by tools/make-mode-fixtures.ts; outpost-ops#104).
// Pilot is the shipped level. Ratings use the default deterministic bot seeds, so D is reproducible.
// Each rating is its own hook so no single synchronous block runs long enough to starve the vitest worker.
const load = (family: string, mode: string) => JSON.parse(readFileSync(new URL(`./fixtures/modes/${family}-${mode}.json`, import.meta.url), "utf8"));
const MODES = ["cadet", "pilot", "captain"] as const;
const rated: Record<string, Rating> = {};

describe.each(["harvest", "rescue", "defend"])("hand-made difficulty modes: %s", (family) => {
  for (const mode of MODES) beforeAll(() => { rated[`${family}-${mode}`] = rate(load(family, mode), { refSeeds: 4, otherSeeds: 1 }); }, 300_000);
  const get = () => MODES.map((m) => rated[`${family}-${m}`]!) as [Rating, Rating, Rating];

  if (family !== "defend") {
    it("Cadet rates easier than Pilot, Captain harder", () => {
      const [cadet, pilot, captain] = get();
      expect(cadet.D, `cadet ${cadet.D} pilot ${pilot.D}`).toBeLessThan(pilot.D);
      expect(captain.D, `captain ${captain.D} pilot ${pilot.D}`).toBeGreaterThan(pilot.D);
    });
  } else {
    // Pilot's D is already at the rater's floor (about 0.015), so Cadet cannot rate meaningfully lower on D (it lands within
    // noise of Pilot). It is easier by the weakest bot's results. Captain (+20% swarm) is far harder: no bot wins.
    it("Cadet sits at the D floor but the weakest bot does better; Captain is much harder", () => {
      const [cadet, pilot, captain] = get();
      expect(cadet.D).toBeLessThan(0.05);
      expect(pilot.D).toBeLessThan(0.05);
      expect(cadet.winRate["floor"]!).toBeGreaterThan(pilot.winRate["floor"]!);
      expect(cadet.margin["floor"]!).toBeGreaterThan(pilot.margin["floor"]!);
      expect(captain.D).toBeGreaterThan(pilot.D + 0.5);
    });
  }
});
