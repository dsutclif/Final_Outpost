import type { Content } from "@fo/content";
import { compile, type Compiled } from "./compile.js";
import type { SimEvent } from "./events.js";
import { METER_MAX, fp, ticks, type Vec } from "./fixed.js";
import { hashOf } from "./hash.js";
import { seedRng } from "./rng.js";
import type { BarrierState, NodeState, PadState, SalesState, State, StructureState, ZoneState, PreyZoneState, CaptureState } from "./state.js";
import { stepBarrierBuild, buildSection, sectionHpMax } from "./systems/barriers.js";
import { newResident, ringPoint } from "./systems/common.js";
import { placeConverter, stepConverters } from "./systems/converters.js";
import { safeRadius, stepCore } from "./systems/core.js";
import { stepDefense } from "./systems/defense.js";
import { stepFreeze } from "./systems/freeze.js";
import { initObjectives, stepObjectives } from "./systems/objectives.js";
import { checkEnd } from "./systems/goals.js";
import { stepHazard } from "./systems/hazard.js";
import { stepGate, stepHousing } from "./systems/housing.js";
import { spawnPrey, stepHunting } from "./systems/hunting.js";
import { stepLasso } from "./systems/lasso.js";
import { stepNodes } from "./systems/nodes.js";
import { applyEffects, refreshPads } from "./systems/pads.js";
import { collectPile, movePlayer, pickDrops, playerAct, playerCombat, type Input } from "./systems/player.js";
import { stepResidents } from "./systems/residents.js";
import { salesLayout, stepSales } from "./systems/sales.js";
import { stepStats } from "./systems/stats.js";

export const ENGINE_VERSION = "0.5.1";

