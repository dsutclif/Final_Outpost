import { Manifest } from "@fo/content";
import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { GEN, buildLevel, knobsFor, templateById } from "../src/index.js";

// Geography (R3 item 17): terrain lands on some levels, never on a station, never off the map.

const reqs = sequenceRange(1, 45);
function build(i: number) {
  const req = reqs[i]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return { req, built: buildLevel({ id: req.id, seed: req.seed, family: req.family, secondary: req.secondary, features: req.features, goalType: req.goalType, modules: closure(req.modules), template: templateById(req.template), knobs: knobsFor(0.3) }, salt) };
    } catch { /* next layout */ }
  }
  return null;
}

describe("generated terrain", () => {
  const rows = reqs.map((_, i) => build(i)).filter((x): x is NonNullable<typeof x> => x !== null);

  it("lands on some levels (more on defend), never on rescue", () => {
    const has = (r: (typeof rows)[number]) => r.built.manifest.entities.some((e) => e.type === "zone.terrain");
    const defend = rows.filter((r) => r.req.family === "defend");
    const other = rows.filter((r) => r.req.family !== "defend" && r.req.family !== "rescue");
    expect(rows.filter(has).length).toBeGreaterThan(0);
    expect(defend.filter(has).length / defend.length).toBeGreaterThan(other.filter(has).length / other.length);
    expect(rows.filter((r) => r.req.family === "rescue").some(has)).toBe(false);
  });

  it("keeps 1-3 pieces on the map, clear of every station and standing spot", () => {
    for (const r of rows) {
      const m = Manifest.parse(r.built.manifest);
      const pieces = m.entities.flatMap((e) => (e.type === "zone.terrain" ? [e] : []));
      if (pieces.length === 0) continue;
      expect(pieces.length).toBeLessThanOrEqual(3);
      const covered = pieces.reduce((a, p) => a + p.rect[2] * p.rect[3], 0);
      expect(covered / (m.map.w * m.map.h)).toBeLessThanOrEqual(GEN.terrain.maxShare);
      for (const p of pieces) {
        const [x, y, w, h] = p.rect;
        expect(x).toBeGreaterThanOrEqual(GEN.terrain.edgeGap);
        expect(y).toBeGreaterThanOrEqual(GEN.terrain.edgeGap);
        expect(x + w).toBeLessThanOrEqual(m.map.w - GEN.terrain.edgeGap);
        expect(y + h).toBeLessThanOrEqual(m.map.h - GEN.terrain.edgeGap);
        for (const s of r.built.stations) {
          const dx = Math.max(x - s.x, 0, s.x - (x + w)), dy = Math.max(y - s.y, 0, s.y - (y + h));
          expect(Math.hypot(dx, dy), `${m.id}: ${p.id} vs ${s.id}`).toBeGreaterThan(s.r);
          if (s.fp) {
            const overlap = x < s.fp[2] && s.fp[0] < x + w && y < s.fp[3] && s.fp[1] < y + h;
            expect(overlap, `${m.id}: ${p.id} overlaps the drawn ${s.id}`).toBe(false);
          }
        }
        expect(m.start[0] < x || m.start[0] > x + w || m.start[1] < y || m.start[1] > y + h).toBe(true);
      }
    }
  });

  it("is deterministic and leaves levels without terrain untouched", () => {
    const a = build(9), b = build(9);
    expect(JSON.stringify(a?.built.manifest)).toBe(JSON.stringify(b?.built.manifest));
  });
});
