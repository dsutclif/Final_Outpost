import type { Content, Manifest } from "@fo/content";
import type { BotResult } from "@fo/bots";
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
  rating?: { D: number; F: number; feasible: boolean; margin: Record<string, number>; winRate: Record<string, number>; loopMax: number; ladderLeft: number; idleModules: string[]; budget: number | undefined;
    /** Play shape (outpost-ops#151): the three numbers, the limits failed (enforced or not), the level end and every play-shape beat, in seconds. */
    playShape?: { maxPhaseShare: number; beatTypes: number; lastNewBeatShare: number; fails: string[]; endS: number; beatS: number[] } };
  idleElements?: string[];
  /** The spare-pad trim passed but moved D further from target, so the untrimmed candidate was kept. */
  trimRefused?: { D: number; trimmedD: number; target: number };
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
  // ---- #251 part 1: what the log needs to say why a candidate failed and to replay it. Logging only: nothing here feeds a decision. ----
  /** One entry per reject label, same order as `rejects`: the numbers behind it (objective + params + what the bots got, layout message, idle names, D / target / signed gap, ...). */
  rejectDetail?: RejectDetail[];
  /** The request's target D, and `D - target` (signed) of the quick or full rating. */
  target?: number;
  gap?: number;
  /** The layout seed (the level's request seed, which fixes the map) and the layout salt that built; bots have their own seeds per run (see `runs`). */
  layoutSeed?: number;
  layoutSalt?: number;
  /** Per bot run of the last rating: profile, in-level seed, won, goal seconds, lowest hp, margin. */
  runs?: RunRow[];
  /** Wall milliseconds split: building the level, the quick/human bot checks, the ratings (quick + full). */
  msSplit?: { build: number; bots: number; rate: number };
  /** The search step: the iteration before this one (-1 for the first), how far p moved from it, and the change in D since the previous rated iteration. */
  step?: { prev: number; dp: number; dD?: number };
  /** The built manifest as it was rated or played. levels:build stores it gzipped as `manifestGz` (tools/candidate-log.ts) so `pnpm trace --candidate <jsonl> --n <n>` can replay the candidate. */
  manifest?: Manifest;
}

/** The numbers behind one reject label. `kind` is the label; the other fields depend on it. */
export type RejectDetail = { kind: string } & Record<string, unknown>;

export interface RunRow { bot: string; seed: number; won: boolean; s: number; hp: number; m: number }

/** Compact rows of every bot run of a measurement (no per-tick data). */
export function runRows(runs: Record<string, BotResult[]>): RunRow[] {
  return Object.values(runs).flat().map((r) => ({ bot: r.profile, seed: r.seed, won: r.won, s: Math.round(r.goalTicks / 30), hp: r.runStats.hpMin, m: r3(r.margin) }));
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
