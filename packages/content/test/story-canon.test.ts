import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Levels 1-5 are one map (Doug, 2026-11-09): every placed object that appears in more than one level sits at the same
// offset from the reactor in each of them (ore, crash site, ridges, the rock-pile pen, the rockslide). The levels differ
// only in what they add or take away, and each of those is listed below with its reason. This fails the day an object
// moves in one level but not the others.

type Ent = { id: string; type: string; at?: number[]; rect?: number[]; points?: number[][]; site?: number[]; route?: number[][]; [k: string]: unknown };
const here = dirname(fileURLToPath(import.meta.url));
const load = (n: number): { map: { w: number; h: number }; entities: Ent[] } => JSON.parse(readFileSync(resolve(here, `../../../levels/story/story-L00${n}.json`), "utf8"));
const LEVELS = [1, 2, 3, 4, 5];
const r1 = (v: number): number => Math.round(v * 10) / 10;

/** Object ids that exist in only some levels on purpose (anything else must be in every level that has it, see below). */
const ONLY_IN: Record<string, { levels: number[]; why: string }> = {
  ridgeE1: { levels: [1, 4, 5], why: "level 1's north-east ridge stretch lies above the top of levels 2 and 3's maps (their reactor sits 80 higher on the map)" },
  rockslide: { levels: [1, 2, 3], why: "cleared in level 3, gone after" },
  flats: { levels: [3, 4, 5], why: "the rock hoppers (prey) are a hunting objective, taught from level 3" },
  lid1: { levels: [1, 2, 3, 4, 5], why: "present everywhere; bay 5's lid is open from level 3 (lift, roll, position differ: see OPEN_LID)" },
};
/** Objects whose shape differs in one level on purpose (same place, trimmed). */
const TRIMMED: Record<string, { level: number; why: string }> = {
  ridgeE3: { level: 5, why: "a lane the raiders walk to the east gate: an unbroken ridge there stops every wave" },
  ridgeE4: { level: 5, why: "the same raider lane: the ridge stops short of it" },
};
/** Objects that belong to one level's play (gameplay, not the shared map). */
const LEVEL_OWN = new Set([
  "ring", "kiosk", "field1", "field2", "unlock_field2", "clear0", "hub", "picker", "pod_pip", "pod_rhee", "pod_okafor", "pod_tam", "pod_old",
  "galley", "feeder", "cook", "server", "cashier", "recorder", "barracks", "turret1", "train", "helmet", "flats",
]);
/** Bay 5's lid is opened in levels 3-5 (empty_bays): its offset and lift change on purpose. */
const OPEN_LID = { id: "lid1", levels: [3, 4, 5] };

const geo = (e: Ent, c: number[]): string => {
  const s = (p: number[]): number[] => [r1(p[0]! - c[0]!), r1(p[1]! - c[1]!)];
  const o: Record<string, unknown> = {};
  if (e.at) o["at"] = s(e.at);
  if (e.rect) o["rect"] = [...s(e.rect), e.rect[2], e.rect[3]];
  if (e.points) o["points"] = e.points.map(s);
  if (e.site) o["site"] = s(e.site);
  if (e.route) o["route"] = e.route.map(s);
  const { at, rect, points, site, route, ...rest } = e;
  void at; void rect; void points; void site; void route;
  return JSON.stringify({ o, rest });
};

describe("story levels 1-5 are one map", () => {
  const data = LEVELS.map((n) => {
    const lv = load(n);
    const c = lv.entities.find((e) => e.id === "core")!.at!;
    return { n, lv, c, by: new Map(lv.entities.map((e) => [e.id, e])) };
  });
  const ids = new Set(data.flatMap((d) => d.lv.entities.map((e) => e.id)));

  it("every placed object shows the same offset from the reactor in every level that has it", () => {
    const bad: string[] = [];
    for (const id of ids) {
      if (LEVEL_OWN.has(id) || id === "core") continue;
      const seen = data.filter((d) => d.by.has(id));
      const open = id === OPEN_LID.id;
      const base = seen[0]!;
      for (const d of seen.slice(1)) {
        if (TRIMMED[id]?.level === d.n || TRIMMED[id]?.level === base.n) continue;
        if (open && OPEN_LID.levels.includes(d.n) !== OPEN_LID.levels.includes(base.n)) continue;
        if (geo(d.by.get(id)!, d.c) !== geo(base.by.get(id)!, base.c)) bad.push(`${id}: level ${d.n} differs from level ${base.n}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("an object missing from a level is listed with its reason", () => {
    const bad: string[] = [];
    for (const id of ids) {
      if (LEVEL_OWN.has(id) || id === "core") continue;
      const have = data.filter((d) => d.by.has(id)).map((d) => d.n);
      const want = ONLY_IN[id]?.levels ?? LEVELS;
      if (JSON.stringify(have) !== JSON.stringify(want)) bad.push(`${id}: in levels ${have} but expected ${want}`);
    }
    expect(bad).toEqual([]);
    for (const k of Object.keys(ONLY_IN)) expect(ONLY_IN[k]!.why.length).toBeGreaterThan(10);
  });

  it("nothing shared sits off its level's map", () => {
    const bad: string[] = [];
    for (const d of data) for (const e of d.lv.entities) {
      if (LEVEL_OWN.has(e.id) && !e.at) continue;
      const pts: number[][] = [];
      if (e.at) pts.push(e.at);
      if (e.rect) pts.push([e.rect[0]!, e.rect[1]!], [e.rect[0]! + e.rect[2]!, e.rect[1]! + e.rect[3]!]);
      // a ridge may overhang the map edge (it only blocks), but it must reach onto the map
      if (e.type === "zone.terrain" && e.rect && (e.rect[0]! + e.rect[2]! < 0 || e.rect[1]! + e.rect[3]! < 0 || e.rect[0]! > d.lv.map.w || e.rect[1]! > d.lv.map.h)) bad.push(`level ${d.n} ${e.id} lies wholly off the map`);
      if (/^decor\./.test(e.type) && !/^(wreck|pod|lid|scrap)/.test(e.id)) for (const p of pts) if (p[0]! < 0 || p[1]! < 0 || p[0]! > d.lv.map.w || p[1]! > d.lv.map.h) bad.push(`level ${d.n} ${e.id} at ${p} is off the map`);
      if (e.type === "node.fuel_scrap") for (const p of pts) if (p[0]! < 5 || p[1]! < 5 || p[0]! > d.lv.map.w - 5 || p[1]! > d.lv.map.h - 5) bad.push(`level ${d.n} ${e.id} at ${p} is off or at the edge of the map`);
    }
    expect(bad).toEqual([]);
  });
});
