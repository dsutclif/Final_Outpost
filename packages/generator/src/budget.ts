import type { Content, Manifest } from "@fo/content";
import { planBot } from "@fo/bots";

/** Guards the bot hires before any tower (bots brain.ts FIRST_GUARDS). */
export const FIRST_GUARDS = 2;

type PadLike = Record<string, unknown>;
type WaveLike = { counts: Record<string, number> };

const scrapOf = (p: PadLike) => (p["cost"] as Record<string, number> | undefined)?.["res.salvage"] ?? 0;
const isDefence = (p: PadLike, c: Content) =>
  p["type"] === "pad.hire"
    ? c.roles[(p["role"] as { role?: string } | undefined)?.role ?? ""]?.behavior === "guard"
    : String(p["build"] ?? "").startsWith("struct.ranged_defense");

/**
 * Scrap the whole defend purchase list costs (R5: every upgrade and purchase on the level): every scrap pad once,
 * the guard pad `guards` times, and the scrap walls. Each defence purchase raises the next one's price by
 * `growth`; the cheapest are counted first, so the total holds whatever order the player buys in.
 */
export function scrapNeed(pads: readonly PadLike[], wallScrap: number, guards: number, growth: number, c: Content): number {
  let flat = wallScrap;
  const def: number[] = [];
  for (const p of pads) {
    const s = scrapOf(p);
    if (s <= 0) continue;
    const n = p["repeatable"] ? guards : 1;
    if (isDefence(p, c)) for (let k = 0; k < n; k++) def.push(s);
    else flat += s * n;
  }
  def.sort((a, b) => a - b);
  return flat + def.reduce((a, s, k) => a + Math.ceil(s * growth ** k), 0);
}

/** Scrap the attackers drop in the waves the player can still spend (all but the last). */
export function waveScrap(waves: readonly WaveLike[], c: Content): number {
  return waves.slice(0, -1).reduce((a, w) => a + Object.entries(w.counts).reduce((b, [h, n]) => b + n * (c.hostiles[h]?.drops["res.salvage"] ?? 0), 0), 0);
}

/** Guards a defend level's budget pays for: the bot's first guards, or a train-N goal's n. */
export const budgetGuards = (m: Pick<Manifest, "goal">): number =>
  Math.max(FIRST_GUARDS, m.goal.type === "hire" ? Number((m.goal as { n?: number }).n ?? 0) : 0);

/** The defend scrap check on a finished manifest: attackers' drops against the full purchase list. */
export function scrapBudget(m: Manifest, c: Content): { need: number; drops: number } {
  const walls = planBot(m, c).barriers.reduce((a, b) => a + (b.res === "res.salvage" ? b.cost : 0), 0);
  const pads = m.entities.filter((e) => e.type === "pad.build" || e.type === "pad.hire") as unknown as PadLike[];
  const growth = Number(m.params?.["pads.defenceGrowth"] ?? c.defaults["pads.defenceGrowth"] ?? 1);
  return { need: scrapNeed(pads, walls, budgetGuards(m), growth, c), drops: waveScrap(m.waves, c) };
}
