import { marsGreenhouse as skin } from "@fo/skins";
import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { deriveTokens } from "../src/tokens.js";
import { createCoreSpirit } from "../src/scene/corespirit.js";
import { StoryLights, storyLightColors } from "../src/scene/storylights.js";
import { StoryPresent } from "../src/scene/storypresent.js";
import { FACE_TOLERANCE, angleDiff, turnToward, yawTo } from "../src/facing.js";

const make = () => {
  const t = deriveTokens(skin), sc = new Scene();
  const lights = new StoryLights(sc, storyLightColors(t), null);
  const spirit = createCoreSpirit(sc, t, { at: { x: 0, y: 0, z: 0 } });
  return { sp: new StoryPresent(lights, spirit), spirit, sc };
};

describe("conversation facing", () => {
  it("turns both speakers toward each other, smoothly, and only while the pair is set", () => {
    const { sp } = make();
    expect(sp.faceFor("player")).toBeNull();
    sp.converse({ a: { key: "player", x: 0, z: 0 }, b: { key: "r:3", x: 10, z: 0 } });
    expect(sp.faceFor("player")).toEqual({ x: 10, z: 0 });
    expect(sp.faceFor("r:3")).toEqual({ x: 0, z: 0 });
    expect(sp.faceFor("r:4")).toBeNull();
    sp.converse(null);
    expect(sp.faceFor("r:3")).toBeNull();
    // the turn: from facing away it closes on the target by the shortest way in about 0.3 s, never overshooting
    let yaw = 0;
    const want = yawTo({ x: 0, y: 0 }, { x: -10, y: 1 });
    for (let i = 0; i < 18; i++) { const next = turnToward(yaw, want, 1 / 60); expect(Math.abs(angleDiff(next, want))).toBeLessThanOrEqual(Math.abs(angleDiff(yaw, want))); yaw = next; }
    expect(Math.abs(angleDiff(yaw, want))).toBeLessThan(FACE_TOLERANCE / 3);
  });
});

describe("story presentation", () => {
  it("keeps the tow tally over the drawn hero between sim ticks (outpost-ops#186)", () => {
    const { sp, sc } = make();
    sp.tally(10, 5, 20, ["done", "empty", "empty"]);
    let tally: { position: { x: number; y: number; z: number }; visible: boolean } | undefined;
    sc.traverse((o) => { if (!tally && o.children.length === 3 && o.position.x === 10 && o.position.z === 20) tally = o; });
    expect(tally).toBeDefined();
    sp.frame(1, 0.016, 0, 0, 300, 300, { x: 10.4, z: 20.2 });
    expect([tally!.position.x, tally!.position.y, tally!.position.z]).toEqual([10.4, 5, 20.2]);
    // hidden: it stays where it was
    sp.tally(0, 0, 0, null);
    sp.frame(2, 0.016, 0, 0, 300, 300, { x: 50, z: 50 });
    expect(tally!.position.x).toBe(10.4);
  });
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
