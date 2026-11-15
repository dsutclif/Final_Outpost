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

  it("each road turret borders the road it covers, with its pad behind it away from the road", () => {
    let checked = 0;
    const bad: string[] = [];
    for (const dSeed of SEEDS) for (let i = 1; i <= reqs.length; i++) {
      if (reqs[i - 1]!.family !== "defend") continue;
      const b = build(i, dSeed);
      if (!b) continue;
      const ents = b.manifest.entities as unknown as Ent[];
      const ring = ents.find((e) => e.type === "barrier.line" && e.points && e.gates);
      if (!ring) continue;
      const pts = ring.points!;
      const gates = (ring.gates ?? []).map((k) => [pts[k]!, pts[(k + 1) % pts.length]!] as [Pt, Pt]);
      for (const t of ents) {
        const m = /^tower_([nsew])\d+$/.exec(t.id ?? "");
        if (!m || t.type !== "pad.build" || !t.site || !t.at) continue;
        const sd = m[1]!, ew = sd === "e" || sd === "w", ax = ew ? 1 : 0; // ax: the coordinate across the road
        // the gates on this side: an east or west gate runs along y, a north or south one along x
        const out = (q: Pt) => (sd === "n" ? -q[1] : sd === "s" ? q[1] : sd === "w" ? -q[0] : q[0]);
        const along = gates.filter(([a, c]) => (ew ? a[0] === c[0] : a[1] === c[1]));
        if (along.length === 0) continue;
        const far = Math.max(...along.map(([a]) => out(a)));
        const side = along.filter(([a]) => out(a) === far); // the gates of the wall on this side
        // a road turret stands outside the wall: further out than every gate of its side
        if (out(t.site) <= Math.max(...side.map(([a]) => out(a)))) continue;
        // the road it covers is one of its side's gates' lanes (two gates side by side share a wall)
        const lanes = side.map(([a, c]) => (a[ax] + c[ax]) / 2).filter((l) => Math.abs(t.site![ax] - l) <= 140);
        if (lanes.length === 0) continue; // belongs to another side's road
        checked++;
        const ok = lanes.some((lane) => {
          const dSite = Math.abs(t.site![ax] - lane), gap = dSite - (ew ? 45 : 19);
          return gap <= 45 && (t.at![ax] - lane) * Math.sign(t.site![ax] - lane) > dSite;
        });
        if (!ok) bad.push(`${reqs[i - 1]!.id}+${dSeed} ${t.id}: not beside its road with the pad behind`);
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  }, 300_000);
});
