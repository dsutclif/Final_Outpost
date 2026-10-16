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
    - "Every shelf full" is out of the main-goal pool for now: with purchase time shelves fill in
      seconds. It returns when harvest levels sell more goods per kiosk (R3 Phase C).
    - 0.6.1 playtest changes: "Nothing overflows" counts converter outputs only (never kiosk shelves);
      the player deposits carried goods (not currency) into the warehouse within `struct.depot` range
      (`deposited` to `store.depot`); the player auto-fires at the nearest hostile within
      `player.rangedRange` (90) every `player.rangedInterval` (0.6 s) for `player.attackDamage`, emitting `shot`.
    - Layout: the generator keeps drawn models from overlapping (`generator.json` footprints, held
      to the 3D models by a render-3d test), and groups each machine's hire pads beside it.
10. **Goal building id.** The prototype's "Lodge" and "Trading Post" are the same
    function: `struct.landmark`.
