import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim } from "../src/index.js";
import { forceBuildPad, refreshPads } from "../src/systems/pads.js";

// outpost-ops#132 part 1: the arrivals gate opens level 4, Tam is re-pointed to the galley by the galley pad (no pad of
// his own), and three training pads (cook, runner, clerk) replace feeder + the fourth job.

const L4 = JSON.parse(readFileSync(new URL("../../../levels/story/story-L004.json", import.meta.url), "utf8")) as Record<string, unknown>;

describe("level 4 part 1", () => {
  it("has an arrivals gate, three newcomers' pads and no feeder pad", () => {
    const sim = createSim(L4);
    expect(sim.compiled.gate?.total).toBe(3);
    expect(sim.state.pads.map((p) => p.id)).toEqual(["galley", "cook", "server", "cashier"]);
    expect(sim.state.objectives.map((o) => o.id)).toEqual(["main", "arrive", "galleyBuilt", "train", "auto"]);
    expect(sim.state.residents.filter((r) => r.role === "idle")).toHaveLength(0);
  });
  it("the galley pad appears only once the newcomers are let in", () => {
    const sim = createSim(L4);
    const galley = () => sim.state.pads.find((p) => p.id === "galley")!;
    expect(galley().visible).toBe(false);
    sim.state.objectives.find((o) => o.id === "arrive")!.done = true;
    refreshPads(sim.state, sim.compiled);
    expect(galley().visible).toBe(true);
  });
  it("building the galley re-points Tam (and only Tam) from the kiosk to the galley", () => {
    const sim = createSim(L4);
    const tam = () => sim.state.residents[3]!;
    expect(tam().assign).toMatchObject({ from: "node.food_source", to: "sink.sales_point" });
    forceBuildPad(sim.state, sim.compiled, "galley");
    expect(tam().assign).toMatchObject({ from: "node.food_source", to: "conv.food_processor", node: "field1" });
    expect(sim.state.residents[0]!.assign).toMatchObject({ to: "sink.core" });
  });
  it("is off by default: a pad without repoint leaves workers alone", () => {
    const m = structuredClone(L4) as { entities: Record<string, unknown>[] };
    delete m.entities.find((e) => e["id"] === "galley")!["repoint"];
    const sim = createSim(m);
    forceBuildPad(sim.state, sim.compiled, "galley");
    expect(sim.state.residents[3]!.assign).toMatchObject({ to: "sink.sales_point" });
  });
});
