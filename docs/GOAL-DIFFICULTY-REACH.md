# Goal difficulty reach: economy goals (outpost-ops#98, slice 98.1a)

Measured 2026-11-17 on engine 0.34.0 (game main 4da3e7c), current generator and rater rules. This is a measurement,
not a rule change. It feeds 98.2, which gives each goal a target range in `packages/sequencer/data/sequencer.json`.
The defend half (defend families and the Level 60 finale, which is defend + shelter) is slice 98.1. It runs after
the defend wave slices.

## Table

One scratch slot per family and target. A slot counts as **missed** when no candidate came within 0.1 of the target
after the re-rolls (cap 8 re-rolls, so 9 recipes). **Best rating** is the rating closest to the target that any
recipe of the slot produced, whether it shipped or not. **Re-rolls** is the number of new recipes the slot needed.
**Goals tried** lists the goals of the recipes the slot tried, with a count when there was more than one.

| Family | Level slot | Target | Best rating | Re-rolls used | Missed | Goals tried |
|---|---|---|---|---|---|---|
| shelter | 61 | 0.40 | 0.431 | 0 | no | clear_zones |
| shelter | 66 | 0.60 | 0.611 | 2 | no | hazard_survive, build_count |
| shelter | 49 | 0.80 | 0.822 | 1 | no | core_level |
| rescue | 51 | 0.40 | 0.832 | 8 (cap) | **yes** | rescue_all ×9 (pod timers) |
| rescue | 56 | 0.60 | 0.640 | 3 | no | crates, protein, rescue ×2 |
| rescue | 39 | 0.80 | 0.823 | 1 | no | rescue_before_freeze |
| harvest | 41 | 0.40 | 0.337 | 3 | no | hire |
| harvest | 46 | 0.60 | 0.314 | 8 (cap) | **yes** | earn ×9 |
| harvest | 29 | 0.80 | 0.972 | 8 (cap) | **yes** | sell ×3, hire ×4, streak ×2 |
| industrialize | 31 | 0.40 | 0.271 | 8 (cap) | **yes** | converters_running, build, chain, produce |
| industrialize | 36 | 0.60 | 0.357 | 8 (cap) | **yes** | haul, build, chain |
| industrialize | 69 | 0.80 | 0.062 | 8 (cap) | **yes** | automate ×9 |
| finale rescue + harvest | 30 | 0.40 | 0.717 | 8 (cap) | **yes** | rescue ×9 |
| finale rescue + harvest | 30 | 0.60 | 0.717 | 8 (cap) | **yes** | rescue ×9 |
| finale rescue + harvest | 30 | 0.80 | 0.757 | 1 | no | rescue |
| finale harvest + industrialize | 40 | 0.40 | 0.362 | 0 | no | unlock |
| finale harvest + industrialize | 40 | 0.60 | 0.535 | 2 | no | sell_each, hire |
| finale harvest + industrialize | 40 | 0.80 | 0.940 | 8 (cap) | **yes** | unlock ×4, sell_each ×4, hire |
| finale industrialize + harvest | 50 | 0.80 | 0.795 | 2 | no | produce |
| finale shelter + harvest | 70 | 0.80 | 0.811 | 6 | no | core_level ×5, population, build_count |

## What it says

- **Shelter** reaches every target, and so does the shelter + harvest finale at 0.8.
- **Rescue** reaches 0.6 and 0.8. It cannot come down to 0.4 when the slot's goal is `rescue_all` with pod timers:
  every recipe rated about 0.83 or shipped nothing. The re-rolls changed only the template, never the goal.
- **Harvest** reaches 0.4 (`hire`). It misses 0.6 with `earn`: every recipe rated about 0.31. It misses 0.8 from
  above: `hire`, `sell` and `streak` came out at about 0.97, and nothing landed near 0.8.
- **Industrialize** misses all three targets. Its levels rate far too easy: best ratings 0.27 at 0.4, 0.36 at 0.6,
  and 0.06 at 0.8 (`automate`). Every industrialize goal tried (`converters_running`, `build`, `chain`, `produce`,
  `haul`, `automate`) stayed under 0.4.
- **Finales.** Level 30 (rescue + harvest) now reaches 0.8 (0.757, one re-roll). The 2026-11-16 note said it
  could not, but that was before the later engine work. Its floor is about 0.72, so it cannot be asked for 0.4 or
  0.6. Level 40 (harvest + industrialize) reaches 0.4 and 0.6 but not 0.8: its candidates jump from about 0.54 to
  about 0.94. Level 50 (industrialize + harvest, `produce`) and Level 70 (shelter + harvest) reach 0.8.

For 98.2, this suggests these ranges (as measured, one slot each, so treat the edges as rough):
industrialize below about 0.4; `earn` below about 0.4; `hire`/`sell`/`streak` either low or near 0.95, with a gap
around 0.8; `rescue_all` with pod timers about 0.7 and up; the rescue + harvest finale about 0.7 and up;
the harvest + industrialize finale up to about 0.6.

## Not measured

- Defend goals and the Level 60 finale (defend + shelter): slice 98.1, after the wave slices.
- Shelter + harvest and industrialize + harvest finales at 0.4 and 0.6. Finales are always asked for 0.8 by the
  curve, so these targets never come up.
- One slot per family and target, so a family's goals are only covered as far as the slot and its re-rolls reached.
  Goals not tried at all: shelter `heat_hold`, `fuel_full`, `survive`, `admit`, `house_all`; rescue `hunt`;
  harvest `currency`, `serve_premium`, `bulk_order`; industrialize `stockpile`, `converter_level`, `hire_ops`.
- Rating noise: each recipe gets the builder's usual seed retries. No slot was built twice.

## How it was run

Scratch only. Nothing in `levels/packs` or the recipe register changed: each run used a fresh copy of the empty
register in the scratch folder. One build at a time, one slot per build. A slot that hits the re-roll cap stops its
whole build, so slots built together cut each other short. The target was set with `--target-offset` against the
slot's curve target (0.4 slots: 0; 0.6 slots, curve 0.625: -0.025; 0.8 slots, curve 0.756: +0.044; Level 30/40 at
0.6 and 0.4: -0.2 and -0.4).

```
cp packages/sequencer/data/recipe-register.json <scratch>/reg-<slot>.json
pnpm levels:build --only <slot> --target-offset <offset> --out <scratch>/packs/m981a-<slot> --no-doc --jobs 1 --register <scratch>/reg-<slot>.json
```

The best rating and re-rolls come from the build log (`recipe failed (closest D=...)` and `re-roll ->` lines) and
the scratch pack's `build-log.json`. Wall time was about 4.5 hours. Capped slots took 15 to 35 minutes each.
