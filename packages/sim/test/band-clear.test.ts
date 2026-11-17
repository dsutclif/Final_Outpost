import { describe, expect, it } from "vitest";
import { fp, type SimEvent } from "../src/index.js";
import { LEVEL_2, assertIntegerState, at, grant, idle, newSim, walkPath, walkTo } from "./helpers.js";

// outpost-ops#202 (Doug 2026-11-16): a gate rockfall carries a static band out to the map edges; the band pieces name the
// gate rockfall in `clearsWith` and go when it is cleared, so the band never needs its own pad.

type Ent = Record<string, unknown> & { type: string };
/** proto-L002 with its full-width drift cut into a gate piece [x0, x1) and two band pieces that clear with it. */
function banded(x0: number, x1: number, extra: Ent[] = []): unknown {
  const m = structuredClone(LEVEL_2) as { entities: Ent[] };
  const i = m.entities.findIndex((e) => e.id === "drift");
  const [, y, , h] = m.entities[i]!["rect"] as number[];
  m.entities.splice(i, 1,
    { type: "zone.blocked", id: "drift", rect: [x0, y, x1 - x0, h] },
    { type: "zone.blocked", id: "drift_w", rect: [0, y, x0, h], clearsWith: "drift" },
    { type: "zone.blocked", id: "drift_e", rect: [x1, y, 480 - x1, h], clearsWith: "drift" },
    ...extra);
  return m;
}
const has = (ev: SimEvent[], t: SimEvent["t"]) => ev.some((e) => e.t === t);

describe("gate rockfall band (zone.blocked clearsWith)", () => {
  it("the band blocks until the gate rockfall is cleared, then the whole band is gone and the event names it", () => {
    const sim = newSim({}, banded(200, 280, [{ type: "zone.blocked", id: "other", rect: [0, 40, 60, 30] }]));
    expect(sim.state.zones.find((z) => z.id === "drift_w")!.clearsWith).toBe("drift");
    // west of the gate piece the band stops the player as the full drift did
    walkPath(sim, [at(320, 470), at(100, 300)]);
    for (let i = 0; i < 60; i++) sim.step({ dx: 0, dy: -1000 });
    expect(sim.state.player.pos.y).toBeGreaterThan(fp(250));
    grant(sim, { currency: 15 });
    walkPath(sim, [at(320, 470), at(240, 580)], 8);
    idle(sim, 60, (e) => has(e, "core_upgraded"));
    grant(sim, { currency: 15 });
    const ev = [...walkPath(sim, [at(320, 470), at(240, 270)]), ...idle(sim, 60, (e) => has(e, "zone_cleared"))];
    const cl = ev.find((e) => e.t === "zone_cleared") as Extract<SimEvent, { t: "zone_cleared" }>;
    expect(cl.zone).toBe("drift");
    expect([...(cl.also ?? [])].sort()).toEqual(["drift_e", "drift_w"]);
    expect(sim.state.zones.filter((z) => z.cleared).map((z) => z.id).sort()).toEqual(["drift", "drift_e", "drift_w"]);
    // the band's ground is open now (north of it at this x is the level's fence)
    walkTo(sim, at(100, 300), 6);
    walkTo(sim, at(100, 205), 6);
    expect(sim.state.player.pos.y).toBeLessThan(fp(210));
    assertIntegerState(sim.state);
  });

  it("property: for any split of the band, clearing the gate piece clears exactly the zones that name it", () => {
    for (let k = 0; k < 12; k++) {
      const x0 = 20 + ((k * 37) % 180), x1 = x0 + 40 + ((k * 53) % 200);
      const sim = newSim({}, banded(x0, Math.min(460, x1), [{ type: "zone.blocked", id: "other", rect: [0, 40, 60, 30] }]));
      grant(sim, { currency: 15 });
      walkPath(sim, [at(320, 470), at(240, 580)], 8);
      idle(sim, 60, (e) => has(e, "core_upgraded"));
      grant(sim, { currency: 15 });
      walkPath(sim, [at(320, 470), at(240, 270)]);
      idle(sim, 60, (e) => has(e, "zone_cleared"));
      const z = (id: string) => sim.state.zones.find((q) => q.id === id)!.cleared;
      expect([z("drift"), z("drift_w"), z("drift_e"), z("other")]).toEqual([true, true, true, false]);
    }
  });

  it("a clearsWith that names no zone.blocked is rejected", () => {
    const bad = banded(200, 280) as { entities: Ent[] };
    bad.entities.find((e) => e.id === "drift_w")!["clearsWith"] = "nowhere";
    expect(() => newSim({}, bad)).toThrow(/clears with nowhere/);
  });
});
