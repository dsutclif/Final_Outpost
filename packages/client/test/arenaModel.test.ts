import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { cardRows, createFight, PROPOSALS, roster, runFight, statsOf, stepFight } from "../src/dev/arenaModel.js";

const fighter = (id: string) => roster().fighters.find((f) => f.id === id)!;

describe("fighter arena model", () => {
  it("lists every hostile and dangerous animal as enemies, and the fighting settlers", () => {
    const ids = roster().fighters.map((f) => f.id);
    for (const id of Object.keys(content.hostiles)) expect(ids).toContain(id);
    for (const id of ["node.prey_dangerous", "player", "guard", "drone", "tower1", "tower2", "tower3"]) expect(ids).toContain(id);
  });

  it("takes today's numbers from content and lays the proposals over them only in r2", () => {
    const mite = fighter("hostile.swarmling");
    expect(statsOf(mite, "today").hp).toBe(content.hostiles["hostile.swarmling"]!.hp);
    expect(statsOf(mite, "today").shotRange).toBeUndefined();
    expect(statsOf(mite, "r2").shotRange).toBe(45);
    expect(statsOf(mite, "r2", { "hostile.swarmling:shotRange": 50 }).shotRange).toBe(50);
    const spit = cardRows(mite, "r2").find((r) => r.stat === "shotDamage")!;
    expect(spit.isNew).toBe(true);
    expect(spit.label).toContain("Acid spit");
    for (const p of PROPOSALS) expect(p.key).toMatch(/^[a-z_.]+:[a-zA-Z]+$/);
  });

  it("10 mites against 2 drones finishes, in both modes", () => {
    for (const mode of ["today", "r2"] as const) {
      const f = runFight({ enemy: "hostile.swarmling", enemies: 10, settler: "drone", settlers: 2, mode, seed: 7 });
      expect(f.result).not.toBeNull();
      expect(f.result!.winner).not.toBe("draw");
    }
  });

  it("today's rules: attackers only hit settlers from inside troop contact (18)", () => {
    const reach = content.defaults["defense.troopContact"]!;
    for (const enemy of Object.keys(content.hostiles)) for (const settler of ["drone", "guard", "player", "tower1"]) {
      const f = runFight({ enemy, enemies: 8, settler, settlers: 3, mode: "today", seed: 3 });
      const unitHits = f.hits.filter((h) => h.byKind === "hostile" && h.target !== "base");
      for (const h of unitHits) { expect(h.ranged).toBe(false); expect(h.dist).toBeLessThan(reach); }
    }
  });

  it("r2: raiders shoot from beyond guards' reach, mites spit and lunge", () => {
    const f = runFight({ enemy: "hostile.raider_humanoid", enemies: 6, settler: "guard", settlers: 2, mode: "r2", seed: 5 });
    expect(f.hits.some((h) => h.byKind === "hostile" && h.ranged && h.dist > 18)).toBe(true);
    const m = runFight({ enemy: "hostile.swarmling", enemies: 10, settler: "drone", settlers: 2, mode: "r2", seed: 5 });
    expect(m.hits.some((h) => h.byKind === "hostile" && h.ranged)).toBe(true);
  });

  it("a guard goes down at 25% and no strike takes it below 1 hp", () => {
    const f = createFight({ enemy: "hostile.boss", enemies: 3, settler: "guard", settlers: 1, mode: "today", seed: 1 });
    const g = f.units.find((u) => u.kind === "guard")!;
    let minHp = g.hp;
    while (!f.result) { stepFight(f); minHp = Math.min(minHp, g.hp); }
    const pct = content.defaults["guards.downPct"]!;
    if (g.status === "down") expect(g.hp * 100).toBeLessThanOrEqual(pct * g.hpMax);
    expect(minHp).toBeGreaterThanOrEqual(1);
    // a warlord hits for 4 on a 10 hp guard: 10 -> 6 -> 2 (down); it never reaches 0
    const solo = createFight({ enemy: "hostile.boss", enemies: 1, settler: "guard", settlers: 1, mode: "today", seed: 1, edits: { "guard:damage": 0 } });
    solo.pending[0]!.y = solo.base.y; // straight down the middle, through the guard
    while (!solo.result) stepFight(solo);
    expect(solo.result!.winner).toBe("enemies");
    expect(solo.units.find((u) => u.kind === "guard")!.status).toBe("down");
  });
});
