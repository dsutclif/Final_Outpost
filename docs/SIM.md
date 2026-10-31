# Simulation reference

`packages/sim` is the one deterministic, headless simulation behind the game, the bots, the rater
and both renderers. This file is the working reference for anyone coding against it: the system
order, the state fields, the events, and the recipe for adding a module. The rules themselves are
in `docs/SPEC.md` (structure) and `docs/prototype/frost-camp-demo.html` (numbers).

Engine `0.5.0`, content `0.5.0`. Every catalog module in `packages/content/data/modules.json` runs.
Redesign round 2 (`docs/REDESIGN-R2.md`) is summarised in "Redesign round 2 (0.5.0)" below.

## Numbers

Space is fixed point (`FP = 1000` milli-units per world unit), time is ticks (`TPS = 30`), meters
are parts per million (`METER_MAX`). Ratios (hazard multiplier, speed penalty, fill targets) are
integers out of `FP`. `compile.ts` is the only place that reads a decimal; after it, every rule
uses `mulDiv`, `isqrt`, `within` and integer compares. Randomness comes from `state.rng`
(`mulberry32`) only. A test walks the whole state after long runs and fails on any non-integer.

## System order

`createSim(...).step(input)` runs these in a fixed order every tick. Add a system deliberately and
document it here; the order is part of the determinism contract.

| # | System (file) | What it does |
|---|---------------|--------------|
| 1 | `movePlayer` (player.ts) | Input direction × speed (less the lasso penalty per towed object), blocked by uncleared zones and built wall sections, pushed out of the core's exclusion radius. |
| 2 | `stepHazard` (hazard.ts) | Event phases none → warning → active → none from the manifest's `events`. |
| 3 | `stepCore` (core.ts) | Burns fuel on the burn interval (× hazard multiplier while active). |
| 3a | `stepFreeze` (freeze.ts) | Lifeline recovers and frost thaws while fuel lasts; with the core empty the reactor-out countdown runs and residents freeze one at a time. |
| 4 | `stepNodes` (nodes.ts) | Finite nodes regrow. |
| 5 | `stepBarrierBuild` (barriers.ts) | Player near an unbuilt section with the line's resource pays one unit per build interval; a paid-up section becomes solid. Nothing is repaired and a broken gate is never rebuilt (Batch 3). |
| 6 | `playerAct` (player.ts) | Proximity actions in prototype priority: pads → core → sales shelf → converters (deposit input, pick up output) → gather. |
| 7 | `playerCombat` (player.ts) | Auto-attack the nearest prey or hostile in range. |
| 8 | `pickDrops`, `collectPile` (player.ts) | Walk-over pickup of drops (if the backpack has room) and the register's currency pile. |
| 9 | `stepLasso` (lasso.ts) | Pod freeze timers, trail recording and loop capture while engaged (outside the lines, containers left), tow chain, release start (recruits) or payout (crates) inside the safe radius, slack drop, trip bookkeeping. |
| 10 | `stepHousing` (housing.ts) | Waiting residents walk to the waiting area and move in when a slot frees; releasing containers free a recruit. |
| 11 | `stepGate` (housing.ts) | Gate arrivals spawn on the timer, queue, and are admitted when the player stands by the gate. |
| 12 | `stepResidents` (residents.ts) | Every resident's state machine: injured → medical, healing, idle ring, and each role behaviour. Downed guards (guards.ts) lie where they fell while a medic is on hand, else walk to a built med bay; medics heal them in place. |
| 13 | `stepSales` (sales.ts) | Customers spawn (producible goods only, and no drop-only good while its shelf is empty; fast refill while the line is short), queue, give up, are served at their slot while the clerk pad is staffed by the player or a cashier. |
| 14 | `stepConverters` (converters.ts) | Convert one input per rate while operated. |
| 15 | `stepHunting` (hunting.ts) | Prey roam inside their zone and respawn. |
| 16 | `stepDefense` (defense.ts) | Wave schedule, hostile spawn down a narrow lane in line with each side's attack gate (`defense.laneHalfWidth`), walk to the nearest opening on that side or else the gate; walls block and never take damage, the gate is hit until it breaks (Batch 3); base attacks and injuries, hostile contact with the player (tow drop), ranged defenses, wave cleared. Hostiles in `defense.troopContact` of a guard hit it (R5 #26, guards.ts): guards have `hp` (role data); at `guards.downPct` they go down (`guard_down`, not an injury), and a downed guard hit again, or any guard at the line on a level with no med bay or medic, dies (`guard_died`, removed). Sortie guards and drones move on a leash (R5 #23): no step further past the wall than the farthest spot a turret can be built (every turret pad site or placed turret, built or not, fixed from the first tick); without walls or turret spaces there is no line. Guards, drones and the medic never leave the player's walk box. |
| 17 | `refreshPads` (pads.ts) | Recomputes `visible` and `locked` on every pad for renderers and bots. |
| 18 | `stepStats` (stats.ts) | Counters from this tick's events and state. |
| 18a | `stepObjectives` (objectives.ts) | Evaluates every star objective (main goal first) from state and stats. |
| 19 | `checkEnd` (goals.ts) | Fail meters, timer, then the main goal (objective 0); on any end, objectives settle. |

