import { CONTENT_VERSION } from "../../packages/content/src/index.js";
import { ENGINE_VERSION, FP, createSim, type State } from "../../packages/sim/src/index.js";
import { marsGreenhouse, marsGreenhouse as skin } from "../../packages/skins/src/index.js";
import { Guide, towGroup, towLoopPath } from "../../packages/client/src/guide.js";
import { ProgressTracker, type GuideRecord, type StepChange } from "./guide-core.js";
import type { ArrowChange, ArrowRecord } from "./arrow-audit.js";
import { traceStory } from "../../packages/client/src/story/trace.js";

// The walker behind pnpm review:guide. It reaches into the client package, which is not a project
// reference of tools, so this file stays out of the tools typecheck (as tools/guide-follow.ts does).

type R = { x: number; y: number; w: number; h: number };
const hits = (a: { x: number; y: number }, b: { x: number; y: number }, r: R): boolean => {
  // segment against rect, by sampling (rects are few and the walk is short)
  for (let i = 0; i <= 40; i++) { const x = a.x + ((b.x - a.x) * i) / 40, y = a.y + ((b.y - a.y) * i) / 40; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true; }
  return false;
};
/** The arrow's point, bent around terrain: when a ridge stands across the straight walk, head for the nearest corner of the chain of ridges that clears it. */
function around(from: { x: number; y: number }, to: { x: number; y: number }, rects: readonly R[], box: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number } {
  const pad = 30 * FP, blocking = rects.map((r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad })).filter((r) => hits(from, to, r) && !(to.x > r.x && to.x < r.x + r.w && to.y > r.y && to.y < r.y + r.h)); // a target inside a ridge's padding (a dig spot against a rockslide) is walked to straight: bending round the ridges for it circled forever
  if (!blocking.length) return to;
  // grow the chain: any ridge touching a blocking one blocks too
  let chain = blocking.slice();
  for (let grew = true; grew;) { grew = false; for (const r of rects) { const q = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }; if (!chain.includes(q) && chain.some((c) => q.x <= c.x + c.w && q.x + q.w >= c.x && q.y <= c.y + c.h && q.y + q.h >= c.y) && !chain.some((c) => c.x === q.x && c.y === q.y)) { chain.push(q); grew = true; } } }
  const e = 12 * FP, x0 = Math.min(...chain.map((c) => c.x)) - e, y0 = Math.min(...chain.map((c) => c.y)) - e, x1 = Math.max(...chain.map((c) => c.x + c.w)) + e, y1 = Math.max(...chain.map((c) => c.y + c.h)) + e;
  const d = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
  const inBox = (c: { x: number; y: number }): { x: number; y: number } => ({ x: Math.min(box.x1, Math.max(box.x0, c.x)), y: Math.min(box.y1, Math.max(box.y0, c.y)) });
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }].map(inBox).filter((c) => d(from, c) > 10 * FP && !chain.some((r) => hits(from, c, r)));
  corners.sort((a, b) => d(from, a) + d(a, to) - (d(from, b) + d(b, to)));
  return corners[0] ?? to;
}

/**
 * What an arrow point lies on: the nearest placed entity, a zone by the middle of its rectangle, or a pod still out there.
 * Shared by both walkers so they label the arrow alike: a pad wins a tie with what it acts on (the dome pad and the field it
 * unlocks stand on one spot), and a rockslide to dig or the prey flats are placed by a rectangle.
 */
function makeNearest(manifest: unknown): (x: number, y: number, captures: readonly { id: unknown; pos: { x: number; y: number } }[]) => { id: string; type: string } {
  const all = (manifest as { entities: { type: string; id?: string; at?: [number, number]; rect?: number[] }[] }).entities;
  const ents = all.filter((e) => e.at && e.id);
  const rectZones = all.filter((e) => e.rect && e.id && (e.type === "zone.blocked" || e.type === "zone.prey")).map((e) => ({ id: e.id!, type: e.type, x: e.rect![0]! + e.rect![2]! / 2, y: e.rect![1]! + e.rect![3]! / 2 }));
  return (x, y, captures) => {
    let best = { id: "", type: "" }, bd = 1e9;
    for (const e of ents) { const d = Math.hypot(e.at![0] - x, e.at![1] - y) - (e.type.startsWith("pad.") ? 0.5 : 0); if (d < bd) { bd = d; best = { id: e.id!, type: e.type }; } }
    for (const z of rectZones) { const d = Math.hypot(z.x - x, z.y - y); if (d < bd) { bd = d; best = { id: z.id, type: z.type }; } }
    for (const c of captures) { const d = Math.hypot(c.pos.x / FP - x, c.pos.y / FP - y); if (d < bd) { bd = d; best = { id: `capture.${String(c.id)}`, type: "capture.pod" }; } }
    return best;
  };
}

