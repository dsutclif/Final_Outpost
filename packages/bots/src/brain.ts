import { FP, TPS, blockedAt, depotDrop, depotPickup, jobDone, jobOf, nextU32, outsideLines, freeSlots, padCost, pointInPoly, safeRadius, type Compiled, type PadState, type Rng, type State, type Vec } from "@fo/sim";
import { Nav, type Circle } from "./nav.js";
import { DEFAULT_POLICIES, type Plan, type PlanStep, type Policies } from "./plan.js";
import type { BotProfile } from "./profiles.js";

// Utility controller. Every few ticks it scores the tasks the state offers, picks the best
// (the profile's priority error sometimes takes the runner-up), and after the reaction delay
// steers toward that task's target. Targets are resolved from the live state every tick, so a
// task can follow a moving hostile or move on to the next node without a new decision.

export type TaskKind =
  | "feed" | "fuel" | "gather" | "stock" | "register" | "pile" | "pay" | "barrier" | "operate" | "deposit"
  | "fetch" | "drop" | "admit" | "fight" | "lasso" | "hunt" | "depot" | "wait";

export interface Task {
  kind: TaskKind;
  score: number;
  /** Task-specific key: resource, pad id, node index, converter id, drop id ... */
  key: string;
  /** How many items to collect for gather tasks. */
  want: number;
  /** Gather from nodes only, never the warehouse (a load on its way into the warehouse). */
  nodeOnly?: boolean;
}

export interface Target { pos: Vec; r: number }

/** Step kinds the client's guide arrows name. "gate" means: leave (or re-enter) the ring through a gate first. */
export type SuggestKind = "gather" | "feed" | "stock" | "register" | "pile" | "pay" | "tow" | "gate" | "barrier" | "operate"
  | "deposit" | "fetch" | "drop" | "admit" | "fight" | "hunt";
export interface Suggestion { kind: SuggestKind; target: Vec; key: string }

const U = FP;
const d2 = (a: Vec, b: Vec): number => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
const dist = (a: Vec, b: Vec): number => Math.sqrt(d2(a, b));
const near = (a: Vec, b: Vec, r: number): boolean => d2(a, b) < r * r;
const isDangerousAnimal = (cp: Compiled, kind: string): boolean => (cp.animals[kind]?.aggroRange ?? 0) > 0;
const count = (stack: readonly string[], res: string): number => { let n = 0; for (const s of stack) if (s === res) n++; return n; };

interface LassoMem { capture: number; loop: Vec[]; idx: number; phase: "loop" | "return"; flip: number }

export class Brain {
  readonly nav: Nav;
  current: Task = { kind: "wait", score: 0, key: "", want: 0 };
  /** Decision waiting out the reaction delay. */
  private pending: { task: Task; at: number } | null = null;
  private since = 0;
  private lasso: LassoMem | null = null;
  /** Hires bought per repeatable pad. */
  readonly hiresByPad: Record<string, number> = {};
  private skip = new Set<string>();
  private wanderTick = 0;
  private wander = 0;
  private lastInput = { dx: 0, dy: 0 };
  private lastPos: Vec = { x: 0, y: 0 };
  private stuck = 0;
  private holdLeft = 0;

  constructor(
    private readonly cp: Compiled,
    private readonly plan: Plan,
    private readonly prof: BotProfile,
    private readonly rng: Rng,
  ) {
    this.nav = new Nav(cp);
    this.pol = plan.policies ?? DEFAULT_POLICIES;
    this.usesCapped = plan.steps.some((s) => Object.keys(s.cost).some((r) => cp.resources[r]?.cap !== null))
      || plan.barriers.some((b) => cp.resources[b.res]?.cap !== null);
    this.rings = cp.manifest.entities.flatMap((e) => (e.type === "barrier.line" && e.closed ? [e.sections.map((s) => ({ x: s.a[0] * FP, y: s.a[1] * FP }))] : []));
  }

  private readonly pol: Policies;
  /** Closed barrier rings as polygons (fixed point). */
  private readonly rings: Vec[][];

  private rand(): number { return nextU32(this.rng) / 4294967296; }

  // ---------- plan bookkeeping ----------

  stepDone(st: State, s: PlanStep): boolean {
    const pad = st.pads.find((p) => p.id === s.pad);
    if (!pad) return true;
    if (s.repeat > 1 || this.cp.entityById[s.pad]?.type === "pad.hire" && (this.cp.entityById[s.pad] as { repeatable?: boolean }).repeatable) {
      return (this.hiresByPad[s.pad] ?? 0) >= s.repeat;
    }
    return pad.done;
  }

  private whenHolds(st: State, s: PlanStep): boolean {
    if (s.when === "injuries") return st.stats.injured > 0;
    if (s.when === "waiting") return st.residents.some((r) => r.status === "waiting");
    return true;
  }

  private recruitsPending(st: State): boolean {
    return st.timers.gateLeft > 0 || st.gateQueue.length > 0 || st.captures.length > 0 || st.residents.some((r) => r.status === "waiting");
  }

  /** The first plan step that can take a payment now. */
  nextStep(st: State): { step: PlanStep; pad: PadState } | null {
    for (const s of this.plan.steps) {
      if (this.stepDone(st, s) || !this.whenHolds(st, s) || this.skip.has(s.pad)) continue;
      const pad = st.pads.find((p) => p.id === s.pad)!;
      if (!pad.visible || pad.locked) continue;
      return { step: s, pad };
    }
    return null;
  }

  /** Remaining cost of a pad at its current (automation-taxed) price, per resource. */
  remaining(st: State, pad: PadState, s: PlanStep): Record<string, number> {
    const e = this.cp.entityById[s.pad];
    const cost = e && (e.type === "pad.hire" || e.type === "pad.build") ? padCost(st, this.cp, e) : s.cost;
    const out: Record<string, number> = {};
    for (const [r, n] of Object.entries(cost)) { const left = n - (pad.paid[r] ?? 0); if (left > 0) out[r] = left; }
    return out;
  }

  /** Capped resources (refined, salvage) still needed by unfinished unconditional steps, minus what is carried. */
  cappedNeed(st: State): Record<string, number> {
    // Called several times a tick (scoring, hunting, the stall detector); the answer cannot change within one.
    if (this.needMemo && this.needMemo.tick === st.tick && this.needMemo.stack === st.player.stack.length) return this.needMemo.v;
    const v = this.cappedNeedUncached(st);
    this.needMemo = { tick: st.tick, stack: st.player.stack.length, v };
    return v;
  }

  /** True when some plan step costs a capped good (refined material, salvage). */
  readonly usesCapped: boolean = false;

  private needMemo: { tick: number; stack: number; v: Record<string, number> } | null = null;

  private cappedNeedUncached(st: State): Record<string, number> {
    const need: Record<string, number> = {};
    for (const s of this.plan.steps) {
      if (s.when !== "always" && !this.whenHolds(st, s)) continue;
      if (this.stepDone(st, s) || this.skip.has(s.pad)) continue;
      const pad = st.pads.find((p) => p.id === s.pad)!;
      for (const [r, n] of Object.entries(this.remaining(st, pad, s))) if (this.cp.resources[r]?.cap !== null) need[r] = (need[r] ?? 0) + n;
    }
    for (const t of this.plan.barriers) {
      if (this.cp.resources[t.res]?.cap === null) continue;
      const sec = st.barriers.find((l) => l.id === t.line)?.sections[t.section];
      if (sec && !sec.built) need[t.res] = (need[t.res] ?? 0) + Math.max(0, t.cost - sec.paid);
    }
    for (const r of Object.keys(need)) need[r] = Math.max(0, need[r]! - count(st.player.stack, r));
    return need;
  }