Prototype order was: movement, fire, regrowth, player actions, lasso, waiting → moved in, gate,
people, shop, converters, deer, war, goals. The sim keeps that order and inserts hazard before
the core burn (so the multiplier applies the same tick the event starts) and stats and pad
refresh before the end check.

## State reference

Plain data only: no classes, functions or object references; ids and indices cross-reference.
Positions are `Vec {x, y}` in fixed point. Field names follow Contract 1 in `docs/PLAN.md`.

| Field | Type | Notes |
|-------|------|-------|
| `tick` | int | Ticks since start. |
| `rng` | `{state}` | mulberry32 state. |
| `currency` | int | Coins in hand (never in the backpack). |
| `params` | `Record<string, int>` | Runtime overlay that upgrades change: `barrier.hpMax`, `barrier.gateHpMax`. |
| `player` | `{pos, face, stack[], actCd, atkCd, buildCd, tow[], moving, padId, padDwell, hitCd}` | `stack` is carried items in pickup order; `tow` is capture ids in chain order. `padId` is the pad the player stands on (first visible, unfinished pad in range) and `padDwell` the ticks spent on it, capped at `compiled.pads.dwellTicks`; renderers draw the wind-up ring as `padDwell / dwellTicks`. |
| `core` | `{pos, fuel, level, burnAcc, lifeline}` | `burnAcc` counts FP per tick so the hazard ratio is exact. |
| `freeze` | `{active, ticksLeft, ticksTotal, lossAt}` | Reactor-out countdown. `ticksTotal` = `core.grace` in ticks. `active` while the core is empty; then `lifeline` = ticksLeft / ticksTotal (× METER_MAX) and the level fails when it reaches 0. While fuelled, `ticksLeft` mirrors the recovering lifeline. `lossAt` is internal: the ticksLeft value at which the current victim freezes (-1 = none). |
| `nodes[]` | `{id, type, pos, stock, regrowAcc, enabled}` | `stock` null = infinite; disabled nodes wait for a `node.enable` pad. |
| `sales` | `{pos, register, pile, pileN, shelf, sells[], queue[], leaving[], spawnAcc, premiumServed, nextCustomerId, queueAt, queueStep, edgeX}` or null | One shelf count per sellable type. `register` is the clerk pad (no separate register object); `queueAt` is slot 0 and slot k = queueAt + k × queueStep; customers arrive from and leave to x = `edgeX`. Customers are `{id, kind, res, want, patience, patienceMax, pos, angry}`. |
| `residents[]` | `{id, pos, role, status, carry, n, mode, target, assign, acc, timer, slot, frost, origin}` | `role` is `"idle"` or a role id; `status` ∈ ok, injured, healing, frozen, towed, releasing, waiting, arriving, dead; `assign` = `{from, to, node, post}`. `frost` is per mille (0..1000, 1000 = frozen to death); `dead` residents stay in the list (ids are stable) but leave the population and never act. `origin` ∈ start, rescue, gate. |
| `pads[]` | `{id, type, pos, done, paid, visible, locked}` | `paid` is per resource; `locked` = core level too low or (hire) nobody idle. |
| `built[]` | string[] | Ids of completed build pads (goal `build` reads it). |
| `structures[]` | `{id, type, pos, level, hp?, hpMax?, acc}` | Id = the pad that built it. Ranged defenses use `level` for their tier. |
| `barriers[]` | `{id, a, b, res, costPerSection, sections[], closed}` | Section: `{a, b, built, hp, hpMax, gate, paid}`. Gates pass walkers, block hostiles. Only gates take damage; a broken gate keeps `broken` and is never rebuilt. `closed` lines are rings. |
| `zones[]` | `{id, type, rect, cleared}` | `zone.blocked` blocks until cleared; `zone.waiting` places the waiting area. |
| `preyZones[]` | `{id, rect, animal}` | Roam areas; `prey[].zone` indexes this. |
| `captures[]` | `{id, type, pos, state, timer, freezeTicks}` | `state` ∈ idle, towed, releasing. Removed once released, delivered (crates) or lost. `freezeTicks` counts down while idle or towed; 0 = no timer. |
| `prey[]` | `{id, pos, hp, alive, respawn, zone, vel, turn}` | |
| `hostiles[]` | `{id, type, pos, hp, hpMax, side, target, acc}` | `target` ∈ core (walking), barrier (hitting a section), base (hitting the core). `side` ∈ n, e, s, w (attack edge); `hpMax` for health bars. |
| `drops[]` | `{id, res, pos}` | Picked up by walking over them. |
| `converters[]` | `{id, type, pos, inQ[], out, acc, operatorPos, pickupPos, level}` | `level` 1.. (1 + content `upgradeRates.length`); the rate is `rateTicksByLevel[level-1]`. |
| `depot` | `{pos, stock}` or null | Set by a `struct.depot` structure. |
| `meters` | `{lifeline, baseHealth, baseHealthMax}` | `lifeline` mirrors `core.lifeline`. |
| `waves` | `{idx, pending[], active}` | `pending` = `{tick, type, side}` spawns still to come. |
| `hazard` | `{phase, until, idx}` | `phase` ∈ none, warning, active. |
| `lasso` | `{trail[], towing[], engaged, trip, slack}` | `towing` mirrors `player.tow`. `trip` = `{delivered, lost}` for the current tow trip (ends when the tow empties); `slack` = ticks stood still while towing outside the safe radius. |
| `objectives[]` | `{id, kind, progress, target, done, failed}` | Star objectives in manifest order (main goal first; one synthesised `main` from `goal` when the manifest lists none). `failed` = can no longer be achieved. At level end every entry settles to done or failed. |
| `gateQueue[]` | int[] | Resident ids queued at the arrivals gate. |
| `timers` | `{gateAcc, gateLeft}` | |
| `stats` | `{sold, built, rescued, injured, barriersLost, lifelineLowTicks, concurrentDemandTicks, idleTicks, rewardTicks[], ...}` | Cheap counters for bots, the rater and objectives. 0.5.0 adds `fuelOuts, froze, heatMin` (per mille of fuel cap), `customersSpawned, customersAngry, earned, soldUnits{res}, streak, streakMax, bulkServed, unlocked, hired, hiredBy{role}, converted, convertedBy{res}, tier2Made, hauled, kills, killsBy{player|resident|structure} (0.13.0), bossKills, preyKilled, protein, salvage, crates, podsLost, wavesCleared, admitted, zonesCleared, hazardsSurvived, tripBest, tripBestClean, lastPlayerDeposit, salesSinceDeposit`. |
| `lastHint`, `over`, `won`, `reason` | | Hint throttling and level end. |

