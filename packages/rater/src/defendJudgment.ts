import { LADDER, playBot, type BotOptions, type BotProfile } from "@fo/bots";

// Defend S3 rater metric (report only, outpost-ops#273, spec section 4):
//  judgmentShare = spread lost when good runs at floor's judgment / good-to-floor spread  (target >= 0.5)
// The spread is the mean margin over the same seeds. A share near 1 means the ladder's spread comes from judgment; near 0,
// from reaction, noise and multitask. Null when there is no spread to explain (good and floor margins within 0.02).

export interface JudgmentShare { share: number | null; good: number; floor: number; goodAtFloorJudgment: number; seeds: number }

const meanMargin = (m: unknown, p: BotProfile, seeds: number[], opts: BotOptions): number => seeds.reduce((a, s) => a + playBot(m, p, s, opts).margin, 0) / seeds.length;

export function judgmentShare(manifest: unknown, seeds: number[] = [1, 2], opts: BotOptions = {}): JudgmentShare {
  const good = LADDER.find((p) => p.name === "good")!, floor = LADDER.find((p) => p.name === "floor")!;
  const g = meanMargin(manifest, good, seeds, opts), f = meanMargin(manifest, floor, seeds, opts);
  const gf = meanMargin(manifest, { ...good, name: "good@floorJudgment", judgment: floor.judgment! }, seeds, opts);
  const spread = g - f;
  return { share: Math.abs(spread) < 0.02 ? null : (g - gf) / spread, good: g, floor: f, goodAtFloorJudgment: gf, seeds: seeds.length };
}
