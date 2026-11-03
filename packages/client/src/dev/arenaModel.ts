import type { Manifest } from "@fo/content";
import { fighterNumbers, type FighterKind, type FighterNums } from "./fighterStats.js";

// Fighter arena model (dev only, R6 Release 2 Bundle 5 preview). A float, tick-stepped copy of the sim's combat
// rules (systems/defense.ts, guards.ts, player.ts, hunting.ts) on an open field with no walls, so Doug can watch
// one side fight the other. "today" mode is today's rules; "r2" lays PROPOSALS over them. Today's numbers come
// from fighterStats.fighterNumbers (content data); nothing here copies one.

export type Mode = "r2" | "today";

/**
 * Release 2 combat proposals: `fighter:stat` over today's values (a stat today's rules lack is new).
 * shot* is a ranged attack at the nearest settler it can hurt; lunge* a dash at one after a wind-up.
 */
/** Doug 2026-11-03: one reach for every fighter's ranged attack as a starting point; mites get half. */
export const REACH = 80;
const EQUAL = "Doug 2026-11-03: every reach equal as a starting point";

export const PROPOSALS: { key: string; v: number; why: string }[] = [
  { key: "player:gunRange", v: REACH, why: EQUAL },
  { key: "guard:range", v: REACH, why: EQUAL },
  { key: "drone:range", v: REACH, why: EQUAL },
  { key: "tower1:range", v: REACH, why: EQUAL },
  { key: "tower2:range", v: REACH, why: EQUAL },
  { key: "tower3:range", v: REACH, why: EQUAL },
  // contact attackers get a ranged attack at the common reach, with their own damage and rate
  { key: "hostile.boss:shotRange", v: REACH, why: EQUAL + " (the warlord carries a minigun)" },
  { key: "hostile.boss:shotDamage", v: 4, why: "its contact damage" },
  { key: "hostile.boss:shotInterval", v: 1, why: "its contact interval" },
  { key: "hostile.creature:shotRange", v: REACH, why: EQUAL },
  { key: "hostile.creature:shotDamage", v: 1, why: "its contact damage" },
  { key: "hostile.creature:shotInterval", v: 1, why: "its contact interval" },
  { key: "hostile.swarmling:lungeRange", v: 30, why: "N2 lunge: a dash from this far, past a drone's 20-unit reach" },
  { key: "hostile.swarmling:lungeWindup", v: 0.3, why: "N2 lunge: wind-up before the dash" },
  { key: "hostile.swarmling:lungeCooldown", v: 2, why: "arena guess: the ledger gives no lunge rate" },
  { key: "hostile.swarmling:shotRange", v: REACH / 2, why: "Doug 2026-11-03: mites have half the common reach" },
  { key: "hostile.swarmling:shotDamage", v: 1, why: "N2 acid spit damage" },
  { key: "hostile.swarmling:shotInterval", v: 2, why: "N2 acid spit every 2 s" },
  { key: "hostile.raider_humanoid:shotRange", v: REACH, why: "Doug 2026-11-03: every reach equal as a starting point" },
  { key: "hostile.raider_humanoid:shotDamage", v: 1, why: "N2/N3 rifle damage" },
  { key: "hostile.raider_humanoid:shotInterval", v: 1.5, why: "N2/N3 rifle every 1.5 s" },
  { key: "player:targetable", v: 1, why: "R2 (Doug 2026-11-03): attackers can hurt the commander; at 0 HP he is down for downSeconds, then up healed" },
];

/** Arena-only settings (not game rules): field size, where each side stands, the time cap. World units and seconds. */
export const ARENA = {
  tps: 30, w: 400, h: 220, coreInset: 40, timeCap: 240,
  /** Commander's damage from an attacker's hit. 0 = today's sim (hostiles only make the tow drop; hoppers' bites do hurt). */
  commanderHit: 0,
  lungeDashSpeed: 240,
  /** Where settlers stand, measured left of the core. */
  guardLine: 75, commanderLine: 60, towerLine: 50, postLine: 40,
};

