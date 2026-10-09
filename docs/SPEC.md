Farthest Outpost: Game and Level Engine Spec
Oct 9, 2026 · @Douglas Sutcliffe
Overview
Farthest Outpost: Explore and Survive is a real-time survival game built from the mini-games in Whiteout Survival, Township and Kingshot ads, with every level generated, rated and sequenced by a parametric engine. The spec is skin-neutral: every mechanic is described by its function, and skins (Mars greenhouse, frozen camp, space station, underwater colony) supply the setting. The playable prototype (four levels) is the source of truth for the mechanics described here.
Core concepts
Base: the settlement the player runs in a level; a camp, station or colony depending on the skin.
Core and lifeline: the base's central station burns fuel to produce the lifeline, the one urgent survival resource (warmth, power, air). The lifeline protects everyone inside the core's safe radius; if it runs out, the base fails.
Residents and recruits: residents live in the base and can be assigned to jobs; stranded recruits outside it can be rescued to become residents.
Hazard events: timed events that raise fuel burn or shrink the safe radius (a blizzard, a dust storm, a hull breach).
Goals
An endless series of levels that introduce mechanics gradually and mix them in small groups.
Every shipped level is feasible, rated for difficulty, and placed in a deliberate progression.
One deterministic simulation drives the game, the generator, the rating bots and both renderers.
Ad-quality visual feel in the final version: low-poly 3D, juicy feedback, readable at a glance on a phone.
Non-goals for v1
No multiplayer, alliances, servers or live-ops events.
No persistent base between levels (each level is a self-contained base); a meta layer is a later decision.
No runtime LLM calls; models build the system, they do not run inside it.
Success criteria
Criterion
Target
Feasibility of shipped levels
100% beaten by the reference bot with at least 20% time or resource margin
Generation and rating time
Under 30 seconds per level, offline batch, including bot runs
Difficulty accuracy after calibration
Predicted vs observed first-attempt fail rate within ±10 points
Hardcoded level content
None: every level is a manifest produced by the generator or authored as data
Phase 1 build on device
60 fps on a mid-range phone, 2D renderer
Phase 2 build on device
30 to 60 fps on a mid-range phone, 3D-style renderer
Offline play
A home-screen install plays at least 20 cached levels in airplane mode, with progress kept
Core loop and controls
The player steers one character around the base; standing next to something performs its action automatically, and the core must never run out of fuel.
Controls
Drag anywhere for a floating virtual joystick; keyboard arrows on desktop.
No action buttons. Proximity triggers every interaction: gather, deposit, pick up, pay, operate, attack.
Walking a closed loop around lassoable objects captures them (see Lasso).
The loop
Gather raw resources (materials, fuel, food) into a backpack with a cap per resource type.
Feed the core; it burns fuel over time to keep the lifeline flowing.
Process resources in converters into higher-value goods.
Stock the sales point and staff the register so customers pay.
Spend currency and materials on build pads: workers, buildings, upgrades, defenses.
Rescue and admit recruits, house them, and buy workers and defenders at hire pads, each of which needs an available resident.
Hit the level goal before a failure condition: the lifeline runs out, attackers overrun the base, or time runs out.
Failure conditions (parametric per level)
The lifeline reaches zero after the core has been out of fuel for a grace period.
Base health reaches zero from attacks.
Optional day timer runs out before the goal.
Mechanics catalog
Each mechanic below is a module the generator can switch on or off per level; the prototype proved all of them playable, and the rules here are the ones that survived playtesting.
Module
Rules
Key parameters
Carry
Backpack holds several resource types at once; the cap applies per type (prototype: 6). Stations take only the types they use.
cap per type, cap upgrades
Gather nodes
Material sources (regrow), food sources, fuel deposits and roaming prey (food via hunting). Standing in range gathers at a rate.
yield per node, rate, regrow time, node count, placement
Core
Burns 1 fuel per interval; basic material adds 1, dense fuel adds 4. The safe radius scales with core level and shrinks when fuel is out or during a hazard event. The lifeline drains when fuel is zero.
burn interval, fuel cap per level, safe radius per level, grace period
Core levels
Upgrading the core unlocks gated pads: new resource sites, build sites, higher upgrade tiers, clearing blocked zones.
levels, cost per level, what each level unlocks
Sales point and register
One shelf per sellable type, capped per type (prototype: 8). Sales happen only while the register is staffed by the player or a cashier. The first customer in line whose order can be filled is served, so one missing good never blocks the queue.
shelf cap, price per good
Customers
Demand is random, weighted toward goods in stock (weight = base + stock count; base 1.5 in the prototype), and never asks for goods not yet producible. Impatient customers leave on a short timer; everyone leaves after a long one. Premium customers order more and pay double.
spawn interval, order size range, base weight, patience, impatient and premium shares
Converters
Every converter has an input stock, an output stock and an operator role, and only runs while operated (player on the operator spot, or a hired operator). Food processor: raw food to prepared food. Material processor: basic material to refined material.
inputs, output, rate, stock caps, operator role
Workers
Idle residents never take a job on their own. Buying a worker at a hire pad requires an available resident (idle and uninjured); on purchase, one walks to the pad and takes its role, so the player decides where every worker lands. A hire pad shows as locked while no resident is available. Gatherers fill to capacity, then deliver until empty, then return; they wait at a full sink instead of turning back. Roles: supplier (one resource to one bound consumer, such as basic material to the core or raw food to the sales point), server (prepared food to the sales point), cashier, operator, defender.
role set, speed, carry, work rates
Source gating
A further resource node of a type appears only once the previous one has a worker.
chain length per resource
Build pads
Stand on a pad to pay it in currency, refined material and salvage, in any order. Pads can require another pad, a core level, or an available resident, and can repeat (train defender).
cost vector, requirements, repeatable, effect
Lasso
The tow line engages as the player leaves through a gate while stranded recruits remain (they always sit outside the barriers); closing a loop captures every lassoable inside it. Captured objects are dragged in a chain (prototype: up to 3, 10% slower each). Recruit containers open inside the safe radius and free a recruit. Designed so other resources, valuables or crates can be lassoable later. Never shares a level with Hunting or Defense, so the tow line cannot trail during hunts or scoop up prey and enemy drops.
lassoable types, max towed, speed penalty, release rule per type
Housing
Recruits join from opened containers or the gate. Each needs a housing slot (housing buildings add slots); without one they wait in the waiting area and move in automatically when a slot frees up.
base slots, slots per housing, gate interval, gate total
Blocked zones
Solid areas removed by a pad, usually gated by core level, revealing new ground.
zone shapes, unlock cost, gate
Hunting
Prey roams a zone; the player and hunters auto-attack in range; kills drop items on the ground to pick up.
prey type, HP, drops, respawn, roam zone
Defense
Attackers arrive in waves from an edge. Barriers are built along level-defined barrier lines by walking along them while carrying the line's resource; every run has at least one gate. Ranged defenses are optional, separate pads. Barriers and gates block attackers and take damage; ranged defenses shoot in range; defenders hold posts; the player auto-attacks. Creatures drop raw food; raiders drop salvage. Destroyed sections revert to unbuilt line.
wave schedule and mix, HP, speed, barrier lines and gate positions, build resource and cost per section, prebuilt sections, barrier and gate HP, ranged defense pads, range and rate, defender stats
Salvage upgrades
Salvage from raiders buys defensive upgrades: ranged defense tier 2 (faster, longer range), reinforced barriers (more HP).
upgrade list and costs
Injury and medical
Attacks on the base injure a random resident, who stops working until healed at the medical station.
heal time, medical capacity
Hazard events
Timed events: a warning banner, then faster fuel burn and a smaller safe radius for a period.
event type, warning, start, duration, multipliers
Supply routing
When one resource feeds several consumers (basic material to the core and the material processor, raw food to the sales point and the food processor), supply is routed in two stages.
Dedicated suppliers (from the start): every consumer has its own supplier hire pad, and each supplier is bound to exactly one consumer: a supplier for the core and a supplier for the material processor are separate hires. Suppliers fill up, deliver to their consumer, and wait there if it is full. The player balances supply by how many suppliers each consumer gets.
Depot and haulers (later unlock): building the depot lets suppliers be switched to drop everything at the depot. Haulers carry goods from the depot to consumers, choosing the consumer with the highest need score: priority × how far its stock is below its target fill.
Fuel override (always on once haulers exist): any hauler carrying fuel goes to the core first when it is below its critical level, so automation can never let the lifeline run out.
In content data, each consumer has a priority, a target fill and a critical level (core: priority 10, critical below 30%), and each role's delivery target is either one fixed consumer or "depot". The depot is an ordinary sink and source pair in the registry, with no special code.
Barrier lines, gates and ranged defenses
Barriers are built along barrier lines defined by the level, independently of ranged defenses. Walking along an unbuilt section while carrying the line's build resource builds it, so any level, with or without ranged defenses, can include a barrier requirement or a barrier-building opportunity.
Sections: each line is split into sections, each costing a set amount of the line's build resource. The resource is a level parameter (currency, refined material, salvage or another resource), and a level may start with some sections already built.
Gates: every barrier run has at least one gate. Gates let the player, workers and recruits through and block attackers like a barrier, with higher HP.
Ranged defenses: optional, separate pads, usually on or just behind a line. They shoot in range but never create or require barriers.
Damage: a destroyed section reverts to unbuilt line and is rebuilt the same way, by walking along it with the resource.
Stranded recruits and the lasso. Stranded recruits are always placed outside the barrier lines. When a level includes the lasso, the tow line engages only as the player leaves through a gate, and only while unrescued recruits remain on the level; inside the barriers, or once everyone is rescued, no line trails. The generator enforces both rules as placement constraints.
Mechanics deliberately left out because they belong to other ad genres: pin pulling, runner gates, merge.
Data-driven architecture
The game has no level code: every resource, entity type, behavior parameter and level is data, read by one generic simulation. The prototype hardcodes four levels in a list; the product replaces that list with a content database plus generated manifests.
Two layers of data
Content definitions (authored once, versioned): what kinds of things exist and how they behave.
Level manifests (generated or authored): which of those things appear in a level, where, with which numbers, and what the goal is.
Content definitions
Registry
Defines
Example entry
Resources
id, carry cap, sell price, sprite and model keys
food_raw_1: { cap: 6, price: 2 }
Nodes
gatherable sources: yields, rates, regrow
material_source: { yields: material_basic, rate: 0.3, stock: 4, regrow: 6 }
Sinks
stations that consume a resource: core, sales point, build pads
core: { accepts: { material_basic: 1, fuel_dense: 4 }, produces: lifeline }
Converters
input set, output, rate, stock caps, operator role
food_processor: { inputs: [food_raw_1, food_raw_2], output: food_prepared, rate: 1.6, role: operator }
Roles
worker behavior template: gather source, deliver sink, capacity, speeds
supplier: { from: food_source, to: sales_point, carry: 3 }
Buildings and upgrades
cost vectors, requirements, effects as data operations
ranged_defense.t2: { cost: { salvage: 3 }, effect: { ranged_defense.rate: 0.55 } }
Lassoables
capture rule, tow weight, release condition, result
recruit_container: { release: inSafeRadius, result: recruit }
Enemies and animals
HP, speed, targets, damage, drops
raider_humanoid: { hp: 4, speed: 36, drops: { salvage: 2 } }
Customers
archetypes: patience, order size, pay multiplier
customer_premium: { size: +1, pay: 2 }
Events
effects over time on other parameters
hazard: { burn: x2.6, safeRadius: x0.75 }
Effects are expressed as a small set of data operations (set, add, multiply, unlock, spawn) on named parameters, so a new upgrade needs no code.
Canonical naming
Ids name what a thing does in the game, never how it looks; skins supply every player-facing name and model. Format: category.function.
Category
Ids
Example: frozen camp names
res
material_basic, fuel_dense, food_raw_1, food_raw_2, food_prepared, material_refined, salvage, currency
log, coal, fish, meat, meal, plank, scrap, coin
meter
lifeline, base_health
warmth, camp health
node
material_source, fuel_deposit, food_source, prey
tree, coal deposit, pond, deer
sink
core, sales_point, register
fire, counter, register
conv
food_processor, material_processor
grill, sawmill
store
depot
warehouse
struct
barrier, gate, ranged_defense, housing, medical
wall, gate, tower, tent, medic tent
pad, zone
pad.build, pad.hire, zone.blocked, zone.waiting
build pad, hire pad, snowdrift, waiting area
unit
player, recruit, customer, customer_premium
player, survivor, customer, VIP
role
supplier, server, cashier, operator, hauler, defender
lumberjack, fisher, hunter; server; cashier; cook, sawyer; hauler; fighter
hostile
raider_humanoid, creature
raider, wolf
capture
recruit_container
ice block
event
hazard
blizzard
Food and fuel stay as categories because they drive behavior: customers buy food, the core burns fuel.
meter.lifeline is the one urgent survival resource; each skin names it (warmth, power, oxygen, air).
Tiers and variants are suffixes (struct.ranged_defense.t2, struct.barrier.reinforced); parallel instances are numbered (food_raw_1, food_raw_2).
Roles are one id plus parameters, not one id per job: a lumberjack is role.supplier { from: node.material_source, to: sink.core }.
Prose in this spec uses generic names; skin names appear only in examples and the skin sections. Data, code and asset files use only canonical ids.
Level manifest
A level is a JSON manifest. The generator writes it; the client and the rating bots read it. Example (abridged):
{  "id": "s1-L014",  "seed": 918273,  "engineVersion": "2.0.0",  "contentVersion": "2.0.0",  "map": { "w": 480, "h": 900, "zones": ["base", "sources-w", "outer-n"] },  "modules": ["carry", "core", "sales", "workers", "lasso", "housing"],  "entities": [    { "type": "sink.core", "at": [240, 470], "params": { "fuel": 14 } },    { "type": "node.material_source", "at": [45, 330] },    { "type": "node.food_source", "at": [415, 360] },    { "type": "sink.sales_point", "at": [330, 640], "sells": ["res.food_raw_1"] },    { "type": "capture.recruit_container", "at": [90, 110] },    { "type": "pad.build", "build": "struct.housing", "at": [80, 610], "cost": { "res.currency": 10 } },    { "type": "pad.build", "build": "sink.core.level", "at": [240, 580], "cost": { "res.currency": 25 } }  ],  "people": [    { "role": "supplier", "from": "node.material_source", "to": "sink.core" },    { "role": "supplier", "from": "node.food_source", "to": "sink.sales_point" },    { "role": "cashier" },    { "role": "idle" }  ],  "params": { "core.burn": 2.4, "housing.base": 4, "customers.spawn": 2.8 },  "goal": { "type": "population", "n": 10 },  "fail": ["meter.lifeline"],  "rating": { "difficulty": 0.42, "botMargin": 0.31, "botsPassed": ["good", "average"] }}
Rules that keep it parametric
No if (level === n) anywhere. Level-specific behavior must come from the manifest.
Every number in a mechanic reads from content definitions or manifest params, with defaults in content.
Goal types are a registry too: build X, reach population N, earn N currency, survive N waves, serve N premium customers, combinations.
Shipped manifests are pinned to engine and content versions, so a rules change never alters a level a player has seen.
Simulation engine
One deterministic, headless simulation runs every rule; the game, the bots and both renderers are clients of it. The prototype already works this way in miniature, which is how its levels were tested by automated players.

