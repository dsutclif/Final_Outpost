# Backlog

This is the only task list for Farthest Outpost. Every open item lives here, whatever the round, account or
session that raised it. This file replaced `BACKLOG-R4/R5/R6.md`, `BACKLOG-STORY.md` and the open boxes in
`POLISH-PLAN.md` and `RELEASE.md` on 2026-11-07. Those files are now in `docs/archive/`.

**How Doug wants this run (2026-11-07).** One orchestrator session keeps this file, merges, and checks each bundle is live
before the next starts. Each bundle runs in its own fresh session on the cheapest model that fits (Haiku for checks and
mechanical work, Sonnet for narrow builds, Opus for design-heavy work), briefed with item numbers, not chat history.
Bundles ship one at a time. Destructive steps (deleting branches, data, worktrees) are confirmed with Doug first.

**How to use it**
- **Every item has a permanent number** (`#12`). Refer to items by it. Numbers are never reused or renumbered: a
  new item takes the next free number (currently **#85**), whatever section it goes in. Older ids (R6 N2, S24 …)
  stay beside the number, so references in code, commits and the archive still resolve.
- Add new work here as one numbered checkbox, whether it comes from Doug's feedback, a refinement round or a delivery
  plan. Give it an owner where that matters, and a done check. No new `BACKLOG-*` files.
- Work ships in **bundles**, one at a time, in the order below; each bundle ships only after the one before it
  is live and verified. Deferred items stay at the bottom with what they wait for.
- Tick an item when it lands, with one line on what was seen and where (local, live or iPhone). "Done" means
  verified live. Done items move to `docs/archive/DONE.md` under the date, keeping their number.
- Claims, the change log and engine-bump coordination stay in `docs/STORY-WORK-LOG.md`. Decisions go in
  `docs/DECISIONS.md` once they ship.
- Background for an old id is in its archived round file (search the id in `docs/archive/`).

**Terms.** *Animations* means every scripted story beat with character motion: rendered films, machinima, and live
scenes where play pauses while one character's movement plays out (Doug, 2026-11-07).

## In progress

One line per active item: number, who has it, and where. Add the line when work starts; remove it when the item is
ticked or handed back. Story-file claims are also recorded in `docs/STORY-WORK-LOG.md`.

- Bundle 1 (#63, #67, #68–#70, #72, #73, #76): done except Doug deleting the remote branches `look-test`,
  `object-sizes` and `story-buggy` (agents can't run `git push --delete`). Keep `fo-wt-handoff` until #75 backs up its film tools.
- **Three lanes run in parallel (Doug, 2026-11-08), one bundle at a time per lane.** Engine bump freeze: when Bundle 7 claims the bump in the work log, Story and Look finish their current push and pause until it lands.
- Story lane: Bundle 3 live 2026-11-08, ticked; Doug's iPhone checks #83. Next: Bundle 4. Film track: #75 done (zip at `Mobile game/backups/film-tools-mocap-cache-2026-11-08.zip`); #47 stage 2 stills and test clip made (`Mobile game/film-stage2-stills/`); their tool edits (`tools/cinematics/game_film.py`, `game_set.py`, `pod_exit.py`) are UNCOMMITTED in the `farthest-outpost` checkout, waiting for a push; Doug approves the stills; then #48/#49.
- Look lane: Bundle 5 partly live 2026-11-08 (#10 ticked; #41 placement and #52 scenarios open; iPhone checks #84). Next: finish #41/#52, then Bundle 9's renderer parts.
- Systems lane: Bundle 6 landed 2026-11-08 (#43, #16 v0, #9a done; #44 half). `docs/RELEASE-2.md` written. Next: Bundle 7 (Opus, one engine bump), briefed from that doc; then Bundle 8. #81 joins Bundle 7 if it is a rules fix.

## Waiting on Doug

- [ ] **#83 · iPhone checks for Bundle 3 (live site).**
      1. KILN (#4/#13): the cloud beside the commander looks the same size in story levels 1–5 and is still easy to see at the smaller size; on the first regular level that teaches something new (e.g. s1-L006) it floats beside the commander while its lines show.
      2. Level 3 wall (#14): after Sela's first sale KILN asks for the wall; walking the dashed ring raises it a credit a section; the hub beat follows.
      3. Sela's buggy (#5): after her arrival film the buggy drives in and parks beside the kiosk with its lights on, not too glaring.
      4. Pods (#3): the crash site shows five pods (three sealed toward the back of the wreck), none in the level 1 start view.

- [ ] **#2 · iPhone check, title loop.** After two real deploys and a second visit on iPhone Safari: the loop plays (or the dark poster shows), and the old background never paints.
- [ ] **#1 · `empty_bays` against the films (Sign-off 2).** It plays at the end of story level 2 on
      https://final-outpost-rho.vercel.app (story films replay on every play while `REPLAY_FILMS` is on). Nothing
      is waiting on it. Close it if it reads fine.
- [ ] **#65 · Routines (HANDOFF.md step 5). Waiting on Doug:**
      1. Give the Claude GitHub app access to outpost-ops (installation 136790409).
      2. Create a fine-grained token for outpost-ops only, with Issues and Contents read/write.
      Then create the routines in dry-run for a week.
- [ ] **#66 · PILLARS-DRAFT.md (waiting on Doug):** the order of the pillars, and pillar 7's pay-to-win line.
- [ ] **#84 · iPhone checks for Bundle 5 (flat pads, #10 #41 #52).** Pads are now flat decals; the probes ran in the Chromium pane at phone size, not on a real phone:
      1. Day, dusk (a story level), night and a storm: every pad kind (hire, build, upgrade, warehouse, clear) reads as a flat marking.
      2. A pad behind a gate or the kiosk shows faintly through it (s1-L010 tower pads).
      3. Not yet seen in a real scenario (#52): red bolts in a real raid, the healing cross with a real medic, trader order pictures in a live bubble, fireworks after a real win, the shovel at the level 3 rockslide, wall fade on the phone, core fade in a story level.
- [ ] **#76 · iPhone checks (Safari, live site, after the next deploy).** The probes ran on software GL in Chromium, so none of this is proven:
      1. Frame rate: play s1-L014 for two minutes with waves; it should hold smooth, no stutter when the wave icons appear.
      2. Medic kneel: send a medic to a hurt crewmate; the kneel animation plays and ends.
      3. Fade feel: walk behind a building; it fades out and back without popping.
      4. Two-deploy update: open the site, wait for a second deploy, reopen; the Update now / Later prompt shows and the old
         home background never flashes (#2, #50 N16).
      5. Story level 2, goal 2: the two close pods are on screen together and one loop circles both (#54); story level 3: arrows
         follow the goal to the rockslide (#53).
      6. s1-L014 belts carry goods on top (R6 #4); s1-L013 trader shows "!" when impatient (R6 #6); a wave shows icons between waves (#51).
- [ ] **#58 ·** The playtest retention target is met.

## Bundle 1: cleanup and nightly fix (no game change)

- [ ] **#63 · Nightly-data fails (do first).** outpost-ops Actions run 42404338827: `review:pulse` ran 111 levels and
      reported 69 errors, all "pinned to engine 0.18.0, running 0.20.0", from the old packs s1-068…s1-108 in the
      workflow's `--packs` list. That probably stopped the other four `review:*` commands, and no data commit
      landed. Fix: pulse skips levels pinned to an old engine and reports them (or trim the pack list). Then re-run
      the workflow by hand from the GitHub page (no `gh` on the laptop).
      **Refinement (mobile):** `run-review.mjs` keeps running the other commands; the damage is pulse's exit code 1.
      Fix in `playLevels`: compare `manifest.engineVersion` with `ENGINE_VERSION`, list mismatches under `meta.skipped`,
      not `errors`, and don't fail for skips; same check in guide and calibrate; then trim `pulsePacks` in the ops
      rotation. Done check: a manual workflow run goes green and a data commit lands.
- [ ] **#67 · Housekeeping:**
      - delete the Supabase test row (install `claude-verify-20261107`, kind `session`);
      - delete the merged local branches `review-supabase`, `review-tools`, `review-probe` and `review-merge`;
      - [x] update the stale `packs.test.ts` "gotcha" in `docs/review/HANDOFF.md`: done 2026-11-07 by the orchestrator. The file is
        untracked, in the parent `Mobile game/docs/review/` folder, not in either repo.
      - [x] fix `docs/RELEASE.md`'s links (they point at "section 6"; the gates moved): already fixed on main; its open gates now say
        "tracked in `docs/BACKLOG.md`" and no "section 6" reference is left (grep 2026-11-07).
      - [x] refresh stale role notes in outpost-ops `refinement/notes/` (producer, QA, level designer): done 2026-11-07, outpost-ops 14878b7.
- [ ] **#68 · Two commits on the local `farthest-outpost` main, never pushed (2026-10-30):**
      - f32b159 crash_open: no reactor in the film; the commander no longer jitters at the plate's edge;
      - 2cf4c1b Level rules: rule 7 counts enemy points; drops in proportion to HP.
      Both are older than the film rework (#47) and the rules review, so they may be superseded. Compare them with
      main before pushing.
- [ ] **#69 · `story-handoff` (worktree `fo-wt-handoff`):** b477f7d "Level 1 opens on crash_open's last frame",
      plus uncommitted edits to `cinematics.ts`, the release notes and the work log. This overlaps #48 (the held
      level edits).
- [ ] **#70 · `story-buggy` (also in `fo-wt-buggy` with uncommitted `buggy.json` / `meshy.json` edits):** the
      reduced buggy model. Goes in with #5.
- [ ] **#72 · Remote branch `look-test`** (read-only check 2026-11-07: all seven commits are already on main by patch id; `5fd74fc` KILN cloud
      is main's `d9526f0`; `db44834` contact sheet is `docs/look-test/`. Nothing worth merging; the branch is safe to delete.) (2026-11-04): soft sprite particles, turret bolts of light, dust-storm
      sheets, KILN cloud without square blocks, reactor glow. Most of the new look is already on main. Check what's
      left, then merge the rest or delete the branch.
- [ ] **#73 · Remote branch `object-sizes`** (read-only check 2026-11-07: all three commits are already on main by patch id, and main's
      `meshy.json` carries the same widths, crystal scrap 0.95 m, ship scrap 9.9 m, Scrap 2 tube 5.6 m. The generator footprints are on main too.
      The WIP commit's failing footprints test is superseded; the branch is safe to delete.) (2026-11-04): crystal scrap at 0.95 m, generator footprints for the
      resized models, and a WIP commit of the Buildings-row sizes whose footprints test fails. Check against main's
      one size reference (`render-3d/src/sizes.ts`).
- [x] **#76 · Screen-probe pass for the never-seen-live items.** Run `pnpm review:probe` on s1-L008, s1-L013, s1-L014 and
      story levels 2–3 (bot-driven, phone-size) and use its shots as evidence for #50, #51, #53 and #54. What the probes
      can't show (real iPhone Safari, frame rate, the medic kneel, fade feel, two-deploy update) becomes one short list of
      iPhone checks for Doug.
      **Done 2026-11-07:** shots and notes in `docs/review/probe-2026-11-07/` (README names each shot); five levels, no page errors;
      iPhone checklist is under "Waiting on Doug". Ran against a hand-started vite server (`--base`) because `probe.ts` resolves
      `vite/bin/vite.js`, which the installed vite's `exports` blocks (ERR_PACKAGE_PATH_NOT_EXPORTED): its own server start is broken.
- [ ] **#50 · R6 Release 1 HUD and art:**
      - [x] R6 #3 "Finish in x:xx" as the last star (s1-L008): probe, local. `s1-L008-t0030.png` / `-t0060.png` show the stopwatch chip counting 8:10 to 5:40 beside the star.
      - [ ] R6 #4 goods on belt tops (s1-L014): not shown; `s1-L014-t0060.png` has no belt with goods in frame.
      - [ ] R6 #6 impatient trader "!" (s1-L013): not shown in 90 s; `s1-L013-t0060.png` has "Sold!" and MAX tags only.
      - [x] R6 #7 no lot-edge pipes: probe, local. Clean lot edges in `s1-L008-t0030.png` and `s1-L014-t0060.png`.
      - [x] R6 #8 smooth code-built objects: probe, local. Round grow dome and reactor rim in `s1-L008-t0030.png`.
      - N16 the old homepage flash (needs two real deploys; see #2)
- [ ] **#51 · R6 #1 and #2 through a real wave:**
      - [ ] icons still between waves: no wave came in the 90 s probes.
      - [x] the VIP icon mid-fill: probe, local. `s1-L008-t0030.png` reads 1/16, `s1-L008-t0060.png` reads 3/16.
- [ ] **#53 · G5 / S8 arrows follow the goal:** story level 3 (kiosk, then rockslide).
      - [x] kiosk leg: probe, local. `story-L003-line06.png` shows the arrow chain leading from the kiosk to the goal flag.
      - [ ] rockslide leg: not captured; the bot ended the level before a shot of it.
- [ ] **#54 · G6 / S9 one loop around close pods:** level 2 goal 2's pair, on screen together.
      Not shown: `story-L002-line08.png` has the arrows going to one pod, never the pair together. Needs a hand look.

## Bundle 2: first screen and level packs (no engine bump)

- [x] **#2 · Only the new title loop ever shows (Doug, 2026-11-07; bug, do first).** At first the old background
      showed while the animated loop loaded. Now the loop never appears, only the old SVG-style home background.
      Found so far: the live bundle's `/assets/title_loop-*.mp4` serves fine (200, 1.2 MB, video/mp4). `title.ts`
      keeps the video hidden until frames flow and removes it on `error`, leaving the canvas fallback.
      Likely cause, to confirm: the service worker now serves the cached video as a plain 200, and iPhone Safari
      needs range (206) responses for video. So it worked before the cache filled, and fails once it is cached.
      Fix: exclude the mp4s from precache, or serve range requests, and never paint the old background. Show a
      plain dark frame (or the loop's first frame as a poster) until the video plays. Check on an iPhone, live,
      after a second visit.
      **Refinement:** the precache guess is wrong. `vite.config.ts` never precaches mp4s, the live `sw.js` has no mp4,
      and the live file answers range requests with 206. Likelier causes: an installed old shell asks for an old hashed
      mp4 URL (prompt-mode updates), or Low Power Mode refuses autoplay. Either way `title.ts` removes the video for
      good on its first `error`. Fix: retry once and re-create the video on `attach()`; dark background plus a poster
      frame; draw the canvas fallback only after an error or a timeout; send `video.error.code` with telemetry.
      Done check: on iPhone Safari, after two real deploys and a second visit, the loop plays (or the dark poster
      shows), and the old background never paints.
      **Done 2026-11-08 (f5fb255), live on desktop:** the title shows the loop on a dark frame with the poster, canvas hidden; locally a forced double error retried once, then drew the canvas fallback. iPhone check is under "Waiting on Doug".
- [ ] **#7 · P7 Ship the revised ranger pad rule.** Doug, 2026-11-07: the ranger hire pad goes inside the hunting
      grounds, clear of the burrow models. If that fails, it goes just inside the gate nearest them, or on the
      settlement edge facing them when there's no wall. Manual first. It is built but uncommitted in worktree
      `fo-wt-plot` (branch `plot-p1-p6`, behind main): `generator/src/build.ts`, the `ranger` block in
      `generator/data/generator.json`, rebuilt `s1-L017` / `s1-L034`, `pack.json`, `build-log.json`, `docs/LEVELS.md`
      and the 2026-11-07 digests. Steps: commit on the branch, merge main, `pnpm check`, `pnpm levels:check`,
      rebuild L017/L034 if the merge touched the generator, release notes, push, verify live. The same worktree
      holds uncommitted retry output for s1-L012 / s1-L037. Land it only if `levels:check` stays clean, else
      discard it.
      **Merged:** #71 (the uncommitted work in `fo-wt-plot`) is this item.
      **Refinement (level design):** the branch is on engine 0.20.0 and main is past 0.21.0, so expect conflicts in
      `s1/pack.json`, L017 and L034. The pad lands at the map edge, about 230 units from the start (L017 (448,342),
      L034 (50,352)); L017's human-view stars dip from 3 to 2.83, and L034 became a different level. The rule reads only
      `zones[0]` and ignores dangerous prey. The L012/L037 retry output is not in the diff. Look at both levels before
      landing; re-run: merge main, `levels:repin`, `pnpm check`, `levels:check` (s1 and story), regenerate `docs/LEVELS.md`.
      Done check: the ranger pad sits inside the hunting grounds on L017 and L034, seen live.
      **Landed 2026-11-08 (bed725e), not yet seen live:** pads at L017 (448,342) in zone [418,330,60,150] and L034 (50,352) in [20,340,60,150] (manifests); L017 is off target (0.282 vs 0.34) but both pass `levels:check`; L034's protein target is now 36 and its stopwatch 5:25 (`goalhud.test.ts` updated). The pad is off the opening view and the live camera would not pan, so it still needs a look in play.
- [x] **#78 · `review:probe` can't start its own server (found 2026-11-07, #76).** `tools/review/probe.ts` resolves
      `vite/bin/vite.js`, which the installed vite's `exports` blocks (ERR_PACKAGE_PATH_NOT_EXPORTED), so the probe only runs
      against a hand-started server. Start vite through its JS API or the `.bin` shim. Done check: `pnpm review:probe` on
      s1-L008 runs end to end with no server started by hand, locally and in the nightly workflow.
      **Done 2026-11-08 (bed725e):** `probe.ts` starts vite through its JS API; `pnpm review:probe` on s1-L008 ran end to end locally (15 findings, 18 shots). The nightly run is not yet seen.
- [ ] **#80 · Nightly probe hits the 35-minute timeout (found 2026-11-08).** With #78 fixed the probe runs: outpost-ops
      220f957 has shots for all 11 levels, but the step was killed at 35 min (all five story levels ran because story files
      changed). Raise the step timeout in `scripts/run-review.mjs` or cap story levels per night in `config/rotation.json`.
      Done check: the next nightly run shows every command ok.
      **Landed 2026-11-08 (outpost-ops 87640e7):** probe timeout 35 → 55 min (the job allows 75); 11 levels took ~25 min of play.
      Tick it when the next nightly run shows every command ok.
- [ ] **#81 · The protein hunter can't pass through a gate (Doug, 2026-11-08).** The ranger role is called "protein hunter"
      in game (use that name with Doug). It can't walk through a gate, so a hunter hired inside the walls can't reach hunting
      grounds outside them. This matters for #7's fallback ("just inside the gate nearest them"). Find out whether gates block
      the hunter's pathing or only the player's, fix it so hired hunters use gates, and add a property test.
      Done check: on a walled hunting level, a hired hunter walks out through the gate and back, seen live.
- [ ] **#82 · The dust storm warning shows behind the HUD's progress and goal icons (Doug, 2026-11-08; an old issue).** The
      top banner (`.fo-banner` in `render-3d/src/scene/dom.ts`: `top:10px`, `z-index:2`, filled by `renderer.ts` near
      `bannerEl`) sits under the top HUD row, so "Dust storm coming", the storm countdown and "wave soon" are hidden. Story
      levels already push it down (`story.css` `.story-on .fo-banner`). Move the banner below the HUD row for every level
      (and/or above it in the stacking), on all phone sizes and safe areas. Renderer/client only, no engine bump.
      Done check: on s1-L022, the storm warning and countdown read in full, clear of the progress and goal icons, on iPhone, live.

## Bundle 3: story pass (story files; #6 is owned by the "Vale helmet animations" session)

- [x] **#4 · S40 KILN the same size on screen in every level, and closer (Doug, 2026-11-07).**
      **Live 2026-11-08 (c396606, orchestrator-checked):** `kiln.ts` scales size/right/up; KILN at about 57% in L2–L5, same size (screenshots kiln-L2..L5). No level 1 shot (probe timeout). #13 included. iPhone check: #83.
      Why level 5 looks zoomed out: its family is `defend`, and `content/data/look.json` `viewW` shows 300 units
      of ground across the screen on defend levels against 170 everywhere else (L1 shelter, L2 rescue, L3 harvest
      and L4 industrialize all use 170). KILN is sized in world units (`spiritFollow` size 1.1 in all five cue
      blocks), so it shrinks with the wider view.
      Fix: size KILN against the screen, not the world (scale by `viewWFor(family)` / 170, or size it in screen
      space). Use level 5's on-screen size, so levels 1–4 KILN gets smaller (about 57% of today). Distance: see Doug's note below.
      Done check: a screenshot of KILN at its first line in each level, at phone size, all the same size.
      **Merged:** #13 (KILN on screen when a later level's coaching line teaches a new mechanic) is part of this item.
      Coaching lines (`coach.ts`) need a way to call the story cloud with the same scaling.
      **Doug, 2026-11-07:** KILN sits about 1 m from the commander's head at the scale of levels 1–4, and further at
      level 5's scale. Scale `size`, `right` and `up` by `viewWFor(family)` (and the camera zoom) in the client; no
      skin data changes. Check that the smaller cloud stays legible at phone size.
- [x] **#3 · S24 Two more sealed pods at the crash site (Doug, 2026-11-07: option 1).** Add two sealed
      **Live 2026-11-08 (59c27ed):** two sealed pairs per story level, out of the start view. Check `crash_open` wide shots when Bundle 4 re-renders. iPhone check: #83.
      `decor.stasis_pod` + `decor.stasis_glass` pairs toward the back of the wreck in `story-L001..5.json`, so the
      deck shows five (the commander's open pod, bay 5 open from level 3, three sealed). They must stay **out of
      frame of `crash_open`** (the first film), and clear of the game's start view and the film's held level edits
      (#48). No scene or line changes.
- [ ] **#6 · S32 The lieutenant's fall, re-staged (Doug, 2026-11-07).** Claimed by the `story-vale-scrap` session;
      check the work log first. What's wrong now: the alignment is a mess, the fall comes with no cause, and it
      plays after the run has started. The cause: the scene is triggered by the sim's `retreated` event, which
      fires when the warlord has already turned to flee. The beat Doug wants, in order:
      1. Vale is attacking and taking damage in normal play.
      2. The animation starts on the hit that brings the warlord to its retreat threshold. A close-up shows the
         last shot or two striking Vale, so the player sees why Vale falls; one shot too many knocks Vale down.
      3. The helmet falls off at that spot. Where it lands matches where Vale's head lies at the end of the fall.
      4. Vale gets up.
      5. Only now does Vale run off screen.
      Use Doug's new models (`hostile.boss_vale` with `item.vale_head`, the black `item.lieutenant_helmet`). After
      the animation, the in-play helmet lies where it fell (the head's spot), not at its manifest spot (760, 770).
      Vale's face may show when the helmet comes off. Doug, 2026-11-07: fine, since the helmet scene comes right
      after, and it's a small gift for players who recognise Vale from the name card in an earlier level.
      Dialogue timing:
      - "You should have stayed asleep, Commander." stays as the warlord walks into frame.
      - No line during the animation.
      - KILN's "They're running. It's over for tonight." and "They dropped something." (with dots on the helmet)
        come straight after Vale leaves the screen. They replace the line that waits for the fleeing warlord to
        pass the helmet.
      - The capture then plays `helmet_reveal`, `vale_run` and "Vale?" (#55) as now.
      **Already done in engine 0.21.0:** the helmet drops on the hit that crosses the retreat threshold and lies at that
      spot in play; the Vale models and the fall scene exist.
      **Doug, 2026-11-07:** while the animation plays, the game's own warlord is paused and hidden. After the fall and
      get-up, the in-play warlord is replaced by Vale's head on the warlord body (`hostile.boss_vale` + `item.vale_head`),
      which runs off screen; the helmet stays on the ground at the point of the fall. Still to do: freeze and hide the
      in-play warlord (`retreated` fires after it has already turned to flee), the close-up of the last shots, the line
      timing, the helmet landing on the head's spot, and the commander picking up the helmet (from #12).
      **Merged:** #55 (check `vale_run` on a phone) is this item's done check.
      Done check: on a phone, cause, fall, helmet, get up, run off, then the lines; the in-play helmet is at the fall spot.
      **Live 2026-11-07 (b4c63fc), waiting on Doug's iPhone check.** Built to Doug's stick-figure picks and his three notes;
      gun kept throughout (Doug). Checked headless only (scene stills at phone sizes, a bot run of story-L005 to the retreat).
      Open for Doug: "It's over for tonight" now plays 3 s after the fall even if other raiders are still alive.
      **2026-11-08 follow-up (Doug):** Vale's head rig fixed (head upright, no longer sunk), head and black helmet capped at
      1.2x the old grey helmet, and the film ends pulling back to the game's camera angle. Later the same day the film moved onto the level's own ground and light (Doug). Checked headless; iPhone check still open.
      Details: `docs/STORY-WORK-LOG.md` 2026-11-07 entry.
      **Doug, 2026-11-07 (later), supersedes the staging above where they differ:**
      1. Drop the commander-runs-with-the-helmet clip (`vale_run`, S33/#55). "Vale?" stays.
      2. The close-up showed the helmet sitting sideways on Vale. Replace the fall: Vale falls on the back, rolls over and
         gets up; the helmet comes off on ground contact and rolls away. No zoom on Vale's face. Keep the clip very short.
         Work the motion out first with stick-figure demos Doug approves (the method used for the pod exit).
      3. The run-away is in play, not in the scene: the in-play warlord becomes `hostile.boss_vale` + `item.vale_head` and
         runs off to the right side of the screen.
      **Owner:** the "Vale helmet animations" session (handed over 2026-11-07).
- [x] **#5 · S41 Sela's buggy at the signed-off size (Doug confirmed several times; last on 2026-11-07).** Use the
      **Live 2026-11-08 (59c27ed):** buggy at 2.64 m drives in after `sela_arrival`, headlights halved. A retry past Sela's arrival won't re-park it. iPhone check: #83.
      sandbox's size, also used in the `sela_arrival` scene: 2.64 m long (the 4.4 m build x 0.6). Merge the
      reduced model from branch `story-buggy` (39.9k tris, 2.5 MB, two wheels) at that size, then wire it into
      level 3 with headlights and the drive to the kiosk. No further sign-off.
- [x] **#14 · S43 The training levels teach wall building (Doug, 2026-11-07).** Today level 2 starts with a prebuilt
      **Live 2026-11-08 (59c27ed):** level 3 star is `walls`; `levels:check --pack levels/story` 5/5, every rung builds the wall; no engine bump. Story owner re-checks L3–5 in play.
      ring, so the walls appear from nowhere. After the freezing pods are rescued, the player builds the walls (wall
      pads with a goal card and a line saying why: the night and the raiders). Needs a look at which level carries
      it (2 or 3), whether a wall pad exists in the rules (an opt-in option if not), and the bots' and
      `levels:check` result.
      **Doug, 2026-11-07:** teach wall building in **level 3**, with the existing `perimeter_before_wave1` goal (no
      engine bump). This reverses the 2026-11-03 "keep the prebuilt walls" decision; level 2 stays a short rescue.
      There are no wall pads: a wall is a `barrier.line` built by walking its sections with the resource. Raids first
      come in level 5, so KILN's line looks ahead. Done check: `levels:check --pack levels/story` green with bots
      building the wall; the story owner re-checks levels 3–5.

## Bundle 4: level 1 opening film (`crash_open`, Release 3)

Fix stage 2 now; Doug approves the fixed stills and test before the full render (#49). The held level edits (#48)
ship with the film.

- [ ] **#75 · Back up the film tools (before #47).** `tools/cinematics/mocap/` and `cache/` are not in git and live only in
      `fo-wt-handoff/tools/cinematics/`. Copy them somewhere safe (or into git LFS) before any film work.
- [ ] **#47 · Fix stage 2:**
      1. The glass slides through the commander; key a hinge on its edge.
      2. The open glass blocks the camera at the step-out.
      3. The drop to the sand is cut away.
      4. The third camera frames mostly black sky.
      5. The commander faces away in the look-round; turn toward the light.
      6. The final view crowds them against the wreckage.
      Ask Doug for his own list too.
- [ ] **#48 · Held level edits, shipped with the film:** crash-site `scrap` x minus 100 units in `story-L001..005`;
      L1 `start` to [451.7, 138.9]; bump `FILM_VERSIONS.crash_open`; check `openZoom.film` lands on the last frame.
- [ ] **#49 · Re-render shots 2–3** (impact, wreck at dawn) from the new set, then the full render (set as one
      plate, commander on a holdout layer, composite). Needs Doug's approval of the fixed stage 2.

## Bundle 5: flat pads

- [x] **#10 · Flat ground markers instead of raised pads (Doug, 2026-11-07).** Replace the raised standing pads
      **Live 2026-11-08 (67ea2f4):** flat decals in guide-arrow shades, faint see-through copy behind tall models; checked at phone size in Chromium only (day/storm/night; dusk simulated). iPhone check: #84.
      with 2D projections on the ground: a light or dark marking in the same shade as the guide arrows, so it
      contrasts in any lighting. Applies to every pad kind (hire, build, upgrade, warehouse, clear). Done check: pads
      read clearly in day, dusk, night and storm light on a phone.
      **Refinement (mobile):** pads already draw a flat canvas decal (`renderer.ts` ~1983); the raised part is the pad
      model. Hide the model, make the decal the pad, colour it from the guide arrow tokens (`scene/groundmarks.ts`) with a
      dark outline. Perf is neutral or better. Then #41.
- [ ] **#41 · G4 / S27 hire pads always fully visible:** the generator places pads clear of model silhouettes, and
      **2026-11-08 (67ea2f4):** pads behind tall models now show faintly through; placement unchanged (generator/pack work, Bundle 8).
      fading never hides a pad. With #10, check the flat markers too.
      With flat markers (#10), this shrinks to placement clear of tall model silhouettes at the 30° camera.
- [ ] **#52 · Step A renderer items:**
      - red bolts in a real raid
      - the healing cross with a real medic, and the medic's kneel (the `care` clip may read as picking up rather
        than kneeling)
      - trader order pictures in a live bubble
      - fireworks after a real win (S22)
      - the shovel at a real rockslide (S23, level 3)
      - wall fade on an iPhone, and the core fade in a story level

## Bundle 6: measurement first (no engine bump)

Bots and baselines settle before the model is fitted.

- [x] **#43 · Bot tow loop through a wall:** `Brain.loopAround` can place loop points inside a ring.
      **Landed 2026-11-08 (6dc3639):** tow loop points stay on walkable ground; new bots test.
- [ ] **#44 · Search start table per engine:** make `startPressure` ignore a `start.json` from another engine, then
      **2026-11-08 (6dc3639):** `startPressure` ignores another engine's table. Still open: rewrite `start.json`, which waits for Bundle 8's rebuild.
      rewrite it with `pnpm levels:start-table` from this rebuild.
- [ ] **#9 · Rater detail for every eval (Doug, 2026-11-07).** Today the packs store only each level's totals
      **9a landed 2026-11-08 (80f656a):** `pnpm levels:eval` writes `levels/eval/<pack>/<id>.json` (55 + 18 levels); `pack.json` untouched. Not yet in the files: `tools/review` measures and the generator digest. 9b stays deferred.
      (`rating.difficulty`, `rating.fun`, `botMargin`, `botsPassed`, `stars`), so no one can see why a level scores
      what it does. Throw those totals away as the record, and capture every sub-point of the AI-driven evaluation,
      for every level, not only defend:
      - each fun proxy's raw value and score (`closeFinish`, `lateUncertainty`, `tensionRhythm`, `decisiveness`,
        `rewardCadence`, `deadTime`, `fairFailure`, `novelty`, from `rater/src/fun.ts`);
      - each difficulty feature (`skillNeeded`, `marginRef`, `marginMedian`, `lifelineRisk`, `concurrentDemand`,
        `routeLoad`, `threatPressure`, `animalHits`, `economyTightness`, `moduleCount`, `novelty`, from
        `rater/data/weights.json`) with its weighted contribution;
      - the per-profile bot results behind them (win, margin, stars, stall reason, `ticks`);
      - the review pipeline's measures (`tools/review`): pulse's `shape` (still time, walking, repetition, reward
        gaps), `oneTaskS`, `noTaskS`, `loopMax` and `moved`; guide's walk results; the telemetry aggregate; and
        calibrate's bot-vs-player fit;
      - the generator's per-candidate record (the digest: every search iteration, passed or rejected, and why), and
        the `levels:check` ladder per rung.
      Write them into each level's `rating` and into the candidate digest. Re-rate the current pack (no rebuild
      needed if rating is separate from generation). Then build one view (sandbox page or `docs/LEVELS.md` table)
      that shows every sub-point per level, with bots and real players side by side. Then #35 (defend fun) can be
      decided from data.
      **Refinement:** split. **9a** (Bundle 6): store the sub-points in a side file outside `levels/packs` (for example
      `levels/eval/<pack>/<id>.json`), never in `pack.json`: its hash is in every level URL, so changing it resets
      every player's offline level cache. Add a per-wave defend trace (HP arrived, leak, scrap and towers at wave start).
      Done check: a re-rate leaves `pack.json`'s hash unchanged, and a test fails if any level lacks a sub-point.
      **9b** (deferred until after Release 2): the bot-vs-player view; real-player data is still thin.
- [x] **#16 · P9 Attack–defence model: one formula as the common reference and control lever (Doug, 2026-11-07;
      **v0 landed 2026-11-08 (fbc3343):** `generator/src/defendModel.ts` + `docs/RELEASE-2.md`. Fit on 13 defend levels x 5 rungs: RMSE 0.27 (0.32 leave-one-out), r 0.76, 53/65 lost-vs-not agreement; a ranking tool, not calibrated. v1 refit is Bundle 8.
      replaces the N13-or-N1 choice for R6 #10).** Every level is balanced against the same model, assuming the best
      action at every moment:
      - **Defence side.** Each defence has a price list that rises by tier (turret L2 costs more than L1), set in
        content data, not by a level-wide escalation counter. From the list, a defence's **efficiency** `e_k` is
        the DPS bought per scrap at tier `k`; the best buy at any moment is the highest `e_k` affordable. If one
        flat `e` makes the formula simpler, it is an acceptable starting point (Doug).
      - **Economy.** Drops equal HP, so killing a wave of total HP `H_w` returns `H_w` scrap. Reinvested, that adds
        about `e·H_w` DPS, so `D_{w+1} = D_w + e·H_w`, with `D_0` from the starting scrap.
      - **Leak.** A wave with total attacker DPS `A_w` dies in about `H_w / D_w` seconds (plus walk-in time inside
        range). Its damage to the defence is about `L_w = A_w · H_w / (2·D_w)`.
      - **Pressure ratio** `ρ = Σ L_w / B`, where `B` is what can be lost (gate, base, guards' HP). `ρ < 1` is
        winnable with best play. Each level's target `ρ` is the lever.
      - **Shape is free.** A level meets its `ρ` quota however it likes: compress or spread the waves in time, or
        move enemy points between waves. Easy mode pushes more of the points into later waves, when the defence has
        grown.
      - What the formula can't see (lanes, travel, overkill, drops out of reach, melee vs ranged, bleed-out) goes in
        as correction factors per family, fitted from bot runs, not hand-set.
      Steps: write the model as a pure function (generator or rater), check it against bot runs on the current
      defend levels, fit the corrections, then size Bundle 5's waves (#23, #24, #25, #27) from target `ρ`.
      **Agreed with Doug, 2026-11-07 (from the research): build this combination.**
      - Spend a threat-point budget per wave, as Risk of Rain 2's director credits and Hind & Harvey 2024 (TD waves
        from a point budget) do.
      - Use `ρ` as the targeting function.
      - Add Mindustry-style shape knobs: its single difficulty input mostly compresses and shifts the waves rather
        than raising HP.
      - Accept a generated level only if the bot-measured `ρ` lands near its target.
      Corrections to build in:
      - an overkill/efficiency factor `η` on `D`;
      - effective `D` per lane and time in range;
      - judge waves by peak arrival rate (HP per second), not just total HP;
      - `e(D)` falling with tier prices, which also brakes the reinvestment snowball (BTD6 cuts income late for the
        same reason);
      - calibrate against a skill-limited bot as well as the best one.
      Keep the enemy-mix and synergy rules as a separate authored layer: they are what made hand-made waves feel
      harder in Hind & Harvey's test.
      **Refinement (2026-11-07), how to build it:**
      - Extend what exists: `generator/src/budget.ts` already keeps the scrap ledger and `defendWaves` shapes waves by points.
      - Make `ρ` a small per-lane simulation (defender DPS over time, HP in flight, the tower range window, walk-in time),
        so peak rate, lanes and range are structural. Fit only three numbers from the bots: overkill `η`, how `e` falls by
        tier, and a skill discount per ladder rung (the existing rungs are the skill-limited bots).
      - `B` is not a sum: gate HP (30) then base health (15 hits). A broken gate sends attackers to the core.
      - Guards are about 10x a tower's DPS per scrap, so price them in the model separately.
      - Add a bodies-per-wave cap beside the points budget (about 200 bodies at 375 points is a phone cost).
      - Map the sequencer's target D to a target `ρ` with one fitted function, so the two dials don't fight.
      - Shape knobs stay inside `fun.ts` tensionRhythm (2–5 peaks, no squeeze over 25% of the run) and keep the
        `waveQuiet` gap.
      - v0 (Bundle 6) is fitted on today's sim and checked against bot runs; v1 (Bundle 8) is refitted after Bundle 7's
        mechanics and becomes the generator's accept test (cheap `ρ` on all candidates, bot-measured `ρ` on the closest).
      **Doug, 2026-11-07:** enemy HP (the warlord's too) follows this model: HP = points = drops, sized from target `ρ`.
      Attackers cannot damage turrets: only the gate, the base, guards and the commander.
      **Merged:** #23 (dense mixed waves), #25 (faster arrivals: the compress knob, measured at the gate), #27 (more
      damage per attacker: a parameter of `ρ`) and #26's wave share are part of #16 and #24.
      Done check: v0 reports bot-measured `ρ` against predicted on the current defend levels, with the error stated.

## Bundle 7: Release 2 combat (one engine bump)

Order: Bundle 7 (Opus, one session, `sim` + `bots` + `rater`), then Bundle 8 (Opus, generator), in one release.
Claim the bump in `docs/STORY-WORK-LOG.md`; story level 5's authored waves are hand-tuned with the story owner.

**Combat values (Doug, 2026-11-05: "make your own best decisions").** Start from the arena PROPOSALS in
`client/src/dev/arenaModel.ts`, with drops equal to HP:
- Warlord and every other enemy: HP = points = drops, sized from #16's target `ρ` (Doug, 2026-11-07).
- Mites: acid spit (range 40, damage 1, every 2 s) and lunge (30, 0.3 s wind-up, 2 s cooldown).
- Dust crawler: 3 HP, drops 3 scrap, shot range 60.
- Wave share by count: about 70% mites, 20% crawlers, 10% raiders, with 1–3 warlords on the last two waves.
Retune by the attack–defence model (#16) and rater metrics, not by eye.

- [ ] **#34 · G7 drop the tow line's slack rule:** remove `lasso.slackTime` / `slackTicks`, the `tow_dropped`
      "slack" reason, the bots' never-stand-still rule, and the hint and skin text.
- [ ] **#17 · N2/N3 ranged raiders:** a real ranged attack with a sim "shot" event (today they only hit on contact).
      **Merged:** #19 (nobody stops to shoot; Doug's acid colours per species) is part of this item.
- [ ] **#18 · N2 mites lunge and spit acid** (numbers above).
- [ ] **#20 · N20 footprints and touch melee:** each character keeps its model's footprint, and melee means touching.
      The commander walks through anyone, and drones fly over.
      **Merged:** #29 (no character overlaps another: integer separation, fliers avoid only fliers) is part of this item.
      Use a spatial hash: separation over about 200 bodies is O(n²) without one, and must stay deterministic.
- [ ] **#21 · N21 guards, medics, bleed-out:** medics can't be hurt. A downed guard takes half damage and dies at 0
      unless a medic reaches it. The commander can be killed by attackers. Rater metric: guard deaths per wave.
- [ ] **#26 · N18 dust crawlers in waves** (`hostile.creature`, scrap drop, share as above).
      **Refinement:** `hostile.creature` drops `res.food_raw_2` today (`content/data/enemies.json`), so this is a content
      change to scrap = HP. Its wave share is sized by #16.
- [ ] **#28 · N8 drones dock between waves** and don't spawn until the next wave; they keep their HP.
- [ ] **#32 · N4 scrap lands where it can be reached:** snap drops to the nearest walkable point (`spawnDrops`).
      Required with #33.
- [ ] **#33 · R6 #11 attackers appear off screen:** spawn past the visible map, worked out in real metres per family.
- [ ] **#30 · N5 blaster fire, rest:** turret (`struct.ranged_defense`) and drone shots as travelling glow bolts with
      muzzle and impact flashes and a ground glow. There is no drone shot event yet. The renderer part of N5 is done.
      **Refinement:** the sim emits a real `shot` event only for the player; turret, drone, raider and hunter shots need
      sim events (engine bump). Do with #31.
- [ ] **#31 · G3 / S23b rifle lasers everywhere,** including hunting shots and the hunter role. Check level 5's
      raiders, guards and turrets once this lands.
- [ ] **#37 · R6 #13 the hands-off goal needs x machines running** (a new `machines` param on automate).

## Bundle 8: Release 2 levels and ship (one pack rebuild)

Re-derive the rater's `reference.json` (only 4 golden levels today) and do the iPhone dense-wave check before the
rebuild.

- [ ] **#24 · R6 #14 more attackers, mixed waves, multiple warlords** (inside #23; warlord values above).
- [ ] **#36 · N6 loop bound:** reject a candidate if any hand-done leg needs more than 5 trips with no affordable
      takeover. Store `loopMax` per level and re-check it in `levels:check`.
- [ ] **#39 · N10 rock slides hide something real:** `node.fuel_deposit` under the rubble, plus a generator check.
- [ ] **#40 · N6b level-order audit:** a pack check for repeated goal kinds and templates.
      **New finding:** ids L051–L060 exist in both s1 and s1-051 (L055 and L060 differ); the client keeps the first, and
      `levels-next.ts` double-counts them. The duplicate-id part ships in Bundle 2 as a pack test; the goal and template
      repeat check stays here. Store the template id in the pack so repeats can be checked.
- [ ] **#45 · Levels far off their target D** (L23, L26, L27, L28, L35, L44, L47 in 0.16.0): re-check against the
      latest digest. Give the sequencer per-goal D ranges where a goal can't reach its target.
      **Refinement:** the listed levels are stale. Now 14 of 65 are more than 0.15 off (still off: L23, L27, L44, L53, L66,
      L31, L36). Needs #37 first; for defend goals the D range comes from the `ρ`-to-D map (#16).
- [ ] **#35 · Defend fun threshold.** Defend levels rate F 0.1–0.3 against the 0.4 bar (waves_survived 0.07,
      turret_level 0.19, survive 0.37, against 0.8–0.9 for most economy goals). Decide from #9's per-proxy data
      whether to fix the proxies or set a defend threshold. #16 should lift `closeFinish` and `lateUncertainty`.
- [ ] **#59 ·** Bot regression suite: no stalls or infeasible levels in any shipped pack.
- [ ] **#46 · Release 2 ship steps:** engine bump, rebuild, check, re-pin, release notes, deploy (see the order
      above).

## Bundle 9: hunting and healing

- [ ] **#22 · N22 the ranger is back, and hunting is a skill:** the ranger and commander one-shot a spiked hopper
      with `gunDamage`. Hoppers charge as a herd and wind up their bites. Hunting never kills: the injured lie down
      and wait for a medic. Hopper zones hold 0, 3 or 4 (this replaces R6 #12). The ranger pad itself shipped in
      0.20.0.
      **Doug, 2026-11-07, healing a hurt ranger when there's no medic yet:** a red cross bounces over the downed ranger;
      off screen, an edge arrow carries the cross. KILN: "The ranger is hurt, and we haven't trained a medic yet. He needs
      your help." When the commander reaches him, the commander kneels and a green cross bounces over the ranger, as with a
      medic. Evaluate whether every level with a medic should make the player do this once before the medic is hired.
      Hopper zones and the ranger pad (#7) must agree: no ranger pad within a herd's charge range.

## Deferred (each says what it waits for)
- [ ] **#11 · R6 #9 Cutscenes in the level menu.** Replay after Start Over (`save.ts` keeps the seen ones), a "!"
      until a cutscene's version is watched, and list only cutscenes from levels reached. Held until the story claim
      on `client/src/app.ts` clears and `REPLAY_FILMS` is off.
      **Deferred until the films are final and `REPLAY_FILMS` is off (after Bundle 4).**
- [ ] **#12 · S6 Show what is happening.** Characters act out their lines with the generic `{ walk, to }` director
      action. Rhee's and Okafor's walks are done. Still to do from the screenplay's stage notes: Rhee kneeling beside
      Pip, hires walking to their posts in level 4, and the commander picking up the helmet.
      The commander picking up the helmet moved to #6.
      **Deferred until after Bundle 3 (Rhee kneeling and hires walking to posts).**
- [ ] **#15 · Actions animated (low priority; Doug kept it 2026-11-07).** Gathering, depositing and machines
      processing show visible work, not just items appearing. Converters show input going in, the machine working,
      and output coming out.
      **Deferred until after Release 2 (frame-rate cost next to dense waves).**
- [ ] **#42 · N24 follow-up: more levels with belts** (only 4 of 55 have one).
      **Deferred until the generator digest shows how many idle-module rejects wider belt goals cause.**
- [ ] **#64 · Probes on CI and tuned limits** (`docs/review/HANDOFF-PROBES.md`). Do the first run on ubuntu CI
      (`playwright install --with-deps chromium`). After the first real nightly, tune `probe-limits.json` against
      Doug's judgement.
      **Deferred until #63 gives a green nightly run.**
- [ ] **#56 ·** At least 20 cached levels play start to finish in airplane mode on a mid-range iPhone at 60 fps (2D)
      / 30 fps (3D).
      **Deferred until store preparation; needs a named mid-range iPhone and a frame-rate method.**
- [ ] **#57 ·** The save survives a cleared cache (export/import in v1).
      **Deferred until store preparation.**
- [ ] **#60 ·** A 15–30 s preview video.
      **Deferred until store preparation (after Release 2 art settles).**
- [ ] **#61 ·** A support URL and contact.
      **Deferred until store preparation.**
