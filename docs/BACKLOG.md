# Backlog

This is the only task list for Farthest Outpost. Every open item lives here, whatever the round, account or
session that raised it. This file replaced `BACKLOG-R4/R5/R6.md`, `BACKLOG-STORY.md` and the open boxes in
`POLISH-PLAN.md` and `RELEASE.md` on 2026-11-07. Those files are now in `docs/archive/`.

**Talking to Doug (2026-11-09).** Never refer to items by `#number` in anything Doug reads (chat, reports, "Waiting on Doug"): describe the item in words, or ask directly, and put everything he needs for a decision in one place. Every phone check must say which level to open AND what to look for (and what good looks like). Numbers stay in this file and in briefs between sessions. When Doug has a visual judgement to make, show him the stills or mocks (full absolute paths) in the same message.

**How Doug wants this run (2026-11-07).** One orchestrator session keeps this file, merges, and checks each bundle is live
before the next starts. Each bundle runs in its own fresh session on the cheapest model that fits (Haiku for checks and
mechanical work, Sonnet for narrow builds, Opus for design-heavy work), briefed with item numbers, not chat history.
Bundles ship one at a time. Destructive steps (deleting branches, data, worktrees) are confirmed with Doug first.

**How to use it**
- **Every item has a permanent number** (`#12`). Refer to items by it. Numbers are never reused or renumbered: a
  new item takes the next free number (currently **#111**), whatever section it goes in. Older ids (R6 N2, S24 …)
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

- Bundle 1 (#63, #67, #68–#70, #76): remote branches deleted; fo-wt-flatpads folder still to remove (locked file). Keep `fo-wt-handoff` until Doug says its film tools are safe (zip backup exists).
- **Three lanes run in parallel (Doug, 2026-11-08), one bundle at a time per lane.** Engine bump freeze: when Bundle 7 claims the bump in the work log, Story and Look finish their current push and pause until it lands.
- Story lane: idle. Opening film live and confirmed; level 2, level 3 arrival and shared map confirmed. **Handed off
  2026-11-09 (Doug: "resolved elsewhere"):** the film's sliding feet (#109) and the level 3 coin drop into the commander's
  hand (#110) go to a separate session, not this orchestrator family. The sliding-feet attempt's uncommitted tool edits are
  saved on branch `wip-film-feet-2026-11-09` (b4811a5, not for main).
- **Hand-off 2026-11-09:** the orchestrator chats and their bundle sessions are archived (weekly token limit). Next week a
  fresh Sonnet orchestrator starts here: Systems lane runs Bundle 8 (from `docs/RELEASE-2.md`), then Bundle 9. The local
  `farthest-outpost` main is 5 commits ahead of origin, but all five are on origin by patch id, so it is safe to reset.
- Look lane: idle; Bundle 10 look work is live and confirmed by Doug.
- Systems lane: #97 fixed; nothing running; Bundle 8 is next week.

## Waiting on Doug

- [ ] **Doug still to do (2026-11-09):** nothing on the phone; the fo-wt-flatpads folder (locked file) if not yet deleted. Routines access (#65) and pillar order (#66) below.

- [ ] **#1 · `empty_bays` against the films (Sign-off 2).** It plays at the end of story level 2 on
      https://final-outpost-rho.vercel.app (story films replay on every play while `REPLAY_FILMS` is on). Nothing
      is waiting on it. Close it if it reads fine.
- [ ] **#65 · Routines (HANDOFF.md step 5). Waiting on Doug:**
      1. Give the Claude GitHub app access to outpost-ops (installation 136790409).
      2. Create a fine-grained token for outpost-ops only, with Issues and Contents read/write.
      Then create the routines in dry-run for a week.
- [ ] **#66 · PILLARS-DRAFT.md (waiting on Doug):** the order of the pillars, and pillar 7's pay-to-win line.
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
- [ ] **#94 · Denser waves, not only bigger ones (Doug, 2026-11-08).** s1-L037's last waves lag a little at the end; wave design should favour more dense, smaller waves. Fold into Bundle 8's wave sizing from target ρ.




- [ ] **#109 · Opening film: the commander's feet slide on the ground after he leaves the pod (Doug, 2026-11-09).** The run after the drop is stretched about 2.2x to reach the held start spot, so the feet skate. Proper fix: loop the run cycle for the longer distance at a speed that matches the foot plants (or retime), then re-render only that segment (render time to be estimated; the full night render takes about 50 minutes). Shipped as is on 2026-11-09 because the weekly token limit was nearly used. Done check: a clip of the run with no visible foot sliding, ending on the same start spot, and the hand-off to play still smooth. **Shipped 2026-11-10 (film-feet):** stretch removed, level 1 starts where the drop ends; awaiting Doug's phone check, then move to DONE. Rounds 2-3 the same day: a foot lock removed the glide at the stop and the standing glide in the crane; level 1 now starts at (480.1, 135.2). About 20 cm of feet moving against each other is left in the look-round turn (per-leg IK would be needed).
      **Tried 2026-11-09, failed (two attempts, nothing pushed):** the plan to loop a run cycle does not work because the motion capture has no run after the landing. The drop clip ends in a crouched recovery, and the walk after the wall is only one or two strides; the "run" was that recovery sped up. Next account: get or build a real run/walk cycle (a new mocap clip or a generated one) and re-render that segment (about 11 minutes), keeping the held start spot.

- [ ] **#110 · Level 3 coin hand-off: Sela should drop the coin into the commander's hand, not throw it (Doug, 2026-11-09).** Today she tips the coin off her palm and it slides to his; he asked for a real drop into his open hand. Make the coin fall straight from her hand into his open palm (short vertical drop, hand under it, no throwing arc), keep the rounded fingers. Done check: phone-size stills of the coin leaving her hand, mid-fall and resting in his palm, from the game camera, and Doug confirms on level 3.

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