/**
 * A shopper at the kiosk, as a player is: the arrow leads to the shelf, but a sale needs the player on the clerk pad (the register) and the
 * coins lie in a pile beside it. When the arrow is at the kiosk and a customer on the line can be served from the shelf, stand where the shelf
 * and the register both reach (what the bot does); with nothing to serve, collect the pile.
 */
function salesAim(st: State, at: { x: number; y: number }): { x: number; y: number } | null {
  const s = st.sales;
  if (!s) return null;
  const f = (v: { x: number; y: number }): { x: number; y: number } => ({ x: v.x / FP, y: v.y / FP });
  const shelf = f(s.pos), reg = f(s.register), pile = f(s.pile);
  if (Math.hypot(at.x - shelf.x, at.y - shelf.y) > 70 && Math.hypot(at.x - reg.x, at.y - reg.y) > 70) return null;
  if (s.queue.some((q) => (s.shelf[q.res] ?? 0) >= q.want)) {
    const L = Math.hypot(shelf.x - reg.x, shelf.y - reg.y) || 1, d = Math.min(L, 15);
    return { x: reg.x + ((shelf.x - reg.x) / L) * d, y: reg.y + ((shelf.y - reg.y) / L) * d };
  }
  return s.pileN > 0 ? pile : null;
}

/** A gate step names the gate, but the walk must go through it: aim at the next corner of the guide's own route past the gate (or on past it along the way in). */
function throughGate(g: { kind: string; at: { x: number; y: number }; path: { x: number; y: number }[] }, p: { x: number; y: number }, core: { x: number; y: number }): { x: number; y: number } {
  if ((g.kind !== "gate" && g.kind !== "gateIn") || g.path.length === 0) return g.at;
  let i = 0, bd = 1e9;
  g.path.forEach((q, k) => { const d = Math.hypot(q.x - g.at.x, q.y - g.at.y); if (d < bd) { bd = d; i = k; } });
  const nx = g.path[i + 1];
  if (nx) return nx;
  // the route ends at the gate: go on through it, away from the core on the way out and toward it on the way in
  const L = Math.hypot(g.at.x - core.x, g.at.y - core.y) || 1, k = (g.kind === "gate" ? 40 : -40) / L;
  return { x: g.at.x + (g.at.x - core.x) * k, y: g.at.y + (g.at.y - core.y) * k };
}

/**
 * Towing starts by closing a loop round the pod, which the guide draws as a route of corner points (towLoopPath). A player walks that lap;
 * the follower latches the lap when the step starts and walks it corner by corner (the route is redrawn from the hero each half second, so
 * walking the live route would chase its own start), then walks it again if the pod is still loose.
 */
class Lap {
  private key = "";
  private path: { x: number; y: number }[] = [];
  private i = 0;
  private at = { x: 0, y: 0 };
  private still = 0;
  /** The corner to walk to, or null when the step is not a lap start. */
  aim(g: { key: string; kind: string; path: { x: number; y: number }[] }, p: { x: number; y: number }): { x: number; y: number } | null {
    if (g.kind !== "tow" || !g.key.startsWith("tow:start") || g.path.length < 6) { this.key = ""; return null; }
    return this.walk(g.key, g.path, p);
  }
  /** Walk the lap latched under `key`, starting a fresh one when the key changes or the lap is done. */
  walk(key: string, path: { x: number; y: number }[], p: { x: number; y: number }): { x: number; y: number } | null {
    if (key !== this.key || this.i >= this.path.length) { this.key = key; this.path = path.slice(); this.i = 0; }
    // a corner the walker cannot reach (a rock in the lap) is skipped after a second of not moving
    this.still = Math.hypot(p.x - this.at.x, p.y - this.at.y) < 0.5 ? this.still + 1 : 0;
    this.at = { x: p.x, y: p.y };
    if (this.still > 30) { this.i++; this.still = 0; }
    while (this.i < this.path.length && Math.hypot(this.path[this.i]!.x - p.x, this.path[this.i]!.y - p.y) < 10) this.i++;
    return this.path[this.i] ?? null;
  }
}

