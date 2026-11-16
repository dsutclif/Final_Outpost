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
