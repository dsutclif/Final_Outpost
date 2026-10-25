import type { Manifest } from "@fo/content";
import { FP, TPS, type Compiled, type ObjectiveState, type State } from "@fo/sim";
import type { Skin } from "@fo/skins";
import { liveObjectives, manifestObjectives } from "./objectives.js";

// The floating play HUD (docs/mockups/hud-header-options.html, "Floating goals under the heat
// bar", agreed with Doug 2026-10-25): a thin heat rail along the top edge (plus a wall rail on
// levels that can be lost on wall health), the level name top left (tap: menu), coins or scrap top
// right, and one floating icon per goal. Each icon is a glyph saying what the goal is about plus
// up to three channels that always mean the same thing: an inner fill (amount), an outer ring
// (time: amber fills while a condition holds, blue empties toward a deadline) and pips (steps).
// Every tracker shows its current number inside the icon (Doug, 2026-10-25): the count so far, the
// steps done, the seconds held, a guarded meter's %, a deadline's last 30 seconds; counts and holds
// also show their target beside it.
// A won goal turns into a gold star; a missed one goes grey with a line through it. Urgent trouble frosts the
// screen edges while the one thing in danger pulses and shakes (the app vibrates in step).
// Everything visual is classes; style.css colours them from the skin.

export type Glyph = "thermo" | "flame" | "coin" | "crate" | "meat" | "colonist" | "pod" | "upgrade" | "shield" | "gate" | "waves" | "skull" | "face" | "chain" | "stopwatch" | "gear" | "flag" | "scrap";

export interface GoalToken {
  id: string;
  glyph: Glyph;
  /** Amount 0..1: the glyph fills from the bottom. */
  fill?: number;
  /** A line across the glyph at 0..1 (a target or, `floor`, a line not to drop below). */
  tick?: number;
  floor?: boolean;
  /** Time ring: `hold` fills while a condition holds, `deadline` empties toward a deadline. */
  ring?: { mode: "hold" | "deadline"; k: number };
  /** Steps: n pips, `done` of them full, the next one `part` full. */
  pips?: { n: number; done: number; part: number };
  /** Stopwatch face: time left 0..1. */
  pie?: number;
  /** Near the end of a deadline: the time marks turn red. */
  warn?: boolean;
  /** The current number, drawn inside the icon. */
  inner?: string;
  /** The target, drawn beside the icon (counts and holds). */
  beside?: string;
  state: "open" | "done" | "failed";
  /** About to be missed (drives the urgent alert). */
  risk: boolean;
  label: string;
}

const GLYPH_OF: Record<string, Glyph> = {
  heat_hold: "thermo", heat_floor: "thermo", settlement_never_freezes: "flame", fuel_full: "flame", no_colonist_freezes: "colonist",
  time_target: "stopwatch", earn: "coin", currency: "coin", earn_within: "coin", sell: "coin",
  produce: "crate", stockpile: "crate", haul: "crate", bulk_order: "crate", chain: "crate", shelves_full: "crate", no_stockpile_overload: "crate",
  salvage: "scrap", protein: "meat", hunt: "meat",
  rescue: "pod", rescue_all: "pod", rescue_before_freeze: "pod", tow_trip: "pod", tow_full_trip: "pod",
  admit: "colonist", population: "colonist", house_all: "colonist", hire: "colonist", no_injuries: "colonist",
  serve_premium: "face", no_angry_customers: "face", streak: "chain",
  core_level: "upgrade", converter_level: "upgrade", turret_level: "upgrade", unlock: "upgrade", clear_zones: "upgrade", build: "upgrade",
  waves: "waves", waves_survived: "waves", boss: "skull", survive: "shield", hp_floor: "shield", gate_held: "gate",
  automate: "gear", converters_running: "gear",
};
/** Progress counted in ticks while a condition holds (it drops to 0 when the condition breaks). */
const HOLD_KINDS = new Set(["heat_hold", "survive", "automate", "converters_running"]);
/** Seconds left on a deadline when it turns red and counts as at risk. */
const WARN_SECONDS = 15;
/** Seconds left on a deadline when the stopwatch face starts showing the count (Doug, 2026-10-25). */
const FACE_SECONDS = 30;
/** How close (0..1 of the meter) a floor star may get before it counts as at risk. */
const FLOOR_MARGIN = 0.06;
/** Heat (0..1 of the reactor cap) below which the colony counts as about to freeze. */
const FREEZE_WARN = 0.15;
/** Wall health (0..1) below which the level counts as about to be lost. */
const WALL_WARN = 0.25;
/** A "never" goal whose nearest cause has this little margin left (0..1) counts as at risk. */
const GUARD_WARN = 0.2;
/** No-injuries: a threat this far (world units) from every colonist reads as a full icon. */
const THREAT_RANGE = 150;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const clock = (ticks: number): string => { const t = Math.round(ticks / TPS); return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : String(t); };