/** Walk a level by the arrow alone. Same loop as tools/guide-follow.ts. */
export async function followGuide(manifest: unknown, levelId: string, pack: string, seconds: number): Promise<GuideRecord & { arrowRecord: ArrowRecord }> {
  // pinned to the running engine so a level from an older pack can still be tried
  const sim = createSim({ ...(manifest as object), engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION });
  const guide = await Guide.create(sim.compiled.manifest, sim.compiled);
  if (!guide) throw new Error("no guide for this level");
  const steps: StepChange[] = [];
  const progress: number[] = [];
  const tracker = new ProgressTracker();
  let last = "";
  const arrows: ArrowChange[] = [];
  const nearestOf = makeNearest(manifest);
  const nearest = (x: number, y: number): { id: string; type: string } => nearestOf(x, y, sim.state.captures);
  let field: Field | null = null;
  const lap = new Lap();
  for (let t = 0; t < seconds * 30 && !sim.state.over; t++) {
    const st = sim.state;
    const g = guide.update(st, skin);
    const key = g ? g.key : "none";
    if (key !== last) {
      steps.push({ tick: st.tick, key, text: g ? g.text : "" }); last = key;
      const n = g ? nearest(g.at.x, g.at.y) : { id: "", type: "" };
      arrows.push({ tick: st.tick, key, entityId: n.id, entityType: n.type });
    }
    if (tracker.note(st)) progress.push(st.tick);
    let dx = 0, dy = 0;
    if (g) {
      field = Field.fresh(field, st);
      const p = { x: st.player.pos.x / FP, y: st.player.pos.y / FP };
      const tgt = { x: 0, y: 0 }; const nx = field.next(p, lap.aim(g, p) ?? salesAim(st, g.at) ?? throughGate(g, p, { x: st.core.pos.x / FP, y: st.core.pos.y / FP })); tgt.x = nx.x * FP; tgt.y = nx.y * FP;
      const ex = tgt.x - st.player.pos.x, ey = tgt.y - st.player.pos.y, L = Math.hypot(ex, ey);
      if (L > 6 * FP) { dx = Math.round((ex / L) * 1000); dy = Math.round((ey / L) * 1000); }
    }
    sim.step({ dx, dy });
  }
  const st = sim.state;
  const defs = (manifest as { objectives?: { id: string; params?: Record<string, unknown> }[] }).objectives ?? [];
  const goals = st.objectives.map((o) => { const t = defs.find((d) => d.id === o.id)?.params?.["target"]; return { id: o.id, kind: o.kind, target: typeof t === "string" ? t : "", doneTick: o.doneTick }; });
  return { levelId, pack, ticks: st.tick, over: st.over, won: st.won === true, reason: st.reason ?? "", steps, progress, arrowRecord: { levelId, ticks: st.tick, goals, arrows } };
}

/**
 * The arrow audit's walk for a story level: the same follower, but through the REAL story director (client/src/story/trace.ts), so
 * the arrow is the one the player sees (the story's cues and guide rules first, the default guide where they leave it). Goals are
 * listed in the story's own order (the order its goal cards show), which is the order they activate in.
 */
