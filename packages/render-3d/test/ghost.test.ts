import { LOOK, content, modelScaleFor } from "@fo/content";
import { describe, expect, it } from "vitest";
import { ghostSpec, upgradeLevel } from "../src/ghost.js";

const s = {
  core: { level: 2, pos: { x: 100, y: 200 } },
  structures: [{ id: "tw", type: "struct.ranged_defense", level: 1, pos: { x: 5, y: 6 } }],
  converters: [{ id: "m1", type: "conv.food_processor", level: 1, pos: { x: 7, y: 8 } }],
};
const up = content.upgrades as never;

describe("blueprint level (R5 #31)", () => {
  it("a new build is level 1 at its site", () => {
    expect(ghostSpec({ what: "struct.housing" }, up, s, 3, () => 3)).toEqual({ id: "struct.housing", level: 1, at: "site" });
  });
  it("a turret upgrade shows the target at the level it sets", () => {
    expect(ghostSpec({ what: "struct.ranged_defense.t2", target: "tw" }, up, s, 3, () => 3)).toMatchObject({ id: "struct.ranged_defense", level: 2, at: { x: 5, y: 6 } });
    expect(ghostSpec({ what: "struct.ranged_defense.t3", target: "tw" }, up, s, 3, () => 3)?.level).toBe(3);
    expect(upgradeLevel("struct.ranged_defense.t3", undefined)).toBe(3);
  });
  it("the core pad previews the next core level, none once maxed", () => {
    expect(ghostSpec({ what: "sink.core.level" }, up, s, 3, () => 3)).toMatchObject({ id: "sink.core", level: 3, at: { x: 100, y: 200 } });
    expect(ghostSpec({ what: "sink.core.level" }, up, { ...s, core: { ...s.core, level: 3 } }, 3, () => 3)).toBeNull();
  });
  it("a machine pad previews the next converter level, none once maxed", () => {
    expect(ghostSpec({ what: "conv.level", target: "m1" }, up, s, 3, () => 3)).toMatchObject({ id: "conv.food_processor", level: 2 });
    expect(ghostSpec({ what: "conv.level", target: "m1" }, up, s, 3, () => 1)).toBeNull();
  });
  it("sizes the core ghost with the L2/L3 model scale, not the level 1 one", () => {
    expect(modelScaleFor(LOOK.modelScale, "sink.core", 3)).not.toBe(modelScaleFor(LOOK.modelScale, "sink.core", 1));
  });
});