/** Reactor heat 0..1: fuel over the current level's cap (what the heat goals talk about). */
export function heatOf(st: State, cp: Compiled | null): number {
  const lv = cp?.core.levels[Math.min(Math.max(1, st.core.level), cp.core.levels.length) - 1];
  const cap = lv?.fuelCap ?? 0;
  return cap ? clamp01(st.core.fuel / cap) : clamp01((st.meters?.lifeline ?? 0) / 1000);
}

/** Wall health 0..1, or null on levels that can't be lost on it. */
export function wallsOf(st: State, m: Manifest): number | null {
  const max = st.meters?.baseHealthMax ?? 0;
  if (max <= 0 || !(m.fail.includes("meter.base_health") || m.modules.includes("defense"))) return null;
  return clamp01(st.meters.baseHealth / max);
}

/** The level's goals as icons: the main goal first, then the stars (the sim's objectives). */
export function goalTokens(st: State, m: Manifest, cp: Compiled | null, skin: Skin): GoalToken[] {
  const live = st.objectives ?? [];
  const views = liveObjectives(st, m, skin);
  const defs = manifestObjectives(m);
  const heat = heatOf(st, cp), walls = wallsOf(st, m);
  return live.map((o, i) => tokenOf(o, defs[i]?.params ?? {}, views[i]?.label ?? "", st, cp, heat, walls));
}

/** Before its first tick the sim has not set targets yet (the intro cards draw then): read them from the level. */
function targetOf(o: ObjectiveState, p: Record<string, number | string>, cp: Compiled | null): number {
  if (o.target > 0) return o.target;
  if (o.kind === "waves" || o.kind === "waves_survived") return typeof p["n"] === "number" ? p["n"] : cp?.waves.length ?? 0;
  if (typeof p["seconds"] === "number" && (o.kind === "time_target" || HOLD_KINDS.has(o.kind))) return Math.round(p["seconds"] * TPS);
  return typeof p["n"] === "number" ? p["n"] : 0;
}

