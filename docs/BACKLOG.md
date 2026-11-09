# Backlog

This is the only task list for Farthest Outpost. Every open item lives here, whatever the round, account or
session that raised it. This file replaced `BACKLOG-R4/R5/R6.md`, `BACKLOG-STORY.md` and the open boxes in
`POLISH-PLAN.md` and `RELEASE.md` on 2026-11-07. Those files are now in `docs/archive/`.

**Talking to Doug (2026-11-09).** Never refer to items by `#number` in anything Doug reads (chat, reports, "Waiting on Doug"): describe the item in words, or ask directly, and put everything he needs for a decision in one place. Every phone check must say which level to open AND what to look for (and what good looks like). Numbers stay in this file and in briefs between sessions.

**How Doug wants this run (2026-11-07).** One orchestrator session keeps this file, merges, and checks each bundle is live
before the next starts. Each bundle runs in its own fresh session on the cheapest model that fits (Haiku for checks and
mechanical work, Sonnet for narrow builds, Opus for design-heavy work), briefed with item numbers, not chat history.
Bundles ship one at a time. Destructive steps (deleting branches, data, worktrees) are confirmed with Doug first.

**How to use it**
- **Every item has a permanent number** (`#12`). Refer to items by it. Numbers are never reused or renumbered: a
  new item takes the next free number (currently **#109**), whatever section it goes in. Older ids (R6 N2, S24 …)
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

## Start here next week (written 2026-11-09)

Tokens ran short this week, so only #97 is still being built. Start nothing else until the weekly limit resets, then run one fresh Sonnet orchestrator from this block.
- **Done and live:** Bundles 1–3, 5 (partly), 6, 7 (engine 0.22.0), Bundle 10 (engine 0.23.0, story and look fixes). Ticked items moved to `docs/archive/DONE.md`.
- **Systems lane:** Bundle 6 and 7 landed; #97 (`levels:check` on 0.23.0) is fixed (targets re-baselined, see DECISIONS.md). **Next: Bundle 8** (pack rebuild, #16 v1 refit from `docs/RELEASE-2.md`, #94 denser waves, #99 pads clear of buildings, #100 rangers through walls, #44's `start.json` rewrite). Suggest the full pack regenerate happens there. Then Bundle 9's sim parts.
- **Story lane:** nothing running. **Next: #48 and #49** (held level edits and the `crash_open` render) once Doug approves the film stills. Film state: `docs/STORY-WORK-LOG.md`; stills in `Mobile game/film-stage2-stills-v*` (v6 was reviewed; a v8 flat render was still running). Bundle 4 after that.
- **Look lane:** nothing running. Open: #41 (pad placement, with #99), #52 scenarios, #82 (storm warning behind the HUD), then Bundle 9's renderer parts.
- **Open Doug items:** approve or send back the film stills (#47); iPhone checklists #83, #84, #85, #2, #7, #76, and the new gate/downed-guard checks; run the three remote branch deletes (`look-test`, `object-sizes`, `story-buggy`; #72, #73); say whether leftover worktree folders `fo-wt-drop60`, `fo-wt-flatpads` and `fo-wt-plot` (uncommitted pack edits) may go; #80 ticks after a nightly run shows every command ok.


## In progress

One line per active item: number, who has it, and where. Add the line when work starts; remove it when the item is
ticked or handed back. Story-file claims are also recorded in `docs/STORY-WORK-LOG.md`.

- Bundle 1 (#63, #67, #68–#70, #72, #73, #76): done except Doug deleting the remote branches `look-test`,
  `object-sizes` and `story-buggy` (agents can't run `git push --delete`). Keep `fo-wt-handoff` until #75 backs up its film tools.
- **Three lanes run in parallel (Doug, 2026-11-08), one bundle at a time per lane.** Engine bump freeze: when Bundle 7 claims the bump in the work log, Story and Look finish their current push and pause until it lands.
- Story lane: idle (see Start here). Film track: the #47 stage 2 redo (v8 flat render) is with the film session; nothing else running.
- Look lane: idle; Bundle 10 look work is live and confirmed by Doug.
- Systems lane: #97 fixed; nothing running; Bundle 8 is next week.

## Waiting on Doug

- [ ] **iPhone checks for level 2's wall and Sela's buggy arrival (story only, after the next deploy).**
      1. Open level 2 "Roll Call". At the start there is no dashed line or "wall line" price anywhere on the ground, so it looks like level 1 (the pale heat ring round the reactor is normal and stays). Play it through: all five pods still come home and the level still ends in a win.
      2. Open level 3 "Open for Trade". The night film now shows only headlights coming up the road, and it ends before the buggy stops. Sela must not get out inside it.
      3. Back in play the camera moves to the road beside the stall: the buggy drives in with Sela sitting at the wheel (dark suit, a little warm light on her), parks with its headlights on, she waits a beat, then climbs out over the side, turns toward the stall and walks to it; her first line comes as she arrives. Look for no empty buggy at any moment and for Sela not popping into place beside it (no jump when she starts walking).
- [ ] **iPhone checks for the gate fan-out and downed guards (engine 0.23.0, live).** Open level 15 "Wreckage and Hardpoints" (or level 48 "Rust and Hardpoints"), hire guards and let a wave come to the gate.
      1. Attackers spread out in a short row in front of the gate (about three across, the rest behind) instead of one single-file queue; the gate still holds or breaks about as before.
      2. When a guard is shot down it lies where it fell with a number over it counting down from 15 (green, red for the last few seconds). Walk up to it: it gets back up after about 3 s. A hired medic does the same without you.
      3. With no medic or med bay on the level the guard still lasts the full 15 s (before, it was lost at once); left alone it is lost when the number reaches 0.
      4. Nobody starts healing in the first moment of the fall (about 1.5 s): standing beside it straight away does nothing until it has landed.
- [ ] **Remind Doug (2026-11-09): do the iPhone checks #83, #84, #2, #7, #76, and run the three remote branch deletes (Bundle 1).**
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

- [ ] **#80 · Nightly probe hits the 35-minute timeout (found 2026-11-08).** With #78 fixed the probe runs: outpost-ops
      220f957 has shots for all 11 levels, but the step was killed at 35 min (all five story levels ran because story files
      changed). Raise the step timeout in `scripts/run-review.mjs` or cap story levels per night in `config/rotation.json`.
      Done check: the next nightly run shows every command ok.
      **Landed 2026-11-08 (outpost-ops 87640e7):** probe timeout 35 → 55 min (the job allows 75); 11 levels took ~25 min of play.
      Tick it when the next nightly run shows every command ok.
- [ ] **#82 · The dust storm warning shows behind the HUD's progress and goal icons (Doug, 2026-11-08; an old issue).** The
      top banner (`.fo-banner` in `render-3d/src/scene/dom.ts`: `top:10px`, `z-index:2`, filled by `renderer.ts` near
      `bannerEl`) sits under the top HUD row, so "Dust storm coming", the storm countdown and "wave soon" are hidden. Story
      levels already push it down (`story.css` `.story-on .fo-banner`). Move the banner below the HUD row for every level
      (and/or above it in the stacking), on all phone sizes and safe areas. Renderer/client only, no engine bump.
      Done check: on s1-L022, the storm warning and countdown read in full, clear of the progress and goal icons, on iPhone, live.


## Bundle 3: story pass (story files)

- [ ] **#99 · Generate pads so none sit behind a building or wall (Doug, 2026-11-08; the larger fix behind #89's pin-and-pole).** Attack levels with walls face south and east by default (the camera side), and every other pad is constrained not to stand behind a building or wall as seen from the camera. Generator and layout rule, so an engine bump and a pack rebuild; the pin-and-pole shipped in #89 covers hidden pads until then.
      Done check: `levels:check` clean, and a scan of the pack finds no pad hidden from the camera by a building or wall.
- [ ] **#100 · Rangers walk through walls to reach hoppers unless the commander is outside the gate (Doug, 2026-11-08, playtesting s1-L017).** A Ranger's movement should not depend on where the commander is. He should path round the walls (out through the gate) to the hoppers whatever the commander does. Sim bug, so an engine bump (Systems).
      Done check: on s1-L017, hire the Ranger with the commander inside the walls; he walks out by the gate to the hoppers and never through a wall.


## Bundle 4: level 1 opening film (`crash_open`, Release 3)

Fix stage 2 now; Doug approves the fixed stills and test before the full render (#49). The held level edits (#48)
ship with the film.

- [ ] **#75 · Back up the film tools (before #47).** `tools/cinematics/mocap/` and `cache/` are not in git and live only in
      `fo-wt-handoff/tools/cinematics/`. Copy them somewhere safe (or into git LFS) before any film work.
- [ ] **#47 · Fix stage 2:**
      **Doug, 2026-11-08, rejects the first stage 2 stills:** the glass opens lengthwise (hinge on the short side); it must open widthwise, hinge on the long side. The commander is larger relative to the pod than the sandbox setting, and sits on top of the pod instead of inside it. Redo from the sandbox sizes and heights.
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

- [ ] **#33 · R6 #11 attackers appear off screen:** spawn past the visible map, worked out in real metres per family.

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

## Bundle 10: Doug's iPhone round 1 (2026-11-08, from #83, #84, #85)

Passed on the phone: #83 pods (4); #84 flat pads look (kept) and the rest of the #52 scenarios ran fine; #85 acid spit (1), drones docking (4).
Not seen, no change yet: #85 2, the mite wind-up and commander downed (he dies too fast; it will appear with bigger waves).

**Story lane (no engine bump, story files and client):**

**Look lane (renderer, no engine bump):**

**Systems lane (rules: ONE engine bump 0.23.0, claim it first; Story and Look pause while it lands):**
- [x] **#97 · `levels:check` after engine 0.23.0 (done 2026-11-09).** s1-L010/L043 salvage targets lowered (330, 265), s1-L060 recorded stars 2.83 -> 2.33; numbers in `docs/DECISIONS.md`. Bundle 8's rebuild re-derives them.
- [ ] **#94 · Denser waves, not only bigger ones (Doug, 2026-11-08).** s1-L037's last waves lag a little at the end; wave design should favour more dense, smaller waves. Fold into Bundle 8's wave sizing from target ρ.

- [ ] **#101 · Level 2 has a prebuilt wall that nobody built (Doug, 2026-11-09).** Level 3 now teaches wall building, so level 2's prebuilt ring (`ring` in `levels/story/story-L002.json`, the `prebuilt` list) should go: remove it from level 2 (Doug's pick between that and moving the building there; removing keeps level 3 as the teaching level). Done check: `levels:check --pack levels/story` green, level 2 still plays and wins, nothing in level 2's lines refers to the wall.
- [ ] **#102 · Buggy arrival, second pass (Doug, 2026-11-09).** Sela still gets out of the buggy during the cinematic and walks to the kiosk, and now the buggy never enters the frame in the in-play view. Wanted: the cinematic ends BEFORE she gets out; in play the camera shows the buggy drive in and park at the kiosk stall; then she gets out and walks to the stall. Done check: phone-size screenshots of the buggy in frame during the drive, parked with lights, and Sela stepping out; no exit inside the film.
- [x] **#103 · Hidden-pad pole must be behind the wall (Doug, 2026-11-09).** The pin and pole of a pad hidden behind a wall or building draws in front of it. The pole should be behind the obstacle and only visible where it is taller than the obstructing wall or building (the pin on top shows above). Done check: stills of a pad behind a wall and behind a taller building (s1-L010 gate pads) showing the pole hidden by the lower wall.
      **Closed 2026-11-09 (d20fcc6): Doug confirmed on the phone, level 10 west gate.**
- [x] **#104 · Trader order pictures look faded (Doug, 2026-11-09).** The pictures in the trader's order bubble are desaturated and lightened; protein is nearly white on white. Make each colour as vivid as the object it shows, or add outline/shading so detail reads. Done check: phone-size stills of an order bubble with protein, greens, ore and goods, all clearly readable.
      **Closed 2026-11-09 (d20fcc6): Doug confirmed the order pictures look good.**

- [ ] **#105 · Level 2 shows no hint of a wall (Doug, 2026-11-09).** After the prebuilt wall was removed, level 2 still shows a thin dashed line (where the tow line starts). Level 2 should look like level 1 with no suggestion of a wall: remove that line (and any wall-ring marking) from level 2 only. Done check: a phone-size still of level 2 at start with no dashed ring; level 3 unchanged.
- [ ] **#106 · Sela gets out of the buggy in play (Doug, 2026-11-09).** Now the buggy parks empty and Sela appears beside it. She should be seen getting out: add a "get out of vehicle" animation for Sela in play (a rigged clip, or built from existing clips: the buggy door/side, she climbs down, then walks to the stall). She must be visible in the buggy while it drives in (or the exit starts from the driver seat). Done check: phone-size stills of the buggy with Sela in it driving in, parked, mid-exit and walking to the stall; no empty-buggy frame.

- [ ] **#107 · Ore fields moved from level 1 to level 2 (Doug, 2026-11-09).** Level 1 is the canonical map and nothing on the canonical map moves in levels 1–5. Find which ore (and any other) positions differ between `levels/story/story-L001.json` and L002..L005, put them back to level 1's, and add a story-pack check that fails if any canonical-map object (ore, crash site, rocks, wreck) differs from level 1 across levels 1–5 (except things a level adds or removes on purpose, listed in the check). Done check: the check passes; screenshots of level 1 and 2 at the same camera show the same ore fields.
- [ ] **#108 · Sela's arrival: framing and flow (Doug, 2026-11-09; the buggy animation itself is good).** (a) Start straight into the drive-up animation: don't show the level first and then flash to the animation. (b) Move the commander toward the kiosk so Sela, the commander and both their speech bubbles fit on screen and nothing is clipped. (c) The film must run smoothly into the in-level animation: no jump to the commander and back to the buggy. Done check: phone-size screenshots in order across the film-to-play handover (no level flash first, no camera jump), and a frame with both bubbles fully on screen.

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
