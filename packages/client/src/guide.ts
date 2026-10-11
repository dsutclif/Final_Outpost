import type { Manifest } from "@fo/content";
import type { Compiled, State } from "@fo/sim";
import { FP, seedRng } from "@fo/sim";
import { guideText, nameOf, type Skin } from "@fo/skins";

// Guide arrows: every half second ask the bot controller (packages/bots, loaded on demand) what
// a perfect player would do next from the current state (Brain.suggest, which reads the state
// without advancing the controller), and hand the renderer that one target and a one-line
// instruction. A suggestion is held for a short while so two near-equal steps do not make the
// arrow flicker; reactor and raid steps cut in at once.

export interface GuideTarget { key: string; at: { x: number; y: number }; text: string; kind: string }

export interface SuggestionLike { kind: string; target: { x: number; y: number }; key: string }
interface BrainLike {
  suggest(st: State, cp: Compiled): SuggestionLike | null;
}

/** Ticks between asks (about half a second at 30 tps). */
const EVERY = 15;
/** A suggestion is kept at least this long unless it is done or something urgent replaces it. */
const HOLD = 60;
/** Steps that outrank whatever is held. */
const URGENT = new Set(["feed", "fight"]);

export class Guide {
  private last = -1000;
  private since = 0;
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
    if (this.out && this.out.key !== key && st.tick - this.since < HOLD && !URGENT.has(kind)) return this.out;
    if (this.out?.key !== key) this.since = st.tick;
    const vars: Record<string, string> = {};
    const id = key.slice(kind.length + 1);
    if (kind === "gather") { const n = st.nodes[Number(id)]; if (n) vars["res"] = nameOf(skin, this.cp.nodes[n.type]!.yields); }
    if (kind === "pay") {
      const e = this.cp.entityById[id] as { build?: string; role?: string } | undefined;
      vars["name"] = nameOf(skin, e?.build ?? e?.role ?? id);
    }
    this.out = { key, at: { x: sug.target.x / FP, y: sug.target.y / FP }, text: guideText(skin, kind, vars), kind };
    return this.out;
  }
}
