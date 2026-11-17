import { describe, expect, it } from "vitest";
import gen from "../data/generator.json";
import { ROCK_SQUARE, WALL_HALF, WfState, gateRockSquares, gateSidesOf, gateStrip, placeGateRock, placeWavefront, scrapShape, scrapStrip, spotsOf, tallestShape, wallStrip, wavefronts, type TraceStep, type WfBuilding } from "../src/wavefront.js";
import { occluders, viewOf } from "../src/viewVisibility.js";

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
      const r = placeWavefront({ buildings: bs, map: big }, { seed: 3, siteChecks, trace: true, scrap: "nw-first" });
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

describe("side-by-side pads (Doug 2026-11-16)", () => {
  const two = (): WfBuilding => ({ ...core(["core"]), pads: [
    { id: "a", coexist: ["core"], overlaps: ["b"] }, { id: "b", coexist: ["core"], overlaps: ["a"] }, { id: "c", coexist: ["core"] },
  ] });
  it("pads live one after another share a spot; pads live together take the next spot in order", () => {
    const S = state([two()]);
    expect([...S.slot]).toEqual([["a", 0], ["b", 1], ["c", 0]]);
    expect(S.slots.get("core")).toBe(2);
    S.place("core", CORE_AT, 0);
    expect(S.placed.get("core")!.spots).toEqual([0, 1]);
    const [pa, pb, pc] = ["a", "b", "c"].map((id) => S.padAt(S.by.get("core")!.pads.find((p) => p.id === id)!));
    expect(pc).toEqual(pa);
    expect(pb).not.toEqual(pa);
  });
  it("places the two on different, visible spots", () => {
    for (const siteChecks of [true, false]) {
      const bs: WfBuilding[] = [{ ...two(), pads: two().pads.map((p) => ({ ...p, coexist: ["core", "m1"] })) }, machine("m1")];
      const r = placeWavefront({ buildings: bs, map: MAP }, { seed: 4, siteChecks });
      expect(r.rejected).toBeNull();
      expect(r.padAt["a"]).toEqual(r.padAt["c"]);
      expect(r.padAt["b"]).not.toEqual(r.padAt["a"]);
      expect(r.stats.hiddenPads).toBe(0);
      expect(r.stats.sidePads).toBe(1);
    }
  });
  it("the repair solves a hidden pad on its own slot and leaves both slots on different spots", () => {
    const S = state([{ ...two(), pads: two().pads.map((p) => ({ ...p, coexist: ["core", "m1"] })) }, machine("m1")]);
    S.place("core", CORE_AT, 0); S.locked = 0; S.place("m1", [300, 602], 1);
    for (const pad of S.hiddenPads()) S.repair(pad);
    expect(S.hiddenPads()).toEqual([]);
    expect(new Set(S.placed.get("core")!.spots).size).toBe(2);
  });
});