/** Stats shown on a card, in order; `hidden` ones (hp, reach) show in the arena as bars and circles instead. */
export const STAT_LABELS: Record<string, { label: string; unit: string; hidden?: boolean }> = {
  damage: { label: "Attack strength", unit: "" },
  interval: { label: "Attack interval", unit: "s" },
  speed: { label: "Speed", unit: "u/s" },
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
  hp: { label: "HP", unit: "", hidden: true },
  range: { label: "Reach", unit: "u" },
  gunRange: { label: "Gun reach", unit: "u" },
  shotRange: { label: "Ranged reach", unit: "u" },
};
/** Doug 2026-11-03: every animal with a ranged attack spits acid, each in its own colour (the arena draws it). */
export const ACID_COLOR: Record<string, string> = { "hostile.swarmling": "#8ff05a", "hostile.creature": "#ffb43a" };
/** Ranged attack names per fighter, for the cards and tracers. */
export const SHOT_NAME: Record<string, string> = { "hostile.swarmling": "Acid spit", "hostile.creature": "Acid spit", "hostile.raider_humanoid": "Rifle", "hostile.boss": "Minigun" };

export type Edits = Record<string, number>;
export interface CardRow { stat: string; label: string; unit: string; hidden: boolean; v: number; today: number | null; src: string; isNew: boolean; changed: boolean; why?: string }
export interface Roster { fighters: FighterNums[]; rules: Record<string, number> }

export function roster(level?: Manifest | null): { fighters: FighterNums[]; rules: Record<string, number> } {
  const n = fighterNumbers(level);
  return { fighters: n.fighters, rules: Object.fromEntries(Object.entries(n.rules).map(([k, s]) => [k, s.v])) };
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
      const melee = k === "range" && (f.kind === "hostile" || f.kind === "player");
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
  /** Attack counter (ticks), as the sim's acc / atkCd; `gun` the commander's shotCd, `shot` an enemy's ranged counter. */
  acc: number; gun: number; shot: number;
  status: "ok" | "down" | "dead";
  homeX: number; homeY: number;
  windup: number; lungeCd: number; lungeAt: number | null; dash: { tx: number; ty: number; left: number } | null;
  charging: boolean; healCd: number; hitCd: number;
  /** Ticks left of a commander knock-down. */
  downT?: number;
  /** Last movement this tick and a recent-attack timer, for the renderer. */
  vx: number; vy: number; act: number; face: number;
}
export interface Shot { fx: number; fy: number; tx: number; ty: number; kind: "settler" | "enemy" | "acid"; by: string }
export interface HitLog { by: number; byKind: FighterKind; target: number | "base"; dist: number; ranged: boolean; dmg: number }
export interface FightSetup { enemy: string; enemies: number; settler: string; settlers: number; mode: Mode; edits?: Edits; seed?: number; level?: Manifest | null }
export interface Fight {
  tick: number; units: Unit[]; pending: { tick: number; y: number }[];
  base: { x: number; y: number; hp: number; hpMax: number };
  rules: Record<string, number>; mode: Mode;
  shots: Shot[]; hits: HitLog[];
  result: { winner: "enemies" | "settlers" | "draw"; seconds: number; why: string } | null;
  rand: () => number;
  enemyDef: FighterNums; edits: Edits; nextUid: number;
}

