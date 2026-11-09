import { CONTENT_VERSION } from "../../packages/content/src/index.js";
import { ENGINE_VERSION, FP, createSim } from "../../packages/sim/src/index.js";
import { marsGreenhouse as skin } from "../../packages/skins/src/index.js";
import { Guide } from "../../packages/client/src/guide.js";
import { ProgressTracker, type GuideRecord, type StepChange } from "./guide-core.js";

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
  const pad = 30 * FP, blocking = rects.map((r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad })).filter((r) => hits(from, to, r));
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
export async function followGuide(manifest: unknown, levelId: string, pack: string, seconds: number): Promise<GuideRecord> {
  // pinned to the running engine so a level from an older pack can still be tried
  const sim = createSim({ ...(manifest as object), engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION });
  const guide = await Guide.create(sim.compiled.manifest, sim.compiled);
  if (!guide) throw new Error("no guide for this level");
  const steps: StepChange[] = [];
  const progress: number[] = [];
  const tracker = new ProgressTracker();
  let last = "";
  // the corner being rounded stays the aim until it is reached, so the walk does not flip at the edge of a ridge
  let wp: { x: number; y: number } | null = null;
  for (let t = 0; t < seconds * 30 && !sim.state.over; t++) {
    const st = sim.state;
    const g = guide.update(st, skin);
    const key = g ? g.key : "none";
    if (key !== last) { steps.push({ tick: st.tick, key, text: g ? g.text : "" }); last = key; }
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
  return { levelId, pack, ticks: st.tick, over: st.over, won: st.won === true, reason: st.reason ?? "", steps, progress };
}
