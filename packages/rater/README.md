# @fo/rater

Rates a manifest by bot play. It reports a difficulty index **D**, a fun index **F**, the spec's
metrics, per-rung results and the quality filters (Contract 4 and the spec's "Difficulty, fun and
calibration" section).

```ts
import { rate, rateBatch, measure, score, computeReference, historyEntry } from "@fo/rater";
const r = rate(manifest, { refSeeds: 10, otherSeeds: 3, history, reference, weights });
r.D; r.F; r.metrics; r.z; r.fun; r.botsPassed; r.margin; r.winRate; r.feasible; r.filters; r.evidence; r.ok;
const all = rateBatch(manifests);   // in order; each level sees the earlier ones as history
```

CLI (globs are expanded by the CLI itself, so it works from PowerShell):

```
pnpm --filter @fo/rater rate levels/golden/*.json [--seeds 10] [--others 3] [--json]
pnpm --filter @fo/rater rate levels/golden/*.json --write-reference packages/rater/data/reference.json
```

One level costs about 24 bot runs: 10 reference runs, 3 for each other rung, and 2 decisiveness
variants. That is roughly 2 to 4 s.

## Metrics (`measure.ts`)

| Metric | Definition |
|--------|------------|
| `skillNeeded` | Weakest rung winning at least half its runs, mapped to good = 1, average = 0.75, weak = 0.5, novice = 0.25, floor = 0; 1.25 when nobody wins |
| `marginRef` | Mean margin of the reference bot (`good`) |
| `marginMedian` | Mean margin of the median rung (`weak`) |
| `lifelineRisk` | Median rung: 0.5 × (1 − lowest fuel fraction) + 0.5 × share of ticks under 25% fuel |
| `concurrentDemand` | Reference: share of ticks with two or more stations needing the player |
| `routeLoad` | Reference: walking ticks / (walking + acting ticks) |
| `threatPressure` | Defense levels, every rung: (base hp lost / base hp + 0.2 × walls broken + 0.2 × injuries) per minute |
| `economyTightness` | Plan currency need / (start currency + reference income rate × horizon). The horizon is the time budget, or the level length for waves goals |
| `moduleCount` | Optional (not always-on) modules |
| `novelty` | Optional modules absent from the last 5 history entries (0 without history) |

Bot margins are defined in `packages/bots/README.md`. Time margins (build, population, currency)
and health-and-integrity margins (waves) are on different scales; see `byGoal` below.

## Difficulty

`D = σ(Σ w·z + b)` with `z = (metric − mean) / sd` from `ReferenceStats`, and weights and bias in
`data/weights.json`. A metric with zero sd in the reference gets sd 1, so it contributes nothing
until a batch shows spread. When the reference has a `byGoal[goal]` entry, the goal-scaled metrics
(`marginRef`, `marginMedian`) use it. `computeReference` writes that entry only for goal types with
at least `BY_GOAL_MIN` (3) levels in the batch.

`data/reference.json` ships the stats of the four golden levels (10 reference seeds, 3 for the
others). That is a thin sample: sd comes from 4 levels and there is no per-goal entry yet.
Recompute it from the first generated batch.

## Fun (`fun.ts`)

`F = σ(Σ v·y + c)`. Each proxy scores `y ∈ [−1, 1]`, where 1 means on the spec's starting target.

| Proxy | Raw value | Scoring |
|-------|-----------|---------|
| `closeFinish` | Median rung's mean margin | 1 inside 5% to 20%, falling to −1 at 25 points outside the band (45% is a walkover) |
| `lateUncertainty` | Share of median-rung runs still open at 70% of the run: progress < 0.9 and threat ≥ 0.25 | 1 at 50% or more, −1 at 0 |
| `tensionRhythm` | Peaks of the 5 s smoothed threat signal (hysteresis 0.3 to 0.5) | 1 for 2 to 5 peaks, 0 for 1 or 6, −1 otherwise; −1 more if one squeeze lasts over 25% of the run |
| `decisiveness` | Margin spread of the reference bot against two priority-shuffled variants (priority error 0.2 and 0.35) on seed 1 | 1 at a spread of 0.10 or more |
| `rewardCadence` | Median reward gap from the stats histogram; longest gap including the tail | +0.5 for median < 8 s, +0.5 for longest < 30 s, doubled and clamped |
| `deadTime` | Median rung's `wait` ticks / ticks | 1 under 10%, then −0.1 per point |
| `fairFailure` | Share of failed runs with at least 10 s of failing-meter warning (timer losses count as fair: the timer is visible) | 2 × share − 1; 1 when nothing failed |
| `novelty` | Novel elements against the last 5 levels: new modules, new goal type, new template | 1 for at least one element with at most one new module, −0.5 for none, −1 for more than one new module, 0 without history |

## Quality filters (`filters.ts`, thresholds in `data/filters.json`)

| Filter | Fires when |
|--------|------------|
| `idleModule` | An optional module never shows up in `modulesUsed` of any winning run on any rung |
| `trivial` | The floor rung wins every run, each in under `trivialBudgetShare` (40%) of the budget. On waves goals: every run, with mean margin ≥ `trivialWavesMargin` (0.95) |
| `stall` | Any run of any rung stalls (30 s without progress) |
| `unreadable` | One interaction centre lies inside another's radius (content ranges; pads from params), except a pad sitting on the entity it acts on. Or a key station (pad, sales point, converter) is more than `screenRadius` (450) from the core |
| `duplicate` | Same sorted module set, goal type and template as one of the last `duplicateWindow` (10) history entries. The template is `opts.template`, or the manifest's `map.zones` joined |

`evidence` lists the idle modules, the unreadable pairs and stations, the stalled runs
(`profile#seed@tick`), and the level this one duplicates. `ok` means the level is feasible (the
reference bot wins every seed with at least 20% margin) and no filter fired.

## Recalibrating

1. **Reference.** Rate a representative batch (the first generated pack) with
   `--write-reference packages/rater/data/reference.json`. Programmatically:
   `computeReference(manifests.map((m) => measure(m)))`.
2. **Difficulty weights.** Once playtest or telemetry first-attempt fail rates exist, fit `w` and
   `b` by logistic regression of fail rate on `z` (the `z` field of every `Rating`). Write them to
   `data/weights.json`. The spec's gradient-boosted regressor replaces this later; the rater only
   grades and never decides feasibility.
3. **Fun weights.** Fit `v` and `c` the same way against continuation, replay and day-1 retention,
   using the `fun[*].y` values. Retune the band targets in `fun.ts` once telemetry shows where the
   real optimum sits.
4. **Ladder.** If every rung wins everything (`skillNeeded` is 0 across the batch, as on the golden
   levels today), steepen the low rungs in `packages/bots/src/profiles.ts`, then recompute the
   reference.

The shipped difficulty weights are hand-set. Margin weights are lowered and `moduleCount` raised
because the golden sample has one waves level, whose health-and-integrity margin (about 0.95)
would otherwise read as "easiest". With these weights the golden levels order L1 < L2 < L3 < L4.
