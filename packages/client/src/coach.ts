import { FP, outsideLines, type Compiled, type SimEvent, type State, type Vec } from "@fo/sim";

// Contextual coach marks: a data-driven list of rules, each "when the state looks like this,
// point at that, say this (skin text key = rule id)". Rules are checked in priority order and
// retire after the player has done the thing a few times, across levels, so a generated level
// that introduces a module gets the same guidance as the golden ones. Never blocks input.

export interface CoachRule {
  /** Rule id; also the key into skin.text.coach. */
  id: string;
  /** Modules the level must include for the rule to apply (all of them). */
  modules: readonly string[];
  /** Fixed-point world target when the rule applies right now, else null. */
  target(s: State, cp: Compiled): Vec | null;
  /** True for the event that completes the rule once. */
  done(e: SimEvent, cp: Compiled): boolean;
  /** Completions before the rule retires for good. */
  times: number;
}

// ---------- state helpers ----------

const fuelCap = (s: State, cp: Compiled): number => cp.core.levels[Math.min(Math.max(1, s.core.level), cp.core.levels.length) - 1]?.fuelCap ?? 20;
const fuelRes = (cp: Compiled): string[] => Object.keys(cp.core.accepts);
const carries = (s: State, list: readonly string[]): boolean => s.player.stack.some((r) => list.includes(r));
const d2 = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const near = (a: Vec, b: Vec, r: number): boolean => d2(a, b) <= r * r;

function nearest<T>(items: readonly T[], pos: (t: T) => Vec, from: Vec): T | null {
  let best: T | null = null, bd = Infinity;
  for (const it of items) { const d = d2(pos(it), from); if (d < bd) { bd = d; best = it; } }
  return best;
}

function nodeFor(s: State, cp: Compiled, yields: readonly string[]): Vec | null {
  const ok = s.nodes.filter((n) => n.enabled && n.stock !== 0 && yields.includes(cp.nodes[n.type]?.yields ?? ""));
  return nearest(ok, (n) => n.pos, s.player.pos)?.pos ?? null;
}

const hasRole = (s: State, role: string, to?: string): boolean =>
  s.residents.some((r) => r.role === role && r.status === "ok" && (to === undefined || r.assign.to === to || r.assign.to === null));

const sellables = (s: State): string[] => s.sales?.sells ?? [];
const byPlayer = (e: { by?: number }): boolean => e.by === undefined;

function affordablePad(s: State, cp: Compiled): Vec | null {
  const ents = cp.manifest.entities;
  const ok = s.pads.filter((p) => {
    if (p.done || !p.visible || p.locked) return false;
    const e = ents.find((x) => x.id === p.id) as { cost?: Record<string, number> } | undefined;
    if (!e?.cost) return false;
    return Object.entries(e.cost).every(([r, n]) => {
      const left = n - (p.paid[r] ?? 0);
      return r === "res.currency" ? s.currency >= left : s.player.stack.filter((x) => x === r).length >= left;
    });
  });
  return nearest(ok, (p) => p.pos, s.player.pos)?.pos ?? null;
}

const mid = (a: Vec, b: Vec): Vec => ({ x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });

// ---------- rules, in priority order ----------

