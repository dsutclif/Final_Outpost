import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repin } from "../packages/rater/src/index.js";
import { applyDefendS1 } from "../packages/generator/src/defendS1.js";
import type { ModelStrategy } from "../packages/bots/src/index.js";

// Shared by tools/defend-collect.ts and tools/defend-fit.ts (outpost-ops#273, defend model refit).
export const DATA_DIR = process.env["DEFEND_DATA_DIR"] ?? "C:/Users/dougl/OneDrive - Module12 LLC/Desktop/Projects/Mobile game/fo-preserved-data/2026-11-24/defend-model";
export const RUNS_FILE = `${DATA_DIR}/runs.jsonl`;
export const STATE_FILE = `${DATA_DIR}/state.json`;

/** The levels sampled: the three scratch levels the task names, the live L021 forms, and fixtures for held-out variety. */
export const LEVELS: { tag: string; file: string }[] = [
  { tag: "scratch-L010", file: "levels/scratch/rebuild-7-25-newd/s1-L010.json" },
  { tag: "scratch-L015", file: "levels/scratch/rebuild-7-25-newd/s1-L015.json" },
  { tag: "scratch-L021", file: "levels/scratch/rebuild-7-25-newd/s1-L021.json" },
  { tag: "pack-L021", file: "levels/packs/s1/s1-L021.json" },
  { tag: "fixture-L021", file: "levels/fixtures/s1-old/s1-L021.json" },
  { tag: "pack-L010", file: "levels/packs/s1/s1-L010.json" },
  { tag: "fixture-L026", file: "levels/fixtures/s1-old/s1-L026.json" },
  { tag: "fixture-L032", file: "levels/fixtures/s1-old/s1-L032.json" },
  { tag: "fixture-L043", file: "levels/fixtures/s1-old/s1-L043.json" },
];
/** "plain": the manifest as built. "s1": the redesign's switches (two waves on the field, random sides + warning). */
export const VARIANTS = ["plain", "s1"] as const;
export type Variant = (typeof VARIANTS)[number];
/** The sim's strategies, plus "fastest" = the good bot with no fixed strategy (today's cheapest-first buy order). The model's counterpart of "fastest" is no strategy. */
export const SIM_STRATEGIES = ["turrets_first", "guards_first", "drones_first", "fastest"] as const;
export type SimStrategy = (typeof SIM_STRATEGIES)[number];
export const modelStrategy = (s: SimStrategy): ModelStrategy | undefined => (s === "fastest" ? undefined : (s as ModelStrategy));

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadLevel(tag: string, variant: Variant): Record<string, any> {
  const lv = LEVELS.find((l) => l.tag === tag);
  if (!lv) throw new Error(`unknown level ${tag}`);
  let m = repin(JSON.parse(readFileSync(resolve(REPO, lv.file), "utf8"))) as Record<string, any>;
  if (variant === "s1") {
    const pool = [...new Set(((m["waves"] ?? []) as any[]).flatMap((w) => (Array.isArray(w.side) ? w.side : w.side ? [w.side] : ["n"])))];
    m = applyDefendS1(m, { maxLive: 2, overlapMin: 6, ...(pool.length > 1 ? { randomSides: pool, warnSeconds: 6 } : {}) }) as Record<string, any>;
  }
  return m;
}

/** The manifest cut to its first mult.length waves, wave i scaled by mult[i] (a kind with attackers keeps one). Later waves are not played: earlier waves that already lose would hide a later wave's own limit. */
export function shapeWaves(manifest: Record<string, any>, mult: number[]): Record<string, any> {
  const c = JSON.parse(JSON.stringify(manifest)) as Record<string, any>;
  c["waves"] = (c["waves"] as any[]).slice(0, mult.length);
  c["waves"].forEach((w: any, i: number) => { for (const key of Object.keys(w.counts)) if (w.counts[key] > 0) w.counts[key] = Math.max(1, Math.round(w.counts[key] * mult[i]!)); });
  return c;
}

export interface RunLine {
  kind: "run"; ts: string; engine: string; content: string; level: string; variant: Variant; strategy: SimStrategy; seed: number;
  wave: number; mult: number[]; won: boolean; reason: string; held: boolean; margin: number; baseLeft: number;
  leaks: number[]; baseHp: number[]; purchases: { tick: number; what: string }[]; salvageEarned: number; salvageSpent: number; fuelFed: number; ticks: number;
  /** #350 F2 (runs from 2026-11-24): kills by source (structure/resident/player/troop), attacker hits by target (resident = guard, troop, player, barrier, base), guard and commander downs, the most bodies queued at a gate and seconds with more than gateHitters there, attackers alive and seconds at the end. */
  combat?: { kills: Record<string, number>; hits: Record<string, number>; guardDowns: number; cmdDowns: number; gateQueueMax: number; gateQueueSec: number; leftAlive: number; endSec: number };
}
/** A finished search for one (level, variant, strategy, wave, seed): the bracket of the breaking multiplier. */
export interface CellLine { kind: "cell"; ts: string; engine: string; content: string; level: string; variant: Variant; strategy: SimStrategy; seed: number; wave: number; lo: number; hi: number | null; runs: number; /** Multipliers of the waves before this one (0.9 x this strategy's own limit there, at most 1) and the search's estimate. */ prior: number[]; est: number }