Derived helpers exported from `@fo/sim`: `safeRadius(state, compiled)`, `population`,
`housingSlots`, `freeSlots`, `blockedAt`, `outsideLines`, `producible`, `dropOnly`, `pointInPoly`, and the
stats constants `REWARD_GAP_EDGES` (reward-gap histogram bucket edges, seconds) and `REWARD_RING`.
0.5.0 adds `salesLayout(compiled, stallPos, corePos)` (clerk pad, pile, queue slot 0 and step, edge
x; the generator should use it to keep pads clear), `FROST_MAX`, `OBJECTIVE_KINDS`, `starsOf(state)`,
`segCross` and `rateTicks(compiled, converter)`.

## Events

Events are the only channel to renderers. `by` is a resident id when a worker, not the player,
caused the event. Positions are fixed point.

| Event | Fields | When |
|-------|--------|------|
| `gathered` | res, node, at, by? | Item taken from a node. |
| `deposited` | res, to, at, by? | Item handed to `sink.core`, `sink.sales_point`, a `conv.*` type or `store.depot`. |
| `sold` | res, n, pay, premium, at, customer, kind | A customer was served; `customer` left the queue in the same tick. |
| `customer_arrived` | kind, res, want, customer | |
| `customer_left` | angry, at, customer | Patience ran out. |
| `collected` | res, n, at | Player picked up the register pile. |
| `core_fuel_out`, `core_fuel_restored` | | |
| `hint` | key | Throttled per key; text lives in skins. |
| `pad_paid` | pad, res, n | One unit paid; `n` is the running total for that resource. |
| `hired` | pad, resident, role | |
| `built` | pad, build, at | Build pad completed (structures, converters, upgrades, core level, unlocks). |
| `unlocked` | pad, target | A disabled node was enabled. |
| `core_upgraded` | level | |
| `zone_cleared` | zone | |
| `captured` | capture, at | Lasso loop closed on a container. |
| `released` | capture, resident, at | Container opened; the recruit is `ok` or `waiting`. |
| `recruit_arrived` | resident, at | Admitted from the gate queue. |
| `moved_in` | resident | A waiting (or just released/admitted) recruit took a slot. |
| `pod_lost` | capture, at | A capture's freeze timer ran out (idle or towed); it is removed. |
| `tow_dropped` | capture, at, reason | A towed capture went back to idle in place; `reason` ∈ hit, slack. |
| `crate_delivered` | capture, at, bundle | A supply crate entered the safe radius and paid its bundle. |
| `froze` | resident, at | A resident froze to death during the reactor-out countdown. |
| `objective` | id, kind, done, failed | An objective became done or failed (also when objectives settle at level end). |
| `boss_spawned` | id, kind, at | A hostile whose content `boss` flag is set spawned. |
| `converter_upgraded` | conv, level | A `conv.level` pad raised a converter. |
| `hit` | target, id, at, by | `target` ∈ hostile, prey, base, barrier, player; `by` ∈ player, resident, structure, hostile. |
| `died` | kind, id, at, by? | Hostile or prey killed; for hostiles `by` says who landed the last hit (player, resident, structure). |
| `drop` | res, at | Loot landed (already relocated inside the barrier if it fell beyond it). |
| `picked` | res, at, by? | Drop or converter output picked up. |
| `wave_started` | idx | 1-based wave number. |
| `wave_cleared` | idx | No hostiles or pending spawns left after a wave. |
| `barrier_progress` | line, section, paid, cost | One unit paid toward a section. |
| `barrier_built`, `barrier_broken` | line, section | |
| `injured`, `healed` | resident | |
| `hazard_warning` | start | |
| `hazard_start` | end | |
| `hazard_end` | | |
| `converted` | conv, res | One output produced. |
| `level_end` | won, reason | `reason` is the fail meter, `timer` or `goal`. |

