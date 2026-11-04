import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { cardRows, createFight, waveOrder, PROPOSALS, REACH, roster, runFight, statsOf, stepFight } from "../src/dev/arenaModel.js";

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
    expect(statsOf(mite, "r2").shotRange).toBe(REACH / 2);
    expect(statsOf(fighter("guard"), "r2").range).toBe(REACH);
    expect(statsOf(mite, "r2", { "hostile.swarmling:shotRange": 50 }).shotRange).toBe(50);
    const spit = cardRows(mite, "r2").find((r) => r.stat === "shotDamage")!;
    expect(spit.isNew).toBe(true);
    expect(spit.label).toContain("Acid spit");
    for (const p of PROPOSALS) expect(p.key).toMatch(/^[a-z0-9_.]+:[a-zA-Z]+$/);
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

  it("r2: raiders shoot at range, and mites spit at settlers that come within half the reach", () => {
    const f = runFight({ enemy: "hostile.raider_humanoid", enemies: 6, settler: "guard", settlers: 2, mode: "r2", seed: 5 });
    expect(f.hits.some((h) => h.byKind === "hostile" && h.ranged && h.dist > 18)).toBe(true);
    // drones out-reach the spit at the common reach, so give them back their short reach to let the mites close
    // (with a mite drawn at today's model size it already touches anything inside its spit reach, so shrink it)
    const m = runFight({ enemy: "hostile.swarmling", enemies: 10, settler: "drone", settlers: 2, mode: "r2", seed: 5, edits: { "drone:range": 20 }, bodies: { "hostile.swarmling": 6 } });
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
  it("ground fighters never overlap each other; drones only avoid other drones (Doug 2026-11-03)", () => {
    for (const [enemy, settler] of [["hostile.swarmling", "guard"], ["hostile.raider_humanoid", "drone"], ["hostile.boss", "player"], ["node.prey_dangerous", "tower1"]] as const) {
      const f = createFight({ enemy, enemies: 10, settler, settlers: 3, mode: "r2", seed: 5 });
      let worst = 0;
      while (!f.result) {
        stepFight(f);
        const live = f.units.filter((u) => u.status !== "dead" && u.kind !== "player" && !(u.side === "enemy" && u.x < 0));
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
          const a = live[i]!, b = live[j]!;
          if ((a.kind === "drone") !== (b.kind === "drone")) continue;
          worst = Math.max(worst, a.body + b.body - Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      expect(worst, `${enemy} vs ${settler}`).toBeLessThan(1.5);
    }
  });
  it("R2: nobody stops to shoot; fighters close in and switch to melee in reach (Doug 2026-11-03)", () => {
    const contact = content.defaults["defense.troopContact"]!;
    for (const [enemy, settler] of [["hostile.raider_humanoid", "guard"], ["hostile.raider_humanoid", "drone"], ["hostile.boss", "player"], ["hostile.creature", "guard"]] as const) {
      const f = runFight({ enemy, enemies: 6, settler, settlers: 3, mode: "r2", seed: 11 });
      const melee = f.hits.filter((h) => !h.ranged && h.target !== "base");
      expect(melee.length, `${enemy} vs ${settler}: melee happens`).toBeGreaterThan(0);
      // a shot is never fired from inside melee reach
      for (const h of f.hits) if (h.ranged && h.byKind !== "tower") expect(h.dist).toBeGreaterThan(contact - 1e-6);
    }
  });

  it("every animal with a ranged attack spits acid", () => {
    const f = runFight({ enemy: "hostile.creature", enemies: 6, settler: "guard", settlers: 2, mode: "r2", seed: 4 });
    expect(f.result).not.toBeNull();
    const c = createFight({ enemy: "hostile.creature", enemies: 6, settler: "guard", settlers: 2, mode: "r2", seed: 4 });
    const kinds = new Set<string>();
    while (!c.result) { stepFight(c); for (const s of c.shots) if (s.by === "hostile.creature") kinds.add(s.kind); }
    expect([...kinds]).toEqual(["acid"]);
  });
  it("waves mix their types evenly and come in rows when ranked", () => {
    const o = waveOrder({ "hostile.swarmling": 12, "hostile.creature": 4, "hostile.boss": 2 });
    expect(o.length).toBe(18);
    const at = (t: string) => o.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0);
    expect(at("hostile.boss")[0]).toBeGreaterThan(2);
    expect(at("hostile.boss")[1]! - at("hostile.boss")[0]!).toBeGreaterThan(6);
    const f = createFight({ mode: "r2", enemyCounts: { "hostile.swarmling": 12, "hostile.raider_humanoid": 3 }, settlerCounts: { guard: 2 }, ranks: 5, rowGap: 0.5, seed: 2 });
    expect(f.pending.filter((p) => p.tick === 0).length).toBe(5);
    expect(new Set(f.pending.map((p) => p.tick)).size).toBe(3);
  });

  it("R2: a downed guard takes half damage and dies without a medic; a medic heals it and is never hurt", () => {
    const solo = createFight({ mode: "r2", enemyCounts: { "hostile.boss": 2 }, settlerCounts: { guard: 1 }, seed: 1, edits: { "guard:damage": 0 } });
    while (!solo.result) stepFight(solo);
    expect(solo.deaths).toBe(1);
    const without = runFight({ mode: "r2", enemyCounts: { "hostile.raider_humanoid": 16 }, settlerCounts: { guard: 3 }, seed: 3 });
    expect(without.deaths).toBeGreaterThan(0);
    const healed = createFight({ mode: "r2", enemyCounts: { "hostile.raider_humanoid": 16 }, settlerCounts: { guard: 3, medic: 1 }, seed: 3 });
    const m = healed.units.find((u) => u.kind === "medic")!;
    while (!healed.result) { stepFight(healed); expect(m.status).toBe("ok"); }
    expect(healed.heals).toBeGreaterThan(0);
    expect(healed.deaths).toBe(0);
    expect(healed.hits.some((h) => h.target === m.uid)).toBe(false);
  });

  it("R2: the drone post builds drones while attackers are on the field", () => {
    const f = runFight({ mode: "r2", enemyCounts: { "hostile.creature": 12 }, settlerCounts: { drone: 1 }, seed: 4 });
    expect(f.built).toBeGreaterThan(0);
  });

  it("hunting: three spiked hoppers beat a hunter who stands still; one who keeps moving wins", () => {
    for (const who of ["player", "hunter"]) {
      let standWins = 0, kiteWins = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const base = { mode: "r2" as const, tab: "hunt" as const, enemyCounts: { "node.prey_dangerous": 3 }, settlerCounts: { [who]: 1 }, seed };
        if (runFight(base).result!.winner === "settlers") standWins++;
        if (runFight({ ...base, kite: true }).result!.winner === "settlers") kiteWins++;
      }
      expect(standWins, `${who} standing`).toBeLessThanOrEqual(3);
      expect(kiteWins, `${who} moving`).toBeGreaterThanOrEqual(7);
    }
  });
});