engine architecture · one simulation, three consumers
Renderers only read state snapshots and events; they never change game state, so the 3D renderer can replace the 2D one without touching rules.
Requirements
Fixed timestep (30 ticks per second), integer or fixed-point positions, seeded RNG. Same manifest + same input stream = same result on every device, which makes replays, bug reports and bot ratings exact.
Headless: no DOM, canvas or engine imports in the simulation package. Runs in Node workers at 50 to 200 times real speed for generation and rating.
Input is one direction vector per tick; bots and humans use the same interface.
Events out: gathered, deposited, sold, built, captured, released, hit, died, wave started. Renderers turn these into animation, particles, sound and haptics.
Agents are data-driven state machines (gather, deliver, wait, operate, guard, heal), parameterized by role definitions. The fill-then-deliver rule from the prototype is part of the base gatherer state machine.
Pathing: straight-line steering with simple obstacle avoidance in v1; grid A* only if generated layouts need it.
Lessons from the prototype that become engine rules
Workers switch modes only when full or empty, never by comparing a count each frame.
Sinks accept per-type, and every queue has a fallback (serve-any, give-up timers) so no single shortage can deadlock a level.
Loot dropped where the player cannot go (beyond a barrier) is relocated to a reachable spot.
Level generation
The generator turns a request (target difficulty, module set, goal type, seed) into a manifest in four stages, then keeps it only if bots prove it feasible. Feasibility comes from simulated play plus a fast economic check.
1. Module selection
The sequencer (next sections) supplies the active modules: the newly introduced mechanic plus 2 to 4 from the unlocked pool. The generator adds dependencies automatically (customers require a sales point, converters require their input source, defense requires a barrier line) and enforces module exclusions (the lasso never appears with hunting or defense).
2. Layout
Map templates define zones (base center, resource fields, outer zone, attack edge, gate) and their rough placement, so layouts stay readable.
Entities are placed by constraints, not coordinates: minimum spacing, zone membership, walking distance bands from the core ("food source 150 to 250 units away"), and no overlap of interaction radii.
Distances are a difficulty knob: longer routes mean more time per delivery.
Blocked zones and barriers are placed so every gated area has exactly one unlock path.
3. Economy
Parameters are drawn within content ranges, then balanced with a flow model:
Compute steady-state flows for each resource: supply rate from nodes and workers, demand rate from core burn, customers and converters.
Check the core is sustainable with the player alone for the opening, and that currency income can reach each pad's cost on the goal path within the time budget.
Reject parameter sets where any required flow is negative or the goal needs more than 85% of available player time.
This analytical pass is cheap and discards most bad candidates before any bot runs.
4. Goal and fail conditions
Goal types come from a registry (build X, population N, currency N, survive N waves, serve N premium customers). The generator picks one that exercises the newly introduced module, then sets its size from the flow model.
Feasibility by bot play
Reference bots run the manifest headless: a scripted planner bot that follows a greedy build order, plus noisy variants that add reaction delay, detours and imperfect priorities to imitate weaker players.
A level is feasible when the reference bot wins with at least 20% margin (time left or resources left) across 10 seeds of in-level randomness.
Bots also expose softlocks: any run that stalls with no progress for 30 seconds fails the level and logs the stall state.
Quality filters
Filter
Rejects when
Idle module
A selected module is never used on the bot's winning path
Trivial
The weakest bot wins in under 40% of the time budget
Stall
Any bot run stalls with no progress for 30 seconds
Unreadable layout
Interaction radii overlap, or key stations sit off-screen from the core
Duplicate
Same module set, goal and layout template as a recent level
Difficulty, fun and calibration
Every level gets two scores from bot play: difficulty (D), from how a ladder of bots of different skill fares, and fun (F), from proxies the research links to enjoyment and retention. Once real players exist, learned models replace the hand weights of both.
Bot skill ladder
Five bots share the planner but differ in reaction delay, routing efficiency, priority mistakes and multitasking (whether they notice the core running low while selling). The weakest bot that still wins is the single strongest difficulty signal. Skill is modeled as human-like imprecision rather than as smarter planning: input timing noise, reaction delay and priority mistakes, with a learning term that shrinks the noise over repeated attempts, because learning changes how hard a level feels.
Metrics per level
Metric
What it captures
Weakest winning bot
Overall skill needed
Win margin per bot
Slack: time or resources left at the goal
Lifeline risk
Lowest fuel reached and time spent below 25%
Concurrent demands
How often 2 or more stations need the player at once
Route load
Share of time walking versus acting
Threat pressure
Base HP lost, barriers broken, injuries per minute (defense levels)
Economy tightness
Currency needed on the goal path divided by currency available in the time budget
Module count and novelty
Active modules, and whether one is new to the player
Composite index (v1)
Each metric is normalized against a reference batch of generated levels, then combined:
D = \sigma\left(\sum_i w_i z_i + b\right)
where z is each normalized metric, w its weight, and sigma a logistic squash. Weights start hand-set and are tuned against internal playtests.
Targeting
The generator searches for a manifest whose D lands within ±0.05 of the requested target: generate candidates, rate them, then hill-climb with parameter mutations (node rates, distances, costs, burn interval, wave sizes, patience) until the target is hit or a budget runs out.
Fun proxies
The median bot's runs are scored on proxies for suspense, pacing, agency and novelty; targets below are starting values that calibration replaces.
Proxy
Computed from bot runs
Starting target
Close finish
Median bot's win margin (time or resources left at the goal)
5% to 20%; above 40% is a walkover
Late uncertainty
Share of runs whose outcome is still open at 70% of level time (goal progress and lifeline both short of safe)
At least half of runs
Tension rhythm
Peaks and valleys in a smoothed threat signal (lifeline shortfall, queue pressure, attack load)
2 to 5 peaks with recovery between; no single squeeze longer than 25% of the level
Decisiveness
Outcome spread when bots replay with different priority orders
At least one order changes the margin by 10 points or more
Reward cadence
Gaps between reward events (sale, build, unlock, rescue)
Median gap under 8 s, longest under 30 s
Dead time
Share of time with nothing useful to do
Under 10%
Fair failure
Warning lead time before any fail condition triggers
At least 10 s of visible warning
Novelty
New module, goal type or layout versus the last 5 levels
One novel element; at most one new mechanic
Predicted churn
Quit rate from the population model (below)
Under the arc's ceiling, set from telemetry
The proxies combine into a fun score the same way as difficulty:
F = \sigma\left(\sum_j v_j y_j + c\right)
A level ships only when D is within ±0.05 of its target and F clears the arc's threshold; failing levels go back into the mutation search.
Research behind the proxies
The evidence favors suspense, pacing and novelty over a precise difficulty-skill match, so the engine optimizes those directly.
Finding
Study
Rule it supports
Easier conditions kept players longer: engagement fell linearly with challenge, with no inverted U. Raising success from 29% to 63% gave 34% more trials and 18% more time; short time limits were the most disengaging factor.
Lomas et al., CHI 2013 (69,642 sessions)
Easy tutorial arc, generous timers
With difficulty assigned rather than chosen, the easiest games motivated most; moderate novelty beat too little or too much; suspense helped in close games.
Lomas et al., CHI 2017 (about 22,000 sessions)
Novelty, close finish
Enjoyment peaked when players were slightly ahead; 69% chose to replay a game they had won narrowly over one they had won easily.
Abuhamdeh, Csikszentmihalyi and Jalal, 2015
Close finish, late uncertainty
Narrow losses did not raise the urge to keep playing; wins were rated above losses whatever the margin.
Near-miss experiment, 2019 (n = 40)
Aim for close wins, never engineered near-fails
AI-controlled difficulty-skill balance changed performance but not enjoyment or engagement.
Cutting et al., 2023 (n = 311 and 309, pre-registered)
No precise flow-ratio targeting
AI-agent results plus a simulated population (skill, persistence, boredom, learning) predicted per-level pass and churn rates across 168 levels and 95,266 players. The population model cut churn error by about 30%; learning mattered most for pass rate; real pass rates as input cut churn error by 71%.
Roohi et al., CHI PLAY 2020
Population model, early swap to real pass rates
Bots with timing noise (20 to 60 ms standard deviation) and survival analysis yield a difficulty curve as a hazard rate; learning lowers it over attempts; one setting serves different skill levels poorly.
Isaksen and Nealen, 2015
Noise-based skill ladder with learning
Self-play measures such as late uncertainty, drama and killer moves correlated with human game preferences; 17 of 57 criteria were kept.
Browne, 2008
Late uncertainty, decisiveness
Intensity rises with damage taken and decays toward zero, giving peaks and valleys.
Left 4 Dead AI Director, Valve
Tension rhythm
Most of these studies used other genres and short lab or web sessions, so they set starting targets, not final ones.
Calibration with real players
Telemetry per attempt: level id and versions, outcome (win, fail reason, quit), time, time per phase, core-out events, stalls, retries, session end reason.
A gradient-boosted regressor maps level metrics to observed first-attempt fail rate, retrained nightly once 300 or more levels have 30 or more attempts each.
Later, a skill-conditioned model (item response theory) gives each level a difficulty and each player a skill, enabling per-player targeting.
The regressor only grades; feasibility stays guaranteed by bot play.
Population model. Before launch, a simulated player population sits on top of the bot ladder: 2,000 simulated players with skill, persistence, boredom and learning, each drawn from a distribution, play through the sequence using the bots' per-level results and quit when frustration or boredom crosses their threshold. It predicts pass rate and churn per level, and its parameters are fitted to telemetry once it exists. As soon as real pass rates are available they replace the bot estimates as its input.
Fun calibration. The fun proxies are calibrated the same way as difficulty: a second regressor maps proxy values to next-level continuation, replays and day-1 retention, and its weights replace the starting v values.
Sequencing and progression
Mechanics unlock cumulatively, but each level draws a small subset from the unlocked pool; this hybrid follows how successful puzzle games pace new skills (Linehan et al., CHI PLAY 2014) and the finding that variety raises engagement independent of difficulty (Lomas et al., CHI 2013).
Subset rule
Teach: a new mechanic's first level is built around it, with at most 2 familiar modules and a low target difficulty.
Test: the next 1 or 2 levels use it again at medium difficulty with different companions.
Mix: afterwards it joins the pool; each level draws 3 to 5 modules, always including one introduced in the last 5 levels.
Cap: no level runs more than 6 optional modules, even late in the series.
Exclusions: some modules never share a level, declared as data (excludes) in each module's definition. Lasso excludes Hunting and Defense, because towing would trivialize hunting and collect loot from defeated enemies.
Always on: carry, gather, core, sales point.
Introduction order (v1)
The prototype's four levels are the first beats of this order, expressed as sequencer rules.
Order
Mechanic introduced
1
Core loop: gather, core, sales point, register
2
Workers with delivery, cashier
3
Source gating (a second food source needs a supplier)
4
Lasso and recruit rescue
5
Housing, waiting area, gate arrivals
6
Core levels and blocked-zone unlocks
7
Hunting
8
Converters with operators: food processor
9
Converters: material processor, refined-material costs, and a second dedicated supplier for it
10
Customer variety: impatient and premium
11
Barrier lines with gates, ranged defenses, creature waves
12
Defenders and their training pad
13
Raiders, salvage and defense upgrades
14
Injury and medical station
15
Hazard events, dense fuel
16
Depot and haulers: full automation of supply
New content (new lassoables, new converters, new enemies) appends to this list as data.
Curve shaping
Sawtooth: target difficulty rises across a 10-level block, then drops for one breather level. During the tutorial arc (about the first 20 levels), targets stay low: the median bot wins at least 85% of first attempts, with generous timers.
Novelty: no two consecutive levels share the same module set, goal type and map template.
Band: after the tutorial arc, targets oscillate between about 0.4 and 0.8 rather than climbing forever.
Recovery: after two failed attempts, the next generated level targets 0.1 lower (optional, behind a flag).
Experiments
Because sequencing is rules over data, alternatives are cheap to A/B test: cumulative-everything versus pool-and-subset, introduction order, breather frequency. Compare day-1 and day-7 retention and quit points.
Visuals: two phases, one simulation
The shipped game should look like the ads: low-poly 3D, tilted top-down camera, juicy feedback. It is built in two phases so gameplay and the level engine are proven on a cheap 2D renderer before art spend.
Phase 1: 2D renderer
Purpose: prove the loop, the generator, the rater and retention with real players.
Look: flat icon-style sprites as in the prototype, top-down, readable at phone size.
Tech: Phaser 3 (or the prototype's plain canvas) as an installable web app that plays offline; the same build is wrapped in Capacitor at the port gate.
Must already have: camera follow, off-screen pointers, item stacks on the character's back, floaters, haptics, sound hooks.
Phase 2: 3D-style renderer
Camera: fixed tilted three-quarter view (about 50 degrees), slight perspective, follows the player with easing.
Models: low-poly GLB models in the chosen shading model; instanced nodes, scatter and items; one shared character skeleton for player, workers, customers and raiders, with each skin supplying its own character bodies (see Asset pipeline and art direction).
Lighting: the core is a real light source whose radius matches the safe radius; soft blob shadows; night and hazard events as lighting and particle presets.
Juice (the ad feel): items arc onto the back stack and wobble; currency flies to the HUD; buildings rise with a squash-and-stretch pop; recruit containers show the recruit inside and visibly open on release; the lasso line sags and swings (verlet rope); hit flashes and knockback on enemies.
Performance budget: under 60k triangles on screen, under 100 draw calls, texture atlas per skin, 30 fps floor on a mid-range phone.
Renderer contract (both phases)
Call
Purpose
init(manifest, skin)
Build the scene from the level and the active skin
sync(snapshot, alpha)
Draw interpolated state between simulation ticks
onEvent(event)
Play animation, particles, sound and haptics for a game event
The simulation's 2D plane maps to the 3D ground (x, z); height is purely visual (stacks, jumps, arcs).
Phase 2 engine options
Option
Strengths
Costs
three.js renderer in the same TypeScript app (recommended)
Shares the simulation package unchanged; the same build can produce HTML5 playable ads, a key acquisition channel for this genre; small bundle
More hand-built tooling for effects and UI than a full engine
Babylon.js renderer in the same app
Same code sharing; stronger built-in game tooling (inspector, particles, GUI)
Larger bundle, which matters for playable-ad size limits
Unity, simulation ported to C#
Best 3D tooling, asset store, mature ad and analytics SDKs
Two codebases or a port: the generator and bots must run the C# simulation headless too
Skins
Themes are data packs keyed by canonical ids (node.material_source, sink.core, conv.food_processor, hostile.raider_humanoid, res.food_raw_1), each with names, 2D sprites, 3D models, palette, audio and story text. Each skin also names the lifeline and what threatens it: warmth and blizzards in a frozen camp, heat and power from a reactor through dust storms on Mars, power through solar flares on a space station, air through hull breaches in an underwater colony. Mars Greenhouse is the launch skin; the frozen camp (the prototype's theme) and other candidate themes map onto the same keys. A skin is a full asset set, not a recolor; see Asset pipeline and art direction. A grey debug skin ships in every dev build, and a CI check fails if any key lacks an asset in any skin.
Skin roster. Phase 1 builds only the Mars Greenhouse skin plus the grey debug skin; every other environment below is a later data pack on the same engine. A skin changes names, models, palette, audio and story, never ids, rules or level data, so any generated level plays in any skin.
Skin
Lifeline
Core
Hazard event
Status
Mars Greenhouse
Heat and power
Reactor
Dust storm
Launch skin, Phase 1
Frozen camp
Warmth
Fire or barrel stove
Blizzard
Prototype theme, next candidate
Deep Sea Colony
Air
Oxygen plant
Hull breach
Candidate
Space Station Salvage
Power
Reactor core
Solar flare
Candidate
Arctic Research Station
Heat and power
Generator
Whiteout
Candidate
Desert Oasis Caravan
Water
Well pump
Sandstorm
Candidate
Lighthouse Keepers
Light
Beacon lamp
Sea storm
Candidate
Sky Islands
Lift
Levitation crystal
Wind shear
Candidate
Volcano Island Spirits
Protection
Shrine flame
Eruption
Candidate
Haunted Hotel Restoration
Light
Boiler and lamps
Ghost surge
Candidate
Enchanted Bakery Town
Warmth
Town oven
Frost night
Candidate
Which skin ships second is a later decision, made from launch telemetry and art cost.
Asset pipeline and art direction
Every skin is a complete, art-directed asset set that fills the same gameplay slots, built through one pipeline and gated by automated checks before it ships.
Asset sourcing by class
Code builds everything that benefits from parameters; generated or artist models are reserved for shapes code handles poorly, mainly characters.
Class
Examples
Source
Budget per model
Characters
player, workers, customers, raiders
AI-generated (Meshy-class) or artist, then cleaned, retopologized and rigged
8k tris
Hero buildings
core, sales point, converters
Procedural builder, hand-tuned; generated or artist only where a tier needs organic detail
3k to 5k tris per tier
Props and items
resource items, crates, currency
Procedural
500 tris
Scatter
resource nodes, rocks, recruit containers
Procedural with seeded variation, instanced
500 tris
Environment
ground, sky, fog, weather
Procedural geometry and shaders
n/a
File conventions: GLB, 1 unit = 1 m, Y up, +Z forward, pivot at the ground center of the footprint, node names matching canonical ids (sink.core, conv.food_processor).
Skins are full asset sets
A skin supplies its own model for every canonical id, designed for its world; a recolor or rename alone fails review.
Canonical id
Mars Greenhouse
Frozen camp
node.food_source
Pressurized grow dome
Unheated polytunnel
sink.core
Reactor heat core
Barrel stove with log pile
unit.player
Colonist in an EVA suit
Survivor in a parka
sink.sales_point
Sealed kiosk with a pass-through airlock
Open wooden market stall
Each skin also ships an environment set: ground material, scatter set, sky and fog, weather particles, and lighting presets for day, night and storm.
The skin never changes gameplay: footprints, collision and anchors are fixed per id, so any skin plays identically.
Gameplay anchors
Every model exposes the same named anchor points, so the renderer places items, customers and rings without knowing which skin is active.
Anchor
Used by
Purpose
deposit
sinks, converters
Where carried items arc in
pickup
nodes, converters
Where output is collected
queue
sales points
Start point and direction of the customer line
interact
all stations
Proximity trigger ring drawn on the ground
safe
core
Light radius and ring, matched to the simulated safe radius
pad
buildings
Footprint and pop-in origin
stack
characters
Back-stack attach point
hand_L, hand_R, head
characters
Tools, held items, headgear
Anchors are named empty nodes in each GLB. CI fails if one is missing or if a footprint differs from its content definition by more than 5%.
Characters: rig and animation
All characters share one humanoid skeleton, but each skin supplies its own bodies: a space suit, a parka and a dive suit are different meshes, not hat swaps.
Role variants (worker, customer, raider) come from attachments on the head and hand anchors plus palette tokens.
Required clips: idle, walk, carry-walk, gather, harvest, deposit, hit, knockback, cheer, distress (lifeline low).
Source: auto-rigging plus a licensed animation library, retargeted to the shared skeleton. Secondary motion (stack wobble, bob, head turns) stays procedural in code.
Visual states driven by data
Models change with simulation values, which carries much of the ad feel; the renderer reads them from the snapshot and the art holds no logic.
Entity
Driven by
What changes
Core
Fuel level
Output effect size (flame, glow, spin), light intensity, safe ring
Sales point
Stock, queue length
Crates fill and empty, customers line up
Converters
Working, idle, blocked
Animation, smoke or glow, warning icon
Buildings
Upgrade tier, build progress
Model per tier, scaffold, then squash-and-stretch pop
Nodes
Stock left, regrow timer
Nodes deplete and regrow
Residents
Inside the safe radius, lifeline level
Distress overlay and clip, styled by the skin (frost, low-oxygen fog, flickering lights)
Models expose these as named parts or morph targets.
Art direction and quality gate
One look across all skins, checked by machines before a person reviews it.
Reference board: 10 to 15 frames from the source ads, kept in the repo, defining camera angle, object scale, saturation and juice.
Shading: one model for every skin, soft stylized PBR with an environment map (as in the asset lab's smooth mode) or toon ramp plus outline; never mixed. Open decision, listed below.
Palette tokens per skin: ground, structure, accent, interactive highlight, danger and one color per resource. Interactive objects and resources must contrast with the ground by a fixed luminance margin, which addresses the Mars red-on-red risk.
Readability: every id rendered about 40 px tall from the game camera must stay recognizable, and roles must have distinct silhouettes.
Golden screenshots: CI renders every id in every skin and visual state from the game camera; a diff above threshold needs approval, alongside the existing missing-key check.
Performance tiers and asset lab
The 60k-triangle scene budget splits by class (table above) and scales by device tier.
Tier
Changes
Low
Half-resolution shadows, the core is the only dynamic light, no clearcoat or post effects
Medium
Full shadows, up to 4 dynamic lights
High
Clearcoat, soft shadows, bloom on glows
The tier is picked by a short GPU benchmark on first launch and can be changed in settings.
Playable-ad builds use procedural assets only, with a 5 MB total target.
Asset lab: a dev-only viewer showing every id in every skin side by side, with skin and tier toggles, an anchor overlay, visual-state sliders and triangle counts. The prototype lab shows four slots in two skins.
Tech stack, repo and testing
One TypeScript monorepo: the simulation is a dependency-free package shared by the client, the generator, the bots and the rater; renderers are swappable packages.
farthest-outpost/  packages/    content/        registries: resources, nodes, converters, roles, enemies, upgrades, goals (JSON + schemas)    sim/            fixed-step simulation, agents, seeded RNG, events; no rendering imports    bots/           planner bot, skill ladder, stall detector    generator/      module selection, layout templates, economy flow model, mutation search    rater/          metrics, composite index, reference batch normalization    sequencer/      unlock order, subset rule, curve shaping, A/B variants    render-2d/      Phase 1 renderer (Phaser or canvas)    render-3d/      Phase 2 renderer (three.js), skins, VFX    client/         app shell, HUD, menus, save data, telemetry, service worker, web manifest; Capacitor wrapper added at the port gate  calibration/      Python: telemetry join, regressor, IRT model  levels/           generated manifests, pinned by engine and content version  CLAUDE.md         rules for the coding agent
Testing
Determinism test: the same manifest and input log replayed twice produce identical state hashes, on Node and in a browser.
Property tests (fast-check): sinks never go negative, per-type caps hold, every queue drains under supply, workers never return with partial loads.
Bot regression suite: every generated batch is played by the bot ladder; any stall or infeasible level fails CI.
Golden levels: the four prototype levels re-expressed as manifests, with recorded bot results; any rules change that shifts them fails CI until re-baselined.
Renderer smoke tests: load 20 manifests per renderer and replay recorded inputs to the win screen. An offline test installs the web build, switches to airplane mode and plays through a cached level pack.
CLAUDE.md rules for the agent
No level-specific code; every number reads from content or the manifest.
sim never imports a renderer, DOM or engine package.
Every new mechanic ships with its content schema, a property test, a bot behavior and a rater metric.
No user-facing name, color or asset path is hardcoded; everything resolves through the active skin.
Offline web app and release path
The game ships first as a free, installable web app that plays offline; it moves to the App Store only after that version has proven the loop, the level engine and retention with real players.
Offline web app
Part
How it works
App shell cache
A service worker (Workbox) precaches the code, the active skin's sprites, audio and fonts on first visit; every later launch loads from the phone, online or not.
Level packs
Generated manifests ship in packs; the next 20 to 50 levels download in the background whenever the phone is online, so the player always has a buffer.
Saves
Progress lives in IndexedDB. The app calls navigator.storage.persist() on launch and syncs saves to the server when online, so a cleared cache never costs progress.
Telemetry
Events queue locally and upload when a connection returns.
Install
A web app manifest (name, icon, standalone display, portrait) makes Add to Home Screen open full screen; the active skin supplies name and icon.
Updates
A new service worker downloads in the background and activates between levels, never mid-level.
Accepted limits of the web version: no native haptics, iOS may still clear storage under pressure, and players find it only by link. WebKit gives home-screen web apps the same storage quota as a browser and weighs home-screen use when granting persistent storage (WebKit storage policy).
Port gate
The App Store port starts only when all of these hold:
☐ At least 20 cached levels play start to finish in airplane mode on a mid-range iPhone at 60 fps.
☐ Save sync survives a cleared cache with no lost progress.
☐ Playtesters meet the retention target agreed before playtests start.
☐ The bot regression suite shows no open stalls or softlocks.
App Store port
Wrap, don't rewrite: the same web build goes into Capacitor with no game code changes.
Native swaps: saves move to native storage; add audio interruption handling, haptics, safe-area insets and pause on background through Capacitor plugins.
Apple setup: Developer Program membership, bundle id, signing in CI, automatic build numbers. Uploads must be built with Xcode 26 and the iOS 26 SDK (Apple requirements).
Compliance: privacy manifest, export-compliance flag, age-rating questionnaire, privacy disclosures and a privacy policy URL for telemetry, TestFlight test information.
Release: internal TestFlight first, then external testers after Beta App Review, then App Store submission.
Costs
Item
Cost
When
Web hosting and save sync
Free tiers of static hosting and a small backend
Phase 4
Apple Developer Program
$99 per year
Phase 7
iOS builds
Free with a Mac; otherwise 25 Xcode Cloud hours a month are included (Xcode Cloud)
Phase 7
Google Play
$25 one time
After iOS
Build plan
Phase 1 (the 2D game with the full level engine) takes about 22 to 35 working days and roughly 11M to 23M tokens; Phase 2 (3D-style renderer) adds 3 to 6 weeks, paced by art rather than code. The App Store port adds 3 to 5 days once the web build passes its gate.

build roadmap · 8 phases, web first, App Store after the port gate, not to scale
Each gate is a test that must pass before the next phase starts; phases 5, 6 and 7 can run in parallel after the web launch, and phase 7 starts only once the port gate passes.
Phase
Deliverable
Model
Tokens (total, agentic)
0 Sim core
Content schemas, fixed-step sim, seeded RNG, event bus, determinism test, prototype levels as manifests
Fable 5.1
1M to 2M
1 Mechanics
Every catalog module as data, 2D renderer at prototype parity, HUD, golden levels
Fable 5.1 (rules), Opus 5.5 (UI)
3M to 6M
2 Bots and rater
Planner bot, skill ladder, stall detection, metrics, composite index
Fable 5.1
2M to 4M
3 Generator and sequencer
Layout templates, flow model, mutation search, subset rule, curve shaping, batch CLI
Fable 5.1
4M to 8M
4 Web launch
Polish, offline web app (service worker, level packs, save sync, telemetry queue), home-screen install, playtest launch
Opus 5.5
1M to 3M
5 3D renderer
three.js renderer, GLB pipeline, VFX, skin system for 3D, performance pass
Opus 5.5
4M to 10M
6 Calibration
Telemetry join, regressor, retraining job, optional IRT
Fable 5.1
1M to 2M
7 App Store port
Capacitor wrap, native storage, audio and haptics plugins, privacy manifest, signing CI, TestFlight, App Store submission
Opus 5.5
1M to 2M
Token figures include context re-reads, which dominate agentic work; actual output is roughly 10% of each figure. Check current API pricing to convert to dollars. Phase 5 also needs about 40 to 80 low-poly models per theme (characters, buildings, nodes, enemies, props), from an artist or purchased packs.
First session prompt (Phase 0)
Read this spec and the attached prototype (demo.html). Create the monorepo layout from the Tech stack section. Implement packages/content schemas for resources, nodes, sinks, converters, roles and goals, and packages/sim as a fixed-step, seeded, headless simulation with an event bus. Port the prototype's rules for carry, gather, core and sales point only. Express prototype level 1 as a manifest and make a determinism test pass. Write CLAUDE.md with the agent rules. Do not build renderers yet.
Risks and open decisions
The biggest risk is that generated levels are feasible and correctly rated but feel samey; the layout templates, the novelty rule and real playtests are the defence.
Risk
Impact
Mitigation
Generated levels feel samey
Churn despite fair difficulty
Hand-authored layout templates, novelty rule, mix in authored "hero" levels as manifests
Bots play unlike humans
Ratings miss real difficulty
Skill ladder with human-like noise; calibrate against telemetry from Phase 1 launch
Softlocks from new mechanic combinations
Unwinnable levels in production
Stall detector in every bot run; serve-any and give-up timers as engine rules
Simulation drift between devices
Replays and ratings disagree with play
Fixed-point math, fixed timestep, determinism test in CI on Node and browser
3D performance on low-end phones
Frame drops, battery drain
Triangle and draw-call budgets, instancing, a low-quality preset, keep the 2D renderer as fallback
Art cost and consistency in Phase 2
Delays, mismatched look
One low-poly style guide, shared rig, buy packs first, commission only hero assets
Looks too close to the source games
Store rejection or legal notice
Original names, art and themes; mechanics are fine, specific visuals and branding are not
iOS clears web app storage
Cached levels or progress lost
Persistent storage request, server save sync, level packs re-download automatically
Decisions needed
☐ Phase 2 engine: three.js in the shared app (recommended), Babylon.js, or Unity with a C# port
☐ Phase 2 shading model: soft stylized PBR with an environment map, or toon ramp plus outline (one model for every skin)
☐ Day timer as a standard fail condition, or only on some levels
☐ Meta progression between levels (persistent base, unlock currency) or self-contained levels
☐ Monetization model, since it shapes level pacing and session length
☐ Whether HTML5 playable ads are part of user acquisition (favours a web-based Phase 2 renderer)
