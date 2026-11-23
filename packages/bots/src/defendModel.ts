import type { Content, Manifest } from "@fo/content";
import fitJson from "../data/defendFit.json";

// P9 attack-defence model, v0 (BACKLOG #16). A pure function of a defend manifest and the content tables:
// a small per-lane simulation of defender damage per second against attackers in flight, reinvesting the
// scrap the kills drop. Output is the pressure ratio rho = damage dealt to what can be lost (gate hp, then
// base health) / that total; rho < 1 is a win. No sim imports: floats are fine here (generator, not sim).
//
// Fitted numbers (see DEFEND_FIT and docs/RELEASE-2.md): eta (overkill/pickup loss on bought dps), presence
// (share of time the commander is shooting), and one skill discount per bot rung. Efficiency e_k per tier
// is not fitted: it comes straight from the price list (dps gained / scrap) in the manifest's pads.

export interface DefendFit {
  /** Overkill: multiplier on tower and guard dps (out-of-range shots, leashing). */
  eta: number;
  /** Commander's average share of time shooting at the lane. */
  presence: number;
  /** Per rung: share of eta and presence a bot of that skill realises (good = 1). */
  skill: Record<string, number>;
  /** Guards the buyer can field (idle residents are the limit in play). */
  guardsMax: number;
  /** Distance attackers walk under fire before contact (tower range less stand-off, plus guard sorties). */
  reach: number;
  /** Guards bought before any strategy order applies (the bots' FIRST_GUARDS). */
  firstGuards: number;
  /** Seconds from gate to base once the gate is down. */
  innerWalk: number;
  /** Seconds between a kill and the scrap reaching the wallet, beyond the walk. */
  pickupDelay: number;
  /** Share of the walk to a drop (and to a map pile) the commander really spends. */
  walkShare: number;
  /** Share of the map's scrap piles the commander gathers. */
  pileUse: number;
  /** Weight of core feeding (burn rate / gather rate) taken off the commander's shooting time. */
  feedWeight: number;
  /** Attacker hp per budget point leaked at the break (report only). */
  leakH: number;
  /** Residual correction on the model's breaking multiplier: sim = exp(b) * model^a. */
  residual: { a: number; b: number };
}

export interface FitFile extends DefendFit { engine: string; content: string; fittedOn?: string; note?: string }
/** The fitted behaviour constants (data/defendFit.json), tagged with the engine and content version they were fitted on. Refit with pnpm defend:refresh. */
export const DEFEND_FIT_FILE: FitFile = fitJson as FitFile;
export const DEFEND_FIT: DefendFit = fitJson as DefendFit;

type Json = Record<string, any>;
interface Buy { id: string; cost: number; dps: number; kind: "tower" | "guard"; tower?: number; tier?: number; wave: number }
interface Body { hp: number; enter: number; speed: number; dmg: number; drop: number; contactAt: number }

export interface DefendInput {
  waves: { t: number; gap: number; side: string; bodies: { hp: number; speed: number; dmg: number; drop: number }[] }[];
  buys: Buy[];
  /** Guard price list entry (repeatable). */
  guard: { cost: number; growth: number; dps: number } | null;
  start: number;
  gateHp: number;
  baseHp: number;
  baseHit: number;
  gateHit: number;
  quiet: number;
  /** Player walk speed and the range drops are pulled in from (content defaults). */
  speed: number;
  pickupRange: number;
  /** Map scrap piles (node.salvage_pile): walk distance from the core, stock, extraction rate. */
  piles: { dist: number; stock: number; rate: number }[];
  /** Core feeding: seconds one fuel unit lasts, and the player's fuel-scrap gather rate (units per second). */
  burn: number;
  fuelRate: number;
  /** When the game ends the run (a survive goal's seconds, else level.budgetSeconds); Infinity when the level has no clock. A base still standing then is a win. */
  endAt: number;
  laneLen: Record<string, number>;
  playerDps: number;
  /** defense.maxLive and defense.overlapMin (S1): waves on the field at once, and the least seconds between two starts. 1 = one at a time. */
  maxLive: number;
  overlapMin: number;
  /** The barracks Lv2 pad (S0 "drones"): price and the troops it trains (one per `every` s, up to `max`, `dps` each). */
  drone: { id: string; cost: number; every: number; max: number; dps: number } | null;
}

