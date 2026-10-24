# Decisions log

Decisions made after `SPEC.md` was written. Where they conflict with the spec, these win.

## 2026-10-09 — Phase 0 kickoff

1. **Barrier lines are their own module, and the lasso needs one.** A barrier line
   is the demarcation of where a wall can be built; walking along it while carrying
   the line's resource builds a section. It exists in any level where a wall can be
   built, defense or not. The lasso's tow line engages only when the player leaves
   through a gate, so `lasso` requires `barrier_lines`. Introduction order changes to:
   4 barrier lines + gate, 5 lasso and recruit rescue, 6 housing, 7 core levels and
   blocked zones, then the rest shift down one (see `packages/content/data/modules.json`).
2. **Lifeline grace period.** When fuel hits zero the lifeline starts draining at
   once; `core.grace` is the time from empty core to level failure (22 s in the
   prototype). Fuel restores recovery immediately.
3. **Fixed-point sim.** Integer milli-units for space, ticks for time, `mulberry32`
   for randomness. Content and manifests stay in decimals and are converted in
   `compile.ts`. Chosen over floats so Node, every browser and every phone agree
   bit-for-bit on replays and bot ratings.
4. **Renderer naming.** "2D renderer" and "3D renderer" replace the spec's "Phase 1/2"
   in the visuals section; the build is sequential (prove everything in 2D, then swap
   the renderer). "Phase N" means the build plan only.
5. **Housing before its module.** Levels that rescue or admit recruits before
   `housing` is introduced rely on `housing.base` slots from the manifest.
6. **Day timer.** Optional per level via `timer.seconds` in params (0 = none). The
   open decision about making it standard stays open.
7. **Repo.** New standalone repo at `C:\Users\dougl\Projects\farthest-outpost`,
   pnpm workspace, TypeScript, Vitest, fast-check, zod. GitHub remote later.
8. **Delivery.** Installable offline web app first (service worker, level-pack
   prefetch, IndexedDB saves), loaded on the phone over local Wi-Fi during
   development and from free static hosting after; App Store port behind the gate.
9. **Models.** Fable 5.1 for architecture-heavy phases (0, 2, 3, 6); Opus 5.5 for
   UI, offline shell, 3D renderer and the store port (1-UI, 4, 5, 7).
9a. **Model fallback (2026-10-09).** Fable 5.1 usage ran out mid-build; all remaining
    streams run on Opus 5.5.
9b. **Time budget (2026-10-09).** Every level carries `level.budgetSeconds` (content default
    300). It is a rating input only (margins, the trivial filter, stars), never a fail
    condition; `timer.seconds` stays the optional fail timer. The generator sets the budget
    from its flow model.
9c. **Pad dwell (2026-10-09).** Payment starts only after the player has stood on a pad for
    `pads.dwellTicks` (default 0.35 s), so walking across a pad never spends by accident.
9d. **Drop-only demand (2026-10-09).** Customers do not order a good whose only source is
    hostile or prey drops while its shelf stock is zero, so an empty drop economy cannot clog
    the queue.
9e. **Golden levels stay prototype-faithful.** Their rater flags (L1 idle source gating, L2
    trivial, L4 easy defense, L4 node/pad overlap) are accepted as baseline facts; the
    generator's filters and difficulty search fix these in generated levels. The L4 overlap is
    moved 2 units to clear the readability filter.
9f. **Idle-converter demand (2026-10-10).** Mirroring 9d, customers do not order a good whose only
    source is a converter while its shelf stock is zero and the converter has no output stock and
    is not running (`converterIdle`), so an unfed converter cannot clog the queue. Engine 0.4.0.
9g. **Pad dwell 0.5 s (2026-10-10).** `pads.dwell` rises from 0.35 to 0.5 s (15 ticks): a straight
    crossing of a pad (about 11.6 ticks) must never pay. Content 0.4.0.
9h. **Redesign round 2 (2026-10-10).** Agreed with Doug after an iPhone playtest; the full
    brief is `docs/REDESIGN-R2.md` and overrides older entries where they conflict. In short:
    3D only; clerk pad and Martian kiosk; Colony HP; fuel forests; reactor-out countdown with
    colonists freezing one at a time; always-stocked customer queue; perimeter walls only where
    needed, attacks from 1–3 sides, swarm waves with a scrap economy and bosses; five level
    families (shelter, rescue, harvest, industrialize, defend) with ten goal types each and a
    story intro in that order for levels 1–5; three named star objectives per level shown before
    and during play; guide arrows on levels 1–5, discovery labels, tap to inspect, field guide;
    whole pack cached offline. Supersedes 1 (intro order) and 9e's acceptance of superfluous
    elements in generated levels.
