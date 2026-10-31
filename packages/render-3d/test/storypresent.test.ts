import { marsGreenhouse as skin } from "@fo/skins";
import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { deriveTokens } from "../src/tokens.js";
import { createCoreSpirit } from "../src/scene/corespirit.js";
import { StoryLights, storyLightColors } from "../src/scene/storylights.js";
import { StoryPresent } from "../src/scene/storypresent.js";

const make = () => {
  const t = deriveTokens(skin), sc = new Scene();
  const lights = new StoryLights(sc, storyLightColors(t), null);
  const spirit = createCoreSpirit(sc, t, { at: { x: 0, y: 0, z: 0 } });
  return { sp: new StoryPresent(lights, spirit), spirit };
};

describe("story presentation", () => {
  it("lets only the two lowest ranks pulse", () => {
    const { sp } = make();
    sp.light("goal", 0, 5, 0, "goal", 3);
    sp.pod("p", 10, 10, "old", 1);
    sp.dots([{ x: 1, z: 1 }]);
    sp.light("lamp", 0, 5, 0, "lamp", 1);
    sp.frame(1, 0.016, 0, 0, 300, 300);
    expect([...sp.allowed].filter((r) => r <= 4).sort()).toEqual([1, 2]);
    sp.removeLight("goal");
    sp.frame(2, 0.016, 0, 0, 300, 300);
    expect(sp.allowed.has(3)).toBe(true);
    expect(sp.allowed.has(4)).toBe(false);
  });
  it("eases lighting, runs a camera beat and stays off by default", () => {
    const { sp, spirit } = make();
    expect(sp.lightingNow).toBeNull();
    expect(spirit.group.visible).toBe(false);
    sp.lighting(1);
    sp.frame(0, 0.5, 0, 0, 300, 300);
    expect(sp.lightingNow).toBeGreaterThan(0);
    expect(sp.lightingNow).toBeLessThan(1);
    sp.lighting(0.4, true);
    sp.frame(0.1, 0.1, 0, 0, 300, 300);
    expect(sp.lightingNow).toBeCloseTo(0.4);
    sp.beat({ at: { x: 5, y: 6 }, seconds: 1 });
    expect(sp.activeBeat(0.5)?.at.x).toBe(5);
    expect(sp.activeBeat(2)).toBeNull();
  });
});
