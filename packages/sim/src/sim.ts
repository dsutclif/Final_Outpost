import type { Content } from "@fo/content";
import { compile, type Compiled } from "./compile.js";
import type { SimEvent } from "./events.js";
import { FP, METER_MAX, fp, mulDiv, type Vec } from "./fixed.js";
import { hashOf } from "./hash.js";
import { seedRng } from "./rng.js";
import type { NodeState, PadState, ResidentState, SalesState, State } from "./state.js";
import { safeRadius, stepCore } from "./systems/core.js";
import { checkEnd } from "./systems/goals.js";
import { stepNodes } from "./systems/nodes.js";
import { collectPile, movePlayer, playerAct, type Input } from "./systems/player.js";
import { stepSales } from "./systems/sales.js";

export const ENGINE_VERSION = "0.1.0";

/** Modules the sim can run today. Anything else in a manifest is loaded as inert data. */
export const IMPLEMENTED_MODULES: ReadonlySet<string> = new Set(["carry", "gather", "core", "sales"]);

export interface SimOptions {
  content?: Content;
  onWarn?: (msg: string) => void;
}

export interface Sim {
  readonly compiled: Compiled;
  /** Live state. Read-only for callers: renderers read it, nothing but step() writes it. */
  readonly state: State;
  /** Advance one tick with one direction vector; returns the events of that tick. */
  step(input: Input): SimEvent[];
  /** Deep copy of the state for renderers that interpolate between ticks. */
  snapshot(): State;
  /** Hash of the whole state; equal hashes after equal input streams prove determinism. */
  hash(): string;
  /** Current protective radius of the core, in fixed point. */
  safeRadius(): number;
}

// Twelve points on a circle in fixed point, so idle residents can ring the core without trig.
const RING: readonly (readonly [number, number])[] = [
  [1000, 0], [866, 500], [500, 866], [0, 1000], [-500, 866], [-866, 500],
  [-1000, 0], [-866, -500], [-500, -866], [0, -1000], [500, -866], [866, -500],
];

export function createSim(manifestIn: unknown, opts: SimOptions = {}): Sim {
  const cp = compile(manifestIn, opts.content);
  const m = cp.manifest;
  if (m.engineVersion !== ENGINE_VERSION) {
    throw new Error(`${m.id}: pinned to engine ${m.engineVersion}, running ${ENGINE_VERSION}`);
  }
  for (const mod of m.modules) {
    if (!IMPLEMENTED_MODULES.has(mod)) opts.onWarn?.(`${m.id}: module ${mod} is not implemented yet; its entities are inert`);
  }

  const vec = ([x, y]: readonly [number, number]): Vec => ({ x: fp(x), y: fp(y) });
  const coreEnt = m.entities.find((e) => e.type === "sink.core");
  if (!coreEnt || coreEnt.type !== "sink.core") throw new Error("manifest has no core");

  const nodes: NodeState[] = [];
  let sales: SalesState | null = null;
  const pads: PadState[] = [];
  for (const e of m.entities) {
    if (e.type === "sink.core") continue;
    if (e.type === "sink.sales_point") {
      const pos = vec(e.at);
      sales = {
        pos,
        register: { x: pos.x + cp.sales.registerOffset.x, y: pos.y + cp.sales.registerOffset.y },
        pile: { x: pos.x + cp.sales.pileOffset.x, y: pos.y + cp.sales.pileOffset.y },
        pileN: 0,
        shelf: {},
        sells: [...e.sells],
        queue: [],
        leaving: [],
        spawnAcc: cp.sales.initialDelayTicks,
        premiumServed: 0,
      };
      continue;
    }
    if (e.type === "pad.hire" || e.type === "pad.build") {
      pads.push({ id: e.id, type: e.type, pos: vec(e.at), done: false, paid: {} });
      continue;
    }
    const def = cp.nodes[e.type];
    if (!def) throw new Error(`${m.id}: unknown node type ${e.type}`);
    nodes.push({ id: e.id ?? null, type: e.type, pos: vec(e.at), stock: def.stock, regrowAcc: 0, enabled: e.enabled });
  }

  const corePos = vec(coreEnt.at);
  const residents: ResidentState[] = m.people.map((p, k) => {
    const [cx, cy] = RING[k % RING.length]!;
    return {
      id: k,
      pos: { x: corePos.x + mulDiv(cx, fp(60), FP), y: corePos.y + mulDiv(cy, fp(50), FP) },
      role: p.role,
      status: "ok",
    };
  });

  const state: State = {
    tick: 0,
    rng: seedRng(m.seed),
    currency: m.params["start.currency"] ?? 0,
    player: { pos: vec(m.start), face: 1, stack: [], actCd: 0 },
    core: { pos: corePos, fuel: coreEnt.params.fuel, level: coreEnt.params.level, burnAcc: 0, lifeline: METER_MAX },
    nodes,
    sales,
    residents,
    pads,
    built: [],
    lastHint: null,
    over: false,
    won: null,
    reason: null,
  };

  return {
    compiled: cp,
    state,
    step(input: Input): SimEvent[] {
      const out: SimEvent[] = [];
      if (state.over) return out;
      state.tick++;
      movePlayer(state, cp, input);
      stepCore(state, cp, out);
      stepNodes(state, cp);
      playerAct(state, cp, out);
      collectPile(state, cp, out);
      stepSales(state, cp, out);
      checkEnd(state, cp, out);
      return out;
    },
    snapshot: () => structuredClone(state),
    hash: () => hashOf(state),
    safeRadius: () => safeRadius(state, cp),
  };
}
