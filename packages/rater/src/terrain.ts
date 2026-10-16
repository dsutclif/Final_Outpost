import type { Manifest } from "@fo/content";

// Geography metric (R3 item 17): how much ground the level's terrain takes and, on defend maps,
// how many of the attackers' straight approach lines it intercepts. Reported beside the rating,
// not z-scored: it describes the level's shape, and the bot ladder already feels it in margins.

export interface TerrainStats {
  pieces: number;
  /** Share of the map's area covered by terrain, 0..1. */
  mapShare: number;
  /** Share of straight spawn-to-core lanes from the attacked sides that cross terrain, 0..1 (0 without waves). */
  routeBlock: number;
}

const LANES = 9;

type R4 = readonly [number, number, number, number];

function segHits(a: readonly [number, number], b: readonly [number, number], r: R4): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r[0]], [dx, r[0] + r[2] - a[0]], [-dy, a[1] - r[1]], [dy, r[1] + r[3] - a[1]]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

export function terrainStats(m: Manifest): TerrainStats {
  const rects = m.entities.flatMap((e) => (e.type === "zone.terrain" ? [e.rect as R4] : []));
  if (rects.length === 0) return { pieces: 0, mapShare: 0, routeBlock: 0 };
  const mapShare = Math.min(1, rects.reduce((a, r) => a + r[2] * r[3], 0) / (m.map.w * m.map.h));
  const core = m.entities.find((e) => e.type === "sink.core");
  let routeBlock = 0;
  if (core && core.type === "sink.core" && m.waves.length > 0) {
    const sides = new Set<string>();
    for (const w of m.waves) for (const s of Array.isArray(w.side) ? w.side : w.side ? [w.side] : ["n"]) sides.add(s);
    let blocked = 0, total = 0;
    for (const s of sides) {
      for (let k = 0; k < LANES; k++) {
        const f = (k + 0.5) / LANES;
        const from: [number, number] = s === "n" ? [m.map.w * f, 0] : s === "s" ? [m.map.w * f, m.map.h] : s === "w" ? [0, m.map.h * f] : [m.map.w, m.map.h * f];
        total++;
        if (rects.some((r) => segHits(from, core.at, r))) blocked++;
      }
    }
    routeBlock = total === 0 ? 0 : blocked / total;
  }
  return { pieces: rects.length, mapShare, routeBlock };
}
