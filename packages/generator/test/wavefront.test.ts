import { describe, expect, it } from "vitest";
import gen from "../data/generator.json";
import { WfState, placeWavefront, spotsOf, tallestShape, wavefronts, type TraceStep, type WfBuilding } from "../src/wavefront.js";

// outpost-ops#202: the wavefront placement loop and the pad repair loop as Doug agreed them (2026-11-16).
const FP = (gen as unknown as { footprints: Record<string, [number, number, number, number]> }).footprints;
const core = (coexist: string[]): WfBuilding => ({ id: "core", kind: "sink.core", footprint: FP["sink.core"]!, occ: tallestShape("sink.core"), appear: 0, pads: [{ id: "hire_core", coexist }] });
const machine = (id: string, appear = 1): WfBuilding => ({ id, kind: "conv.food_processor", footprint: FP["conv.food_processor"]!, occ: tallestShape("conv.food_processor"), appear, pads: [] });
const MAP = { w: 480, h: 900 };
const state = (bs: WfBuilding[]) => new WfState({ buildings: bs, map: MAP }, { step: 6, trace: true, maxRepairs: 50 });
const CORE_AT: [number, number] = [240, 450];

describe("wavefront pad repair (Doug's drawn scenarios)", () => {
  it("(a) a Core pad hidden by a machine to its south-east is solved by trying spots; nothing moves", () => {
    const S = state([core(["core", "m1"]), machine("m1")]);
    S.place("core", CORE_AT, 0); S.locked = 0; S.place("m1", [300, 602], 1);
    const pad = S.by.get("core")!.pads[0]!;
    expect(S.padHidden(pad, S.spotAt("core"))).toBe(true);
    expect(S.repair(pad)).toEqual([]);
    expect(S.placed.get("core")!.spot).toBe(1);
    expect(S.placed.get("m1")!.at).toEqual([300, 602]);
    expect(S.pushes).toBe(0);
    expect(S.trace.filter((t) => t.t === "move")).toEqual([]);
  });

  it("(b) machine 1 south-east and machine 3 east: spots fail, machine 1 goes 6 south, pad lands on spot 2, machine 3 stays", () => {
    const S = state([core(["core", "m1", "m3"]), machine("m1"), machine("m3")]);
    S.place("core", CORE_AT, 0); S.locked = 0; S.place("m1", [356, 578], 1); S.place("m3", [404, 444], 1);
    const pad = S.by.get("core")!.pads[0]!;
    // machine 3 covers part of spot 2 at the start; every spot fails at distance 0
    expect(S.hiders(pad, spotsOf(CORE_AT, 84)[1]!)).toContain("m3");
    expect(S.repair(pad)).toEqual([]);
    const spots = S.trace.filter((t): t is Extract<TraceStep, { t: "spot" }> => t.t === "spot");
    expect(spots.slice(0, 3).map((s) => s.ok)).toEqual([false, false, false]);
    expect(S.trace.filter((t) => t.t === "move")).toEqual([{ t: "move", id: "m1", dir: "south", d: 6, to: [356, 584] }]);
    expect(S.placed.get("core")!.spot).toBe(1);
    expect(S.placed.get("m1")!.at).toEqual([356, 584]);
    expect(S.placed.get("m3")!.at).toEqual([404, 444]);
    expect(S.pushes).toBe(1);
    expect(S.pushDist).toBe(6);
  });
});

