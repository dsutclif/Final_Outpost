# @fo/bots

Headless players for the level engine (Contract 4 in `docs/PLAN.md`). A planner turns a manifest
into a build order, a utility controller plays it one input per tick, and a ladder of five skill
profiles adds human-like imprecision. Everything is derived from the manifest and content: no
level-specific code, no `Math.random` (the bot draws from its own seeded `mulberry32`).

```ts
import { planBot, playBot, LADDER, PROFILES } from "@fo/bots";
const plan = planBot(manifest);                       // build order, barrier sections, flags
const r = playBot(manifest, PROFILES.good, seed, {    // seed replaces manifest.seed
  attempt: 0, timeBudgetSeconds: 300, recordInputs: true, plan,
});
r.won; r.reason; r.ticks; r.margin; r.stalls; r.stallStates; r.trace; r.hash; r.inputs;
```

## Planner (`plan.ts`)

`planBot(manifest, content)` returns ordered `steps` (pad, reason, `when`, `repeat`, cost,
`goalPath`), `barriers` (unbuilt sections), `currencyNeeded`, `goalCurrency`, and `lasso`/`gate` flags.

Order of the stages:

1. **Economy**: the cheapest unconditional supplier hire to `sink.core`, then one to
   `sink.sales_point`, then the cashier. Each is skipped when a pre-placed person already has that
   binding.
2. **Converters whose output sells**: the converter pad, its operator, hires that feed it, and
   servers that carry its output to the sales point.
3. **Goal**:
   - `build`: the target pad plus its requirement closure. `requires.pad` comes first, and
     `requires.coreLevel` pulls in `sink.core.level` pads. A capped cost resource (for example
     refined material) pulls in the converter pad that makes it, plus that converter's operator.
   - `population`: housing pads, unrequired first then cheapest, until the slots reach N.
     Every `zone.clear` pad is added when people plus reachable containers plus gate arrivals fall
     short. A container counts as reachable when its straight line to the core crosses no blocked
     zone.
   - `waves`: every unbuilt barrier section, then towers. Defender training pads (repeated for
     every resident who could be idle) are added when the waves grow. Upgrades are added when
     hostiles drop a non-sellable resource such as salvage.
4. **Conditional steps**: the medical pad once injuries happen (`when: "injuries"`). Housing pads
   once recruits are waiting (`when: "waiting"`), except on population goals, where housing is
   part of the goal.
5. **Supply routing**: the depot pad and its hauler hires.

At run time a hire step is skipped while nobody is idle and nobody is coming (gate queue, timer,
containers, waiting residents). The skip is lifted when that changes.

## Controller (`brain.ts`)

Every `evalTicks` ticks the controller scores the tasks the state offers. It picks the best one,
or the runner-up with probability `priorityErr`. The new task only replaces the current one when
the current task has finished or the new score beats it by more than 8. It takes effect after
`reactionTicks` plus up to half that again as jitter. A decision still waiting out its delay is
kept unless something scores 15 higher. Targets are resolved from live state every tick, so one
decision can follow a moving hostile or move to the next node when one runs dry.

| Task | Score (base) | Target |
|------|--------------|--------|
| `fight` | 85 when a hostile hits a wall or the base, or is near the line or core; 66 for any other hostile | Base attackers first, then walkers past the line, then wall hitters. Approached from the core side; stops inside attack range. |
| `feed` | 30 to 80 by fuel shortfall; 96 when the fuel left lasts no longer than the walk to the core; 84 in a hazard | A ring point inside core range, clear of pads |
| `fuel` | 92 when fuel runs out before a trip; 82 in a hazard; 44 to 77 without a core supplier below 55%; 50 with a supplier below 30% | The best fuel node, by fuel value per tick including the walk (dense fuel wins when it is close) |
| `admit` | 62, or 70 on population goals | The gate's admit spot |
| `barrier` | 80 while waves remain, else 55, once the line resource covers the section | Section midpoint, 10 units toward the core |
| `pay` | 70 when the remainder is in hand, or when a full backpack of a capped cost can go in (installments) | The pad |
| `pile` | 72 when it completes the next payment, else 20 to 50 | The register's coin pile |
| `stock` | 58 when a queued order needs it, 48 otherwise; 25 while still gathering a worthwhile load | Shelf and register spot |
| `register` | 55 with a servable customer and no cashier | Shelf and register spot |
| `gather` | 46 or 36 for unsupplied sellables, 15 or 30 when a supplier exists; 43 for converter inputs the plan needs | Best node for the resource |
| `operate`, `deposit`, `fetch` | 45, 47, 52 when the plan needs the converter's output (38 when it only sells) | Operator spot that also reaches the hopper; ring inside converter range; pickup spot |
| `drop` | 60 when a step needs the resource (salvage), 47 for sellables | The drop |
| `lasso` | 52 to start, 60 while looping, 78 while towing | See below |
| `wait` | 1 (counted as dead time) | Stand still |

