# @fo/sequencer

Turns a level index and the levels the player has seen into a generator request (Contract 5 in
`docs/PLAN.md`; the spec's "Sequencing and progression"). Pure and deterministic: no randomness,
choices come from a string hash of the pack id and index.

```ts
import { sequence, sequenceRange, schedule, closure } from "@fo/sequencer";
const req = sequence(14, history);        // history: [{ modules, goal, template, fails? }], most recent last
req.target; req.modules; req.optional; req.introduced; req.goalType; req.template; req.seed;
req.phase;          // "core" | "teach" | "test" | "mix"
req.breather;       // the block's breather level
req.funThreshold;   // the arc's F threshold the generator must clear
const all = sequenceRange(1, 60);         // each request sees the earlier requests as history
```

Rules read `packages/content/data/modules.json` (`requires`, `excludes`, `alwaysOn`,
`introducedAt`) and `data/sequencer.json`.

## Rules

| Rule | Implementation |
|------|----------------|
| Introduction order | Beats in `introducedAt` order. Modules sharing an `introducedAt` are one beat (workers + build pads; core levels + blocked zones). Level 1 is the core loop; then a beat every 3 levels for the first 6 beats (tutorial arc) and every 4 after (`spacing`). The 14 beats land on levels 2, 5, 8, 11, 14, 17, 21, 25, 29, 33, 37, 41, 45, 49. |
| Teach | The beat's modules plus their dependency closure, plus familiar modules up to 2 (most recently introduced first). Forced dependencies can exceed 2 (salvage upgrades needs defense, barrier lines and build pads). The goal is the registry goal that exercises the new module when one fits. |
| Test | The next `testLevels` (2) levels keep the new modules with 1 to 3 companions, different from the teach level's and the previous level's. |
| Mix | 3 to 5 optional modules, always including one introduced in the last 5 levels (once the list runs out, after level 53, no module is recent and the rule lapses). |
| Cap | At most 6 optional modules after the dependency closure. |
| Exclusions | Content `excludes` in either direction (lasso never with hunting or defense). |
| Always on | carry, gather, core, sales. |
| Curve | Tutorial (levels 1 to 20): 0.15 rising to 0.38, teach levels 0.04 lower. After: a sawtooth per 10-level block from 0.45 to 0.8, the block's last level a 0.4 breather; teach levels capped at 0.42 and test levels at 0.55. |
| Novelty | No two consecutive levels share module set, goal and template; no repeat of a module set + goal + template within the last 10 levels (the rater's duplicate window). Templates rotate to satisfy both. |
| Recovery | Optional (`{ recovery: true }`): after two failed attempts (`history[-1].fails >= 2`) the target drops by 0.1. |

## Data-level constraints that come from the bots

These live in `data/sequencer.json` with a note each, because the bot ladder (Stream C) can only
verify a module it actually exercises:

- `coIntroduce: barrier_lines -> lasso`. The bot builds barrier sections only on waves goals and
  registers the module on `barrier_built` or `captured`, so a level with barrier lines alone always
  fails the idle-module filter. Barrier lines are taught with the lasso (which requires them), and
  `dependencyOnly` keeps them from being drawn as a free companion.
- `implies`: workers imply build pads (hire pads are pads); hunting implies workers (the bot never
  hunts; a hunter hire does).
- `anchored` modules (source gating, core levels, blocked zones, hunting) need a pad the bot will
  certainly buy to hang their pads from: build and waves goals, population with housing, or any goal
  with workers (the cashier hire).
- `goalExcludes`: defense modules pair only with waves goals. Currency goals are kept off every
  level with plan steps, and level 1 builds the landmark (`coreGoal`), because the stall detector
  counts sales as progress only toward a plan-step price, so a pad-free currency level stalls.
