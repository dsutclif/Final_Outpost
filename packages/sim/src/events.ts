import type { Vec } from "./fixed.js";

// Events are the only thing renderers animate from. Positions are fixed point.
export type SimEvent =
  | { t: "gathered"; res: string; node: number; at: Vec }
  | { t: "deposited"; res: string; to: string; at: Vec }
  | { t: "sold"; res: string; n: number; pay: number; premium: boolean; at: Vec }
  | { t: "customer_arrived"; kind: string; res: string; want: number }
  | { t: "customer_left"; angry: boolean; at: Vec }
  | { t: "collected"; res: string; n: number; at: Vec }
  | { t: "core_fuel_out" }
  | { t: "core_fuel_restored" }
  | { t: "hint"; key: HintKey }
  | { t: "level_end"; won: boolean; reason: string };

export type HintKey =
  | "carry_max"
  | "core_full"
  | "stand_at_register"
  | "not_enough_currency";
