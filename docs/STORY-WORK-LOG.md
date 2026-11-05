# Story levels 2–5: shared work log

Two Claude accounts push to this repo. **Read this file before you start, and fetch before you push.**

| Who | Works on |
|---|---|
| Account A (built everything up to 2026-11-01) | Level 1, the R5/R6 backlog, generated levels, engine and generator |
| Account B (from 2026-11-02) | Story levels 2–5 (G2–G5 in `docs/STORY-LEVELS-V2-PLAN.md`), one level at a time |

## Agreed with Doug (2026-11-02)

- **2026-11-03: story round S1 is refined in `docs/BACKLOG-STORY.md`** (owners A/B per item). Films and live scenes were
  on hold until its screenplay (S1) and staging settled; **Doug lifted the hold on 2026-11-04.** `empty_bays` stays live as is, and sign-offs 2 and 3 are parked.

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
| 2026-11-03 | B | `story-p2` | `levels/story/story-L00{2..5}.json`; `skins/src/story.ts`; `skins/src/mars_greenhouse.ts` (story-L002..005 cue blocks); `client/src/story/*`; `client/src/app.ts` (live-scene hook only) | Levels 2–5: finish Phase 1, then the Phase 2 scene player and `empty_bays` |

`packages/client/release-notes.json` belongs to whoever is pushing at that moment. Rewrite it from scratch for your own push.

## Level status

| Level | Status | Notes |
|---|---|---|
| 1 Cold Start | Account A, live; Doug's sign-off pending | Not edited by B |
| 2 Roll Call | B, rebuilt to the approved screenplay 2026-11-03 | Walls kept (Doug, 2026-11-03); all 5 pods incl. the lander pod |
| 3 Open for Trade | B, rebuilt to the approved screenplay 2026-11-03 | Sela first; sell meat is a story step |
| 4 Halcyon Works | B, rebuilt to the approved screenplay 2026-11-03 | crash_log still a text card; wreck distance (S25) open |
| 5 First Watch | B, rebuilt to the approved screenplay 2026-11-03 | Ends on the helmet tow; lieutenant's fall is a text card |

## Decided by Doug

- **L2 walls (2026-11-03): keep the walls.** Levels 2–5 keep the prebuilt camp ring. The tow line only trails beyond a barrier line, and there will be no training-only tow rule. Levels 3–5 carry the ring forward.

## Open questions for Doug