  currencyNeedNext(st: State): number {
    const nx = this.nextStep(st);
    if (nx) return this.remaining(st, nx.pad, nx.step)["res.currency"] ?? 0;
    const b = this.nextBarrier(st);
    if (b) return b.cost - b.paid;
    // No plan step left: a currency goal still needs goal.n in hand, so sales keep counting as progress.
    const g = this.cp.manifest.goal;
    return g.type === "currency" ? Math.max(0, g.n) : 0;
  }

  /** Mark hire pads that can never be staffed (locked, nobody coming) as skipped so the plan moves on. */
  private refreshSkips(st: State): void {
    const pending = this.recruitsPending(st);
    for (const s of this.plan.steps) {
      if (s.kind !== "hire" || this.stepDone(st, s)) continue;
      const pad = st.pads.find((p) => p.id === s.pad)!;
      const idleNow = st.residents.some((r) => r.status === "ok" && r.role === "idle");
      if (!idleNow && !pending && pad.visible) this.skip.add(s.pad);
      else this.skip.delete(s.pad);
    }
  }

  nextBarrier(st: State): { line: string; section: number; cost: number; paid: number; res: string; a: Vec; b: Vec } | null {
    for (const t of this.plan.barriers) {
      const line = st.barriers.find((l) => l.id === t.line);
      const s = line?.sections[t.section];
      if (!line || !s || s.built) continue;
      return { line: t.line, section: t.section, cost: line.costPerSection, paid: s.paid, res: line.res, a: s.a, b: s.b };
    }
    return null;
  }

