import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";

// Every rock slide hides a reward from generator.json (rockslide.rewards), and the level uses that reward's resource;
// or (88.2, rockslide.site) it is the site of a later building whose pad needs the slide cleared.
// Levels to 120: the first rock-slide level that raises housing is past Level 60.
const reqs = sequenceRange(1, 120).filter((r) => r.features.includes("rockslides") && r.family !== "defend" && r.family !== "rescue");
type Ent = { type: string; id?: string; rect?: number[]; at?: number[]; site?: number[]; build?: string; requires?: { pad?: string } };
const inRect = (p: number[] | undefined, [x, y, w, h]: number[]) => !!p && p[0]! >= x! && p[0]! <= x! + w! && p[1]! >= y! && p[1]! <= y! + h!;

describe("rock slide rewards", () => {
  it("every rubble rect holds an allowed reward or a building site over 40 seeds, with 3 kinds", () => {
    expect(reqs.length).toBeGreaterThan(0);
    const allowed = new Map(GEN.rockslide.rewards.map((w) => [w.node, w.resource]));
    const kinds = new Set<string>();
    let rubble = 0;
    const siteSeeds: string[] = [];
    for (let s = 1; s <= 40; s++) {
      const r = reqs[s % reqs.length]!;
      let b: ReturnType<typeof buildLevel> | null = null;
      for (let salt = 0; salt < GEN.search.layoutTries && !b; salt++) {
        try { b = buildLevel({ id: r.id, seed: s * 7919, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
          modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.5, {}), walls: true }, salt); } catch { /* next layout draw */ }
      }
      if (!b) continue;
      const ents = (b.manifest as unknown as { entities: Ent[] }).entities;
      for (const z of ents.filter((e) => e.type === "zone.blocked" && String(e.id).startsWith("rubble"))) {
        rubble++;
        const clear = ents.find((e) => e.build === "zone.clear" && (e as { target?: string }).target === z.id)!;
        const site = ents.filter((e) => e.build === GEN.rockslide.site.build && inRect(e.at, z.rect!) && inRect(e.site, z.rect!));
        if (site.length > 0) {
          // the building's pad and site are inside the slide, and the pad needs it cleared
          expect(site[0]!.requires?.pad, `seed ${s} ${r.id}`).toBe(clear.id);
          kinds.add("site"); siteSeeds.push(`${r.id}@${s * 7919}`);
          continue;
        }
        const inside = ents.filter((e) => allowed.has(e.type) && inRect(e.at, z.rect!));
        expect(inside.length, `seed ${s} ${r.id}`).toBeGreaterThan(0);
        for (const e of inside) kinds.add(e.type);
      }
    }
    console.log("building-site seeds:", siteSeeds.join(" "));
    expect(rubble).toBeGreaterThan(20);
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });
});