describe("walls, medic pad and scrap (Doug 2026-11-16)", () => {
  const BIG = { w: 1200, h: 1620 };
  const spec = { dims: [330, 450] as [number, number], split: [5, 5] as [number, number], gateSides: ["s", "e"] as ("s" | "e")[] };
  const pile = (id: string, variant: number): WfBuilding => ({ id, kind: "node.salvage_pile", footprint: FP["node.salvage_pile"]!, occ: scrapShape(variant), appear: 0, variant, pads: [] });
  const level = (): WfBuilding[] => [core(["core", "m1"]), { ...machine("m1"), pads: [{ id: "p1", coexist: ["core", "m1"], ignore: ["m1"] }] }];
  const R = 10.8;

  it("the wall strip is measured from occluders.json and a gate hides further than a wall", () => {
    const ws = wallStrip(), gs = gateStrip();
    expect(ws.s).toBeCloseTo(ws.e, 0);
    expect(ws.s).toBeGreaterThan(40);
    expect(ws.s).toBeLessThan(90);
    expect(gs.s).toBeGreaterThan(ws.s);
    // the strip is where the renderer's own test stops hiding: a pad just past it is visible, just inside it is hidden
    const wo = occluders([{ type: "barrier.line", id: "r", points: [[0, 0], [400, 0], [400, 300], [0, 300]], closed: true, gates: [], prebuilt: [0, 1, 2, 3] } as never], { final: true });
    expect(viewOf("p", "pad", [200, 300 - ws.s - R - 1], wo).hidden).toBe(0);
    expect(viewOf("p", "pad", [200, 300 - ws.s + 6], wo).hidden).toBeGreaterThan(0);
  });

  it("fits the south and east lines a strip beyond the furthest pad and the north and west lines at normal clearance; every pad visible", () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = placeWavefront({ buildings: level(), map: BIG, walls: { ...spec, gateSides: ["s"] } }, { seed, siteChecks: true });
      expect(r.rejected).toBeNull();
      const w = r.walls!, pads = Object.values(r.padAt), strip = wallStrip(), gs = gateStrip();
      expect(w.rect[3]).toBeGreaterThanOrEqual(Math.max(...pads.map((p) => p[1])) + R + gs.s - 1);
      expect(w.rect[2]).toBeGreaterThanOrEqual(Math.max(...pads.map((p) => p[0])) + R + gs.e - 1);
      for (const id of ["core", "m1"]) {
        const f = FP[id === "core" ? "sink.core" : "conv.food_processor"]!, at = r.positions[id]!;
        expect(at[0] + f[0]).toBeGreaterThanOrEqual(w.rect[0] + WALL_HALF);
        expect(at[1] + f[1]).toBeGreaterThanOrEqual(w.rect[1] + WALL_HALF);
      }
      expect(w.strip).toEqual(strip);
      expect(w.gates).toHaveLength(1);
      expect(w.side[w.gates[0]!]).toBe("s");
      expect(r.stats.hiddenPads).toBe(0);
    }
  });

  it("rejects the seed when the ring does not fit the map", () => {
    const r = placeWavefront({ buildings: level(), map: { w: 330, h: 900 }, walls: spec }, { seed: 1, siteChecks: true, trace: true });
    expect(r.rejected).toEqual({ id: "ring", kind: "barrier.line", pad: "" });
    expect(r.walls).toBeNull();
  });

  it("puts the medic pad outside the settlement: beside the first gate outside the wall, or past the south edge with no walls; never in the Core's stack", () => {
    const medic = { id: "medic_hire", coexist: ["core", "m1"] };
    for (const seed of [1, 2, 3]) {
      const a = placeWavefront({ buildings: level(), map: BIG, walls: spec, medic }, { seed, siteChecks: true });
      expect(a.rejected).toBeNull();
      const m = a.medic!, rc = a.walls!.rect, g = WALL_HALF + 4;
      expect(m[0] < rc[0] - g || m[0] > rc[2] + g || m[1] < rc[1] - g || m[1] > rc[3] + g).toBe(true);
      expect(a.padAt["medic_hire"]).toEqual(m);
      expect(a.stats.hiddenPads).toBe(0);
      const b = placeWavefront({ buildings: level(), map: BIG, medic }, { seed, siteChecks: true });
      const south = Math.max(...Object.entries(b.positions).map(([id, p]) => p[1] + FP[id === "core" ? "sink.core" : "conv.food_processor"]![3]));
      expect(b.medic![1]).toBeGreaterThan(south);
      expect(b.stats.hiddenPads).toBe(0);
    }
  });

  it("scatters scrap outside the walls within the walking range of a gate, clear of walls, gates and each other; tall heaps only north and west", () => {
    const bs = [...level(), pile("s1", 1), pile("s2", 2), pile("s3", 3)];
    for (const seed of [1, 2, 3, 4, 5]) {
      const range: [number, number] = [150, 450];
      const r = placeWavefront({ buildings: bs, map: BIG, walls: spec }, { seed, siteChecks: true, scrapRange: range, trace: true });
      expect(r.rejected).toBeNull();
      const w = r.walls!, g = WALL_HALF + 4, gates = w.gates.map((i) => { const a = w.points[i]!, b = w.points[(i + 1) % w.points.length]!; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
      const boxes: [number, number, number, number][] = [];
      for (const id of ["s1", "s2", "s3"]) {
        const at = r.positions[id]!, f = FP["node.salvage_pile"]!, bx: [number, number, number, number] = [at[0] + f[0], at[1] + f[1], at[0] + f[2], at[1] + f[3]];
        expect(bx[0] < w.rect[2] + g && w.rect[0] - g < bx[2] && bx[1] < w.rect[3] + g && w.rect[1] - g < bx[3]).toBe(false);
        const sc = r.trace.find((t) => t.t === "scrap" && t.id === id) as Extract<TraceStep, { t: "scrap" }>;
        const d = Math.min(...gates.map((q) => Math.hypot(at[0] - q[0]!, at[1] - q[1]!)));
        if (!sc.relaxed) { expect(d).toBeGreaterThanOrEqual(range[0]); expect(d).toBeLessThanOrEqual(range[1]); }
        if (id !== "s2") expect(["n", "w"]).toContain(r.scrap[id]!.side);
        for (const o of boxes) expect(bx[0] < o[2] && o[0] < bx[2] && bx[1] < o[3] && o[1] < bx[3]).toBe(false);
        boxes.push(bx);
      }
      expect(r.stats.hiddenPads).toBe(0);
    }
  });

  it("the fuselage tube (scrap variant 3) and the ship scrap hide further than a wall, the scrap field is flat", () => {
    const wall = wallStrip().s - WALL_HALF;
    expect(scrapStrip(3).s).toBeGreaterThan(wall);
    expect(scrapStrip(1).s).toBeGreaterThan(scrapStrip(3).s);
    expect(scrapShape(2)).toBeNull();
    expect(scrapStrip(2)).toEqual({ s: 0, e: 0 });
  });

  it("the walking range is a knob: a farther range puts the heaps farther from the gate", () => {
    const bs = [...level(), pile("s2", 2), pile("s2b", 2)];
    const mean = (range: [number, number]) => {
      const ds: number[] = [];
      for (const seed of [1, 2, 3]) {
        const r = placeWavefront({ buildings: bs, map: BIG, walls: spec }, { seed, siteChecks: true, scrapRange: range });
        const w = r.walls!, g = w.gates.map((i) => w.points[i]!);
        for (const id of ["s2", "s2b"]) ds.push(Math.min(...g.map((q) => Math.hypot(r.positions[id]![0] - q[0], r.positions[id]![1] - q[1]))));
      }
      return ds.reduce((a, b) => a + b, 0) / ds.length;
    };
    expect(mean([450, 700])).toBeGreaterThan(mean([150, 300]) + 100);
  });
});

