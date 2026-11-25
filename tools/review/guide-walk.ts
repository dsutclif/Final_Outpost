import { CONTENT_VERSION } from "../../packages/content/src/index.js";
import { ENGINE_VERSION, FP, createSim } from "../../packages/sim/src/index.js";
import { marsGreenhouse, marsGreenhouse as skin } from "../../packages/skins/src/index.js";
import { Guide } from "../../packages/client/src/guide.js";
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
  const ents = (manifest as { entities: { type: string; id?: string; at?: [number, number] }[] }).entities.filter((e) => e.at && e.id);
  const rectZones = (manifest as { entities: { type: string; id?: string; rect?: number[] }[] }).entities.filter((e) => e.rect && e.id && (e.type === "zone.blocked" || e.type === "zone.prey")).map((e) => ({ id: e.id!, type: e.type, x: e.rect![0]! + e.rect![2]! / 2, y: e.rect![1]! + e.rect![3]! / 2 }));
  /** What the arrow's point lies on: the nearest placed entity, or a pod still out there. */
  const nearest = (x: number, y: number): { id: string; type: string } => {
    let best = { id: "", type: "" }, bd = 1e9;
    // a pad wins a tie with what it acts on (the dome pad and the field it unlocks stand on one spot)
    for (const e of ents) { const d = Math.hypot(e.at![0] - x, e.at![1] - y) - (e.type.startsWith('pad.') ? 0.5 : 0); if (d < bd) { bd = d; best = { id: e.id!, type: e.type }; } }
    // zones are placed by a rectangle (a rockslide to dig, the prey flats): the arrow's point lies on the middle of it
    for (const z of rectZones) { const d = Math.hypot(z.x - x, z.y - y); if (d < bd) { bd = d; best = { id: z.id, type: z.type }; } }
    for (const c of sim.state.captures) { const d = Math.hypot(c.pos.x / FP - x, c.pos.y / FP - y); if (d < bd) { bd = d; best = { id: `capture.${String(c.id)}`, type: "capture.pod" }; } }
    return best;
  };
  // the corner being rounded stays the aim until it is reached, so the walk does not flip at the edge of a ridge
  let wp: { x: number; y: number } | null = null;
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
      const terrain = st.zones.filter((z) => z.type === "zone.terrain").map((z) => z.rect as R);
      const want = around(st.player.pos, { x: g.at.x * FP, y: g.at.y * FP }, terrain, { x0: sim.compiled.player.walkBox.x0 + sim.compiled.player.radius + FP, y0: sim.compiled.player.walkBox.y0 + sim.compiled.player.radius + FP, x1: sim.compiled.player.walkBox.x1 - sim.compiled.player.radius - FP, y1: sim.compiled.player.walkBox.y1 - sim.compiled.player.radius - FP });
      if (wp && Math.hypot(wp.x - st.player.pos.x, wp.y - st.player.pos.y) < 10 * FP) wp = null;
      if (!wp && (want.x !== g.at.x * FP || want.y !== g.at.y * FP)) wp = want;
      const tgt = wp ?? want;
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
  const ents = m.entities.filter((e) => e.at && e.id);
  const arrows: ArrowChange[] = [];
  let record: ArrowRecord | null = null;
  const nearest = (x: number, y: number, st: { captures: { id: unknown; pos: { x: number; y: number } }[] }): { id: string; type: string } => {
    let best = { id: "", type: "" }, bd = 1e9;
    for (const e of ents) { const d = Math.hypot(e.at![0] - x, e.at![1] - y); if (d < bd) { bd = d; best = { id: e.id!, type: e.type }; } }
    for (const c of st.captures) { const d = Math.hypot(c.pos.x / FP - x, c.pos.y / FP - y); if (d < bd) { bd = d; best = { id: `capture.${String(c.id)}`, type: "capture.pod" }; } }
    return best;
  };
  let field: Field | null = null;
  const released = new Map<string, number>();
  await traceStory(levelId, m, {
    follow: {
      drive: (st, at) => {
        if (!at) return { dx: 0, dy: 0 };
        if (!field) field = new Field(st);
        const p = { x: st.player.pos.x / FP, y: st.player.pos.y / FP };
        const next = field.next(p, at);
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
  private goal = "";
  private dist: Int32Array;
  constructor(st: { map?: unknown; zones: { type: string; rect: unknown }[]; barriers: { sections: { a: { x: number; y: number }; b: { x: number; y: number }; built: boolean; gate: boolean }[] }[] }) {
    this.w = 142; this.h = 131;
    this.blocked = new Uint8Array(this.w * this.h);
    this.dist = new Int32Array(this.w * this.h);
    const rects: R[] = st.zones.filter((z) => z.type === "zone.terrain").map((z) => z.rect as R);
    for (const b of st.barriers) for (const x of b.sections) if (x.built && !x.gate) rects.push({ x: Math.min(x.a.x, x.b.x), y: Math.min(x.a.y, x.b.y), w: Math.abs(x.a.x - x.b.x), h: Math.abs(x.a.y - x.b.y) });
    const pad = 9 * FP;
    for (const r of rects) {
      const x0 = Math.floor((r.x - pad) / FP / this.cell), x1 = Math.floor((r.x + r.w + pad) / FP / this.cell), y0 = Math.floor((r.y - pad) / FP / this.cell), y1 = Math.floor((r.y + r.h + pad) / FP / this.cell);
      for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.blocked[y * this.w + x] = 1;
    }
  }
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
    const c = this.idx(from), cx = c % this.w, cy = Math.floor(c / this.w);
    if (this.dist[c] === -1 || this.dist[c]! <= 1) return to;
    let best = c, bd = this.dist[c]!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      const n = ny * this.w + nx;
      if (this.dist[n]! >= 0 && this.dist[n]! < bd) { bd = this.dist[n]!; best = n; }
    }
    return { x: (best % this.w) * this.cell + this.cell / 2, y: Math.floor(best / this.w) * this.cell + this.cell / 2 };
  }
}
