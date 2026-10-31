import type { Manifest } from "@fo/content";
import type { Compiled, State } from "@fo/sim";
import { FP, TPS, seedRng } from "@fo/sim";
import { guideText, nameOf, workerName, type Skin, type WorkerVars } from "@fo/skins";

// Guide arrows: every half second ask the bot controller (packages/bots, loaded on demand) what
// a perfect player would do next from the current state (Brain.suggest, which reads the state
// without advancing the controller), and hand the renderer that step's target, the walk there
// and a one-line instruction. The brain keeps naming a step until it is done (reactor and raid
// steps cut in), so the arrow never swaps tasks midway.

/** Seconds without progress toward the level goals before the arrow shows on any level (Doug, backlog R4 item 9). */
export const STUCK_SECONDS = 20;

/**
 * Progress is a new best on the main objective, another objective done, or another pad finished;
 * the player counts as stuck after STUCK_SECONDS with none, however much they move around.
 */
export class StuckTimer {
  private best = -1;
  private done = -1;
  private pads = -1;
  private since = 0;

  stuck(st: State): boolean {
    const main = st.objectives.find((o) => o.id === "main") ?? st.objectives[0];
    const p = main?.progress ?? 0, d = st.objectives.filter((o) => o.done).length, n = st.pads.filter((x) => x.done).length;
    if (p > this.best || d > this.done || n > this.pads) {
      this.best = Math.max(this.best, p);
      this.done = d;
      this.pads = n;
      this.since = st.tick;
    }
    return st.tick - this.since >= STUCK_SECONDS * TPS;
  }
}

export interface GuideTarget { key: string; at: { x: number; y: number }; text: string; kind: string; path: { x: number; y: number }[] }

export interface SuggestionLike { kind: string; target: { x: number; y: number }; key: string; path?: { x: number; y: number }[] }
interface BrainLike {
  suggest(st: State, cp: Compiled): SuggestionLike | null;
}

/** Radius of the arrow circle drawn around a pod, in world units: wide enough to walk without touching it. */
export const TOW_LOOP_R = 44;

/**
 * The walk to a pod, then once around it: towing starts by closing a loop, which nobody guesses, so the arrows draw it.
 * The circle starts on the side the hero is coming from and leaves a gap so it reads as one lap.
 */
export function towLoopPath(path: readonly { x: number; y: number }[], hero: { x: number; y: number }, pod: { x: number; y: number }): { x: number; y: number }[] {
  const start = Math.atan2(hero.y - pod.y, hero.x - pod.x);
  const ring = Array.from({ length: 12 }, (_, i) => {
    const a = start + (i / 12) * Math.PI * 2;
    return { x: pod.x + TOW_LOOP_R * Math.cos(a), y: pod.y + TOW_LOOP_R * Math.sin(a) };
  });
  // the route's last point is the pod itself: stop outside the circle instead of crossing it
  const walk = path.slice(0, -1).filter((q) => Math.hypot(q.x - pod.x, q.y - pod.y) > TOW_LOOP_R);
  return [...walk, ...ring];
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
    let sug: SuggestionLike | null;
    try { sug = this.brain.suggest(st, this.cp); } catch { return (this.out = null); }
    if (!sug) return (this.out = null);
    const kind = sug.kind;
    const key = sug.key;
    // A step whose text cannot be made still points the way, so the arrow never freezes on the previous step.
    let text: string;
    try { text = this.text(st, skin, kind, key.slice(kind.length + 1)); } catch { text = guideText(skin, kind === "pay" ? "padAny" : kind); }
    let path = (sug.path ?? [sug.target]).map((q) => ({ x: q.x / FP, y: q.y / FP }));
    const at = { x: sug.target.x / FP, y: sug.target.y / FP };
    // a tow step aimed at a pod still lying out there, rather than the walk home
    if (kind === "tow" && st.captures.some((c) => c.state === "idle" && c.pos.x === sug.target.x && c.pos.y === sug.target.y)) {
      path = towLoopPath(path, { x: st.player.pos.x / FP, y: st.player.pos.y / FP }, at);
    }
    this.out = { key, at, text, kind, path };
    return this.out;
  }

  private text(st: State, skin: Skin, kind: string, id: string): string {
    const cp = this.cp;
    if (kind === "gather") { const n = st.nodes[Number(id)]; return guideText(skin, kind, n ? { res: nameOf(skin, cp.nodes[n.type]!.yields) } : {}); }
    if (kind !== "pay") return guideText(skin, kind);
    const e = cp.entityById[id];
    if (e?.type === "pad.hire") {
      const { from, to } = e.role;
      const res = from ? cp.nodes[from]?.yields ?? cp.converters[from]?.output ?? Object.keys(cp.animals[from]?.drops ?? {})[0] : undefined;
      const place = (x: string) => nameOf(skin, x === "store.depot" ? "struct.depot" : x);
      const vars: WorkerVars = {};
      if (res) vars.res = nameOf(skin, res);
      if (to?.startsWith("conv.")) vars.machine = place(to);
      if (to) { vars.dest = place(to); vars.place = place(to); } else vars.place = place("sink.sales_point");
      return guideText(skin, "hire", { name: workerName(skin, e.role.role, vars) });
    }
    if (e?.type !== "pad.build") return guideText(skin, "padAny");
    // What the pad acts on: an upgrade names the thing it upgrades, an unlock or clearing names its target.
    const target = e.target ? cp.entityById[e.target] : undefined;
    const targetName = target ? nameOf(skin, target.type === "pad.build" ? target.build : target.type) : "";
    switch (e.build) {
      case "node.enable": return guideText(skin, "unlock", { name: targetName });
      case "zone.clear": return guideText(skin, "clear", { name: targetName });
      case "sink.core.level": return guideText(skin, "upgrade", { name: nameOf(skin, "sink.core") });
      case "conv.level": case "struct.ranged_defense.t2": case "struct.ranged_defense.t3": case "struct.barracks.t2": return guideText(skin, "upgrade", { name: targetName });
      default: return guideText(skin, "pay", { name: nameOf(skin, e.build) });
    }
  }
}
