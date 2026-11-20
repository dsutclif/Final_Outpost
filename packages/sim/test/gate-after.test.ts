import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim, type SimEvent } from "../src/index.js";

// outpost-ops#133 part 2: a gate's arrivals can wait for an objective (arrivals.after) and for a lull with no hostile
// alive; without `after` the timer runs from the start as before.

const L5 = JSON.parse(readFileSync(new URL("../../../levels/story/story-L005.json", import.meta.url), "utf8")) as { entities: { type: string; arrivals?: { after?: string } }[] };

function run(manifest: unknown, ticks: number, before?: (sim: ReturnType<typeof createSim>) => void): { seen: SimEvent[]; sim: ReturnType<typeof createSim> } {
  const sim = createSim(manifest);
  before?.(sim);
  const seen: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) seen.push(...sim.step({ dx: 0, dy: 0 }));
  return { seen, sim };
}

describe("gate arrivals after an objective", () => {
  it("level 5's settlers wait for the turret", () => {
    expect(L5.entities.find((e) => e.type === "struct.gate")?.arrivals?.after).toBe("turret");
    const { seen, sim } = run(L5, 420);
    expect(seen.some((e) => e.t === "gate_arrival")).toBe(false);
    expect(sim.state.gateQueue.length).toBe(0);
    expect(sim.state.timers.gateLeft).toBe(2);
  });

  it("they appear once the turret is done and no hostile is alive", () => {
    const { seen, sim } = run(L5, 200, (s) => { s.state.objectives.find((o) => o.id === "turret")!.done = true; });
    expect(seen.filter((e) => e.t === "gate_arrival").length).toBeGreaterThanOrEqual(1);
    expect(sim.state.gateQueue.length).toBeGreaterThanOrEqual(1);
  });

  it("without `after` the timer runs as before", () => {
    const m = JSON.parse(JSON.stringify(L5)) as typeof L5;
    delete m.entities.find((e) => e.type === "struct.gate")!.arrivals!.after;
    const { sim } = run(m, 200);
    expect(sim.state.gateQueue.length).toBeGreaterThanOrEqual(1);
  });
});