Hint keys: `carry_max`, `core_full`, `stand_at_register`, `not_enough_currency`, `need_resource`,
`needs_core_level`, `no_idle_resident`, `input_full`, `operate_converter`, `wave_incoming`,
`barrier_broken`, `hazard_warning`.

`ACTION_EVENTS` and `REWARD_EVENTS` (events.ts) name which events count as the player acting
(idle-time stat) and as rewards (`stats.rewardTicks`). `crate_delivered` is a reward.

## Content registries

`packages/content/data`: `resources`, `nodes` (gatherables, with a `workerRate`), `animals`
(`node.prey`), `sinks`, `converters`, `roles`, `customers`, `enemies` (`hostile.*`), `lassoables`
(`capture.*`), `structures` (`struct.*`), `upgrades` (`struct.*.t2`, `struct.ranged_defense.t3`, `struct.barrier.reinforced`),
`events` (`event.hazard`), `consumers` (routing priorities), `goals`, `objectives`, `modules`, `defaults`.
`objectives` is the registry of every objective kind (`{description, families, main, guard, params}`);
`goals` stays the generator's goal-type catalog. Structures, upgrades and roles may carry a default
`cost` the generator uses for pads (manifest pads still state their own cost).

Structure, upgrade and event effects are data operations: `{op: set|add|multiply, scope:
params|target|barriers, param|field, value, gate?}`. `params` edits `state.params`, `target` a
field of the targeted structure, `barriers` a field of every section (optionally gates or walls
only). `value` may name a content param. `applyEffects` in pads.ts interprets them.

## Manifest additions (0.2.0)

