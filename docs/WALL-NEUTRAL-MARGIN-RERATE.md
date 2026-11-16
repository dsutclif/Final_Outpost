# Wall-neutral defend margin: re-rating of the shipped pack (2026-11-16, ops #207)

A defend level's bot margin used to be the mean of core health and wall health (barrier integrity averaged over
every second since the first wave). It is now core health alone (`defendMargin` in `packages/bots/src/play.ts`),
so the same fight scores the same with or without walls. Failed runs keep their goal-progress score.

Method: `tools/rerate-margin.ts` replays every defend level (waves > 0, 11 of 55) of `levels/packs/s1` with the
whole ladder (10 reference seeds, 3 for the other rungs), in pack order with the earlier levels as history. Run on
`origin/main` before and on this branch after; nothing under `levels/` changes. Level numbers are the in-game
numbers (pack index + 1).

Result: **no level's ok flag, feasibility or set of passing rungs moves, and no win rate moves.** Only margins
and, through them, D shift, all in the third decimal:

| Level | D before -> after | F before -> after | Largest rung margin shift |
|---|---|---|---|
| 16 | 0.0443 -> 0.0440 | same | 0.014 |
| 21 | 1 -> 1 | same | 0.007 |
| 32 | same | same | 0.002 |
| 49 | 0.0205 -> 0.0200 | 0.1640 -> 0.1634 | 0.016 |
| 54 | 0.2573 -> 0.2541 | 0.1425 -> 0.1419 | 0.020 |

Levels 5, 10, 27, 38, 43, 55 are bit-identical. Margins only
rise or stay: walls that took damage no longer pull a won level's margin down.

Side finding, not caused by this change: a fresh replay's D differs a lot from the `difficulty` pinned in the
level files (for example level 5 pinned 0.23, replay 0.067; level 49 pinned 0.561, replay 0.020), because the
pins were set in generation with a different reference set. `pnpm levels:check` does not compare D, so this
needs no action here, but D from this script must not be read against the pins.

Rater version string and pinned ratings: unchanged (no engine bump needed).
