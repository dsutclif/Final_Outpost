import { marsGreenhouse } from "@fo/skins";
import { describe, expect, it } from "vitest";
import { Scene } from "three";
import type { GLLike } from "../src/renderer.js";
import { createCoreSpirit, createSpiritPortrait } from "../src/scene/corespirit.js";
import { deriveTokens } from "../src/tokens.js";

const colors = deriveTokens(marsGreenhouse);

describe("core spirit cloud", () => {
  it("is hidden until bloomed, then follows its state, and disposes", () => {
    const scene = new Scene();
    const s = createCoreSpirit(scene, colors, { at: { x: 1, y: 0, z: 2 } });
    s.update(0);
    expect(s.group.visible).toBe(false);
    s.bloom(); s.setStrength(0.8);
    s.update(0.1); s.update(1);
    expect(s.group.visible).toBe(true);
    s.setState("pulse"); s.update(1.1);
    s.setState("fading");
    for (let t = 1.2; t < 4; t += 0.1) s.update(t);
    expect(s.group.visible).toBe(false);
    s.dispose();
    expect(scene.children.length).toBe(0);
  });
  it("renders a portrait through an injected GL", () => {
    let renders = 0;
    const gl = { domElement: {} as HTMLCanvasElement, setPixelRatio() {}, setSize() {}, render() { renders++; }, dispose() {} } as unknown as GLLike;
    const p = createSpiritPortrait(colors, () => gl, gl.domElement);
    p.update(0.5);
    expect(renders).toBe(1);
    p.dispose();
  });
});
