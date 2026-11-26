import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// Level 5 (outpost-ops#341): the guard hire pad stands outside the wall, beside the hab hub but not on top of it.
// "Beside" = clear of the hub's footprint (100) and within about 3 tiles of it (200 map units; the hub reads as 1 tile, about 64).
const here = resolve(fileURLToPathDir());
function fileURLToPathDir() { return fileURLToPath(new URL(".", import.meta.url)); }
type E = { type: string; id: string; at?: [number, number]; points?: [number, number][] };
const m = JSON.parse(readFileSync(resolve(here, "../../../levels/story/story-L005.json"), "utf8")) as { entities: E[] };
const pad = m.entities.find((e) => e.id === "train")!.at!;
const hub = m.entities.find((e) => e.id === "hub")!.at!;
const ring = m.entities.find((e) => e.type === "barrier.line")!.points!;

function inside(p: [number, number], poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

it("the guard hire pad is outside the wall", () => { expect(inside(pad, ring)).toBe(false); });
it("and beside the hab hub, clear of it", () => {
  const d = Math.hypot(pad[0] - hub[0], pad[1] - hub[1]);
  expect(d).toBeGreaterThanOrEqual(100);
  expect(d).toBeLessThanOrEqual(200);
});
