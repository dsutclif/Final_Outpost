import { content, type Manifest } from "@fo/content";
import { fighterNumbers, type FighterKind, type FighterNums } from "./fighterStats.js";

// Fighter arena model (dev only, R6 Release 2 Bundle 5 preview). A float, tick-stepped copy of the sim's combat
// rules (systems/defense.ts, guards.ts, player.ts, hunting.ts) on an open field with no walls, so Doug can watch
// one side fight the other. "today" mode is today's rules; "r2" lays PROPOSALS over them. Today's numbers come
// from fighterStats.fighterNumbers (content data); nothing here copies one.
// Two tabs (Doug 2026-11-04): "fight" is a wave of attackers against the defence, "hunt" the commander and rangers
// against hoppers and spiked hoppers.

export type Mode = "r2" | "today";
export type Tab = "fight" | "hunt";

/**
 * Release 2 combat proposals: `fighter:stat` over today's values (a stat today's rules lack is new).
 * shot* is a ranged attack at the nearest settler it can hurt; lunge* a dash at one after a wind-up.
 */
/** Doug 2026-11-03: one reach for every fighter's ranged attack as a starting point. */
export const REACH = 80;
const EQUAL = "Doug 2026-11-03: every reach equal as a starting point";
const UPDOWN = "Doug 2026-11-04: attacker reach goes up then down (mite 40, crawler 60, raider 80, warlord 60)";
const PLAN = "Doug 2026-11-04 plan: weak and packed at the bottom, big, slow and rare at the top";

export const PROPOSALS: { key: string; v: number; why: string }[] = [
  { key: "player:gunRange", v: REACH, why: EQUAL },
  { key: "guard:range", v: REACH, why: EQUAL },
  { key: "drone:range", v: REACH, why: EQUAL },
  { key: "tower1:range", v: REACH, why: EQUAL },
  { key: "tower2:range", v: REACH, why: EQUAL },
  { key: "tower3:range", v: REACH, why: EQUAL },
  // attackers: reach up then down, each with its own ranged damage and rate
  { key: "hostile.swarmling:shotRange", v: 40, why: UPDOWN },
  { key: "hostile.swarmling:shotDamage", v: 1, why: "N2 acid spit damage" },
  { key: "hostile.swarmling:shotInterval", v: 2, why: "N2 acid spit every 2 s" },
  { key: "hostile.swarmling:lungeRange", v: 30, why: "N2 lunge: a dash from this far" },
  { key: "hostile.swarmling:lungeWindup", v: 0.3, why: "N2 lunge: wind-up before the dash" },
  { key: "hostile.swarmling:lungeCooldown", v: 2, why: "arena guess: the ledger gives no lunge rate" },
  { key: "hostile.creature:shotRange", v: 60, why: UPDOWN },
  { key: "hostile.creature:shotDamage", v: 1, why: "its contact damage" },
  { key: "hostile.creature:shotInterval", v: 1.5, why: PLAN },
  { key: "hostile.raider_humanoid:hp", v: 6, why: PLAN },
  { key: "hostile.raider_humanoid:damage", v: 2, why: PLAN },
  { key: "hostile.raider_humanoid:shotRange", v: 80, why: UPDOWN },
  { key: "hostile.raider_humanoid:shotDamage", v: 1, why: "N2/N3 rifle damage" },
  { key: "hostile.raider_humanoid:shotInterval", v: 1.5, why: "N2/N3 rifle every 1.5 s" },
  { key: "hostile.boss:hp", v: 24, why: PLAN + "; several warlords a wave (#14)" },
  { key: "hostile.boss:shotRange", v: 60, why: UPDOWN },
  { key: "hostile.boss:shotDamage", v: 2, why: "minigun: small hits, fast" },
  { key: "hostile.boss:shotInterval", v: 0.5, why: "minigun: small hits, fast" },
  // defence: drones weak (about one crawler), guards strong, the commander stronger and healing himself
  { key: "drone:hp", v: 3, why: "Doug 2026-11-04: a drone is worth about one crawler (it is built slowly)" },
  { key: "guard:hp", v: 15, why: PLAN + ": guards are strong and kill many" },
  { key: "guard:damage", v: 3, why: "one shot kills a mite, a crawler or a spiked hopper" },
  { key: "guard:interval", v: 0.5, why: PLAN },
  { key: "player:hp", v: 20, why: PLAN + ": the commander is stronger than a guard" },
  { key: "player:damage", v: 2, why: "melee: two hits for a spiked hopper, so a pack up close is dangerous" },
  { key: "player:gunDamage", v: 3, why: "new: one shot kills a spiked hopper (Doug), a crawler or a mite" },
  { key: "player:interval", v: 0.8, why: "fewer, heavier hits: at 0.32 s nothing ever reaches him" },
  { key: "player:gunInterval", v: 0.8, why: "fewer, heavier hits" },
  { key: "player:targetable", v: 1, why: "R2 (Doug 2026-11-03): attackers can hurt the commander; at 0 HP he is down for downSeconds, then up healed" },
  // hunting (Doug 2026-11-04): a standing hunter loses to three spiked hoppers up close; one who keeps moving wins with his gun
  { key: "node.prey_dangerous:hp", v: 3, why: "one hit from the commander or a ranger kills it (Doug)" },
  { key: "node.prey_dangerous:interval", v: 0.5, why: "Doug 2026-11-04 sandbox: at 0, 3 or 4 a herd is routine, sometimes needs the medic, often needs it" },
  { key: "node.prey_dangerous:damage", v: 12, why: "Doug 2026-11-04: a standing ranger needs the medic 1 hunt in 20 against three (arena: 39 in 800) and about 1 in 6 against four (126 in 800); one bite injures, so both can't be exact" },
  { key: "node.prey_dangerous:speed", v: 78, why: "Doug 2026-11-04: a standing ranger needs the medic 1 hunt in 20 against three (arena: 39 in 800) and about 1 in 6 against four (126 in 800); one bite injures, so both can't be exact" },
  { key: "node.prey_dangerous:aggroRange", v: 85, why: "Doug 2026-11-04: a standing ranger needs the medic 1 hunt in 20 against three (arena: 39 in 800) and about 1 in 6 against four (126 in 800); one bite injures, so both can't be exact" },
  { key: "node.prey_dangerous:biteWindup", v: 0.4, why: "new: a bite lands only if the target is still in reach after the wind-up, so moving dodges it" },
  { key: "hunter:hp", v: 12, why: "new: at 0 the ranger is injured (lies down, can't be hurt) until a medic or the commander heals him (Doug 2026-11-04)" },
  { key: "hunter:damage", v: 3, why: "Doug 2026-11-04 sandbox" },
  { key: "hunter:interval", v: 1, why: "Doug 2026-11-04 sandbox" },
  { key: "hunter:gunDamage", v: 3, why: "new: one shot kills a spiked hopper (Doug)" },
  { key: "hunter:gunRange", v: REACH, why: "new: the ranger hunts spiked hoppers with a rifle while moving" },
  { key: "hunter:gunInterval", v: 1, why: "new: rifle every 1 s" },
  { key: "hunter:speed", v: 70, why: "Doug 2026-11-04 sandbox" },
];

