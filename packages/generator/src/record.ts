import type { Content, Manifest } from "@fo/content";
import { wavePoints } from "./build.js";

/**
 * One search iteration, whatever became of it: what was built and how far it got. levels:build appends
 * these to levels/candidates/<pack>.jsonl so up-front generation rules can compare what failed with what passed.
 */
export interface CandidateRecord {
  iteration: number;
  p: number;
  knobs: Record<string, number>;
  /** Every reject this iteration, in order; empty and kept false means it only lost to a closer candidate. */
  rejects: string[];
  why?: string;
  settings?: CandidateSettings;
  /** Wins of the human-view bot in its early check. */
  humanWins?: number;
  /** The good bot's quick seeds. */
  quick?: { won: boolean; reason: string; seconds: number; hpMin: number; salvage: number; kills: number }[];
  rating?: { D: number; F: number; feasible: boolean; margin: Record<string, number>; winRate: Record<string, number>; loopMax: number; ladderLeft: number; idleModules: string[]; budget: number | undefined };
  idleElements?: string[];
  objectives?: { kind: string; params: Record<string, number | string> }[];
  stars?: Record<string, number>;
  /** Passed every check and became the best so far. */
  kept: boolean;
  /** On target: the search ended on it. */
  shipped: boolean;
  /** Verified after the search, as one of the closest candidates. */
  final?: boolean;
  /** Time spent on this iteration. */
  ms?: number;
}

export interface CandidateSettings {
  goal: Manifest["goal"];
  modules: readonly string[];
  params: Record<string, number>;
  pads: number; hires: number; salvageHires: number;
  towers: number; towerLv2: number; towerLv3: number; barracksUp: number;
  ladderSalvage: number; salvageCost: number; currencyCost: number;
  walls: number; scrapHeaps: number; fuelNodes: number; captures: number; events: number;
  waveTimes: number[]; waveSizes: number[]; waveDrops: number[]; wavePoints: number[];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const roundKnobs = (k: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(k).map(([n, v]) => [n, r3(v)]));

/** The numbers a rule could be written against, read off the built manifest. */
export function candidateSettings(m: Manifest, c: Content): CandidateSettings {
  const pads = m.entities.filter((e) => e.type === "pad.hire" || e.type === "pad.build");
  const built = (id: string) => pads.filter((e) => e.type === "pad.build" && e.build === id);
  const count = (t: string) => m.entities.filter((e) => e.type === t).length;
  const cost = (es: typeof pads, r: string) => es.reduce((t, e) => t + (e.cost[r] ?? 0), 0);
  const ladder = [...built("struct.ranged_defense"), ...built("struct.ranged_defense.t2"), ...built("struct.ranged_defense.t3")];
  const hires = pads.filter((e) => e.type === "pad.hire");
  const counts = m.waves.map((w) => Object.entries(w.counts as Record<string, number>));
  return {
    goal: m.goal, modules: m.modules, params: m.params,
    pads: pads.length, hires: hires.length, salvageHires: hires.filter((e) => "res.salvage" in e.cost).length,
    towers: built("struct.ranged_defense").length, towerLv2: built("struct.ranged_defense.t2").length, towerLv3: built("struct.ranged_defense.t3").length, barracksUp: built("struct.barracks.t2").length,
    ladderSalvage: cost(ladder, "res.salvage"), salvageCost: cost(pads, "res.salvage"), currencyCost: cost(pads, "res.currency"),
    walls: count("barrier.line"), scrapHeaps: count("node.salvage_pile"), fuelNodes: count("node.fuel_scrap"),
    captures: m.entities.filter((e) => e.type.startsWith("capture.")).length, events: m.events.length,
    waveTimes: m.waves.map((w) => w.t),
    wavePoints: m.waves.map((w) => wavePoints(w.counts as Record<string, number>, c)),
    waveSizes: counts.map((w) => w.reduce((t, [, n]) => t + n, 0)),
    waveDrops: counts.map((w) => w.reduce((t, [id, n]) => t + n * ((c.hostiles[id] as { drops?: Record<string, number> } | undefined)?.drops?.["res.salvage"] ?? 0), 0)),
  };
}
