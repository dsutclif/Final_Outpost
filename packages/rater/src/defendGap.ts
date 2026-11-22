import { content as defaultContent, type Content } from "@fo/content";
import { gapProfile, type GapOptions } from "@fo/bots";

// Defend S4 rater metrics (report only, outpost-ops#273, spec section 4), from the defend model's per-strategy breaking volumes:
//  gapPosition per wave = (wave hp - V_lo) / (V_hi - V_lo): 0 at the weakest strategy's limit, 1 at the best's (null: no gap there)
//  crossings = how often the best strategy changes between consecutive waves
export interface GapMetrics { gapPosition: (number | null)[]; crossings: number; ratioShare: number }

export function gapMetrics(manifest: unknown, c: Content = defaultContent, o: GapOptions = {}): GapMetrics {
  const p = gapProfile(manifest as never, c, o);
  return { gapPosition: p.waves.map((w) => w.position), crossings: p.crossings, ratioShare: p.ratioShare };
}
