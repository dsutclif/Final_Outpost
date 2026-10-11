import type { Manifest } from "@fo/content";
import type { Compiled, State } from "@fo/sim";
import { FP, seedRng } from "@fo/sim";
import { guideText, nameOf, type Skin } from "@fo/skins";

// Guide arrows: every half second ask the bot controller (packages/bots, loaded on demand) what
// a perfect player would do next from the current state, and hand the renderer that one target
// and a one-line instruction. The controller's own hysteresis holds a target until its step is
// done or something much more urgent (reactor running dry, raiders) outranks it.

export interface GuideTarget { key: string; at: { x: number; y: number }; text: string; kind: string }

interface BrainLike {
  current: { kind: string; key: string; score: number };
  debug: { target: { pos: { x: number; y: number } } | null };
  tick(st: State): unknown;
}

/** Ticks between asks (about half a second at 30 tps). */
const EVERY = 15;

export class Guide {
  private last = -1000;
  private out: GuideTarget | null = null;
  private constructor(private readonly brain: BrainLike, private readonly cp: Compiled) {}

  /** Load the planner and controller; null if they cannot be built for this level. */
  static async create(manifest: Manifest, cp: Compiled): Promise<Guide | null> {
    try {
      const bots = await import("@fo/bots");
      const plan = bots.planBot(manifest);
      const profile = { ...bots.PROFILES["good"]!, reactionTicks: 0, evalTicks: 1, routeNoise: 0, priorityErr: 0, multitask: true };
      return new Guide(new bots.Brain(cp, plan, profile, seedRng(1)) as unknown as BrainLike, cp);
    } catch { return null; }
  }

  /** Current target, refreshed every half second; null when nothing needs doing. */
  update(st: State, skin: Skin): GuideTarget | null {
    if (st.over) return (this.out = null);
    if (Math.abs(st.tick - this.last) < EVERY) return this.out;
    this.last = st.tick;
    try {
      this.brain.tick(st);
    } catch { return (this.out = null); }
    const cur = this.brain.current, tgt = this.brain.debug.target;
    if (!tgt || cur.kind === "wait") return (this.out = null);
    const kind = cur.kind === "lasso" && st.player.tow.length > 0 ? "tow" : cur.kind;
    const vars: Record<string, string> = {};
    if (kind === "gather") { const n = st.nodes[Number(cur.key)]; if (n) vars["res"] = nameOf(skin, this.cp.nodes[n.type]!.yields); }
    if (kind === "pay") {
      const e = this.cp.entityById[cur.key] as { build?: string; role?: string } | undefined;
      vars["name"] = nameOf(skin, e?.build ?? e?.role ?? cur.key);
    }
    this.out = { key: `${kind}:${cur.key}`, at: { x: tgt.pos.x / FP, y: tgt.pos.y / FP }, text: guideText(skin, kind, vars), kind };
    return this.out;
  }
}
