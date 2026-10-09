# Simulation reference

`packages/sim` is the one deterministic, headless simulation behind the game, the bots, the rater
and both renderers. This file is the working reference for anyone coding against it: the system
order, the state fields, the events, and the recipe for adding a module. The rules themselves are
in `docs/SPEC.md` (structure) and `docs/prototype/frost-camp-demo.html` (numbers).

Engine `0.2.0`, content `0.2.0`. Every catalog module in `packages/content/data/modules.json` runs.

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
| 3 | `stepCore` (core.ts) | Burns fuel on the burn interval (× hazard multiplier while active), recovers or drains the lifeline. |
| 4 | `stepNodes` (nodes.ts) | Finite nodes regrow. |
| 5 | `stepBarrierBuild` (barriers.ts) | Player near an unbuilt section with the line's resource pays one unit per build interval; a paid-up section becomes solid. |
| 6 | `playerAct` (player.ts) | Proximity actions in prototype priority: pads → core → sales shelf → converters (deposit input, pick up output) → gather. |
| 7 | `playerCombat` (player.ts) | Auto-attack the nearest prey or hostile in range. |
| 8 | `pickDrops`, `collectPile` (player.ts) | Walk-over pickup of drops (if the backpack has room) and the register's currency pile. |
| 9 | `stepLasso` (lasso.ts) | Trail recording and loop capture while engaged (outside the lines, containers left), tow chain, release start inside the safe radius. |
| 10 | `stepHousing` (housing.ts) | Waiting residents walk to the waiting area and move in when a slot frees; releasing containers free a recruit. |
| 11 | `stepGate` (housing.ts) | Gate arrivals spawn on the timer, queue, and are admitted when the player stands by the gate. |
| 12 | `stepResidents` (residents.ts) | Every resident's state machine: injured → medical, healing, idle ring, and each role behaviour. |
| 13 | `stepSales` (sales.ts) | Customers spawn (producible goods only), queue, give up, are served while the register is staffed by the player or a cashier. |
| 14 | `stepConverters` (converters.ts) | Convert one input per rate while operated. |
| 15 | `stepHunting` (hunting.ts) | Prey roam inside their zone and respawn. |
| 16 | `stepDefense` (defense.ts) | Wave schedule, hostile spawn, barrier stop and damage, base attacks and injuries, ranged defenses, wave cleared. |
| 17 | `refreshPads` (pads.ts) | Recomputes `visible` and `locked` on every pad for renderers and bots. |
| 18 | `stepStats` (stats.ts) | Counters from this tick's events and state. |
| 19 | `checkEnd` (goals.ts) | Fail meters, timer, then the goal predicate. |

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
| `player` | `{pos, face, stack[], actCd, atkCd, buildCd, tow[], moving}` | `stack` is carried items in pickup order; `tow` is capture ids in chain order. |
| `core` | `{pos, fuel, level, burnAcc, lifeline}` | `burnAcc` counts FP per tick so the hazard ratio is exact. |
| `nodes[]` | `{id, type, pos, stock, regrowAcc, enabled}` | `stock` null = infinite; disabled nodes wait for a `node.enable` pad. |
| `sales` | `{pos, register, pile, pileN, shelf, sells[], queue[], leaving[], spawnAcc, premiumServed}` or null | One shelf count per sellable type. |
| `residents[]` | `{id, pos, role, status, carry, n, mode, target, assign, acc, timer, slot}` | `role` is `"idle"` or a role id; `status` ∈ ok, injured, healing, frozen, towed, releasing, waiting, arriving; `assign` = `{from, to, node, post}`. |
| `pads[]` | `{id, type, pos, done, paid, visible, locked}` | `paid` is per resource; `locked` = core level too low or (hire) nobody idle. |
| `built[]` | string[] | Ids of completed build pads (goal `build` reads it). |
| `structures[]` | `{id, type, pos, level, hp?, hpMax?, acc}` | Id = the pad that built it. Ranged defenses use `level` for their tier. |
| `barriers[]` | `{id, a, b, res, costPerSection, sections[]}` | Section: `{a, b, built, hp, hpMax, gate, paid}`. Gates pass walkers, block hostiles. |
| `zones[]` | `{id, type, rect, cleared}` | `zone.blocked` blocks until cleared; `zone.waiting` places the waiting area. |
| `preyZones[]` | `{id, rect, animal}` | Roam areas; `prey[].zone` indexes this. |
| `captures[]` | `{id, type, pos, state, timer}` | `state` ∈ idle, towed, releasing. Removed once released. |
| `prey[]` | `{id, pos, hp, alive, respawn, zone, vel, turn}` | |
| `hostiles[]` | `{id, type, pos, hp, target, acc}` | `target` ∈ core (walking), barrier (hitting a section), base (hitting the core). |
| `drops[]` | `{id, res, pos}` | Picked up by walking over them. |
| `converters[]` | `{id, type, pos, inQ[], out, acc, operatorPos, pickupPos}` | |
| `depot` | `{pos, stock}` or null | Set by a `struct.depot` structure. |
| `meters` | `{lifeline, baseHealth, baseHealthMax}` | `lifeline` mirrors `core.lifeline`. |
| `waves` | `{idx, pending[], active}` | `pending` = `{tick, type}` spawns still to come. |
| `hazard` | `{phase, until, idx}` | `phase` ∈ none, warning, active. |
| `lasso` | `{trail[], towing[], engaged}` | `towing` mirrors `player.tow`. |
| `gateQueue[]` | int[] | Resident ids queued at the arrivals gate. |
| `timers` | `{gateAcc, gateLeft}` | |
| `stats` | `{sold, built, rescued, injured, barriersLost, lifelineLowTicks, concurrentDemandTicks, idleTicks, rewardTicks[]}` | Cheap counters for bots and the rater. |
| `lastHint`, `over`, `won`, `reason` | | Hint throttling and level end. |