Entities: `barrier.line {id, res, costPerSection, sections: [{a, b, gate?, prebuilt?}]}`,
`zone.blocked | zone.waiting {id, rect}`, `zone.prey {id, rect, animal, n}`, `capture.* {at}`,
`struct.* {at, id?, arrivals?}` (pre-placed; `struct.gate` with `arrivals {every, total}` is the
arrivals gate), `conv.* {at, id?}` (pre-placed). Pads: `pad.build.build` accepts `struct.*`
(structure or upgrade), `conv.*`, `node.enable`, `sink.core.level`, `zone.clear`; `target` names
the entity the build acts on. Role bindings (`pad.hire.role`, `people[]`) take `from` (node,
animal, converter type or `store.depot`) and `to` (sink, converter type or `store.depot`).
Top level: `waves: [{t, counts: {hostile.*: n}}]`, `events: [{type, warnAt, start, end}]`.
`checkManifest` cross-checks every reference and the module/entity pairings (defense needs waves
and a line, hunting a prey zone, lasso a lassoable, every line a gate, contiguous sections, upgrade
targets of the right type, depot bindings only when a depot exists).

## Redesign round 2 (0.5.0)

### Phantom sales (B2)
A customer counted as "at their slot" when only the y distance was within 6 units. Customers spawn
beyond the map edge at the y of their slot, so the first customer was servable the tick it spawned,
off screen: sales fired with nobody visibly queued. Serving now needs the customer within 6 units
of the slot on both axes. Every `sold` names its `customer`, who leaves the queue for `leaving` that
tick; `test/redesign-r2.test.ts` checks this on every golden level under random play, plus
`queue.length = customersSpawned − sold − customersAngry` (also a property invariant).

### Clerk pad and queue
Content offsets in `sink.sales_point` are oriented per axis toward a reference: `registerOffset`
(the clerk pad, default `[0, 54]`) and `pileOffset` (`[-62, 54]`) toward the core, `queueOffset`
(`[76, 0]`) toward the map centre, `queueStep` (`[0, -34]`) toward the core (negative: the line grows
away from it). So the clerk stands beside the kiosk on the core side, the pile sits beside the clerk
away from the line, and the line forms on the interior side and never off the map edge. Customers
come from and leave to the map edge on the stall's side (`edgeX`). `salesLayout` computes all of it.

### Always-stocked queue
`queueMax` 4. While fewer than `customers.refillBelow` (3) wait, the spawn timer is clamped to
`customers.refillSpawn` (1 s); `customers.initialDelay` is 0.5 s.

### Fuel scrap
`node.fuel_scrap`: yields `res.material_basic` (1 fuel), stock 2, regrow 4 s, range 26. Small and
cheap so the generator can place dense fuel forests; workers bind to it by type like any node.

### Reactor-out freeze
See `freeze` above and `freeze.ts`. When fuel hits 0 the countdown starts from the current lifeline
(full lifeline = all of `core.grace`). Residents in the base (ok, injured, healing) freeze one at a
time: the victim is the coldest (farthest from the core among equals); when picked, its loss is
scheduled an equal share of the remaining countdown ahead (`lossAt = floor(ticksLeft × (n−1)/n)`),
and its frost rises with floor pacing to reach 1000 exactly then. Others' frost rises at
`freeze.othersRate` (0.5) of the victim's rate, capped at `freeze.othersCap` (0.8). With n residents
the losses fall at about k × grace / n, the last as the countdown ends. Refuelling stops losses at
once; frost thaws to 0 over `freeze.frostDecay` (4 s) and the lifeline recovers as before.
`meter.lifeline` fails when the lifeline reaches 0, or once someone has frozen and nobody alive is
left in the base.

### Perimeter walls and attack sides
- A `barrier.line` may be given as `points` (+ `closed`, `gates`: section indices, `prebuilt`:
  section indices) instead of `sections`; the schema normalises it to sections (the closing section
  joins the last point to the first). `checkManifest` requires a closed line to form a ring of 3+
  sections. `costPerSection` defaults to `barrier.costPerSection` (2).
- `outsideLines`: outside a closed line means not inside its polygon (`pointInPoly`); open lines keep
  the chord rule. The lasso engages on either.
- Waves take `side: n|e|s|w` or a list (spawn k from `sides[k mod len]`, default `n`) and an optional
  `gap` (seconds between spawns). Hostiles spawn `-defense.spawnY` beyond that edge, inside
  `defense.spawnMarginX` of its ends.