9i. **R2 sim rules (2026-10-10, engine/content 0.5.0).** Phantom sales came from serving a
    customer on the tick they spawned off-map (y-only slot check); serving now needs both axes.
    Tow loss: the rearmost pod drops when a hostile hits the player; standing still 2.5 s outside
    the heat while towing drops the whole tow. Lasso no longer excludes hunting (the rescue
    family needs both); it still excludes defense. Objective kinds live in
    `content/data/objectives.json`; manifests carry `family` and exactly three `objectives`, the
    first mirroring `goal`. Colonists freeze one at a time across the grace period while the
    reactor is out.
9j. **R3 Phase B rules (2026-10-16, engine/content 0.6.0).** From `docs/REDESIGN-R3.md` and
    Doug's answers there.
    - Purchase time: the front customer is served for `sales.serveSeconds` (0.6 s) before paying,
      pausing while the clerk pad is unstaffed or the good is out; patience keeps running.
    - Wall repair: walking a damaged section with the line's resource restores full HP for
      `ceil(costPerSection × barrier.repairK)` (0.5), paid at once. A destroyed section is rebuilt
      at the same repair price.
    - Pile collapse: a converter output held at its cap for `stock.collapseSeconds` (8 s) collapses
      and fails the level (`pile_collapse`); no goods are lost. Kiosk shelves never count, since a
      full shelf is the healthy state.
    - Time target: generated time targets and `level.budgetSeconds` are 1.4× (`timeTargetK`);
      Settings scales the time star 100–200% per player, applied to the manifest before the sim
      starts. The rater's trivial-budget share drops to 0.286 so it cuts at the same time as before.
    - Wall towers: `pad.build.site` places the structure away from its pad; walled defend levels
      put each attack side's turret on a ring post, replacing freestanding turrets.
    - Conveyors: new module `conveyors` (`struct.conveyor`, `pad.build.link {from, to}`); a belt
      moves units at `conveyor.speed`, one per `conveyor.everySeconds`, backs up when the target is
      full. Introduced with the warehouse as the industrialize step after haulers.
    - Hired operators pause one short of a full tray while piles can collapse, so only the player can
      overfill one (automation relieves the pressure). A belt is laid only for goals that ride on its
      chain (`conveyorGoals`). Boss levels without a med bay get two wall towers per attack side; the
      med bay's early raid hits a quiet, unguarded side so injuries still happen.
    - "Every shelf full" is back in the harvest pool with `adds: ["hunting"]` (and `avoid: source_unlocks`): the kiosk also sells hunted goods, so filling every shelf needs the hunt as well as the farm. (It left the pool earlier because with purchase time shelves fill in
      seconds with one good.)
    - 0.6.1 playtest changes: "Nothing overflows" counts converter outputs only (never kiosk shelves);
      the player deposits carried goods (not currency) into the warehouse within `struct.depot` range
      (`deposited` to `store.depot`); the player auto-fires at the nearest hostile within
      `player.rangedRange` (90) every `player.rangedInterval` (0.6 s) for `player.attackDamage`, emitting `shot`.
    - 0.6.2 (playtest): hire pads stand at each worker's station around its machine (input by the
      hopper, operator below the operator spot, output by the tray; `crewStations`), the cashier's
      beside the clerk spot; drop pickup range equals the ranged-shot range (90); clearing a wave
      sweeps its leftover loot into the pack up to the carry caps. With the ranged shot golden L4 is
      won comfortably by every rung, so the ladder-order test skips saturated levels.
    - Layout: the generator keeps drawn models from overlapping (`generator.json` footprints, held
      to the 3D models by a render-3d test), and groups each machine's hire pads beside it.
9k. **Playtest after 0.8.0 (2026-10-17, engine/content 0.9.0).**
    - Player health: `player.hp` (10). A dangerous animal's bite takes its `damage` (spiked hopper 2) on
      top of the old knock-off; health heals a point every `player.healInterval` (0.5 s) once nothing
      has hit for `player.healDelay` (4 s). At 0 the player is knocked down (`downed`): the whole pack
      spills, the tow drops, they lie still for `player.downSeconds` (2 s) and get up at full health.
      The 3D renderer draws a health bar over the hero while hurt. Spiked hoppers are a little
      stronger: hp 8 (was 6), a bite every 1.2 s (was 1.4). Hostile hits still do no damage.
    - Hands-off clock: working a machine's operator spot or ringing up a sale at the clerk pad now
      restarts it, like a deposit (`stats.lastPlayerDeposit` is "last hand work").
    - Manual first: sources that yield the same resource count as the same job, so ore carried from
      the ore pile unlocks a pad whose worker gathers ore scrap.
    - Layout: every collector's hire pad stands beside the source it gathers from (replacing 0.6.2's
      "input worker by the hopper"); operators and output workers stay at their machine. Reactor
      level pads stand beside the reactor (`corePadBeside`), a turret's upgrade pad on the turret's
      other side along the wall. Placement leans toward the core (`spacing.corePull`), the kiosk
      search centres part way to the core (`shopPull`), and industrialize levels get a smaller forest
      (`busyForestMax`) and no second grove, so machines stay nearer the base.
    - Client: a level opens on an overview of the whole base and waits for the first touch, then
      zooms in on the hero. The guide names steps "Build the X" / "Hire the X" / "Upgrade the X",
      and a step it cannot name no longer freezes the arrow on the previous step (the hire-pad label
      bug behind "stuck on collect coins / feed reactor"). The haul goal reads "Couriers deliver N
      goods from the warehouse".
