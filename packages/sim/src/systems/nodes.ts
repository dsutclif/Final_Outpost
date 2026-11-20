import type { Compiled } from "../compile.js";
import type { State } from "../state.js";
import type { SimEvent } from "../events.js";
import { TPS } from "../fixed.js";

/** `@lit:S` is S seconds after the reactor is first lit, `@storm` the first hazard's start; anything else is an objective id. */
function nodeUncovered(st: State, until: string): boolean {
  if (!until.startsWith("@")) return st.objectives.some((o) => o.id === until && o.done);
  if (until === "@storm") return st.hazard.phase === "active" || st.stats.hazardsSurvived > 0;
  const lit = st.stats.litTick;
  return lit !== undefined && st.tick >= lit + Math.round(Number(until.slice(5)) * TPS);
}

/** After the objectives: a buried node whose objective is done is uncovered and gatherable where the manifest put it. */
export function revealNodes(st: State, out: SimEvent[]): void {
  st.nodes.forEach((n, i) => {
    if (n.hiddenUntil === undefined || !nodeUncovered(st, n.hiddenUntil)) return;
    n.enabled = true;
    delete n.hiddenUntil;
    out.push({ t: "node_revealed", node: i, at: { ...n.pos } });
  });
}

/** Finite nodes regrow one item per regrow interval while below their stock. */
export function stepNodes(st: State, cp: Compiled): void {
  for (const n of st.nodes) {
    if (n.stock === null) continue;
    const def = cp.nodes[n.type]!;
    if (def.stock === null || def.regrowTicks === null || n.stock >= def.stock) { n.regrowAcc = 0; continue; }
    n.regrowAcc++;
    if (n.regrowAcc >= def.regrowTicks) { n.regrowAcc = 0; n.stock++; }
  }
}

/** A resource is producible when some enabled node yields it, a placed converter outputs it, or prey or scheduled hostiles drop it. */
export function producible(st: State, cp: Compiled, res: string): boolean {
  if (st.nodes.some((n) => n.enabled && cp.nodes[n.type]!.yields === res)) return true;
  if (st.converters.some((c) => cp.converters[c.type]!.output === res)) return true;
  if (st.preyZones.some((z) => (cp.animals[z.animal]?.drops[res] ?? 0) > 0)) return true;
  if (cp.waves.some((w) => w.types.some((t) => (cp.hostiles[t]?.drops[res] ?? 0) > 0))) return true;
  return false;
}

/**
 * True when the only producible source of a resource is prey or hostile drops: no enabled node
 * yields it and no placed converter makes it. Customers skip such goods while the shelf is empty.
 */
export function dropOnly(st: State, cp: Compiled, res: string): boolean {
  if (st.nodes.some((n) => n.enabled && cp.nodes[n.type]!.yields === res)) return false;
  if (st.converters.some((c) => cp.converters[c.type]!.output === res)) return false;
  return producible(st, cp, res);
}

/**
 * True when a resource's only source is a placed converter that has nothing to give: no enabled
 * node yields it, every converter making it holds no output and is not running. Customers skip
 * such goods while the shelf is empty, so an unfed converter cannot clog the queue (DECISIONS 9f).
 */
export function converterIdle(st: State, cp: Compiled, res: string): boolean {
  if (st.nodes.some((n) => n.enabled && cp.nodes[n.type]!.yields === res)) return false;
  const makers = st.converters.filter((c) => cp.converters[c.type]!.output === res);
  if (makers.length === 0) return false;
  return makers.every((c) => c.out === 0 && c.inQ.length === 0);
}
