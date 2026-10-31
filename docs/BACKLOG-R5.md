# Backlog round 5 (agreed with Doug, 2026-10-29)

The ledger for this round. Tick items as they land and are verified live on the Vercel URL; add a
dated note under an item when something changes. Decisions go into DECISIONS.md when they ship.
Item numbers are Doug's original list order (30 and the two scrap items were added later).
Code locations were checked on 2026-10-29 against main at c51c793; re-check before editing.

## Ways of working

- Every R5 session works in its own worktree and merges into main in small pieces. The story
  session ("Story levels 1-5") keeps the main checkout; one session pushes at a time, and the
  pusher owns `packages/client/release-notes.json` for that push.
- Sonnet for narrow fixes, Opus for #4, the guard rules, generator budgets and #21, Haiku for
  checks, release notes and ledger ticks. Briefs point at this file's section, not the spec.
- Prefer deterministic checks: scripts over JSON tables, property tests, `levels:check`, and
  generator constraints instead of playtests.
- One engine bump (0.15.0) and one pack rebuild for all rules items (Sprint 2), held until
  the story levels are stable; any engine change the story session needs folds into it.
- `renderer.ts` is one big file: its items run one after another in a single session.

## Dropped or closed

- #3 walls and rockslides black: resolved (Doug).
- #8 guide arrows from the bots: already so (`client/src/guide.ts:54` runs a bot Brain).
- #18 duplicate of #7. #28 overflow alarm at 10%: moot once #7 lands.
- #15b hopper range: by design. Plain prey is melee-only (40); auto-fire (90) hits hostiles and
  dangerous prey.

## Handed to the story session (pending its answer)

- [x] **#24 goal icon slide.** After each intro goal card, a tap slides its icon into its HUD slot
      before the next card (`client/src/app.ts:791` renderIntro; HUD slots in goalhud.ts).
- [x] **#25 hire after doing it by hand.** The hire pad shows as a locked ghost with "do it by hand
      first" until the job is done manually. The rule already exists (`sim/systems/economy.ts:7-29`);
      try client-only first.

## Sprint 1: renderer and HUD (no engine bump, no rebuild)

Landed 2026-10-29 (branches renderer-sprint1, r5-hud). Light checks only: #31 compared on one ghost
(L009 Galley), and level 2/3 pads still show the level 1 ghost size; #11 thumbnails not opened in the
field guide; #22 dashes sit under the gate defense meter (the waves icon keeps its own pips).
#4 and #16 landed 2026-10-29 (branch r5-occlusion), checked in the browser pane only: phone frame rate
not measured; buildings also fade while the hero is inside them; on an overloaded machine the new
marker sits above the existing full-tray "!".

Renderer session (sequential):
- [x] **#1 carry.** Front-carried items follow the NPC exactly: same yaw as the rig, no
      wobble/lean (`render-3d/src/renderer.ts` backStack ~2048, called ~1930/1968); retune the
      front offset for charScale 1.5. Ideally parent to the chest bone (`rigged.ts:356`).
- [x] **#17 operators face their machine**, whether or not it is working and whether or not the rig
      has a work clip (renderer.ts ~1956, workSpots ~1319).
- [x] **#9 locked grow dome** draws as the blue ghost outline with its pad, like other unbuilt
      things (renderer.ts syncNodes ~1172-1205, ghostable ~1580).
- [x] **#31 ghost size** (added 2026-10-29). Blue unbuilt silhouettes of buildings and machines are
      no longer the same size as the built models since the size and zoom changes; ghosts must use
      the same scale chain as the built model (buildScale, modelScale/alignedScale, Kiosk 1.37 etc.;
      renderer.ts ghostModel/syncGhost ~1591-1631). Do together with #9.
- [x] **#10 sand** colour tied to model brightness so code sand matches the hopper-hole sand.
- [x] **#5 upgrade pad labels** name what they upgrade (renderer.ts ~603-626, skin string).
- [x] **Scrap sizes.** Each scrap piece is one size everywhere: Ship_Scrap_2 is width 2.8 as a
      collectible and 3.2 as decor (`decor.ship_wreck`); unify in meshy.json. Others already match.
- [x] **#30a standing plates one size.** Operator, cashier, queue, pickup and drop-off plates
      all draw at one consistent size: today `fixedPlates` (renderer.ts:1276-1293) uses 45, depot pads
      2 x padRange x 1.1 (~1483), and kiosk plates are part of the scaled model.
- [x] **#19 attack flags** point at where attackers enter the game space: the spawn point
      derived from `state.waves.pending[].side` / `cp.waves[idx].sides` plus `defense.spawnY` and the
      lane (`sim/systems/defense.ts:18` spawnPoint), not a screen edge or the gate. Renderer only.
- [x] **#2 drones.** A level 2 guard hut makes drones (there are no automatic human troops; hired
      guards are the only humans). Add Doug's drone, rotor (4 per drone, spinning) and level 2 guard
      hut models from the 3D models folder; troops render as drones.
- [x] **#4 occlusion fade** (Opus, after the above). Because the camera angle is fixed, give each
      object type a precomputed ground "occlusion shadow" area; an object fades only when the player
      stands inside its area. No raycasts; nothing fades when the player is in front of it. Avoid
      shader recompiles on toggle (renderer.ts fadeUnderPlayer ~890-920).