/** The fixed defence strategies the generator probes (spec section 2): the order the model buys in. */
export type ModelStrategy = "turrets_first" | "guards_first" | "drones_first";
/** Start the run from a live state (defend S3): time, wallet, pads already built (by pad id), guards fielded, drone upgrade built, waves already started; `waves` stops after that many more waves have cleared. */
export interface ModelFrom { t: number; scrap: number; bought: ReadonlySet<string>; guards: number; drone: boolean; waveIdx: number; waves?: number }
export interface PredictOptions { from?: ModelFrom; dt?: number; strategy?: ModelStrategy | undefined; /** Multiplies every wave's attacker count (breaking-volume probe). */ volume?: number; /** Per-wave multipliers (wave index from 0; missing = `volume`), the defend gap placement (S4). */ volumes?: number[]; /** Replaces fit.eta (per-strategy fit). */ eta?: number }

/** A game number from the content tables or the manifest; a missing one is an error, never a silent default. */
function need(v: unknown, what: string): number {
  const n = Number(v);
  if (v === undefined || v === null || !Number.isFinite(n)) throw new Error(`defendModel: missing game number ${what}`);
  return n;
}

const towerDps = (c: Content, tier: number): number => {
  const s = c.structures["struct.ranged_defense"] as Json | undefined;
  const t = s?.["tiers"] as { rate: number }[] | undefined;
  const dmg = need(s?.["damage"], "struct.ranged_defense.damage");
  return t && t[tier - 1] ? dmg / need(t[tier - 1]!.rate, "struct.ranged_defense.tiers.rate") : 0;
};