function tokenOf(o0: ObjectiveState, p: Record<string, number | string>, label: string, st: State, cp: Compiled | null, heat: number, walls: number | null): GoalToken {
  const o = { ...o0, target: targetOf(o0, p, cp) };
  const t: GoalToken = { id: o.id, glyph: GLYPH_OF[o.kind] ?? "flag", state: o.done ? "done" : o.failed ? "failed" : "open", risk: false, label };
  const frac = o.target > 0 ? clamp01(o.progress / o.target) : 0;
  const pct = typeof p["pct"] === "number" ? p["pct"] / 100 : null;
  const guard = !!cp?.content.objectives[o.kind]?.guard;
  if (o.kind === "time_target") {
    const left = Math.max(0, o.target - o.progress);
    t.pie = o.target > 0 ? left / o.target : 1;
    t.warn = left <= WARN_SECONDS * TPS;
    // the last stretch: the face counts its seconds and its pie sweeps just those, full at FACE_SECONDS
    if (left > 0 && left <= FACE_SECONDS * TPS && t.state === "open") { t.inner = String(Math.ceil(left / TPS)); t.pie = left / (FACE_SECONDS * TPS); }
    t.risk = t.warn && t.state === "open";
  } else if (HOLD_KINDS.has(o.kind)) {
    t.ring = { mode: "hold", k: frac };
    if (o.kind === "heat_hold") { t.fill = heat; if (pct !== null) t.tick = pct; }
    else t.fill = 1;
    t.inner = String(Math.floor(Math.min(o.progress, o.target) / TPS));
    t.beside = clock(o.target);
  } else if (guard) {
    // never-breached guards: show the meter they guard, with the line when there is one
    const driver = guardDriver(o.kind, st, cp);
    if (o.kind === "heat_floor" || o.kind === "settlement_never_freezes") t.fill = heat;
    else if (o.kind === "hp_floor" && walls !== null) t.fill = walls;
    else t.fill = o.failed ? 0 : driver ?? 1;
    if (pct !== null) { t.tick = pct; t.floor = true; }
    // the guarded meter as a %; how near a threat is has no number worth reading
    if (o.kind !== "no_injuries" && t.fill !== undefined) t.inner = String(Math.round(t.fill * 100));
    if (t.state === "open") {
      if (pct !== null && t.fill !== undefined) t.risk = t.fill - pct < FLOOR_MARGIN;
      else if (o.kind === "settlement_never_freezes") t.risk = heat < FREEZE_WARN;
      else if (driver !== null) t.risk = driver < GUARD_WARN;
    }
  } else if (o.kind === "waves" || o.kind === "waves_survived") {
    t.pips = { n: Math.max(1, Math.min(8, o.target)), done: Math.min(o.progress, o.target), part: waveCountdown(st, cp) };
    t.inner = String(t.pips.done);
  } else if (o.target >= 2 && o.target <= 5) {
    t.pips = { n: o.target, done: Math.min(o.progress, o.target), part: 0 };
    t.inner = String(t.pips.done);
  } else {
    t.fill = o.done ? 1 : frac;
    t.inner = String(Math.min(o.progress, o.target));
    if (o.target > 1) t.beside = String(o.target);
  }
  return t;
}

/**
 * A "never" goal's margin 0..1 from whatever is closest to breaking it (Doug, 2026-10-25), so the
 * icon drains as the danger grows: the most impatient trader's patience, the weakest gate's
 * strength, the coldest colonist's warmth, room left on the fullest machine tray, or how far the
 * nearest raider or dangerous animal is from any colonist. Null for goals without one.
 */
function guardDriver(kind: string, st: State, cp: Compiled | null): number | null {
  switch (kind) {
    case "no_angry_customers": {
      let k = 1;
      for (const c of st.sales?.queue ?? []) if (!c.angry && c.patienceMax > 0) k = Math.min(k, c.patience / c.patienceMax);
      return clamp01(k);
    }
    case "gate_held": {
      let k = 1;
      for (const b of st.barriers) for (const s of b.sections) if (s.gate && s.built && s.hpMax > 0) k = Math.min(k, s.hp / s.hpMax);
      return clamp01(k);
    }
    case "no_colonist_freezes": {
      let f = 0;
      for (const r of st.residents) if (r.status !== "frozen" && r.status !== "dead") f = Math.max(f, r.frost ?? 0);
      return clamp01(1 - f / 1000);
    }
    case "no_stockpile_overload": {
      let f = 0;
      for (const cv of st.converters) { const cap = cp?.converters[cv.type]?.outCap ?? 0; if (cap > 0) f = Math.max(f, cv.out / cap); }
      return clamp01(1 - f);
    }
    case "no_injuries": {
      const threats = st.hostiles.map((h) => h.pos);
      for (const p of st.prey) if (p.alive && (cp?.animals[st.preyZones[p.zone]?.animal ?? ""]?.aggroRange ?? 0) > 0) threats.push(p.pos);
      let d = Infinity;
      for (const r of st.residents) {
        if (r.status !== "ok") continue;
        for (const q of threats) d = Math.min(d, Math.hypot(q.x - r.pos.x, q.y - r.pos.y));
      }
      return d === Infinity ? 1 : clamp01(d / (THREAT_RANGE * FP));
    }
  }
  return null;
}

