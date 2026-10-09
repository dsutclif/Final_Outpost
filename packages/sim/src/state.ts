import type { Vec } from "./fixed.js";
import type { Rng } from "./rng.js";

// All of this is plain data: no classes, no functions, no references between
// objects (indices and ids only), so it can be hashed, cloned and replayed.

export interface PlayerState {
  pos: Vec;
  face: 1 | -1;
  /** Carried items in pickup order; the top of the stack is the last entry. */
  stack: string[];
  /** Ticks until the next automatic action check. */
  actCd: number;
}

export interface NodeState {
  id: string | null;
  type: string;
  pos: Vec;
  /** Items left; null for infinite nodes. */
  stock: number | null;
  regrowAcc: number;
  enabled: boolean;
}

export interface CoreState {
  pos: Vec;
  fuel: number;
  level: number;
  burnAcc: number;
  /** meter.lifeline in parts per million of full. */
  lifeline: number;
}

export interface CustomerState {
  kind: string;
  res: string;
  want: number;
  patience: number;
  patienceMax: number;
  pos: Vec;
  angry: boolean;
}

export interface SalesState {
  pos: Vec;
  register: Vec;
  pile: Vec;
  /** Currency waiting at the register for the player to collect. */
  pileN: number;
  shelf: Record<string, number>;
  sells: string[];
  queue: CustomerState[];
  leaving: CustomerState[];
  spawnAcc: number;
  premiumServed: number;
}

export interface ResidentState {
  id: number;
  pos: Vec;
  role: string;
  /** "ok" residents live in the base and count toward population. */
  status: "ok";
}

export interface PadState {
  id: string;
  type: "pad.hire" | "pad.build";
  pos: Vec;
  done: boolean;
  paid: Record<string, number>;
}

export interface HintState {
  key: string;
  tick: number;
}

export interface State {
  tick: number;
  rng: Rng;
  currency: number;
  player: PlayerState;
  core: CoreState;
  nodes: NodeState[];
  sales: SalesState | null;
  residents: ResidentState[];
  pads: PadState[];
  /** Ids of pads whose build has completed. */
  built: string[];
  lastHint: HintState | null;
  over: boolean;
  won: boolean | null;
  reason: string | null;
}