/** Arena-only settings (not game rules): field size, where each side stands, the time cap. World units and seconds. */
export const ARENA = {
  tps: 30, w: 400, h: 220, coreInset: 40, timeCap: 240,
  /** Commander's damage from an attacker's hit. 0 = today's sim (hostiles only make the tow drop; hoppers' bites do hurt). */
  commanderHit: 0,
  lungeDashSpeed: 240,
  /** Where settlers stand, measured left of the core. */
  guardLine: 75, commanderLine: 60, towerLine: 50, postLine: 40, medicLine: 15,
  /** R2 melee: bodies touching counts as contact; this is the gap allowed between their edges. */
  touch: 3,
  /** Hunting: the hoppers' zone (left part of the field) and how close a charging one is before a moving hunter backs off. */
  zone: { x0: 40, x1: 120, y0: 60, y1: 160 }, threat: 50,
};

/** Stats shown on a card, in order; `hidden` ones show in the arena as bars instead. Size is set on the Scale tab. */
export const STAT_LABELS: Record<string, { label: string; unit: string; hidden?: boolean }> = {
  damage: { label: "Attack strength", unit: "" },
  interval: { label: "Attack interval", unit: "s" },
  speed: { label: "Speed", unit: "u/s" },
  gunDamage: { label: "Gun damage", unit: "" },
  gunInterval: { label: "Gun interval", unit: "s" },
  shotDamage: { label: "Ranged damage", unit: "" },
  shotInterval: { label: "Ranged interval", unit: "s" },
  shotStops: { label: "Stands to shoot (1/0)", unit: "" },
  targetable: { label: "Attackers can hit him (1/0)", unit: "" },
  lungeWindup: { label: "Lunge wind-up", unit: "s" },
  lungeRange: { label: "Lunge dash", unit: "u" },
  lungeCooldown: { label: "Lunge cooldown", unit: "s" },
  healDelay: { label: "Heal starts after", unit: "s" },
  healInterval: { label: "Heal 1 hp every", unit: "s" },
  healTime: { label: "Heal takes", unit: "s" },
  spawnEvery: { label: "New drone every", unit: "s" },
  spawnMax: { label: "Most drones", unit: "" },
  aggroRange: { label: "Charges from", unit: "u" },
  biteWindup: { label: "Bite wind-up", unit: "s" },
  stun: { label: "Bite stuns for", unit: "s" },
  stunSlow: { label: "Stunned speed (x)", unit: "" },
  hp: { label: "HP", unit: "", hidden: true },
  range: { label: "Reach", unit: "u" },
  gunRange: { label: "Gun reach", unit: "u" },
  shotRange: { label: "Ranged reach", unit: "u" },
};
/** Doug 2026-11-03: every animal with a ranged attack spits acid, each in its own colour (the arena draws it). */
export const ACID_COLOR: Record<string, string> = { "hostile.swarmling": "#8ff05a", "hostile.creature": "#ffb43a" };
/** Ranged attack names per fighter, for the cards and tracers. */
export const SHOT_NAME: Record<string, string> = { "hostile.swarmling": "Acid spit", "hostile.creature": "Acid spit", "hostile.raider_humanoid": "Rifle", "hostile.boss": "Minigun" };

/** Which fighters each tab shows. */
export const TAB_OF = (f: FighterNums): Tab[] =>
  f.kind === "hopper" || f.kind === "prey" || f.kind === "hunter" ? ["hunt"] : f.kind === "player" || f.kind === "medic" ? ["fight", "hunt"] : ["fight"];

export type Edits = Record<string, number>;
export interface CardRow { stat: string; label: string; unit: string; hidden: boolean; v: number; today: number | null; src: string; isNew: boolean; changed: boolean; why?: string }
export interface Roster { fighters: FighterNums[]; rules: Record<string, number> }

/** Fighters the stats panel doesn't list but the arena needs: plain hoppers, the medic and the ranger, plus drone and hopper extras. */
function extras(fighters: FighterNums[]): FighterNums[] {
  const out = fighters.map((f) => ({ ...f, stats: { ...f.stats } }));
  const A = content.animals, roles = content.roles, T = content.structures["struct.barracks"]?.troops;
  const sp = out.find((f) => f.id === "node.prey_dangerous");
  if (sp) { sp.title = sp.id; const D = A["node.prey_dangerous"]!;
    sp.stats["aggroRange"] = { v: D.aggroRange, src: "animals.json node.prey_dangerous aggroRange" };
    sp.stats["stun"] = { v: D.stun, src: "animals.json node.prey_dangerous stun" };
    sp.stats["stunSlow"] = { v: D.stunSlow, src: "animals.json node.prey_dangerous stunSlow" }; }
  const dr = out.find((f) => f.id === "drone");
  if (dr && T) { dr.stats["spawnEvery"] = { v: T.every, src: "structures.json struct.barracks troops.every" }; dr.stats["spawnMax"] = { v: T.max, src: "structures.json struct.barracks troops.max" }; }
  const p = A["node.prey"];
  if (p) out.push({ id: "node.prey", kind: "prey", side: "enemy", title: "node.prey", stats: {
    hp: { v: p.hp, src: "animals.json node.prey hp" }, speed: { v: p.speedMax, src: "animals.json node.prey speedMax (it wanders)" } } });
  const m = roles["role.medic"];
  if (m) out.push({ id: "medic", kind: "medic", side: "settler", title: "role.medic", stats: {
    speed: { v: m.speed, src: "roles.json role.medic speed" }, healTime: { v: m.healInterval ?? 4, src: "roles.json role.medic healInterval" } } });
  const h = roles["role.hunter"];
  if (h) out.push({ id: "hunter", kind: "hunter", side: "settler", title: "role.hunter", stats: {
    speed: { v: h.speed, src: "roles.json role.hunter speed" }, damage: { v: h.damage ?? 1, src: "roles.json role.hunter damage" },
    interval: { v: h.attackInterval ?? 0.5, src: "roles.json role.hunter attackInterval" }, range: { v: h.attackRange ?? 30, src: "roles.json role.hunter attackRange" } } });
  return out;
}

export function roster(level?: Manifest | null): { fighters: FighterNums[]; rules: Record<string, number> } {
  const n = fighterNumbers(level);
  return { fighters: extras(n.fighters), rules: Object.fromEntries(Object.entries(n.rules).map(([k, s]) => [k, s.v])) };
}

