import type { Manifest } from "@fo/content";
import type { Compiled, State } from "@fo/sim";
import { FP, seedRng } from "@fo/sim";
import { guideText, nameOf, workerName, type Skin, type WorkerVars } from "@fo/skins";

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
    // A step whose text cannot be made still points the way, so the arrow never freezes on the previous step.
    let text: string;
    try { text = this.text(st, skin, kind, key.slice(kind.length + 1)); } catch { text = guideText(skin, kind === "pay" ? "padAny" : kind); }
    if (this.out?.key !== key) this.since = st.tick;
    this.out = { key, at: { x: sug.target.x / FP, y: sug.target.y / FP }, text, kind };
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
      case "conv.level": case "struct.ranged_defense.t2": return guideText(skin, "upgrade", { name: targetName });
      default: return guideText(skin, "pay", { name: nameOf(skin, e.build) });
    }
  }
}
