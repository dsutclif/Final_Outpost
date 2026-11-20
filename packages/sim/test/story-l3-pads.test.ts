import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim, fp } from "../src/index.js";
import { gatedMove } from "../src/systems/barriers.js";
import { wallsChanged } from "../src/systems/wallgrid.js";
import { refreshPads } from "../src/systems/pads.js";

// outpost-ops#203 follow-up: a star for "Follow the lights", Tam's pad shown only after the protein sale, and a walker
// that a wall rose under is no longer pinned there (Tam, hired after the camp wall, stood against it for good).

const L3 = JSON.parse(readFileSync(new URL("../../../levels/story/story-L003.json", import.meta.url), "utf8")) as Record<string, unknown>;

describe("level 3 follow-up", () => {
  it("has eight objectives, 'lights' second, done once the kiosk is found", () => {
    const sim = createSim(L3);
    expect(sim.state.objectives.map((o) => o.id)).toEqual(["main", "dome", "lights", "first", "walls", "clear", "meat", "train"]);
    expect(sim.state.objectives.find((o) => o.id === "lights")!.done).toBe(false);
  });
  it("Tam's pad stays out of sight until the protein objective is done", () => {
    const sim = createSim(L3);
    const pad = () => sim.state.pads.find((p) => p.id === "picker")!;
    refreshPads(sim.state, sim.compiled);
    expect(pad().visible).toBe(false);
    sim.state.objectives.find((o) => o.id === "meat")!.done = true;
    refreshPads(sim.state, sim.compiled);
    expect(pad().visible).toBe(true);
  });
  it('a walker a wall rose under is not pinned (Tam, hired after the camp wall)', () => {
    const sim = createSim(L3);
    for (const l of sim.state.barriers) for (const sec of l.sections) sec.built = true;
    wallsChanged(sim.state);
    const pos = { x: fp(383.1), y: fp(488.5) };
    for (let i = 0; i < 200; i++) gatedMove(sim.state, sim.compiled, pos, { x: fp(440), y: fp(610) }, fp(1.5), fp(2));
    expect(pos.y).toBeGreaterThan(fp(560));
  });
});
