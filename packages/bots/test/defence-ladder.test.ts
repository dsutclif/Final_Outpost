import { describe, expect, it } from "vitest";
import { PROFILES, playBot } from "../src/index.js";
import level4 from "../../../levels/golden/proto-L004.json";

// Batch 3 defence spend policy: with the guard post standing, the first defence purchase is a guard;
// then towers before any Lv2, Lv2 before any Lv3 (among the pads on show); and the hero keeps shooting.

type Loose = Record<string, any>;
const tower = (id: string, at: [number, number], site: [number, number]): Loose[] => [
  { type: "pad.build", id, at, cost: { "res.salvage": 3 }, build: "struct.ranged_defense", site },
  { type: "pad.build", id: `${id}_up`, at, cost: { "res.salvage": 6 }, build: "struct.ranged_defense.t2", target: id, requires: { pad: id } },
  { type: "pad.build", id: `${id}_up3`, at, cost: { "res.salvage": 12 }, build: "struct.ranged_defense.t3", target: id, requires: { pad: `${id}_up` } },
];
const level = (): Loose => {
  const base = level4 as Loose;
  return {
    ...base, id: "test-ladder",
    entities: [
      ...base.entities.filter((e: Loose) => !e.type.startsWith("pad.") && e.type !== "barrier.line"),
      { type: "barrier.line", id: "north_wall", res: "res.salvage", costPerSection: 1, sections: [
        { a: [0, 230], b: [160, 230], prebuilt: true }, { a: [160, 230], b: [320, 230], gate: true, prebuilt: true }, { a: [320, 230], b: [480, 230], prebuilt: true }] },
      { type: "struct.barracks", id: "barracks", at: [150, 640] },
      { type: "pad.hire", id: "train", at: [150, 720], cost: { "res.salvage": 3 }, role: { role: "role.defender" }, repeatable: true },
      ...tower("tower_n1", [190, 290], [190, 260]), ...tower("tower_n2", [290, 290], [290, 260]),
    ],
    waves: [8, 50, 90, 130, 170].map((t, k) => ({ t, counts: { "hostile.swarmling": 8 + 8 * k, "hostile.raider_humanoid": 2 + k }, side: "n", gap: 0.5 })),
  };
};

describe("defence spend policy", () => {
  it("hires a guard first, then towers, then Lv2, then Lv3, and keeps shooting", () => {
    for (const seed of [1, 2]) {
      const order: string[] = [];
      const r = playBot(level(), PROFILES["good"]!, seed, { onTick: (st, _b, ev) => {
        for (const e of ev) {
          if (e.t !== "hired" && e.t !== "built") continue;
          const kind = e.t === "hired" ? "guard" : e.build === "struct.ranged_defense" ? "tower" : e.build.endsWith(".t2") ? "t2" : e.build.endsWith(".t3") ? "t3" : null;
          if (!kind) continue;
          // nothing of a lower rank was on show and unbought when this one was bought
          const shown = st.pads.filter((p) => p.visible && !p.done && p.id !== ("pad" in e ? e.pad : ""));
          const rank = { guard: 0, tower: 1, t2: 2, t3: 3 }[kind];
          if (rank >= 2) expect(shown.some((p) => p.id.startsWith("tower_") && !p.id.includes("_up")), `${kind} before every tower (${seed})`).toBe(false);
          if (rank >= 3) expect(shown.some((p) => p.id.endsWith("_up")), `t3 before every Lv2 (${seed})`).toBe(false);
          order.push(kind);
        }
      } });
      expect(r.won, `seed ${seed}: ${r.reason}`).toBe(true);
      expect(order[0], `seed ${seed}: ${order.join(",")}`).toBe("guard");
      expect(order).toContain("tower");
      expect(r.trace.playerKillShare).toBeGreaterThan(0);
      expect(r.trace.ladderLeft).toBeGreaterThanOrEqual(0);
    }
  });
});