/** A fighter's stats in a mode: today's, then the proposals (r2 only), then Doug's edits for that mode. */
export function statsOf(f: FighterNums, mode: Mode, edits: Edits = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, s] of Object.entries(f.stats)) out[k] = s.v;
  if (mode === "r2") for (const p of PROPOSALS) if (p.key.startsWith(f.id + ":")) out[p.key.slice(f.id.length + 1)] = p.v;
  for (const [k, v] of Object.entries(edits)) if (k.startsWith(f.id + ":") && Number.isFinite(v)) out[k.slice(f.id.length + 1)] = v;
  return out;
}

export function cardRows(f: FighterNums, mode: Mode, edits: Edits = {}): CardRow[] {
  const s = statsOf(f, mode, edits);
  const order = Object.keys(STAT_LABELS);
  return Object.keys(s).filter((k) => STAT_LABELS[k] && !(f.kind === "player" && k === "downSeconds"))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((k) => {
      const L = STAT_LABELS[k]!, today = f.stats[k]?.v ?? null, prop = PROPOSALS.find((p) => p.key === `${f.id}:${k}`);
      // for attackers and the commander, plain reach is the contact or melee one; their gun has its own row
      const melee = k === "range" && (f.kind === "hostile" || f.kind === "player" || f.kind === "hunter");
      const label = melee ? "Melee reach" : k.startsWith("shot") && SHOT_NAME[f.id] ? L.label.replace("Ranged", SHOT_NAME[f.id]!) : L.label;
      const row: CardRow = { stat: k, label, unit: L.unit, hidden: !!L.hidden, v: s[k]!, today, src: f.stats[k]?.src ?? "R2 proposal", isNew: today === null, changed: today !== null && today !== s[k] };
      if (prop && mode === "r2") row.why = prop.why;
      return row;
    });
}

// ---------- the fight ----------

export interface Unit {
  uid: number; side: "enemy" | "settler"; type: string; kind: FighterKind; s: Record<string, number>;
  x: number; y: number; hp: number; hpMax: number;
  /** Footprint radius (world units); R2 keeps footprints apart and counts touching as melee contact. */
  body: number;
  /** Attack counter (ticks), as the sim's acc / atkCd; `gun` the commander's shotCd, `shot` an enemy's ranged counter. */
  acc: number; gun: number; shot: number;
  /** "healing": a downed guard a medic is working on (no damage meanwhile). */
  status: "ok" | "down" | "healing" | "dead";
  homeX: number; homeY: number;
  windup: number; lungeCd: number; lungeAt: number | null; dash: { tx: number; ty: number; left: number } | null;
  charging: boolean; healCd: number; hitCd: number;
  /** Ticks left of a commander knock-down, or of a medic's heal on a guard. */
  downT?: number | undefined;
  /** A medic's patient (uid). */
  patient?: number | null;
  /** Ticks left stunned by a bite: no attacks, slowed (hunting.ts bite). */
  stunT?: number; slow?: number;
  /** A wandering hopper's heading (radians) and ticks to its next turn. */
  heading?: number; turn?: number;
  /** Last movement this tick and a recent-attack timer, for the renderer. */
  vx: number; vy: number; act: number; face: number;
}
export interface Shot { fx: number; fy: number; tx: number; ty: number; kind: "settler" | "enemy" | "acid"; by: string }
export interface HitLog { by: number; byKind: FighterKind; target: number | "base"; dist: number; ranged: boolean; dmg: number }
export interface FightSetup {
  mode: Mode; tab?: Tab; edits?: Edits; seed?: number; level?: Manifest | null;
  /** Counts per fighter id on each side (the fight tab mixes them). */
  enemyCounts?: Record<string, number>; settlerCounts?: Record<string, number>;
  /** One type against one type (older callers and tests). */
  enemy?: string; enemies?: number; settler?: string; settlers?: number;
  /** Fight tab: attackers per row and seconds between rows; one at a time, spawnGap apart, when absent. */
  ranks?: number; rowGap?: number;
  /** Hunt tab: the commander and rangers keep moving away from charging hoppers instead of standing. */
  kite?: boolean;
  /** Footprint radius per fighter id at size 1 (the arena measures them from the models); BODY when absent. */
  bodies?: Record<string, number>;
}
export interface Fight {
  tick: number; units: Unit[]; pending: { tick: number; y: number; type: string }[];
  base: { x: number; y: number; hp: number; hpMax: number };
  rules: Record<string, number>; mode: Mode; tab: Tab; kite: boolean;
  shots: Shot[]; hits: HitLog[];
  /** Guards who died, heals finished, drones the post built, hunters injured. */
  deaths: number; heals: number; built: number; injuries: number;
  result: { winner: "enemies" | "settlers" | "draw"; seconds: number; why: string } | null;
  rand: () => number;
  defs: Record<string, FighterNums>; edits: Edits; nextUid: number;
  bodies: Record<string, number>;
  spawner: { every: number; max: number; cd: number; x: number; y: number } | null;
}

const T = (s: number): number => Math.max(1, Math.round(s * ARENA.tps));
const perTick = (uPerS: number): number => uPerS / ARENA.tps;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const down = (v: number): number => (v > 0 ? v - 1 : 0);

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Footprint radius at size 1 (world units) when the arena hasn't measured the models: from meshy.built.json bounds
 * and meshy.json heights at the game's draw size (renderer.ts: ART_M x look.scale x charScale / 0.9). People are 1.8 m and about 12 across (1 m = 28 world units).
 */
export const BODY: Record<string, number> = {
  "hostile.swarmling": 10, "hostile.creature": 22, "hostile.raider_humanoid": 11, "hostile.boss": 23,
  "node.prey": 13, "node.prey_dangerous": 12, player: 13, guard: 12, medic: 13, hunter: 13, drone: 12, tower: 14,
};

/** Spread each type evenly through the wave (Doug 2026-11-04: alternation throughout), the rarest at even steps. */
export function waveOrder(counts: Record<string, number>): string[] {
  const slots: { t: string; at: number; n: number }[] = [];
  for (const [t, n0] of Object.entries(counts)) { const n = Math.max(0, Math.floor(n0)); for (let i = 0; i < n; i++) slots.push({ t, at: (i + 0.5) / n, n }); }
  return slots.sort((a, b) => a.at - b.at || a.n - b.n).map((s) => s.t);
}

