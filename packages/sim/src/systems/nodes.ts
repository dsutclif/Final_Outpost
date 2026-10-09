import type { Compiled } from "../compile.js";
import type { State } from "../state.js";

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

/** A resource is producible when some enabled node yields it (converters join this later). */
export function producible(st: State, cp: Compiled, res: string): boolean {
  return st.nodes.some((n) => n.enabled && cp.nodes[n.type]!.yields === res);
}
