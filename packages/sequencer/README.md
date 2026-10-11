# @fo/sequencer

Turns a level index and the levels the player has seen into a generator request (Contract 5 in
`docs/PLAN.md`; REDESIGN-R2 §5). Pure and deterministic: no randomness, choices come from a string
hash of the pack id and index.

```ts
import { sequence, sequenceRange, closure, familyCounts } from "@fo/sequencer";
const req = sequence(14, history);   // history: [{ modules, goal, template, family, features, fails? }], most recent last
req.family; req.secondary;           // level family (and the second family of a finale)
req.features;                        // family mechanics in the level (data/sequencer.json `features`)
req.goalType; req.goalId;            // objective kind of the main goal, and its id in sequencer.json
req.challenges;                      // kinds the generator may pick the family challenge star from
req.modules; req.introduced; req.template; req.seed; req.target;
req.phase;                           // "teach" | "intro" | "mix" | "finale"
const all = sequenceRange(1, 60);    // each request sees the earlier requests as history
```

Rules read `data/sequencer.json` and content (`modules.json` requires/excludes/alwaysOn).

## Arc

| Levels | Rule |
|--------|------|
| 1-5 | One teach level per family, in story order: shelter, rescue, harvest, industrialize, defend. No features, the family's `teachGoal`, low target. |
| 6-15 | Two intro levels per family, same order twice; each introduces the family's next `intro` feature group (shelter: housing + gate arrivals, then core levels + rockslides + dust storms; rescue: hunting + crates, then pod timers + clearing the pass; harvest: VIPs + source unlocks, then bulk orders; industrialize: material processor (with the tier-2 chain) + converter levels, then depot + haulers; defend: turrets + multi-side attacks + salvage upgrades, then defenders + bosses + med bay). The goal is the one that exercises the most newly introduced features. |
| 16-60 | Families rotate (8 mix levels each); every 10th level is a two-family finale (`finales`: shelter+harvest, rescue+harvest, harvest+industrialize, industrialize+harvest, defend+shelter). Mix levels draw 1-3 of the family's unlocked features, preferring ones its previous level did not use; finales add one feature of the second family. |

Every family gets 12 levels (1 teach + 2 intro + 8 mix + 1 finale as the primary family).

## Goals

`goals` lists each family's goal ids with the features they need (`needs`), the features they would
leave unused because the level ends first (`avoid`), and whether they put a pad on the bot's plan
(`anchor`). Features marked `anchor` (core levels, rockslides, source unlocks) add pads the bot only
buys when they hang off the plan, so they pair only with anchoring goals. Mix levels rotate the
family's goals, least recently used first. Goal ids map to objective kinds (`kind`) where they differ
(defend's "train N defenders" is `hire`, "hold out" is `survive`).

Removed as main goals, with the reason: `perimeter_before_wave1` (the level would end before a single
wave, leaving the defense unused), rescue's "clear the pass" (ends before the pods behind the pass are
reached; rescue goals that need those pods use the pass instead), `tow_trip` and `tow_full_trip` (every
rung finishes them almost at once, so the trivial filter rejects every candidate; they stay as rescue
star challenges). In the s1 pack the rotation never draws `fuel_full`, `hazard_survive`, `sell_each`
or `rescue_housed` as main goals (their feature prerequisites do not come up for the family).

## Curve

Tutorial (levels 1-20): 0.15 rising to 0.38, teach and intro levels 0.04 lower. After: a sawtooth per
10-level block: the block opens on a 0.4 breather, rises from 0.45, and closes on the finale at 0.8.

## Other rules

- Dependency closure (content `requires` plus `implies`: workers imply build pads), content exclusions
  (lasso never with defense, so rescue never pairs with defend), always-on modules.
- Novelty: no two consecutive levels share module set, goal and template; no repeat within 10 levels.
- Recovery (optional): after two failed attempts the target drops by 0.1.