export async function followStoryArrows(manifest: unknown, levelId: string): Promise<ArrowRecord> {
  const m = manifest as { entities: { type: string; id?: string; at?: [number, number] }[]; objectives?: { id: string; params?: Record<string, unknown> }[] };
  const arrows: ArrowChange[] = [];
  let record: ArrowRecord | null = null;
  const nearestOf = makeNearest(manifest);
  const nearest = (x: number, y: number, st: { captures: { id: unknown; pos: { x: number; y: number } }[] }): { id: string; type: string } => nearestOf(x, y, st.captures);
  let field: Field | null = null;
  // the plain guide, read alongside the story's arrow: its route carries the lap a tow start needs
  const probe = createSim({ ...(manifest as object), engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION });
  const guide = await Guide.create(probe.compiled.manifest, probe.compiled);
  const lap = new Lap();
  const released = new Map<string, number>();
  await traceStory(levelId, m, {
    follow: {
      drive: (st, at) => {
        if (!at) return { dx: 0, dy: 0 };
        field = Field.fresh(field, st);
        const p = { x: st.player.pos.x / FP, y: st.player.pos.y / FP };
        const g = guide?.update(st, skin);
        const pod = st.captures.find((c) => c.state === "idle" && Math.hypot(c.pos.x / FP - at.x, c.pos.y / FP - at.y) < 30);
        const idle = st.captures.filter((c) => c.state === "idle").map((c) => ({ x: c.pos.x / FP, y: c.pos.y / FP }));
        // the story's arrow is on a pod still loose: walk the lap round it (and the pods beside it), as the default guide draws it
        const loop = pod ? lap.walk(`story-tow:${String(pod.id)}`, towLoopPath([], p, at, towGroup(idle, { x: pod.pos.x / FP, y: pod.pos.y / FP })), p) : null;
        // the story's arrow can stay on the spot a pod was hooked at: a player with pods in tow takes them home, so the follower does
        const towed = st.captures.some((c) => c.state === "towed");
        const next = field.next(p, loop ?? (towed ? { x: st.core.pos.x / FP, y: st.core.pos.y / FP } : null) ?? salesAim(st, at) ?? at);
        const ex = next.x - p.x, ey = next.y - p.y, L = Math.hypot(ex, ey);
        return L > 6 ? { dx: Math.round((ex / L) * 1000), dy: Math.round((ey / L) * 1000) } : { dx: 0, dy: 0 };
      },
      onGoal: (tick, id) => { if (!released.has(id)) released.set(id, tick); },
      onArrow: (tick, key, at, st) => {
        const n = at ? nearest(at.x, at.y, st) : { id: "", type: "" };
        arrows.push({ tick, key: at ? key : "none", entityId: n.id, entityType: n.type });
      },
      onEnd: (st) => {
        const defs = m.objectives ?? [];
        const order = marsGreenhouse.story?.levels[levelId]?.goals.map((g) => g.id) ?? [];
        const rank = (id: string): number => { const i = order.indexOf(id); return i < 0 ? 1e6 : i; };
        const goals = st.objectives
          .map((o) => { const t = defs.find((d) => d.id === o.id)?.params?.["target"]; return { id: o.id, kind: o.kind, target: typeof t === "string" ? t : "", doneTick: o.doneTick, ...(released.has(o.id) ? { activeTick: released.get(o.id)! } : {}) }; })
          .sort((a, b) => rank(a.id) - rank(b.id));
        record = { levelId, ticks: st.tick, goals, arrows };
      },
    },
  });
  if (!record) throw new Error(`story walk of ${levelId} did not finish`);
  return record;
}

