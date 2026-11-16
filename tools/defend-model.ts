import { readFileSync } from "node:fs";
import { content as defaultContent, type Content } from "../packages/content/src/index.js";

// pnpm exec vite-node tools/defend-model.ts -- --level file.json [--level ...] [--slack 0.3] [--json]
//
// No-sim filter for defend candidates (outpost-ops #210, no-wall balance slice 4). From a level file and the
// content tables it plays the defend economy forward as a small fluid model (0.25 s steps, no sim imports):
//   - salvage banked (each kill's drop) against the price list, so the towers and guards standing by wave k;
//   - defender damage per second (commander, towers in range, guards) against the hit points arriving per second,
//     so the leak (attackers that reach the core);
//   - the leaked attackers' shots on the core against base health (the gate holds them first, with walls);
//   - whether a boss dies before it reaches the core.
// Every game number comes from the level file or content: hostile hp/speed/drops/shots, tower tiers and sites, the
// guard role, the commander's attack, defense.* geometry and timings, pad prices and pads.defenceGrowth. Towers hit
// the nearest attacker in range of their site; the commander and guards hit the attacker nearest the core within
// MODEL_FIT.reach of it; only MODEL_FIT.spend of each drop goes to defence (the good bot spends about a fifth of its
// salvage on defence without walls). MODEL_FIT holds the only fitted numbers, calibrated on 320 audit rows of
// tools/walls-sweep.ts (two 20-point sweeps, walls on and off, good bot x 3 seeds): fitted on one sweep, checked on
// the other, zero false rejects on both, the worst won row at 0.62 of base health (the reject line is 1.3).
// It only rejects: a candidate is dropped when the core damage it predicts is more than `slack` (30%) above the
// core's health. A 50-row sample of those runs is tools/defend-model.fixture.json, checked by defend-model.test.ts;
// refit with `--calibrate rows.json --grid player=.. guard=.. tower=.. spend=.. reach=..` after content changes.

type Json = Record<string, any>;
type Pt = [number, number];

/** One kind of attacker in a wave, with what the model needs from content. */
export interface Group { kind: string; n: number; hp: number; speed: number; drop: number; shot: number; every: number; boss: boolean }
export interface WaveIn { t: number; gap: number; side: string; groups: Group[] }
/** A tower purchase: socket (tower id, its site), tier, the damage per second it adds, and its range at that tier. */
export interface BuyIn { id: string; cost: number; dps: number; range: number; tower: string; at: Pt; tier: number; openWave: number }

/** Everything the model reads from a level file and content (plain JSON: the calibration fixture stores it). */
export interface ModelInput {
  id: string;
  goal: { type: string; n: number; seconds: number };
  map: { w: number; h: number };
  core: Pt;
  /** defense.baseRange (an attacker this close hits the core), spawn line distance outside the map (-defense.spawnY), spawnMarginX, laneHalfWidth. */
  baseRange: number;
  spawnOut: number;
  spawnMargin: number;
  laneHalf: number;
  /** Attack gate (middle of its section) per side; empty without walls. */
  gates: Record<string, Pt>;
  gateHp: number;
  barrierDamage: number;
  gateHitters: number;
  baseHp: number;
  baseDamage: number;
  quiet: number;
  startSalvage: number;
  /** Commander's best sustained damage per second (melee or ranged). */
  playerDps: number;
  priceGrowth: number;
  buys: BuyIn[];
  /** Guard training: price, damage per second, and the most that can be trained (the colonists the level starts with). */
  guard: { cost: number; dps: number; max: number } | null;
  waves: WaveIn[];
}

/**
 * The fitted part: shares of the commander's, guards' and towers' damage that land, the share of salvage spent on
 * defence, and how far from the core (world units) the commander and guards fight.
 */
export interface ModelFit { player: number; guard: number; tower: number; spend: number; reach: number }
/** Calibrated 2026-11-16 (engine 0.29.0) on walls-sweep audit runs: rejects 21 of 80 lost rows, none of 240 won. */
export const MODEL_FIT: ModelFit = { player: 1, guard: 0.1, tower: 1, spend: 0.2, reach: 250 };
export const DEFAULT_SLACK = 0.3;

