import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";

// outpost-ops#208: wall-free defend levels get a ring of tower sockets round the reactor, keep the road pair, and cap the lanes.
const reqs = sequenceRange(1, 60).filter((r) => r.family === "defend" && !r.secondary);
const mk = (r: (typeof reqs)[number], walls: boolean, p = 0.3) => {
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed, family: "defend", secondary: null, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p), walls }, salt);
    } catch { /* next layout draw */ }
  }
  return null;
};
type Ent = { type: string; id?: string; at?: number[]; site?: number[]; build?: string; requires?: { wave?: number } };
const ents = (b: NonNullable<ReturnType<typeof mk>>) => b.manifest.entities as unknown as Ent[];
const coreAt = (b: NonNullable<ReturnType<typeof mk>>) => ents(b).find((e) => e.type === "sink.core")!.at as [number, number];
const towers = (b: NonNullable<ReturnType<typeof mk>>) => ents(b).filter((e) => e.type === "pad.build" && e.build === "struct.ranged_defense");
const safeR = (level: number) => (content.sinks["sink.core"] as unknown as { levels: { safeRadius: number }[] }).levels[level - 1]!.safeRadius;

describe("wall-free defend layout (outpost-ops#208)", () => {
  const sample = reqs.slice(0, 4);
  it("has a sample of defend requests", () => { expect(sample.length).toBeGreaterThanOrEqual(3); });

  it("ring sockets stand within 0.7-0.9 of the heat circle, at least minSockets, some from the start", () => {
    for (const r of sample) {
      const b = mk(r, false)!;
      expect(b).not.toBeNull();
      const c = coreAt(b);
      const ring = towers(b).filter((t) => String(t.id).startsWith("tower_r"));
      expect(ring.length).toBeGreaterThanOrEqual(GEN.defendFree.minSockets);
      for (const t of ring) {
        const d = Math.hypot(t.site![0]! - c[0], t.site![1]! - c[1]);
        expect(d).toBeGreaterThanOrEqual(0.7 * safeR(GEN.defendFree.refLevel) - 1);
        expect(d).toBeLessThanOrEqual(0.9 * safeR(GEN.defendFree.refLevel) + 1);
        // inside the reference circle, so inside every later (bigger) one
        expect(d).toBeLessThan(safeR(GEN.defendFree.refLevel));
      }
      expect(ring.filter((t) => !t.requires?.wave).length).toBe(GEN.defendFree.start);
    }
  });

  it("keeps the road tower pair as the early forward post", () => {
    for (const r of sample) {
      const b = mk(r, false)!;
      const c = coreAt(b);
      const road = towers(b).filter((t) => !String(t.id).startsWith("tower_r"));
      expect(road.length).toBeGreaterThanOrEqual(2);
      const open = road.filter((t) => !t.requires?.wave);
      expect(open.length).toBeGreaterThanOrEqual(2);
      for (const t of road) expect(Math.hypot(t.site![0]! - c[0], t.site![1]! - c[1])).toBeGreaterThan(0.9 * safeR(GEN.defendFree.refLevel));
    }
  });

  it("never has more than 2 attack lanes before core level 2, even with three camera-facing sides", () => {
    const saved = [...GEN.viewClear.attackSides];
    GEN.viewClear.attackSides = ["s", "e", "w"];
    try {
      const multi = reqs.filter((r) => r.features.includes("multi_side"));
      expect(multi.length).toBeGreaterThan(0);
      for (const r of multi.slice(0, 3)) {
        const b = mk(r, false, 0.8)!;
        expect(b.manifest.waves.flatMap((w) => (Array.isArray(w.side) ? w.side : [w.side ?? "n"]))).toBeTruthy();
        const sides = new Set(b.manifest.waves.flatMap((w) => (Array.isArray(w.side) ? w.side : [w.side ?? "n"])));
        expect(sides.size).toBeLessThanOrEqual(2);
        // walled levels: gates stand on the south and east sides only (Doug 2026-11-16, outpost-ops#202), so a west attack side has no
        // walled layout; with south and east only they keep their lanes (the cap is wall-free only)
        expect(mk(r, true, 0.8)).toBeNull();
      }
    } finally { GEN.viewClear.attackSides = saved as typeof GEN.viewClear.attackSides; }
  });

  it("walled defend levels do not read the wall-free knobs", () => {
    const r = sample[0]!;
    const base = JSON.stringify(mk(r, true)!.manifest);
    const saved = { ...GEN.defendFree };
    Object.assign(GEN.defendFree, { sockets: 0, minSockets: 0, start: 0, firstTowerScale: 0.5, earlyDrops: 2, lanesBeforeCore2: 1 });
    try { expect(JSON.stringify(mk(r, true)!.manifest)).toBe(base); } finally { Object.assign(GEN.defendFree, saved); }
    expect(towers(mk(r, true)!).some((t) => String(t.id).startsWith("tower_r"))).toBe(false);
  });

  it("the early salvage floor is off by default and bites when asked", () => {
    expect(GEN.defendFree.firstTowerScale).toBe(1);
    expect(GEN.defendFree.earlyDrops).toBe(1);
    const r = sample[0]!;
    const cost = (b: NonNullable<ReturnType<typeof mk>>) => (towers(b).find((t) => !t.requires?.wave) as unknown as { cost: Record<string, number> }).cost["res.salvage"]!;
    const swarm = (b: NonNullable<ReturnType<typeof mk>>) => b.manifest.waves[0]!.counts["hostile.swarmling"]!;
    const off = mk(r, false)!;
    const saved = { ...GEN.defendFree };
    Object.assign(GEN.defendFree, { firstTowerScale: 0.5, earlyDrops: 1.5 });
    try {
      const on = mk(r, false)!;
      expect(cost(on)).toBeLessThanOrEqual(cost(off));
      expect(swarm(on)).toBeGreaterThanOrEqual(swarm(off));
    } finally { Object.assign(GEN.defendFree, saved); }
  });
});