  /**
   * With wall repair on: a damaged standing section facing a side hostiles are attacking from, nearest to the
   * hero first. Null while repair is off, so the bots play exactly as before.
   */
  nextRepair(st: State): { line: string; section: number; cost: number; paid: number; res: string; a: Vec; b: Vec } | null {
    const pm = st.params["barrier.repairPm"] ?? 0;
    if (pm <= 0 || st.hostiles.length === 0) return null;
    const sides = new Set(st.hostiles.map((h) => h.side));
    let best: { line: string; section: number; cost: number; paid: number; res: string; a: Vec; b: Vec } | null = null;
    let bd = Infinity;
    for (const line of st.barriers) {
      for (let i = 0; i < line.sections.length; i++) {
        const s = line.sections[i]!;
        if (!s.built || s.hp >= s.hpMax) continue;
        const mx = (s.a.x + s.b.x) / 2 - st.core.pos.x, my = (s.a.y + s.b.y) / 2 - st.core.pos.y;
        const side = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? "e" : "w") : (my > 0 ? "s" : "n");
        if (!sides.has(side)) continue;
        const d = (mx - (st.player.pos.x - st.core.pos.x)) ** 2 + (my - (st.player.pos.y - st.core.pos.y)) ** 2;
        if (d < bd) { bd = d; best = { line: line.id, section: i, cost: Math.max(1, Math.ceil((line.costPerSection * pm) / 1000)), paid: 0, res: line.res, a: s.a, b: s.b }; }
      }
    }
    return best;
  }

  // ---------- task scoring ----------

  private fuelValueCarried(st: State): number {
    let v = 0;
    for (const s of st.player.stack) v += this.cp.core.accepts[s] ?? 0;
    return v;
  }

  private coreCap(st: State): number {
    return this.cp.core.levels[Math.min(st.core.level, this.cp.core.levels.length) - 1]!.fuelCap;
  }

  private burnTicks(st: State): number {
    const b = this.cp.core.burnTicks;
    return st.hazard.phase === "active" ? Math.floor((b * FP) / this.cp.hazard.burnMul) : b;
  }

  private speed(st: State): number {
    return Math.max(1, Math.floor((this.cp.player.speed * Math.max(100, FP - this.cp.lasso.speedPenalty * st.player.tow.length)) / FP));
  }

  private travel(st: State, a: Vec, b: Vec): number { return dist(a, b) / this.speed(st); }

  private coreSupplied(st: State): boolean {
    return st.residents.some((r) => r.status === "ok" && this.cp.roles[r.role]?.behavior === "gather_deliver" && r.assign.to === "sink.core")
      || st.residents.some((r) => r.status === "ok" && this.cp.roles[r.role]?.behavior === "haul");
  }

  private cashier(st: State): boolean {
    return st.residents.some((r) => r.status === "ok" && this.cp.roles[r.role]?.behavior === "stand_at" && (r.assign.to === "sink.sales_point" || r.assign.to === null));
  }

  private supplied(st: State, res: string): boolean {
    for (const r of st.residents) {
      if (r.status !== "ok") continue;
      const b = this.cp.roles[r.role]?.behavior;
      if (b === "gather_deliver" && r.assign.to === "sink.sales_point") {
        const node = r.assign.from ? this.cp.nodes[r.assign.from] : undefined;
        if (node?.yields === res) return true;
      }
      if (b === "collect_deliver" && r.assign.to === "sink.sales_point" && r.assign.from && this.cp.converters[r.assign.from]?.output === res) return true;
    }
    return false;
  }

  /** Best node for a resource by items per tick including the walk there. */
  private bestNode(st: State, res: string, want: number, value = 1): number {
    let best = -1, bs = -1;
    st.nodes.forEach((n, i) => {
      const def = this.cp.nodes[n.type]!;
      if (!n.enabled || n.stock === 0 || def.yields !== res) return;
      // a node still under rubble cannot be reached until its pad clears it
      if (blockedAt(st, this.cp, n.pos.x, n.pos.y)) return;
      const get = n.stock === null ? want : Math.min(want, n.stock + 1);
      const t = this.travel(st, st.player.pos, n.pos) + get * def.rateTicks + 10;
      const s = (get * value) / t;
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }

  private sellable(st: State): string[] { return st.sales ? st.sales.sells : []; }

  /** A converter that takes `res` and makes something the plan needs or the shop sells. */
  private converterFor(st: State, res: string): State["converters"][number] | null {
    const capped = this.cappedNeed(st);
    for (const cv of st.converters) {
      const def = this.cp.converters[cv.type]!;
      if (!def.inputs.includes(res)) continue;
      if ((capped[def.output] ?? 0) > 0 || this.sellable(st).includes(def.output)) return cv;
    }
    return null;
  }

  /** Raw goods worth carrying: needed by the plan, sold directly, or fed to a converter whose output counts. */
  private wantRaw(st: State, res: string): boolean {
    return (this.cappedNeed(st)[res] ?? 0) > 0 || this.sellable(st).includes(res) || this.converterFor(st, res) !== null;
  }

  /** The prey zone's drop, when hunting is active and the drop is worth having. */
  private huntRes(st: State): string | null {
    if (!this.cp.manifest.modules.includes("hunting")) return null;
    for (const z of st.preyZones) {
      for (const r of Object.keys(this.cp.animals[z.animal]!.drops)) if (this.wantRaw(st, r)) return r;
    }
    return null;
  }

  private huntedBy(st: State, res: string): boolean {
    return st.residents.some((r) => r.status === "ok" && this.cp.roles[r.role]?.behavior === "gather_deliver"
      && r.assign.from != null && this.cp.animals[r.assign.from]?.drops[res] !== undefined);
  }

  /** Automate goals: once suppliers, a cashier and a core supplier run the economy, the player stops depositing. */
  private handsOff(st: State): boolean {
    if (!this.pol.handsOff || !st.sales || this.nextStep(st) !== null) return false;
    return this.coreSupplied(st) && this.cashier(st) && st.sales.sells.some((r) => this.supplied(st, r));
  }

  /** Inside every closed ring (or no rings). */
  private insideRings(p: Vec): boolean {
    return this.rings.every((poly) => pointInPoly(p, poly));
  }

  /** Converter outputs worth making: plan needs, the shelf, goal resources, or the input of such a converter. */
  private wantedOut(st: State, res: string, depth = 0): boolean {
    if ((this.cappedNeed(st)[res] ?? 0) > 0 || this.sellable(st).includes(res)) return true;
    const g = this.cp.manifest.goal as { type: string; res?: string };
    if ((g.type === "produce" || g.type === "stockpile") && (g.res === undefined || g.res === res)) return true;
    if (depth >= 2) return false;
    for (const cv of st.converters) {
      const d = this.cp.converters[cv.type]!;
      if (d.inputs.includes(res) && d.output !== res && this.wantedOut(st, d.output, depth + 1)) return true;
    }
    return false;
  }

  score(st: State): Task[] {
    const cp = this.cp, p = st.player, tasks: Task[] = [];
    const T = (kind: TaskKind, score: number, key = "", want = 0, nodeOnly = false) => tasks.push({ kind, score, key, want, ...(nodeOnly ? { nodeOnly } : {}) });
    this.refreshSkips(st);

    // Lasso in progress: finish it.
    if (this.lasso || p.tow.length > 0) T("lasso", p.tow.length > 0 ? 78 : 60, "cont");

    // Fight hostiles that threaten the base.
    // Any hostile on the map: hostiles hitting walls or the base are urgent, the rest are met at the line.
    const threat = st.hostiles.filter((h) => h.target !== "core" || near(h.pos, st.core.pos, 330 * U));
    if (threat.length > 0) T("fight", 85);
    else if (st.hostiles.length > 0) T("fight", 66);

    // Fuel.
    const cap = this.coreCap(st), fuel = st.core.fuel, frac = fuel / cap;
    const ttl = fuel * this.burnTicks(st) - st.core.burnAcc / FP;
    const carriedFuel = this.fuelValueCarried(st);
    const hazard = st.hazard.phase !== "none";
    const toCore = this.travel(st, p.pos, st.core.pos);
    if (carriedFuel > 0 && fuel < cap) {
      const room = cap - fuel;
      let sc = frac < 0.75 || carriedFuel <= room ? 30 + (1 - frac) * 50 : 10;
      if (ttl < toCore + 6 * TPS) sc = 96;
      if (hazard && frac < 0.9) sc = Math.max(sc, 84);
      // Heat challenges and heat goals: keep the core above the floor; fill goals: top it up.
      if (this.pol.heatFloor > 0 && frac < this.pol.heatFloor + 0.2) sc = Math.max(sc, 76);
      if (this.pol.fillCore) sc = Math.max(sc, 72);
      if (this.handsOff(st) && ttl > toCore + 10 * TPS) sc = 0;
      if (sc > 0) T("feed", sc);
    }
    {
      const fuels = Object.entries(cp.core.accepts).sort((a, b) => b[1] - a[1]);
      let bi = -1, bres = "", bval = 0, bsc = -1;
      for (const [res, val] of fuels) {
        const want = Math.min(cp.resources[res]?.cap ?? 6, Math.max(2, Math.ceil((cap - fuel - carriedFuel) / val)));
        const i = this.bestNode(st, res, want, val);
        if (i < 0) continue;
        const n = st.nodes[i]!;
        const t = this.travel(st, p.pos, n.pos) + this.travel(st, n.pos, st.core.pos) + want * cp.nodes[n.type]!.rateTicks;
        const s = (want * val) / (t + 1);
        if (s > bsc) { bsc = s; bi = i; bres = res; bval = val; }
      }
      if (bi >= 0) {
        const n = st.nodes[bi]!;
        const trip = this.travel(st, p.pos, n.pos) + this.travel(st, n.pos, st.core.pos) + 6 * cp.nodes[n.type]!.rateTicks;
        const want = Math.min(cp.resources[bres]?.cap ?? 6, Math.max(2, Math.ceil((cap - fuel - carriedFuel) / bval)));
        const roomForMore = count(p.stack, bres) < (cp.resources[bres]?.cap ?? 6);
        let sc = 0;
        if (carriedFuel < cap - fuel && roomForMore) {
          if (fuel + carriedFuel <= 0 || ttl + carriedFuel * this.burnTicks(st) < trip + 8 * TPS) sc = 92;
          else if (hazard && fuel + carriedFuel < cap) sc = 82;
          else if (!this.coreSupplied(st) && frac < 0.55) sc = 44 + (0.55 - frac) * 60;
          else if (this.coreSupplied(st) && frac < 0.3) sc = 50;
          const after = (fuel + carriedFuel) / cap;
          if (this.pol.heatFloor > 0 && after < this.pol.heatFloor + 0.15) sc = Math.max(sc, 74 + (this.pol.heatFloor + 0.15 - after) * 40);
          if (this.pol.fillCore && fuel + carriedFuel < cap) sc = Math.max(sc, 62);
          if (this.handsOff(st) && sc < 92) sc = 0;
        }
        if (sc > 0) T("fuel", sc, String(bi), want);
      }
    }

    // Gate arrivals.
    if (st.gateQueue.length > 0 && cp.gate) T("admit", cp.manifest.goal.type === "population" ? 70 : 62);

    // Barrier sections before and between waves.
    const nb = this.nextBarrier(st) ?? this.nextRepair(st);
    if (nb) {
      const have = cp.resources[nb.res]?.cap === null ? st.currency : count(p.stack, nb.res);
      // A section behind rubble or another wall cannot be walked to yet; the plan moves on meanwhile.
      if (have >= Math.min(nb.cost - nb.paid, 1) && have >= nb.cost - nb.paid && this.nav.reachable(p.pos, this.barrierSpot(st, nb).pos)) T("barrier", st.waves.idx < cp.waves.length ? 80 : 55);
    }

    // Pads on the plan.
    const nx = this.nextStep(st);
    const currencyNeed = this.currencyNeedNext(st);
    if (nx) {
      const rem = this.remaining(st, nx.pad, nx.step);
      // Pay when the whole remainder is in hand, or when a full backpack of a capped cost can go in
      // (a cost larger than the backpack cap is paid in installments).
      let all = true, items = false;
      for (const [r, n] of Object.entries(rem)) {
        const capR = cp.resources[r]?.cap ?? null;
        const have = capR === null ? st.currency : count(p.stack, r);
        if (have < n) all = false;
        if (capR !== null && have >= Math.min(n, capR)) items = true;
      }
      // The med bay is urgent once someone is hurt.
      if (all || items) T("pay", nx.step.reason === "medical" ? 84 : 70, nx.step.pad);
    }

    // Currency at the register.
    const sales = st.sales;
    if (sales && sales.pileN > 0) {
      const needIt = currencyNeed > st.currency && currencyNeed <= st.currency + sales.pileN;
      T("pile", needIt ? 72 : 20 + Math.min(30, sales.pileN));
    }

    // Selling.
    if (sales) {
      const servable = sales.queue.some((q) => (sales.shelf[q.res] ?? 0) >= q.want);
      const shelfLimit = (_r: string) => cp.sales.shelfCap;
      const stockable = this.sellable(st).filter((r) => count(p.stack, r) > 0 && (sales.shelf[r] ?? 0) < shelfLimit(r));
      if (stockable.length > 0 && !this.handsOff(st)) {
        // A worthwhile load: a full backpack of it, or enough to fill every order waiting for it.
        const load = stockable.some((r) => {
          const have = count(p.stack, r), capR = cp.resources[r]?.cap ?? 6;
          const asked = sales.queue.filter((q) => q.res === r).reduce((a, q) => a + q.want, 0) - (sales.shelf[r] ?? 0);
          return have >= capR || have >= Math.max(1, asked) || this.current.kind !== "gather";
        });
        const wanted = stockable.some((r) => sales.queue.some((q) => q.res === r && (sales.shelf[r] ?? 0) < q.want));
        T("stock", !load ? 25 : wanted ? (this.pol.serveFirst ? 68 : 58) : this.pol.holdShelf ? 60 : 48);
      }
      if (!this.cashier(st) && !this.pol.holdShelf) {
        const urgent = this.pol.serveFirst && sales.queue.some((q) => q.patience < q.patienceMax / 2);
        if (servable) T("register", this.pol.serveFirst ? (urgent ? 79 : 66) : 55);
        else if (sales.queue.length > 0 && stockable.length === 0) T("register", 12);
      }
      for (const r of this.sellable(st)) {
        const onShelf = (sales.shelf[r] ?? 0) + count(p.stack, r);
        const asked = sales.queue.some((q) => q.res === r);
        const supplied = this.supplied(st, r);
        const full = this.pol.holdShelf ? onShelf >= cp.sales.shelfCap : onShelf >= (supplied ? 2 : 4) && !(asked && onShelf < 3);
        if (full || this.handsOff(st)) continue;
        if (count(p.stack, r) >= (cp.resources[r]?.cap ?? 6)) continue;
        const i = this.bestNode(st, r, 6);
        let sc = supplied ? (asked ? 30 : 15) : (asked || onShelf === 0 ? 46 : 36);
        if (this.pol.holdShelf || (this.pol.serveFirst && asked)) sc += 10;
        if (i >= 0) T("gather", sc, `${i}`, Math.min(6, (cp.resources[r]?.cap ?? 6)));
        for (const cv of st.converters) {
          if (cp.converters[cv.type]!.output === r && cv.out > 0 && count(p.stack, r) < (cp.resources[r]?.cap ?? 6)) T("fetch", sc + 2, cv.id);
        }
      }
    }

    // Converters: operate, feed and fetch for plan costs or sales.
    const capped = this.cappedNeed(st);
    for (const cv of st.converters) {
      const def = cp.converters[cv.type]!;
      const forPlan = capped[def.output] ?? 0;
      const sells = this.sellable(st).includes(def.output);
      const forSale = sells || this.wantedOut(st, def.output);
      // Overstock collapse rule on: never let an output sit at cap. Collect from a nearly full pile
      // first, even an unwanted one, and stop operating it short of the cap.
      const collapseRule = cp.stock.collapseTicks > 0;
      if (collapseRule && cv.out >= def.outCap - 2 && count(p.stack, def.output) < (cp.resources[def.output]?.cap ?? 6)) T("fetch", 85, cv.id);
      if (forPlan <= 0 && !forSale) continue;
      const opByWorker = st.residents.some((r) => r.status === "ok" && r.role === def.role && r.assign.to === cv.type && near(r.pos, cv.operatorPos, cp.convParams.operatorRange));
      // Working a machine by hand restarts the hands-off clock.
      if (cv.inQ.length > 0 && cv.out < (collapseRule ? def.outCap - 1 : def.outCap) && !opByWorker && !this.handsOff(st)) T("operate", forPlan > 0 ? 45 : 38, cv.id);
      const served = st.residents.some((r) => r.status === "ok" && r.assign.from === cv.type && this.cp.roles[r.role]?.behavior === "collect_deliver");
      // Intermediate goods (refined material for a tier-2 converter) and outputs about to overflow.
      if (forPlan <= 0 && cv.out > 0 && !served && count(p.stack, def.output) < (cp.resources[def.output]?.cap ?? 6)) {
        if (!sells) T("fetch", 50, cv.id);
        else if (this.pol.noOverload && cv.out >= def.outCap - 4) T("fetch", 72, cv.id);
      }
      if (forPlan <= 0 && !sells && !this.handsOff(st)) {
        const pipeline = cv.inQ.length + cv.out;
        const carryIn = def.inputs.find((r) => count(p.stack, r) > 0);
        const fed = st.residents.some((r) => r.status === "ok" && r.assign.to === cv.type && this.cp.roles[r.role]?.behavior !== "stand_at");
        if (carryIn && cv.inQ.length < def.inCap) T("deposit", 46, cv.id);
        else if (!carryIn && !fed && pipeline < 3) {
          for (const r of def.inputs) {
            const i = this.bestNode(st, r, 6);
            if (i >= 0) { T("gather", 40, `${i}`, 6); break; }
          }
        }
      }
      if (forPlan > 0) {
        const pipeline = cv.inQ.length + cv.out;
        if (cv.out > 0 && count(p.stack, def.output) < (cp.resources[def.output]?.cap ?? 6)) T("fetch", 52, cv.id);
        const carryIn = def.inputs.find((r) => count(p.stack, r) > 0 && !(r in cp.core.accepts && false));
        if (carryIn && cv.inQ.length < def.inCap && pipeline < forPlan) T("deposit", 47, cv.id);
        else if (!carryIn && pipeline < forPlan) {
          for (const r of def.inputs) {
            const i = this.bestNode(st, r, 6);
            if (i >= 0) { T("gather", 43, `${i}`, Math.min(6, forPlan - pipeline)); break; }
          }
        }
      }
    }

    // Drops worth picking up.
    if (st.drops.length > 0) {
      for (const d of st.drops) {
        if (count(p.stack, d.res) >= (cp.resources[d.res]?.cap ?? 6)) continue;
        const need = (capped[d.res] ?? 0) > 0 || this.pol.collect.includes(d.res);
        const sell = this.sellable(st).includes(d.res) || this.converterFor(st, d.res) !== null;
        if (!need && !sell) continue;
        T("drop", need ? 60 : 47, String(d.id));
        break;
      }
    }

    // Hunting: when nothing more urgent is on, take prey whose drop feeds a converter or the shelf.
    const hres = this.huntRes(st);
    // Hurt and something out there bites: let health come back first.
    const hurt = st.player.hp * 2 < cp.player.hp && st.prey.some((d) => d.alive && isDangerousAnimal(cp, st.preyZones[d.zone]!.animal));
    if (hurt) {
      // stay out of reach until healed
    } else if (this.pol.hunt && st.prey.some((d) => d.alive) && (hres === null || count(p.stack, hres) < (cp.resources[hres]?.cap ?? 6))) T("hunt", 50);
    else if (hres !== null && !this.huntedBy(st, hres) && count(p.stack, hres) < Math.min(cp.resources[hres]?.cap ?? 6, 4)
      && st.prey.some((d) => d.alive)) {
      T("hunt", 34);
    }

    // Raw inputs in the backpack go into the converter that turns them into something sold.
    for (const cv of st.converters) {
      const def = cp.converters[cv.type]!;
      if ((capped[def.output] ?? 0) > 0 || !this.sellable(st).includes(def.output) || this.handsOff(st)) continue;
      const carryIn = def.inputs.find((r) => !this.sellable(st).includes(r) && count(p.stack, r) > 0);
      const room = this.pol.noOverload ? def.outCap - 4 : def.outCap + 2;
      if (carryIn && cv.inQ.length < def.inCap && cv.inQ.length + cv.out < room) T("deposit", 41, cv.id);
    }

    // Lasso: rescue reachable containers when someone can house them.
    if (this.plan.lasso && !this.lasso && p.tow.length === 0) {
      // Rescued recruits wait for a roof, and a housing pad still to buy is what the "waiting" step is for.
      const room = cp.manifest.goal.type === "population" || freeSlots(st, cp) > 0 || this.plan.lasso
        || this.plan.steps.some((s) => s.reason === "housing" && !this.stepDone(st, s));
      const idle = st.captures.filter((c) => c.state === "idle" && this.nav.reachable(p.pos, c.pos)
        && (room || cp.lassoables[c.type]?.result === "bundle"));
      const timed = idle.some((c) => c.freezeTicks > 0);
      if (idle.length > 0) T("lasso", timed || this.pol.rescueAll ? 64 : 52, "start");
    }

    // Manual first (docs/ECONOMY-PLAN.md): a planned hire pad that waits only for its job to be done by
    // hand gets that job done once, the way a player learns a job before automating it.
    for (const s of this.plan.steps) {
      const e = cp.entityById[s.pad];
      if (!e || e.type !== "pad.hire" || !e.manual) continue;
      const job = jobOf(cp, e);
      if (!job || jobDone(st, job)) continue;
      const pad = st.pads.find((x) => x.id === s.pad);
      if (!pad || pad.done || (e.requires?.pad !== undefined && !st.pads.some((x) => x.id === e.requires!.pad && x.done) && !st.built.includes(e.requires.pad))) continue;
      // The first such job with something to do now (another may wait on a full hopper or an empty tray).
      const n = tasks.length;
      this.manualTask(st, job, T);
      if (tasks.length > n) break;
    }

    T("wait", 1);
    return tasks;
  }

  /** Tasks that do one job by hand: carry S to T, or operate a machine (feeding it first if empty). */
  private manualTask(st: State, job: string, T: (kind: TaskKind, score: number, key?: string, want?: number, nodeOnly?: boolean) => void): void {
    const cp = this.cp, p = st.player;
    const conv = (type: string) => st.converters.find((c) => c.type === type);
    const SC = 70;
    const carry = (from: string, to: string): void => {
      const res = cp.nodes[from]?.yields ?? cp.converters[from]?.output;
      if (!res) return;
      if (count(p.stack, res) > 0) {
        const target = conv(to);
        // A full hopper nobody works yet: work it down by hand to make room for the load.
        if (target && target.inQ.length >= cp.converters[target.type]!.inCap) T(target.out < cp.converters[target.type]!.outCap ? "operate" : "fetch", SC, target.id);
        else if (target) T("deposit", SC, target.id);
        else if (to === "store.depot" && st.depot) T("depot", SC);
        // core and kiosk deliveries are covered by the fuel and stock tasks once carrying
        return;
      }
      if (cp.nodes[from]) { const i = this.bestNode(st, res, 6); if (i >= 0) T("gather", SC, `${i}`, 2, to === "store.depot"); return; }
      const src = conv(from);
      if (src && src.out > 0) T("fetch", SC, src.id);
    };
    if (job.startsWith("carry:")) { const [from, to] = job.slice(6).split(">"); carry(from!, to!); return; }
    if (job.startsWith("operate:")) {
      const cv = conv(job.slice(8));
      if (!cv) return;
      if (cv.inQ.length > 0) T("operate", SC, cv.id);
      else { const input = cp.converters[cv.type]!.inputs[0]; const src = input ? Object.keys(cp.nodes).find((n) => cp.nodes[n]!.yields === input) ?? Object.keys(cp.converters).find((k) => cp.converters[k]!.output === input) : undefined; if (src) carry(src, cv.type); }
    }
  }

  /** On the far side of some barrier line from the core. */
  private beyondLines(st: State, h: Vec): boolean { return outsideLines(st, h); }

  /** Where to meet a hostile still walking in from outside a ring: just inside the ring on its line to the core. */
  private intercept(st: State, h: Vec): Vec | null {
    if (this.rings.length === 0 || this.insideRings(h)) return null;
    const c = st.core.pos;
    let lo = 0, hi = 1;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      const q = { x: Math.round(c.x + (h.x - c.x) * mid), y: Math.round(c.y + (h.y - c.y) * mid) };
      if (this.insideRings(q)) lo = mid; else hi = mid;
    }
    const L = Math.sqrt(d2(c, h)) || 1, back = Math.max(0, lo - (24 * U) / L);
    return this.nav.free({ x: Math.round(c.x + (h.x - c.x) * back), y: Math.round(c.y + (h.y - c.y) * back) });
  }

  /** Choose among scored tasks: best, or with priority error the runner-up. */
  private choose(tasks: Task[]): Task {
    const sorted = [...tasks].sort((a, b) => b.score - a.score || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
    if (sorted.length > 1 && this.prof.priorityErr > 0 && this.rand() < this.prof.priorityErr && sorted[1]!.kind !== "wait") return sorted[1]!;
    return sorted[0]!;
  }

  // ---------- per tick ----------

  /** One input per tick. */
  tick(st: State): { dx: number; dy: number } {
    this.nav.refresh(st);
    const P = this.prof;
    const fuelKinds: TaskKind[] = ["feed", "fuel"];
    // Re-evaluate on the profile's cadence, or at once when the task has run out.
    const target0 = this.resolve(st, this.current);
    const finished = target0 === null;
    this.since++;
    if (finished || st.tick % P.evalTicks === 0) {
      let tasks = this.score(st);
      const busy = !finished && this.since < 10 * TPS && this.current.kind !== "wait";
      if (!P.multitask && busy) tasks = tasks.filter((t) => !fuelKinds.includes(t.kind) || fuelKinds.includes(this.current.kind));
      const pick = this.choose(tasks);
      const same = pick.kind === this.current.kind && pick.key === this.current.key;
      const better = finished || pick.score > this.current.score + 8 || (pick.kind === this.current.kind && !same && pick.kind !== "lasso");
      if (same) this.current.score = pick.score;
      else if (better && (!this.pending || pick.score > this.pending.task.score + 15)) {
        // A decision already waiting out the reaction delay is kept unless something clearly more urgent appears.
        const jitter = P.reactionTicks > 1 ? Math.floor(this.rand() * (P.reactionTicks / 2 + 1)) : 0;
        this.pending = { task: pick, at: st.tick + (finished && P.reactionTicks <= 3 ? 0 : P.reactionTicks + jitter) };
      }
    }
    if (this.pending && st.tick >= this.pending.at) {
      if (this.pending.task.kind === "lasso" && this.pending.task.key === "start") this.startLasso(st);
      this.current = this.pending.task;
      this.pending = null;
      this.since = 0;
    }
    const tgt = this.resolve(st, this.current);
    return this.steer(st, tgt);
  }

  get isIdle(): boolean { return this.current.kind === "wait"; }

  /**
   * The next step for a guide arrow: the current task (or, while idle, the best-scored one) and its
   * target, read from the live state without advancing the controller. When the target lies on the
   * other side of a closed ring from the player, the step is "gate" and points at the nearest gate.
   */
  suggest(st: State, _cp?: Compiled): Suggestion | null {
    this.nav.refresh(st);
    let task = this.current;
    let tgt = task.kind === "wait" ? null : this.resolveQuiet(st, task);
    if (!tgt) {
      const best = [...this.score(st)].filter((t) => t.kind !== "wait").sort((a, b) => b.score - a.score)[0];
      if (!best) return null;
      task = best;
      if (best.kind === "lasso" && best.key === "start") {
        const c = this.pickCapture(st, st.player.pos, null);
        tgt = c ? { pos: c.pos, r: 0 } : null;
      } else tgt = this.resolveQuiet(st, best);
    }
    if (!tgt) return null;
    const map: Partial<Record<TaskKind, SuggestKind>> = { fuel: "gather", lasso: "tow" };
    let kind = (map[task.kind] ?? task.kind) as SuggestKind;
    let target = tgt.pos;
    // the bot works a machine from a spot that also reaches the hopper; a player is shown the operator plate itself
    if (task.kind === "operate") { const cv = st.converters.find((c) => c.id === task.key); if (cv) target = cv.operatorPos; }
    if (this.rings.length > 0 && this.insideRings(st.player.pos) !== this.insideRings(target) && task.kind !== "fight") {
      const g = this.nearestGate(st, st.player.pos);
      if (g) { kind = "gate"; target = g; }
    }
    return { kind, target: { ...target }, key: `${kind}:${task.key}` };
  }

  /** resolve() without disturbing the lasso memory. */
  private resolveQuiet(st: State, t: Task): Target | null {
    const mem = this.lasso ? { ...this.lasso, loop: [...this.lasso.loop] } : null;
    const r = this.resolve(st, { ...t });
    this.lasso = mem;
    return r;
  }

  private nearestGate(st: State, from: Vec): Vec | null {
    let best: Vec | null = null, bd = Infinity;
    for (const l of st.barriers) for (const s of l.sections) {
      if (!s.gate) continue;
      const m = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      const dd = d2(m, from);
      if (dd < bd) { bd = dd; best = m; }
    }
    return best;
  }

  /** Target for a task, or null when the task is done or impossible now. */
  private resolve(st: State, t: Task): Target | null {
    const cp = this.cp, p = st.player;
    switch (t.kind) {
      case "wait": return null;
      case "feed": {
        if (this.fuelValueCarried(st) === 0 || st.core.fuel >= this.coreCap(st)) return null;
        return this.ringSpot(st, st.core.pos, cp.core.range - 16 * U);
      }
      case "fuel": case "gather": {
        let n = st.nodes[Number(t.key)];
        if (!n) return null;
        const res = cp.nodes[n.type]!.yields;
        const capN = cp.resources[res]?.cap ?? 6;
        if (count(p.stack, res) >= Math.min(capN, Math.max(1, t.want))) return null;
        if (!n.enabled || n.stock === 0) {
          const i = this.bestNode(st, res, t.want);
          if (i < 0) return null;
          t.key = String(i);
          n = st.nodes[i]!;
        }
        // Stored goods come off the warehouse pickup pad when that is the shorter walk, unless the stock
        // is the point (a stockpile or haul goal) or couriers already move it.
        const keep = this.plan.goal.type === "stockpile" || this.plan.goal.type === "haul" || st.residents.some((r) => cp.roles[r.role]?.behavior === "haul");
        const d = st.depot, k = d && !t.nodeOnly && !keep ? d.stores.indexOf(res) : -1;
        if (d && k >= 0 && (d.stock[res] ?? 0) > 0) {
          const at = depotPickup(d, cp, k);
          if (this.travel(st, p.pos, at) < this.travel(st, p.pos, n.pos)) return { pos: at, r: 6 * U };
        }
        return this.ringSpot(st, n.pos, cp.nodes[n.type]!.range - 12 * U);
      }
      case "stock": {
        const s = st.sales;
        if (!s || !s.sells.some((r) => count(p.stack, r) > 0 && (s.shelf[r] ?? 0) < cp.sales.shelfCap)) return null;
        if (this.pol.holdShelf) {
          // Stock from the far side of the shelf, out of the clerk pad's reach, so nobody gets served.
          const dx = s.pos.x - s.register.x, dy = s.pos.y - s.register.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
          const d = cp.sales.range - 12 * U;
          return { pos: this.nav.free({ x: Math.round(s.pos.x + (dx / L) * d), y: Math.round(s.pos.y + (dy / L) * d) }), r: 4 * U };
        }
        return { pos: this.shopSpot(st), r: 6 * U };
      }
      case "register": {
        const s = st.sales;
        if (!s || this.cashier(st)) return null;
        if (!s.queue.some((q) => (s.shelf[q.res] ?? 0) >= q.want) && this.since > 2 * TPS) return null;
        return { pos: this.shopSpot(st), r: 6 * U };
      }
      case "pile": {
        const s = st.sales;
        if (!s || s.pileN <= 0) return null;
        return { pos: s.pile, r: 14 * U };
      }
      case "pay": {
        const pad = st.pads.find((x) => x.id === t.key);
        const step = this.plan.steps.find((s) => s.pad === t.key);
        if (!pad || !step || this.stepDone(st, step) || !pad.visible || pad.locked) return null;
        if (pad.done) return null;
        const rem = this.remaining(st, pad, step);
        const payable = Object.entries(rem).some(([r]) => (cp.resources[r]?.cap === null ? st.currency > 0 : count(p.stack, r) > 0));
        if (!payable && Object.keys(rem).length > 0) return null;
        return { pos: pad.pos, r: 14 * U };
      }
      case "barrier": {
        const b = this.nextBarrier(st) ?? this.nextRepair(st);
        if (!b) return null;
        const have = cp.resources[b.res]?.cap === null ? st.currency : count(p.stack, b.res);
        if (have <= 0) return null;
        return this.barrierSpot(st, b);
      }
      case "operate": case "deposit": {
        const cv = st.converters.find((c) => c.id === t.key);
        if (!cv) return null;
        const def = cp.converters[cv.type]!;
        if (t.kind === "operate" && (cv.inQ.length === 0 || cv.out >= def.outCap)) return null;
        if (t.kind === "deposit" && (!def.inputs.some((r) => count(p.stack, r) > 0) || cv.inQ.length >= def.inCap)) return null;
        if (t.kind === "deposit") return this.ringSpot(st, cv.pos, def.range - 10 * U);
        // Operating from the spot that also reaches the input hopper, so one stop does both.
        return { pos: this.convSpot(cv.pos, cv.operatorPos, def.range, cp.convParams.playerOperateRange), r: 1 * U };
      }
      case "depot": {
        const d = st.depot;
        if (!d || !p.stack.some((r) => cp.resources[r]?.category !== "currency")) return null;
        return { pos: depotDrop(d, cp), r: 6 * U };
      }
      case "fetch": {
        const cv = st.converters.find((c) => c.id === t.key);
        if (!cv) return null;
        const out = cp.converters[cv.type]!.output;
        if (cv.out <= 0 || count(p.stack, out) >= (cp.resources[out]?.cap ?? 6)) return null;
        return { pos: cv.pickupPos, r: 12 * U };
      }
      case "drop": {
        const d = st.drops.find((x) => String(x.id) === t.key);
        if (!d || count(p.stack, d.res) >= (cp.resources[d.res]?.cap ?? 6)) return null;
        return { pos: d.pos, r: 6 * U };
      }
      case "admit": {
        const g = cp.gate;
        if (!g || st.gateQueue.length === 0) return null;
        return { pos: { x: g.pos.x, y: g.pos.y + g.admitOffsetY }, r: g.admitRange - 20 * U };
      }
      case "fight": {
        // Base attackers first, then walkers already past the line, then hostiles hitting a wall.
        let best = null as Vec | null, bd = Infinity;
        for (const h of st.hostiles) {
          const rank = h.target === "base" ? 0 : h.target === "core" && !this.beyondLines(st, h.pos) ? 1 : h.target === "barrier" ? 2 : 3;
          const dd = rank * 1e14 + d2(h.pos, p.pos);
          if (dd < bd) { bd = dd; best = h.pos; }
        }
        if (!best) return null;
        if (near(p.pos, best, cp.player.attackRange - 8 * U)) return { pos: p.pos, r: 1 };
        const bh = st.hostiles.find((h) => h.pos === best)!;
        if (bh.target === "core") { const ip = this.intercept(st, best); if (ip) return { pos: ip, r: 6 * U }; }
        // Approach from the core side so a wall between us never blocks the swing.
        const dx = st.core.pos.x - best.x, dy = st.core.pos.y - best.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = Math.min(30 * U, L);
        const spot = this.nav.free({ x: Math.round(best.x + (dx / L) * off), y: Math.round(best.y + (dy / L) * off) });
        return { pos: spot, r: 3 * U };
      }
      case "lasso": return this.lassoTarget(st);
      case "hunt": {
        const res = this.huntRes(st);
        if (!this.pol.hunt && (res === null || count(p.stack, res) >= Math.min(cp.resources[res]?.cap ?? 6, 4))) return null;
        if (this.pol.hunt && res !== null && count(p.stack, res) >= (cp.resources[res]?.cap ?? 6)) return null;
        let best: Vec | null = null, bd = Infinity, beast = false;
        for (const d of st.prey) {
          if (!d.alive) continue;
          const dd = d2(d.pos, p.pos);
          if (dd < bd) { bd = dd; best = d.pos; beast = cp.animals[st.preyZones[d.zone]!.animal]!.aggroRange > 0; }
        }
        if (!best) return null;
        // A dangerous animal is softened up from range: the player auto-fires at it inside rangedRange, so hold
        // there (it charges onto the swing) instead of walking into its bite.
        if (beast && cp.player.rangedRange > 0) {
          if (near(p.pos, best, cp.player.rangedRange - 8 * U)) return { pos: p.pos, r: 1 };
          return { pos: best, r: cp.player.rangedRange - 15 * U };
        }
        // Close enough for the auto-attack; stand still while the swing lands.
        if (near(p.pos, best, cp.player.attackRange - 10 * U)) return { pos: p.pos, r: 1 };
        return { pos: best, r: cp.player.attackRange - 14 * U };
      }
    }
  }

  /** Just on the core side of the section so the finished wall pushes us inward. */
  private barrierSpot(st: State, b: { a: Vec; b: Vec }): Target {
    const mid = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
    const dx = st.core.pos.x - mid.x, dy = st.core.pos.y - mid.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    return { pos: { x: Math.round(mid.x + (dx / L) * 10 * U), y: Math.round(mid.y + (dy / L) * 10 * U) }, r: 5 * U };
  }

  private shopSpot(st: State): Vec {
    const s = st.sales!;
    const dx = s.register.x - s.pos.x, dy = s.register.y - s.pos.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    // Between the shelf and the register: inside the shelf range and the register range.
    const t = Math.max(L - this.cp.sales.registerRange + 10 * U, Math.min(L, this.cp.sales.range - 14 * U));
    return { x: Math.round(s.pos.x + (dx / L) * t), y: Math.round(s.pos.y + (dy / L) * t) };
  }

  private convSpot(pos: Vec, op: Vec, range: number, opRange: number): Vec {
    const dx = op.x - pos.x, dy = op.y - pos.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    const lo = L - opRange, hi = range;
    if (lo >= hi) return op;
    const t = (lo + hi) / 2;
    return { x: Math.round(pos.x + (dx / L) * t), y: Math.round(pos.y + (dy / L) * t) };
  }

  /** A standing point within r of center, on the side nearest the player, clear of walls and unwanted pads. */
  private ringSpot(st: State, center: Vec, r: number): Target {
    const p = st.player.pos;
    if (near(p, center, r) && !this.inAvoid(st, p)) return { pos: p, r: r };
    let best: Vec | null = null, bd = Infinity;
    for (const [cx, cy] of DIRS) {
      const q = { x: Math.round(center.x + (cx * r) / 1000), y: Math.round(center.y + (cy * r) / 1000) };
      if (this.nav.isBlocked(q) || this.inAvoid(st, q)) continue;
      const dd = d2(q, p);
      if (dd < bd) { bd = dd; best = q; }
    }
    return { pos: best ?? center, r: 6 * U };
  }

  private avoidCircles(st: State): Circle[] {
    const want = this.current.kind === "pay" ? this.current.key : null;
    const out: Circle[] = [];
    for (const pad of st.pads) {
      if (pad.done || !pad.visible || pad.id === want) continue;
      const e = this.cp.entityById[pad.id] as { big?: boolean } | undefined;
      const r = (e?.big ? this.cp.pads.bigRange : this.cp.pads.range) + 8 * U;
      out.push({ x: pad.pos.x, y: pad.pos.y, r });
    }
    return out;
  }

  private inAvoid(st: State, q: Vec): boolean {
    for (const c of this.avoidCircles(st)) if (near(q, { x: c.x, y: c.y }, c.r)) return true;
    return false;
  }

  // ---------- lasso ----------

  private startLasso(st: State): void {
    const p = st.player.pos;
    const best = this.pickCapture(st, p, null);
    if (!best) { this.lasso = null; return; }
    this.lasso = { capture: best.id, loop: this.loopAround(best.pos), idx: -1, phase: "loop", flip: 0 };
  }

  /**
   * The next captive to loop: pods on a freeze timer first, most urgent that can still be reached in
   * time, else the nearest. `within` limits the search (chaining another captive onto a tow).
   */
  private pickCapture(st: State, from: Vec, within: number | null): State["captures"][number] | null {
    let best: State["captures"][number] | null = null, bs = Infinity;
    const sp = this.speed(st);
    for (const c of st.captures) {
      if (c.state !== "idle" || !this.nav.reachable(from, c.pos)) continue;
      const dd = Math.sqrt(d2(c.pos, from));
      if (within !== null && dd > within) continue;
      const trip = (dd + Math.sqrt(d2(c.pos, st.core.pos))) / sp + 6 * TPS;
      let sc = dd;
      if (c.freezeTicks > 0) sc = c.freezeTicks > trip ? c.freezeTicks * sp * 0.25 - 1e9 : dd + 1e7;
      if (sc < bs) { bs = sc; best = c; }
    }
    return best;
  }

  private loopAround(c: Vec): Vec[] {
    for (const R of [40, 34, 28, 24]) {
      const pts = DIRS.map(([x, y]) => ({ x: Math.round(c.x + (x * R * U) / 1000), y: Math.round(c.y + (y * R * U) / 1000) }));
      if (pts.every((q) => !this.nav.isBlocked(q))) return pts;
    }
    const R = 24;
    return DIRS.map(([x, y]) => this.nav.free({ x: Math.round(c.x + (x * R * U) / 1000), y: Math.round(c.y + (y * R * U) / 1000) }));
  }

  private lassoTarget(st: State): Target | null {
    const p = st.player;
    const L = this.lasso;
    if (!L) {
      if (p.tow.length === 0) return null;
      this.lasso = { capture: -1, loop: [], idx: 0, phase: "return", flip: 0 };
      return this.lassoTarget(st);
    }
    if (L.phase === "loop") {
      const cap = st.captures.find((c) => c.id === L.capture);
      if (!cap || cap.state !== "idle") {
        // Captured (or gone): grab another nearby one if the chain has room, else head home.
        // Keep chaining while the chain has room: nearby captives always, farther ones until the tow target.
        const urgent = st.captures.some((c) => c.state === "towed" && c.freezeTicks > 0 && c.freezeTicks < 20 * TPS);
        const reach = p.tow.length < this.pol.towWant ? 420 * U : 260 * U;
        const more = urgent ? null : this.pickCapture(st, p.pos, reach);
        if (more && p.tow.length < this.cp.lasso.maxTowed && p.tow.length > 0) {
          this.lasso = { capture: more.id, loop: this.loopAround(more.pos), idx: -1, phase: "loop", flip: 0 };
          return this.lassoTarget(st);
        }
        if (p.tow.length === 0) { this.lasso = null; return null; }
        L.phase = "return";
        return this.lassoTarget(st);
      }
      if (L.idx < 0) {
        // Not outside yet or not at the loop: walk to the nearest loop point first.
        let bi = 0, bd = Infinity;
        L.loop.forEach((q, i) => { const dd = d2(q, p.pos); if (dd < bd) { bd = dd; bi = i; } });
        const q = L.loop[bi]!;
        if (near(p.pos, q, 8 * U) && outsideLines(st, p.pos)) {
          L.loop = [...L.loop.slice(bi), ...L.loop.slice(0, bi), ...L.loop.slice(bi, bi + 3)];
          L.idx = 1;
        }
        return { pos: q, r: 4 * U };
      }
      if (L.idx >= L.loop.length) {
        // Loop walked but no capture: try again from where we stand.
        L.idx = -1;
        L.loop = this.loopAround(cap.pos);
        return this.lassoTarget(st);
      }
      const q = L.loop[L.idx]!;
      if (near(p.pos, q, 7 * U)) L.idx++;
      return { pos: q, r: 2 * U };
    }
    // Return: pull the chain through the safe radius until every captive is releasing.
    if (p.tow.length === 0) { this.lasso = null; return null; }
    const core = st.core.pos;
    const side = L.flip % 2 === 0 ? 1 : -1;
    const dx = core.x - p.pos.x, dy = core.y - p.pos.y, Ld = Math.sqrt(dx * dx + dy * dy) || 1;
    const insideR = near(p.pos, core, 70 * U);
    let tgt: Vec;
    if (!insideR) tgt = { x: core.x - Math.round((dx / Ld) * 40 * U), y: core.y - Math.round((dy / Ld) * 40 * U) };
    else tgt = { x: core.x + side * 60 * U, y: core.y + Math.round((dy / Ld) * 50 * U) };
    if (insideR && near(p.pos, tgt, 10 * U)) L.flip++;
    return { pos: this.nav.free(tgt), r: 6 * U };
  }

  // ---------- steering ----------

  /** Last target and waypoint, for debugging and stall reports. */
  debug: { target: Target | null; waypoint: Vec | null } = { target: null, waypoint: null };

  private steer(st: State, tgt: Target | null): { dx: number; dy: number } {
    const p = st.player.pos;
    this.debug.target = tgt;
    const moved = d2(p, this.lastPos) > 0;
    this.lastPos = { ...p };
    if (!tgt || near(p, tgt.pos, tgt.r)) {
      this.stuck = 0;
      // Never stand still outside the heat with a tow: the line would go slack and drop everyone.
      if (st.player.tow.length > 0 && !near(p, st.core.pos, safeRadius(st, this.cp))) {
        const dx = st.core.pos.x - p.x, dy = st.core.pos.y - p.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
        return this.emit({ dx: Math.round((dx / L) * FP), dy: Math.round((dy / L) * FP) });
      }
      return this.emit({ dx: 0, dy: 0 });
    }
    if (!moved && (this.lastInput.dx !== 0 || this.lastInput.dy !== 0)) this.stuck++; else this.stuck = 0;
    const w = this.nav.waypoint(p, tgt.pos, this.avoidCircles(st));
    this.debug.waypoint = w;
    const dx = w.x - p.x, dy = w.y - p.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    if (L === 0) return this.emit({ dx: 0, dy: 0 });
    const sp = this.speed(st);
    let ux = (dx / L) * FP, uy = (dy / L) * FP;
    if (L < sp) { ux = (dx / sp) * FP; uy = (dy / sp) * FP; }
    // Route wander: a slowly changing perpendicular push.
    const noise = this.prof.routeNoise;
    if (noise > 0) {
      if (st.tick >= this.wanderTick) { this.wander = (this.rand() * 2 - 1) * noise; this.wanderTick = st.tick + 8 + Math.floor(this.rand() * 16); }
      const k = L < 30 * U ? this.wander * (L / (30 * U)) : this.wander;
      const px = -uy, py = ux;
      ux += px * k; uy += py * k;
    }
    if (this.stuck > 6) {
      // Wedged against something: sidestep perpendicular for a moment.
      const side = (Math.floor(st.tick / 20) % 2 === 0 ? 1 : -1);
      const ox = ux;
      ux = -uy * side; uy = ox * side;
    }
    return this.emit({ dx: Math.round(ux), dy: Math.round(uy) });
  }

  /** Input timing noise: occasionally the previous input is held a few ticks longer. */
  private emit(inp: { dx: number; dy: number }): { dx: number; dy: number } {
    const n = this.prof.routeNoise;
    if (this.holdLeft > 0) { this.holdLeft--; return this.lastInput; }
    if (n > 0 && this.rand() < n * 0.08) this.holdLeft = 1 + Math.floor(this.rand() * (2 + n * 4));
    this.lastInput = inp;
    return inp;
  }
}

/** Sixteen unit directions in thousandths, so no trig runs in the bot. */
const DIRS: readonly (readonly [number, number])[] = [
  [1000, 0], [924, 383], [707, 707], [383, 924], [0, 1000], [-383, 924], [-707, 707], [-924, 383],
  [-1000, 0], [-924, -383], [-707, -707], [-383, -924], [0, -1000], [383, -924], [707, -707], [924, -383],
];
