import { describe, expect, it } from "vitest";
import { TPS, createSim, hashOf, type SimEvent } from "../src/index.js";
import { LEVEL_4 } from "./helpers.js";

// Defend redesign S2 (outpost-ops#273, spec 1.3): defense.sideMode 1 draws each wave's side from its `sides` at a warning.
// Default 0 (rotate) is today's rule: no warning, no nextSide, the same state hash.

type Loose = Record<string, any>;
const POOL = ["n", "e", "s", "w"];
const waves = [12, 40, 70, 100, 130, 160, 190, 220].map((t) => ({ t, counts: { "hostile.swarmling": 4 }, side: POOL, gap: 1 }));
const level = (params: Loose = {}, seed?: number): Loose => {
  const base = LEVEL_4 as Loose;
  return { ...base, id: "test-sides", ...(seed !== undefined ? { seed } : {}), params: { ...base.params, "meters.baseHealth": 100000, ...params }, waves };
};

interface Run { hash: string; warnings: { tick: number; idx: number; side: string; inTicks: number }[]; starts: { tick: number; idx: number }[]; spawnSides: Map<number, Set<string>>; nextSideSeen: boolean }
function run(params: Loose, seed?: number, secs = 260): Run {
  const sim = createSim(level(params, seed));
  const r: Run = { hash: "", warnings: [], starts: [], spawnSides: new Map(), nextSideSeen: false };
  let live = 0;
  for (let i = 0; i < secs * TPS; i++) {
    const ev: SimEvent[] = sim.step({ dx: 0, dy: 0 });
    for (const e of ev) {
      if (e.t === "wave_warning") r.warnings.push({ tick: sim.state.tick, idx: e.idx, side: e.side, inTicks: e.inTicks });
      if (e.t === "wave_started") { r.starts.push({ tick: sim.state.tick, idx: e.idx }); live = e.idx; }
    }
    for (const h of sim.state.hostiles) { const s = r.spawnSides.get(live) ?? new Set<string>(); s.add(h.side); r.spawnSides.set(live, s); }
    for (const a of sim.state.approaching ?? []) { const s = r.spawnSides.get(live + 0.5) ?? new Set<string>(); s.add(a.side); r.spawnSides.set(live + 0.5, s); }
    if (sim.state.waves.nextSide) r.nextSideSeen = true;
    if (i % (20 * TPS) === 0) sim.state.hostiles.length = 0; // sweep the field so the next wave may start
  }
  r.hash = hashOf(sim.state);
  return r;
}

describe("defense.sideMode", () => {
  it("rotate (default) is unchanged: no warning, no nextSide, same hash as sideMode 0 spelled out", () => {
    const a = run({}), b = run({ "defense.sideMode": 0 });
    expect(a.warnings).toEqual([]);
    expect(a.nextSideSeen).toBe(false);
    expect(a.starts.length).toBeGreaterThanOrEqual(3);
    expect(a.hash).toBe("d7f047fb"); // same on the S1 base (05b40e55): rotate mode does not move
    expect(a.hash).toBe(b.hash);
  });

  it("random: one warning per wave, side drawn from the pool, deterministic for a seed", () => {
    const a = run({ "defense.sideMode": 1 }, 7), b = run({ "defense.sideMode": 1 }, 7);
    expect(a.warnings.length).toBe(a.starts.length);
    expect(a.warnings.length).toBeGreaterThan(3);
    for (const w of a.warnings) expect(POOL).toContain(w.side);
    expect(a.hash).toBe(b.hash);
    expect(a.warnings.map((w) => w.side)).toEqual(b.warnings.map((w) => w.side));
    // across seeds the draw really varies
    const all = new Set<string>();
    for (const s of [1, 2, 3, 4]) for (const w of run({ "defense.sideMode": 1 }, s, 130).warnings) all.add(w.side);
    expect(all.size).toBeGreaterThan(1);
  });

  it("random: the warning leads the wave start by at least warnTicks and the walk-in lead; its side is the side attackers use", () => {
    const sim = createSim(level({ "defense.sideMode": 1 }));
    const need = Math.max(sim.compiled.defense.warnTicks, Math.max(...Object.values(sim.compiled.hostiles).map((h) => (h.speed > 0 ? Math.ceil(sim.compiled.defense.approach / h.speed) : 0))));
    const r = run({ "defense.sideMode": 1 }, 11);
    r.starts.forEach((s, k) => {
      const w = r.warnings[k]!;
      expect(w.idx).toBe(s.idx);
      expect(s.tick - w.tick).toBeGreaterThanOrEqual(sim.compiled.defense.warnTicks);
      expect(s.tick - w.tick).toBeGreaterThanOrEqual(Math.min(need, w.inTicks));
      expect(w.inTicks).toBeGreaterThanOrEqual(sim.compiled.defense.warnTicks);
      expect([...(r.spawnSides.get(s.idx) ?? [w.side])]).toEqual([w.side]);
    });
    expect(sim.compiled.defense.warnTicks).toBe(6 * TPS);
  });

  it("random: nextSide is set only between warning and start", () => {
    const sim = createSim(level({ "defense.sideMode": 1 }));
    let warned = false;
    for (let i = 0; i < 120 * TPS; i++) {
      const ev = sim.step({ dx: 0, dy: 0 });
      if (ev.some((e) => e.t === "wave_warning")) warned = true;
      if (ev.some((e) => e.t === "wave_started")) { warned = false; expect(sim.state.waves.nextSide).toBeUndefined(); }
      if (!warned && sim.state.waves.nextSide === undefined) continue;
      expect(warned).toBe(true);
    }
  });
});