- Each tick a hostile looks one step plus `defense.barrierStop` ahead along its walk direction; the
  first built section (gates included) that segment crosses (`segCross`, exact cross products,
  endpoints included) stops it and takes its hits. Walkers are still blocked by built non-gate
  sections only. Old behaviour kept for open lines: before passing one (outside it or within
  `defense.steerBand`) hostiles drift only 2% sideways toward the core along their attack side;
  around rings they walk straight at the core.
- Loot that falls outside a line (or within `defense.dropRelocateBand` of one) lands
  `defense.dropRelocateOffset` inside, past where the way to the core crosses the line.
- Guard posts are offset along their section's normal toward the core side.

### Defense economy
`hostile.swarmling` (hp 1, speed 62, drops 1 salvage) and `hostile.boss` (hp 36, speed 20, drops 10
salvage, `damage` 4: its base and barrier hits count four times, `boss` flag → `boss_spawned`).
`res.salvage` backpack cap is 12. Default salvage costs: ranged defense 8, its tier-2 upgrade 6,
reinforcement 6, defender 4, medical 6, barracks 5. A hostile within `defense.playerHitRange` (18)
hits the player every `defense.playerHitInterval` (1 s): no damage, but a tow drop (below).
`meter.base_health` keeps its id; "Colony HP" is skin text.

### Objectives (stars)
Manifest `family` (shelter | rescue | harvest | industrialize | defend) and `objectives: [{id, kind,
params, label?}]`: exactly three, the first mirrors `goal` (same kind, same params). `goal` accepts
the old five types plus every main kind below (`FAMILY_GOAL_TYPES`). Params are validated against
`objectives.json` (`int` positive integer, `seconds` > 0, `pct` 0..100, `res`/`role`/`struct` content
ids, `pad` a build pad id; `?` = optional). A `hazard_survive` main goal needs a scheduled event,
`waves_survived` / `kills` / `boss` / `perimeter_before_wave1` need waves (`boss` a boss in one).
Win = objective 0 done. Stars = objectives done at the
end (`starsOf`). Guards fail on the first breach and are done at level end if never breached; at
level end anything else not done is failed.

| Kind | Params | Progress / target, done, failed |
|------|--------|---------------------------------|
| population | n | residents in base / n |
| core_level | n | core level / n |
| build_count | build, n | structures of that type / n |
| hazard_survive | n? | hazards ended / n (default: all scheduled) |
| heat_hold | pct, seconds | consecutive ticks with fuel ≥ pct% of cap / T |
| fuel_full | seconds | fuel / cap; done if full by T, failed after T |
| admit | n | gate admissions / n |
| clear_zones | n | zones cleared / n |
| house_all | | housed arrivals+rescues / that + pending (waiting, arriving, gate left, recruit pods); done when nothing is pending |
| survive | seconds | tick / T (survive until dawn) |
| rescue | n | released recruits / n |
| rescue_all | | rescued / rescued + recruit pods left; failed if any pod is lost |
| tow_trip | n | best lassoables delivered in one trip / n |
| rescue_before_freeze | n | rescued / n; failed when rescued + pods left < n |
| hunt | n | prey killed / n |
| protein | n | animal-drop goods deposited (any sink, converter, depot) / n |
| rescue_housed | n | rescued residents in base / n |
| tow_full_trip | n? | best trip that lost nothing / n (default lasso.maxTowed) |
| crates | n | crates delivered / n |
| currency | n | currency held / n |
| sell | res, n | units of res sold / n |
| earn | n | credits paid at the register / n |
| serve_premium | n | premium customers served / n |
| unlock | n | sources unlocked / n |
| shelves_full | | sellables at shelf cap / sellables |
| streak | n | best run of sales without an angry customer / n |
| sell_each | n, k | goods with ≥ n units sold / k |
| hire | n, role? | hires (of role) / n |
| earn_within | n, seconds | earned / n; failed after T |
| bulk_order | n? | bulk customers served / n (default 1) |
| produce | n, res? | converter outputs (of res) / n |
| converters_running | k, seconds | consecutive ticks with ≥ k converters running / T |
| haul | n | hauler deliveries / n |
| chain | n? | tier-2 outputs / n (default 1) |
| automate | seconds | ticks since the last player deposit, once a sale happened since / T |
| stockpile | res, n | depot stock of res / n |
| build | target | target pad built |
| converter_level | n | highest converter level / n |
| waves | | waves cleared / waves; done when all spawned and cleared |
| waves_survived | n | waves cleared / n |
| kills | n | hostiles killed / n |
| boss | n? | bosses killed / n (default 1) |
| turret_level | n | highest ranged-defense tier / n |
| salvage | n | salvage picked up / n |
| perimeter_before_wave1 | | built sections / sections; failed if wave 1 starts first |
| time_target | seconds | tick / T; done if the main goal is done by T, failed after T (not a main kind) |
| settlement_never_freezes | | guard: fuel never hits 0 |
| no_colonist_freezes | | guard: nobody freezes |
| heat_floor | pct | guard: fuel never below pct% of cap |
| no_angry_customers | | guard |
| no_injuries | | guard |
| hp_floor | pct | guard: base health never below pct% of max |
| no_wall_lost | | guard |
| no_stockpile_overload | | guard: no converter output or shelf at its cap |

