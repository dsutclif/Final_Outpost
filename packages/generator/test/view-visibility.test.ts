import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PITCH_DEG, YAW_DEG } from "@fo/render-3d/units";
import { SIGHT, occluders, padVisibility, padVisibilityReport, viewOf, type ViewEnt } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
// Levels whose pads were moved after the renderer fixture was recorded keep their recorded layout in fixtures/pad-visibility-levels.
const FIX = fileURLToPath(new URL("./fixtures/pad-visibility-levels/", import.meta.url));
const level = (id: string): { id: string; entities: ViewEnt[] } => JSON.parse(readFileSync(existsSync(`${FIX}${id}.json`) ? `${FIX}${id}.json` : `${root}levels/packs/s1/${id}.json`, "utf8"));
type Truth = Record<string, { id: string; class: string; hiddenFraction: number; by: string[] }[]>;
// What the running renderer says for every pad of every pack level: tools/review/pad-visibility.cjs (its own padsBehind test
// on 17 points over the pad disc), with the models loaded. Remake with that tool after a model or scale change.
const truth = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/pad-visibility-renderer.json", import.meta.url)), "utf8")) as { levels: Truth };

describe("the shared on-screen visibility measurement", () => {
  it("uses the game's own camera", () => {
    expect(YAW_DEG).toBe(45);
    expect(PITCH_DEG).toBe(30);
    expect(SIGHT.ux).toBeCloseTo(Math.SQRT1_2, 9);
    expect(SIGHT.uz).toBeCloseTo(Math.SQRT1_2, 9);
    expect(SIGHT.slope).toBeCloseTo(Math.tan(Math.PI / 6), 9);
  });

  it("agrees with the renderer on every pad of Levels 14, 25, 30, 38, 49 and 58", () => {
    for (const n of [14, 25, 30, 38, 49, 58]) {
      const id = `s1-L${String(n).padStart(3, "0")}`;
      const mine = padVisibility(level(id).entities);
      const gt = truth.levels[id]!;
      expect(gt.length, id).toBeGreaterThan(0);
      for (const p of gt) {
        const m = mine.find((q) => q.id === p.id)!;
        expect(m, `${id} ${p.id}`).toBeDefined();
        expect(m.class, `Level ${n} pad ${p.id}`).toBe(p.class);
        expect(Math.abs(m.hidden - p.hiddenFraction), `Level ${n} pad ${p.id}`).toBeLessThanOrEqual(0.07);
        if (p.by.length) expect(m.by, `Level ${n} pad ${p.id}`).toBe(p.by[0]);
      }
    }
  });

  it("agrees with the renderer on nearly every pad of every pack level, and names the same main occluder", () => {
    let n = 0, sameClass = 0, close = 0, sameBy = 0, byN = 0;
    const off: string[] = [];
    for (const id of Object.keys(truth.levels)) {
      const mine = padVisibility(level(id).entities);
      for (const p of truth.levels[id]!) {
        const m = mine.find((q) => q.id === p.id);
        if (!m) { off.push(`${id} ${p.id} missing`); continue; }
        n++;
        if (m.class === p.class) sameClass++; else off.push(`${id} ${p.id}: renderer ${p.class} ${p.hiddenFraction}, here ${m.class} ${m.hidden}`);
        if (Math.abs(m.hidden - p.hiddenFraction) <= 0.07) close++;
        if (p.by.length && m.by) { byN++; if (m.by === p.by[0]) sameBy++; }
      }
    }
    expect(n).toBeGreaterThan(500);
    expect(sameClass / n, off.join("\n")).toBeGreaterThanOrEqual(0.99);
    expect(close / n).toBeGreaterThanOrEqual(0.98);
    expect(sameBy / byN).toBeGreaterThanOrEqual(0.95);
  });

  it("Level 25: the builder's positions (185,630) and (185,611) are hidden behind the shop, (175,710) is in view", () => {
    const ents = level("s1-L025").entities.filter((e) => !e.type.startsWith("pad."));
    const occs = occluders(ents);
    const a = viewOf("a", "pad.hire", [185, 630], occs), b = viewOf("b", "pad.hire", [185, 611], occs), c = viewOf("c", "pad.hire", [175, 710], occs);
    expect(a.class).toBe("hidden"); expect(a.by).toBe("sink.sales_point");
    expect(b.class).toBe("hidden"); expect(b.by).toBe("sink.sales_point");
    expect(c.class).toBe("visible"); expect(c.visible).toBe(1);
  });

  it("the hidden region runs diagonally to the north-west of a building, not due north", () => {
    const shop: ViewEnt[] = [{ type: "sink.sales_point", id: "shop", at: [400, 400] }];
    const occs = occluders(shop);
    const at = (x: number, y: number) => viewOf("p", "pad.hire", [x, y], occs).class;
    expect(at(400, 400 - 25)).toBe("hidden");        // just north, inside what the old band covered
    expect(at(400 - 70, 400 - 70)).toBe("hidden");   // far to the north-west: the old rule missed this
    expect(at(400, 400 - 130)).toBe("visible");      // due north beyond the reach (the old band: 30 units)
    expect(at(400 + 80, 400 - 80)).toBe("visible");  // north-east is out of the sight line
  });
});

