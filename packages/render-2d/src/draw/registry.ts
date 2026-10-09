import type { DC } from "./dc.js";
import { fillRR, label, shadow } from "./prim.js";

// Entity-draw registry keyed by canonical type. Each group file (stations.ts, units.ts,
// defense.ts, ...) registers its routines; drawing a new entity type is one register()
// call in one file. Lookup: exact type, then "category.*", then the labelled fallback.

// Entities are views of plain sim data; routines narrow them to the fields they read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrawFn = (dc: DC, e: any) => void;

const DRAW = new Map<string, DrawFn>();

export function register(type: string, fn: DrawFn): void {
  DRAW.set(type, fn);
}

export function hasDraw(type: string): boolean {
  return DRAW.has(type) || DRAW.has(`${type.split(".")[0]}.*`);
}

export function registeredTypes(): string[] {
  return [...DRAW.keys()].sort();
}

export function drawEntity(dc: DC, type: string, e: { pos?: { x: number; y: number } }): void {
  const fn = DRAW.get(type) ?? DRAW.get(`${type.split(".")[0]}.*`) ?? fallback;
  fn(dc, { ...e, type: (e as { type?: string }).type ?? type });
}

/** Unknown entity: a labelled crate, so a missing routine is visible rather than invisible. */
function fallback(dc: DC, e: { type: string; pos?: { x: number; y: number } }): void {
  if (!e.pos) return;
  const p = dc.w(e.pos);
  shadow(dc.g, p.x, p.y + 14, 18);
  fillRR(dc.g, p.x - 16, p.y - 14, 32, 28, 6, dc.pal.structure, dc.pal.structureDark, 2);
  label(dc.g, dc.name(e.type), p.x, p.y - 22, 9, "#ffffff");
}
