import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";

// What the camera can see: it looks from the south, tilted, so anything taller than a pad hides the
// ground just north of it. No pad may stand there, and walled attack levels are attacked from the
// sides the camera faces (south and east).
type Pt = [number, number];
type Ent = { type: string; id?: string; at?: Pt; site?: Pt; build?: string; points?: Pt[]; closed?: boolean; gates?: number[] };

const reqs = sequenceRange(1, 60);
const SEEDS = [0, 7919, 104729];
const build = (i: number, dSeed: number) => {
  const r = reqs[i - 1]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed + dSeed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.3) }, salt);
    } catch { /* next layout draw */ }
  }
  return null;
};

const FP = GEN.footprints as Record<string, [number, number, number, number]>;
const WALL = (GEN as unknown as { viewClear: { wallShadow: number } }).viewClear?.wallShadow ?? 30;

/** Every pad whose centre lies in a building's footprint (its drawn body plus the ground it hides) or just north of a wall. */
function hiddenPads(ents: Ent[]): string[] {
  const occ: { id: string; at: Pt; fp: [number, number, number, number]; by?: string | undefined }[] = [];
  for (const e of ents) {
    if (e.type === "pad.build" && e.build && FP[e.build] && e.build !== "pad") occ.push({ id: `${e.id}>${e.build}`, at: (e.site ?? e.at)!, fp: FP[e.build]!, by: e.id });
    else if (!e.type.startsWith("pad") && !e.type.startsWith("node.") && FP[e.type] && e.at) occ.push({ id: e.id ?? e.type, at: e.at, fp: FP[e.type]! });
  }
  const walls: [Pt, Pt][] = [];
  for (const e of ents) if (e.type === "barrier.line" && e.points) {
    const p = e.points, n = p.length;
    for (let i = 0; i < (e.closed ? n : n - 1); i++) walls.push([p[i]!, p[(i + 1) % n]!]);
  }
  const out: string[] = [];
  for (const e of ents) {
    if (!e.type.startsWith("pad.") || !e.at) continue;
    const [x, y] = e.at;
    for (const o of occ) {
      if (o.by === e.id) continue;
      const [x0, y0, x1, y1] = o.fp;
      if (x > o.at[0] + x0 && x < o.at[0] + x1 && y > o.at[1] + y0 && y < o.at[1] + y1) out.push(`${e.id} behind ${o.id}`);
    }
    for (const [a, b] of walls) {
      if (a[0] === b[0] || x <= Math.min(a[0], b[0]) || x >= Math.max(a[0], b[0])) continue;
      const wy = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
      if (y < wy && wy - y < WALL) out.push(`${e.id} behind wall`);
    }
  }
  return out;
}

describe("camera view rules", () => {
  it("no pad stands behind a building or a wall, over many seeds", () => {
    const hidden: string[] = [];
    let levels = 0;
    for (const dSeed of SEEDS) for (let i = 1; i <= reqs.length; i++) {
      const b = build(i, dSeed);
      if (!b) continue;
      levels++;
      for (const h of hiddenPads(b.manifest.entities as unknown as Ent[])) hidden.push(`${reqs[i - 1]!.id}+${dSeed}: ${h}`);
    }
    expect(levels).toBeGreaterThan(100);
    expect(hidden).toEqual([]);
  }, 300_000);

  it("every walled attack level's attack gates face south or east", () => {
    let walled = 0;
    for (const dSeed of SEEDS) for (let i = 1; i <= reqs.length; i++) {
      if (reqs[i - 1]!.family !== "defend") continue;
      const b = build(i, dSeed);
      if (!b) continue;
      const sides = (b.manifest.waves ?? []).flatMap((w) => (w.side === undefined ? [] : Array.isArray(w.side) ? w.side : [w.side]));
      if (!b.manifest.entities.some((e) => e.type === "barrier.line")) continue;
      walled++;
      for (const s of sides) expect(["s", "e"], `${reqs[i - 1]!.id}+${dSeed}`).toContain(s);
    }
    expect(walled).toBeGreaterThan(0);
  }, 300_000);
});