describe("the push loop order", () => {
  it("tries the pad's 3 spots between every move: distance 0 once, then south, south-east, east per distance", () => {
    const S = state([core(["core", "m1"]), machine("m1")]);
    S.place("core", CORE_AT, 0); S.locked = 0; S.place("m1", [368, 558], 1);
    S.repair(S.by.get("core")!.pads[0]!);
    const seq = S.trace.filter((t) => t.t === "move" || t.t === "spot" || t.t === "overlap");
    const moves = seq.filter((t) => t.t === "move") as Extract<TraceStep, { t: "move" }>[];
    expect(moves.map((m) => `${m.dir} ${m.d}`)).toEqual(["south 6", "south-east 6", "east 6", "south 12", "south-east 12", "east 12", "south 18", "south-east 18", "east 18"]);
    // three spot tries before the first move and after every move but the last, whose spot try succeeds
    let i = 0;
    const run = () => { let n = 0; while (seq[i]?.t === "spot") { n++; i++; } return n; };
    expect(run()).toBe(3);
    for (let k = 0; k < moves.length; k++) {
      expect(seq[i++]!.t).toBe("move");
      const n = run();
      if (k < moves.length - 1) expect(n).toBe(3);
      else expect(n).toBeGreaterThanOrEqual(1);
    }
    // the south-east move is 6 along the diagonal (true length 6)
    const se = moves[1]!;
    expect(Math.hypot(se.to[0] - 368, se.to[1] - 558)).toBeCloseTo(6, 9);
    expect(S.placed.get("m1")!.at).toEqual([386, 558]);
  });

  it("never moves a locked building: a pad hidden only by a locked one is left hidden", () => {
    const S = state([core(["core", "m1"]), machine("m1", 0)]);
    S.place("core", CORE_AT, 0); S.place("m1", [368, 558], 0); S.locked = 0;
    S.repair(S.by.get("core")!.pads[0]!);
    expect(S.placed.get("m1")!.at).toEqual([368, 558]);
    expect(S.trace.some((t) => t.t === "unresolved")).toBe(true);
  });

  it("rejects the seed when a push takes the blocker off the map", () => {
    const S = state([core(["core", "m1"]), machine("m1")]);
    S.place("core", CORE_AT, 0); S.locked = 0; S.place("m1", [368, 558], 1);
    const small = new WfState({ buildings: [core(["core", "m1"]), machine("m1")], map: { w: 480, h: 630 } }, { step: 6, trace: true, maxRepairs: 50 });
    small.place("core", CORE_AT, 0); small.locked = 0; small.place("m1", [368, 558], 1);
    expect(small.repair(small.by.get("core")!.pads[0]!)).toBeNull();
    expect(small.rejected).toEqual({ id: "m1", kind: "conv.food_processor", pad: "hire_core" });
    expect(S.repair(S.by.get("core")!.pads[0]!)).not.toBeNull();
  });
});

describe("wavefront placement", () => {
  it("groups linked buildings into the earliest one's wavefront", () => {
    const ws = wavefronts([{ ...machine("a", 0) }, { ...machine("b", 2), links: ["c"] }, { ...machine("c", 1) }]);
    expect(ws.map((w) => w.map((b) => b.id))).toEqual([["a"], ["b", "c"]]);
  });

  it("is deterministic for a seed, places later wavefronts no farther north-west, and leaves every pad visible here", () => {
    const bs: WfBuilding[] = [core(["core", "m1", "m2"]), { ...machine("m1"), pads: [{ id: "p1", coexist: ["core", "m1", "m2"], ignore: ["m1"] }] }, { ...machine("m2", 2), pads: [{ id: "p2", coexist: ["core", "m1", "m2"], ignore: ["m2"] }] }];
    for (const siteChecks of [true, false]) {
      const a = placeWavefront({ buildings: bs, map: MAP }, { seed: 7, siteChecks }), b = placeWavefront({ buildings: bs, map: MAP }, { seed: 7, siteChecks });
      expect(a).toEqual(b);
      expect(a.rejected).toBeNull();
      const d = (id: string) => a.positions[id]![0] + a.positions[id]![1];
      expect(d("m1")).toBeGreaterThanOrEqual(d("core") - 1e-9);
      expect(d("m2")).toBeGreaterThanOrEqual(d("m1") - 1e-9);
      expect(a.stats.hiddenPads).toBe(0);
    }
  });
});

