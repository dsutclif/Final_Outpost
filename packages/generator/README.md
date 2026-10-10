# @fo/generator

Turns a request into a bot-verified, rated level manifest (Contract 5 in `docs/PLAN.md`; the spec's
"Level generation" and "Targeting"). No level-specific code: layouts are templates in
`data/templates.json`, every knob range and cost is in `data/generator.json`, every mechanic number
comes from content or the manifest's params. All randomness is the sim's seeded `mulberry32`.

```ts
import { generate, generateDetailed } from "@fo/generator";
const m = generate({ target: 0.45, modules: ["workers", "converters"], goalType: "build", seed: 7, template: "corridor" });
// null when the search budget runs out
const d = generateDetailed(req, { history });  // { manifest | null, best (closest clean candidate), stats }
```

Batch: `pnpm levels:build --from 1 --to 60 --out levels/packs/s1` (see `tools/build-levels.ts`), and
`pnpm levels:check` replays every pack level on the full ladder.

## Stages

1. **Modules.** `closure()` from `@fo/sequencer`: content `requires`, the sequencer's `implies`,
   always-on modules; content `excludes` throw.
2. **Layout** (`build.ts`, `layout.ts`). A template fixes the core, field rects, shop, landmark,
   prey and depot spots. Everything with an interaction radius is placed by constraint: sampled in
   its region, kept clear of every other centre by the larger radius plus 8 units (the rater's
   unreadable rule), kept off standing spots (register, coin pile, converter operator and pickup,
   start, arrivals admit spot), inside the screen box (±200 × ±350 of the core) for key stations,
   and picked by affinity (a hire pad near what it serves) or, for nodes, by the `reach` knob
   (walking distance from the core). The north stack (y < 330) holds the lasso fence (y 160, prebuilt,
   gate aligned with the core, containers in the outer strip), the defense wall (y 290, three
   sections, the middle one a gate, towers just behind), and the blocked band (full width, with the
   landmark or the containers' access behind it, so the zone pad is the one unlock path). On waves
   goals the blocked zone is an empty south corner. Arrivals use the gate at (240, 872).
3. **Economy** (`flow.ts`). Knobs (burn, distances, costs, customer rate, start fuel and coins) are
   drawn from their `[easy, hard]` range at pressure p. The flow model computes steady-state rates
   from content numbers (player and worker gather rates, carry caps, walking speeds, order sizes,
   prices) and walks the bot's own plan (`planBot`), waiting for each price at the income of the hires
   made so far. It rejects a core the player cannot sustain alone in the opening (> 60% of their
   time), a core supplier covering < 75% of the burn, a goal needing > 85% of the budget, and a
   defense not affordable by the last wave. The goal size (landmark cost, currency or premium N) is
   bisected so the estimated completion time matches the `length` knob.
4. **Goal and fail.** Goal from the request (build landmark, population of every recruit, waves,
   currency, serve premium); `meter.lifeline` always, `meter.base_health` with defense; hazard
   events placed at ~42% of the estimated time (or between waves); `level.budgetSeconds` from the
   flow estimate, then recalibrated to measured play (below).

Pads a module needs bought hang off an **anchor**, a pad certainly on the bot's plan (the landmark,
the last tower, the first housing pad, or the cashier hire), through `requires.pad`: blocked-zone pad,
hunter, depot, then the gated food supplier (which requires its unlock, which requires the first food
supplier). Core levels go on the zone pad or the anchor as `requires.coreLevel: 2`. Converters: the
grill requires the feeder, which requires the cook, so prepared food is made from the moment
customers can order it; on build goals a material processor and refined-material landmark cost are
added 60% of the time. Medical levels get an early probe wave so injuries happen.

## Feasibility, filters, targeting (`index.ts`)

For each candidate: the good bot plays 3 seeds uncapped; any loss rejects it (too hard). The budget
is then set from the slowest of those runs: `budget = t_max / (1 − margin)`, with the `margin` knob
from 0.62 (easy) to 0.22 (hard). The candidate is rated (`@fo/rater`) on 4 + 2 seeds; stalls and
infeasibility lower the pressure, `trivial` raises it, idle modules and unreadable layouts redraw.
D drives a bisection on p with every knob jittered by ±0.12 per iteration (the hill-climb's
mutations). A candidate whose quick D is within tolerance (or the closest so far) is re-rated with
the spec's 10 + 3 seeds; it ships when the full rating is feasible (good bot wins every seed with
≥ 20% margin), filter-clean, within ±0.05 of the target and F ≥ the arc's threshold. Budget: 9
iterations (`search` in `data/generator.json`).

D and F are computed against `data/reference.json`: reference stats recomputed from a generated
calibration batch (`pnpm levels:build --calibrate`), the recalibration the rater README prescribes.
The rater's own shipped reference holds only the four golden levels and saturates on waves levels
(a waves level's threat pressure scores z ≈ 15 or more), so it cannot rate a generated pack.

Each manifest carries `rating: { difficulty, fun, botMargin, botsPassed }` and
`text.mars_greenhouse: { title, goal, tips }` (title from the skin's title words for the goal and the
headline module; tips are the skin's module tips for the modules the level introduces).

## Known limits (bot-side)

- The stall detector treats "too slow to reach the price within the budget" as no progress, so a
  rung that loses on time usually also stalls, and the stall filter rejects the level. On build
  goals this caps how far the ladder can be separated; waves levels reach the top of the band.
- See `packages/sequencer/README.md` for the module/goal constraints that come from bot behaviour.
