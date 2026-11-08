# Story levels 2–5: shared work log

Two Claude accounts push to this repo. **Read this file before you start, and fetch before you push.**

| Who | Works on |
|---|---|
| Account A (built everything up to 2026-11-01) | Level 1, the R5/R6 backlog, generated levels, engine and generator |
| Account B (from 2026-11-02) | Story levels 2–5 (G2–G5 in `docs/STORY-LEVELS-V2-PLAN.md`), one level at a time |

**Open work for every account is in `docs/BACKLOG.md` (from 2026-11-07).** This log keeps claims, hand-offs and the
change log only; put new tasks and open questions for Doug in the backlog, not here.

## Agreed with Doug (2026-11-02)

- **2026-11-03: story round S1 is refined in `docs/archive/BACKLOG-STORY.md`** (owners A/B per item). Films and live scenes were
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
| 2026-11-08 | Bundle 10 rules (Systems) | b10-rules | **ENGINE BUMP 0.23.0** (sim, content, golden, pack repin, release-notes.json): #91 gate fan-out, #92 downed guards. Story and Look pause on the bump until released here. | BACKLOG #91, #92 |
| 2026-11-08 | Look: Bundle 10 #89/#90/#93 | look-bundle10 | `render-3d/src/renderer.ts` (padXray, trader bubble art, ranger/hauler hold poses), `render-3d/src/materials.ts`, `render-3d/src/scene/rigged.ts` (hold-pose grips only), `packages/client/release-notes.json`; no engine bump | Doug's iPhone feedback #89, #90, #93 |

`packages/client/release-notes.json` belongs to whoever is pushing at that moment. Rewrite it from scratch for your own push.

## Level status

| Level | Status | Notes |
|---|---|---|
| 1 Cold Start | Account A, live; Release 1 (S4, S5, S7, S10–S12, KILN header) 2026-11-06; Doug's sign-off pending | Not edited by B |
| 2 Roll Call | B, rebuilt to the approved screenplay 2026-11-03 | Walls kept (Doug, 2026-11-03); all 5 pods incl. the lander pod |
| 3 Open for Trade | B, rebuilt to the approved screenplay 2026-11-03 | Sela first; sell meat is a story step |
| 4 Halcyon Works | B, rebuilt to the approved screenplay 2026-11-03 | crash_log still a text card; wreck distance (S25) open |
| 5 First Watch | B, rebuilt to the approved screenplay 2026-11-03 | Ends on the helmet tow; lieutenant's fall is a text card |

## Decided by Doug

- **L2 walls (2026-11-03): keep the walls.** Levels 2–5 keep the prebuilt camp ring. The tow line only trails beyond a barrier line, and there will be no training-only tow rule. Levels 3–5 carry the ring forward.

## Open questions for Doug

- **Pod count at the crash site (S24, 2026-11-07, asked of Doug, no answer yet).** The screenplay, `empty_bays` and `crash_log` assume five deck pods (the commander's open one plus four sealed: bays 5–8, Vale and three others, empty). The levels show only three (`pod0`–`pod2`) since the 2026-11-06 scatter. Doug's lean: show the missing ones in level 1, outside the opening film's frame, spread toward the back of the ship, so no scene or line changes. Proposal: add two sealed `decor.stasis_pod` + `decor.stasis_glass` pairs (same random tilts, bay 5's lid open in levels 3–5) behind the wreck's far end in `story-L001..5.json`, each checked against the film frame, the game's start view and the Release 3 re-render's placements. Not started: `story-L001.json` is WRAP UP's; Doug to confirm who edits it. If instead only three pods stay, `empty_bays`, `crash_log`, KILN's "bays five to eight" and "Vale and three others" lines and the screenplay need rewording.
- **Release 2/4 items still open (2026-11-07):** unseen in play: S8 (level 3 arrows: kiosk then rockslide), S9's two-pod circle, S22 fireworks on a real win, S23 shovel on the rockslide, and the level 5 `warlord_fall` / `vale_run` scenes (stills only; the raider keeps its helmet on until the drop). Seen: Sela's navy suit (Doug confirmed), S19, S31, S36. Doug to glance at the level 5 scenes on a phone.
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

## Notes for Account B (from A's HUD session, 2026-11-06)

- **Goal templates changed (live).** Story levels use the shared goal templates, so some of your goal text reads differently now (docs/mockups/goal-voices.html, approved by Doug 2026-11-05): `survive` "Hold out until dawn (m:ss)", `rescue_all` "Bring every pod home", `heat_hold` "Keep heat at X% or more for m:ss". Goal lines are now factual and name the real thing (a lowercase name, plural when counted). Humans give the why and KILN gives the how, in full, literal sentences; a goal says only the target and its numbers.
- **Story level 4's `auto` goal needs its own label.** `converters_running` k:3 with `sources: 1` counts the galley plus two staffed sources, which a template can't name; it now reads "Keep 3 jobs running at once for 0:12". Doug wants goals to name the real thing, so please give that objective a `label` in `levels/story/story-L004.json`, e.g. "Keep the galley, the ore run and the greens collector going at once for 0:12".
- **Sela says "on the coast"** (`skins/src/mars_greenhouse.ts` story-L003 cue, "Colony ships have been landing on the coast for years", and the same in docs/STORY-SCREENPLAY.md). Doug, 2026-11-05: the planet has no water, so no coast, sea or rain. Please reword, e.g. "out on the plains" or "at the landing fields".
- **Failing test on main, not from this work:** `packages/generator/test/pack.test.ts` "is pinned to the running engine and content versions" expects `s1-L006` first and gets `s1-L001`. It already failed before A's 2026-11-05 preload push (checked at `ab56b26~1`). It looks related to the pack's level order after the story levels landed; please check whether the test or the pack is out of date.
- **For your own story lines:** KILN is the ship's AI powered by the reactor, never the reactor; "pick up the protein when it falls", not "what it drops"; the game's names are spiked hopper, ore pile, clerk pad, and turret sockets beside each gate.

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