The scores live inline in `Brain.score`.

**Multitask.** With `multitask: false`, fuel tasks are hidden while another task is running. The
current task must end (or run 10 s) before the bot notices the core, which is the spec's "notices
the core running low while selling".

**Lasso.** A 16-point loop goes around the nearest reachable idle container. The radius is
40, 34, 28 or 24 units: the first that keeps every point walkable. The bot walks to the nearest
loop point, checks that it is outside a line, walks the loop plus 3 points of overlap, then takes
another nearby container if the chain has room. To bring captives home it walks into the core and
out the far side, alternating sides, until every captive has entered the safe radius and started
releasing.

**Movement (`nav.ts`).** The bot steers in a straight line when the line of sight is clear. When
it is not, it runs grid A* (8-unit cells) around uncleared blocked zones, built wall sections and
the core's exclusion disc, then aims at the farthest path node still in sight. Gates are
passable, so a target across a line routes through the nearest gate. Pads the bot is not paying
are soft obstacles (+80 per cell), because standing on one spends coins and blocks other actions.
Connected-component labels answer "reachable at all" in O(1). A bot that is wedged sidesteps.

**Imprecision (`profiles.ts`).**

- `routeNoise` adds a slowly resampled perpendicular push to each step.
- `routeNoise` also scales input timing noise: with probability `0.08 × routeNoise` the previous
  input is held for a few more ticks.
- `withLearning(profile, attempt)` shrinks reaction, route noise and priority error by
  `(1 − learn)^attempt`.

| Profile | reactionTicks | routeNoise | priorityErr | multitask | evalTicks |
|---------|---------------|-----------|-------------|-----------|-----------|
| good | 3 | 0 | 0 | yes | 4 |
| average | 10 | 0.2 | 0.06 | yes | 6 |
| weak | 20 | 0.4 | 0.15 | no | 8 |
| novice | 40 | 0.6 | 0.28 | no | 12 |
| floor | 70 | 0.8 | 0.42 | no | 16 |

## Results (`play.ts`)

**End of a run.** A run ends when the sim ends or the tick cap is reached. The cap is the level
timer, otherwise the time budget, or for waves goals the last wave plus `WAVES_TAIL_SECONDS` (120).
A run cut off by the cap reports reason `budget`.

**Time budget.** `level.budgetSeconds` from the compiled manifest (content default 300; DECISIONS
9b): a rating input for margins, the trivial filter and stars, never a fail condition.
`opts.timeBudgetSeconds` overrides it. A level timer (`timer.seconds`), when set, always wins.

**Margin.**

- Build, population, currency and serve-premium goals: `(budget − ticks) / budget`.
- Waves goals: the mean of the base-health fraction left and the barrier integrity. Integrity is
  built hp over max hp, averaged every second from the first wave, so quick fights and rebuilds
  count.
- A loss scores `−(1 − goal progress)`, which lies in [−1, 0].

**Stalls.** A stall is 30 s without progress. Progress means any of:

- a pad payment, build, hire, unlock, core upgrade, zone clear, capture, release, admission,
  move-in, barrier progress or build, wave cleared, or kill;
- on waves goals, a wave still to come;
- a sale or pile collection, while the next currency need is reachable at the income seen so far
  (1.5 × income rate × time left);
- a player core feed while the core is below half.

Pure survival, or saving for an unreachable price, is not progress. Each stall records the tick,
position, backpack, task, next plan step, currency, fuel, and the entities within 120 units. The
timer then restarts.

**Trace** (`BotTrace`):

| Field | Definition |
|-------|------------|
| `lifelineMin` | Lowest core fuel as a fraction of capacity |
| `lifelineLowTicks` | Ticks with fuel under 25% of capacity |
| `concurrentDemand` | `stats.concurrentDemandTicks / ticks` (two or more stations need the player) |
| `routeShare` | Ticks walking without a player action / (walking + acting ticks) |
| `baseHpLost`, `barriersBroken`, `injuries` | From meters and stats |
| `currencyNeeded` | `plan.currencyNeeded`: currency costs of unconditional plan steps and barrier sections |
| `currencyEarned` | Sum of `sold.pay` |
| `rewardGaps` | Seconds between rewards in the `stats.rewardTicks` ring (last 64) |
| `rewardGapMax` | Longest gap, including the tail to the end |
| `rewardGapMedian` | Median gap from `stats.rewardGapHist` (bucket upper edge) |
| `deadTicks` | Ticks the controller chose `wait` |
| `modulesUsed` | Modules whose events fired: workers on `hired` or worker gathers, lasso on `captured`, and so on |
| `progress`, `threat` | Per-second samples of goal progress and a 0..1 threat signal (fuel shortfall, lifeline drain, queue, hostiles) for the rater's fun proxies |
| `warningLead` | Seconds of failing-meter warning before a loss |

