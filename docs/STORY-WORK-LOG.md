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
| 2026-11-02 | B | `story-l3` | `levels/story/story-L003.json`; `skins/src/mars_greenhouse.ts` (only the `story-L003` cue block and its strings); `client/src/story/*` (additions only) | Level 3 Open for Trade (next) |

`packages/client/release-notes.json` belongs to whoever is pushing at that moment. Rewrite it from scratch for your own push.

## Level status

| Level | Status | Notes |
|---|---|---|
| 1 Cold Start | Account A, live; Doug's sign-off pending | Not edited by B |
| 2 Roll Call | B, live 2026-11-02 | Walls question open (below) |
| 3 Open for Trade | Not started (old-story manifest still live) | |
| 4 Halcyon Works | Not started (old-story manifest still live) | |
| 5 First Watch | Not started (old-story manifest still live) | |

## Open questions for Doug

- **L2 walls (2026-11-02, B).** The tow line only trails beyond a barrier line (`outsideLine` in `sim/systems/barriers.ts`), and `lasso` requires `barrier_lines`. So level 2 has a prebuilt ring around the reactor and ore, with gates east and south-west, as the old level 2 had. Level 1 has no walls, so they appear between the levels with no explanation. The alternative is an opt-in rule ("tow line trails anywhere outside the heat"), which needs an engine bump and a bot change. Kept the ring until Doug decides.

## Notes for Account A

- **Bot, tow loop through a wall (2026-11-02).** `Brain.loopAround` (bots/src/brain.ts) can put loop points inside a barrier ring when a pod sits within about 40 units of the wall. The bot then waits forever at a loop point that isn't `outsideLines`, and every rung times out. L2 avoids it by keeping pods more than 50 units outside the ring. Not fixed, because bots are your area.

## Log

Newest first. Record what changed, which shared files were touched and why, rules and engine changes, and anything left open.

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
