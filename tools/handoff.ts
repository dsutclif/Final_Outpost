// Places the crash site in story levels 1-5 exactly as crash_open's last frame shows it. Reads the film's set
// (blender -b --factory-startup -P tools/cinematics/crash.py -- --shot 4 --export tools/cinematics/out/handoff_set.json)
// and rewrites the decor entities by id: positions about the commander's landing spot at the game's scale
// (the hero's 1.5 art m against the film commander's 1.8 m), so level 1 opens on the film's frame.
// Levels 2-5 keep the group where level 1 has it relative to the reactor; each lid keeps its level's roll.
// vite-node tools/handoff.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SET = JSON.parse(readFileSync(resolve(ROOT, "tools/cinematics/out/handoff_set.json"), "utf8")) as {
  end: number[]; objs: Record<string, { m: number[][]; llo?: number[]; lhi?: number[] }>;
};
const MESHY = JSON.parse(readFileSync(resolve(ROOT, "packages/render-3d/src/assets/meshy.json"), "utf8")) as { models: { id: string; width?: number; kind?: string }[] };
const ART_M = 28;
/** World units per film metre: the hero (1.5 art m) stands as tall as the film's 1.8 m commander. */
const S = (ART_M * 1.5) / 1.8;
const START: [number, number] = [720, 320]; // level 1's start, where the film's commander lands
const [EX, EY] = SET.end as [number, number];
const r2 = (v: number): number => Math.round(v * 10) / 10, r3 = (v: number): number => Math.round(v * 1000) / 1000;
const obj = (n: string) => { const o = SET.objs[n]; if (!o) throw new Error(`film object ${n} missing`); return o; };

type M3 = number[][];
const mul = (a: M3, b: M3): M3 => a.map((r) => b[0]!.map((_, j) => r.reduce((s, v, k) => s + v * b[k]![j]!, 0)));
const lin = (m: number[][]): M3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => m[i]![j]!));
const apply = (m: number[][], p: number[]): number[] => [0, 1, 2].map((i) => m[i]![0]! * p[0]! + m[i]![1]! * p[1]! + m[i]![2]! * p[2]! + m[i]![3]!);
// blender (x, y, z up) <-> three (x, y up, z): three = (x, z, -y)
const C: M3 = [[1, 0, 0], [0, 0, 1], [0, -1, 0]], CI: M3 = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
const rotX = (deg: number): number[][] => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]]; };
const mul4 = (a: number[][], b: number[][]): number[][] => a.map((r) => b[0]!.map((_, j) => r.reduce((s, v, k) => s + v * b[k]![j]!, 0)));
/** A film world point to level 1's ground (x, y) and height, in world units. */
const toGame = (p: number[]): { at: [number, number]; lift: number } => ({ at: [START[0] + (p[0]! - EX) * S, START[1] - (p[1]! - EY) * S], lift: p[2]! * S });

/**
 * A model instance: `m` is the world matrix of the frame its source GLB is authored in, `lo`/`hi` that source's
 * bounds (the model build stands it on its ground centre). Returns at/lift/yaw/roll/scale for placeStoryDecor.
 */
function model(id: string, m: number[][], lo: number[], hi: number[]) {
  const width = MESHY.models.find((e) => e.id === id && e.kind === "decor")?.width ?? MESHY.models.find((e) => e.id === id)?.width;
  if (!width) throw new Error(`no width for ${id}`);
  const centre = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, lo[2]!];
  const g = mul(mul(C, lin(m)), CI);
  const k = Math.cbrt(Math.abs(g[0]![0]! * (g[1]![1]! * g[2]![2]! - g[1]![2]! * g[2]![1]!) - g[0]![1]! * (g[1]![0]! * g[2]![2]! - g[1]![2]! * g[2]![0]!) + g[0]![2]! * (g[1]![0]! * g[2]![1]! - g[1]![1]! * g[2]![0]!)));
  const R = g.map((r) => r.map((v) => v / k));
  if (Math.abs(R[1]![0]!) > 1e-3) throw new Error(`${id}: tilted sideways, the renderer can't draw that`);
  const yaw = (Math.atan2(-R[2]![0]!, R[0]![0]!) * 180) / Math.PI, roll = (Math.atan2(-R[1]![2]!, R[1]![1]!) * 180) / Math.PI;
  const { at, lift } = toGame(apply(m, centre));
  const maxdim = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!);
  // the renderer scales the built model to `width` art metres across its widest side
  const scale = (k * S) / ((ART_M * width) / maxdim);
  return { at: [r2(at[0]), r2(at[1])], yaw: r2(yaw), lift: r2(lift), ...(Math.abs(roll) > 0.05 ? { roll: r2(roll) } : {}), scale: r3(scale) };
}

