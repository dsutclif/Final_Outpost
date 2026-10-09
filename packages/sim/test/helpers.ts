import { createSim, type Sim, type SimEvent, type Vec, within, fp } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";

export const LEVEL_1 = level1;

export const newSim = (overrides: Record<string, unknown> = {}): Sim =>
  createSim({ ...level1, ...overrides });

export const at = (x: number, y: number): Vec => ({ x: fp(x), y: fp(y) });

/** Feed direction inputs toward a target until the player is within r units. Returns the events seen. */
export function walkTo(sim: Sim, target: Vec, r: number, maxTicks = 1200): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const p = sim.state.player.pos;
    if (within(p, target, fp(r))) return seen;
    seen.push(...sim.step({ dx: target.x - p.x, dy: target.y - p.y }));
  }
  throw new Error(`did not reach (${target.x},${target.y}) within ${maxTicks} ticks`);
}

/** Stand still for n ticks, or until a predicate on the tick's events is true. */
export function idle(sim: Sim, n: number, until?: (ev: SimEvent[]) => boolean): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const ev = sim.step({ dx: 0, dy: 0 });
    seen.push(...ev);
    if (until?.(ev)) break;
  }
  return seen;
}
