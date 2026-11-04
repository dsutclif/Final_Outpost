// Places the crash site in story levels 1-5 from Doug's final layout (docs/handoff/films-scenes.md, 2026-11-04), in
// metres about the reactor, so every level keeps the ship, pods and recorder where they are relative to its town.
// Sizes from docs/SCALE.md: wreck 27 m long, decor pods 2.66 m long with the base 0.80 m in the sand, no concrete pad,
// three pods (the commander's open, two sealed). Level 1 also takes Doug's ore spot and the ridge along the east edge
// (its town moves to fit them on the map); levels 2-5 keep their ore inside the camp wall.
// vite-node tools/relayout.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const M = 28;
// the layout, metres (x east, z south)
const L = {
  reactor: [-1.69, 16.19], wreck: [1.52, -1.88], wreckYaw: -18, pods: [[6.49, 6.37], [8.77, 6.37], [11.05, 6.37]],
  recorder: [14.67, -0.67], ore: [-8.35, 19.78],
  ridge: [[18, -15], [19.5, -6], [17, 3], [19, 12], [17.5, 19], [18.5, 25]],
};
const WRECK_SCALE = 0.833 * (27 / 50); // the wreck is 50 m long at scale 0.833
const POD_K = 2.66 / 3.9847, POD_SCALE = 0.833 * (2.66 / 3.32); // the pod build is 3.9847 m long; 3.32 m at 0.833
const POD_BASE = -0.8 * M, POD_YAW = -90;
const r1 = (v: number): number => Math.round(v * 10) / 10;
const rel = (p: number[]): [number, number] => [(p[0]! - L.reactor[0]!) * M, (p[1]! - L.reactor[1]!) * M];

type Ent = { id?: string; type: string; at?: number[]; rect?: number[]; points?: number[][]; [k: string]: unknown };
/** A pod-frame offset (metres in the pod's build, before its yaw) to world units, for yaw -90: local (x, z) -> (-z, x). */
const podOff = (x: number, z: number): [number, number] => [-z * POD_K * M, x * POD_K * M];