Golden levels: L1 shelter (build, time 120 s, heat ≥ 25%), L2 rescue (population 10, time 100 s, tow
2 in one trip), L3 harvest (build, time 180 s, 3 VIPs), L4 defend (waves, Colony HP ≥ 60%, no
injuries).

### Starred features
- **Pod freeze:** lassoable `freezeTime` (content, default 0) or a capture entity's `freeze` seconds
  set `freezeTicks`; at 0 while idle or towed the capture is removed (`pod_lost`).
- **Tow loss**, precisely: (1) a hostile hit on the player (contact, above) drops the rearmost towed
  captive; (2) standing still (no input) for `lasso.slackTime` (2.5 s) while towing outside the safe
  radius lets the line go slack and drops every captive. Dropped captives go back to `idle` where
  they are (lassoable again) and count as lost for the trip. (Hostiles cannot meet a tow in a valid
  level today: `lasso` still excludes `defense`; `hunting` is no longer excluded.)
- **Supply crate:** `capture.supply_crate` (result `bundle`): lassoed and towed like a pod; when it
  enters the safe radius it pays its bundle at once (currency to hand, goods as drops) and is removed.
- **Bulk order:** `unit.customer_bulk` (order size `fixed`: exactly 6, patience 120 s); drawn when
  neither premium nor impatient, with probability `customers.bulkShare` (default 0; the roll only
  happens when the share is above 0).
- **Tier-2 converter:** `conv.alloy_works` turns `res.material_refined` into `res.component` (price 9).
  A converter's `tier` is 1 + the highest tier of the converters making its inputs; outputs of tier 2+
  count in `stats.tier2Made`.
- **Converter levels:** `pad.build` with `build: "conv.level"` and `target` = a converter (entity or the
  pad that builds it) raises its `level`; content `upgradeRates` give the seconds per output at levels
  2, 3, ... A repeatable level pad retires at the top level.

## Behaviour notes and deviations from the prototype

