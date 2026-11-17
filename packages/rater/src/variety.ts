import type { Manifest } from "@fo/content";
import type { Beat } from "@fo/bots";
import filterData from "../data/filters.json";

// Variety signature (outpost-ops#150): what a level "is" for the no-repeats rule. Two levels with the same modules,
// goal, layout template, coarse layout grid and beat order play the same, however their seeds differ. Generated
// levels only: a candidate whose signature matches any earlier level in the pack is rejected and the search goes on.

export const VARIETY = (filterData as unknown as { variety: { grid: number; exempt: string[]; maxPasses: number } }).variety;

/** Entities that make a level's layout: the core, sales points, machines and resource sources. Pads and decor do not. */
const layoutEntity = (type: string): boolean => type.startsWith("sink.") || type.startsWith("conv.") || type.startsWith("node.");

/** Each layout entity type with the coarse grid cell it sits in (map cut into `grid` x `grid`), deduplicated and sorted. */
export function layoutGrid(m: Manifest, grid = VARIETY.grid): string[] {
  const cells = new Set<string>();
  for (const e of m.entities) {
    if (!("at" in e) || !layoutEntity(e.type)) continue;
    const cx = Math.min(grid - 1, Math.max(0, Math.floor((e.at[0] / m.map.w) * grid)));
    const cy = Math.min(grid - 1, Math.max(0, Math.floor((e.at[1] / m.map.h) * grid)));
    cells.add(`${e.type}@${cx}.${cy}`);
  }
  return [...cells].sort();
}

/** The readable parts of a signature (for logs and the build report). */
export function varietyParts(m: Manifest, template: string | undefined, beats: readonly Beat[]): string[] {
  return [
    [...m.modules].sort().join(","),
    m.goal.type,
    template ?? m.map.zones.join("|"),
    layoutGrid(m).join(" "),
    beats.map((b) => b.beat).join(">"),
  ];
}

/** FNV-1a, 32 bit, as 8 hex digits: short enough to store with every level, no collisions to speak of at pack size. */
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
};

/** Stable for one manifest and beat sheet. Prefixed with the signature version so a later change never matches an old one. */
export const varietySignature = (m: Manifest, template: string | undefined, beats: readonly Beat[]): string =>
  `v1-${fnv(varietyParts(m, template, beats).join("\n"))}`;

export const varietyExempt = (id: string | undefined): boolean => id !== undefined && VARIETY.exempt.includes(id);

/** The first earlier level (in pack order) with the same signature, skipping exempt levels on either side. */
export function sameAsEarlier(id: string | undefined, signature: string, earlier: readonly { id?: string | undefined; signature?: string | undefined }[]): string | null {
  if (varietyExempt(id)) return null;
  for (let i = 0; i < earlier.length; i++) {
    const h = earlier[i]!;
    if (h.signature === signature && !varietyExempt(h.id)) return h.id ?? `history[${i}]`;
  }
  return null;
}