export interface WaveOut {
  start: number;
  /** Salvage banked, tower sockets built and guards trained when the wave starts. */
  bank: number;
  towers: number;
  guards: number;
  /** Defender damage per second at the wave's start (towers counted whole), and the wave's hit points per second of its spawn. */
  dps: number;
  hpPerS: number;
  /** Attackers that reached the core, and the damage they did to it (and to the gate, with walls). */
  leaks: number;
  coreDamage: number;
  gateDamage: number;
  /** null without a boss in the wave. */
  bossDiesBeforeCore: boolean | null;
}

export interface Assessment {
  id: string;
  /** Predicted core damage up to the goal's end, over base health: 1 = the core just falls. */
  ratio: number;
  /** ratio - 1 when above 1 (how short the defence is), else 0. */
  short: number;
  reject: boolean;
  /** When the model's goal ends (s) and whether the core falls before it. */
  end: number;
  coreFalls: boolean;
  perWave: WaveOut[];
}

const sideOf = (x: number, y: number, W: number, H: number): string =>
  Math.abs(y - H / 2) >= Math.abs(x - W / 2) ? (y < H / 2 ? "n" : "s") : (x < W / 2 ? "w" : "e");

/** Read what the model needs from a level file and the content tables. */
export function modelInput(manifest: unknown, c: Content = defaultContent): ModelInput {
  const m = manifest as Json;
  const ents: Json[] = m["entities"] ?? [];
  const P = (k: string): number => {
    const v = m["params"]?.[k] ?? c.defaults[k];
    if (v === undefined) throw new Error(`defend-model: no value for ${k}`);
    return Number(v);
  };
  const W = Number(m["map"].w), H = Number(m["map"].h);
  const core = ents.find((e) => e["type"] === "sink.core");
  if (!core) throw new Error("defend-model: no core");
  const gates: Record<string, Pt> = {};
  const ring = ents.find((e) => e["type"] === "barrier.line");
  if (ring) {
    const pts: number[][] = ring["points"];
    for (const gi of (ring["gates"] ?? []) as number[]) {
      const a = pts[gi]!, b = pts[(gi + 1) % pts.length]!;
      const g: Pt = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2];
      gates[sideOf(g[0], g[1], W, H)] = g;
    }
  }
  const tower = c.structures["struct.ranged_defense"] as Json;
  const tiers = tower["tiers"] as { rate: number; range: number }[];
  const tdps = (tier: number) => (tier >= 1 && tiers[tier - 1] ? Number(tower["damage"]) / tiers[tier - 1]!.rate : 0);
  const sites = new Map<string, Pt>();
  for (const e of ents) if (e["type"] === "pad.build" && e["build"] === "struct.ranged_defense") sites.set(String(e["id"]), (e["site"] ?? e["at"]) as Pt);
  const buys: BuyIn[] = [];
  let guard: ModelInput["guard"] = null;
  for (const e of ents) {
    const cost = Number(e["cost"]?.["res.salvage"] ?? 0);
    if (e["type"] === "pad.hire" && c.roles[e["role"]?.role]?.behavior === "guard" && cost > 0) {
      const r = c.roles[e["role"].role] as Json;
      guard = { cost, dps: Number(r["damage"]) / Number(r["attackInterval"]), max: ((m["people"] ?? []) as unknown[]).length };
    } else if (e["type"] === "pad.build" && String(e["build"] ?? "").startsWith("struct.ranged_defense") && cost > 0) {
      const b = String(e["build"]);
      const tier = b === "struct.ranged_defense" ? 1 : Number(b.slice(b.lastIndexOf(".t") + 2));
      const id = String(tier === 1 ? e["id"] : e["target"]);
      buys.push({ id: String(e["id"]), cost, dps: tdps(tier) - tdps(tier - 1), range: tiers[tier - 1]?.range ?? 0, tower: id, at: sites.get(id) ?? (e["at"] as Pt), tier, openWave: Number(e["requires"]?.wave ?? 0) });
    }
  }
  const waves: WaveIn[] = ((m["waves"] ?? []) as Json[]).map((w) => ({
    t: Number(w["t"]), gap: Number(w["gap"] ?? P("defense.spawnGap")), side: String(Array.isArray(w["side"]) ? w["side"][0] : (w["side"] ?? "n")),
    groups: Object.entries(w["counts"] as Record<string, number>).map(([k, n]) => {
      const h = c.hostiles[k] as Json;
      const shot = h["shot"] as Json | undefined;
      return { kind: k, n, hp: Number(h["hp"]), speed: Number(h["speed"]), drop: Number(h["drops"]?.["res.salvage"] ?? 0),
        shot: Number(shot?.["damage"] ?? h["damage"] ?? 1), every: Number(shot?.["interval"] ?? P("defense.baseHitInterval")), boss: !!h["boss"] };
    }),
  }));
  const g = m["goal"] as Json;
  return {
    id: String(m["id"] ?? "?"),
    goal: { type: String(g["type"]), n: Number(g["n"] ?? 1), seconds: Number(g["seconds"] ?? 0) },
    map: { w: W, h: H }, core: [Number(core["at"][0]), Number(core["at"][1])],
    baseRange: P("defense.baseRange"), spawnOut: -P("defense.spawnY"), spawnMargin: P("defense.spawnMarginX"), laneHalf: P("defense.laneHalfWidth"),
    gates, gateHp: Object.keys(gates).length ? Number((c.structures["struct.gate"] as Json)["hp"]) : 0,
    barrierDamage: P("defense.barrierDamage"), gateHitters: P("defense.gateHitters"),
    baseHp: P("meters.baseHealth"), baseDamage: P("defense.baseDamage"), quiet: P("defense.waveQuiet"),
    startSalvage: Number(m["params"]?.["start.salvage"] ?? 0),
    playerDps: Math.max(P("player.attackDamage") / P("player.attackInterval"), P("player.attackDamage") / P("player.rangedInterval")),
    priceGrowth: P("pads.defenceGrowth"), buys, guard, waves,
  };
}