const T = (s: number): number => Math.max(1, Math.round(s * ARENA.tps));
const perTick = (uPerS: number): number => uPerS / ARENA.tps;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const down = (v: number): number => (v > 0 ? v - 1 : 0);

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createFight(setup: FightSetup): Fight {
  const R = roster(setup.level);
  const find = (id: string): FighterNums => { const f = R.fighters.find((x) => x.id === id); if (!f) throw new Error(`no fighter ${id}`); return f; };
  const ef = find(setup.enemy), sf = find(setup.settler);
  if (ef.side !== "enemy" || sf.side !== "settler") throw new Error("one side against the other only");
  const rules = { ...R.rules };
  const rand = mulberry(setup.seed ?? Math.floor(Math.random() * 2 ** 31));
  const W = ARENA.w, H = ARENA.h, cx = W - ARENA.coreInset, cy = H / 2;
  const f: Fight = { tick: 0, units: [], pending: [], base: { x: cx, y: cy, hp: rules.baseHealth!, hpMax: rules.baseHealth! }, rules, mode: setup.mode, shots: [], hits: [], result: null, rand, enemyDef: ef, edits: setup.edits ?? {}, nextUid: 1000 };
  let uid = 0;
  const mk = (side: Unit["side"], fn: FighterNums, x: number, y: number): Unit => {
    const s = statsOf(fn, setup.mode, setup.edits);
    const hp = s.hp ?? 0;
    return { uid: uid++, side, type: fn.id, kind: fn.kind, s, x, y, hp, hpMax: hp, acc: 0, gun: 0, shot: 0, status: "ok", homeX: x, homeY: y,
      windup: 0, lungeCd: 0, lungeAt: null, dash: null, charging: false, healCd: 0, hitCd: 0, vx: 0, vy: 0, act: 0, face: side === "enemy" ? Math.PI / 2 : -Math.PI / 2 };
  };
  // settlers hold the right: a column in front of the core for each kind, spread top to bottom
  const n = Math.max(1, Math.floor(setup.settlers));
  const line = sf.kind === "guard" ? ARENA.guardLine : sf.kind === "player" ? ARENA.commanderLine : sf.kind === "tower" ? ARENA.towerLine : ARENA.postLine;
  const gap = sf.kind === "tower" ? 46 : 22;
  for (let i = 0; i < n; i++) {
    const cols = Math.ceil(n * gap / (H - 40));
    const per = Math.ceil(n / cols), col = Math.floor(i / per), row = i % per, rows = Math.min(per, n - col * per);
    f.units.push(mk("settler", sf, cx - line - col * gap, cy + (row - (rows - 1) / 2) * gap));
  }
  // enemies come in one at a time, defense.spawnGap apart, from anywhere along the left edge (no gate: spawnPoint)
  const m = rules.spawnMargin ?? 30;
  for (let i = 0; i < Math.max(1, Math.floor(setup.enemies)); i++) f.pending.push({ tick: i * T(rules.spawnGap ?? 1.1), y: m + rand() * (H - 2 * m) });
  return f;
}

const alive = (u: Unit): boolean => u.status !== "dead";
const enemies = (f: Fight): Unit[] => f.units.filter((u) => u.side === "enemy" && alive(u));

/** Nearest unit strictly within r, as nearestHostile / nearestTroop. */
function nearest(list: Unit[], p: Unit, r: number): Unit | null {
  let best: Unit | null = null, bd = r;
  for (const u of list) { const d = dist(u, p); if (d < bd) { bd = d; best = u; } }
  return best;
}
/** Settlers an attacker can hurt: drones, guards still standing, the commander only with ARENA.commanderHit (hoppers bite it always). */
const hurtable = (f: Fight, hopper = false): Unit[] => f.units.filter((u) => u.side === "settler" && u.status === "ok"
  && (u.kind === "drone" || u.kind === "guard" || (u.kind === "player" && (hopper || ARENA.commanderHit > 0 || (u.s.targetable ?? 0) > 0))));

function moveTo(u: Unit, tx: number, ty: number, step: number, stopAt = 0): void {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d <= stopAt + 1e-6) return;
  const s = Math.min(step, d - stopAt);
  u.x += (dx / d) * s; u.y += (dy / d) * s;
  u.vx += (dx / d) * s; u.vy += (dy / d) * s;
}
const face = (u: Unit, t: { x: number; y: number }): void => { u.face = Math.atan2(t.x - u.x, t.y - u.y); u.act = 10; };

function shoot(f: Fight, a: Unit, t: Unit, kind: Shot["kind"]): void {
  f.shots.push({ fx: a.x, fy: a.y, tx: t.x, ty: t.y, kind, by: a.type });
}