/** Read what the model needs from a manifest (the price list comes from its pads, not a level-wide counter). */
export function defendInput(m: Manifest, c: Content, coinRate = 0): DefendInput {
  const mm = m as unknown as Json;
  const ents: Json[] = mm["entities"] ?? [];
  const D = (k: string) => need(mm["params"]?.[k] ?? c.defaults[k], k);
  const ring = ents.find((e) => e["type"] === "barrier.line");
  const W = need(mm["map"]?.w, "map.w"), H = need(mm["map"]?.h, "map.h");
  const core = ents.find((e) => e["type"] === "sink.core");
  const gates: number[] = ring?.["gates"] ?? [];
  const laneLen: Record<string, number> = {};
  const pts: number[][] = ring?.["points"] ?? [];
  for (const gi of gates) {
    const a = pts[gi]!, b = pts[(gi + 1) % pts.length]!;
    const x = (a[0]! + b[0]!) / 2, y = (a[1]! + b[1]!) / 2;
    const side = Math.abs(y - H / 2) >= Math.abs(x - W / 2) ? (y < H / 2 ? "n" : "s") : (x < W / 2 ? "w" : "e");
    laneLen[side] = side === "n" ? y : side === "s" ? H - y : side === "w" ? x : W - x;
  }
  const buys: Buy[] = [];
  const towers = new Map<string, number>();
  let guard: DefendInput["guard"] = null;
  let drone: DefendInput["drone"] = null;
  const hunt = c.roles["role.defender"] as Json | undefined;
  for (const e of ents) {
    // coinRate > 0 (the bots, S3): coin-priced towers count as salvage at that rate; the generator leaves it 0 and sees them as free, as before
    const cost = Number(e["cost"]?.["res.salvage"] ?? 0) + (coinRate > 0 ? Number(e["cost"]?.["res.currency"] ?? 0) / coinRate : 0);
    if (e["type"] === "pad.hire" && c.roles[e["role"]?.role]?.behavior === "guard" && cost > 0) {
      const dps = need(hunt?.["damage"], "role.defender.damage") / need(hunt?.["attackInterval"], "role.defender.attackInterval");
      guard = { cost, growth: D("pads.defenceGrowth"), dps };
    } else if (e["type"] === "pad.build" && e["build"] === "struct.barracks.t2" && cost > 0) {
      // barracks troops (content structures.struct.barracks.troops: every 5 s, at most 16, 1 damage per second each)
      const bs = c.structures["struct.barracks"] as Json | undefined, tr = bs?.["troops"] as Json | undefined;
      drone = { id: String(e["id"]), cost, every: need(tr?.["every"], "barracks.troops.every"), max: need(tr?.["max"], "barracks.troops.max"), dps: need(tr?.["damage"], "barracks.troops.damage") / need(tr?.["attackInterval"], "barracks.troops.attackInterval") };
    } else if (e["type"] === "pad.build" && String(e["build"] ?? "").startsWith("struct.ranged_defense") && cost > 0) {
      const tier = e["build"] === "struct.ranged_defense" ? 1 : Number(String(e["build"]).slice(-1));
      const id = String(e["target"] ?? e["id"]);
      const idx = tier === 1 ? towers.size : (towers.get(id) ?? 0);
      if (tier === 1) towers.set(String(e["id"]), idx);
      const gain = towerDps(c, tier) - (tier > 1 ? towerDps(c, tier - 1) : 0);
      buys.push({ id: String(e["id"]), cost, dps: gain, kind: "tower", tower: idx, tier, wave: Number(e["requires"]?.wave ?? 0) });
    }
  }
  const waves = ((mm["waves"] ?? []) as Json[]).map((w) => ({
    t: Number(w["t"]), gap: Number(w["gap"] ?? 0.5), side: String(w["side"] ?? "n"),
    bodies: Object.entries(w["counts"] as Record<string, number>).flatMap(([k, n]) => {
      const h = c.hostiles[k] as Json;
      const drop = Number(h["drops"]?.["res.salvage"] ?? 0); // a kind with no salvage drop is a real zero
      return Array.from({ length: n }, () => ({ hp: need(h["hp"], k + ".hp"), speed: need(h["speed"], "hostile.speed"), dmg: Number(h["damage"] ?? D("defense.baseDamage")), drop }));
    }),
  }));
  const pr = D("player.rangedInterval");
  const coreAt = core ? (core["at"] as number[]) : null;
  const sp = c.nodes?.["node.salvage_pile"] as Json | undefined;
  const piles = ents.filter((e) => e["type"] === "node.salvage_pile" && coreAt).map((e) => ({
    dist: Math.hypot(e["at"][0] - coreAt![0]!, e["at"][1] - coreAt![1]!), stock: need(sp?.["stock"], "node.salvage_pile.stock"), rate: need(sp?.["rate"], "node.salvage_pile.rate"),
  })).sort((a, b) => a.dist - b.dist);
  return {
    waves, buys, guard, start: D("start.currency"),
    gateHp: gates.length ? need((c.structures["struct.gate"] as Json)["hp"], "struct.gate.hp") : 0,
    baseHp: D("meters.baseHealth"), baseHit: D("defense.baseHitInterval"), gateHit: D("defense.barrierHitInterval"),
    quiet: D("defense.waveQuiet"), speed: D("player.speed"), pickupRange: D("drops.pickupRange"), piles,
    endAt: Math.min(mm["goal"]?.["type"] === "survive" ? Number(mm["goal"]["seconds"]) : Infinity, mm["params"]?.["level.budgetSeconds"] !== undefined ? Number(mm["params"]["level.budgetSeconds"]) : Infinity),
    burn: D("core.burn"), fuelRate: need((c.nodes?.["node.fuel_scrap"] as Json | undefined)?.["rate"], "node.fuel_scrap.rate"),
    laneLen: Object.keys(laneLen).length ? laneLen : { n: need(coreAt?.[1], "core.at") },
    playerDps: 1 / pr, maxLive: Math.max(1, D("defense.maxLive")), overlapMin: D("defense.overlapMin"), drone,
  };
}