**Resolved (Doug, 2026-11-05).** KILN stands for Knowledge Integration & Logistics Network. Recorded in the screenplay facts and in STORY-LEVELS-V2.md.

**Note for Account A:** level 1's cue where KILN introduces itself ("I'm KILN, the support system of the Halcyon...") could name it in full if Doug wants the full name on screen. B did not touch level 1's cues.
## Hand-off: WRAP UP session (2026-11-07, credits out)

The WRAP UP account owned all story work from 2026-11-06 (Doug: "You own R4") and has released every claim. Pick up here.

**Shipped and verified live:** c5e09f3 crash pods scattered at varied angles, crash-site scrap is the tube `decor.ship_wreck` at scale 2 (5.6 m); a6880ed story taps advance lines (joystick ignores `.story-layer`); 9736a4f KILN coaching tips tappable (`.kiln-tap` had no CSS). Child sessions: Release 2 (a802361, 8982784, da9627c S31 hatch) and Release 4 (afa13d4, a4ec923); plot P1-P6 (d909c46, 4f9b997 engine 0.20.0).

**Level 1 opening film (`crash_open`, Release 3): in progress, nothing player-facing shipped.**
- Plan Doug agreed: cheap stages before any full render. Stage 1 (blocking stills) and stage 2 (animation test) are done; Doug found issues in stage 2 and has not approved a full render.
- Tools (committed): `tools/cinematics/game_set.py` builds the crash site from `story-L001.json` (origin = pod0, metres, x east, y north) and renders Workbench stills; `game_film.py` puts the capture on the game's pod0 and renders the pod sequence (Workbench 360x640), `--stills`, `--top` (debug), `--frames a b`; encode with `encode.py`. `pod_exit.py` gained `NO_STAGGER=1`: get up, step over the rim, drop to the sand, look round (no deck limp); 514 frames + 45 held, 0 flagged at STEP_TURN 90.
- Run: `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/cinematics/game_film.py -- --stills`. The CMU mocap (`tools/cinematics/mocap/`) and `cache/` are not in git: copy them from `fo-wt-handoff/tools/cinematics/`.
- Fitting found: the game pod lies north-south with its glass opening east, so the capture steps out west (toward the reactor); `FLOOR = 0.20` m puts the commander inside the pod and still clears the rim; the capture's 0.65 m jump is absorbed by keying the stage's z while airborne. The commander ends 3.83 m west, 0.49 m south of pod0.
- Stage 2 issues to fix next (WRAP UP's review; ask Doug for his list too): 1 the glass slides/tilts through the commander instead of hinging on its edge (key a hinge, not a location lerp); 2 the open glass blocks the camera at the step-out; 3 the drop to the sand is cut away; 4 the third camera frames mostly black sky; 5 the commander faces away in the look-round instead of toward the light; 6 the final game view crowds them against wreckage; the Workbench preview also draws stray grey lines on the ground (ignore; not in EEVEE).
- Stage 2 redo (2026-11-08, film track): Doug rejected the first fixed stills. Now the glass hinges on the east LONG side and opens widthwise (105 deg; the game's lid0 pose still rolls about the short side, so #48 must also re-pose lid0 to the film's open pose: about +16.5 units east of pod0, lift 17.5, rotated about the pod's long axis), the commander's lowest point is 0.05 m above the sand (sandbox value; pod rims 0.43 m), cameras clear of the glass, one shot through the drop, dusk-grey sky, look-round faces the reactor, and the tube scrap shows moved 100 units west. Stills: Mobile game/film-stage2-stills-v2. Run `game_film.py -- --stills`.
- Level edits held for when the film ships (not pushed, since the hand-off must match the film): crash-site `scrap` x minus 100 units in story-L001..005 (L1 469.4 to 369.4; L2-5 359.4 to 259.4), and L1 `start` to [451.7, 138.9] (the film's end spot). Then bump `FILM_VERSIONS.crash_open`, check `openZoom.film` lands on the last frame, re-render shots 2-3 (impact, wreck at dawn) from the new set, and do the full render cheaply (set as one plate, commander alone on a holdout layer with a render region, composite).

**Open questions for Doug:** moved to `docs/BACKLOG.md` (2026-11-07). Level 1 sign-off was dropped, `empty_bays` is #1, the pod count was decided (#3: five pods), and the ranger pad rule and s1-L065 were decided (#7, #8).

## Log

Newest first. Record what changed, which shared files were touched and why, rules and engine changes, and anything left open.
- **2026-11-08, Bundle 3 (Opus), BACKLOG #4/#13, #3, #5, #14.** No engine bump, no sim change.
  - **#14 (S43):** level 3's ring is no longer prebuilt. Its third star is now `walls` (`perimeter_before_wave1`, label "Build the camp wall"); with no waves it completes once every section stands. The rockslide (`clear`) is a story step (`until: zone_cleared`, no star). Cues: after the first sale, KILN gives two lines (the long nights and the raiders a road brings, then how to build). The goal card reads "Build the camp wall (8)". The old first-sale beat (hub, meat trader, slide) now fires when the wall is done. `levels:check --pack levels/story`: every rung builds the wall (perimeter 6/6), 5/5 clean. Levels 4–5 keep their prebuilt rings. The story owner should re-check levels 3–5 in play.
  - **#4 / #13 (S40):** KILN's cloud keeps level 5's on-screen size in every level. New `client/src/story/kiln.ts` scales `size`, `right` and `up` of every `spiritFollow` by the ground width on screen (`viewWFor(family)` over the camera zoom) against defend's 300. Height stays at the head. Levels 1–4 come out at 57% of the old size, about 1.2 m from the head. No skin data changed. On regular levels the cloud now blooms and floats beside the commander, at the same scaling, while KILN's coaching lines show (`KilnCloud`, passed to `KilnIntro`).
  - **#3 (S24):** two sealed pod + glass pairs (`pod3`/`lid3`, `pod4`/`lid4`) at the wreck's east end in `story-L001..5`, shifted with each level's wreck. They are out of the start view and the held start. They may show in `crash_open`'s wide impact and dawn shots, so check them when the film is re-rendered (Bundle 4).
  - **#5 (S41):** Sela's buggy in level 3's world. There is a new story action `{ vehicle, path, seconds, lights }` / `{ vehicleOff }` (`skins/story.ts`, director, stage, contract `vehicle?()`, `render-3d/src/scene/storyprop.ts`). It is built like the film's buggy: 2.64 m, wheels on the `buggy.json` hubs, two headlights at half the film's strength. It drives the road after `sela_arrival` and parks lit, west of the kiosk. An in-level retry that skips `selaIn` doesn't re-park it.
  - **Shared files touched:** `client/src/app.ts` (claimed by the Vale session for its `cinematic()` call only). My edits are elsewhere: the `KilnCloud` in `startKiln`, `groundW`, and the `StoryStage` argument. `render-3d/src/scene/storylights.ts` gets attach/detach. `renderer.ts`, `livescene.ts` and level 5's cues are untouched.
- **2026-11-08 (night), Vale helmet animations: Vale's fall filmed in the level (machinima, Doug).** No engine bump, no level file touched.
  - New story beat `{ fall: { kind, zoom?, pitch?, film? } }` (`skins/src/story.ts`; director: a paused beat like `film`; `app.ts` host; contract `StoryPresentation.fall` / `FallScene`). Level 5's retreat cue now uses `{ fall: { kind: "hostile.boss", film: "warlord_fall" } }`; the live scene plays only if the in-level staging cannot (no swap model or no `fall` clip). It plays every time (it is play, not a film), so `FILM_VERSIONS` is untouched.
  - `renderer.ts` `fallTick`/`fallHelmet`/`fallCamK` (+ `scene/fallstage.ts`): play paused, the fleeing hostile (its `fleeingModels` swap) stands where it was hit and plays `fall` once (`RigState.once`), turned so the clip's run heads off its attack edge (sim `stepFleeing`). A copy of its dropped capture is worn on the head prop (1.2x the grey helmet; it comes out the same size as play's dropped helmet), comes off when the head meets the ground and tumbles to exactly where play draws the dropped helmet (hidden until then). The camera eases in to 1.8x zoom and 18 degrees, follows the hips with a little lag, and eases back to the play camera over the last 1.2 s; floating labels are hidden while it runs. The stage runs on the clips' frame clock. After it, the drawn runner closes on the sim over 1.2 s (`fleeOff`).
  - Checked headless (bot story-L005 to the retreat, frames copied from the game canvas): framing, fall, helmet worn then off and at rest on the dropped-helmet spot, camera back to play. In the pre-dawn light and with the warlord's scrap on the same spot, the resting helmet is hard to pick out. Not checked on an iPhone.
- **2026-11-08 (evening), Vale helmet animations: guards fall when shot down and get up when healed (Doug).** No engine bump, no level file touched.
  - `tools/cinematics/crew_fall_bake.py` (new) cuts the fall Doug approved for Vale into two in-game clips on one crew model: `Crew_Fall` (strike, thrown back, onto the back, 1.3 s) and `Crew_GetUp` (roll onto the front and stand, at 2x Vale's speed per Doug: 2.6 s with a short straighten). The get-up walks the fall's drift back out, so it ends on the spot the fall started; it keeps the capture's natural turn (about 175 degrees) rather than spinning during the roll. Baked for all ten human models (`*_falls.glb` beside each source), but only `role.defender` uses it: guards are the only role left lying where they fell (sim `lyingDown`). The guard model grows 667 to 855 KB (Blender re-export re-samples its old clips).
  - `rigged.ts`: `RigState.down` plays `fall` once and holds its last frame; clearing it plays `getup` once, then the get-up's turn becomes the facing (`takeTurn`) or eases back. `renderer.ts`: a guard that goes `injured` and lying is drawn down on the spot it was hit; once healed it gets up there while the sim already walks it off, then runs (3.2 art m/s) to where the sim has it. No rules change (Doug did not pick the rules-change option; this needs none). Med bay patients keep the old still pose; the player is unchanged.
  - Checked headless: the clips through `Rigged` (fall, lying, get-up, turn back) and a real story-L005 guard knocked down and healed through the dev hooks (renderer state through hit, hold, get-up, idle). Not checked on an iPhone. `tools/eval-pack.test.ts` fails on main (pack s1-081 eval files missing), not from this change.
- **2026-11-08 (later), Vale helmet animations, #6 follow-up: the fall film on the game's own ground (Doug).** No engine bump, no level file touched.
  - Live scenes take an opt-in `look` (contract `LiveLook`, the renderer's new `liveLook()`): the sand colours and level seed, pebble tones, hemisphere and sun light, fog colour and exposure at the moment the film starts. `app.cinematic()` passes it; a scene opts in with `game: true` in `SCENES` (only `warlord_fall` so far).
  - `environment.ts`: the sand noise and colours and the pebble tones moved into shared helpers, and `lookGround()` builds a square of the game's sand and pebbles with the game's ground material for a live scene. Play draws exactly as before.
  - `livescene.ts` `gameSet()`: that ground (110 m each way, scaled from world units), the game's fog (24 to 100 m), its light from the game's sun direction with shadows, and the game's ACES tone mapping and exposure. Without a look (dev tools) the old dawn set still draws. `FILM_VERSIONS.warlord_fall` 4.
  - Checked headless: stills on the look taken from a story-L005 run, and the film played through `__fo.debugCinematic` (the app's own path). Not checked on an iPhone. The cut to play still adds the outpost's buildings, which the film does not stage.
- **2026-11-08, Vale helmet animations, BACKLOG #6 follow-up: Vale's head rig, head and helmet sizes, closing camera (Doug).** No engine bump, no level file touched.
  - Why the body looked squashed (compared with `Raider boss - Animated.glb`): the bodies match in play (legs 0.477 vs 0.475, shoulders 0.90 vs 0.88), and no clip scales a bone. Vale's suit was auto-rigged without a head, so its Head bone sat at the collar tipped about 50 degrees back; the head rode it, looking at the sky and sunk in the collar. Vale's own Running clip tips it 14 degrees further back, where the old warlord's tips 40 degrees forward.
  - `tools/cinematics/vale_rig_fix.py` (new) stands the Head bone up like the old warlord's (local z forward, HeadTop_End and headfront moved with it) and rewrites every clip's Head keys as parent-frame turns at half strength. It writes `Warlord_headless_Vale_Animated_rig.glb`, which `vale_fall_bake.py` now reads; `Vale_Fall` re-baked, `hostile.boss_vale` rebuilt.
  - Sizes (Doug: head and helmet at most 20% bigger than the grey helmet, 0.113 x 0.172 x 0.176 in play): the black helmet is at the cap, 0.136 x 0.193 x 0.178. Its shell is thick, so the head inside is 0.091 x 0.145 (with neck) x 0.133, about 0.8x, the same in play (meshy.json held scale 0.63) and in the scene (`VALE_HEAD` 0.132, `VALE_HELMET` 1.5, `VALE_HELMET_AT` 0.1 so the crown is covered).
  - Closing camera (Doug): over the last 2 s it backs off 3.6x and turns to the game's view (30 degrees down, 45 degrees round). The set's sand is now a disc, so the turn shows no corner on the horizon. `FILM_VERSIONS.warlord_fall` 3.
  - Checked headless: side-by-side stills against the old warlord (idle and running), head close-ups in the scene, the ending at 390x844 and 844x390, and a bot run of story-L005 into play after the film. Preview: `tools/cinematics/out/warlord_fall_preview.mp4`.
- **2026-11-07, Vale helmet animations, BACKLOG #6: the lieutenant's fall, re-staged (Doug).** No engine bump, no level file touched.
  - Motion: Doug picked CMU takes as stick figures (`tools/cinematics/stick.py` beats vfall/vroll/vgetup), then approved the chained preview `tools/cinematics/vale_fall_stick.py` (bullet strike: thrown back, feet off the ground, into 90_18's fall on the back; 111_21 roll at 1.5x; 140_01 get-up at 0.75x cut at 4.0 s; the run eases from 0.75x to full over 1 s). `tools/cinematics/vale_fall_bake.py` retargets it onto Vale's rig and writes `Asset workflow/3D Models/Warlord_headless_Vale_Animated_fall.glb` (its clips plus `Vale_Fall`, meshy.json `clips.fall`).
  - `warlord_fall` (livescene.ts, FILM_VERSIONS 2): Vale comes on firing, one hit, the strike starts the clip; the helmet is worn upright (the item is built lying on its side, neck opening +z: a quarter turn, seated on the neck), comes off when the head lands and rolls clear; head and helmet are turned from the rig's HeadTop_End/headfront bones (the bind-pose turn tipped both 55 degrees). The gun stays in the right hand throughout (`heldInHand`, shared with rigged.ts). Side-on, no close-up; ends on the first strides (7.4 s).
  - In play (opt-in story options, level 5 only): `fleeingModels` draws the warlord that broke off as `hostile.boss_vale` with Vale's head and the minigun (meshy.json `held`), easing into the run (`pace`); `showDropped` draws the helmet where it fell before dawn reveals it to tow. KILN's two lines and the dots come 95 ticks after the fall (Vale off a phone view). `vale_run` (S33) removed; "Vale?" stays after `helmet_reveal`.
  - Checked headless (Playwright, dev server): scene stills at 390x844 and 844x390; a bot run of story-L005 to the retreat: the scene plays, the fleeing warlord is boss_vale with head and gun, clip pace 0.75 to 1, helmet at the fall spot, lines at tick 4770. Seen in the logs: a three.js `isReady` page error from the wall-fade shader warm-up (renderer.ts, compileAsync after `see.dispose()`), not from this change.
- **2026-11-07, story-vale-scrap 3: towed and carried things never fade (Doug).** Captures (pods, the escape pod, crates, the recorder, the helmet) and resources join `NO_FADE` in `renderer.ts`: they may hide the hero, each other and buildings and stay solid. Checked on level 2 (dev server): every pod placed with no fade, the reactor still fades. No engine bump.
- **2026-11-07, story-vale-scrap 2, engine 0.21.0: the helmet lies where the warlord falls; one size for the Scrap 2 tube.** Re-pinned golden, story, s1, s1-051 (not L065), s1-071 and s1-085.'
  - Rule (opt-in): a capture with `heldBy: "boss"` moves to where the first boss breaks off (bossRetreat) or dies, still hidden until its `hiddenUntil`; `checkManifest` wants `hiddenUntil` and a boss in a wave. `story-L005`'s helmet uses it; its manifest `at` (760, 770) is only the fallback if the warlord never breaks off. Tests in `sim/test/story.test.ts`. Story cues find a capture where the sim has it (`entityAt` in `app.ts`), so "They dropped something" and the dots point at the fall spot.'
  - Sizes (Doug): the Scrap 2 tube is 5.6 m everywhere, the size of the first wreck seen in level 1: `decor.ship_wreck` width 5.6 (texture 1024) with the `scale: 2` dropped from the two wrecks in `story-L001..5`, the level 3 salvage pile (already 5.6), and level 2's escape pod (`capture.recruit_container_decoy`, 2.8 to 5.6; Doug accepts the big tow). Border dressing in generated levels draws the wreck at 5.6 too. Scrap 1 stays 9.9 m.'
- **2026-11-07, story-vale-scrap: Doug's new scrap, the burnt escape pod and Vale under the helmet.** No engine bump, no level file touched.'
  - Ship scrap: Doug's new `Ship_Scrap_1.glb` and `Ship_Scrap_2.glb` rebuilt everywhere they are used (`decor.ship_scrap` and the level 1 salvage pile; `decor.ship_wreck` and the level 3 salvage pile), same widths (9.9, 2.8, 5.6 m). The new Scrap 1 is a hull barrel, so at 9.9 m long it now stands 5.3 m tall (was 2.6 m); it is turned 90 degrees (`yaw: 90`) so it lies long east-west inside the level 1 salvage pile's footprint (footprints.test).
  - Level 2's old escape pod (`capture.recruit_container_decoy`) is now Ship_Scrap_2 with the `scorch` tint, 2.8 m long (Doug: the burnt Scrap 2 is the lander's escape pod). It replaces the tinted stasis pod and its hinged glass (S20, S31), so `capture.recruit_container_decoy_glass` and its renderer code are gone. Seen in play on level 2 (dev server, 375x812).
  - S32 `warlord_fall` reworked (Doug): new `hostile.boss_vale` (`Warlord_headless_Vale_Animated.glb`, unwired, scene only) with `item.vale_head`, Vale's head cut from `Commander Bust model.glb` (Doug: that bust is Vale, mislabelled) with a new `crop` option in `tools/build-models.ts`. Vale's head follows the Head bone under the black helmet (`item.lieutenant_helmet`). Timeline: runs in under four hits, falls on its back in slow motion; the helmet comes off on landing and rolls west; the camera closes on Vale's face; it gets up and runs off east; the camera holds on the helmet left where it fell. Every playable warlord keeps the old `hostile.boss`. Without the new models the scene falls back to the old warlord. Stills checked at 1.0, 3.0, 5.4, 7.4, 9.2 and 11.0 s, desktop and 375x812.
  - Open for Doug: the player now sees Vale's face before `helmet_reveal` (the ID card) and "Vale?". (The in-play helmet now lies where the warlord falls: see the engine 0.21.0 entry.)
- **2026-11-07, story-r2-r4, S31 done: the old pod's glass is its own hinged piece.** No engine bump, no level file touched.
  - New model `capture.recruit_container_decoy_glass` (`meshy.json`, `unwired`, from `Stasis Pod Glass.glb`, the same scale as the pod body, `tint: scorch`, 6.6k tris, 352 KB; built alone with `pnpm models:build capture.recruit_container_decoy_glass`). The renderer attaches it to the decoy pod's `lid` on first use (loads on demand) with the hinge on the back long edge (`DECOY_HINGE`), and the lid hangs open at `DECOY_LID` 1.35 rad, opening to 1.9 when the pod releases. Crew pods are unchanged.
  - Seen in play (Chrome, dev server, 430x932, level 2): the scorched glass slab stands up on the pod's back edge; the crew pods stay plain. The earlier note that S31 did not work is superseded.
- **2026-11-07, A (plot P1-P6 chat), engine 0.20.0.** Rules: the warehouse is drop-only for the player (couriers and input collectors still use it); opt-in pad options `requires.orPad` and hire-pad `dropWhen` (the parts works input worker is withdrawn if the belt is built first, unless paid into); opt-in `queue` on `sink.sales_point` (explicit queue squares; the generator bends the line round obstacles); generator adds a ranger (hunter) hire pad on hunting levels that sell the catch, on the bot's plan after hunting by hand. **Story levels re-pinned only** (no layout change): 5/5 replay clean. golden re-pinned; s1 6-60 rebuilt (L012 and L037 failed every retry and keep their 0.19 builds, re-pinned), 55/55 clean; s1-051/071/085 re-pinned (s1-051's s1-L065 was already broken: pinned to content 0.17.0).
- **2026-11-07, story-r2-r4, Release 4: checks for levels 2–5 (data, code and a few looks; no engine bump).** Release 2 is live (8982784; the live bundle carries `warlord_fall`). What I could and could not see in the browser: the game's story lines only advance on real clicks, the Vite server reloads under load, and 0.4-scale shots are too small for a hinge, so most of these are checked in data and code, not in play. None of them is ticked in BACKLOG-STORY except S36.
  - **S24, pod count audit (answer for Doug; no counts changed).** The crash site in every story level has 3 decor pods (`pod0` the commander's, open; `pod1`; `pod2`), after the 2026-11-06 scatter, plus the Halcyon wreck. Their glass: `pod1`'s lid is closed in levels 1–2 and open in levels 3–5 (bay 5 opens after level 2's `empty_bays`); `pod2` stays closed. Level 2 adds 4 towable crew pods and the orange lander pod, so the plain shows 8 pods in level 2 (3 + 4 + 1) and 3 elsewhere. The screenplay says "four sealed in the wreck (bays 5–8), four crew thrown clear, the commander's bay open". Today the plain shows only 3 of the wreck's 5 deck pods, so the audit's answer is: **the count the screenplay talks about is not visible; only 3 decor pods stand at the site.** Doug: show all five (commander's open, bay 5 open after level 2, three sealed) or keep three and change the screenplay's wording? I changed nothing.
  - **S9** (one loop around level 2 goal 2's pair): the pair are pods 1 and 2, 63 units apart; `towGroup` groups pods within 110 units, so they share one loop. Pod 0 is 175 away, not grouped. Seen in play: the "Walk a loop around the pod" prompt and arrows for a single pod; the two-pod circle not seen.
  - **S8, S19, S23, S22, S6, old pod hatch (S31), Sela's navy suit:** not seen in play. S22: `fx.fireworks` is wired on `level_end` with `won` in `renderer.ts` (every level); no win played. S19: the recorder is at (470,150) in the hull break, `hiddenUntil: auto`, drawn on open sand (S26). S6: only Rhee's walk and now Okafor's (level 2, `walk` to (352,330) on his line, then back); the rest of the screenplay's stage notes (Rhee kneeling beside Pip, hires walking to posts in level 4, the commander picking up the helmet) are sim or arrow behaviour or still unlisted.
  - **S36:** no text card stands in for a scene any more (the only `card` left is the 2 s black beat after "Eleven… years?" in level 3). Ticked.
  - **Follow-up checks in play (2026-11-07, Chrome at 430x932, my dev server):**
    - **S31 does NOT work yet (correction).** The orange pod looks the same as the crew pods. The scene graph shows the decoy's `lid` group rotated -1.35 rad but with no children: the S20 GLB (`Stasis Pod.glb`) has its glass baked into the body, so nothing hinges. To do S31 properly the decoy needs a body without glass plus a separate glass on a hinge: build the decoy from `Stasis Pod (crash film).glb` (`decor.stasis_pod`) and `Stasis Pod Glass (crash film).glb` (`decor.stasis_glass`) with the scorch tint, scaled to the playable pod, and parent the glass to `lid` with livescene's hinge offsets (hinge (0,0.1,0.71), glass z -0.709, in the film pod's frame). That is a model build plus a visual loop, so I left it for a session with a window; the `DECOY_LID` code is harmless until then. S31 stays open.
    - **Sela's suit (level 3): seen.** Customer 0 is a dark navy figure, clearly different from customer 1's standard trader.
    - **S19 (level 4): seen.** With the recorder forced to `idle` (it is hidden until the three jobs run), it stands on open sand beside the hull break at (678,148), with its pointer prompt and ring, readable at phone size.
    - **S8, S23, S22, S9 (two-pod circle):** not seen. Level 3's story gates the sim, and a forced pad payment landed during my wait (clear0 shows `done`) without a frame I could judge. Level 3's arrows pointed at the greens collector hire pad while the goal read "Sell Sela some greens", which looks right but is not the kiosk-then-rockslide order.
  - **Open for Doug:** a look at level 2's orange pod hatch, Sela's suit in level 3 play and the new level 5 scenes on a phone, since my checks were stills and data.
- **2026-11-07, story-r2-r4, Release 2: scene code (S31, S32, S33, Sela's model).** No engine bump.
  - **S32 `warlord_fall`** (live scene, `livescene.ts`, dawn set, side-on camera): the warlord runs in, is hit, falls on its back in slow motion, lies a beat, gets up slowly and runs off east at full speed; the helmet (`item.lieutenant_helmet`) drops as it passes its spot and bounces. Plays on the `retreated` event in place of the text card. Rough blocking in code (the raider's own run clip, procedural fall), judged from 0.4-scale stills at 2.6 s, 5.3 s, 7.8 s and 8.4 s. Not polished: the raider keeps its helmet on its head until the drop.
  - **S33 `vale_run`**: after `helmet_reveal`, the commander runs two steps toward the screen, helmet held in front, and stops; then the line "Vale?" is the last line. Stills at 1.3 s and 3.0 s.
  - `client/src/cinematics.ts`: only `LiveId`, `LIVE` and `FILM_VERSIONS` gained the two ids (WRAP UP was asked first).
  - **S31**: the old orange pod's hatch hangs open on its hinge (`DECOY_LID` 1.35 rad in `renderer.ts`, opening further when it releases); the glass is already the scorched S20 model. Not seen in play: I could not get the level camera onto the pod from a script.
  - **Sela in play**: new skin level option `customerModels` (story level 3: customer 0 is `unit.customer_sela`); `StoryPresentation.customerModel()`, the renderer loads the model on first use and falls back to the shared trader until it lands.
  - **Gate check (object sizes step 3)**: every gated wall section in levels 2–5 is 125 or 135 units; the gate is 113.4 (4.05 m). The renderer already fills the remainder with wall runs either side, so it meets its walls by construction. No change.
- **2026-11-06, WRAP UP, story taps work again (lines no longer stick).** No engine bump.
  - `client/src/input.ts`: the joystick's pointerdown took pointer capture on the stage even when the press started on the story tap layer (`.story-tap`), so the click was retargeted to the stage and a waiting line never advanced (level 1 stuck on "What happened? Where's the rest of my crew?"). The joystick now ignores presses inside `.story-layer`, as it already did for overlays, buttons and the HUD. Checked: real taps advance level 1's lines and goal card; the joystick still walks the hero once no tap is pending.
  - The `checkMaterialsReady` / 'isReady' console error seen alongside is three.js's `compileAsync` warm-up timer, not the cause; still there, harmless.
- **2026-11-06, WRAP UP, crash pods scattered; tube scrap at the crash site (Doug).** No engine bump, decor only.
  - Took over B's story claim (Doug: "You own R4"). Doug's calls this day: buggy size from the sandbox approved (sign-off 3); films stay on (`REPLAY_FILMS` true, indefinitely).
  - `levels/story/story-L00{1..5}.json`: the three crash pods no longer sit in a line (Doug: a crash wouldn't leave them like that). pod0 (the commander's, the start and the openZoom target) stays; pod1 moves to pod0 + (59, -47) at yaw -58, pod2 to pod0 + (105, 39) at yaw -125. Each glass moves with its pod, with the relayout.ts glass offset turned by the pod's yaw (open lids keep their roll).
  - The two crash-site `decor.ship_scrap` pieces (the winged "plane" scrap) become `decor.ship_wreck` (the tube, Ship_Scrap_2.glb) at scale 2, i.e. 5.6 m like the playable tube salvage pile; `scrap` moved 80 units west, clear of the pods. Supersedes object-sizes step 1 for these pieces.
  - The Release 3 film re-render must use these placements.
  - Found, not fixed: level 1 stops on the commander's first line (tapping does nothing) with `TypeError: ... reading 'isReady'` in three's `checkMaterialsReady`; same on the live site before this change.
- **2026-11-06, A, Release 1: level 1 catch-up (S4, S5, S7, S10, S11, S12, KILN boot header).** No engine bump.
  d898a02 had already moved the ore past the reactor and set the fill to 45 s. `story-L001.json`: the storm warns at
  25 s and starts at 45 s from lighting (was 20/25), ending at 75, so "A storm is coming" plays before it and the ridge
  line after the fill. Bots only chase the fill star under a pending storm, so this keeps it: fuel_full 6/6 seeds,
  human-view 3 stars, refMin 0.77 (was 5/6, 2.8, 0.74).
  - **L1 cues** (`mars_greenhouse.ts` story-L001, rewritten to screenplay draft 4): no red light until mid-storm (the
    start ridge pulse and the S30 ridge look are gone; the ridge's slow pulse starts with the storm flash). After the
    first line: one bright white edge pulse from the reactor's side, then its soft glow with a pointer in it, "That
    light. Someone's out there.", and the step "Reach the light" (`until` near the core). The reactor's lights come on
    only when it is found. KILN's three intro lines, then "Fill the reactor in 45 s"; after the fill, the pods, Vale
    and the storm lines, then "Keep the reactor burning". `goalCards: true` (S5); `noGuide` dropped (S7); `retry`
    and `name` no longer hidden (S10); KILN cloud as L2–5, size 1.1, glow 0.6 (S4).
  - **KILN's name:** its first readout heads `K.I.L.N. · KNOWLEDGE INTEGRATION AND LOGISTICS NETWORK · BATTERY 2%`,
    its first after the fill `K.I.L.N. · REACTOR ONLINE`. Stage note added in the screenplay.
  - **Shared story client (additive, off by default; B's lines untouched):** line action `head` (a status row in the
    terminal readout; `DialogueLine.head`, view.ts, story.css); `edgeGlow.arrow` (a pointer inside the edge glow,
    stage.ts, story.css); `{ guide: true, to }` sends the floor arrows straight to a place with no coach marks until
    the next guide action (director `world.guideTo`, read in app.ts `updateCoach`; L1 uses it so the arrows lead to
    the light, not past it to the ore); a run from `retryFrom` gives `until` steps no goal card (only L1 has
    `retryFrom`). "Reach the light" and the reactor's lights trigger at 90 units, so the reactor is on screen.
  - **Open for Doug:** the KILN line "The four pods here on the deck…" (screenplay) now plays over a site with two
    sealed pods and no deck (d898a02's layout).
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
    helmet fall) go ahead and publish now. `docs/archive/BACKLOG-STORY.md` updated.
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

### 2026-11-05 (B): one size reference

New `render-3d/src/sizes.ts` (`SIZES`, `POD_K`, `POD_CAVITY_M`; export `@fo/render-3d/sizes`). `characters.ts` (`PERSON_M`), `livescene.ts`, the sandbox `layoutmock.ts`, `crashsite.ts` and `arena.ts`, and `tools/relayout.ts` read it instead of repeating 2.66 / 3.9847 / 1.809 / 0.8 / 1.8 / 1.98 / 2.64 / 4.4. No value changed. `client/test/sizes.test.ts` checks the level pods' scale and lift against it. Note: `tools/relayout.ts` is not idempotent (re-running moves level 1-5 placements), so it is not a regenerator; to change a size, edit sizes.ts, then the level numbers, and the test says if they disagree. Not done: building and film scale constants in `buildings.ts`, `units.ts` stay as they are.

### 2026-11-05 (B): why the bay scenes still looked off, and the fix

The pod size and burial already matched after e4f7bb4's predecessor (5a8a731), and `empty_bays` has no people, so the visible difference was the lens: the game camera is 8 degrees (`FOV_DEG`, near flat) while the scenes used 38/58, which blows up the near pod and the people. `livescene.ts` `gameLens()` now gives both bay scenes the game's lens, backing the camera off along its line of sight so the framing holds (far plane 1200). Also fixed the sandbox Crash site (`crashsite.ts`): it started at ship x0.54 / pod x0.80 on top of levels that already carry 27 m / 2.66 m, so it showed a 2.13 m pod; it now starts at x1 (2.66 m, 56% of 1.44 m buried, commander 1.98 m) and matches the game. KILN's full name recorded (screenplay, V2 plan).

### 2026-11-08 (Story, Bundle 10): #86 #87 #88, claim released
No engine bump. KILN (`client/src/story/kiln.ts`): size follows k^0.7 and the ground offset eases to 70% on tight views (L1-4 and regular levels); L5 unchanged. L3: ridges moved 40 north (gap 13 -> 53 to the wall); `levels:check --pack levels/story` L3 still builds the wall 6/6. L5 shows a pre-existing good#5 stall (file untouched). Sela: `sela_arrival` film ends at 6.5 s as she stands by the door; buggy parks at the east entrance (no drive), kiosk route now starts at its door.

### 2026-11-08 (Systems, Bundle 7): engine 0.22.0 landed, claim released

Release 2 combat is in (every call is in docs/DECISIONS.md, "Release 2 combat"). Story and Look can resume. Shared files touched: `render-3d/src/renderer.ts` (the `shot` event case: only a shot with no `by` makes the commander shoot; attackers get a danger-colour bolt; one-line `tow_dropped` floater fix), `skins/src/mars_greenhouse.ts` (removed the `tow_slack` text only). Level files under `levels/story`, `levels/golden` and the packs were re-pinned (versions only). Engine facts a story level can rely on: every attacker shoots (range 40–80 units) and prefers guards and drones to the commander; the commander can be downed; the spawn lane is 50 units off the edge; drones dock between waves; bodies queue at the gate. Level 5's authored waves have not been replayed by Story since this change: please run it once.