/** Damage to a settler from an attacker: guards keep R5 #26 (strike floor at 1 hp, down at downPct), the commander heals and gets up. */
function hurt(f: Fight, a: Unit, t: Unit, dmg: number, ranged: boolean): void {
  f.hits.push({ by: a.uid, byKind: a.kind, target: t.uid, dist: dist(a, t), ranged, dmg });
  face(a, t);
  if (t.kind === "guard") {
    if (t.status !== "ok") return;
    t.hp = Math.max(1, t.hp - dmg);
    if (t.hp * 100 <= f.rules.downPct! * t.hpMax) t.status = "down";
  } else if (t.kind === "player") {
    t.healCd = T(t.s.healDelay ?? 4);
    t.hp = Math.max(0, t.hp - dmg);
    // hunting.ts bite: at 0 the commander is knocked down and gets up healed; the biter backs off meanwhile
    if (t.hp === 0) { t.status = "down"; t.downT = T(t.s.downSeconds ?? 2); a.acc = T(t.s.downSeconds ?? 2) + T(a.s.interval!); }
  } else if (t.kind === "drone") {
    t.hp -= dmg;
    if (t.hp <= 0) t.status = "dead";
  }
}
function hitEnemy(f: Fight, a: Unit, t: Unit, dmg: number, ranged: boolean): void {
  f.hits.push({ by: a.uid, byKind: a.kind, target: t.uid, dist: dist(a, t), ranged, dmg });
  face(a, t);
  t.hp -= dmg;
  if (t.hp <= 0) t.status = "dead";
}

/** One sim tick, in the sim's system order: player, residents (guards), hunting (hoppers), defense (hostiles, player hits, troops, towers). */
/**
 * Doug 2026-11-03: characters never overlap, except that fliers (drones) pass over ground units. Bodies are kept
 * smaller than the 18 contact reach so two fighters still touch. Towers and anyone lying down don't get pushed.
 */
export const BODY: Record<string, number> = { "hostile.swarmling": 4, "hostile.boss": 8, hopper: 5, tower: 12, ground: 6, drone: 5 };
export const bodyOf = (u: Unit): number => BODY[u.type] ?? BODY[u.kind] ?? BODY["ground"]!;
const flies = (u: Unit): boolean => u.kind === "drone";
function separate(f: Fight): void {
  const live = f.units.filter((u) => u.status !== "dead" && !(u.side === "enemy" && u.x < 0));
  const fixed = (u: Unit): boolean => u.kind === "tower" || u.status === "down";
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!, b = live[j]!;
      if (flies(a) !== flies(b) || (fixed(a) && fixed(b))) continue;
      const min = bodyOf(a) + bodyOf(b);
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 1e-6) { dx = (a.uid < b.uid ? 1 : -1) * 0.01; dy = 0.01; d = Math.hypot(dx, dy); }
      const push = min - d, ux = dx / d, uy = dy / d;
      const sa = fixed(a) ? 0 : fixed(b) ? 1 : 0.5, sb = 1 - sa;
      a.x -= ux * push * sa; a.y -= uy * push * sa; b.x += ux * push * sb; b.y += uy * push * sb;
    }
  }
}

/**
 * A guard or drone under the R2 rule: walk at the nearest attacker until in melee reach, shooting `h` (the nearest in
 * range) on the way, and hit it without a shot once in melee. `tick` false when the caller already ran the counter.
 */
function closeIn(f: Fight, u: Unit, h: Unit | null, foes: Unit[], melee: number, tick = true): void {
  const t = nearest(foes, u, Infinity);
  if (!t) { moveTo(u, u.homeX, u.homeY, perTick(u.s.speed!)); return; }
  if (dist(u, t) > melee * 0.9) moveTo(u, t.x, t.y, perTick(u.s.speed!), melee * 0.9);
  if (!h) return;
  if (tick) u.acc = down(u.acc);
  if (u.acc > 0) { face(u, h); return; }
  u.acc = T(u.s.interval!);
  const close = dist(u, h) <= melee;
  if (!close) shoot(f, u, h, "settler");
  hitEnemy(f, u, h, u.s.damage!, !close);
}