- **Pad dwell (0.3.0, DECISIONS 9c).** Payment starts only after the player has stayed within one
  pad's radius for `pads.dwell` seconds (default 0.5 since 0.4.0, previously 0.35; compiled to `pads.dwellTicks` = 15; 0 restores
  instant payment). Leaving the radius resets the counter. Walking straight off a start position
  that overlaps a pad (golden level 2 starts inside the core-upgrade pad's radius) no longer pays.
  Note: a walk through the exact centre of a 30-unit pad lasts about 11.6 ticks, so the 15-tick
  dwell (DECISIONS 9g) means no straight crossing ever pays; the old 11-tick dwell let
  near-diametric ones pay a unit.
- **Drop-only demand (0.3.0, DECISIONS 9d).** A good whose only producible source is prey or
  hostile drops (`dropOnly`) is not ordered while its shelf count is zero.
- **Idle-converter demand (0.4.0, DECISIONS 9f).** A good whose only source is a converter is not
  ordered while its shelf count is zero and every converter making it holds no output and has
  nothing queued (`converterIdle`).
- **Time budget (0.3.0, DECISIONS 9b).** `level.budgetSeconds` (default 300) is compiled to
  `compiled.level` for the bots and rater. The sim never fails on it.

- Walls are built by walking the line with the resource (spec), not by paying wall pads
  (prototype). Golden level 4 uses `res.currency` at 8 per section so the economy matches. A
  builder standing inside a freshly built wall's band is pushed out of it.
- Every line has a gate section. Level 4's middle section is the gate (hp 20, passable); level 2
  has prebuilt fences north and south so the lasso can engage outside them.
- The tow line engages on "outside any line's chord, with containers left"; the prototype's
  200-unit proximity gate is dropped in favour of the spec rule.
- Residents are blocked by walls and blocked zones like the player (spec); the prototype only
  blocked the player. Golden levels never route a worker across a wall.
- Hostiles stop at the first built section their next step would cross, from any attack side
  (0.5.0; previously only horizontal sections facing the top edge stopped them).
- Worker gather rates per node come from `nodes.*.workerRate` (0.55 material, 0.8 food), so the
  prototype's lumberjack and fisher numbers both survive on one `role.supplier`.
- Reinforcement raises wall hpMax to 24 and gate hpMax by 10, adds 10 hp to built sections, and
  later builds read the raised params.
- Hazard burn: the accumulator adds `hazard.burnMultiplier` (FP) per tick against
  `burnTicks × FP`, which reproduces the prototype's `2.4 / 2.6` interval exactly.

## Story mechanics (DECISIONS 14)

Data options on existing modules, used by the story levels (`levels/story`) and open to any level.
New state is optional and only set when a level uses it, so other levels are unchanged.

| Option | Manifest | Rules | State / events | Stats (rater metric) |
|---|---|---|---|---|
| Dark core | `sink.core` `params.lit: false` | No burn (`stepCore`) and no reactor-out countdown (`stepFreeze`, lifeline held) until the first fuel; that deposit lights it instead of `core_fuel_restored`. A dark start is not a fuel-out, nor counted in `heatMin` or the low-core demand. | `core.dormant`; `core_lit {at}` | `litTick` (rater `story.litSeconds`) |
| Crew pod | `capture.*` `joins: {role, from?, to?, node?}` (recruit lassoables) | On release the recruit takes that job at once, as if hired (no pad, no cost; guards get a post) and never waits for a hab pod. Counts as a rescue, not a hire. | `captures[].joins`; `joined {capture, resident, role}` | `joined` |
| Decoy pod | `capture.*` `decoy: true` (recruit lassoables; not with `joins`) | Towed like a pod; opens empty: no resident, no `released`. Not a rescue and not a pod left for `rescue_all`, `rescue_before_freeze` or `house_all`. Bots never make a trip for one. | `captures[].decoy`; `decoy_opened {capture, at}` | `decoysOpened` |
| Retreating boss | wave `bossRetreat: 1..99` (needs a boss in that wave) | Boss-flag hostiles of the wave break off at that percent of their hp: they leave `hostiles` at once (so nothing targets them and the wave can clear), drop their loot, and walk straight off their attack edge in `fleeing`. They count as kills and boss kills. | `hostiles[].retreatHp`, `fleeing[]`, `waves.pending[].retreatPct`; `retreated {kind, id, at}` | `retreats` |
| Night | top-level `lighting: "night"` | Renderer only: dark blue sky and fog, dim cool moon, brighter core glow. | | |
| Guide | top-level `guide: "always"` | Client only: the guide arrow shows from the first tick. | | |

`stepFleeing` runs inside `stepDefense`, after the hostile loop.

## Adding a module

1. Content: add the registry entries and any new param defaults in `packages/content/data`, a
   schema in `schema.ts`, and cross-ref checks in `checkContentRefs` / `checkManifest`.
2. Manifest: add an entity type or top-level field in `manifest.ts` if the level needs to place
   something; reference by id, never by index.
3. Compile: convert every decimal once in `compile.ts` (`fp`, `ticks`, `perTick`, `ratio`).
4. State: add plain-data fields in `state.ts` with the Contract 1 names; initialise in `sim.ts`.
5. System: one file under `systems/`, reading only `Compiled` and `State`; insert it into the
   order above and in this table. Use `state.rng` for randomness and `mulDiv` for every ratio.
6. Events: add to `events.ts`; mark action/reward events.
7. Tests: a scripted play-through in `test/modules.test.ts`, invariants in
   `test/properties.test.ts`, and a golden manifest if a new prototype level depends on it.
8. Add the module id to `IMPLEMENTED_MODULES` only when all of its rules run; bump
   `ENGINE_VERSION` / `CONTENT_VERSION` and re-pin `levels/golden/*.json`.