interface Body {
  wave: number; hp: number; speed: number; drop: number; shot: number; every: number; boss: boolean; spawn: number; side: string;
  path: Pt[]; leg: number; pos: Pt; state: "walk" | "gate" | "core"; cd: number;
}

/** Salvage the goal needs bought before it is done (turret_level, hire), else 0. */
function goalPrice(inp: ModelInput): number {
  const g = inp.goal;
  if (g.type === "turret_level") {
    let best = Infinity;
    for (const t of new Set(inp.buys.map((b) => b.tower))) {
      const steps = inp.buys.filter((b) => b.tower === t && b.tier <= g.n);
      if (steps.length >= g.n) best = Math.min(best, steps.reduce((a, b) => a + b.cost, 0));
    }
    return best;
  }
  if (g.type === "hire" && inp.guard) {
    let s = 0;
    for (let k = 0; k < g.n; k++) s += Math.ceil(inp.guard.cost * inp.priceGrowth ** k);
    return s;
  }
  return 0;
}

const frac = (x: number) => x - Math.floor(x);
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Where the k-th attacker of a wave spawns (the sim spreads them at random; the model spreads them evenly). */
function spawnAt(inp: ModelInput, side: string, k: number): Pt {
  const { w: W, h: H } = inp.map, u = frac(k * 0.6180339887 + 0.5);
  const g = inp.gates[side];
  const along = (len: number, mid: number | undefined) => (mid === undefined ? inp.spawnMargin + u * (len - 2 * inp.spawnMargin) : Math.max(0, Math.min(len, mid + (2 * u - 1) * inp.laneHalf)));
  switch (side) {
    case "n": return [along(W, g?.[0]), -inp.spawnOut];
    case "s": return [along(W, g?.[0]), H + inp.spawnOut];
    case "w": return [-inp.spawnOut, along(H, g?.[1])];
    default: return [W + inp.spawnOut, along(H, g?.[1])];
  }
}

