import type { Rand } from "./rand.js";
import type { Placer, Pt, Rect } from "./layout.js";

// Geography (R3 item 17): ridges, rock outcrops and chasms the generator drops on some levels after
// every station is placed. Terrain is impassable for everyone (the sim treats it like uncleared
// rubble that nothing clears), so a piece may never sit on a station, a pad's building, a standing
// spot, a wall, the customers' lane to the stall, or between two places residents walk between
// (they slide along obstacles, they do not path). A flood fill then confirms every station and
// spot is still reachable from the start. Every number is data (generator.json "terrain").

export interface TerrainData {
  /** Share of levels that get terrain, by family (`default` for any other). */
  chance: Record<string, number>;
  skipFamilies: string[];
  /** [min, max] pieces per level, by `default` or `defend`. */
  pieces: Record<string, [number, number]>;
  kinds: Record<string, { weight: number; long: [number, number]; short: [number, number] }>;
  stationGap: number;
  coreGap: number;
  edgeGap: number;
  wallGap: number;
  pathGap: number;
  pieceGap: number;
  /** Largest share of the map all pieces together may cover. */
  maxShare: number;
  tries: number;
  /** Flood-fill cell and the clearance a walker needs around terrain, world units. */
  cell: number;
  walker: number;
  /** Narrowest band outside a defend ring worth putting terrain in. */
  minBand: number;
}

export interface TerrainPiece { id: string; kind: string; rect: Rect }

const MAP_W = 480, MAP_H = 900;

const rectDist = (p: Pt, r: Rect): number => {
  const dx = Math.max(r[0] - p[0], 0, p[0] - (r[0] + r[2]));
  const dy = Math.max(r[1] - p[1], 0, p[1] - (r[1] + r[3]));
  return Math.hypot(dx, dy);
};
const inflate = (r: Rect, m: number): Rect => [r[0] - m, r[1] - m, r[2] + 2 * m, r[3] + 2 * m];
const rectsTouch = (a: Rect, b: Rect): boolean => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** Does the segment ab pass through rect r (Liang-Barsky)? */
export function segHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r[0]], [dx, r[0] + r[2] - a[0]], [-dy, a[1] - r[1]], [dy, r[1] + r[3] - a[1]]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

export interface TerrainCtx {
  rand: Rand;
  P: Placer;
  T: TerrainData;
  /** Families of the level (primary and secondary). */
  families: readonly string[];
  defend: boolean;
  core: Pt;
  start: Pt;
  /** Defend: the ring's rect and the sides hostiles come from. */
  ring: Rect | null;
  attackSides: readonly ("n" | "e" | "s" | "w")[];
  /** Places residents walk between: nodes, machines, structures (the core and start are added). */
  walkPoints: readonly Pt[];
  /** The stall's queue slots and which map edge customers arrive from; null when there is no stall. */
  shop: { queue: readonly Pt[]; edgeRight: boolean } | null;
}