/** Modules the sim can run today. Anything else in a manifest is loaded as inert data. */
export const IMPLEMENTED_MODULES: ReadonlySet<string> = new Set([
  "carry", "gather", "core", "sales",
  "workers", "build_pads", "source_gating", "barrier_lines", "lasso", "housing", "core_levels", "blocked_zones",
  "hunting", "converters", "customer_variety", "defense", "defenders", "salvage_upgrades", "medical", "hazard_events",
  "supply_routing",
]);

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
  const rect = ([x, y, w, h]: readonly [number, number, number, number]) => ({ x: fp(x), y: fp(y), w: fp(w), h: fp(h) });
  const coreEnt = m.entities.find((e) => e.type === "sink.core");
  if (!coreEnt || coreEnt.type !== "sink.core") throw new Error("manifest has no core");
  const corePos = vec(coreEnt.at);

  const state: State = {
    tick: 0,
    rng: seedRng(m.seed),
    currency: m.params["start.currency"] ?? cp.content.defaults["start.currency"] ?? 0,
    params: {
      "barrier.hpMax": cp.barrier.hp, "barrier.gateHpMax": cp.barrier.gateHp,
      // Present only when repair is on, so a level without it hashes exactly as before.
      ...(cp.barrier.repairPm > 0 ? { "barrier.repairPm": cp.barrier.repairPm } : {}),
    },
    player: { pos: vec(m.start), face: 1, stack: [], actCd: 0, atkCd: 0, buildCd: 0, tow: [], moving: false, padId: null, padDwell: 0, hitCd: 0 },
    core: { pos: corePos, fuel: coreEnt.params.fuel, level: coreEnt.params.level, burnAcc: 0, lifeline: METER_MAX },
    nodes: [],
    sales: null,
    residents: [],
    nextResidentId: 0,
    pads: [],
    built: [],
    structures: [],
    barriers: [],
    zones: [],
    preyZones: [],
    captures: [],
    prey: [],
    hostiles: [],
    nextHostileId: 0,
    drops: [],
    nextDropId: 0,
    converters: [],
    depot: null,
    meters: { lifeline: METER_MAX, baseHealth: cp.baseHealth, baseHealthMax: cp.baseHealth },
    waves: { idx: 0, pending: [], active: false },
    hazard: { phase: "none", until: 0, idx: 0 },
    lasso: { trail: [], towing: [], engaged: false, trip: { delivered: 0, lost: 0 }, slack: 0 },
    gateQueue: [],
    timers: { gateAcc: cp.gate ? cp.gate.initialTicks : 0, gateLeft: cp.gate ? cp.gate.total : 0 },
    freeze: { active: false, ticksLeft: cp.freeze.graceTicks, ticksTotal: cp.freeze.graceTicks, lossAt: -1 },
    objectives: initObjectives(cp),
    stats: {
      sold: 0, built: 0, rescued: 0, injured: 0, barriersLost: 0, lifelineLowTicks: 0, concurrentDemandTicks: 0, idleTicks: 0, rewardTicks: [],
      fuelOuts: 0, froze: 0, heatMin: 1000, customersSpawned: 0, customersAngry: 0, earned: 0, soldUnits: {}, streak: 0, streakMax: 0,
      bulkServed: 0, unlocked: 0, hired: 0, hiredBy: {}, converted: 0, convertedBy: {}, tier2Made: 0, hauled: 0, kills: 0, bossKills: 0,
      preyKilled: 0, protein: 0, salvage: 0, crates: 0, podsLost: 0, wavesCleared: 0, admitted: 0, zonesCleared: 0, hazardsSurvived: 0,
      tripBest: 0, tripBestClean: 0, lastPlayerDeposit: 0, salesSinceDeposit: 0,
    },
    lastHint: null,
    over: false,
    won: null,
    reason: null,
  };

  let nextCapture = 0;
  for (const e of m.entities) {
    switch (e.type) {
      case "sink.core": break;
      case "sink.sales_point": {
        const pos = vec(e.at);
        const lay = salesLayout(cp, pos, corePos);
        const sales: SalesState = {
          pos,
          register: lay.register,
          pile: lay.pile,
          pileN: 0, shelf: {}, sells: [...e.sells], queue: [], leaving: [],
          spawnAcc: cp.sales.initialDelayTicks, premiumServed: 0,
          nextCustomerId: 0, queueAt: lay.queueAt, queueStep: lay.queueStep, edgeX: lay.edgeX,
        };
        state.sales = sales;
        break;
      }
      case "pad.hire":
      case "pad.build": {
        const pad: PadState = { id: e.id, type: e.type, pos: vec(e.at), done: false, paid: {}, visible: true, locked: false };
        state.pads.push(pad);
        break;
      }
      case "barrier.line": {
        const sections = e.sections.map((s) => ({ a: vec(s.a), b: vec(s.b), built: false, hp: 0, hpMax: sectionHpMax(state, s.gate), gate: s.gate, paid: 0 }));
        const line: BarrierState = {
          id: e.id, a: { ...sections[0]!.a }, b: { ...sections[sections.length - 1]!.b },
          res: e.res, costPerSection: e.costPerSection ?? cp.barrier.costPerSection, sections, closed: e.closed ?? false,
        };
        e.sections.forEach((s, i) => { if (s.prebuilt) buildSection(state, cp, line, sections[i]!); });
        state.barriers.push(line);
        break;
      }
      case "zone.blocked":
      case "zone.waiting": {
        const z: ZoneState = { id: e.id, type: e.type, rect: rect(e.rect), cleared: false };
        state.zones.push(z);
        break;
      }
      case "zone.prey": {
        const z: PreyZoneState = { id: e.id, rect: rect(e.rect), animal: e.animal };
        state.preyZones.push(z);
        break;
      }
      default: {
        const t: string = e.type;
        if (t.startsWith("node.")) {
          const def = cp.nodes[t];
          if (!def) throw new Error(`${m.id}: unknown node type ${t}`);
          const n: NodeState = { id: e.id ?? null, type: t, pos: vec(e.at), stock: def.stock, regrowAcc: 0, enabled: "enabled" in e ? e.enabled : true };
          state.nodes.push(n);
        } else if (t.startsWith("conv.")) {
          placeConverter(state, cp, e.id ?? `${t}#${state.converters.length}`, t, vec(e.at));
        } else if (t.startsWith("struct.")) {
          const def = cp.structures[t]!;
          const s: StructureState = { id: e.id ?? `${t}#${state.structures.length}`, type: t, pos: vec(e.at), level: 1, acc: 0 };
          if (def.hp !== null) { s.hp = def.hp; s.hpMax = def.hp; }
          state.structures.push(s);
          if (t === "struct.depot") state.depot = { pos: vec(e.at), stock: {} };
          applyEffects(state, def.effects, s);
        } else if (t.startsWith("capture.")) {
          const freeze = "freeze" in e && e.freeze !== undefined ? (e.freeze > 0 ? ticks(e.freeze) : 0) : cp.lassoables[t]!.freezeTicks;
          const c: CaptureState = { id: nextCapture++, type: t, pos: vec(e.at), state: "idle", timer: 0, freezeTicks: freeze };
          state.captures.push(c);
        }
      }
    }
  }
  // Prey spawn after zones exist; ids are stable per zone order.
  state.preyZones.forEach((z, zi) => {
    const ent = m.entities.find((e) => e.type === "zone.prey" && e.id === z.id);
    const n = ent && ent.type === "zone.prey" ? ent.n : 0;
    for (let k = 0; k < n; k++) spawnPrey(state, cp, zi, state.prey.length);
  });

  m.people.forEach((p, k) => {
    const r = newResident(state, ringPoint(corePos, k, fp(60), fp(50)), p.role, "ok");
    r.slot = k;
    r.assign = { from: p.from ?? null, to: p.to ?? null, node: p.node ?? null, post: null };
    if (cp.roles[p.role]?.behavior === "guard") r.assign.post = state.residents.filter((x) => x.role === p.role).length - 1;
  });
  refreshPads(state, cp);

  return {
    compiled: cp,
    state,
    step(input: Input): SimEvent[] {
      const out: SimEvent[] = [];
      if (state.over) return out;
      state.tick++;
      // System order is fixed; see docs/SIM.md before changing it.
      movePlayer(state, cp, input);
      stepHazard(state, cp, out);
      stepCore(state, cp, out);
      stepFreeze(state, cp, out);
      stepNodes(state, cp);
      stepBarrierBuild(state, cp, out);
      playerAct(state, cp, out);
      playerCombat(state, cp, out);
      pickDrops(state, cp, out);
      collectPile(state, cp, out);
      stepLasso(state, cp, out);
      stepHousing(state, cp, out);
      stepGate(state, cp, out);
      stepResidents(state, cp, out);
      stepSales(state, cp, out);
      stepConverters(state, cp, out);
      stepHunting(state, cp);
      stepDefense(state, cp, out);
      refreshPads(state, cp);
      stepStats(state, cp, out);
      stepObjectives(state, cp, out);
      checkEnd(state, cp, out);
      return out;
    },
    snapshot: () => structuredClone(state),
    hash: () => hashOf(state),
    safeRadius: () => safeRadius(state, cp),
  };
}