Derived helpers exported from `@fo/sim`: `safeRadius(state, compiled)`, `population`,
`housingSlots`, `freeSlots`, `blockedAt`, `outsideLines`, `producible`, `pointInPoly`.

## Events

Events are the only channel to renderers. `by` is a resident id when a worker, not the player,
caused the event. Positions are fixed point.

| Event | Fields | When |
|-------|--------|------|
| `gathered` | res, node, at, by? | Item taken from a node. |
| `deposited` | res, to, at, by? | Item handed to `sink.core`, `sink.sales_point`, a `conv.*` type or `store.depot`. |
| `sold` | res, n, pay, premium, at | A customer was served. |
| `customer_arrived` | kind, res, want | |
| `customer_left` | angry, at | Patience ran out. |
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
| `hit` | target, id, at, by | `target` ∈ hostile, prey, base, barrier; `by` ∈ player, resident, structure, hostile. |
| `died` | kind, id, at | Hostile or prey killed. |
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
(idle-time stat) and as rewards (`stats.rewardTicks`).

## Content registries

`packages/content/data`: `resources`, `nodes` (gatherables, with a `workerRate`), `animals`
(`node.prey`), `sinks`, `converters`, `roles`, `customers`, `enemies` (`hostile.*`), `lassoables`
(`capture.*`), `structures` (`struct.*`), `upgrades` (`struct.*.t2`, `struct.barrier.reinforced`),
`events` (`event.hazard`), `consumers` (routing priorities), `goals`, `modules`, `defaults`.

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

## Behaviour notes and deviations from the prototype

- Walls are built by walking the line with the resource (spec), not by paying wall pads
  (prototype). Golden level 4 uses `res.currency` at 8 per section so the economy matches. A
  builder standing inside a freshly built wall's band is pushed out of it.
- Every line has a gate section. Level 4's middle section is the gate (hp 20, passable); level 2
  has prebuilt fences north and south so the lasso can engage outside them.
- The tow line engages on "outside any line's chord, with containers left"; the prototype's
  200-unit proximity gate is dropped in favour of the spec rule.
- Residents are blocked by walls and blocked zones like the player (spec); the prototype only
  blocked the player. Golden levels never route a worker across a wall.
- Hostiles stop at the nearest built section whose x-range covers them, walking toward +y; the
  attack edge is the top of the map (`defense.spawnY`). Vertical sections do not stop hostiles.
- Worker gather rates per node come from `nodes.*.workerRate` (0.55 material, 0.8 food), so the
  prototype's lumberjack and fisher numbers both survive on one `role.supplier`.
- Reinforcement raises wall hpMax to 24 and gate hpMax by 10, adds 10 hp to built sections, and
  later builds read the raised params.
- Hazard burn: the accumulator adds `hazard.burnMultiplier` (FP) per tick against
  `burnTicks × FP`, which reproduces the prototype's `2.4 / 2.6` interval exactly.

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