function apply(n: number, opts: { shift: [number, number]; ore: boolean; ridge: boolean; mapW?: number; openBay5: boolean }): void {
  const path = resolve(ROOT, `levels/story/story-L00${n}.json`);
  const lv = JSON.parse(readFileSync(path, "utf8")) as { start: number[]; map: { w: number; h: number }; entities: Ent[] };
  const [sx, sy] = opts.shift;
  const sh = (p: number[]): number[] => [r1(p[0]! + sx), r1(p[1]! + sy), ...p.slice(2)];
  if (sx || sy) {
    lv.start = sh(lv.start);
    for (const e of lv.entities) {
      if (e.at) e.at = sh(e.at);
      if (e.rect) e.rect = [r1(e.rect[0]! + sx), r1(e.rect[1]! + sy), e.rect[2]!, e.rect[3]!];
      if (e.points) e.points = e.points.map(sh);
      for (const k of ["site"] as const) if (Array.isArray(e[k])) e[k] = sh(e[k] as number[]);
    }
  }
  if (opts.mapW) lv.map.w = Math.max(lv.map.w, opts.mapW);
  const core = lv.entities.find((e) => e.id === "core")!.at!;
  const at = (p: number[]): number[] => { const d = rel(p); return [r1(core[0]! + d[0]), r1(core[1]! + d[1])]; };
  const byId = (id: string): Ent | undefined => lv.entities.find((e) => e.id === id);
  const oldPod0 = byId("pod0")!.at!.slice();
  // no concrete pad, two pods fewer, no film-set ore piles
  const drop = new Set(["deck", "deck2", "stripe", "pod3", "pod4", "lid3", "lid4", "oreDecor1", "oreDecor2", "oreDecor3"]);
  lv.entities = lv.entities.filter((e) => !drop.has(e.id ?? ""));
  const wreck = byId("wreck")!;
  Object.assign(wreck, { at: at(L.wreck), yaw: L.wreckYaw, scale: +WRECK_SCALE.toFixed(3) });
  // the pods: 0 the commander's (open), 1 Vale's bay 5 (open from level 3 on, after empty_bays), 2 sealed
  L.pods.forEach((p, i) => {
    const c = at(p);
    Object.assign(byId(`pod${i}`)!, { at: c, yaw: POD_YAW, lift: r1(POD_BASE), scale: +POD_SCALE.toFixed(4) });
    const open = i === 0 || (i === 1 && opts.openBay5);
    // the glass in the live scenes' bay frame (livescene.ts): hinge (0, 0.1, 0.71) above the cavity floor, which is
    // 1.809 above the base; the pane 0.709 in front of the hinge, swung 1.75 rad when open. Relative to the pod's origin:
    const g = open ? { x: -0.034, y: 2.607, z: 1.093, roll: 100.3 } : { x: -0.034, y: 1.909, z: 0.258, roll: 0 };
    const o = podOff(g.x, g.z);
    const lid = byId(`lid${i}`)!;
    Object.assign(lid, { at: [r1(c[0]! + o[0]), r1(c[1]! + o[1])], yaw: POD_YAW, lift: r1(POD_BASE + g.y * POD_K * M), scale: +POD_SCALE.toFixed(4) });
    if (g.roll) lid["roll"] = g.roll; else delete lid["roll"];
  });
  // ship scrap moves with the pods
  const dp = [byId("pod0")!.at![0]! - oldPod0[0]!, byId("pod0")!.at![1]! - oldPod0[1]!];
  for (const id of ["scrap", "scrap2"]) { const e = byId(id); if (e?.at) e.at = [r1(e.at[0]! + dp[0]!), r1(e.at[1]! + dp[1]!)]; }
  const rec = byId("recorder");
  if (rec) rec.at = at(L.recorder);
  if (opts.ore) {
    // the ore field's centre to Doug's spot, keeping its own spread
    const ores = lv.entities.filter((e) => e.type === "node.fuel_scrap");
    const cx = ores.reduce((s, e) => s + e.at![0]!, 0) / ores.length, cy = ores.reduce((s, e) => s + e.at![1]!, 0) / ores.length;
    const t = at(L.ore);
    for (const e of ores) e.at = [r1(e.at![0]! + t[0]! - cx), r1(e.at![1]! + t[1]! - cy)];
    // the commander lands at their pod
    lv.start = byId("pod0")!.at!.slice(0, 2);
  }
  if (opts.ridge) {
    // the ridge as blocking terrain along Doug's line, one rect per stretch, 4 m wide, kept on the map
    const pts = L.ridge.map(at);
    lv.entities = lv.entities.filter((e) => !/^ridge\d+$/.test(e.id ?? ""));
    const first = lv.entities.findIndex((e) => e.type === "decor.halcyon_wreck");
    const rects: Ent[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const y0 = Math.max(0, Math.min(a[1]!, b[1]!)), y1 = Math.min(lv.map.h, Math.max(a[1]!, b[1]!));
      if (y1 - y0 < 20) continue;
      const x = (a[0]! + b[0]!) / 2;
      rects.push({ type: "zone.terrain", id: `ridge${rects.length + 1}`, rect: [r1(x - 2 * M), r1(y0), 4 * M, r1(y1 - y0)] });
    }
    lv.entities.splice(first, 0, ...rects);
  }
  writeFileSync(path, JSON.stringify(lv, null, 1) + "\n");
  console.log(`L${n}: core ${core}, start ${lv.start}, wreck ${wreck.at}, pod0 ${byId("pod0")!.at}${rec ? `, recorder ${rec.at}` : ""}`);
}

apply(1, { shift: [110, 80], ore: true, ridge: true, mapW: 980, openBay5: false });
apply(2, { shift: [0, 0], ore: false, ridge: false, openBay5: false });
for (const n of [3, 4, 5]) apply(n, { shift: [0, 0], ore: false, ridge: false, openBay5: true });
