import { segDist, type Box, type Pt } from "./layout.js";

// Traders' walk from the map edge to the back of the line: a grid search around every building's
// footprint, blocked ground and the walls (whose only openings are the gates' doors), then
// shortened by line of sight. Waypoints run edge first, so the sim walks them in and back out.

export interface RouteWorld {
  w: number;
  h: number;
  /** Ground no trader walks through: building footprints and blocked rects. */
  solid: readonly Box[];
  walls: readonly { a: Pt; b: Pt; gate: boolean }[];
  /** Clearance from footprints and walls; half the door opening each side of a gate's midpoint. */
  clear: number;
  door: number;
  cell: number;
}

export function traderRoute(W: RouteWorld, tail: Pt): Pt[] | null {
  const C = W.cell, nx = Math.ceil(W.w / C), ny = Math.ceil(W.h / C);
  const free = (p: Pt): boolean => {
    for (const b of W.solid) if (p[0] > b[0] - W.clear && p[0] < b[2] + W.clear && p[1] > b[1] - W.clear && p[1] < b[3] + W.clear) return false;
    for (const s of W.walls) {
      if (segDist(p, s.a, s.b) >= W.clear) continue;
      if (s.gate && Math.hypot(p[0] - (s.a[0] + s.b[0]) / 2, p[1] - (s.a[1] + s.b[1]) / 2) < W.door) continue;
      return false;
    }
    return true;
  };
  const at = (i: number): Pt => [(i % nx + 0.5) * C, (Math.floor(i / nx) + 0.5) * C];
  const ok = new Uint8Array(nx * ny);
  for (let i = 0; i < ok.length; i++) ok[i] = free(at(i)) ? 1 : 0;
  const start = Math.min(ny - 1, Math.max(0, Math.floor(tail[1] / C))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(tail[0] / C)));
  // breadth-first from the line's tail to the nearest edge cell
  const prev = new Int32Array(nx * ny).fill(-2);
  prev[start] = -1;
  const q = [start];
  let exit = -1;
  for (let h = 0; h < q.length && exit < 0; h++) {
    const i = q[h]!, x = i % nx, y = Math.floor(i / nx);
    if (x === 0 || y === 0 || x === nx - 1 || y === ny - 1) { exit = i; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const j = (y + dy) * nx + x + dx;
      // diagonals only where both side cells are free, so a path never cuts a corner
      if (prev[j] !== -2 || !ok[j] || (dx !== 0 && dy !== 0 && (!ok[y * nx + x + dx] || !ok[(y + dy) * nx + x]))) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  if (exit < 0) return null;
  const cells: Pt[] = [];
  for (let i = exit; i >= 0; i = prev[i]!) cells.push(at(i));
  cells[cells.length - 1] = tail;
  // line of sight over free ground, sampled finer than a cell
  const sight = (a: Pt, b: Pt): boolean => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (C / 3));
    for (let k = 1; k < n; k++) if (!free([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])) return false;
    return true;
  };
  const e = cells[0]!;
  // first waypoint just off the map, straight out from the exit cell's edge
  const off: Pt = e[0] < C ? [-20, e[1]] : e[0] > W.w - C ? [W.w + 20, e[1]] : e[1] < C ? [e[0], -20] : [e[0], W.h + 20];
  const out: Pt[] = [off, e];
  for (let i = 0; i < cells.length - 1;) {
    let j = cells.length - 1;
    while (j > i + 1 && !sight(cells[i]!, cells[j]!)) j--;
    out.push(cells[j]!);
    i = j;
  }
  return out.map((p) => [Math.round(p[0]), Math.round(p[1])]);
}
