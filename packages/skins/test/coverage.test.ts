import { content } from "@fo/content";
import { describe, expect, it } from "vitest";
import { SKINS, canonicalIds, marsGreenhouse } from "../src/index.js";

const ids = canonicalIds(content);

describe("skin coverage", () => {
  it("collects ids from every content registry and the contract", () => {
    for (const reg of ["resources", "nodes", "sinks", "converters", "roles", "customers"] as const) {
      for (const id of Object.keys(content[reg])) expect(ids).toContain(id);
    }
    for (const m of Object.keys(content.modules)) expect(ids).toContain(`module.${m}`);
    for (const id of ["struct.landmark", "capture.recruit_container", "hostile.raider_humanoid", "hostile.creature", "zone.blocked", "zone.waiting"]) {
      expect(ids).toContain(id);
    }
  });

  for (const skin of Object.values(SKINS)) {
    it(`${skin.id} names every canonical id`, () => {
      const missing = ids.filter((id) => !skin.names[id]?.trim());
      expect(missing, `${skin.id} lacks names for: ${missing.join(", ")}`).toEqual([]);
    });

    it(`${skin.id} has a colour for every resource and role`, () => {
      for (const id of Object.keys(content.resources)) expect(skin.palette.res[id], id).toBeTruthy();
      for (const id of [...Object.keys(content.roles), "role.idle"]) expect(skin.palette.role[id], id).toBeTruthy();
    });

    it(`${skin.id} has text for the current hint keys and end reasons`, () => {
      for (const k of ["carry_max", "core_full", "stand_at_register", "not_enough_currency"]) expect(skin.text.hints[k], k).toBeTruthy();
      for (const k of ["goal", "meter.lifeline", "meter.base_health", "timer"]) expect(skin.text.reasons[k], k).toBeTruthy();
      for (const g of Object.keys(content.goals)) expect(skin.text.goals[g], g).toBeTruthy();
    });
  }

  it("mars_greenhouse uses the launch names", () => {
    const n = marsGreenhouse.names;
    expect(marsGreenhouse.lifelineName).toBe("Heat");
    expect(n["res.currency"]).toBe("Credits");
    expect(n["node.food_source"]).toBe("Grow dome");
    expect(n["capture.recruit_container"]).toBe("Stasis pod");
    expect(n["struct.landmark"]).toBe("Habitat hub");
  });

  it("mars_greenhouse has a sprite key for every drawable content id", () => {
    const drawable = [...Object.keys(content.resources), ...Object.keys(content.nodes), ...Object.keys(content.converters), ...Object.keys(content.roles)];
    const missing = drawable.filter((id) => !marsGreenhouse.sprites[id]);
    expect(missing).toEqual([]);
  });

  it("debug labels every id by its canonical id", () => {
    const debug = SKINS["debug"]!;
    for (const id of ids) expect(debug.names[id]).toBe(id);
  });
});
