import { marsGreenhouse as skin } from "@fo/skins";
import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { deriveTokens } from "../src/tokens.js";
import { nightFloor, StoryLights, storyLightColors, storyLighting } from "../src/scene/storylights.js";

describe("story lights", () => {
  const t = deriveTokens(skin);
  it("builds and updates without a canvas or document", () => {
    const sc = new Scene();
    const l = new StoryLights(sc, storyLightColors(t), null);
    l.groundDots([{ x: 0, z: 0 }, { x: 40, z: 0 }], 1.2);
    l.pod("a", 10, 10, "old", 0.5);
    l.ridgePulse("right", 1, 0, 0, 300, 200);
    l.light("w", 0, 10, 0, "lamp", 2);
    l.flashLight("w", 0);
    l.update(0.6);
    l.tally(0, 30, 0, ["done", "empty", "missed"]);
    l.setProgress(2);
    expect(l.lightingProgress).toBe(1);
    l.pod("a", 0, 0, "old", -1);
    l.dispose();
    expect(sc.children.length).toBe(0);
  });
  it("keeps the night floor and reaches full day", () => {
    const f = nightFloor(skin);
    expect(f.ambient).toBeGreaterThan(0.1);
    expect(storyLighting(skin, t, 0).ambient).toBeGreaterThanOrEqual(f.ambient);
    expect(storyLighting(skin, t, 1).ambient).toBeCloseTo(1);
    expect(storyLighting(skin, t, 1).sky).toBe(t.sky);
  });
});