export const COACH_RULES: readonly CoachRule[] = [
  {
    id: "hazard_stock", modules: ["hazard_events"], times: 1,
    target: (s, cp) => (s.hazard.phase === "warning" && s.core.fuel < fuelCap(s, cp) * 0.8 ? s.core.pos : null),
    done: (e) => e.t === "hazard_start",
  },
  {
    id: "feed_core", modules: ["core"], times: 2,
    target: (s, cp) => (carries(s, fuelRes(cp)) && s.core.fuel <= fuelCap(s, cp) * 0.6 ? s.core.pos : null),
    done: (e) => e.t === "deposited" && e.to === "sink.core" && byPlayer(e),
  },
  {
    id: "gather_ore", modules: ["gather", "core"], times: 2,
    target: (s, cp) => (!carries(s, fuelRes(cp)) && s.core.fuel <= fuelCap(s, cp) * 0.5 ? nodeFor(s, cp, fuelRes(cp)) : null),
    done: (e, cp) => e.t === "gathered" && byPlayer(e) && e.res in cp.core.accepts,
  },
  {
    id: "tow_home", modules: ["lasso"], times: 1,
    target: (s) => (s.player.tow.length > 0 ? s.core.pos : null),
    done: (e) => e.t === "released",
  },
  {
    id: "lasso_pod", modules: ["lasso"], times: 2,
    target: (s) => (s.lasso.engaged ? nearest(s.captures.filter((c) => c.state === "idle"), (c) => c.pos, s.player.pos)?.pos ?? null : null),
    done: (e) => e.t === "captured",
  },
  {
    id: "leave_gate", modules: ["lasso"], times: 1,
    target: (s) => {
      if (s.player.tow.length > 0 || !s.captures.some((c) => c.state === "idle") || outsideLines(s, s.player.pos)) return null;
      const gates = s.barriers.flatMap((b) => b.sections.filter((x) => x.gate && x.built).map((x) => mid(x.a, x.b)));
      return nearest(gates, (g) => g, s.player.pos);
    },
    done: (e) => e.t === "captured",
  },
  {
    id: "admit_gate", modules: [], times: 1,
    target: (s, cp) => (cp.gate && s.gateQueue.length > 0 ? { x: cp.gate.pos.x, y: cp.gate.pos.y + cp.gate.admitOffsetY } : null),
    done: (e) => e.t === "recruit_arrived",
  },
  {
    id: "build_housing", modules: ["housing"], times: 1,
    target: (s, cp) => {
      if (!s.residents.some((r) => r.status === "waiting")) return null;
      const pads = s.pads.filter((p) => !p.done && p.visible && !p.locked && (cp.manifest.entities.find((e) => e.id === p.id) as { build?: string } | undefined)?.build === "struct.housing");
      return nearest(pads, (p) => p.pos, s.player.pos)?.pos ?? null;
    },
    done: (e) => e.t === "moved_in",
  },
  {
    id: "build_wall", modules: ["barrier_lines"], times: 1,
    target: (s, cp) => {
      if (cp.waves.length === 0) return null;
      for (const b of s.barriers) for (const sec of b.sections) {
        if (sec.built) continue;
        const left = b.costPerSection - sec.paid;
        const have = b.res === "res.currency" ? s.currency : s.player.stack.filter((r) => r === b.res).length;
        if (have >= Math.min(left, 1) && (b.res !== "res.currency" || s.currency >= left)) return mid(sec.a, sec.b);
      }
      return null;
    },
    done: (e) => e.t === "barrier_built",
  },
  {
    id: "collect_pile", modules: ["sales"], times: 2,
    target: (s) => (s.sales && s.sales.pileN >= 3 ? s.sales.pile : null),
    done: (e) => e.t === "collected",
  },
  {
    id: "pickup_output", modules: ["converters"], times: 1,
    target: (s) => nearest(s.converters.filter((c) => c.out > 0), (c) => c.pickupPos, s.player.pos)?.pickupPos ?? null,
    done: (e) => e.t === "picked" && byPlayer(e),
  },
  {
    id: "operate_converter", modules: ["converters"], times: 1,
    target: (s, cp) => {
      const idle = s.converters.filter((c) => c.inQ.length > 0 && !hasRole(s, cp.converters[c.type]?.role ?? "", c.type) && !near(s.player.pos, c.operatorPos, cp.convParams.playerOperateRange));
      return nearest(idle, (c) => c.operatorPos, s.player.pos)?.operatorPos ?? null;
    },
    done: (e) => e.t === "converted",
  },
  {
    id: "feed_converter", modules: ["converters"], times: 1,
    target: (s, cp) => {
      if (s.core.fuel <= fuelCap(s, cp) * 0.6) return null;
      const want = s.converters.filter((c) => c.inQ.length === 0 && carries(s, cp.converters[c.type]?.inputs ?? []) && !(cp.converters[c.type]?.inputs ?? []).some((r) => sellables(s).includes(r)));
      return nearest(want, (c) => c.pos, s.player.pos)?.pos ?? null;
    },
    done: (e) => e.t === "deposited" && e.to.startsWith("conv.") && byPlayer(e),
  },
  {
    id: "pick_drop", modules: [], times: 1,
    target: (s) => nearest(s.drops, (d) => d.pos, s.player.pos)?.pos ?? null,
    done: (e) => e.t === "picked" && byPlayer(e),
  },
  {
    id: "buy_pad", modules: ["build_pads"], times: 2,
    target: (s, cp) => affordablePad(s, cp),
    done: (e) => e.t === "built" || e.t === "hired" || e.t === "unlocked",
  },
  {
    id: "serve_register", modules: ["sales"], times: 2,
    target: (s, cp) => {
      const sl = s.sales;
      if (!sl || sl.queue.length === 0 || hasRole(s, "role.cashier")) return null;
      if (!sl.sells.some((r) => (sl.shelf[r] ?? 0) > 0)) return null;
      return near(s.player.pos, sl.register, cp.sales.registerRange) ? null : sl.register;
    },
    done: (e) => e.t === "sold",
  },
  {
    id: "stock_kiosk", modules: ["sales"], times: 2,
    target: (s, cp) => {
      const sl = s.sales;
      if (!sl) return null;
      return sl.sells.some((r) => s.player.stack.includes(r) && (sl.shelf[r] ?? 0) < cp.sales.shelfCap) ? sl.pos : null;
    },
    done: (e) => e.t === "deposited" && e.to === "sink.sales_point" && byPlayer(e),
  },
  {
    id: "gather_food", modules: ["sales"], times: 2,
    target: (s, cp) => {
      const sl = s.sales;
      if (!sl || carries(s, sl.sells)) return null;
      const stocked = sl.sells.reduce((a, r) => a + (sl.shelf[r] ?? 0), 0);
      return stocked < 2 ? nodeFor(s, cp, sl.sells) : null;
    },
    done: (e, cp) => e.t === "gathered" && byPlayer(e) && !(e.res in cp.core.accepts),
  },
  {
    id: "hunt_prey", modules: ["hunting"], times: 1,
    target: (s) => (hasRole(s, "role.hunter") ? null : nearest(s.prey.filter((p) => p.alive), (p) => p.pos, s.player.pos)?.pos ?? null),
    done: (e) => e.t === "died",
  },
];