/** Walkable-cell grid over the map for the story follower: terrain and the camp wall (not the gate) block, and the follower takes the shortest way round, as a player would. */
class Field {
  private readonly cell = 10;
  private readonly w: number;
  private readonly h: number;
  private readonly blocked: Uint8Array;
  /** Which wall sections stand: the grid is rebuilt when a wall goes up, so the walker does not push into a wall built after the first step. */
  private readonly built: string;
  private goal = "";
  private dist: Int32Array;
  constructor(st: { map?: unknown; zones: { type: string; rect: unknown }[]; barriers: { sections: { a: { x: number; y: number }; b: { x: number; y: number }; built: boolean; gate: boolean }[] }[] }) {
    this.built = Field.signature(st);
    this.w = 142; this.h = 131;
    this.blocked = new Uint8Array(this.w * this.h);
    this.dist = new Int32Array(this.w * this.h);
    const rects: (R & { pad: number })[] = st.zones.filter((z) => z.type === "zone.terrain").map((z) => ({ ...(z.rect as R), pad: 9 * FP }));
    // a wall is given more room than a ridge: the walker is a disc, and it caught on the corner where a wall meets the gate
    for (const b of st.barriers) for (const x of b.sections) if (x.built && !x.gate) rects.push({ pad: 18 * FP, ...{ x: Math.min(x.a.x, x.b.x), y: Math.min(x.a.y, x.b.y), w: Math.abs(x.a.x - x.b.x), h: Math.abs(x.a.y - x.b.y) } });
    for (const r of rects) {
      const pad = r.pad;
      const x0 = Math.floor((r.x - pad) / FP / this.cell), x1 = Math.floor((r.x + r.w + pad) / FP / this.cell), y0 = Math.floor((r.y - pad) / FP / this.cell), y1 = Math.floor((r.y + r.h + pad) / FP / this.cell);
      for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.blocked[y * this.w + x] = 1;
    }
  }
  static signature(st: { barriers: { sections: { built: boolean }[] }[] }): string { return st.barriers.map((b) => b.sections.map((x) => (x.built ? 1 : 0)).join("")).join("|"); }
  static fresh(old: Field | null, st: ConstructorParameters<typeof Field>[0]): Field { return old && old.built === Field.signature(st) ? old : new Field(st); }
  private idx(p: { x: number; y: number }): number { return Math.min(this.h - 1, Math.max(0, Math.floor(p.y / this.cell))) * this.w + Math.min(this.w - 1, Math.max(0, Math.floor(p.x / this.cell))); }
  /** The next point to walk to from `from` on the way to `to`. */
  next(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
    const key = `${Math.round(to.x)},${Math.round(to.y)}`;
    if (key !== this.goal) {
      this.goal = key;
      this.dist.fill(-1);
      const g = this.idx(to);
      const q = [g];
      this.dist[g] = 0;
      for (let i = 0; i < q.length; i++) {
        const c = q[i]!, cx = c % this.w, cy = Math.floor(c / this.w);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const n = ny * this.w + nx;
          if (this.dist[n] !== -1 || this.blocked[n]) continue;
          if (dx !== 0 && dy !== 0 && (this.blocked[cy * this.w + nx] || this.blocked[ny * this.w + cx])) continue;
          this.dist[n] = this.dist[c]! + 1;
          q.push(n);
        }
      }
    }
    if (this.dist[this.idx(from)]! <= 1 && this.dist[this.idx(from)]! >= 0) return to;
    if (this.dist[this.idx(from)] === -1) {
      // standing inside a wall's margin (a cell the grid blocks): step to the nearest open cell that has a way on, rather than straight at the goal
      const c0 = this.idx(from), x0 = c0 % this.w, y0 = Math.floor(c0 / this.w);
      let best = -1, bs = 1e9;
      for (let r = 1; r <= 3 && best < 0; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x0 + dx, ny = y0 + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const n = ny * this.w + nx, d = this.dist[n]!;
        if (d < 0) continue;
        const sc = d + Math.hypot(dx, dy) * 2;
        if (sc < bs) { bs = sc; best = n; }
      }
      return best < 0 ? to : { x: (best % this.w) * this.cell + this.cell / 2, y: Math.floor(best / this.w) * this.cell + this.cell / 2 };
    }
    // follow the descent a few cells on, until the point is clear of where the walker already stands (a centre within the stop distance left the walker idle against a ridge)
    let c = this.idx(from), pt = from;
    for (let hop = 0; hop < 4 && this.dist[c]! > 1 && Math.hypot(pt.x - from.x, pt.y - from.y) < 12; hop++) {
      const cx = c % this.w, cy = Math.floor(c / this.w);
      let best = c, bd = this.dist[c]!;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const n = ny * this.w + nx;
        if (this.dist[n]! >= 0 && this.dist[n]! < bd) { bd = this.dist[n]!; best = n; }
      }
      if (best === c) break;
      c = best;
      pt = { x: (c % this.w) * this.cell + this.cell / 2, y: Math.floor(c / this.w) * this.cell + this.cell / 2 };
    }
    return pt;
  }
}