export function createFight(setup: FightSetup): Fight {
  const R = roster(setup.level);
  const defs: Record<string, FighterNums> = Object.fromEntries(R.fighters.map((f) => [f.id, f]));
  const find = (id: string): FighterNums => { const f = defs[id]; if (!f) throw new Error(`no fighter ${id}`); return f; };
  const tab: Tab = setup.tab ?? "fight";
  const ec = setup.enemyCounts ?? (setup.enemy ? { [setup.enemy]: setup.enemies ?? 1 } : {});
  const sc = setup.settlerCounts ?? (setup.settler ? { [setup.settler]: setup.settlers ?? 1 } : {});
  for (const id of Object.keys(ec)) if (find(id).side !== "enemy") throw new Error("one side against the other only");
  for (const id of Object.keys(sc)) if (find(id).side !== "settler") throw new Error("one side against the other only");
  const rules = { ...R.rules };
  const rand = mulberry(setup.seed ?? Math.floor(Math.random() * 2 ** 31));
  const W = ARENA.w, H = ARENA.h, cx = W - ARENA.coreInset, cy = H / 2;
  const f: Fight = { tick: 0, units: [], pending: [], base: { x: cx, y: cy, hp: rules.baseHealth!, hpMax: rules.baseHealth! }, rules, mode: setup.mode, tab, kite: !!setup.kite,
    shots: [], hits: [], deaths: 0, heals: 0, built: 0, injuries: 0, result: null, rand, defs, edits: setup.edits ?? {}, nextUid: 0, bodies: { ...BODY, ...setup.bodies }, spawner: null };
  const S = (id: string): Record<string, number> => statsOf(find(id), setup.mode, setup.edits);

  // settlers: a column per kind at its own line in front of the core (hunting: near the right edge), spread top to bottom
  for (const [id, n0] of Object.entries(sc)) {
    const sf = find(id), n = Math.max(0, Math.floor(n0));
    if (n === 0) continue;
    const line = tab === "hunt" ? 30 : sf.kind === "guard" ? ARENA.guardLine : sf.kind === "player" ? ARENA.commanderLine : sf.kind === "tower" ? ARENA.towerLine : sf.kind === "medic" ? ARENA.medicLine : ARENA.postLine;
    const gap = sf.kind === "tower" ? 46 : 2 * bodyFor(f, sf.id, sf.kind, S(id)) + 4;
    const cols = Math.ceil(n * gap / (H - 40)), per = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const col = Math.floor(i / per), row = i % per, rows = Math.min(per, n - col * per);
      f.units.push(mk(f, sf, S(id), cx - line - col * gap, cy + (row - (rows - 1) / 2) * gap));
    }
    if (sf.kind === "drone" && tab === "fight") {
      const s = S(id);
      if ((s.spawnEvery ?? 0) > 0) f.spawner = { every: T(s.spawnEvery!), max: s.spawnMax ?? 16, cd: T(s.spawnEvery!), x: cx - ARENA.postLine, y: cy };
    }
  }
  if (tab === "hunt") {
    // the hoppers' zone: scattered over the left of the field, all there from the start
    for (const [id, n0] of Object.entries(ec)) for (let i = 0; i < Math.max(0, Math.floor(n0)); i++) {
      const Z = ARENA.zone, u = mk(f, find(id), S(id), Z.x0 + rand() * (Z.x1 - Z.x0), Z.y0 + rand() * (Z.y1 - Z.y0));
      u.heading = rand() * Math.PI * 2; u.turn = 0;
      f.units.push(u);
    }
    return f;
  }
  // attackers come from the left edge: one at a time, spawnGap apart, or in rows of `ranks` abreast every rowGap s
  const order = waveOrder(ec), ranks = Math.max(1, Math.floor(setup.ranks ?? 1));
  const gapT = T(setup.rowGap ?? rules.spawnGap ?? 1.1), m = rules.spawnMargin ?? 30;
  for (let r = 0; r * ranks < order.length; r++) {
    const row = order.slice(r * ranks, (r + 1) * ranks);
    const widths = row.map((t) => 2 * bodyFor(f, t, find(t).kind, S(t)) + 2), span = widths.reduce((a, b) => a + b, 0);
    const mid = ranks === 1 ? m + rand() * (H - 2 * m) : Math.max(m + span / 2, Math.min(H - m - span / 2, cy + (rand() - 0.5) * 40));
    let y = mid - span / 2;
    row.forEach((t, i) => { f.pending.push({ tick: r * gapT, y: y + widths[i]! / 2, type: t }); y += widths[i]!; });
  }
  return f;
}

function bodyFor(f: Fight, id: string, kind: FighterKind, s: Record<string, number>): number {
  return (f.bodies[id] ?? f.bodies[kind] ?? 12) * (s.size ?? 1);
}
function mk(f: Fight, fn: FighterNums, s: Record<string, number>, x: number, y: number): Unit {
  const hp = s.hp ?? 0;
  return { uid: f.nextUid++, side: fn.side, type: fn.id, kind: fn.kind, s, x, y, hp, hpMax: hp, body: bodyFor(f, fn.id, fn.kind, s), acc: 0, gun: 0, shot: 0, status: "ok", homeX: x, homeY: y,
    windup: 0, lungeCd: 0, lungeAt: null, dash: null, charging: false, healCd: 0, hitCd: 0, vx: 0, vy: 0, act: 0, face: fn.side === "enemy" ? Math.PI / 2 : -Math.PI / 2, patient: null };
}

const alive = (u: Unit): boolean => u.status !== "dead";
const enemies = (f: Fight): Unit[] => f.units.filter((u) => u.side === "enemy" && alive(u));

/** Nearest unit strictly within r, as nearestHostile / nearestTroop. */
function nearest(list: Unit[], p: Unit, r: number): Unit | null {
  let best: Unit | null = null, bd = r;
  for (const u of list) { const d = dist(u, p); if (d < bd) { bd = d; best = u; } }
  return best;
}
/** Melee contact: today a centre distance under `reach`; R2 also counts footprints touching (Doug: no overlaps). */
const reachTo = (f: Fight, a: Unit, b: Unit, reach: number): number => f.mode === "r2" ? Math.max(reach, a.body + b.body + ARENA.touch) : reach;
function nearestTouch(f: Fight, list: Unit[], p: Unit, reach: number): Unit | null {
  let best: Unit | null = null, bd = Infinity;
  for (const u of list) { const d = dist(u, p); if (d < reachTo(f, p, u, reach) && d < bd) { bd = d; best = u; } }
  return best;
}
/** Settlers an attacker can hurt: drones, guards still standing (R2: downed ones too), rangers, the commander when targetable. */
const hurtable = (f: Fight, hopper = false): Unit[] => f.units.filter((u) => u.side === "settler" && (
  (u.status === "ok" && (u.kind === "drone" || u.kind === "guard" || (u.kind === "hunter" && u.hpMax > 0)
    || (u.kind === "player" && (hopper || ARENA.commanderHit > 0 || (u.s.targetable ?? 0) > 0))))
  || (f.mode === "r2" && u.kind === "guard" && u.status === "down")));

function moveTo(u: Unit, tx: number, ty: number, step: number, stopAt = 0): void {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d <= stopAt + 1e-6) return;
  const s = Math.min(step * ((u.stunT ?? 0) > 0 ? u.slow ?? 1 : 1), d - stopAt);
  u.x += (dx / d) * s; u.y += (dy / d) * s;
  u.vx += (dx / d) * s; u.vy += (dy / d) * s;
}
const face = (u: Unit, t: { x: number; y: number }): void => { u.face = Math.atan2(t.x - u.x, t.y - u.y); u.act = 10; };

