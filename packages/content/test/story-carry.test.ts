import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A story level opens with everything the goals of the levels before it built and trained, already working
// (outpost-ops#124). This walks the five manifests: each pad a level offers (build or hire) must show up as the
// finished thing in every later level, and the second grow dome stays out of levels 3-5.

type Ent = { id: string; type: string; build?: string; target?: string; role?: { role: string; node?: string }; repeatable?: boolean };
type Person = { role: string; from?: string; to?: string; node?: string };
type Manifest = { entities: Ent[]; people: Person[] };
const here = dirname(fileURLToPath(import.meta.url));
const load = (n: number): Manifest => JSON.parse(readFileSync(resolve(here, `../../../levels/story/story-L00${n}.json`), "utf8"));
const LEVELS = [1, 2, 3, 4, 5];

/** Problems found when `later` is checked against what `earlier` asks the player to build or train. */
export function carryProblems(earlier: Manifest, later: Manifest, label: string): string[] {
  const out: string[] = [];
  const ids = new Set(later.entities.map((e) => e.id));
  for (const pad of earlier.entities) {
    if (pad.type === "pad.hire" && !pad.repeatable && pad.role) {
      const r = pad.role;
      const there = later.people.some((p) => p.role === r.role && (!r.node || p.node === r.node));
      if (!there) out.push(`${label}: nobody works as ${r.role}${r.node ? ` at ${r.node}` : ""} (trained by pad ${pad.id})`);
      if (ids.has(pad.id)) out.push(`${label}: pad ${pad.id} is still offered`);
    }
    if (pad.type === "pad.build" && pad.build && pad.build !== "node.enable" && pad.build !== "zone.clear") {
      const built = later.entities.find((e) => e.id === pad.id && e.type !== "pad.build");
      if (!built) out.push(`${label}: ${pad.id} (${pad.build}) is not already built`);
    }
    if (pad.type === "pad.build" && pad.build === "zone.clear") {
      if (later.entities.some((e) => e.id === pad.target)) out.push(`${label}: ${pad.target} is not already cleared`);
    }
  }
  return out;
}

describe("story levels carry forward what earlier goals built", () => {
  const m = LEVELS.map(load);
  it("every later level has what each earlier level's pads build or train", () => {
    const problems: string[] = [];
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) problems.push(...carryProblems(m[i], m[j], `L${j + 1} vs L${i + 1}`));
    expect(problems).toEqual([]);
  });
  it("the second grow dome is gone from levels 3-5", () => {
    for (const n of [3, 4, 5]) {
      const bad = m[n - 1].entities.filter((e) => e.id === "field2" || e.id === "unlock_field2").map((e) => e.id);
      expect(bad, `L${n}`).toEqual([]);
    }
  });
  it("Tam works the dome from level 4, the galley crew from level 5", () => {
    expect(m[3].people.some((p) => p.role === "role.supplier" && p.node === "field1" && p.to === "sink.sales_point")).toBe(true);
    const l5 = m[4].people;
    expect(l5.some((p) => p.role === "role.supplier" && p.node === "field1" && p.to === "conv.food_processor")).toBe(true);
    expect(l5.some((p) => p.role === "role.operator")).toBe(true);
    expect(l5.some((p) => p.role === "role.server")).toBe(true);
    expect(l5.some((p) => p.role === "role.cashier")).toBe(true);
  });
  it("fails when a carried item is removed", () => {
    const l5 = structuredClone(m[4]);
    l5.people = l5.people.filter((p) => p.role !== "role.operator");
    expect(carryProblems(m[3], l5, "mut").length).toBeGreaterThan(0);
    const l4 = structuredClone(m[3]);
    l4.people = l4.people.filter((p) => p.node !== "field1");
    expect(carryProblems(m[2], l4, "mut").length).toBeGreaterThan(0);
    const l5b = structuredClone(m[4]);
    l5b.entities = l5b.entities.filter((e) => e.id !== "galley");
    expect(carryProblems(m[3], l5b, "mut").length).toBeGreaterThan(0);
  });
});
