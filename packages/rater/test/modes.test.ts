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
    // With the graded skillNeeded the floor bot losing this level (and the novice/weak bots nearly) shows up in D, so the three
    // modes now order cleanly: Cadet (floor bot wins) ~0.13, Pilot ~0.70, Captain (+20% swarm, no bot wins) ~0.84.
    it("Cadet rates easier than Pilot, Captain harder; the weakest bot does better on Cadet", () => {
      const [cadet, pilot, captain] = get();
      expect(cadet.D).toBeLessThan(0.3);
      expect(pilot.D).toBeGreaterThan(cadet.D + 0.3);
      expect(captain.D).toBeGreaterThan(pilot.D);
      // S3 (outpost-ops#273): with judgment on every rung the floor bot also wins Pilot, so the gap shows only as margin (re-baselined)
      expect(cadet.winRate["floor"]!).toBeGreaterThanOrEqual(pilot.winRate["floor"]!);
      expect(cadet.margin["floor"]!).toBeGreaterThanOrEqual(pilot.margin["floor"]!);
    });
  }
});