function shoot(f: Fight, a: Unit, t: Unit, kind: Shot["kind"]): void {
  f.shots.push({ fx: a.x, fy: a.y, tx: t.x, ty: t.y, kind, by: a.type });
}

/**
 * Damage to a settler. Guards keep R5 #26 (no strike takes a standing guard below 1 hp, down at downPct); in R2 a
 * downed guard takes half damage and dies at 0 unless a medic reaches it (Doug 2026-11-04), and none while healed.
 * The commander is knocked down at 0 and gets up healed; a ranger dies.
 */
function hurt(f: Fight, a: Unit, t: Unit, dmg: number, ranged: boolean): void {
  if (t.status === "healing") return;
  f.hits.push({ by: a.uid, byKind: a.kind, target: t.uid, dist: dist(a, t), ranged, dmg });
  face(a, t);
  if (t.kind === "guard") {
    if (t.status === "down") {
      if (f.mode !== "r2") return;
      t.hp = Math.max(0, t.hp - dmg / 2);
      if (t.hp <= 0) { t.status = "dead"; f.deaths++; }
      return;
    }
    if (t.status !== "ok") return;
    t.hp = Math.max(1, t.hp - dmg);
    if (t.hp * 100 <= f.rules.downPct! * t.hpMax) t.status = "down";
  } else if (t.kind === "player" || t.kind === "hunter") stunBy(a, t);
  if (t.kind === "player" || t.kind === "hunter") {
    t.healCd = T(t.s.healDelay ?? 4);
    t.hp = Math.max(0, t.hp - dmg);
    if (t.hp > 0) return;
    if (f.tab === "hunt" && f.mode === "r2") {
      // Doug 2026-11-04: hunting never kills; an injured hunter lies down, can't be hurt, and waits for a medic or the commander
      t.status = "down"; t.downT = undefined; f.injuries++;
    } else if (t.kind === "player" && f.mode === "r2" && a.kind === "hostile") {
      t.status = "dead"; // Doug 2026-11-04: attackers can kill the commander
    } else if (t.kind === "player") {
      // hunting.ts bite: at 0 the commander is knocked down and gets up healed; the biter backs off meanwhile
      t.status = "down"; t.downT = T(t.s.downSeconds ?? 2); a.acc = T(t.s.downSeconds ?? 2) + T(a.s.interval!);
    } else t.status = "dead";
  } else if (t.kind === "drone") {
    t.hp -= dmg;
    if (t.hp <= 0) t.status = "dead";
  }
}
/** hunting.ts bite: the victim can't attack for `stun` s and moves at stunSlow meanwhile. */
function stunBy(a: Unit, t: Unit): void {
  const k = T(a.s.stun ?? 0);
  if (a.kind !== "hopper" || !(a.s.stun! > 0)) return;
  t.stunT = Math.max(t.stunT ?? 0, k); t.slow = a.s.stunSlow ?? 1; t.acc = Math.max(t.acc, k); t.gun = Math.max(t.gun, k);
}
function hitEnemy(f: Fight, a: Unit, t: Unit, dmg: number, ranged: boolean): void {
  f.hits.push({ by: a.uid, byKind: a.kind, target: t.uid, dist: dist(a, t), ranged, dmg });
  face(a, t);
  t.hp -= dmg;
  if (t.hp <= 0) t.status = "dead";
}

/**
 * Doug 2026-11-03/04: characters never overlap, except that fliers (drones) pass over ground units and the commander
 * walks through anyone (only settlement walls stop him, and the arena has none). Towers, anyone lying down and a
 * guard being healed don't get pushed. R2 only: today's sim lets everyone overlap.
 */
const flies = (u: Unit): boolean => u.kind === "drone";
function separate(f: Fight): void {
  const live = f.units.filter((u) => u.status !== "dead" && u.kind !== "player" && !(u.side === "enemy" && u.x < 0));
  const fixed = (u: Unit): boolean => u.kind === "tower" || u.status === "down" || u.status === "healing";
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!, b = live[j]!;
      if (flies(a) !== flies(b) || (fixed(a) && fixed(b))) continue;
      const min = a.body + b.body;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 1e-6) { dx = (a.uid < b.uid ? 1 : -1) * 0.01; dy = 0.01; d = Math.hypot(dx, dy); }
      const push = min - d, ux = dx / d, uy = dy / d;
      const sa = fixed(a) ? 0 : fixed(b) ? 1 : 0.5, sb = 1 - sa;
      a.x -= ux * push * sa; a.y -= uy * push * sa; b.x += ux * push * sb; b.y += uy * push * sb;
      moved = true;
    }
    if (!moved) break;
  }
}

/**
 * A guard or drone under the R2 rule: walk at the nearest attacker until touching, shooting `h` (the nearest in
 * range) on the way, and hit it without a shot once in melee. `tick` false when the caller already ran the counter.
 */
function closeIn(f: Fight, u: Unit, h: Unit | null, foes: Unit[], melee: number, tick = true): void {
  const t = nearest(foes, u, Infinity);
  if (!t) { moveTo(u, u.homeX, u.homeY, perTick(u.s.speed!)); return; }
  const stop = reachTo(f, u, t, melee) * 0.95;
  if (dist(u, t) > stop) moveTo(u, t.x, t.y, perTick(u.s.speed!), stop);
  if (!h) return;
  if (tick) u.acc = down(u.acc);
  if (u.acc > 0) { face(u, h); return; }
  u.acc = T(u.s.interval!);
  const close = dist(u, h) <= reachTo(f, u, h, melee);
  if (!close) shoot(f, u, h, "settler");
  hitEnemy(f, u, h, u.s.damage!, !close);
}

/** Who a healer treats: downed guards in a fight; injured hunters (rangers, the commander) on a hunt. */
const isPatient = (f: Fight, u: Unit): boolean => u.status === "down" && (f.tab === "hunt" ? u.kind === "hunter" || (u.kind === "player" && u.downT === undefined) : u.kind === "guard");
/** Medics (can't be hurt): each goes to the nearest downed guard nobody else has, heals it over healTime, then waits at home. */
function stepMedics(f: Fight): void {
  for (const m of f.units) {
    if (m.kind !== "medic") continue;
    let p = m.patient == null ? null : f.units.find((u) => u.uid === m.patient && (u.status === "down" || u.status === "healing")) ?? null;
    if (!p) {
      m.patient = null;
      const claimed = new Set(f.units.filter((o) => o.kind === "medic" && o !== m && o.patient != null).map((o) => o.patient));
      p = nearest(f.units.filter((u) => isPatient(f, u) && !claimed.has(u.uid)), m, Infinity);
      if (p) m.patient = p.uid;
    }
    if (!p) { moveTo(m, m.homeX, m.homeY, perTick(m.s.speed!)); continue; }
    const reach = m.body + p.body + 6;
    if (dist(m, p) > reach) { moveTo(m, p.x, p.y, perTick(m.s.speed!), reach * 0.9); continue; }
    face(m, p);
    if (p.status === "down") { p.status = "healing"; p.downT = T(m.s.healTime ?? 4); }
  }
  for (const g of f.units) {
    if (g.status !== "healing") continue;
    g.downT = down(g.downT ?? 0);
    if (g.downT <= 0) { g.status = "ok"; g.hp = g.hpMax; f.heals++; }
  }
}