## Adding a behaviour for a new module

1. **Planner.** If the module adds pads, decide which stage they belong to and add a rule keyed on
   content data (role behaviour, `build` id, cost resource), never on a level id. Use
   `when: "<condition>"` for pads that only matter after something happens, and handle the
   condition in `Brain.whenHolds`.
2. **Task.** Add a `TaskKind`. Score it in `Brain.score` against the existing scale: emergencies
   90+, threats 80+, purchases 70, acquisition 40 to 60, maintenance 20 to 50. Resolve its target
   in `Brain.resolve` and return `null` once the task is done.
3. **Progress and modules.** If the module has its own progress events, add them to
   `PROGRESS_EVENTS` in `play.ts`. Map its events to the module id in `noteModule` so the rater's
   idle-module filter sees it.
4. **Tests.** Add a scripted case or a crafted manifest to `test/bots.test.ts`. The good bot must
   win the module's golden or test level with at least 20% margin.

## Redesign round 2 (families, rings, stars)

**Planner goal stage** covers every objective kind used as a main goal: build, population, house all and
house N rescued (housing until the slots fit), build N of a structure, core level N, clear N zones,
unlock N sources, hire N (of a role; repeatable pads repeat), converter level N, produce / converters
running / chain (the converters with operators, feeders, servers, and any converter making their
inputs), haul / stockpile (depot, depot suppliers, haulers), turret level (towers, then the dearest
upgrade as the goal pad). Lasso goals add the clearing pad of any zone hiding captives. On defend goals
the towers are the goal path. The med bay is planned before upgrades (it waits for the first injury).
Barrier sections are ordered attack-facing first (from the waves' sides).

**Policies** (`plan.policies`, from the goal and the star objectives):

| Policy | From | Effect |
|--------|------|--------|
| `heatFloor` | heat challenges (0.5), heat hold (pct + 12%), any defend level (0.35) | Feed and fetch fuel early to stay above it |
| `fillCore` | fuel_full | Keep topping the core up |
| `serveFirst` | no angry customers, streak | Serve (79 when someone is half out of patience) and stock wanted goods before other work |
| `holdShelf` | shelves_full | Stock from the far side of the shelf, out of the clerk pad's reach; no cashier until after the goal |
| `noOverload` | no_stockpile_overload | Stop stocking at the shelf cap; fetch converter output before it caps |
| `handsOff` | automate | Once every plan step is done and the economy runs itself, deposit nothing (fuel emergencies aside) |
| `collect` | salvage goals | Pick up salvage drops even when nothing needs them |
| `hunt` | hunt, protein | Hunt for its own sake |
| `towWant` | tow-trip goals and objectives | Chain captives within 420 units until the tow holds N |
| `rescueAll` | rescue_before_freeze | Raise the lasso's priority |

**Controller additions.** Capped needs include unbuilt salvage-priced barrier sections. Captives are
picked by freeze timer (most urgent that can still be reached in time), crates are always worth towing,
and a towing bot never stands still outside the heat (the slack rule). Hostiles still walking in from
outside a closed ring are met just inside the ring on their line to the core. Converter outputs that
feed another wanted converter (refined material for the alloy works) are fetched and deposited.
Sales count as progress on sales goals, conversions on production goals, depot deposits always, an
active hazard always, and every wave still to come on any defend level; the main objective's progress
rising is progress on any goal.

**Results.** `BotResult` adds `stars` (sim `starsOf`), `objectives` (kind, done per objective),
`runStats` (heat and HP minimum, fuel outs, freezes, angry customers, injuries, walls lost, overload,
best trips, pods lost and left, rescued, streak, hires, mean heat, admitted, kills, salvage) and `used`
(pads bought, lines built on or hit, node types gathered, converters producing, captures home, prey
killed, sales, admissions, hazards) for the generator's objective sizing and idle-element rule.
Margins: goals that end on the clock use health and integrity (with waves) or mean heat (without).

**Guide arrows.** `brain.suggest(state, compiled)` returns `{ kind, target, key }` for the current task
(or, while idle, the best-scored one) without advancing the controller; kinds are gather, feed, stock,
register, pile, pay, tow, gate, barrier, operate, deposit, fetch, drop, admit, fight, hunt. When the
target lies on the other side of a closed ring from the player, the step is `gate` and points at the
nearest gate section ("leave through the airlock").