/** Play the defend economy forward and judge the candidate. */
export function assess(inp: ModelInput, opts: { slack?: number; dt?: number; fit?: ModelFit } = {}): Assessment {
  const slack = opts.slack ?? DEFAULT_SLACK, dt = opts.dt ?? 0.25, fit = opts.fit ?? MODEL_FIT;
  const price = goalPrice(inp);
  const g = inp.goal;
  let bank = inp.startSalvage, earned = inp.startSalvage, buys = 0, guards = 0;
  const bought = new Set<number>();
  /** tower id -> its site, current damage per second and range */
  const towers = new Map<string, { at: Pt; dps: number; range: number }>();
  let waveIdx = 0, active = false, quietUntil = 0, cleared = 0, kills = 0, bossKills = 0;
  let base = inp.baseHp, damage = 0, end = -1;
  let live: Body[] = [];
  const perWave: WaveOut[] = [];
  const gate: Record<string, number> = {};
  const priceOf = (cost: number) => Math.ceil(cost * inp.priceGrowth ** buys);
  const buy = () => {
    for (;;) {
      let best = -1, be = 0;
      inp.buys.forEach((b, i) => {
        if (bought.has(i) || b.openWave > waveIdx || (b.tier > 1 && !towers.has(b.tower)) || priceOf(b.cost) > bank) return;
        const e = b.dps / priceOf(b.cost);
        if (e > be) { be = e; best = i; }
      });
      if (inp.guard && guards < inp.guard.max && priceOf(inp.guard.cost) <= bank && (inp.guard.dps * fit.guard) / priceOf(inp.guard.cost) > be) best = -2;
      if (best === -1) return;
      if (best === -2) { bank -= priceOf(inp.guard!.cost); guards++; }
      else {
        const b = inp.buys[best]!;
        bank -= priceOf(b.cost); bought.add(best);
        const tw = towers.get(b.tower) ?? { at: b.at, dps: 0, range: 0 };
        tw.dps += b.dps; tw.range = Math.max(tw.range, b.range); towers.set(b.tower, tw);
      }
      buys++;
    }
  };
  const goalDone = (t: number): boolean => {
    switch (g.type) {
      case "survive": return t >= g.seconds;
      case "waves": return cleared >= inp.waves.length;
      case "waves_survived": return cleared >= g.n;
      case "boss": return bossKills >= g.n;
      case "kills": return kills >= g.n;
      case "salvage": return earned >= g.n;
      case "turret_level": case "hire": return earned * fit.spend >= price;
      default: return true; // a goal the model does not know: never reject on it
    }
  };
  const hit = (b: Body, amount: number): number => {
    const take = Math.min(amount, b.hp);
    b.hp -= take;
    return take;
  };
  const horizon = (inp.waves.at(-1)?.t ?? 0) + 900;
  let t = 0;
  for (; t < horizon; t += dt) {
    if (goalDone(t)) { end = t; break; }
    buy();
    const w = inp.waves[waveIdx];
    if (w && t >= w.t && !active && t >= quietUntil) {
      active = true;
      const k = waveIdx++;
      gate[w.side] = inp.gateHp;
      let i = 0, hp = 0;
      for (const gr of w.groups) for (let j = 0; j < gr.n; j++, i++) {
        hp += gr.hp;
        const s = spawnAt(inp, w.side, i), gm = inp.gates[w.side];
        live.push({ wave: k, hp: gr.hp, speed: gr.speed, drop: gr.drop, shot: gr.shot, every: gr.every, boss: gr.boss, spawn: t + i * w.gap, side: w.side,
          path: gm ? [s, gm, inp.core] : [s, inp.core], leg: 1, pos: [...s], state: "walk", cd: 0 });
      }
      const tdps = [...towers.values()].reduce((a, x) => a + x.dps, 0);
      perWave.push({ start: t, bank, towers: towers.size, guards, dps: inp.playerDps * fit.player + tdps * fit.tower + guards * (inp.guard?.dps ?? 0) * fit.guard,
        hpPerS: hp / Math.max(dt, i * w.gap), leaks: 0, coreDamage: 0, gateDamage: 0, bossDiesBeforeCore: w.groups.some((gr) => gr.boss) ? true : null });
    }
    const field = live.filter((b) => t >= b.spawn);
    // towers: each hits the nearest attacker in its range
    for (const tw of towers.values()) {
      let cap = tw.dps * fit.tower * dt;
      const near = field.filter((b) => b.hp > 0 && dist(b.pos, tw.at) <= tw.range).sort((a, b) => dist(a.pos, tw.at) - dist(b.pos, tw.at));
      for (const b of near) { if (cap <= 0) break; cap -= hit(b, cap); }
    }
    // the commander and guards: anywhere on the field, the attacker nearest the core first
    let cap = (inp.playerDps * fit.player + guards * (inp.guard?.dps ?? 0) * fit.guard) * dt;
    const order = field.filter((b) => b.hp > 0 && dist(b.pos, inp.core) <= fit.reach).sort((a, b) => dist(a.pos, inp.core) - dist(b.pos, inp.core));
    for (const b of order) { if (cap <= 0) break; cap -= hit(b, cap); }
    // the dead drop their salvage
    for (const b of field) if (b.hp <= 1e-9) { bank += b.drop * fit.spend; earned += b.drop; kills++; if (b.boss) bossKills++; }
    live = live.filter((b) => b.hp > 1e-9);
    // the living walk on: to their gate (held there while it stands, gateHitters of them hitting it), then to the core
    const hitting: Record<string, number> = {};
    for (const b of live) {
      if (t < b.spawn) continue;
      const wo = perWave[b.wave]!;
      if (b.state === "gate") {
        if ((gate[b.side] ?? 0) <= 0) { b.state = "walk"; b.leg++; continue; }
        if ((hitting[b.side] = (hitting[b.side] ?? 0) + 1) > inp.gateHitters) continue;
        b.cd -= dt;
        if (b.cd <= 0) { b.cd += b.every; const d = Math.min(gate[b.side]!, b.shot * inp.barrierDamage); gate[b.side]! -= d; wo.gateDamage += d; }
        continue;
      }
      if (b.state === "core") {
        b.cd -= dt;
        if (b.cd <= 0) { b.cd += b.every; const d = b.shot * inp.baseDamage; damage += d; base -= d; wo.coreDamage += d; }
        continue;
      }
      const to = b.path[b.leg]!, last = b.leg === b.path.length - 1;
      const d = dist(b.pos, to), stop = last ? inp.baseRange : 0, step = b.speed * dt;
      if (d - stop <= step) {
        const f = d > 0 ? Math.max(0, d - stop) / d : 0;
        b.pos = [b.pos[0] + (to[0] - b.pos[0]) * f, b.pos[1] + (to[1] - b.pos[1]) * f];
        if (last) { b.state = "core"; b.cd = 0; wo.leaks++; if (b.boss) wo.bossDiesBeforeCore = false; }
        else if ((gate[b.side] ?? 0) > 0) { b.state = "gate"; b.cd = 0; }
        else b.leg++;
      } else b.pos = [b.pos[0] + ((to[0] - b.pos[0]) * step) / d, b.pos[1] + ((to[1] - b.pos[1]) * step) / d];
    }
    if (active && live.length === 0) { active = false; cleared++; quietUntil = t + inp.quiet; }
  }
  if (end < 0) end = t;
  const ratio = inp.baseHp > 0 ? damage / inp.baseHp : (damage > 0 ? Infinity : 0);
  return { id: inp.id, ratio, short: Math.max(0, ratio - 1), reject: ratio > 1 + slack, end, coreFalls: base <= 0, perWave };
}

