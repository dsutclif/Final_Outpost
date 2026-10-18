import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, attackedSide, createSim, guardPost, sectionSide, within } from "../src/index.js";
import { LEVEL_4 } from "./helpers.js";

// Raids hit one side at a time and guards rally to it (Doug, 2026-10-18): with nothing in reach a
// guard walks to a post on the wall facing the side most live hostiles came from, and back to its
// own post once they are gone.

type Loose = Record<string, any>;
const SIDES = ["n", "e", "s", "w"] as const;
const level = (): Loose => {
  const base = LEVEL_4 as Loose;
  return {
    ...base, id: "test-rally", waves: [{ t: 9999, counts: { "hostile.swarmling": 1 } }],
    entities: [
      ...base.entities.filter((e: Loose) => e.type !== "barrier.line"),
      { type: "barrier.line", id: "ring", res: "res.salvage", points: [[80, 260], [400, 260], [400, 640], [80, 640]], closed: true, gates: [2], prebuilt: [0, 1, 2, 3] },
    ],
  };
};
const edge = (s: (typeof SIDES)[number]) => ({ n: { x: 240, y: 10 }, s: { x: 240, y: 890 }, e: { x: 470, y: 450 }, w: { x: 10, y: 450 } })[s];

describe("guards rally to the side under attack", () => {
  it("walk to a post on the attacked side's wall, and back to their own post when it is clear", () => {
    fc.assert(fc.property(fc.constantFrom(...SIDES), fc.integer({ min: 0, max: 3 }), (side, post) => {
      const sim = createSim(level());
      const st = sim.state;
      const g = st.residents.find((r) => r.role === "idle")!;
      g.role = "role.defender";
      g.assign = { from: null, to: null, node: null, post };
      const at = edge(side);
      const foe = { id: 900, type: "hostile.swarmling", pos: { x: at.x * FP, y: at.y * FP }, hp: 99, hpMax: 99, side, target: "core", acc: 0 };
      st.hostiles.push(foe as never);
      for (let i = 0; i < 30 * 30; i++) { foe.pos = { x: at.x * FP, y: at.y * FP }; foe.hp = 99; sim.step({ dx: 0, dy: 0 }); }
      expect(attackedSide(st)).toBe(side);
      const rallied = guardPost(st, sim.compiled, post, side);
      expect(within(g.pos, rallied, 4 * FP)).toBe(true);
      // the post it reached lies on a section facing that side
      const near = st.barriers[0]!.sections.reduce((a, s) => {
        const d = (m: typeof s) => Math.abs((m.a.x + m.b.x) / 2 - g.pos.x) + Math.abs((m.a.y + m.b.y) / 2 - g.pos.y);
        return d(s) < d(a) ? s : a;
      });
      expect(sectionSide(st, near)).toBe(side);
      st.hostiles = [];
      for (let i = 0; i < 30 * 30; i++) sim.step({ dx: 0, dy: 0 });
      expect(within(g.pos, guardPost(st, sim.compiled, post), 4 * FP)).toBe(true);
    }), { numRuns: 12 });
  });

  it("picks the side with the most live hostiles, ties going to n, e, s, w", () => {
    const sim = createSim(level());
    const st = sim.state;
    const h = (id: number, side: string, hp = 3) => ({ id, type: "hostile.swarmling", pos: { x: 0, y: 0 }, hp, hpMax: 3, side, target: "core", acc: 0 }) as never;
    expect(attackedSide(st)).toBeNull();
    st.hostiles.push(h(1, "w"), h(2, "e"));
    expect(attackedSide(st)).toBe("e");
    st.hostiles.push(h(3, "w"));
    expect(attackedSide(st)).toBe("w");
    st.hostiles = [h(4, "s", 0)];
    expect(attackedSide(st)).toBeNull();
  });
});
