import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim, fp, type SimEvent } from "../src/index.js";
import { at, idle, walkTo } from "./helpers.js";

// outpost-ops#130 / #203: a rockslide is dug by hand when the level opts in (zones.digSeconds > 0): standing against
// it clears a square at a time, no credits; with the default (0) nothing changes.

const L3Locked = JSON.parse(readFileSync(new URL("../../../levels/story/story-L003.json", import.meta.url), "utf8")) as { entities: { id: string; digAfter?: unknown }[] } & Record<string, unknown>;
// the dig mechanics below run on level 3 with its story lock (digAfter) taken off
const L3 = { ...L3Locked, entities: L3Locked.entities.map((e) => { if (e.id !== "rockslide") return e; const { digAfter: _lock, ...rest } = e; return rest; }) } as Record<string, unknown>;
const withParams = (p: Record<string, number>): Record<string, unknown> => ({ ...L3, params: { ...(L3["params"] as object), ...p } });
const rockOf = (sim: ReturnType<typeof createSim>) => sim.state.zones.find((z) => z.id === "rockslide")!;

describe("dug rockslides (opt-in)", () => {
  it("story level 3's rockslide stays locked until the cue's sale has happened (digAfter)", () => {
    const sim = createSim(L3Locked);
    expect(rockOf(sim).digLock).toBeDefined();
    walkTo(sim, at(660, 610), 3);
    for (let i = 0; i < 200; i++) sim.step({ dx: fp(1), dy: 0 });
    expect(rockOf(sim).dig ?? 0).toBe(0);
    expect(rockOf(sim).rect.w).toBe(fp(32));
  });

  it("digs a square at a time from the side the commander stands on, then opens the way", () => {
    const sim = createSim(L3);
    expect(sim.compiled.zones.digTicks).toBe(60);
    const r0 = { ...rockOf(sim).rect };
    // the west edge: x 686, y 584-636, 32 wide, 16-unit squares
    walkTo(sim, at(660, 610), 3);
    for (let i = 0; i < 40; i++) sim.step({ dx: fp(1), dy: 0 });
    expect(sim.state.player.pos.x).toBeLessThan(r0.x);
    const seen: SimEvent[] = [];
    for (let i = 0; i < 70; i++) seen.push(...sim.step({ dx: fp(1), dy: 0 }));
    expect(seen.filter((e) => e.t === "zone_dug").length).toBe(1);
    expect(rockOf(sim).rect.x).toBe(r0.x + fp(16));
    expect(rockOf(sim).rect.w).toBe(r0.w - fp(16));
    expect(rockOf(sim).cleared).toBe(false);
    for (let i = 0; i < 70; i++) seen.push(...sim.step({ dx: fp(1), dy: 0 }));
    expect(rockOf(sim).cleared).toBe(true);
    expect(seen.filter((e) => e.t === "zone_cleared").length).toBe(1);
    expect(sim.state.currency).toBe(0);
    expect(sim.state.stats.zonesCleared).toBe(1);
  });

  it("the ring drains when the commander walks away, and finishes only with time spent against the rock", () => {
    const sim = createSim(L3);
    walkTo(sim, at(660, 610), 3);
    for (let i = 0; i < 40; i++) sim.step({ dx: fp(1), dy: 0 });
    idle(sim, 0);
    for (let i = 0; i < 30; i++) sim.step({ dx: fp(1), dy: 0 });
    expect(rockOf(sim).dig).toBeGreaterThan(0);
    walkTo(sim, at(600, 610), 3);
    idle(sim, 40);
    expect(rockOf(sim).dig ?? 0).toBe(0);
    expect(rockOf(sim).cleared).toBe(false);
  });

  it("is off by default: a level without the param never digs", () => {
    const params = { ...(L3["params"] as Record<string, number>) };
    delete params["zones.digSeconds"];
    const sim = createSim({ ...L3, params });
    expect(sim.compiled.zones.digTicks).toBe(0);
    walkTo(sim, at(660, 610), 3);
    for (let i = 0; i < 300; i++) sim.step({ dx: fp(1), dy: 0 });
    expect(rockOf(sim).cleared).toBe(false);
    expect(rockOf(sim).dig).toBeUndefined();
  });
});