- [x] **#16 world alerts.** When a top-of-screen alert fires, also mark the object or character at
      risk (in addition to the existing icons; goalhud.ts alertOf ~216, warnArt renderer.ts ~1373).

HUD session (parallel):
- [x] **#13 + #22 waves.** The meter reads "Wave x/y" before and during waves, with one dash per
      wave under the gate meter (`client/src/hud.ts:62-77`).
- [x] **#14 no free settlers.** Standing on a hire pad with no free settler shows "No free settlers"
      at once (hint `no_idle_resident` exists, `sim/systems/pads.ts:63`; show it on arrival).
- [x] **#11 field guide** thumbnails use the current GLBs: await `loadMeshy` before rendering
      (`render-3d/src/thumbs.ts:34`, `client/src/render.ts:86`).

## Sprint 2: rules batch, engine 0.15.0, one rebuild

Landed 2026-10-30 (branch r5-integrate). Doug's additions: medic hire pads sit outside the walls, near a gate, off the road;
no single strike exceeds a guard's full health (a strike may kill a drone; a test holds this); one big hit downs a guard
rather than killing it, and attackers pass over downed guards. Scrap budget: waves grow first, price cuts only for the rest.
A base falling with waves left is a loss. Pack: 42 of 45 levels; L029, L040, L047 failed generation and are dropped, L028
(D 0.50, target 0.71) and L050 (D 0.30, target 0.80) ship well under target, 16 others are off target. Attackers stuck behind
terrain across a lane would never be killed under the leash; generated levels keep lanes clear, hand-made ones must too.
#4 and #16 phone check: no frame rate or lag issues (Doug).

Guards session (Opus):
- [x] **#26 guards.** Hired guards have the commander's health and damage (much stronger than drones).
      At 25% health they stop fighting until healed. The medic heals them where they fell, or they walk
      to the med bay; with neither on the level, or if hit again on the way, they die. Guard injuries
      do not count against "no settlers injured" (`sim/systems/defense.ts:131`, `hunting.ts:56-63`,
      `residents.ts:21-37`, `stats.ts:34`, `objectives.ts:162`). Adds `role.medic` (no sim medic existed).
- [x] **#23 leash.** Guards and drones go no further from the wall than the farthest built turret's
      reach (residents.ts guardStep ~198-215, defense.ts stepTroops ~194-221). Keep today's behaviour
      when there is no turret.

World session (Sonnet):
- [x] **#27 no shooting prey through walls.** Prey shots need a clear line (`barriers.ts`
      firstCrossing) for the player (`player.ts:184-209`) and hunters (`residents.ts:163-180`). Hostiles
      are unchanged: firing over walls at attackers is how defence works.
- [x] **#15a walkable area.** A fixed design setting in content data, not worked out per level: the
      player can walk 1 screen width (current zoom, converted once to world units) past the settlement
      edge in every direction; hopper flats sit within 0.5 screen width of the walls.

Generator session (Opus):
- [x] **#7 drop the overflow goal** (`no_stockpile_overload`): remove it from
      `sequencer/data/sequencer.json:84` and the placeholder (generator build.ts:192); keep the kind in
      the registry so old manifests load.
- [x] **#20 defend levels get no time star** (generator/index.ts:334-358). Replace it with the easiest
      fit from existing kinds, no new sim kind: `hire` {n} (build x guards), `turret_level` {n}, or
      `salvage` {n}. A "task within a deadline" kind would need a new sim kind; avoid unless needed.
- [x] **Defend scrap budget.** Every defend level's attackers drop enough scrap for all upgrades and
      purchases on the level; waves grow if needed. A generator check, not a playtest.
- [x] **#29 storm.** On storm levels, the hauler alone cannot keep the core alive through the storm;
      the core dies before the storm ends unless the player helps. A generator/rater check that a
      no-help run loses; the bots haul during storms.
- [x] **#6 machine upgrade pads.** The core and barracks already have their own upgrade slot; machine
      upgrade pads still share the staff slot (`generator/src/plots.ts:22-24`, build.ts:569-572). Give
      each machine its own upgrade slot beside it.
- [x] **#30b standing spots at the ends.** Pickup/drop-off spots sit at the machine ends, not deep
      inside (plots.ts:138-158 pickup y; food processor pickupOffset [37,3] vs front edge 44). Then
      `pnpm plots:build`. Story levels need a review of pad positions and kiosk routes afterwards.

After merge (main session, Opus):
- [x] **#21 cannot win.** End lost when the main goal has failed (`sim/systems/goals.ts:26-41`), plus
      provable dead ends for turret_level, hire and salvage only; show Restart / Keep playing.
- [x] Bump ENGINE/CONTENT_VERSION, `levels:build` (background), `levels:check`, fix rejects, repin
      golden + story levels; the story session re-checks levels 1-5; release notes; deploy.

## Sprint 3

Landed 2026-10-30 (branches r5-hire-lock, r5-help). Browser checks only: not on an iPhone, the level log not seen filling in
real play, the sheet not opened mid-raid, #25 checked with the job marked directly. The 2D renderer still hides #25 pads.

- [x] **#12 Help sheet** (bottom middle): level log, current guide step, Restart, and Skip level
      (0 stars, flagged skipped, excluded from tuning; not offered on story levels for now).