/** A code-built deck plate from the film's scaled cube (unit cube about its centre). */
function plate(name: string) {
  const m = obj(name).m, col = (j: number) => [m[0]![j]!, m[1]![j]!, m[2]![j]!], len = (v: number[]) => Math.hypot(...v);
  const [w, d, h] = [len(col(0)) * S, len(col(1)) * S, len(col(2)) * S];
  const { at, lift } = toGame([m[0]![3]!, m[1]![3]!, m[2]![3]!]);
  return { at: [r2(at[0]), r2(at[1])], yaw: r2((Math.atan2(col(0)[1]!, col(0)[0]!) * 180) / Math.PI), size: [r3(w), r3(d), r3(h)], lift: r3(lift - h / 2) };
}

const POD = obj("Stasis Pod (crash film).glb"), GLASS = obj("Stasis Pod Glass (crash film).glb");
const pods: [string, string][] = [["pod0", "Mesh_0.001"], ["pod1", "bay5"], ["pod2", "bay6"], ["pod3", "bay7"], ["pod4", "bay8"]];
/** The film's hinge for each pod (the commander's opens to 118 degrees by the last frame, the rest are shut). */
const hinges: [string, string, number][] = [["lid0", "pod_hinge", 118], ["lid1", "pod_hinge.001", 0], ["lid2", "pod_hinge.002", 0], ["lid3", "pod_hinge.003", 0], ["lid4", "pod_hinge.004", 0]];
const body = (n: string, id: string) => { const o = obj(n); return model(id, o.m, o.llo!, o.lhi!); };

function level1(roll: Record<string, number>): Record<string, Record<string, unknown>> {
  const w = obj("Mesh_0");
  const out: Record<string, Record<string, unknown>> = {
    wreck: model("decor.halcyon_wreck", w.m, w.llo!, w.lhi!),
    // crash.py panel_steel: Brick texture at scale 0.8 on object coords, so 1.6 x 3.2 plates whatever the size
    deck: { ...plate("deck"), panels: [1.6, 3.2] }, deck2: { ...plate("deck_ext"), panels: [1.6, 3.2] }, stripe: { ...plate("Cube"), color: "#c8a23a" },
    oreDecor1: body("body.002", "decor.ore_pile"), oreDecor2: body("body.003", "decor.ore_pile"), oreDecor3: body("body.004", "decor.ore_pile"),
    scrap: body("body", "decor.ship_scrap"), scrap2: body("body.001", "decor.ship_scrap"),
  };
  for (const [id, n] of pods) out[id] = model("decor.stasis_pod", obj(n).m, POD.llo!, POD.lhi!);
  for (const [id, n, filmDeg] of hinges) {
    const m = mul4(obj(n).m, rotX((roll[id] ?? filmDeg) - filmDeg));
    out[id] = model("decor.stasis_glass", m, GLASS.llo!, GLASS.lhi!);
  }
  return out;
}

const TYPES: Record<string, string> = { scrap2: "decor.ship_scrap" };
for (let n = 1; n <= 5; n++) {
  const path = resolve(ROOT, `levels/story/story-L00${n}.json`);
  const lv = JSON.parse(readFileSync(path, "utf8")) as { entities: Record<string, unknown>[] };
  const core = lv.entities.find((e) => e.type === "sink.core")!.at as number[];
  const dx = core[0]! - 220, dy = core[1]! - 320; // level 1's reactor
  // a lid's roll is its level's (bay 5 stands open after level 2); the film's hinge angle otherwise
  const roll: Record<string, number> = {};
  for (const e of lv.entities) if (typeof e.id === "string" && e.id.startsWith("lid")) roll[e.id] = (e.roll as number | undefined) ?? 0;
  const place = level1(roll);
  const wreckWas = lv.entities.find((e) => e.id === "wreck")?.at as number[] | undefined;
  for (const [id, p] of Object.entries(place)) {
    const at = p.at as number[], moved = { ...p, at: [r2(at[0]! + dx), r2(at[1]! + dy)] };
    const i = lv.entities.findIndex((e) => e.id === id);
    if (i >= 0) {
      const { at: _a, yaw: _y, lift: _l, roll: _r, scale: _s, size: _z, ...keep } = lv.entities[i]!;
      lv.entities[i] = { type: keep.type, id, ...moved, ...Object.fromEntries(Object.entries(keep).filter(([k]) => k !== "type" && k !== "id")) };
    } else {
      const after = lv.entities.findIndex((e) => e.id === "scrap");
      lv.entities.splice(after + 1, 0, { type: TYPES[id], id, ...moved });
    }
  }
  // the flight recorder is lodged in the hull, so it moves with the wreck
  const wreckNow = place.wreck!.at as number[];
  for (const e of lv.entities) {
    if (wreckWas && typeof e.type === "string" && e.type.startsWith("capture.") && e.drop) {
      const a = e.at as number[];
      e.at = [r2(a[0]! + wreckNow[0]! + dx - wreckWas[0]!), r2(a[1]! + wreckNow[1]! + dy - wreckWas[1]!)];
    }
  }
  writeFileSync(path, JSON.stringify(lv, null, 1) + "\n");
  console.log(`story-L00${n}: crash site placed (offset ${dx}, ${dy})`);
}