9l. **Art direction: brutalist outpost, Phase 1 look pass (2026-10-17).** Doug's concept sheets
    replace the toy look (ART-DIRECTION.md); "when in doubt, the vibe image: more brutalist,
    more realism, less saturation". Phase 1 is code only: new launch palette (dusty sand,
    concrete, steel; contrast tests unchanged and passing), ACES tone mapping and a low key
    light, procedural surface wear and panel seams in the shader, concrete slab aprons and
    paths, and a gunmetal HUD in Barlow Condensed. `look3d.groundLift` pales the ground on
    screen only. Models keep their current shapes; reshaping them (or replacing them with
    generated GLB models) is the next phase. No rules change, so no engine bump.
9m. **Vibe camera (2026-10-17).** Doug picked the isometric camera from the camera mock: 30°
    pitch, 45° yaw, 8° FOV (near-orthographic), 266 units across (`units.ts`). Screen
    directions turn to world directions for the joystick and keys (`screenToWorld`), the
    level-start overview fits the base as the turned camera sees it, the look point is held on
    the map (the diamond view always shows ground past the edges), and fog is measured from the
    camera. World chips and labels take their light/dark colours from `tokens.paper`, so the
    dark HUD theme no longer turns them dark-on-dark. Render-only: no engine bump.
9n. **Level supply (2026-10-17).** Doug finished the 60-level pack and wants levels to keep
    coming. Levels stay an offline batch built and bot-tested on a computer, now in batches as the
    player advances, never more than 60 past the last cleared level (docs/LEVEL-SUPPLY.md). This
    adds one stateless relay (`api/progress.js`, a Vercel function) to the spec's "no servers";
    the build runs in GitHub Actions. Batch tuning from the player's stars and attempts
    (`sequencer.json` `adapt`) is built but off until Doug picks the goal. No levels built yet; the
    supply stays off until the dispatch token is set.
9o. **Combined regeneration after the models (2026-10-18, engine/content 0.10.0).** The level
    ends on its slowest goal: after the main goal it runs on for open stars, at most
    `level.overtimeSeconds`, and anything that ends it after the main goal is a win. Traders walk a
    generator route from the map edge through a gate (a ring always has one nearest the kiosk) and
    back. Optional pads the good bot can do without, stars included, are dropped. The warehouse has
    a drop-off pad and up to three pickup pads, used standing still (walking across drops nothing).
    Footprints stay as they were; every Meshy model fits them. Layout: straight square rings kept
    (Doug), base pulled to the core, and lots and streets (7B): streets cross at the core, buildings
    go in lots when any valid spot is in one, the 3D renderer paves used lots and runs pipes on
    their streets. Packs regenerated: s1 60/60 (27 off target by more than 0.05), s1-061 20/20
    (4); levels:check clean on both.
9p. **One side at a time (2026-10-18, engine/content 0.11.0).** Doug: raids hit one side at a time
    and soldiers move to that side. Every wave comes from a single attack side, the next wave from
    the next side (the first wave and the med bay's probe raid keep the first side). Guards
    (`rally` on role.defender) with nothing in reach walk to the mid and quarter posts of the wall
    facing the side most live hostiles came from, and back to their own posts once it is clear.
    The bot needs no new move (it already fights the live hostiles); the runner traces
    `rallyShare` and the rater reports it.
9q. **Playtest of 0.11.0 (2026-10-18, engine/content 0.12.0).** Doug saw a second wave from
    another side join the first with no gap. One wave at a time: a wave never starts while the last
    is on the field, and waits `defense.waveQuiet` (8 s) after it is cleared. Wall-tower build pads
    stand beside their tower against the wall's inside face (along the wall either way, else
    straight inward; forest nodes on that spot give way), and a tower's Lv2 pad takes its build
    pad's spot, which is free once the tower stands. Pads no longer snap to the 10-unit lot step.