/** The next wave's approach 0..1 (fills the open wave pip), 0 while a wave is on. */
function waveCountdown(st: State, cp: Compiled | null): number {
  const w = st.waves, list = cp?.waves;
  if (!w || !list?.length || w.active) return 0;
  const next = list[w.idx];
  if (!next) return 0;
  const prev = w.idx > 0 ? list[w.idx - 1]!.tick : 0;
  return next.tick > prev ? clamp01((st.tick - prev) / (next.tick - prev)) : 0;
}

export type Alert = { kind: "none" } | { kind: "heat" } | { kind: "walls" } | { kind: "goal"; id: string };

/** The one thing to flag as urgent: the colony freezing first, then the walls falling, then a goal about to be missed. */
export function alertOf(st: State, m: Manifest, cp: Compiled | null, tokens: readonly GoalToken[]): Alert {
  if (st.over) return { kind: "none" };
  if (st.freeze?.active || heatOf(st, cp) < FREEZE_WARN) return { kind: "heat" };
  const w = wallsOf(st, m);
  if (w !== null && w < WALL_WARN) return { kind: "walls" };
  const g = tokens.find((t) => t.risk);
  return g ? { kind: "goal", id: g.id } : { kind: "none" };
}

// ------------------------------------------------------------------ drawing

/** Glyph shapes on a 24x24 grid: `shape` is the body (the fill clips to it), `detail` marks drawn over it. */
/** `num`: where a glyph's number sits (centre, 24-grid), when not the middle. */
const GLYPHS: Record<Glyph, { shape: string; detail?: string; top?: number; bot?: number; num?: [number, number] }> = {
  thermo: { shape: '<rect x="9.5" y="2" width="5" height="14" rx="2.5"/><circle cx="12" cy="18" r="4.2"/>', bot: 22.2, num: [12, 17.6] },
  flame: { num: [12, 14.6], shape: '<path d="M12 2.5c1 3.5 5.5 6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4 2.6-5.4.3 1.6 1 2.6 2 3.1C10.6 8.6 11 5.4 12 2.5z"/>' },
  // the credit coin: an octagon with the hexagonal C cut into it, as on the model
  coin: { shape: '<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/>', detail: '<path class="gc" d="M15.6 9.9L13.8 7.6H10.2L7.9 10.3v3.4l2.3 2.7h3.6l1.8-2.3"/>' },
  crate: { shape: '<rect x="4" y="6" width="16" height="14" rx="1.5"/>', detail: '<path class="gl" d="M4 10.5h16M10 6v4.5M14 6v4.5"/>' },
  meat: { num: [14, 9.6], shape: '<path d="M14.5 3.2a6.3 6.3 0 0 1 6.3 6.3c0 4.4-4.3 7.2-8.3 7.2l-2.2 2.2a2.3 2.3 0 1 1-2.9 2.9 2.3 2.3 0 1 1-2.9-2.9l2.2-2.2C6.7 12.7 9.4 3.2 14.5 3.2z"/>' },
  colonist: { num: [12, 17.4], shape: '<circle cx="12" cy="7" r="4"/><path d="M4.5 21v-2.5a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5V21z"/>' },
  pod: { shape: '<rect x="6.5" y="3" width="11" height="18" rx="5.5"/>', detail: '<path class="gl" d="M9 9h6"/>' },
  upgrade: { num: [12, 11], shape: '<path d="M12 3l7 7h-4.2v4.5H9.2V10H5z"/><rect x="5" y="17" width="14" height="3.5" rx="1"/>' },
  shield: { num: [12, 11.5], shape: '<path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/>' },
  gate: { num: [12, 9.5], shape: '<path d="M3.5 21V10a8.5 8.5 0 0 1 17 0v11h-5v-8a3.5 3.5 0 0 0-7 0v8z"/>' },
  waves: { shape: '<path d="M4 4l8 5 8-5v4.5l-8 5-8-5z"/><path d="M4 11.5l8 5 8-5V16l-8 5-8-5z"/>' },
  skull: { shape: '<path d="M12 2.5a8.5 8.5 0 0 0-8.5 8.5c0 3 1.4 5 3.5 6.2V21h10v-3.8c2.1-1.2 3.5-3.2 3.5-6.2A8.5 8.5 0 0 0 12 2.5z"/>', detail: '<circle class="gd" cx="8.8" cy="11.5" r="2"/><circle class="gd" cx="15.2" cy="11.5" r="2"/>' },
  face: { shape: '<circle cx="12" cy="12" r="9"/>', detail: '<circle class="gd" cx="9" cy="10" r="1.2"/><circle class="gd" cx="15" cy="10" r="1.2"/><path class="gds" d="M8.5 15.5q3.5 -3 7 0"/>' },
  chain: { shape: '<rect x="2.5" y="8.5" width="11" height="7" rx="3.5"/><rect x="10.5" y="8.5" width="11" height="7" rx="3.5"/>' },
  stopwatch: { num: [12, 13.8], shape: '<circle cx="12" cy="13.5" r="8.5"/><rect x="10" y="1.5" width="4" height="2.5" rx="1"/>' },
  gear: { shape: '<path d="M10.2 2h3.6l.5 2.6 1.9.8 2.2-1.5 2.5 2.5-1.5 2.2.8 1.9 2.6.5v3.6l-2.6.5-.8 1.9 1.5 2.2-2.5 2.5-2.2-1.5-1.9.8-.5 2.6h-3.6l-.5-2.6-1.9-.8-2.2 1.5-2.5-2.5 1.5-2.2-.8-1.9L1.9 13.8v-3.6l2.6-.5.8-1.9-1.5-2.2 2.5-2.5 2.2 1.5 1.9-.8z"/>', detail: '<circle class="gd" cx="12" cy="12" r="3"/>' },
  flag: { shape: '<path d="M5 2.5h2v19H5z"/><path d="M7 3.5h12l-3 4 3 4H7z"/>' },
  scrap: { shape: '<path d="M3 17l4-9 5 3 3-6 6 12-4 4H6z"/>', detail: '<path class="gl" d="M9 13l3 2M15 11l-1 4"/>' },
};

