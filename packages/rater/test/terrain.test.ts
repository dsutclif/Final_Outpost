import { Manifest } from "@fo/content";
import { describe, expect, it } from "vitest";
import { terrainStats } from "../src/index.js";
import level4 from "../../../levels/golden/proto-L004.json";

// Geography metric (R3 item 17): reported beside the rating, never z-scored.

const withTerrain = (rects: number[][]) => Manifest.parse({
  ...level4,
  entities: [...level4.entities, ...rects.map((rect, i) => ({ type: "zone.terrain", id: `terrain${i}`, kind: "ridge", rect }))],
});

describe("terrainStats", () => {
  it("is empty without terrain", () => {
    expect(terrainStats(Manifest.parse(level4))).toEqual({ pieces: 0, mapShare: 0, routeBlock: 0 });
  });

  it("measures the map share and the approach lanes a ridge intercepts", () => {
    // L004 is attacked from the north; a ridge across the middle third cuts the lanes that pass through it.
    const s = terrainStats(withTerrain([[140, 100, 200, 20]]));
    expect(s.pieces).toBe(1);
    expect(s.mapShare).toBeCloseTo(4000 / (480 * 900), 6);
    expect(s.routeBlock).toBeGreaterThan(0.2);
    expect(s.routeBlock).toBeLessThan(0.9);
    // a ridge off to the side blocks none
    expect(terrainStats(withTerrain([[10, 700, 30, 30]])).routeBlock).toBe(0);
  });
});