export interface DefendResult { rho: number; damage: number; budget: number; perWave: { start: number; leak: number; dps: number }[]; lost: boolean; /** Attacker hit points the defenders dealt, and sent at them in all (breaking-volume probe). */ hpDealt: number; hpTotal: number }

/**
 * rho for one skill rung. `skill` scales eta and presence; everything else is the level's own numbers.
 * `opts.strategy` fixes the buy order (S0): turrets_first buys the first guards, then every tower pad, then guards, then the
 * barracks; guards_first all guards, towers, barracks; drones_first the first guards, the barracks as soon as it is affordable,
 * guards, towers. Under a strategy the order is strict (an unaffordable better-ranked purchase is waited for). Without a
 * strategy the buy is by dps per scrap, as before.
 */
export function predictRho(inp: DefendInput, fit: DefendFit, skill: number, dtOrOpts: number | PredictOptions = 0.25): DefendResult {
  const o: PredictOptions = typeof dtOrOpts === "number" ? { dt: dtOrOpts } : dtOrOpts;
  const dt = o.dt ?? 0.25, strategy = o.strategy, eta = o.eta ?? fit.eta;
  const sides = [...new Set(inp.waves.map((w) => w.side))];
  const lanes = Math.max(1, sides.length);
  const budget = inp.gateHp + inp.baseHp;
  let scrap = inp.start, t = 0, damage = 0, gate = inp.gateHp, base = inp.baseHp, hpDealt = 0, hpTotal = 0;
  const bought = new Set<number>();
  let towersDps = 0, guards = 0, waveIdx = 0, active = false, quietUntil = 0, lastStart = -1e9, droneAt = -1;
  const pending: (Body & { at: number; lane: string; w: number })[] = [];
  const live: (Body & { lane: string; w: number })[] = [];
  const perWave: DefendResult["perWave"] = [];
  const towerOwned = new Set<number>();
  const FIRST = fit.firstGuards;
  // scrap income not yet in the wallet: kill drops (walk + pickup delay) and the map scrap piles (walked to one after another)
  const incoming: { at: number; n: number }[] = [];
  const dropWalk = Math.max(0, fit.reach - inp.pickupRange) / inp.speed;
  const dropDelay = fit.pickupDelay + fit.walkShare * dropWalk;
  let pileAt = o.from ? o.from.t : 0;
  for (const p of inp.piles) { pileAt += (fit.walkShare * 2 * p.dist) / inp.speed + p.stock / p.rate; incoming.push({ at: pileAt, n: p.stock * fit.pileUse }); }
  // the commander's time core feeding takes (burn rate over gather rate), off shooting
  const feed = Math.min(1, inp.burn > 0 ? 1 / inp.burn / inp.fuelRate : 0) * fit.feedWeight;
  const presence = fit.presence * (1 - feed);
  const droneDps = (): number => (droneAt < 0 || !inp.drone ? 0 : Math.min(inp.drone.max, Math.floor((t - droneAt) / inp.drone.every)) * inp.drone.dps);
  // rank of a purchase class under the strategy (lower buys first); the default has no ranks
  const rank = (cls: "tower" | "guard" | "drone"): number => {
    if (!strategy) return 0;
    if (cls === "guard" && guards < FIRST) return 0;
    return strategy === "turrets_first" ? (cls === "tower" ? 1 : cls === "guard" ? 2 : 3)
      : strategy === "guards_first" ? (cls === "guard" ? 1 : cls === "tower" ? 2 : 3)
      : cls === "drone" ? 1 : cls === "guard" ? 2 : 3;
  };
  const buyNext = () => {
    for (;;) {
      let best = -1, be = 0, bg = false, br = Infinity, bd = false, blocked = Infinity;
      const consider = (idx: number, e: number, r: number, g: boolean, d: boolean) => {
        if (r < br || (r === br && e > be)) { br = r; be = e; best = idx; bg = g; bd = d; }
      };
      inp.buys.forEach((b, i) => {
        if (bought.has(i) || b.wave > waveIdx) return;
        if (b.tier! > 1 && !towerOwned.has(b.tower!)) return;
        if (b.cost > scrap) { blocked = Math.min(blocked, rank("tower")); return; }
        consider(i, b.dps / b.cost, rank("tower"), false, false);
      });
      if (inp.guard && guards < fit.guardsMax) {
        const gc = Math.ceil(inp.guard.cost * inp.guard.growth ** guards);
        if (gc <= scrap) consider(-2, inp.guard.dps / gc, rank("guard"), true, false); else blocked = Math.min(blocked, rank("guard"));
      }
      if (strategy && inp.drone && droneAt < 0) {
        if (inp.drone.cost <= scrap) consider(-3, (inp.drone.dps * inp.drone.max) / inp.drone.cost, rank("drone"), false, true); else blocked = Math.min(blocked, rank("drone"));
      }
      if (best === -1 || (strategy && blocked < br)) return;
      if (bd) { scrap -= inp.drone!.cost; droneAt = t; }
      else if (bg) { scrap -= Math.ceil(inp.guard!.cost * inp.guard!.growth ** guards); guards++; towersDps += inp.guard!.dps; }
      else { const b = inp.buys[best]!; scrap -= b.cost; bought.add(best); towersDps += b.dps; if (b.tier === 1) towerOwned.add(b.tower!); }
    }
  };
  let stopAt = Infinity;
  if (o.from) {
    const f = o.from;
    t = f.t; scrap = f.scrap; waveIdx = f.waveIdx; guards = f.guards; towersDps += guards * (inp.guard?.dps ?? 0);
    inp.buys.forEach((b, i) => { if (f.bought.has(b.id)) { bought.add(i); towersDps += b.dps; if (b.tier === 1) towerOwned.add(b.tower!); } });
    if (f.drone && inp.drone) droneAt = t;
    if (f.waves !== undefined) stopAt = f.waveIdx + f.waves;
  }
  // the run ends 600 s after the last wave starts, longer when scaled-up waves are still spawning then (breaking-volume probes)
  const spawnSpan = Math.max(0, ...inp.waves.map((w, i) => w.bodies.length * (o.volumes?.[i] ?? o.volume ?? 1) * w.gap));
  const horizon = Math.min((inp.waves.at(-1)?.t ?? 0) + 600 + spawnSpan + t, inp.endAt);
  let lost = false;
  const liveWaves = new Set<number>();
  for (; t < horizon && !lost; t += dt) {
    for (let i = incoming.length - 1; i >= 0; i--) if (t >= incoming[i]!.at) { scrap += incoming[i]!.n; incoming.splice(i, 1); }
    buyNext();
    const w = inp.waves[waveIdx];
    // one wave at a time (maxLive 1, today's rule), or another while fewer than maxLive are on the field, overlapMin after the last start
    const startOk = inp.maxLive > 1 && liveWaves.size > 0 ? liveWaves.size < inp.maxLive && t >= lastStart + inp.overlapMin : !active && t >= quietUntil;
    if (w && t >= w.t && startOk) {
      active = true; waveIdx++; lastStart = t; liveWaves.add(waveIdx);
      perWave.push({ start: t, leak: 0, dps: (towersDps * eta + droneDps()) * skill });
      const walkLen = inp.laneLen[w.side] ?? 600;
      const vol = o.volumes?.[waveIdx - 1] ?? o.volume ?? 1;
      // volume probe: vol sends floor(vol) copies of every body, plus one more for the fraction of them (evenly spread)
      let k = 0, carry = 0;
      for (const b of w.bodies) {
        carry += vol % 1;
        const copies = Math.floor(vol) + (carry >= 1 - 1e-9 ? 1 : 0);
        if (carry >= 1 - 1e-9) carry -= 1;
        for (let c = 0; c < copies; c++, k++) {
          const walk = Math.max(0, walkLen - fit.reach) / b.speed;
          hpTotal += b.hp;
          pending.push({ ...b, at: t + k * w.gap, lane: w.side, w: waveIdx, enter: t + k * w.gap + walk, contactAt: t + k * w.gap + walk + fit.reach / b.speed });
        }
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (t >= pending[i]!.at) { live.push(pending[i]!); pending.splice(i, 1); }
    // defender damage this step, spread over the lanes; first in, first killed
    const dps = ((towersDps * eta + inp.playerDps * presence) * skill + droneDps()) / lanes;
    for (const lane of sides.length ? sides : ["n"]) {
      let cap = dps * dt;
      for (let i = 0; i < live.length && cap > 0; i++) {
        const b = live[i]!;
        if (b.lane !== lane || t < b.enter) continue;
        const take = Math.min(cap, b.hp);
        b.hp -= take; cap -= take; hpDealt += take;
        if (b.hp <= 1e-9) { incoming.push({ at: t + dropDelay, n: b.drop }); live.splice(i, 1); i--; }
      }
    }
    // attackers in contact hit the gate, then the base
    for (const b of live) {
      if (t < b.contactAt) continue;
      let d: number;
      if (gate > 0) { d = (b.dmg * dt) / inp.gateHit; const hit = Math.min(d, gate); gate -= hit; damage += hit; if (perWave.length) perWave.at(-1)!.leak += hit; }
      else if (t >= b.contactAt + fit.innerWalk || inp.gateHp === 0) { d = (b.dmg * dt) / inp.baseHit; const hit = Math.min(d, base); base -= hit; damage += hit; if (perWave.length) perWave.at(-1)!.leak += hit; }
    }
    if (base <= 1e-9) lost = true;
    if (waveIdx >= stopAt && !active) break;
    if (inp.maxLive > 1) {
      for (const idx of [...liveWaves]) if (!pending.some((p) => p.w === idx) && !live.some((b) => b.w === idx)) liveWaves.delete(idx);
      if (active && liveWaves.size === 0) { active = false; quietUntil = t + inp.quiet; }
    } else if (active && live.length === 0 && pending.length === 0) { active = false; quietUntil = t + inp.quiet; }
  }
  return { rho: budget > 0 ? damage / budget : 0, damage, budget, perWave, lost, hpDealt, hpTotal };
}

export interface ModelBreak { /** Residual-corrected breaking multiplier (fit.residual); raw is the uncorrected one. */ multiplier: number; raw: number; /** Attacker hp per budget point leaked at the breaking volume (spec 3: h). */ h: number }

/** Largest wave-volume multiplier the model's strategy still holds (base standing), by geometric bisection. */
export function modelBreak(inp: DefendInput, fit: DefendFit, strategy: ModelStrategy | undefined, eta: number, lo = 0.25, hi = 60, iterations = 14): ModelBreak {
  const run = (m: number) => predictRho(inp, fit, 1, { strategy, eta, volume: m });
  const fix = (m: number): number => Math.exp(fit.residual.b) * Math.pow(m, fit.residual.a);
  if (run(lo).lost) return { multiplier: 0, raw: 0, h: 0 };
  if (!run(hi).lost) return { multiplier: fix(hi), raw: hi, h: 0 };
  for (let i = 0; i < iterations; i++) { const mid = Math.sqrt(lo * hi); if (run(mid).lost) hi = mid; else lo = mid; }
  const r = run(hi);
  return { multiplier: fix(lo), raw: lo, h: r.budget > 0 ? Math.max(0, r.hpTotal - r.hpDealt) / r.budget : 0 };
}

/** Fit one strategy's eta so the model breaks at the multiplier the sim measured (bisection over eta; the model's break rises with eta). */
export function fitEta(inp: DefendInput, fit: DefendFit, strategy: ModelStrategy, simMultiplier: number, lo = 0.05, hi = 4): { eta: number; h: number; multiplier: number } {
  let a = lo, b = hi;
  for (let i = 0; i < 18; i++) { const mid = (a + b) / 2; if (modelBreak(inp, fit, strategy, mid, 0.25, 60, 8).multiplier < simMultiplier) a = mid; else b = mid; }
  const eta = (a + b) / 2, mb = modelBreak(inp, fit, strategy, eta);
  return { eta, h: mb.h, multiplier: mb.multiplier };
}
