# @fo/generator

Turns a sequencer request into a bot-verified, rated level manifest with a family and three star
objectives (Contract 5 in `docs/PLAN.md`; REDESIGN-R2 §3-§6). No level-specific code: layouts come
from `data/templates.json`, every knob range, cost and ring size is in `data/generator.json`, every
mechanic number comes from content or the manifest's params. All randomness is the sim's seeded
`mulberry32`.

```ts
import { generate, generateDetailed } from "@fo/generator";
const d = generateDetailed(sequence(7, history), { history });
d.manifest;   // on target, or null when the search budget runs out
d.best;       // closest clean candidate: { manifest, rating, stars: { good, median, goodAll }, starsByRung }
d.stats;      // iterations, rejects by reason, ratings
```

Batch: `pnpm levels:build --from 1 --to 60 --out levels/packs/s1 [--calibrate]`, then
`pnpm levels:check`. Dev: `pnpm vite-node tools/try-level.ts -- --index 7 [--build-only --ladder --p 0.4]`.

## Layout per family (`build.ts`)

Common to every level: the core from the template; a **fuel forest** (8-14 `node.fuel_scrap` packed
at 30-unit spacing plus two `node.material_source`, 105-175 units from the core, a second smaller grove
at low pressure); a sales point only when currency buys something or selling is the point. The clerk
pad, coin pile and the four queue slots come from `salesLayout` (`@fo/sim`) and must lie on screen
(±200 × ±350 of the core), inside the map and clear of every station.

| Family | Elements |
|--------|----------|
| shelter | Housing pads and a gate with arrivals (gate arrivals), core-level pads, rubble over a fuel grove with its clearing pad (rockslides; the pad needs core level 2), dust storms (hazard events, pulled in when the good bot finishes before them). |
| rescue | A **prebuilt closed ring** with one gate on the side with room; stasis pods (and supply crates) outside it, at least 62 units off the ring; pods on freeze timers (pod timers); a rubble band across the map with pods beyond it and its pad between ring and band (clearing the pass); a prey zone in a side strip (hunting). |
| harvest | Food source, farm worker, cashier and core-supplier hires; gated sources with unlock pads (source unlocks); premium/impatient shares (VIPs); `customers.bulkShare` (bulk orders). |
| industrialize | Food processor with cook, feeder (on its own food field) and server; material processor with operator and a scrap feeder, always with the tier-2 alloy works, its operator, a refined-material carrier and a component server; a repeatable converter-level pad (converter levels); depot with a depot supplier and a hauler (none on stockpile goals, which would drain it). |
| defend | A **closed ring** whose attack-facing sections start unbuilt (a share prebuilt at low pressure, the quiet sides prebuilt, the gate on a quiet side), priced 1-2 salvage (currency on currency goals); attacks from 1 side, or 2-3 with multi-side; swarm waves (swarmlings plus raiders) and a boss in the last wave (bosses); turrets, upgrades, reinforcement, barracks, defender training and the med bay priced in salvage, with waves scaled until the drops of every wave but the last cover 1.6× the plan's salvage. A med-bay level opens with an early probe wave so someone gets hurt. |

Walls appear on defend and rescue levels only. Finales combine both families' elements.

**Anchoring.** Every pad must be on the bot's plan before the goal completes (the level ends at the
goal). After a draft, pads off the plan or planned only after the last goal-path step are chained into
the goal path through `requires.pad` (spliced above a shared prerequisite so the chain stays a line);
a draft whose plan cannot be bought in order (requirement loops, core-level deadlocks) is rejected.

## Goal and objectives

The main goal is the request's kind; `objectives[0]` mirrors it. Counts that follow from the layout
(pods, crates, arrivals, zones, unlocks, hires, levels) are set when building. **Rate goals** (earn,
sell, serve premium, streaks, bulk orders, hunt, protein, produce, haul, chain, stockpile, kills,
salvage, earn within T) are sized by a probe: the good bot plays with an unreachable N for the level's
length (or to the end of the waves) and N becomes 90% of what it reached. `fuel_full` gets its deadline
from when the probe filled the core.

Star objectives are settled after the full rating from the ladder's runs:

- **Time target**: 1.04 × the good bot's slowest time (rounded up to a second); goals that end on the clock
  or after a fixed hold (waves, survive, storms, heat hold) take a second family challenge instead.
- **Family challenge**: from the family's list (shelter: settlement never freezes / no colonist freezes
  / heat floor; rescue: tow a full chain without loss / rescue all / tow N in one trip; harvest: no angry
  customers / streak; industrialize: no stockpile overload / hire N; defend: Colony HP floor / no
  injuries / no wall lost), then fallbacks sized from the runs (admit N, rescue N, kills, salvage).
  Params (heat and HP floors, N) come from the good bot's runs (20th-30th percentile). A candidate must
  be earned by the good bot on at least 60% of its seeds and missed by at least one ladder run (never
  trivially satisfied). The preference rotates with the level seed.

The final objectives are replayed in the sim (good bot 10 seeds, every other rung 3); a level ships only
when the good bot earns all three stars on at least one seed. `rating.stars` records the good and median
means.

## Validity (rejected candidates)

- Flow model: a core the player cannot sustain alone (> 60% of the opening), one supplier < 75% of the burn.
- Good bot loses any of three quick seeds (infeasible), or fails the rater's feasibility (every seed
  won with ≥ 20% margin).
- Rater filters: stall on any rung, trivial, idle module, unreadable layout, duplicate.
- **Idle elements** (no exemption for walls): every pad bought, every barrier line built on or hit (or,
  for a rescue ring, a lasso loop closed outside it), every converter producing, every gatherable
  resource gathered, captures brought home, prey hunted, sales made, gate arrivals admitted, storms
  ridden out, all on the good bot's winning runs.
- Objectives: no family challenge qualifies, a trivially met time target, or no three-star seed.

## Search (`index.ts`)

As before: the pressure p drives every knob, bisected on D against `data/reference.json` (recomputed by
`levels:build --calibrate`), knobs jittered by ±0.12 per iteration, quick rating 4 + 2 seeds, full
rating 10 + 3. Only a candidate within ±0.05 on the quick rating gets the full check during the search; the rest wait
in a pool, and when the search ends the closest are checked in turn until one passes (`search.finalTries`), which ships
as off target. Retries share the search (`SearchMemory`): the pressure bracket, dropped pads and the pool. When the
bracket has closed `search.maxWidens` times with a candidate in hand, the target is out of reach and the search stops.

## Candidate log

`generateDetailed` reports every search iteration through `onCandidate`: knobs, the settings a rule could be
written against (wave sizes and drops, towers, costs, health), the good bot's quick runs, the rating, rejects,
objectives, and whether it was kept or shipped. `levels:build` appends them to `levels/candidates/<pack>.jsonl`
(gitignored, 14 days kept) and folds them into `levels/candidates/digest/<day>.json` (committed): outcome counts
and per-family histograms of each setting by outcome, so failed and passing candidates can be compared across builds.
The raw log is never committed, because git history would keep it forever. `pnpm levels:digest` folds it by hand.

## Known limits

- The sim gathers from the first node in range and stops there when that resource is full, so the
  generator keeps fuel nodes out of food nodes' ranges (reported as a sim gap).
- Rate goals finish when the counter reaches N, so the rater's margin is time-based for them; goals
  that end on the clock use health (defend) or mean heat (shelter) as the margin.
