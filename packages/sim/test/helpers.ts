import { createSim, type Sim, type SimEvent, type Vec, within, fp } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level2 from "../../../levels/golden/proto-L002.json";
import level3 from "../../../levels/golden/proto-L003.json";
import level4 from "../../../levels/golden/proto-L004.json";

export const LEVEL_1 = level1;
export const LEVEL_2 = level2;
export const LEVEL_3 = level3;
export const LEVEL_4 = level4;
export const LEVELS = [level1, level2, level3, level4] as const;

export const newSim = (overrides: Record<string, unknown> = {}, level: unknown = level1): Sim =>
  createSim({ ...(level as Record<string, unknown>), ...overrides });

export const at = (x: number, y: number): Vec => ({ x: fp(x), y: fp(y) });

/** Feed direction inputs toward a target until the player is within r units. Returns the events seen. */
export function walkTo(sim: Sim, target: Vec, r: number, maxTicks = 1200): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const p = sim.state.player.pos;
    if (within(p, target, fp(r))) return seen;
    seen.push(...sim.step({ dx: target.x - p.x, dy: target.y - p.y }));
    if (sim.state.over) return seen;
  }
  throw new Error(`did not reach (${target.x},${target.y}) within ${maxTicks} ticks; at (${sim.state.player.pos.x},${sim.state.player.pos.y})`);
}

/** Walk through a list of waypoints in order (each reached within r units). */
export function walkPath(sim: Sim, points: Vec[], r = 6, maxTicks = 1200): SimEvent[] {
  const seen: SimEvent[] = [];
  for (const p of points) seen.push(...walkTo(sim, p, r, maxTicks));
  return seen;
}

/** Stand still for n ticks, or until a predicate on the tick's events is true. */
export function idle(sim: Sim, n: number, until?: (ev: SimEvent[]) => boolean): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const ev = sim.step({ dx: 0, dy: 0 });
    seen.push(...ev);
    if (until?.(ev)) break;
    if (sim.state.over) break;
  }
  return seen;
}

/** Give the player resources or currency directly, for tests that exercise a later stage of a level. */
export function grant(sim: Sim, opts: { currency?: number; items?: string[] }): void {
  const st = sim.state as { currency: number; player: { stack: string[] } };
  if (opts.currency !== undefined) st.currency += opts.currency;
  if (opts.items) st.player.stack.push(...opts.items);
}

/** Every number in the state must be a finite integer; the recursion also rejects functions and class instances. */
export function assertIntegerState(v: unknown, path = "state"): void {
  if (v === null) return;
  const t = typeof v;
  if (t === "number") {
    if (!Number.isInteger(v)) throw new Error(`${path} is not an integer: ${v}`);
    return;
  }
  if (t === "string" || t === "boolean") return;
  if (t !== "object") throw new Error(`${path} has forbidden type ${t}`);
  if (Array.isArray(v)) { v.forEach((x, i) => assertIntegerState(x, `${path}[${i}]`)); return; }
  if (Object.getPrototypeOf(v) !== Object.prototype) throw new Error(`${path} is not a plain object`);
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) assertIntegerState(x, `${path}.${k}`);
}
