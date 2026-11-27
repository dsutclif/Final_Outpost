import { expect, it } from "vitest";
import { marsGreenhouse } from "@fo/skins";
import { liveSceneModels } from "../../render-3d/src/scene/livemodels.js";
import { fallFilms } from "../src/storypreload.js";

// outpost-ops#396: Level 5 starts loading the warlord fall's models at level start, so the fall plays with no load hitch.
const levels = (marsGreenhouse as unknown as { story: { levels: Record<string, unknown> } }).story.levels;

it("Level 5 preloads the warlord fall assets", () => {
  expect(fallFilms(levels["story-L005"])).toContain("warlord_fall");
  const ids = liveSceneModels(fallFilms(levels["story-L005"]));
  for (const id of ["hostile.boss_vale", "item.vale_head", "hostile.boss", "item.lieutenant_helmet", "prop.minigun"]) expect(ids.has(id)).toBe(true);
});
it("levels without a fall film preload nothing", () => {
  for (const id of ["story-L001", "story-L002", "story-L003", "story-L004"]) expect(fallFilms(levels[id])).toEqual([]);
});
