# Story levels 2–5: shared work log

Two Claude accounts push to this repo. **Read this file before you start, and fetch before you push.**

| Who | Works on |
|---|---|
| Account A (built everything up to 2026-11-01) | Level 1, the R5/R6 backlog, generated levels, engine and generator |
| Account B (from 2026-11-02) | Story levels 2–5 (G2–G5 in `docs/STORY-LEVELS-V2-PLAN.md`), one level at a time |

## Agreed with Doug (2026-11-02)

- Levels 2–5 are built one at a time. Each one goes to `main` and is live as soon as it's checked.
- If a rule needed by a story level doesn't fit the existing rules, it becomes an **opt-in manifest option**: off by default, used only by the training levels. Generated levels must keep their results.
- An engine bump is allowed if a story level needs it (re-pin with `levels:repin`, then `levels:check`). **No pack regeneration.** Before a bump, claim it below, fetch, and push straight after, to keep the window short.
- Account B builds on level 1 as it stands and does not edit level 1's files or cues. Where shared code (director, view, stage, story lights, cloud) needs new behaviour, Account B adds an option or a new cue action and leaves the existing defaults alone.
- Account B works in `fo-wt-story-lN` worktrees off `origin/main` and never touches the `farthest-outpost` main checkout. That checkout holds Account A's unpushed commits.

## How B spends tokens

- Opus (B's main session): each level's layout, cues, goals and any new opt-in story option. Reads targeted slices, never all of `renderer.ts`.
- Sonnet subagent per level: the browser playthrough with screenshots, and narrow mechanical fixes it finds.
- Haiku: live-deploy check, and checking the log and release notes match what shipped.
- No parallel writers and no pack rebuilds; `levels:check` once per level.

## Claims (files being edited right now)

Add a line when you start editing a shared file. Remove it when your push lands. If someone else has claimed the file, add your edit after their push, or note it here and message Doug.

| Since | Who | Branch | Files | For |
|---|---|---|---|---|

`packages/client/release-notes.json` belongs to whoever is pushing at that moment. Rewrite it from scratch for your own push.

## Level status

| Level | Status | Notes |
|---|---|---|
| 1 Cold Start | Account A, live; Doug's sign-off pending | Not edited by B |
| 2 Roll Call | B, live 2026-11-02 | Walls kept (Doug, 2026-11-03) |
| 3 Open for Trade | B, live 2026-11-02 (Phase 1) | Sela walks in; no buggy, lamp or coin close-up yet |
| 4 Halcyon Works | B, live 2026-11-02 (Phase 1) | Text card for crash_log; one bot change (see log) |
| 5 First Watch | B, live 2026-11-02 (Phase 1) | Helmet film from cues, then Vale's card |

## Decided by Doug

- **L2 walls (2026-11-03): keep the walls.** Levels 2–5 keep the prebuilt camp ring. The tow line only trails beyond a barrier line, and there will be no training-only tow rule. Levels 3–5 carry the ring forward.

## Open questions for Doug

- None open.

## Notes for Account A

- **Bot change you should know about (2026-11-02, B, level 4).** In `bots/src/brain.ts`, the lasso "start" task gets priority 70 instead of 52 or 64. This applies only when the main goal is `crates` and every idle capture left is an item (no pods waiting). Without it, novice and weak bots kept serving at the register for 30 s after the flight recorder appeared, and `levels:check --pack levels/story` failed on stalls. The full pack check is unchanged: s1-L007, the only crates level, gives identical results (refMin 0.60, same stars). A first try (`rescueAll` for crates) cost s1-L007 a star and was reverted.
- **Level 5 test and film changes (2026-11-02).**
  - `client/src/cinematics.ts`: `STORY_CINEMATICS` no longer has `story-L005: afterWin helmet_reveal`. The film now plays from level 5's cues (`{ film: "helmet_reveal" }`), so "Vale?" and Vale's card come after it. It still plays once and is skipped on replays. `client/test/cinematics.test.ts` is updated to match.
  - `client/test/goalhud.test.ts`: the gate-star test used story level 5's `gate_held`, which the new level 5 drops. It now uses s1-L010 (a generated defend level that has it).
- **Test change.** In `bots/test/story-rules.test.ts`, "works a staffed source for converters_running sources" reads story-L004. It now drops the hidden recorder and the `lasso` module before swapping in its own objectives, because the recorder's `hiddenUntil: auto` names an objective that list doesn't have. What it tests is unchanged.
- **Workers don't route through gates.** Residents move in straight lines (`moveAgent`), so a worker whose post is outside a ring sticks on the wall (the same root cause as R5's medic note). Level 4 makes the ring's south section a gate as well (gates 3, 4 and 5).