- **Blocked on Account A's claims:** the old pod's hinged orange glass in level 2 needs `renderer.ts`, which is claimed for R6.
- **Sign-off 2, `empty_bays` (2026-11-03).** Is the live bay-camera scene at the end of level 2 good enough against the films? The plan only builds the other live scenes (`crash_log`, Sela's reveal, the helmet fall) if it is.
- **Sela's buggy size (Doug, 2026-11-05): signed off at 2.64 m long (the 4.4 m build x 0.6).** Live in `selaArrival`.
- **Sign-off 3, reduced buggy (2026-11-03).** Branch `story-buggy` (not merged) holds `decor.buggy` (39.9k tris, 2.5 MB, slightly over the 2 MB target) and two wheels (3k tris each, one pre-mirrored), plus `render-3d/src/assets/buggy.json` with hub positions (radius 0.72, hubs at x -1.60 and +1.29, y 0.225, z ±1.0).
  - The body is sized to 4.4 m wide, which is my choice since the plan gave no size. Please confirm.
  - `tools/build-models.ts` gains per-entry `normalMap` and `mirror` options (additive; no other model's output changes).
  - Comparison render: the scratchpad image `buggy_compare.png` (shown to Doug in chat).
  - Wiring it into level 3, with headlights and the drive to the kiosk, is held until Doug signs off.

## Notes for Account A

- **Doug, 2026-11-03: level 1 S11 and S12 are yours and still open.** He asked again for the ore to sit much farther out, off screen even from the reactor (today it is 70–155 units from it), plus the rest of S11 (no red light, white pulse and edge pointer, reactor light off until found) and S12 (the new lines). B left them for you. Moving the ore will need the fill timer and ore count re-tuned.
- **Bot change you should know about (2026-11-02, B, level 4).** In `bots/src/brain.ts`, the lasso "start" task gets priority 70 instead of 52 or 64. This applies only when the main goal is `crates` and every idle capture left is an item (no pods waiting). Without it, novice and weak bots kept serving at the register for 30 s after the flight recorder appeared, and `levels:check --pack levels/story` failed on stalls. The full pack check is unchanged: s1-L007, the only crates level, gives identical results (refMin 0.60, same stars). A first try (`rescueAll` for crates) cost s1-L007 a star and was reverted.
- **Level 5 test and film changes (2026-11-02).**
  - `client/src/cinematics.ts`: `STORY_CINEMATICS` no longer has `story-L005: afterWin helmet_reveal`. The film now plays from level 5's cues (`{ film: "helmet_reveal" }`), so "Vale?" and Vale's card come after it. It still plays once and is skipped on replays. `client/test/cinematics.test.ts` is updated to match.
  - `client/test/goalhud.test.ts`: the gate-star test used story level 5's `gate_held`, which the new level 5 drops. It now uses s1-L010 (a generated defend level that has it).
- **Test change.** In `bots/test/story-rules.test.ts`, "works a staffed source for converters_running sources" reads story-L004. It now drops the hidden recorder and the `lasso` module before swapping in its own objectives, because the recorder's `hiddenUntil: auto` names an objective that list doesn't have. What it tests is unchanged.
- **Workers don't route through gates.** Residents move in straight lines (`moveAgent`), so a worker whose post is outside a ring sticks on the wall (the same root cause as R5's medic note). Level 4 makes the ring's south section a gate as well (gates 3, 4 and 5).

- **Bot, tow loop through a wall (2026-11-02).** `Brain.loopAround` (bots/src/brain.ts) can put loop points inside a barrier ring when a pod sits within about 40 units of the wall. The bot then waits forever at a loop point that isn't `outsideLines`, and every rung times out. L2 avoids it by keeping pods more than 50 units outside the ring. Not fixed, because bots are your area.

## Hand-off: films, live scenes and the crash-site re-layout (B, 2026-11-04 evening)

Budget is nearly spent, so this section is the starting point for whichever account picks this up. Everything listed
as done is on `main` and verified deployed; nothing is waiting uncommitted.

**Done and live.** `REPLAY_FILMS` (cinematics.ts: every story film and scene plays on every play while they're being
edited; set false to go back to once per version). Live scenes in `render-3d/src/scene/livescene.ts`: `empty_bays` (L2),
`crash_log` (L4), `sela_arrival` (L3, buggy 2.64 m, Sela in `unit.customer_sela` navy, natural climb-out) and
`chip_handoff` (L3). `helmet_reveal` v2 (L5 video with the H mark and Vale's ID). L1 S30 in-game. Doug's 16 notes
(see the entries below). Sandbox tools: Crash site (sizes, pod height) and Layout mock (drag the whole site, phone
footprints, Copy settings).

**Decided, not applied: the crash-site re-layout (docs/SCALE.md).** Ship 27 m long; decor pods 2.66 m long, 1.44 m tall,
base 0.80 m in the sand; no concrete pad; layout per Doug's sketch (pods on the ship's south side where L1 opens, the
settlement 1-2 phone screens south-west, the ridge as a visible landform along the east edge, the recorder at the
ship's east end). The playable towable pods keep their size. Steps:
1. Doug arranges the site in the sandbox Layout mock and pastes its Copy settings.
2. Apply it to levels 1-5 (`levels/story/story-L00{1..5}.json` decor: wreck `scale`, pods/lids `scale` and `lift`,
   delete the `deck`, `deck2` and `stripe` plates; move `core`, the town and `recorder`; a ridge landform). Today's
   placements came from the film via `tools/handoff.ts`; the game now leads, so write the placements directly (or
   invert handoff.ts). Re-run `pnpm levels:check --pack levels/story`. The live scenes' pods (`LIFT` in livescene.ts)
   use the 3.98 m build; scale them to 2.66 m with the same cavity maths as `layoutmock.ts` (frame y = (1.809 * k - 0.8) m).
3. Re-render `crash_open` from the impact onward with the set built from the game's placements. Doug wants rendering
   kept cheap: render the set once as a background plate, then only the commander on a holdout view layer with a
   per-frame render region, and composite. Then `openZoom` in L1 must still land on the film's last frame; Doug said
   the hero must NOT grow at the hand-off (drop `openZoom.hero`).
4. The old night re-render of shot 4 in `fo-wt-handoff/tools/cinematics/out/crash_pod` (started from another session)
   is superseded by step 3; it can be stopped and discarded.

**Waiting on Account A's `renderer.ts` (released 2026-11-05).** The L5 warlord's fall (S32: slow-motion fall, gets up,
runs, the helmet visibly drops as it passes its spot, then S33 "Vale?" as the commander runs two steps), the old pod's
hinged glass in L2 (S31), and drawing Sela in-game with her own `unit.customer_sela` model.

**Waiting on Doug.** What KILN stands for: not found in any doc or git history (it is only "the Halcyon's reactor
caretaker program", from storyline option A); Doug may ask the session that wrote the first storyline.
## Log

Newest first. Record what changed, which shared files were touched and why, rules and engine changes, and anything left open.
- **2026-11-05, story summary refreshed (docs only).** The 100-word summary at the top of `docs/STORY-LEVELS-V2.md` now matches screenplay draft 4: the lander's escape pod (not another ship's), bays 5–8 reading occupied with Vale's empty, and the raiders' leader dropping Vale's helmet. No code, level or release-notes change.
- **2026-11-04, B, Doug's crash-site sizes (decided, not applied yet).** Ship 27 m long, pods 3.98 m long and 2.15 m tall,
  pod base 1.36 m below the sand (63% buried), no concrete pad; the layout follows his sketch (settlement to the
  south-west, the ridge as the eastern edge, the recorder at the ship's east end). New `docs/SCALE.md` holds every
  size in real metres. Next: re-lay levels 1-5 from it, then re-render the opening film from the impact onward with
  the set built from the game's placements.
- **2026-11-04, B, Doug's notes (second batch): Sela's suit, her climb out, the chip handoff.** No engine bump.
  - `unit.customer_sela`: the trader model with a new `tint: "navy"` (build-models: pale neutral texels to a navy ramp,
    skin and trim kept; characters now take a tint too). `unwired`: live scenes only. In-game Sela still uses the
    shared trader model until the renderer can draw a named trader with its own model (A's renderer.ts).
  - `sela_arrival`: she climbs out in one movement: each bone slerps from the seated pose to the standing one while
    her hips arc up over the side and down beside the door, turning to the door and then toward camp.
  - `chip_handoff` (6.4 s, film look) replaces L3's coin-on-black card: by the kiosk's lamp Sela holds the chip out on
    her palm, the commander reaches and takes it, lifts it palm-up, and the camera closes on its stamped H.
- **2026-11-04, B, Doug's notes on levels 1-5 (first batch).** No engine bump; story pack replays clean (L4/L5 3 stars).
  - **Sandbox "Crash site"** (`client/src/dev/crashsite.ts`, button on sandbox.html): L1's wreck, deck, the open pod0 and
    the commander lying prone on it at game sizes, with ship/pod/commander sliders. Today: ship 50 m long, pod 3.32 m,
    commander 1.98 m, ratio 25 (the film's is ~53: its ship is twice as big against the commander).
  - **Director (shared story client):** two triggers: `{ hostile, r, at?, fleeing? }` (a hostile of that type near the
    player or a place) and `{ who, r, at }` (a cast member near a place); cast `{ customer: n }` (the n-th trader, ids
    from 0 in arrival order; at the kiosk once gone).
  - **L3:** Sela is `{ customer: 0 }` and her lines wait until she is within 150 of the kiosk (she gets there ~2.5 s after
    arriving; checked in the sim), so her bubbles are hers and on screen.
  - **L4:** KILN says how it reset its clock (the stars and Sela's clock), then the DAY 4,023 card. A fourth newcomer and a
    `cashier` hire pad (role.cashier at the kiosk, chained after `server`); the training step ends on it. **L5** starts
    with that cashier at the kiosk, so the guide arrows no longer send the player to serve there.
  - **L5:** turret pad/site 196 units (7 m) east; "You should have stayed asleep" fires when the warlord is within 330 of
    the commander, not on spawn; "They dropped something" fires as the fleeing warlord passes within 200 of the helmet
    (it flees straight east on its row), with the helmet's dots as a fallback 5 s after dawn. The visible drop waits for
    the warlord's fall (renderer).
  - **L2 `empty_bays`:** the inset's ID card keeps its proportions (it was capped by height at a fixed width).
- **2026-11-04, B, `sela_arrival` live scene (level 3) and `helmet_reveal` v2.** No engine bump.
  - `livescene.ts` `selaArrival` (8.6 s, a film look: new `film` flag drops the feed filter, scanlines and REC): night
    road, the buggy at Doug's 2.64 m (the 4.4 m build scaled 0.6, wheels on `buggy.json`'s hubs, rolling by distance,
    two headlights) drives in and parks; Sela (`unit.customer`, posed seated by bone aims) climbs out with a warm lamp
    and walks toward camp. Level 3's Sela cue plays `{ film: "sela_arrival" }` after the light turns to night, then
    the existing camera follow and lines. Checked in portrait by held frames.
  - `helmet_reveal` re-rendered (`tools/cinematics/helmet.py`): the Halcyon H shows on the shell where the paint is
    scratched away, and it ends on Vale's ID card (VALE, FIRST OFFICER · BAY 5, readable ~1.7 s). 5.0 s, 731 KB;
    `FILM_VERSIONS.helmet_reveal` 2.
- **2026-11-04, B, `crash_log` live scene (level 4).** No engine bump. `livescene.ts` gains `crashLog` beside `empty_bays`
  (same deck and bays, 10.5 s): FOUR MINUTES TO IMPACT, the four pods unseal and their glass lifts, four crew in the
  commander's suit (`unit.player`, own skeleton, walk clip on a mixer) sit up and step into the aisles, the glass closes
  and the lights turn OCCUPIED, the four walk away from the camera, static. `cinematics.ts` registers it as a live id
  (version 1); level 4's text card becomes `{ film: "crash_log" }`; the skin holds its words. Checked in portrait by
  held frames (all four bays in view). Doug's buggy size from the Scale tab is 2.64 m (958308e).

- **2026-11-04, A, real metres; every person 1.8 m (Doug).** No engine bump, no story file touched. 1 m = `ART_M`
  (28) world units everywhere (DECISIONS.md), which is what decor `width` already uses, so the buggy's and the wreck's
  metres are real metres. Every person now stands 1.8 m like the commander (workers, guards, raiders and traders grew
  about 9%), the warlord 2.7 m (`render-3d/src/assets/characters.ts` look scales). **B:** story levels' people are
  9% taller beside the set; check the film-matched shots if any frame a non-commander person against the set.
  Then Doug's Scale tab: commander and ranger 1.98 m (the commander grew 10% beside the set), mites x0.9, drones x0.7;
  the sandbox buggy starts at 0.6 (2.64 m long), Doug's pick.
- **2026-11-04, B, S30 played live in level 1; bay-camera pods on the deck (Doug).** No engine bump. **A: level 1's cue
  block changed** (S30 was unclaimed; Doug: "do it here").
  - S30 runs in game rather than in the film, since level 1 now opens on the film's exact last frame. `openZoom.hold`
    0.5, then cue `looked` (100 ticks after `woke`, ordered): ridge flash ×2 with a short camera move toward the ridge
    (share 0.3, zoom 0.85), a white edge flash from the reactor's side (size 140, full strength, 0.7 s), arrows on, then
    "Wait, what's that light over there?". The reactor's edge glow now starts with the flash, not at start, and the
    600-tick arrow fallback is gone (the arrows come on in the intro). S11's other parts (ore farther out) are still A's.
  - `livescene.ts` `empty_bays`: bays lifted 1.809 so the pod cradles stand on the deck; labels and camera move with them.
- **2026-11-04, B, the level 1 hand-off pushed (Doug: yes).** Commit "Level 1 opens on crash_open's last frame" (logged
  below under 2026-11-03) is on `main` now, cherry-picked from `story-handoff`. **Not yet in:** the night re-render of
  shot 4. It is still rendering in `fo-wt-handoff/tools/cinematics/out/crash_pod` (frame ~250 of 709 at 09:50). When it
  finishes: encode, copy to `client/src/cinematics/crash_open.mp4` + poster, drop the closing grade, `FILM_VERSIONS.crash_open` 2.
  Until then the game keeps the dawn video with its grade.
- **2026-11-04, B, film hold lifted; story films replay every play (Doug).** No engine bump, no level file touched.
  - Doug: the levels are close enough, so films and live scenes (S30–S33, `crash_log`, Sela's reveal and buggy, the live
    helmet fall) go ahead and publish now. `docs/BACKLOG-STORY.md` updated.
  - `client/src/cinematics.ts`: `REPLAY_FILMS = true` makes `filmDue`/`cinematicFor` ignore the seen record, so
    `crash_open`, `empty_bays` and `helmet_reveal` play on every play (Skip still works). `app.ts` also stops treating a
    cleared story level as a replay while it's on, so camera beats, cards and film cues play again too. Set it false
    to go back to once per version. Tests take an explicit `replay` argument.

- **2026-11-04, B, night on every 4th s1 level (Doug).** No engine bump, no rules change, no story file touched.
  - `packages/generator/data/generator.json` gains `nightEvery: 4`; `applyNightCadence()` in `generator/src/build.ts`
    sets manifest `lighting: "night"` when the level number is a multiple (0 turns it off). `tools/build-levels.ts`
    calls it, so a pack rebuild keeps it; the new `tools/night-pack.ts` stamped the current pack (L008 … L048, 11 levels,
    one added line each). Lighting is renderer only: `levels:check` 45/45 clean, tests pass.
- **2026-11-03, B, the crash site at film scale in L1–5; Doug's L2–5 notes.** Doug asked for the L1 change too. No engine
  bump; story pack (L1 results unchanged), s1 pack and tests clean.
  - **Crash-site scale (L1–5, incl. level 1 at Doug's request).** In the film the wreck is 60 m wide beside a 1.8 m
    commander; in game it was 98.8 art m beside a 1.5 m hero (twice the film's ratio, since the L1 hand-off). The
    whole set (wreck, deck plates, stripe, pods, lids, ore piles, ship scrap) is scaled by 0.506 about the
    commander's pod (pod0): positions about pod0, decor `scale`, deck-plate `size`, and `lift`. L1's `start` is
    unchanged (moving it cost the fill star on 3 of 6 human-view seeds). **A: level 1's file changed** for this.
  - **L4 recorder** re-placed for the new scale: lodged in the hull's south wall at (1110, 365), lands at (1120, 450)
    on open sand with nothing between it and the camera (`drop: { h: 1.6, r: 300, from: [-10, -85] }`).
    "Bring it home" waits until the recorder is out and the commander is near (`near` triggers take `after`); the
    guide arrows go off on the walk east (the dots and the edge glow lead) and back on once it is in tow (they were
    still pointing at the clerk pad). Lines give the reason: the lander pod has four seats.
  - **L3:** Sela says colony ships have landed on the coast for years and nobody comes out this far.
  - **L5:** map 1300 wide so raiders enter from beyond the screen; the guard pad moved out of the ore field to
    (165, 735); the helmet lies in the open on the escape path at (760, 770); its film and "Vale?" play when it is
    caught on the tow line (`captured`), before the walk home; the goal reads "Bring the helmet home"; "every wave
    brings the light closer" is cut.
  - **L2:** `empty_bays` plays as an inset (new `{ inset }` action, `{ wait }` beat; `LiveSceneOptions.inset`;
    `StoryHost.inset`; app.ts wires it), so the crew's lines show beside KILN's camera.
- **2026-11-03, B, Doug's learning-level notes.** No engine bump; story pack, s1 pack and tests clean.
  - **Lines:** no how-to (tow, pick and stock, hunt, train-once, pay on the pad, the bar) and no number targets in KILN's
    lines; the arrows, HUD pointers, pad labels and goal cards carry that. Sela's protein line is Doug's.
  - **L3:** a picker hire pad (`picker`, role.supplier field1 to the kiosk, 9 credits) that opens once the slide is
    clear (`requires: clear0`). Without the gate, bots hired at once and stalled on meat sales; with it they win
    and earn the slide star too. Tam asks to work the fields; KILN ties the second grow dome to it.
  - **Bubbles:** an off-screen speaker's bubble is clamped onto the screen (view.ts). Sela's intro holds the camera at
    the kiosk beside her lines (a `freeze: false` camera beat, 16 s).
  - **R6 (A):** G3 now notes that hunting must fire laser bolts too; new **G9**, order icons instead of coloured dots
    over traders.
- **2026-11-03, B, the ship stays where level 1 has it; the recorder bursts out of the hull (Doug).** Doug: the ship and the
  settlement must keep the same relative positions in L1–5, and L4 must not show fragments where the ship was. So the
  earlier (+600, −300) shift is undone: L2–5's wreck group now matches L1 exactly relative to the reactor (checked
  piece by piece; only bay 5's open lid differs, on purpose).
  - **Recorder (S26).** Manifest capture field `drop: { h, r, from }` (content manifest.ts; renderer only, the sim keeps
    it on the ground at `at`). L4's recorder is drawn lodged in a crack in the hull's south wall (2.6 art m up, at
    (1075, 300)); when the hero comes within 320 it rattles, the crack bursts, and it arcs onto open sand at
    (1000, 600), landing in dust. The landing spot and a 45-unit loop around it are clear of the hull, the fallen
    chunks and the deck plates (checked on a top-down map of the GLB). renderer.ts `captureDrop` / `dropSpec`.
  - L4's map stays 1300 wide. The walk from the reactor is about 780 units, past the deck.
  - **A:** level 1 already has this placement; no change needed for continuity. It does now draw the film's wreck model.
- **2026-11-03, B, portraits, the wreck moved east, small fixes (Doug's items 4–6).** No engine bump; s1 (45) and story
  packs replay clean, every test passes.
  - **Portraits (S3).** `packages/client/public/busts/*.webp` (160 px), rendered from each character's GLB in the
    browser: commander (unit.player), Pip (role.supplier), Rhee (role.medic), Okafor (role.defender), Tam (role.idle),
    Sela (unit.customer), the raider lieutenant (hostile.boss). Speakers carry `bust`; the bubble shows it.
  - **Wreck (S21, S25, S37).** `decor.halcyon_wreck` now builds from the film's `Halcyon_Wreck.glb` (same fit,
    11.7k tris, 1.1 MB). It carries debris chunks south of the hull that the old site model had cleared, and at the
    old placement they landed on the camp. **L2–5 shift the whole wreck group (wreck, deck, deck2, stripe, pod0–4,
    lid0–4) by (+600, −300)**: east on screen and clear of the camp. L4's map is 1300 wide and the recorder lies on
    open sand among the hull fragments at (1080, 380), about 900 units from the reactor.
    (Superseded the same day: L2–5 went back to L1's placement; see the entry above.)
  - **Hub price (S16).** renderer.ts: a big pad's floating name and price stay at most `BIG_LABEL_LIFT` (3.2 art m)
    high, so the landmark's tall blueprint no longer pushes them off screen. Affects every big pad (a bug fix).
  - **Pads (S27).** L4's three hire pads moved from (420,1020), behind the kiosk, to (340,1000); L5's guard pad from
    (300,760), behind the south wall, to (300,730).
  - **KILN (S4).** `spiritFollow.glow` (base brightness, 0–1) through contract/storypresent/corespirit; L2–5 use 0.6.
  - **Not done:** a solid deck needs an invisible blocker (the terrain kinds all draw rocks), and the sand ramp needs
    the renderer to lift the hero; the recorder sits on the sand instead, so neither is needed to finish L4.
- **2026-11-03, B, levels 3–5 rebuilt to the approved screenplay.** No engine bump: the s1 pack (45 levels) and the story
  pack replay clean, and every test passes.
  - **Director.** `StoryGoal.until`: a story step that shows like a goal (card and top line) but has no star slot,
    done when its trigger fires. Manifests allow exactly three objectives, so L3–5's extra goals are steps. Event
    triggers take `count` (the n-th matching event).
  - **Content (opt-in).** New lassoable `capture.helmet` (lassoables.json), a code model `buildHelmet` (scatter.ts,
    registry.ts) and a meshy entry that draws it with the existing `item.lieutenant_helmet` GLB (same file and fit).
    Manifest field `allowExcluded` (training levels only) lifts named module exclusions; story L5 sets
    `["lasso+defense"]` so it can tow the helmet after the last wave.
  - **Orange pod GLB (S20).** `capture.recruit_container.decoy` now has its own GLB, `capture.recruit_container_decoy`,
    built from "Stasis Pod.glb" with a new `tint: "scorch"` in tools/build-models.ts. Only that entry was built.
  - **L3.** Rhee is `role.medic` in `people`. Goals: sell Sela greens, clear the slide, sell meat (step), build the hub.
  - **L4.** `people` are Pip, Rhee (medic), Okafor (defender), Tam and Sela's two drivers (idle, for the three hire
    pads). Goals: build the galley, train all three jobs (step), reach the wreck while the town runs, bring the
    recorder home. The camera looks east to the wreck on KILN's recorder line.
  - **L5.** Objectives: main `crates` (the helmet, `hiddenUntil: hold`), `hold` (waves), `turret`. Steps: stop the
    first raiders, train a guard. The first wave is three raiders (KILN says three). The turret pad moved to
    (620,640), site (650,610), between the raiders' side and the hub (S19c). The ending card "Why did you leave
    me?" is gone; "Vale?" is the last line.
  - **Tests.** goalhud's L5 test finds the waves token instead of assuming it comes first.
  - **Continuity (S24).** Bay 5's lid (`lid4`) is open in L3–5.
  - **Still open:** busts (S3); the wreck farther east with a sand ramp and a solid deck (S25, S26, S37); the film's wreck
    model (S21); pad visibility checks (S27); the hub pad's missing price (S16); KILN's brightness (S4).
- **2026-11-03, B, screenplay approved; level 2 rebuilt to it, with the shared story pieces it needs.** Doug approved
  draft 4 with one change: camera moves are chosen per level, never a generic opening pan (L1 none, so the light stays a
  mystery). No engine bump: `pnpm levels:check` (s1, 45 levels) and the story pack replay clean, and every test passes.
  - **Sim and content (opt-in, no existing level changes).** `rescue_all` takes `decoys: 1` (objectives.ts,
    objectives.json, manifest GoalParams): the empty old pods count toward "all", so story level 2 waits for the lander
    pod. A new event `pod_home` (events.ts, lasso.ts) fires when a towed pod reaches the heat and starts to open, so
    story lines can play while it is still on screen. It changes no state.
  - **Bots (brain.ts, A's area).** When `rescue_all` has `decoys`, bots tow decoys too (`decoysCount()`); otherwise
    unchanged.
  - **Director (shared story client).** New level options `goalCards` (each goal opens as a card mid-screen, after the
    lines already queued, then flies to its slot) and `cast` (speaker key to the hero, a capture's crewmate, a starting
    resident, the boss or a place). New action `{ walk: who, to }`: drawn only, the sim keeps its own position. New
    place `{ last: eventType }`. Speakers gain `tag` and `bust`. `podLights: "glow"` draws pods glowing with no beam.
  - **View.** New dialogue style `bubble` (now the skin default; KILN keeps its terminal): a speech bubble over the
    speaker's head with a tail, kept inside the screen; someone off the map speaks from a bubble low on the screen.
    **This changes level 1's commander lines too** (they were in the strip): A, please check L1 reads well.
  - **Renderer (narrow touches in A's files).** `interp.ts` gains staged movers (`stage`, `stepStaged`) for walks;
    `renderer.ts` passes `this.interp` to StoryPresent and its NO_STORY stub gains `actor`/`actorAt` (two lines);
    `contract.ts` StoryPresentation gains `actor`, `actorAt` and `pod(..., beam?)`.
  - **Level 2.** Rhee joins as `role.medic`, goals are the nearest pod, two at once, then all 5 pods (held until KILN's
    line). Lines per the screenplay; Rhee walks to the scorched pod while it opens.
  - **Open:** busts (S3) are not rendered yet; the orange pod GLB (S20) is being built in this session.
- **2026-11-03, B, Phase 2 starts: live-scene player and `empty_bays`.** Doug's sign-off 2 is pending: live scene against film quality. Per the plan, the other live scenes wait for it.
  - New `render-3d/src/scene/livescene.ts` stages a scene in three.js on its own full-screen canvas, with the game's GLBs. It doesn't touch `renderer.ts`. It's loaded on demand through `loadLiveScene()` in render-3d's index, as a 4 kB chunk that keeps three out of the shell.
  - `client/src/cinematics.ts`: `CinematicId` gains `empty_bays` as a live id (`FILM_VERSIONS` 1), and `playCinematic` hands live ids to the player. `app.ts` passes `skin.story.scenes[id]` (words and images, `SkinStory.scenes` in `skins/src/story.ts`).
  - `empty_bays` (6.2 s) is KILN's bay camera from the ceiling:
    - Four pods read OCCUPIED. Bay 5 turns UNLOCKED at 1.6 s.
    - The name plate (`client/public/scenes/badge_bay5.png` with VALE / FIRST OFFICER from the skin) is up from 1.9 to 4.6 s.
    - The glass swings up on its long-side hinge between 3.2 and 5.0 s, with the camera drifting in on bay 5.
    - The feed look is CSS on the canvas (`story.css`).
  - L2's text card is replaced by `{ film: "empty_bays" }`. Without WebGL, the scene resolves at once and the lines carry on.
  - Checks: staging and motion in wireframe stills first (dev knob `window.__live = { at, wire }`), then brightness on the real materials by pixel means (54–65 of 255). The look itself has not been seen on a phone.

- **2026-11-03, B, Phase 1 finish for levels 3–5.** No engine bump.
  - Director (`skins/src/story.ts`, `client/src/story/director.ts`, `view.ts`, `story.css`) gains two options, both off by default:
    - `ordered: true` on a cue runs its world actions (light, spirit, ridge, dots...) in line order instead of when the cue fires. There's a test for it.
    - `image` on a card shows a skin image above the text.
  - L3: the H coin close-up is a card with `ui/coin.png`, the coin model's own render, before "Halcyon chips?".
  - L4: KILN dims on "I shut down everything..." and the ridge flashes on "Movement on the ridge." (ordered cues).
  - L5: the ridge visors flash as the camera goes to the ridge. `defense.fleeSpeed` is 50 (boss speed 20), so the lieutenant runs off. The run clip for fleeing hostiles was already wired.

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

### 2026-11-05 (B): bay live scenes at the game's sizes

`render-3d/src/scene/livescene.ts` only (no engine bump). `empty_bays` and `crash_log` stood the pods on the deck, so all 1.44 m of pod showed; the game sinks the base 0.80 m, leaving 0.64 m. New `BAY_LIFT = 1.809 * POD_K - 0.8` (same maths as layoutmock.ts) puts the cavity floor 0.41 m above the floor plane and the pod base below it, hidden by the plane. `crash_log` people now use `PERSON_M` (crew 1.8 m, bay 5 / the commander `PERSON_M * 1.1` = 1.98 m). `crash_log` portrait camera pulled in (pos 0, 14.5, 20 m looking at z -3.5) so the four bays and the walk-away still fill the screen; `empty_bays` camera is unchanged (it is relative to the cavity floor). The floor stays the dark deck colour (a bay camera feed), not sand; say if you want sand.