describe("ring fit, gate sides and the gate rockfall (outpost-ops#202, Doug 2026-11-16)", () => {
  const MAP = { w: 1200, h: 1620 };
  const spec = { dims: [900, 1200] as [number, number], split: [3, 3] as [number, number], gateSides: ["n"] as ("n" | "e" | "s" | "w")[] };
  const rock = (): WfBuilding => ({ id: "pass", kind: "zone.blocked", footprint: [-240, -22, 240, 22], occ: null, appear: 1, pads: [{ id: "clear_pass", coexist: ["core"] }], side: "settlement", gateRock: true });
  const level = (): WfBuilding[] => [core(["core"]), rock()];

  it("fits the settlement only: a big shipped ring size is not a minimum", () => {
    const r = placeWavefront({ buildings: level(), map: MAP, walls: spec }, { seed: 1, siteChecks: true });
    expect(r.rejected).toBeNull();
    const w = r.walls!;
    expect(w.rect[2] - w.rect[0]).toBeLessThan(500);
    expect(w.rect[3] - w.rect[1]).toBeLessThan(500);
  });

  it("moves gates to the south and east sides only (north to south, west to east, south first)", () => {
    expect(gateSidesOf(["n"])).toEqual(["s"]);
    expect(gateSidesOf(["w", "n"])).toEqual(["s", "e"]);
    expect(gateSidesOf(["e", "s"])).toEqual(["s", "e"]);
    expect(gateSidesOf([])).toEqual(["s"]);
    const r = placeWavefront({ buildings: level(), map: MAP, walls: { ...spec, gateSides: ["n", "w"] } }, { seed: 2, siteChecks: true });
    expect(r.walls!.gates.map((i) => r.walls!.side[i])).toEqual(["s", "e"]);
  });

  it("puts the rockfall outside the south gate, gate-width, with one clear pad per square between gate and rockfall, all visible", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = placeWavefront({ buildings: level(), map: MAP, walls: spec }, { seed, siteChecks: true });
      expect(r.rejected).toBeNull();
      const w = r.walls!, k = r.rock["pass"]!, n = gateRockSquares(), gi = w.gates.find((i) => w.side[i] === "s")!;
      const a = w.points[gi]!, b = w.points[(gi + 1) % w.points.length]!, gx = (a[0] + b[0]) / 2;
      expect(k.side).toBe("s");
      expect(k.pads).toHaveLength(n);
      expect(Math.abs(k.rect[2] - k.rect[0] - n * ROCK_SQUARE)).toBeLessThanOrEqual(1);
      expect(Math.abs((k.rect[0] + k.rect[2]) / 2 - gx)).toBeLessThanOrEqual(1);
      // the pads sit between the wall and the rockfall, touching its gate-facing (north) edge and outside the wall
      for (const p of k.pads) {
        expect(Math.abs(p[1] + ROCK_SQUARE / 2 - k.rect[1])).toBeLessThanOrEqual(1);
        expect(p[1] - ROCK_SQUARE / 2).toBeGreaterThan(w.rect[3] + WALL_HALF);
      }
      expect(r.padAt["clear_pass"]).toEqual(k.pads[0]);
      // flat: no occluder, nothing hidden
      expect(r.stats.hiddenPads).toBe(0);
    }
  });

  it("falls to the east gate when the south one has no room on the map", () => {
    // a ring whose south line is 20 above the map edge: no room for pads and rockfall below it; the east side has room
    const S = new WfState({ buildings: [rock()], map: { w: 1200, h: 800 } }, { step: 6, trace: false, maxRepairs: 10 });
    const walls = { rect: [100, 100, 500, 780] as [number, number, number, number], points: [[100, 100], [500, 100], [500, 780], [100, 780]] as [number, number][], side: ["n", "e", "s", "w"] as ("n" | "e" | "s" | "w")[], gates: [2, 1], strip: wallStrip() };
    const k = placeGateRock(S, rock(), walls)!;
    expect(k.side).toBe("e");
    expect(k.pads).toHaveLength(gateRockSquares());
    // the pads touch the west edge of the rockfall, east of the wall
    for (const p of k.pads) { expect(Math.abs(p[0] + ROCK_SQUARE / 2 - k.rect[0])).toBeLessThanOrEqual(1); expect(p[0] - ROCK_SQUARE / 2).toBeGreaterThan(500 + WALL_HALF); }
  });

  it("an unwalled level keeps the rockfall in the wavefront with its pad beside it", () => {
    const r = placeWavefront({ buildings: level(), map: MAP }, { seed: 1, siteChecks: true });
    expect(r.rejected).toBeNull();
    expect(Object.keys(r.rock)).toHaveLength(0);
    expect(r.positions["pass"]).toBeDefined();
    expect(r.padAt["clear_pass"]).toBeDefined();
  });
});