export const assessLevel = (manifest: unknown, opts: { slack?: number; content?: Content; fit?: ModelFit } = {}): Assessment => assess(modelInput(manifest, opts.content), opts);

/** One calibration row: the filter's input for a (knob point, level) and how the good bot did on it. */
export interface FixtureRow { sweepSeed?: number; point: number; level: number; walls: boolean; knobs: Record<string, number>; seeds: number; wins: number; ratio: number; input: ModelInput }

/** Rejections over calibration rows: false rejects (a rejected row any seed won) and rejected losses. */
export function score(rows: FixtureRow[], opts: { slack?: number; fit?: ModelFit } = {}): { falseRejects: number; rejectedLosses: number; losses: number; wins: number; maxWinRatio: number } {
  let falseRejects = 0, rejectedLosses = 0, losses = 0, wins = 0, maxWinRatio = 0;
  for (const r of rows) {
    const a = assess(r.input, opts);
    if (r.wins > 0) { wins++; maxWinRatio = Math.max(maxWinRatio, a.ratio); if (a.reject) falseRejects++; }
    else { losses++; if (a.reject) rejectedLosses++; }
  }
  return { falseRejects, rejectedLosses, losses, wins, maxWinRatio };
}

const argv = process.argv.slice(2);
if (argv.includes("--calibrate")) {
  // pnpm exec vite-node tools/defend-model.ts -- --calibrate rows.json [...] [--grid player=1,0.5 guard=1,0 ...]
  // Scores MODEL_FIT and a grid of fits on calibration rows (walls-sweep --fixture output): false rejects must stay 0.
  const rows = argv.filter((_, k) => argv[k - 1] === "--calibrate").flatMap((f) => JSON.parse(readFileSync(f, "utf8")) as FixtureRow[]);
  console.log(`${rows.length} rows, ${rows.filter((r) => r.wins > 0).length} with a win`);
  const grid: Record<string, number[]> = { player: [MODEL_FIT.player], guard: [MODEL_FIT.guard], tower: [MODEL_FIT.tower], spend: [MODEL_FIT.spend], reach: [MODEL_FIT.reach] };
  argv.forEach((a, k) => { if (argv[k - 1] === "--grid" || (k > 0 && /^\w+=/.test(a) && argv.includes("--grid"))) { const [n, v] = a.split("="); if (n && v && grid[n]) grid[n] = v.split(",").map(Number); } });
  for (const player of grid["player"]!) for (const guard of grid["guard"]!) for (const tower of grid["tower"]!) for (const spend of grid["spend"]!) for (const reach of grid["reach"]!) {
    const s = score(rows, { fit: { player, guard, tower, spend, reach } });
    console.log(`player ${player} guard ${guard} tower ${tower} spend ${spend} reach ${reach}: false rejects ${s.falseRejects}/${s.wins}, rejected losses ${s.rejectedLosses}/${s.losses}, max win ratio ${s.maxWinRatio.toFixed(2)}`);
  }
}
if (argv.includes("--level")) {
  const i = argv.indexOf("--slack");
  const slack = i >= 0 ? Number(argv[i + 1]) : DEFAULT_SLACK;
  for (const f of argv.filter((_, k) => argv[k - 1] === "--level")) {
    const a = assessLevel(JSON.parse(readFileSync(f, "utf8")), { slack });
    if (argv.includes("--json")) { console.log(JSON.stringify(a)); continue; }
    console.log(`${a.id}: core damage ${(a.ratio * 100).toFixed(0)}% of base health by ${a.end.toFixed(0)} s -> ${a.reject ? "REJECT" : "pass"} (slack ${slack})`);
    a.perWave.forEach((w, k) => console.log(`  wave ${k + 1} @${w.start.toFixed(0)}s bank ${w.bank} towers ${w.towers} guards ${w.guards} dps ${w.dps.toFixed(1)} vs ${w.hpPerS.toFixed(1)} hp/s  leaks ${w.leaks} core -${w.coreDamage.toFixed(1)}${w.gateDamage ? ` gate -${w.gateDamage.toFixed(0)}` : ""}${w.bossDiesBeforeCore === null ? "" : w.bossDiesBeforeCore ? "  boss dies first" : "  boss reaches core"}`));
  }
}