export function stepFight(f: Fight): void {
  if (f.result) return;
  f.shots = [];
  for (const u of f.units) { u.vx = 0; u.vy = 0; if (u.act > 0) u.act--; }
  const R = f.rules, ef = f.enemyDef;
  while (f.pending.length && f.pending[0]!.tick <= f.tick) {
    const p = f.pending.shift()!;
    const s = statsOf(ef, f.mode, f.edits);
    const u: Unit = { uid: f.nextUid++, side: "enemy", type: ef.id, kind: ef.kind, s, x: -10, y: p.y, hp: s.hp!, hpMax: s.hp!, acc: 0, gun: 0, shot: 0, status: "ok", homeX: -10, homeY: p.y,
      windup: 0, lungeCd: 0, lungeAt: null, dash: null, charging: false, healCd: 0, hitCd: 0, vx: 0, vy: 0, act: 0, face: Math.PI / 2 };
    f.units.push(u);
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
      const h = nearest(foes(), p, p.s.range!);
      if (h) { hitEnemy(f, p, h, p.s.damage!, false); p.acc = T(p.s.interval!); continue; }
    }
    if (closing) {
      if (nearest(foes(), p, p.s.range!)) continue;
      const t = nearest(foes(), p, Infinity);
      if (t) moveTo(p, t.x, t.y, perTick(p.s.speed!), p.s.range! * 0.9);
    }
    if (p.gun > 0 || !(p.s.gunRange! > 0)) continue;
    const h = nearest(foes(), p, p.s.gunRange!);
    if (!h) continue;
    shoot(f, p, h, "settler");
    hitEnemy(f, p, h, p.s.damage!, true);
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
    const L = dist(a, tgt);
    if (L > a.s.range!) moveTo(a, tgt.x, tgt.y, perTick(a.s.speed!), a.s.range! * 0.999);
    if (a.acc <= 0 && dist(a, tgt) < a.s.range!) { a.acc = T(a.s.interval!); hurt(f, a, tgt, a.s.damage!, false); }
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
      moveTo(h, h.dash.tx, h.dash.ty, step, contact(h) * 0.9);
      h.dash.left -= step;
      if (h.dash.left <= 0 || Math.hypot(h.dash.tx - h.x, h.dash.ty - h.y) <= contact(h) * 0.9 + 1e-6) { h.dash = null; h.lungeAt = null; }
      continue;
    }
    if (h.windup > 0) {
      h.windup--;
      const t = f.units.find((u) => u.uid === h.lungeAt);
      if (t) face(h, t);
      if (h.windup === 0) {
        if (t && t.status === "ok") h.dash = { tx: t.x, ty: t.y, left: S.lungeRange! + contact(h) };
        else h.lungeAt = null;
      }
      continue;
    }
    const troop = nearest(f.units.filter((u) => u.kind === "drone" && alive(u)), h, contact(h))
      ?? nearest(f.units.filter((u) => u.kind === "guard" && u.status === "ok"), h, contact(h));
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
      const inMelee = !!t && closing && dist(h, t) <= contact(h);
      if (t && h.shot <= 0 && !inMelee) {
        h.shot = T(S.shotInterval!);
        shoot(f, h, t, SHOT_NAME[h.type] === "Acid spit" ? "acid" : "enemy");
        hurt(f, h, t, S.shotDamage!, true);
      }
      if (t && closing) { if (inMelee) face(h, t); else moveTo(h, t.x, t.y, perTick(S.speed!), contact(h) * 0.9); continue; }
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
    const h = nearest(foes().filter((u) => u.kind === "hostile"), p, R.playerHitRange!);
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
  separate(f);
  for (const u of f.units) if (Math.hypot(u.vx, u.vy) > 1e-3) u.face = Math.atan2(u.vx, u.vy);

  f.tick++;
  const sec = f.tick / ARENA.tps;
  const settlers = f.units.filter((u) => u.side === "settler");
  // a knocked-down commander gets up again, so he still counts as standing
  const standing = settlers.filter((u) => u.status === "ok" || (u.kind === "player" && u.status === "down"));
  if (f.pending.length === 0 && enemies(f).length === 0) f.result = { winner: "settlers", seconds: sec, why: "every attacker is down" };
  else if (f.base.hp <= 0) f.result = { winner: "enemies", seconds: sec, why: "the core is destroyed" };
  else if (standing.length === 0) f.result = { winner: "enemies", seconds: sec, why: "every settler is out (downed guards count)" };
  else if (sec >= ARENA.timeCap) f.result = { winner: "draw", seconds: sec, why: `time cap ${ARENA.timeCap} s` };
}

/** Run to the end, headless. */
export function runFight(setup: FightSetup): Fight {
  const f = createFight(setup);
  while (!f.result) stepFight(f);
  return f;
}