let uid = 0;

/** One goal icon as SVG (44x44, or 44x52 with pips). */
export function tokenSvg(t: Omit<GoalToken, "id" | "state" | "risk" | "label">, size = 44): string {
  const g = GLYPHS[t.glyph], id = `gk${uid++}`, H = t.pips ? 52 : 44;
  let s = `<svg class="gtok" width="${size}" height="${(size * H) / 44}" viewBox="0 0 44 ${H}" aria-hidden="true">`;
  if (t.ring) {
    const L = 2 * Math.PI * 20;
    s += `<circle class="g-track" cx="22" cy="22" r="20"/><circle class="g-ring ${t.ring.mode}${t.warn ? " warn" : ""}" cx="22" cy="22" r="20" stroke-dasharray="${(t.ring.k * L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 22 22)"/>`;
  }
  // glyphs alone draw larger; a ring takes the outer band
  s += `<g transform="${t.ring ? "translate(10 10)" : "translate(5 5) scale(1.42)"}"><defs><clipPath id="${id}">${g.shape}</clipPath></defs><g class="g-body">${g.shape}</g>`;
  if (t.fill !== undefined) {
    const top = g.top ?? 2, bot = g.bot ?? 22, y = bot - (bot - top) * clamp01(t.fill);
    s += `<rect class="g-amt" x="0" y="${y.toFixed(1)}" width="24" height="${(24 - y).toFixed(1)}" clip-path="url(#${id})"/>`;
  }
  if (t.pie !== undefined) {
    // with the seconds on it the pie fills the whole face, so the number has room
    const a = clamp01(t.pie) * 2 * Math.PI, r = t.inner !== undefined ? 7.6 : 6.6, cx = 12, cy = 13.5;
    const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
    const cls = `g-pie${t.warn ? " warn" : ""}`;
    if (t.pie >= 0.999) s += `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
    else if (t.pie > 0.001) s += `<path class="${cls}" d="M${cx} ${cy}V${cy - r}A${r} ${r} 0 ${t.pie > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}z"/>`;
  }
  s += `<g class="g-line">${g.shape}</g>${g.detail ?? ""}`;
  if (t.inner !== undefined) {
    const [nx, ny] = g.num ?? [12, 12.5];
    s += `<text class="g-secs${t.inner.length > 2 ? " long" : ""}" x="${nx}" y="${ny}" text-anchor="middle" dominant-baseline="central">${t.inner}</text>`;
  }
  if (t.tick !== undefined) {
    const top = g.top ?? 2, bot = g.bot ?? 22, y = bot - (bot - top) * t.tick, narrow = t.glyph === "thermo";
    s += `<line class="g-tick${t.floor ? " floor" : ""}" x1="${narrow ? 7 : 2}" x2="${narrow ? 17 : 22}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }
  s += "</g>";
  if (t.pips) {
    const { n, done, part } = t.pips, w = n > 5 ? 4 : 6, gap = 2, x0 = 22 - (n * w + (n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (w + gap);
      s += `<rect class="g-pip" x="${x}" y="46" width="${w}" height="4" rx="1"/>`;
      const k = i < done ? 1 : i === done ? part : 0;
      if (k > 0) s += `<rect class="g-pip ${i < done ? "on" : "part"}" x="${x}" y="46" width="${(w * k).toFixed(1)}" height="4" rx="1"/>`;
    }
  }
  return s + "</svg>";
}

const STAR = '<svg class="gstar" width="46" height="46" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.4 7 .9-5.1 4.9 1.3 6.9L12 17.6l-6.3 3.3 1.3-6.9-5.1-4.9 7-.9z"/><path class="hl" d="M12 4.5l2.1 4.3"/></svg>';
const SLASH = '<svg class="gslash" viewBox="0 0 50 50" aria-hidden="true"><path d="M41 9L9 41"/></svg>';

/** The icon's inner markup for its state: the meter, a gold star once won, grey and struck through once missed. */
export function goalIcon(t: GoalToken, size = 40): string {
  if (t.state === "done") return STAR;
  const { inner, ...rest } = t;
  return tokenSvg(t.state === "open" && inner !== undefined ? { ...rest, inner } : rest, size) + (t.state === "failed" ? SLASH : "");
}

// ------------------------------------------------------------------ DOM

const q = (k: number): number => Math.round(k * 50) / 50;

/** Keeps the floating HUD's nodes and repaints only what changed. */
export class GoalHud {
  private keys: string[] = [];
  private railKey = "";
  private shown = 0;
  private target = 0;
  private first = true;
  private open: number | null = null;
  private tokens: GoalToken[] = [];

  constructor(private readonly el: { heat: HTMLElement; walls: HTMLElement; goals: HTMLElement; cash: HTMLElement; cashN: HTMLElement; bubble: HTMLElement; frost: HTMLElement }) {}

  reset(currency: number, scrap: boolean): void {
    this.el.goals.textContent = "";
    this.keys = [];
    this.railKey = "";
    this.tokens = [];
    this.shown = this.target = currency;
    this.first = true;
    this.el.cash.classList.toggle("scrap", scrap);
    // coins: the credit model itself, rendered flat once (public/ui/coin.png); scrap keeps its glyph
    const cic = this.el.cash.querySelector(".cic")!;
    if (scrap) cic.innerHTML = tokenSvg({ glyph: "scrap", fill: 1 }, 22);
    else cic.innerHTML = `<img src="${new URL("ui/coin.png", this.el.cash.ownerDocument.baseURI).href}" alt="" width="26" height="26">`;
    this.closeBubble();
    this.setAlert({ kind: "none" });
  }

  /** Paint the rails, the cash count and the goal icons; `slots` limits how many show (the intro reveals them one by one). */
  render(st: State, m: Manifest, cp: Compiled | null, skin: Skin, cash: number, slots = Infinity, next = -1): GoalToken[] {
    const heat = heatOf(st, cp), walls = wallsOf(st, m);
    const rk = `${q(heat)}|${walls === null ? "-" : q(walls)}`;
    if (rk !== this.railKey) {
      this.railKey = rk;
      (this.el.heat.firstElementChild as HTMLElement).style.width = `${heat * 100}%`;
      this.el.walls.hidden = walls === null;
      if (walls !== null) (this.el.walls.firstElementChild as HTMLElement).style.width = `${walls * 100}%`;
    }
    this.target = cash;
    if (this.first) { this.shown = cash; this.first = false; this.paintCash(); }
    const tokens = goalTokens(st, m, cp, skin);
    this.tokens = tokens;
    const doc = this.el.goals.ownerDocument;
    tokens.forEach((t, i) => {
      const hidden = i >= slots;
      const key = hidden ? "hidden" : JSON.stringify([t.inner ?? "", t.beside ?? "", t.state, t.fill !== undefined ? q(t.fill) : null, t.ring ? q(t.ring.k) : null, t.pie !== undefined ? q(t.pie) : null, t.pips, t.warn, t.tick, i === next]);
      let b = this.el.goals.children[i] as HTMLButtonElement | undefined;
      if (!b) {
        b = doc.createElement("button");
        b.type = "button";
        b.className = "gdisc";
        b.dataset["i"] = String(i);
        this.el.goals.appendChild(b);
      }
      if (this.keys[i] === key) return;
      const was = this.keys[i];
      this.keys[i] = key;
      b.dataset["id"] = t.id;
      b.setAttribute("aria-label", t.label);
      b.hidden = hidden && i !== next;
      b.className = `gdisc ${t.state}${i === next ? " next" : ""}${b.classList.contains("alert") ? " alert" : ""}`;
      b.innerHTML = i === next && hidden ? "" : goalIcon(t, 50) + (t.beside && t.state === "open" ? `<span class="gnum">${t.beside}</span>` : "");
      // a goal just won or lost: a short flash
      if (was && was !== "hidden" && JSON.parse(was)[0] !== t.state) { b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash"); }
    });
    while (this.el.goals.children.length > tokens.length) this.el.goals.lastElementChild!.remove();
    if (this.open !== null) this.paintBubble();
    return tokens;
  }

  /** Per frame: count the cash toward its real value. */
  tick(dtSec: number): void {
    if (this.shown === this.target) return;
    const diff = this.target - this.shown;
    const step = Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dtSec * 9)));
    this.shown += Math.sign(diff) * Math.min(Math.abs(diff), step);
    this.paintCash();
  }

  private paintCash(): void {
    const s = String(this.shown);
    if (this.el.cashN.textContent !== s) this.el.cashN.textContent = s;
  }

  /** Coins landing: a short pop on the cash count. */
  pulse(): void {
    const c = this.el.cash;
    c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse");
  }

  /** The walls took a hit: flash their rail. */
  hit(): void {
    const w = this.el.walls;
    w.classList.remove("hit"); void w.offsetWidth; w.classList.add("hit");
  }

  /** Where coins fly to. */
  anchor(): HTMLElement { return this.el.cash; }

  /** Show goal i's sentence under the icons (until the next tap anywhere). */
  showBubble(i: number): void {
    this.open = i;
    this.paintBubble();
  }

  private paintBubble(): void {
    const t = this.tokens[this.open ?? -1], b = this.el.bubble;
    if (!t) { this.closeBubble(); return; }
    const disc = this.el.goals.children[this.open!] as HTMLElement | undefined;
    for (const d of this.el.goals.children) d.classList.toggle("sel", d === disc);
    if (b.firstChild?.textContent !== t.label) b.innerHTML = `<span></span>`;
    (b.firstElementChild as HTMLElement).textContent = t.label;
    if (disc) b.style.setProperty("--x", `${disc.offsetLeft + disc.offsetWidth / 2 - b.offsetLeft}px`);
    b.hidden = false;
  }

  closeBubble(): void {
    this.open = null;
    this.el.bubble.hidden = true;
    for (const d of this.el.goals.children) d.classList.remove("sel");
  }

  get bubbleOpen(): boolean { return this.open !== null; }

  /** Frost the edges and set the one urgent item pulsing. */
  setAlert(a: Alert): void {
    this.el.frost.className = `frost${a.kind === "none" ? "" : a.kind === "goal" ? " on" : " on hard"}`;
    this.el.heat.classList.toggle("alert", a.kind === "heat");
    this.el.walls.classList.toggle("alert", a.kind === "walls");
    for (const d of this.el.goals.children) (d as HTMLElement).classList.toggle("alert", a.kind === "goal" && (d as HTMLElement).dataset["id"] === a.id);
  }
}