/** Run to the end, headless. */
export function runFight(setup: FightSetup): Fight {
  const f = createFight(setup);
  while (!f.result) stepFight(f);
  return f;
}

/** One sim tick, in the sim's system order: player, residents (guards, medics), hunting (hoppers), defense (hostiles, player hits, troops, towers). */
export function stepFight(f: Fight): void {
  if (f.result) return;
  f.shots = [];
  for (const u of f.units) { u.vx = 0; u.vy = 0; if (u.act > 0) u.act--; if (u.stunT) u.stunT--; }
  if (f.tab === "hunt") { stepHunt(f); return; }
  const R = f.rules;
  while (f.pending.length && f.pending[0]!.tick <= f.tick) {
    const p = f.pending.shift()!;
    const def = f.defs[p.type]!;
    const u = mk(f, def, statsOf(def, f.mode, f.edits), -10, p.y);
    f.units.push(u);
  }
  if (f.spawner) {
    const sp = f.spawner, live = f.units.filter((u) => u.kind === "drone" && alive(u)).length;
    sp.cd = down(sp.cd);
    if (sp.cd <= 0 && live < sp.max && enemies(f).length + f.pending.length > 0) {
      const def = f.defs["drone"]!;
      f.units.push(mk(f, def, statsOf(def, f.mode, f.edits), sp.x, sp.y + (f.rand() - 0.5) * 30));
      sp.cd = sp.every; f.built++;
    }
  }
  const foes = (): Unit[] => enemies(f);
  // R2 (Doug 2026-11-03): nobody stops to shoot; every mobile fighter keeps closing and switches to melee in reach
  const closing = f.mode === "r2";
  const melee = R.troopContact!;

  // player.ts playerCombat (it holds its spot) and its slow heal
  for (const p of f.units) {
    if (p.kind !== "player" || !alive(p)) continue;
    if (p.status === "down") { p.downT = down(p.downT ?? 0); if (p.downT <= 0) { p.status = "ok"; p.hp = p.hpMax; } continue; }
    p.acc = down(p.acc); p.gun = down(p.gun);
    if (p.hp < p.hpMax) { p.healCd = down(p.healCd); if (p.healCd <= 0) { p.hp++; p.healCd = T(p.s.healInterval!); } }
    if (p.acc <= 0) {
      const h = nearestTouch(f, foes(), p, p.s.range!);
      if (h) { hitEnemy(f, p, h, p.s.damage!, false); p.acc = T(p.s.interval!); continue; }
    }
    if (closing) {
      if (nearestTouch(f, foes(), p, p.s.range!)) continue;
      const t = nearest(foes(), p, Infinity);
      if (t) moveTo(p, t.x, t.y, perTick(p.s.speed!), reachTo(f, p, t, p.s.range!) * 0.9);
    }
    if (p.gun > 0 || !(p.s.gunRange! > 0)) continue;
    const h = nearest(foes(), p, p.s.gunRange!);
    if (!h) continue;
    shoot(f, p, h, "settler");
    hitEnemy(f, p, h, p.s.gunDamage ?? p.s.damage!, true);
    p.gun = T(p.s.gunInterval!);
  }
  // residents.ts guardStep with no walls: shoot the nearest in reach (its counter runs only then), else sortie
  for (const g of f.units) {
    if (g.kind !== "guard" || g.status !== "ok") continue;
    const h = nearest(foes(), g, g.s.range!);
    if (closing) { closeIn(f, g, h, foes(), melee); continue; }
    if (h) {
      g.acc = down(g.acc);
      if (g.acc <= 0) { g.acc = T(g.s.interval!); shoot(f, g, h, "settler"); hitEnemy(f, g, h, g.s.damage!, true); }
      else face(g, h);
      continue;
    }
    // role.defender is a sortie guard: with no walls and no turret (no leash) it marches at the nearest attacker
    const t = nearest(foes(), g, Infinity);
    if (t) moveTo(g, t.x, t.y, perTick(g.s.speed!), g.s.range! * 0.95);
    else moveTo(g, g.homeX, g.homeY, perTick(g.s.speed!));
  }
  stepMedics(f);
  // hunting.ts: a dangerous animal charges the nearest settler it can bite, with a wind-up before its first bite
  for (const a of f.units) {
    if (a.kind !== "hopper" || !alive(a)) continue;
    a.acc = down(a.acc);
    const tgt = nearest(hurtable(f, true), a, Infinity);
    if (!tgt) {
      a.charging = false;
      // only towers left: it walks at the nearest one (arena: in the game it wanders its zone)
      const tw = nearest(f.units.filter((u) => u.side === "settler" && u.kind === "tower"), a, Infinity);
      if (tw) moveTo(a, tw.x, tw.y, perTick(a.s.speed!), a.s.range!);
      continue;
    }
    if (!a.charging) { a.charging = true; a.acc = Math.max(a.acc, T(a.s.interval!) >> 1); }
    const reach = reachTo(f, a, tgt, a.s.range!);
    if (dist(a, tgt) > reach) moveTo(a, tgt.x, tgt.y, perTick(a.s.speed!), reach * 0.999);
    if (a.acc <= 0 && dist(a, tgt) < reach) { a.acc = T(a.s.interval!); hurt(f, a, tgt, a.s.damage!, false); }
  }
  // defense.ts stepDefense: a hostile fights a troop in contact, else a guard in contact, else walks to the core and hits it
  const contact = (h: Unit): number => h.s.range ?? R.troopContact!;
  for (const h of f.units) {
    if (h.kind !== "hostile" || !alive(h)) continue;
    const S = h.s;
    h.lungeCd = down(h.lungeCd); h.shot = down(h.shot);
    if (h.dash) {
      const t = h.lungeAt === null ? null : f.units.find((u) => u.uid === h.lungeAt) ?? null;
      if (t && t.status === "ok") { h.dash.tx = t.x; h.dash.ty = t.y; }
      const step = Math.min(perTick(ARENA.lungeDashSpeed), h.dash.left);
      const stop = t ? reachTo(f, h, t, contact(h)) * 0.9 : contact(h) * 0.9;
      moveTo(h, h.dash.tx, h.dash.ty, step, stop);
      h.dash.left -= step;
      if (h.dash.left <= 0 || Math.hypot(h.dash.tx - h.x, h.dash.ty - h.y) <= stop + 1e-6) { h.dash = null; h.lungeAt = null; }
      continue;
    }
    if (h.windup > 0) {
      h.windup--;
      const t = f.units.find((u) => u.uid === h.lungeAt);
      if (t) face(h, t);
      if (h.windup === 0) {
        if (t && t.status === "ok") h.dash = { tx: t.x, ty: t.y, left: S.lungeRange! + reachTo(f, h, t, contact(h)) };
        else h.lungeAt = null;
      }
      continue;
    }
    const troop = nearestTouch(f, f.units.filter((u) => u.kind === "drone" && alive(u)), h, contact(h))
      ?? nearestTouch(f, f.units.filter((u) => u.kind === "guard" && (u.status === "ok" || (closing && u.status === "down"))), h, contact(h));
    if (troop) {
      h.acc = down(h.acc);
      if (h.acc <= 0) { h.acc = T(S.interval!); hurt(f, h, troop, S.damage!, false); }
      else face(h, troop);
      continue;
    }
    // R2 proposals: a lunge at a settler within its dash, a ranged shot at one in reach
    if ((S.lungeRange ?? 0) > 0 && h.lungeCd <= 0) {
      const t = nearest(hurtable(f), h, S.lungeRange!);
      if (t) { h.windup = T(S.lungeWindup ?? 0.3); h.lungeAt = t.uid; h.lungeCd = T(S.lungeCooldown ?? 2); face(h, t); continue; }
    }
    if ((S.shotRange ?? 0) > 0) {
      const t = nearest(hurtable(f), h, S.shotRange!);
      const inMelee = !!t && closing && dist(h, t) <= reachTo(f, h, t, contact(h));
      if (t && h.shot <= 0 && !inMelee) {
        h.shot = T(S.shotInterval!);
        shoot(f, h, t, SHOT_NAME[h.type] === "Acid spit" ? "acid" : "enemy");
        hurt(f, h, t, S.shotDamage!, true);
      }
      if (t && closing) { if (inMelee) face(h, t); else moveTo(h, t.x, t.y, perTick(S.speed!), reachTo(f, h, t, contact(h)) * 0.9); continue; }
      if (t && (S.shotStops ?? 0) > 0) { face(h, t); continue; }
    }
    if (dist(h, f.base) < R.baseRange!) {
      h.acc = down(h.acc);
      if (h.acc <= 0) {
        h.acc = T(R.baseHitInterval!);
        f.base.hp = Math.max(0, f.base.hp - R.baseDamage! * S.damage!);
        f.hits.push({ by: h.uid, byKind: h.kind, target: "base", dist: dist(h, f.base), ranged: false, dmg: R.baseDamage! * S.damage! });
        face(h, f.base);
      }
      continue;
    }
    moveTo(h, f.base.x, f.base.y, perTick(S.speed!));
  }
  // defense.ts hitPlayer: one hostile in contact hits the commander each interval (no damage today)
  for (const p of f.units) {
    if (p.kind !== "player" || p.status !== "ok") continue;
    p.hitCd = down(p.hitCd);
    if (p.hitCd > 0) continue;
    const h = nearestTouch(f, foes().filter((u) => u.kind === "hostile"), p, R.playerHitRange!);
    if (!h) continue;
    p.hitCd = T(R.playerHitInterval!);
    if ((p.s.targetable ?? 0) > 0) hurt(f, h, p, h.s.damage!, false);
    else if (ARENA.commanderHit > 0) hurt(f, h, p, ARENA.commanderHit * h.s.damage!, false);
    else { f.hits.push({ by: h.uid, byKind: h.kind, target: p.uid, dist: dist(h, p), ranged: false, dmg: 0 }); face(h, p); }
  }
  // defense.ts stepTroops: the counter always runs; hit the nearest in reach, else march at the nearest attacker, else back home
  for (const t of f.units) {
    if (t.kind !== "drone" || !alive(t)) continue;
    if (closing) { t.acc = down(t.acc); closeIn(f, t, nearest(foes(), t, t.s.range!), foes(), melee, false); continue; }
    t.acc = down(t.acc);
    const h = nearest(foes(), t, t.s.range!);
    if (h) {
      if (t.acc <= 0) { t.acc = T(t.s.interval!); shoot(f, t, h, "settler"); hitEnemy(f, t, h, t.s.damage!, true); }
      continue;
    }
    const tgt = nearest(foes(), t, Infinity);
    if (tgt) moveTo(t, tgt.x, tgt.y, perTick(t.s.speed!));
    else moveTo(t, t.homeX, t.homeY, perTick(t.s.speed!));
  }
  // towers: counter always runs, fire at the nearest in range when ready
  for (const s of f.units) {
    if (s.kind !== "tower") continue;
    s.acc = down(s.acc);
    const h = nearest(foes(), s, s.s.range!);
    if (h && s.acc <= 0) { s.acc = T(s.s.interval!); shoot(f, s, h, "settler"); hitEnemy(f, s, h, s.s.damage!, true); }
  }
  if (f.mode === "r2") separate(f);
  for (const u of f.units) if (Math.hypot(u.vx, u.vy) > 1e-3) u.face = Math.atan2(u.vx, u.vy);

  f.tick++;
  const sec = f.tick / ARENA.tps;
  // a knocked-down commander gets up again, so he still counts as standing; medics don't fight; in R2 a downed guard
  // is still alive (a medic can save it) and the drone post keeps building
  const standing = f.units.filter((u) => u.side === "settler" && u.kind !== "medic" && (u.status === "ok" || (u.kind === "player" && u.status === "down")
    || (f.mode === "r2" && u.kind === "guard" && (u.status === "down" || u.status === "healing"))));
  if (f.pending.length === 0 && enemies(f).length === 0) f.result = { winner: "settlers", seconds: sec, why: "every attacker is down" };
  else if (f.base.hp <= 0) f.result = { winner: "enemies", seconds: sec, why: "the core is destroyed" };
  else if (standing.length === 0 && !f.spawner) f.result = { winner: "enemies", seconds: sec, why: "every settler is out (downed guards count)" };
  else if (sec >= ARENA.timeCap) f.result = { winner: "draw", seconds: sec, why: `time cap ${ARENA.timeCap} s` };
}

