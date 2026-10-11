import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION, createSim, type SimEvent } from "@fo/sim";
import { marsGreenhouse } from "@fo/skins";
import { describe, expect, it } from "vitest";
import level1 from "../../../levels/golden/proto-L001.json";
import { isNew, labelled, nearbyPassive, touchedBy } from "../src/discovery.js";
import { objectiveLines } from "../src/hud.js";
import { TAP_MS, TAP_PX, isTap } from "../src/input.js";

const manifest = { ...level1, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION };
const at = { x: 0, y: 0 };

describe("discovery", () => {
  it("labels world objects, not resources, modules or workers", () => {
    for (const id of ["node.material_source", "sink.core", "sink.sales_point.register", "conv.food_processor", "pad.hire", "struct.housing", "capture.recruit_container", "hostile.creature", "unit.prey", "zone.blocked"]) expect(labelled(id), id).toBe(true);
    for (const id of ["res.currency", "role.supplier", "module.carry", "unit.player", "zone.prey"]) expect(labelled(id), id).toBe(false);
  });

  it("maps the player's own interactions to the types they touch; workers never count", () => {
    const st = createSim(manifest).state;
    const node = st.nodes.findIndex((n) => n.type === "node.material_source");
    expect(touchedBy({ t: "gathered", res: "res.material_basic", node, at }, st)).toEqual(["node.material_source"]);
    expect(touchedBy({ t: "gathered", res: "res.material_basic", node, at, by: 3 }, st)).toEqual([]);
    expect(touchedBy({ t: "deposited", res: "res.material_basic", to: "sink.core", at }, st)).toEqual(["sink.core"]);
    expect(touchedBy({ t: "deposited", res: "res.material_basic", to: "sink.core", at, by: 1 }, st)).toEqual([]);
    const pad = st.pads[0]!;
    expect(touchedBy({ t: "pad_paid", pad: pad.id, res: "res.currency", n: 1 }, st)).toEqual([pad.type]);
    expect(touchedBy({ t: "hired", pad: pad.id, resident: 1, role: "role.supplier" }, st)).toEqual([pad.type, "role.supplier"]);
    expect(touchedBy({ t: "built", pad: pad.id, build: "struct.landmark", at }, st)).toEqual([pad.type, "struct.landmark"]);
    expect(touchedBy({ t: "collected", res: "res.currency", n: 3, at }, st)).toEqual(["sink.sales_point.pile"]);
    // a sale rings up at the clerk pad: the player's while no clerk is on duty
    expect(touchedBy({ t: "sold", res: "res.food_raw_1", n: 1, pay: 2, premium: false, at } as SimEvent, st)).toContain("sink.sales_point.register");
    expect(touchedBy({ t: "hit", target: "prey", id: 1, at, by: "player" }, st)).toEqual(["unit.prey"]);
    expect(touchedBy({ t: "hit", target: "prey", id: 1, at, by: "resident" }, st)).toEqual([]);
    expect(touchedBy({ t: "wave_started", idx: 0 }, st)).toEqual([]);
  });

  it("finds passive structures near the hero and tracks what is still new", () => {
    const st = createSim(manifest).state;
    st.structures.push({ id: "h1", type: "struct.housing", pos: { ...st.player.pos }, level: 1, acc: 0 } as (typeof st.structures)[number]);
    expect(nearbyPassive(st)).toContain("struct.housing");
    const fresh = isNew({ "sink.core": true });
    expect(fresh("sink.core")).toBe(false);
    expect(fresh("node.food_source")).toBe(true);
    expect(fresh("res.currency")).toBe(false);
  });

  it("every labelled Mars type has a one-line purpose", () => {
    for (const id of Object.keys(marsGreenhouse.names).filter(labelled)) {
      const p = marsGreenhouse.purposes?.[id];
      expect(p, id).toBeTruthy();
      expect(p!.length, id).toBeLessThanOrEqual(52);
    }
  });
});

describe("tap to inspect", () => {
  it("is a short press that barely moves; anything else is the joystick", () => {
    expect(isTap(0, 80)).toBe(true);
    expect(isTap(TAP_PX - 0.5, TAP_MS - 1)).toBe(true);
    expect(isTap(TAP_PX, 80)).toBe(false);
    expect(isTap(2, TAP_MS)).toBe(false);
  });
});

describe("objective strip", () => {
  it("shows nothing until the sim reports objectives, then labels and counters", () => {
    const m = createSim(manifest).compiled.manifest;
    expect(objectiveLines(undefined, m, marsGreenhouse)).toEqual([]);
    const withLabels = { ...m, objectives: [{ id: "a", kind: "serve_premium", label: "VIPs" }] } as typeof m;
    const lines = objectiveLines([{ id: "a", kind: "serve_premium", progress: 2, target: 5, done: false, failed: false }], withLabels, marsGreenhouse);
    expect(lines).toEqual([{ id: "a", text: "VIPs 2/5", done: false, failed: false }]);
  });
});
