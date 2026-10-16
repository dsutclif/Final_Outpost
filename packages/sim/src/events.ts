import type { Vec } from "./fixed.js";

// Events are the only thing renderers animate from. Positions are fixed point.
// `by` is a resident id when a worker, not the player, caused the event.
export type SimEvent =
  | { t: "gathered"; res: string; node: number; at: Vec; by?: number }
  | { t: "deposited"; res: string; to: string; at: Vec; by?: number }
  | { t: "sold"; res: string; n: number; pay: number; premium: boolean; at: Vec; customer: number; kind: string }
  | { t: "customer_arrived"; kind: string; res: string; want: number; customer: number }
  | { t: "customer_left"; angry: boolean; at: Vec; customer: number }
  | { t: "collected"; res: string; n: number; at: Vec }
  | { t: "core_fuel_out" }
  | { t: "core_fuel_restored" }
  | { t: "hint"; key: HintKey }
  | { t: "pile_collapsed"; conv: string }
  | { t: "level_end"; won: boolean; reason: string }
  // build pads
  | { t: "pad_paid"; pad: string; res: string; n: number }
  | { t: "hired"; pad: string; resident: number; role: string }
  | { t: "built"; pad: string; build: string; at: Vec }
  | { t: "unlocked"; pad: string; target: string }
  | { t: "core_upgraded"; level: number }
  | { t: "zone_cleared"; zone: string }
  // lasso, housing, gate
  | { t: "captured"; capture: number; at: Vec }
  | { t: "released"; capture: number; resident: number; at: Vec }
  | { t: "recruit_arrived"; resident: number; at: Vec }
  | { t: "moved_in"; resident: number }
  | { t: "pod_lost"; capture: number; at: Vec }
  | { t: "tow_dropped"; capture: number; at: Vec; reason: "hit" | "slack" }
  | { t: "crate_delivered"; capture: number; at: Vec; bundle: Record<string, number> }
  // reactor-out countdown
  | { t: "froze"; resident: number; at: Vec }
  // objectives: emitted when one becomes done or failed
  | { t: "objective"; id: string; kind: string; done: boolean; failed: boolean }
  // combat
  | { t: "hit"; target: "hostile" | "prey" | "base" | "barrier" | "player" | "resident"; id: number; at: Vec; by: "player" | "resident" | "structure" | "hostile" | "animal" }
  | { t: "shot"; from: Vec; to: Vec; id: number }
  | { t: "died"; kind: string; id: number; at: Vec }
  | { t: "drop"; res: string; at: Vec }
  | { t: "picked"; res: string; at: Vec; by?: number }
  | { t: "wave_started"; idx: number }
  | { t: "boss_spawned"; id: number; kind: string; at: Vec }
  | { t: "wave_cleared"; idx: number }
  | { t: "barrier_progress"; line: string; section: number; paid: number; cost: number }
  | { t: "barrier_built"; line: string; section: number }
  | { t: "barrier_broken"; line: string; section: number }
  | { t: "barrier_repaired"; line: string; section: number; cost: number; rebuilt: boolean }
  | { t: "injured"; resident: number }
  | { t: "animal_charge"; id: number; at: Vec }
  | { t: "healed"; resident: number }
  // hazards
  | { t: "hazard_warning"; start: number }
  | { t: "hazard_start"; end: number }
  | { t: "hazard_end" }
  // converters
  | { t: "converted"; conv: string; res: string }
  | { t: "conveyed"; belt: string; res: string; at: Vec }
  | { t: "converter_upgraded"; conv: string; level: number };

export type HintKey =
  | "carry_max"
  | "core_full"
  | "stand_at_register"
  | "not_enough_currency"
  | "need_resource"
  | "needs_core_level"
  | "no_idle_resident"
  | "input_full"
  | "operate_converter"
  | "wave_incoming"
  | "barrier_broken"
  | "barrier_damaged"
  | "hazard_warning";

/** Event types that count as the player doing something (for the idle-time stat). */
export const ACTION_EVENTS: ReadonlySet<SimEvent["t"]> = new Set<SimEvent["t"]>([
  "gathered", "deposited", "collected", "pad_paid", "picked", "hit", "barrier_progress", "barrier_repaired", "captured",
]);

/** Event types the rater treats as rewards. */
export const REWARD_EVENTS: ReadonlySet<SimEvent["t"]> = new Set<SimEvent["t"]>([
  "sold", "built", "hired", "unlocked", "core_upgraded", "zone_cleared", "released", "recruit_arrived", "barrier_built", "wave_cleared",
  "crate_delivered",
]);