// ---------- hunting (Doug 2026-11-04) ----------

/** Keep a point inside the field. */
const inField = (x: number, y: number, m = 12): boolean => x >= m && x <= ARENA.w - m && y >= m && y <= ARENA.h - m;
function wander(f: Fight, a: Unit, speed: number): void {
  a.turn = down(a.turn ?? 0);
  if (a.turn <= 0) { a.heading = f.rand() * Math.PI * 2; a.turn = T(1 + f.rand() * 2); }
  const step = perTick(speed) * 0.6, nx = a.x + Math.cos(a.heading!) * step, ny = a.y + Math.sin(a.heading!) * step;
  const Z = ARENA.zone;
  if (nx < Z.x0 || nx > Z.x1 || ny < Z.y0 || ny > Z.y1) { a.heading = Math.atan2((Z.y0 + Z.y1) / 2 - a.y, (Z.x0 + Z.x1) / 2 - a.x); return; }
  moveTo(a, nx, ny, step);
}
/** Back away from charging hoppers; along a wall when cornered (tries turning off the straight line until a step fits). */
function flee(u: Unit, threats: Unit[]): void {
  let ax = 0, ay = 0;
  for (const h of threats) { const d = Math.max(1, dist(u, h)); ax += (u.x - h.x) / (d * d); ay += (u.y - h.y) / (d * d); }
  const base = Math.atan2(ay, ax), step = perTick(u.s.speed!);
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.6, -2.6]) {
    const a = base + turn, nx = u.x + Math.cos(a) * step, ny = u.y + Math.sin(a) * step;
    if (inField(nx, ny)) { moveTo(u, nx, ny, step); return; }
  }
}

