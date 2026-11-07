import { CONTENT_VERSION } from "../../packages/content/src/index.js";
import { ENGINE_VERSION, FP, createSim } from "../../packages/sim/src/index.js";
import { marsGreenhouse as skin } from "../../packages/skins/src/index.js";
import { Guide } from "../../packages/client/src/guide.js";
import { ProgressTracker, type GuideRecord, type StepChange } from "./guide-core.js";

// The walker behind pnpm review:guide. It reaches into the client package, which is not a project
// reference of tools, so this file stays out of the tools typecheck (as tools/guide-follow.ts does).

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
  for (let t = 0; t < seconds * 30 && !sim.state.over; t++) {
    const st = sim.state;
    const g = guide.update(st, skin);
    const key = g ? g.key : "none";
    if (key !== last) { steps.push({ tick: st.tick, key, text: g ? g.text : "" }); last = key; }
    if (tracker.note(st)) progress.push(st.tick);
    let dx = 0, dy = 0;
    if (g) {
      const ex = g.at.x * FP - st.player.pos.x, ey = g.at.y * FP - st.player.pos.y, L = Math.hypot(ex, ey);
      if (L > 6 * FP) { dx = Math.round((ex / L) * 1000); dy = Math.round((ey / L) * 1000); }
    }
    sim.step({ dx, dy });
  }
  const st = sim.state;
  return { levelId, pack, ticks: st.tick, over: st.over, won: st.won === true, reason: st.reason ?? "", steps, progress };
}