describe("walls and resource nodes as occluders", () => {
  const wall = (points: [number, number][], extra: Partial<ViewEnt> = {}): ViewEnt => ({ type: "barrier.line", id: "ring", points, prebuilt: points.map((_, i) => i), ...extra });

  it("a long wall section is laid as panels end to end, and a corner joins two sections", () => {
    const one = occluders([wall([[0, 100], [200, 100]])]).filter((o) => o.name === "wall");
    // 200 units of Meshy panel (2.92 art units x 28 wide) is two panels of 100, each from its own centre
    expect(one.length).toBe(2);
    expect(one.map((o) => o.bx)).toEqual([50, 150]);
    const corner = occluders([wall([[0, 100], [100, 100], [100, 200]])]).filter((o) => o.name === "wall");
    expect(corner.length).toBeGreaterThanOrEqual(2);
    // a pad behind the first section's far end is hidden; a pad north-west of the second section only by that section
    const occs = occluders([wall([[0, 100], [100, 100], [100, 200]])]);
    expect(viewOf("j", "pad.hire", [95, 75], occs).class).not.toBe("visible");
    expect(viewOf("k", "pad.hire", [60, 150], occs).class).not.toBe("visible");
    expect(viewOf("m", "pad.hire", [300, 300], occs).class).toBe("visible");
  });

  it("only the sections built at the start are walls until the rest go up (walls: all)", () => {
    const e = wall([[0, 100], [100, 100], [200, 100]], { prebuilt: [0] });
    const pad = (opts?: { walls: "all" }) => viewOf("p", "pad.hire", [150, 70], occluders([e], opts)).class;
    expect(pad()).toBe("visible");
    expect(pad({ walls: "all" })).not.toBe("visible");
  });

  it("a gate in the line stands where the gate section is, with wall runs beside it when it is narrower than the section", () => {
    const e = wall([[0, 100], [300, 100]], { gates: [0] });
    const o = occluders([e]);
    expect(o.filter((x) => x.name === "struct.gate").length).toBe(1);
    expect(o.filter((x) => x.name === "wall").length).toBeGreaterThanOrEqual(2);
  });

  it("a resource node hides the ground north-west of it, a locked grow dome does not", () => {
    const node: ViewEnt = { type: "node.material_source", id: "ore", at: [300, 300] };
    const occs = occluders([node]);
    expect(viewOf("a", "pad.hire", [275, 275], occs).class).toBe("hidden");
    expect(viewOf("b", "pad.hire", [300, 380], occs).class).toBe("visible");
    expect(viewOf("c", "pad.hire", [380, 300], occs).class).toBe("visible");
    expect(occluders([{ type: "node.food_source", id: "dome", at: [300, 300], enabled: false }]).length).toBe(0);
    expect(occluders([{ type: "node.food_source", id: "dome", at: [300, 300] }]).length).toBe(1);
  });
});

describe("order independence and the built-out view", () => {
  it("gives the same answer whatever order levels are measured in (data, not a live render)", () => {
    const ids = Object.keys(truth.levels);
    const run = (order: string[]) => Object.fromEntries(order.map((id) => [id, padVisibility(level(id).entities)]));
    const fwd = run(ids), rev = run([...ids].reverse());
    expect(rev).toEqual(fwd);
    // Level 14 measured first or last: three hidden or partly hidden pad spots either way (the live audit saw seven when it was opened first)
    expect(fwd["s1-L014"]!.filter((p) => p.class !== "visible").length).toBe(rev["s1-L014"]!.filter((p) => p.class !== "visible").length);
  });

  it("final mode counts a building a pad will raise at its final size, not the building's own pad", () => {
    const ents: ViewEnt[] = [
      { type: "pad.build", id: "grill", at: [300, 300], build: "conv.food_processor" },
      { type: "pad.hire", id: "cook", at: [280, 280] },
      { type: "pad.hire", id: "far", at: [500, 500] },
    ];
    const now = padVisibility(ents), fin = padVisibility(ents, { final: true });
    expect(now.find((p) => p.id === "cook")!.class).toBe("visible");
    expect(fin.find((p) => p.id === "cook")!.class).not.toBe("visible");
    expect(fin.find((p) => p.id === "cook")!.by).toBe("conv.food_processor");
    expect(fin.find((p) => p.id === "grill")!.class).toBe("visible");
    expect(fin.find((p) => p.id === "far")!.class).toBe("visible");
  });

  it("the report carries hidden now and hidden once everything is built, and built-out is never better", () => {
    const r = padVisibilityReport(level("s1-L025").entities);
    expect(r.hiddenFinal + r.partlyFinal).toBeGreaterThanOrEqual(r.hidden + r.partly);
    expect(r.final.length).toBe(r.pads.length);
  });
});
