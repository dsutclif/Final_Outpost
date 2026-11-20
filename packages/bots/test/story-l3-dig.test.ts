import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTENT_VERSION, Manifest } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";
import { PROFILES, playBot } from "../src/index.js";

// outpost-ops#203 (dig rule of #130): Level 3's rockslide is dug by hand, not bought, and the bots dig it.

const here = dirname(fileURLToPath(import.meta.url));
const manifest = (): Manifest => Manifest.parse({
  ...JSON.parse(readFileSync(resolve(here, "../../../levels/story/story-L003.json"), "utf8")),
  engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION,
});

describe("level 3: the rockslide is dug", () => {
  it("has no pad that clears it; the level opts in to digging", () => {
    const m = manifest();
    expect(m.entities.some((e) => e.type === "pad.build" && e.build === "zone.clear")).toBe(false);
    expect(m.params["zones.digSeconds"]).toBeGreaterThan(0);
  });
  it("the good bot digs it for the star and still wins", () => {
    const r = playBot(manifest(), PROFILES["good"]!, 1);
    expect(r.won).toBe(true);
    expect(r.objectives.find((o) => o.kind === "clear_zones")?.done).toBe(true);
    
  });
});