function stepHunt(f: Fight): void {
  const humans = (): Unit[] => f.units.filter((u) => (u.kind === "player" || u.kind === "hunter") && u.status === "ok");
  const hoppers = (): Unit[] => f.units.filter((u) => (u.kind === "hopper" || u.kind === "prey") && alive(u));
  const spiky = (): Unit[] => hoppers().filter((u) => u.kind === "hopper");
  // hunters: in reach a melee hit on any hopper; else the gun at the nearest spiked one (plain prey is never shot, player.ts)
  for (const p of f.units) {
    if ((p.kind !== "player" && p.kind !== "hunter") || !alive(p)) continue;
    if (p.status === "healing") continue;
    if (p.status === "down") { if (p.downT !== undefined) { p.downT = down(p.downT); if (p.downT <= 0) { p.status = "ok"; p.hp = p.hpMax; } } continue; }
    p.acc = down(p.acc); p.gun = down(p.gun);
    if (p.kind === "player" && p.hp < p.hpMax) { p.healCd = down(p.healCd); if (p.healCd <= 0) { p.hp++; p.healCd = T(p.s.healInterval!); } }
    const threats = spiky().filter((h) => h.charging && dist(p, h) < reachTo(f, h, p, h.s.range!) + ARENA.threat);
    // with no medic on the hunt, the commander goes to an injured ranger once no hopper is charging him, and heals him
    if (p.kind === "player" && !threats.length && !f.units.some((u) => u.kind === "medic")) {
      const hurt = nearest(f.units.filter((u) => u.kind === "hunter" && isPatient(f, u)), p, Infinity);
      if (hurt) {
        const reach = p.body + hurt.body + 6;
        if (dist(p, hurt) > reach) moveTo(p, hurt.x, hurt.y, perTick(p.s.speed!), reach * 0.9);
        else { face(p, hurt); hurt.status = "healing"; hurt.downT = T(f.defs["medic"] ? statsOf(f.defs["medic"], f.mode, f.edits).healTime ?? 4 : 4); }
        continue;
      }
    }
    const target = nearest(spiky(), p, Infinity) ?? nearest(hoppers(), p, Infinity);
    if (f.kite && threats.length) flee(p, threats);
    else if (target) {
      const gun = target.kind === "hopper" && (p.s.gunRange ?? 0) > 0;
      moveTo(p, target.x, target.y, perTick(p.s.speed!), gun ? p.s.gunRange! * 0.85 : reachTo(f, p, target, p.s.range!) * 0.9);
    }
    const m = nearestTouch(f, hoppers(), p, p.s.range!);
    if (m) { if (p.acc <= 0) { hitEnemy(f, p, m, p.s.damage!, false); p.acc = T(p.s.interval!); } continue; }
    if (p.gun > 0 || !((p.s.gunRange ?? 0) > 0)) continue;
    const h = nearest(spiky(), p, p.s.gunRange!);
    if (!h) continue;
    shoot(f, p, h, "settler");
    hitEnemy(f, p, h, p.s.gunDamage ?? p.s.damage!, true);
    p.gun = T(p.s.gunInterval!);
  }
  // hoppers wander their zone; a spiked one charges the nearest hunter inside its aggro range and bites after a wind-up
  for (const a of hoppers()) {
    a.acc = down(a.acc);
    const tgt = a.kind === "hopper" ? nearest(humans().filter((u) => u.hpMax > 0), a, a.s.aggroRange ?? 75) : null;
    if (!tgt) { a.charging = false; wander(f, a, a.kind === "hopper" ? 30 : a.s.speed!); continue; }
    if (!a.charging) { a.charging = true; a.acc = Math.max(a.acc, T(a.s.interval!) >> 1); }
    const reach = reachTo(f, a, tgt, a.s.range!), wind = a.s.biteWindup ?? 0;
    if (a.windup > 0) {
      // R2: the bite lands only on a target still in reach when the wind-up ends
      face(a, tgt);
      if (--a.windup === 0) { if (dist(a, tgt) < reach * 1.1) { a.acc = T(a.s.interval!); hurt(f, a, tgt, a.s.damage!, false); } else a.acc = T(0.3); }
      continue;
    }
    if (dist(a, tgt) > reach) moveTo(a, tgt.x, tgt.y, perTick(a.s.speed!), reach * 0.999);
    if (a.acc <= 0 && dist(a, tgt) < reach) {
      if (wind > 0) a.windup = T(wind);
      else { a.acc = T(a.s.interval!); hurt(f, a, tgt, a.s.damage!, false); }
    }
  }
  stepMedics(f);
  for (const u of f.units) if (u.kind !== "player" && u.side === "settler") { u.x = Math.max(12, Math.min(ARENA.w - 12, u.x)); u.y = Math.max(12, Math.min(ARENA.h - 12, u.y)); }
  if (f.mode === "r2") separate(f);
  for (const u of f.units) if (Math.hypot(u.vx, u.vy) > 1e-3) u.face = Math.atan2(u.vx, u.vy);

  f.tick++;
  const sec = f.tick / ARENA.tps;
  // everyone injured with no medic to get them up: the hoppers have won (three up close should beat a hunter who stands, Doug)
  const up = f.units.filter((u) => (u.kind === "player" || u.kind === "hunter") && (u.status === "ok" || u.status === "healing"));
  const medic = f.units.some((u) => u.kind === "medic");
  // the hunt ends once the injured are back up, when someone can heal them
  const healer = medic || f.units.some((u) => u.kind === "player" && u.status === "ok");
  const waiting = f.units.some((u) => isPatient(f, u) || (u.status === "healing" && u.kind !== "guard"));
  if (hoppers().length === 0 && !(healer && waiting)) f.result = { winner: "settlers", seconds: sec, why: "every hopper is down" };
  else if (up.length === 0 && !medic) f.result = { winner: "enemies", seconds: sec, why: "every hunter is injured and no medic is there" };
  else if (sec >= ARENA.timeCap) f.result = { winner: "draw", seconds: sec, why: `time cap ${ARENA.timeCap} s` };
}
