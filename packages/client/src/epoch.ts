// No imports: vite.config.ts reads this to stamp release.json.

/**
 * Bumped when a regenerated pack reuses level ids for different levels. A save from an older
 * epoch keeps its coach marks and discoveries; the player chooses whether its level progress
 * (cleared levels and the current one) carries over or starts again at L1.
 * 2: Batch 3 (engine 0.13.0), the 50-level pack.
 */
export const PROGRESS_EPOCH = 2;