describe("salvage piles, rockfall pads, repair option (Doug 2026-11-16)", () => {
  const pile = (id: string): WfBuilding => ({ id, kind: "node.salvage_pile", footprint: FP["node.salvage_pile"]!, occ: tallestShape("node.salvage_pile"), appear: 0, pads: [] });
  const rock: WfBuilding = { id: "rock", kind: "zone.blocked", footprint: [-60, -35, 60, 35], occ: null, appear: 1, side: "settlement", pads: [{ id: "clear0", coexist: ["core", "rock"], ignore: ["rock"] }] };
  const big = { w: 480, h: 900 };

  it("places every salvage pile first, at the north-west edge, locked and never pushed", () => {
    const bs: WfBuilding[] = [core(["core", "m1", "p1", "p2"]), machine("m1"), pile("p1"), pile("p2")];
    for (const siteChecks of [true, false]) {
      const r = placeWavefront({ buildings: bs, map: big }, { seed: 3, siteChecks, trace: true });
      expect(r.rejected).toBeNull();
      const places = r.trace.filter((t) => t.t === "place").map((t) => (t as Extract<TraceStep, { t: "place" }>).id);
      expect(places.slice(0, 2)).toEqual(["p1", "p2"]);
      const d = (id: string) => r.positions[id]![0] + r.positions[id]![1];
      for (const id of ["core", "m1"]) expect(d("p1")).toBeLessThan(d(id));
      expect(d("p1")).toBeLessThanOrEqual(d("p2"));
      // a pile stands against the corner: its footprint touches x = 0 or y = 0
      const f = FP["node.salvage_pile"]!;
      expect(Math.min(r.positions["p1"]![0] + f[0], r.positions["p1"]![1] + f[1])).toBeLessThan(6);
      expect(r.trace.some((t) => t.t === "move" && (t.id === "p1" || t.id === "p2"))).toBe(false);
    }
  });

  it("puts a rockfall's clear pad right beside it on the settlement side; the rockfall hides nothing", () => {
    const bs: WfBuilding[] = [core(["core", "rock"]), rock];
    // with the site checks on the pad is on the near side and visible past the locked Core
    const r = placeWavefront({ buildings: bs, map: big }, { seed: 5, siteChecks: true });
    expect(r.rejected).toBeNull();
    expect(r.stats.hiddenPads).toBe(0);
    const at = r.positions["rock"]!, c = r.positions["core"]!, pad = r.padSpots["rock"]!.at;
    expect(Math.hypot(pad[0] - c[0], pad[1] - c[1])).toBeLessThan(Math.hypot(at[0] - c[0], at[1] - c[1]) + 60);
    // adjacent: the pad box sits against the rockfall's footprint edge, never on it
    const dx = Math.max(Math.abs(pad[0] - at[0]) - 60, 0), dy = Math.max(Math.abs(pad[1] - at[1]) - 35, 0);
    expect(Math.hypot(dx, dy)).toBeLessThan(40);
    expect(Math.abs(pad[0] - at[0]) > 60 || Math.abs(pad[1] - at[1]) > 35).toBe(true);
    expect(placeWavefront({ buildings: bs, map: big }, { seed: 5, siteChecks: false }).rejected).toBeNull();
  });

  it("repair 'fallback' skips the repair when a site passed; 'always' gives the same layout when nothing is hidden", () => {
    const bs: WfBuilding[] = [core(["core", "m1"]), machine("m1")];
    const a = placeWavefront({ buildings: bs, map: big }, { seed: 9, siteChecks: true, repair: "always" });
    const f = placeWavefront({ buildings: bs, map: big }, { seed: 9, siteChecks: true, repair: "fallback" });
    expect(f.positions).toEqual(a.positions);
    expect(f.stats.repairs).toBe(0);
    expect(f.stats.hiddenPads).toBe(0);
    // checks off: the fallback option behaves like 'always'
    const o1 = placeWavefront({ buildings: bs, map: big }, { seed: 9, siteChecks: false, repair: "always" });
    const o2 = placeWavefront({ buildings: bs, map: big }, { seed: 9, siteChecks: false, repair: "fallback" });
    expect(o2).toEqual(o1);
  });
});