- **Bot, tow loop through a wall (2026-11-02).** `Brain.loopAround` (bots/src/brain.ts) can put loop points inside a barrier ring when a pod sits within about 40 units of the wall. The bot then waits forever at a loop point that isn't `outsideLines`, and every rung times out. L2 avoids it by keeping pods more than 50 units outside the ring. Not fixed, because bots are your area.

## Log

Newest first. Record what changed, which shared files were touched and why, rules and engine changes, and anything left open.

- **2026-11-02, B, level 5 First Watch (Phase 1).** No engine bump and no rules change. Story levels 2–5 are all in Phase 1 now.
  - `levels/story/story-L005.json` was rewritten on level 4's town (the same map and ring, gates 3, 4 and 5).
    - The galley stands as a `conv.food_processor`. Traders are off (`customers.spawn` 9999), since the kiosk isn't the point tonight.
    - A `struct.barracks` and a turret socket (`turret1`, 8 salvage) stand by the east gate. The training pad (`train`, 5 salvage, repeatable, manual) requires the turret.
    - People: Pip on ore, Rhee `role.medic`, Okafor `role.defender`, and Tam plus two hub newcomers idle to train.
    - Waves: the old level 5's three waves (boss with `bossRetreat` 25), from side `e`, the ridge's screen side.
    - Objectives: `main` waves, `first` waves_survived n:1, `turret` build turret1. The HP and gate stars are dropped, per V2.
  - `levels:check`: every rung wins with 3 stars (refMin 1.00), so it's easy. That's fine for a training level, but it could take more pressure.
  - `skins/src/mars_greenhouse.ts` gains a `story-L005` cue block, speaker `lieutenant` ("RAIDER") and the light preset `preDawn: 0.08`.
    - Light steps up as each wave clears, to sunrise on the retreat.
    - At the win: KILN's line, then `helmet_reveal`, then "Vale?", then the card "Why did you leave me? / BAY 5 · FIRST OFFICER · VALE". This was checked in the browser.
  - Not done in Phase 1: red visors switching on (it's a camera beat with ridge flashes), a faster `run` clip for the retreat, the helmet on the sand with a walk-up, and spawning beyond the screen edge (`defense.spawnY` is default).

- **2026-11-02, B, level 4 Halcyon Works (Phase 1).** No engine bump and no rules change.
  - `levels/story/story-L004.json` was rewritten on level 3's town, which moves 300 south on a taller map (820 x 1300). Level 1's wreck stood off the north edge (y -181); it is now at y 118, reachable east of the ridge.
    - The hub stands as a `struct.landmark`. The rockslide is cleared and field 2 is open.
    - The galley (`conv.food_processor`) pad sits beside the grow dome, and its three staff pads (collector, cook, delivery to the kiosk) share one spot, chained and `manual`.
    - People: Pip on ore; Rhee, Okafor and Tam idle for the three hires. Start credits are 12.
    - The `capture.recorder` is at (470,150) in the hull break, `hiddenUntil: auto`.
    - Objectives: `main` crates n:1; `galleyBuilt` build galley; `auto` converters_running k:3, 12 s, `sources: 1`. Every staffed source counts, Pip's ore included, so k 3 means the galley, the ore run and the dome's collector.
  - `levels:check`: every rung wins. 60 of 60 bot games across 10 seeds have no stalls, and the human-view bot takes about 62–75 s to the goal.
  - `skins/src/mars_greenhouse.ts` gains a `story-L004` cue block and the light preset `morning: 0.7`.
    - The DAY 4,023 card is a `day` card whose sub reads "KILN's clock had stopped at DAY 5." (no strike-through).
    - A wreck light and an edge glow start when the cook is hired. `crash_log` is a text card.
    - World actions (light, spirit, ridge) run when their cue fires, not in line order. So KILN's dim on its line and the ridge flash on "Movement on the ridge" are left out until the director can sequence them.
  - Also: the bot change and the test change in "Notes for Account A".

- **2026-11-02, B, level 3 Open for Trade (Phase 1).** No engine bump and no rules change. Client code untouched.
  - `levels/story/story-L003.json` was rewritten on level 2's map: the same ring, ore and decor, grown south to a road (map 820 x 1000).
    - The level 2 crew start as `people`: Pip and Rhee on ore, Okafor `role.defender`, Tam idle.
    - The kiosk is at (470,800), with traders walking in from the east, and greens field 1 is beside the start.
    - Field 2 sits behind a 10-credit enable pad. The rockslide pocket of hopper flats is east of the road, with a 12-credit clear pad.
    - The hub is `struct.landmark`, price 150. Per V2, there are no hire pads.
    - Objectives are `main` build hub, `first` earn n:1 and `clear` build clear0.
    - Traders are a little faster (spawn 2 s, orders 1–3), so the human-view bot builds the hub in about 150 s.
  - `levels:check`: every rung wins. The bots never take the optional `clear` star, because the hub doesn't require it (V2 says no `requires`), so story-L003 shows "MISS build 0/6", which is reported, not failed.
  - `skins/src/mars_greenhouse.ts` gains a `story-L003` cue block, speaker `sela` and the light preset `dusk: 0.15`. On this curve, 0.4 already reads as daylight.
  - Sela is the first trader to walk in: night falls over 3 s and the camera follows her to the kiosk.
  - Not done in Phase 1: the buggy and headlights, a lamp on Sela, the camera shake on the rockslide, hub windows lighting with the crew walking in, the H coin close-up, and Sela's order bubble changing to meat. The reveal is lines, then a 2 s black card.

- **2026-11-02, B, level 2 Roll Call.** No engine bump, no rules change, no level 1 file touched.
  - `levels/story/story-L002.json` was rewritten to the V2 beats on level 1's map: same reactor spot, ridge, wreck, deck and stasis-pod decor, and ore. A prebuilt ring with two gates (see Open questions). Pods are, in capture-id order, Pip (hauler, ore to the reactor, freeze 160 s), Rhee (ore, 160 s), Okafor (`role.defender`, 160 s), Tam (no job, 110 s) and an orange decoy with no freeze. `core.burn` is 2.6. Objectives are `main` rescue_all, `first` rescue n:1 and `pair` tow_trip n:2. The time and challenge stars were dropped, per V2. `levels:check --pack levels/story` is clean, with 3 stars on every rung.
  - `skins/src/mars_greenhouse.ts` gains a `story-L002` cue block, speakers pip, rhee, okafor and tam, and a `greyDawn: 0.55` light preset. Additions only.
  - `skins/src/story.ts` gains the `StoryLevel` options `podLights` and `tally`, both off by default.
  - `client/src/story/stage.ts` gains the matching wiring. It drives the existing `present.pod()` (glow and beam, dimmed by the freeze timer, orange for a decoy) and `present.tally()` (tow count over the hero). These hooks existed in render-3d but nothing called them.
  - `client/src/story/director.ts`: `level` is no longer private, so the stage can read it. That's the only change there.
  - Phase 1 placeholder: `empty_bays` is a text card ("KILN · BAY CAMERA").
  - After the browser playtest:
    - The tally sits at 48 world units, just over the head (the hero is about 35 units tall on screen), plus 8 for each carried item.
    - Its slots are drawn 1.8 times larger, using a new optional `scale` argument on `present.tally()` / `StoryLights.tally()` (render-3d `contract.ts`, `storypresent.ts`, `storylights.ts`; the default is unchanged).
    - Empty tally slots now use the guide-light colour at 0.45 instead of ink. Ink vanished on dark ground, and nothing else uses the tally.
    - A pod in tow drops its beam, which otherwise stood over the hero.
    - `greyDawn` is 0.2. At 0.55 it read as warm daylight.
- **2026-11-02, B:** Started level 2 on branch `story-l2` from `0c569fa`.