export function placeTerrain(x: TerrainCtx): TerrainPiece[] {
  const { T, rand, P } = x;
  if (x.families.some((f) => T.skipFamilies.includes(f))) return [];
  const fam = x.defend ? "defend" : x.families[0] ?? "default";
  if (!rand.chance(T.chance[fam] ?? T.chance["default"] ?? 0)) return [];
  const [pmin, pmax] = T.pieces[x.defend ? "defend" : "default"] ?? T.pieces["default"]!;
  const want = rand.int(pmin, pmax);

  // Regions to draw from: the whole playfield, or on defend the bands outside the ring on the attacked sides.
  const field: Rect = [T.edgeGap, T.edgeGap + 20, MAP_W - 2 * T.edgeGap, MAP_H - 2 * T.edgeGap - 40];
  let regions: Rect[] = [field];
  if (x.defend && x.ring) {
    const r = x.ring, m = T.edgeGap, g = T.wallGap;
    const bands: Record<string, Rect> = {
      n: [m, m + 20, MAP_W - 2 * m, r[1] - g - m - 20], s: [m, r[1] + r[3] + g, MAP_W - 2 * m, MAP_H - m - 20 - (r[1] + r[3] + g)],
      w: [m, m, r[0] - g - m, MAP_H - 2 * m], e: [r[0] + r[2] + g, m, MAP_W - m - (r[0] + r[2] + g), MAP_H - 2 * m],
    };
    regions = x.attackSides.map((s) => bands[s]!).filter((b) => Math.min(b[2], b[3]) >= T.minBand);
    if (regions.length === 0) return [];
  }

  const kinds = Object.entries(T.kinds);
  const totalW = kinds.reduce((a, [, k]) => a + k.weight, 0);
  const pickKind = (): [string, (typeof kinds)[number][1]] => {
    let r = rand.float() * totalW;
    for (const [id, k] of kinds) { r -= k.weight; if (r < 0) return [id, k]; }
    return kinds[0]!;
  };

  const placed: TerrainPiece[] = [];
  const walk: Pt[] = [x.core, x.start, ...x.walkPoints];
  const keep = (rect: Rect): boolean => {
    if (rect[0] < T.edgeGap || rect[1] < T.edgeGap || rect[0] + rect[2] > MAP_W - T.edgeGap || rect[1] + rect[3] > MAP_H - T.edgeGap) return false;
    if (rectDist(x.core, rect) < T.coreGap) return false;
    for (const s of P.stations) {
      if (rectDist([s.x, s.y], rect) < s.r + T.stationGap) return false;
      if (s.fp && rectsTouch(inflate(rect, T.stationGap / 2), [s.fp[0], s.fp[1], s.fp[2] - s.fp[0], s.fp[3] - s.fp[1]])) return false;
    }
    for (const sp of P.spots) if (rectDist([sp.x, sp.y], rect) < sp.r + T.stationGap) return false;
    for (const w of P.walls) if (segHitsRect(w[0], w[1], inflate(rect, T.wallGap))) return false;
    for (const q of placed) if (rectsTouch(inflate(rect, T.pieceGap), q.rect)) return false;
    const fat = inflate(rect, T.pathGap);
    for (let i = 0; i < walk.length; i++) for (let j = i + 1; j < walk.length; j++) if (segHitsRect(walk[i]!, walk[j]!, fat)) return false;
    if (x.shop) {
      // Customers walk a straight line from the map edge to each queue slot.
      const ex = x.shop.edgeRight ? MAP_W + 20 : -20;
      for (const q of x.shop.queue) if (segHitsRect([ex, q[1]], q, inflate(rect, 14))) return false;
    }
    return true;
  };

  // Flood fill on a coarse grid: every station and spot must stay reachable from the start.
  const reachable = (all: readonly Rect[]): boolean => {
    const C = T.cell, W = Math.ceil(MAP_W / C), H = Math.ceil(MAP_H / C);
    const blocked = new Uint8Array(W * H);
    for (const r of all) {
      const f = inflate(r, T.walker);
      for (let j = Math.max(0, Math.floor(f[1] / C)); j <= Math.min(H - 1, Math.floor((f[1] + f[3]) / C)); j++) {
        for (let i = Math.max(0, Math.floor(f[0] / C)); i <= Math.min(W - 1, Math.floor((f[0] + f[2]) / C)); i++) blocked[j * W + i] = 1;
      }
    }
    const cellOf = (p: Pt) => Math.min(H - 1, Math.max(0, Math.floor(p[1] / C))) * W + Math.min(W - 1, Math.max(0, Math.floor(p[0] / C)));
    const seen = new Uint8Array(W * H);
    const q: number[] = [cellOf(x.start)];
    seen[q[0]!] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h]!, ci = c % W, cj = Math.floor(c / W);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (blocked[n] || seen[n]) continue;
        seen[n] = 1;
        q.push(n);
      }
    }
    const pts: Pt[] = [x.core, ...P.stations.map((s): Pt => [s.x, s.y]), ...P.spots.map((s): Pt => [s.x, s.y])];
    return pts.every((p) => seen[cellOf(p)] === 1);
  };

  let area = 0;
  for (let k = 0; k < want; k++) {
    for (let t = 0; t < T.tries; t++) {
      const [kind, def] = pickKind();
      const long = Math.round(rand.range(def.long[0], def.long[1])), short = Math.round(rand.range(def.short[0], def.short[1]));
      const horiz = rand.chance(0.5);
      const w = horiz ? long : short, h = horiz ? short : long;
      const rg = regions[rand.int(0, regions.length - 1)]!;
      if (rg[2] < w || rg[3] < h) continue;
      const rect: Rect = [Math.round(rg[0] + rand.float() * (rg[2] - w)), Math.round(rg[1] + rand.float() * (rg[3] - h)), w, h];
      if (area + w * h > T.maxShare * MAP_W * MAP_H || !keep(rect)) continue;
      if (!reachable([...placed.map((p) => p.rect), rect])) continue;
      placed.push({ id: `terrain${placed.length}`, kind, rect });
      area += w * h;
      break;
    }
  }
  return placed;
}