9r. **Defence as tower defence (Batch 3, BACKLOG-R4, engine/content 0.13.0).** Doug's option B:
    managing defences, not first-person shooting.
    - Walls are built by hand and can no longer be damaged; nothing is repaired (`barrier.repairK`
      is gone). Only gates take damage. A broken gate stays broken (`broken`), is never rebuilt, and
      attackers from that side then go straight for the core. A broken core still loses the level.
    - Each wave comes down a narrow lane in line with its side's attack gate (the gate on that side
      nearest the core; `defense.laneHalfWidth` 18). Outside the ring an attacker makes for the
      nearest opening facing its side (an unbuilt wall section, or its gate once broken), else for the
      gate, which it hits until it breaks. Guards rally inside the attacked side's gate.
    - Turret sockets at every attack gate (generator.json `defendSockets`): 4 per gate from the start
      (inside the wall beside the gate and outside flanking the lane, where the map has room), and 2
      more at the gate the next wave comes to once 3 waves have started (pads with `requires.wave`).
      Each socket is a tower pad, then Lv2 and Lv3 pads on the same spot (Lv3 is new:
      `struct.ranged_defense.t3`, tier range 150, a shot every 0.35 s); each needs the one before and
      costs double (generated 3, 6, 12 salvage). The wall reinforcement pad is gone.
    - Every defend level has guards (the family's modules include `defenders`) and starts with the
      guard post standing, so the first purchase is hiring guards (`train`, no requirement).
    - A level with attack waves runs until the last wave is cleared, on every goal (a train-N-guards
      or tower-level goal no longer ends it in the first minute); the main goal still decides the win.
    - Star: "no wall lost" is replaced by "gate held" (`gate_held`). Waves are sized against the
      purchase ladder: all but the last wave drop `dropsPerNeed` (1.1) x its core (walls, the first
      two guards, med bay, tower and Lv2 on every starting socket); Lv3s and later sockets are left
      to buy, and the rater's `ladderSpent` filter rejects a level where the reference bot buys it all.
    - Bots: a defence spend policy (goal-path purchases first, then the first two guards, towers,
      Lv2 and more guards, Lv3; the socket on the next wave's side first, then the cheapest).
      Rater/bot traces: `playerKillShare` (stats `killsBy`, from `died.by`) and `ladderLeft`.
    - Playtests of the sample (2026-10-23), after the Kingshot playable ad (Doug's gold standard),
      replace the socket layout and sizing above:
      - Defend maps are padded by `defendRoad.pad` (360) on every side; each wave walks a dirt road from
        the map edge to its gate, so the player runs out to meet it. Only two socket pairs per road,
        outside the wall (the nearest open from the start, the second with the next wave); none inside.
      - Every defence purchase raises the next one's price (`pads.defenceGrowth`, generated 1.08);
        generated prices guard 5, tower 8, Lv2 16, Lv3 32; waves sized against the first guards and the
        open towers at those rising prices. Attackers about 4x the first build (swarm knob [30, 72]).
      - Guards march out through the gate to the nearest attacker and back (`role.sortie`). A Lv2 guard
        post (`struct.barracks.t2`, 40 scrap, looks the same) trains a soldier every 5 s (up to 16 alive,
        `struct.barracks.troops`): hp 4 and 1 damage a second, like a raider; attackers within
        `defense.troopContact` stop to fight them, and they can die.
      - Loot stays where an attacker fell (no relocation, no wave-clear sweep); scrap cap 400. Scrap
        heaps (`node.salvage_pile`, 8 scrap, never regrowing) lie out beyond the wall away from the roads
        on 80% of defend levels, to scavenge for the first purchases; such levels show no scrap as mere
        decoration, and the heaps take every scrap model in turn.
      - A defend level's reactor hauler is hired with scrap; scrap-paid hires are never cut by the search.
      - After any purchase the player steps off the pad before a pad takes payment again
        (`player.padLeave`), so scrap never spills from one upgrade into the next.
10. **Goal building id.** The prototype's "Lodge" and "Trading Post" are the same
    function: `struct.landmark`.
11. **Player walks through buildings (engine 0.13.0, R4 batch 3).** Param `player.walkThrough` (default 1).
    In the sim the only building that ever held the player out was the core's exclusion ring (every
    other station is walk-over already; the solid footprints live in the generator's trader route and
    layout, so workers/traders/customers are unchanged); with 1 the ring is off and the bot's nav stops
    treating the core as an obstacle. Walls, gates and turrets stay solid (`blockedAt`). The 3D renderer
    fades a building to see-through while the player stands in its footprint (not gates, turrets or
    belts). 0 restores the ring.
12. **Updates ask first; level progress survives a new pack by choice.** A waiting build shows its
    notes (`packages/client/release-notes.json`, stamped into `release.json` with `PROGRESS_EPOCH`) with
    Update now / Later on menu screens; it never installs itself (a cold start still does). On the first
    boot after a `PROGRESS_EPOCH` bump, a save with level progress asks: keep level progress (cleared
    levels and Play's level carry over; times, stars and tries start fresh) or start over. Nothing is
    written until the player picks. Keeping the old levels themselves was ruled out: every engine change
    would have to keep every old pack playable.
