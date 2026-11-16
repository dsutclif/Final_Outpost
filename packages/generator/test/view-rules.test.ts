import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN, padVisibility, type ViewEnt } from "../src/index.js";

// What the camera can see: it is turned 45 degrees and tilted 30, so anything taller than a pad hides a diagonal swath of
// ground to its north-west (viewVisibility.ts). With generator.json viewClear.realCamera on no pad may stand there; with it
// off (the default) the layouts are only measured. Walled attack levels are attacked from the sides the camera faces (south and east).
type Pt = [number, number];
type Ent = { type: string; id?: string; at?: Pt; site?: Pt; build?: string; points?: Pt[]; closed?: boolean; gates?: number[] };

const reqs = sequenceRange(1, 60);
const SEEDS = [0, 7919, 104729];
const build = (i: number, dSeed: number) => {
  const r = reqs[i - 1]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed + dSeed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.3), walls: true }, salt);
    } catch { /* next layout draw */ }
  }
  return null;
};

/** Every pad hidden on screen under the real camera (viewVisibility.ts, the renderer's own test); tower pads stand in the wall line by design. */
function hiddenPads(ents: Ent[]): string[] {
  return padVisibility(ents as unknown as ViewEnt[]).filter((p) => p.class === "hidden" && !/^tower/.test(p.id)).map((p) => `${p.id} behind ${p.by}`);
}

describe("camera view rules", () => {
  it("every built level reports its pads' visibility, and the report is the shared measurement", () => {
    let levels = 0, pads = 0;
    for (const dSeed of SEEDS) for (let i = 1; i <= 20; i++) {
      const b = build(i, dSeed);
      if (!b) continue;
      levels++;
      const again = padVisibility(b.manifest.entities as unknown as ViewEnt[]);
      expect(b.padVisibility.pads).toEqual(again);
      pads += again.length;
    }
    expect(levels).toBeGreaterThan(20);
    expect(pads).toBeGreaterThan(50);
  }, 300_000);

  it.skipIf(!GEN.viewClear.realCamera)("no pad stands behind a building or a wall under the real camera, over many seeds", () => {
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