export interface CoachMarkState { id: string; at: Vec }

/** Picks the coach mark to show each tick and counts completions. */
export class Coach {
  private current: string | null = null;
  private since = 0;
  private readonly rules: CoachRule[];

  constructor(modules: readonly string[], private readonly learned: Record<string, number>, rules: readonly CoachRule[] = COACH_RULES, hasGate = false) {
    this.rules = rules.filter((r) => r.modules.every((m) => modules.includes(m)) && (r.id !== "admit_gate" || hasGate || modules.includes("housing")));
  }

  private retired(r: CoachRule): boolean { return (this.learned[r.id] ?? 0) >= r.times; }

  /** The mark for this tick, with a little stickiness so marks do not flicker between rules. */
  update(s: State, cp: Compiled): CoachMarkState | null {
    if (s.over) return null;
    const cur = this.current ? this.rules.find((r) => r.id === this.current) : undefined;
    if (cur && !this.retired(cur) && s.tick - this.since < 45) {
      const at = cur.target(s, cp);
      if (at) return { id: cur.id, at };
    }
    for (const r of this.rules) {
      if (this.retired(r)) continue;
      const at = r.target(s, cp);
      if (!at) continue;
      if (r.id !== this.current) { this.current = r.id; this.since = s.tick; }
      return { id: r.id, at };
    }
    this.current = null;
    return null;
  }

  /** Feed every sim event; returns the rule ids this event completed. */
  onEvent(e: SimEvent, cp: Compiled): string[] {
    const out: string[] = [];
    for (const r of this.rules) {
      if (this.retired(r) || !r.done(e, cp)) continue;
      // doing the thing teaches it, whether or not its mark was showing
      this.learned[r.id] = (this.learned[r.id] ?? 0) + 1;
      out.push(r.id);
      if (r.id === this.current) this.current = null;
    }
    return out;
  }
}

export const toWorld = (v: Vec): { x: number; y: number } => ({ x: v.x / FP, y: v.y / FP });
