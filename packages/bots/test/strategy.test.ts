import { describe, expect, it } from "vitest";
import { PROFILES, STRATEGIES, playBot, strategyProfile, type Strategy } from "../src/index.js";
import level4 from "../../../levels/golden/proto-L004.json";

// Defend redesign S0: an opt-in `strategy` on a profile fixes the buy order over the same pads. Without it nothing changes.

type Loose = Record<string, any>;
const tower = (id: string, at: [number, number], site: [number, number]): Loose[] => [
  { type: "pad.build", id, at, cost: { "res.salvage": 3 }, build: "struct.ranged_defense", site },
  { type: "pad.build", id: `${id}_up`, at, cost: { "res.salvage": 6 }, build: "struct.ranged_defense.t2", target: id, requires: { pad: id } },
];
const level = (): Loose => {
  const base = level4 as Loose;
  return {
    ...base, id: "test-strategy",
    entities: [
      ...base.entities.filter((e: Loose) => !e.type.startsWith("pad.") && e.type !== "barrier.line"),
      { type: "barrier.line", id: "north_wall", res: "res.salvage", costPerSection: 1, sections: [
        { a: [0, 230], b: [160, 230], prebuilt: true }, { a: [160, 230], b: [320, 230], gate: true, prebuilt: true }, { a: [320, 230], b: [480, 230], prebuilt: true }] },
      { type: "struct.barracks", id: "barracks", at: [150, 640] },
      { type: "pad.hire", id: "train", at: [150, 720], cost: { "res.salvage": 3 }, role: { role: "role.defender" }, repeatable: true },
      { type: "pad.build", id: "barracks_up", at: [200, 720], cost: { "res.salvage": 12 }, build: "struct.barracks.t2", target: "barracks" },
      ...tower("tower_n1", [190, 290], [190, 260]), ...tower("tower_n2", [290, 290], [290, 260]),
    ],
    waves: [8, 50, 90, 130, 170].map((t, k) => ({ t, counts: { "hostile.swarmling": 8 + 8 * k, "hostile.raider_humanoid": 2 + k }, side: "n", gap: 0.5 })),
  };
};

const purchases = (strategy: Strategy, seed: number): { order: string[]; hash: string } => {
  const order: string[] = [];
  const r = playBot(level(), strategyProfile(strategy), seed, { onTick: (_st, _b, ev) => {
    for (const e of ev) {
      if (e.t === "hired") order.push("guard");
      else if (e.t === "built") order.push(e.build === "struct.ranged_defense" ? "tower" : e.build === "struct.barracks.t2" ? "drones" : e.build.startsWith("struct.ranged_defense") ? "towerup" : e.build);
    }
  } });
  return { order, hash: r.hash };
};

describe("fixed-strategy bots", () => {
  it("buy in their order: the first guards, then the strategy's own purchase", () => {
    for (const seed of [1, 2]) {
      const t = purchases("turrets_first", seed).order, g = purchases("guards_first", seed).order, d = purchases("drones_first", seed).order;
      for (const o of [t, g, d]) { expect(o[0]).toBe("guard"); expect(o[1]).toBe("guard"); }
      // turrets first: a tower stands before the barracks upgrade; drones first: the barracks upgrade before any tower
      expect(t.indexOf("tower"), t.join()).toBeGreaterThanOrEqual(0);
      if (t.includes("drones")) expect(t.indexOf("tower")).toBeLessThan(t.indexOf("drones"));
      expect(d.indexOf("drones"), d.join()).toBeGreaterThanOrEqual(0);
      expect(d.indexOf("drones")).toBeLessThan(d.indexOf("tower") < 0 ? Infinity : d.indexOf("tower"));
      // guards first: no tower before the guards the level lets it hire (they all come before the first tower)
      const firstTower = g.indexOf("tower");
      expect(g.slice(0, firstTower < 0 ? g.length : firstTower).every((x) => x === "guard"), g.join()).toBe(true);
    }
  });

  it("is deterministic: the same strategy and seed give the same hash", () => {
    for (const s of STRATEGIES) expect(purchases(s, 3).hash).toBe(purchases(s, 3).hash);
  });

  it("is opt-in: the ladder's good profile has no strategy and keeps its order", () => {
    expect(PROFILES["good"]!.strategy).toBeUndefined();
  });
});

// Defend redesign S2 (outpost-ops#273): in random-side mode the bot sees a wave's side only from the warning.
describe("random attack side: the bot", () => {
  it("heads to the warned side after wave_warning, whichever side the manifest lists first", () => {
    const lv = level();
    lv.params = { ...lv.params, "defense.sideMode": 1 };
    lv.waves = [10, 60, 110].map((t) => ({ t, counts: { "hostile.swarmling": 4 }, side: ["n", "e", "s", "w"], gap: 1 }));
    const seen: { side: string; dx: number; dy: number }[] = [];
    let warned: string | null = null;
    playBot(lv, strategyProfile("turrets_first"), 5, { onTick: (st, _b, ev) => {
      for (const e of ev) if (e.t === "wave_warning") warned = e.side;
      if (warned && st.waves.nextSide && st.waves.nextSide.start - st.tick < 15) {
        seen.push({ side: warned, dx: st.player.pos.x - st.core.pos.x, dy: st.player.pos.y - st.core.pos.y });
        warned = null;
      }
    } });
    expect(seen.length).toBeGreaterThan(0);
    // just before the wave starts the commander stands on the warned side of the core (dominant axis)
    const onSide = seen.filter((s) => (s.side === "n" ? s.dy < 0 : s.side === "s" ? s.dy > 0 : s.side === "w" ? s.dx < 0 : s.dx > 0));
    expect(onSide.length).toBeGreaterThanOrEqual(Math.ceil(seen.length / 2));
  });
});
