import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import type { State, ZoneState } from "../state.js";
import { FP } from "../fixed.js";
import { wallsChanged } from "./wallgrid.js";

/** How far past a rockslide's edge (beyond the walk margin) the commander can still dig it from. */
const REACH = 16 * FP;

type Edge = NonNullable<ZoneState["digEdge"]>;

/** The edge of `z` the player is against: the nearest of the four, or null when out of reach. */
function edgeAgainst(st: State, cp: Compiled, z: ZoneState): Edge | null {
  const p = st.player.pos, r = z.rect, reach = cp.zones.blockMargin + REACH;
  const dxl = r.x - p.x, dxr = p.x - (r.x + r.w), dyt = r.y - p.y, dyb = p.y - (r.y + r.h);
  if (Math.max(dxl, dxr, dyt, dyb) > reach) return null;
  // the player cannot enter the rect, so the largest gap is the side they stand on
  const gaps: [number, Edge][] = [[dxl, "w"], [dxr, "e"], [dyt, "n"], [dyb, "s"]];
  gaps.sort((a, b) => b[0] - a[0]);
  return gaps[0]![1];
}

/**
 * Rockslides dug by hand (zones.digSeconds > 0; off by default, outpost-ops#130): standing against a blocked zone fills a
 * ring over the square at that edge; when it closes the square sinks, then the next, until the zone is gone. No credits.
 * Leaving the rock lets the ring drain; the squares already dug stay dug.
 */
export function stepDig(st: State, cp: Compiled, out: SimEvent[]): void {
  const need = cp.zones.digTicks, sq = cp.zones.digSquare;
  if (need <= 0 || sq <= 0) return;
  for (const z of st.zones) {
    if (z.type !== "zone.blocked" || z.cleared) continue;
    const edge = edgeAgainst(st, cp, z);
    if (edge === null || (z.digEdge !== undefined && z.digEdge !== edge)) {
      if (z.dig) z.dig = Math.max(0, z.dig - 2);
      if (edge !== null && !z.dig) z.digEdge = edge;
      continue;
    }
    z.digEdge = edge;
    z.dig = (z.dig ?? 0) + 1;
    if (z.dig < need) continue;
    z.dig = 0;
    const r = z.rect, horizontal = edge === "w" || edge === "e";
    const extent = horizontal ? r.w : r.h;
    const cut = Math.min(sq, extent);
    const at = edge === "w" ? { x: r.x + cut / 2, y: r.y + r.h / 2 }
      : edge === "e" ? { x: r.x + r.w - cut / 2, y: r.y + r.h / 2 }
      : edge === "n" ? { x: r.x + r.w / 2, y: r.y + cut / 2 }
      : { x: r.x + r.w / 2, y: r.y + r.h - cut / 2 };
    if (extent - cut < sq / 2) {
      z.cleared = true;
      delete z.digEdge;
      wallsChanged(st);
      const also: string[] = [];
      for (const b of st.zones) if (b.type === "zone.blocked" && b.clearsWith === z.id && !b.cleared) { b.cleared = true; also.push(b.id); }
      wallsChanged(st);
      out.push({ t: "zone_dug", zone: z.id, at: { x: Math.round(at.x), y: Math.round(at.y) } });
      out.push({ t: "zone_cleared", zone: z.id, ...(also.length ? { also } : {}) });
      continue;
    }
    if (edge === "w") { r.x += cut; r.w -= cut; }
    else if (edge === "e") r.w -= cut;
    else if (edge === "n") { r.y += cut; r.h -= cut; }
    else r.h -= cut;
    wallsChanged(st);
    out.push({ t: "zone_dug", zone: z.id, at: { x: Math.round(at.x), y: Math.round(at.y) } });
  }
}
