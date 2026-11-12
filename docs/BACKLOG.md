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
  new item takes the next free number (currently **#133**), whatever section it goes in. Older ids (R6 N2, S24 …)
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

## Start here (written 2026-11-12: hand-off to the build account)

**Read this block, then work lane by lane.** On 2026-11-12 the whole open backlog was reviewed and bundled in one sprint
planning: Doug's difficulty work (agreed in chat 2026-11-03 to 11-12) plus the approved and Ready outpost-ops issues.
The issues went through the expert panel (`Mobile game/docs/refinement/REFINEMENT-2026-11-12.md`). Nothing was built.
- **Background for the difficulty work:** `Mobile game/docs/refinement/PLAN-2026-11-11-difficulty.md` (decisions, data,
  session briefs). Doug's calls: fuel and starting cash are no longer difficulty levers; outside defend, losing means
  stars and time only; modes are Cadet, Pilot and Captain; no wipe until the story release.
- **How to run it:** one orchestrator (Sonnet) keeps this file. Each bundle runs in its own fresh session, in its own
  worktree under `farthest-outpost` (`git worktree add ../fo-wt-<name> -b <name> origin/main` after an SSH fetch), on
  the model named in its heading. One bundle at a time per lane; lanes run in parallel. Rules bundles share one engine
  bump per release: claim it in `docs/STORY-WORK-LOG.md` first.
- **Start now (in parallel):**
  - **Ops A1 and A2:** cleanup and probe re-checks.
  - **Release 2, R2-1:** the rules bundle.
  - **The Model A tooling** (part of #117): it needs no engine and touches only `tools/model-a/`.
  - **Story S1:** once the story owner's claims allow.
- **Wait:**
  - **Look L1 and L2:** until the review pipeline's R7 branches (`fo-wt-r7-*`; ops #4, #5, #8, #23, #28) have merged,
    since both edit `renderer.ts`.
  - **Release 2b and Release 3:** until Release 2 is live.
- **outpost-ops:** issues #30–#53 and #35 are now in this file as #122–#132 (mapping in the refinement file); their
  labels weren't changed. Mark them `ready` or `needs-doug` from the review page, or close them as tracked here.
- **Talking to Doug:** no item numbers; name the level and what to look for in every phone check; show stills for
  visual calls.

## In progress

Nothing is being built from this file (2026-11-12). Notes kept from earlier hand-offs:
- The review pipeline's R7 batch is being built in `fo-wt-r7-*` worktrees. Check `outpost-ops/docs/STATUS.md` before
  touching `renderer.ts`.
- #109 (film feet) and #110 (coin drop) were handed to a separate session on 2026-11-09. Their uncommitted tool edits
  are saved on branch `wip-film-feet-2026-11-09` (b4811a5, not for main).
- Keep `fo-wt-handoff` until Doug says its film tools are safe (a zip backup exists). The `fo-wt-flatpads` folder still
  needs removing (locked file).

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
- [ ] **Difficulty targets for families that can't be lost (for #119).** Doug's star table covers families with a
      failure mode. Proposal for the others, on the 1st try (Cadet / Pilot / Captain):
      - 3 stars: about 50 / 30 / 15%;
      - 2 or more stars: about 90 / 70 / 45%;
      - cleared: 95% or more in every mode.
- [ ] **#131 · Scrap straight to the HUD (Doug, 2026-11-11, ops #51): which version?** Carried scrap is load-bearing in the sim (carry cap, pad payment, the defend scrap hire #112, dead-end proofs, collector residents). Doug's earlier note ("up top only and not carried") points to (a). (a) Scrap becomes a banked, credit-like balance everywhere: rules change, engine bump, bot and rater retune, and collectors still gather into it. (b) It stays carried and only the pickup is drawn flying to the HUD (client only). Also: does "scrap" mean only the defend salvage, or the ore from scrap nodes too? With (a), it joins the Release 2 rules bundle.
- [ ] **#130 · Cost tracker sinks into the ground once building starts (Doug, 2026-11-11, ops #44/#48): which element?** A paid pad isn't drawn at all today, so on level 38, after paying a build pad, which thing is still on screen while the building rises: the price label, the pin on its stalk, or the ground ring? Once answered it joins the pad-visuals bundle (build pads first; hire pads were a "maybe").

## Lane A · Ops and cleanup (no game change)

### Bundle A1: nightly and housekeeping (Sonnet; start now)
- [ ] **#63 · Nightly-data fails (do first).** outpost-ops Actions run 42404338827: `review:pulse` ran 111 levels and
      reported 69 errors, all "pinned to engine 0.18.0, running 0.20.0", from the old packs s1-068…s1-108 in the
      workflow's `--packs` list. That probably stopped the other four `review:*` commands, and no data commit
      landed. Fix: pulse skips levels pinned to an old engine and reports them (or trim the pack list). Then re-run
      the workflow by hand from the GitHub page (no `gh` on the laptop).
      **Refinement (mobile):** `run-review.mjs` keeps running the other commands; the damage is pulse's exit code 1.
      Fix in `playLevels`: compare `manifest.engineVersion` with `ENGINE_VERSION`, list mismatches under `meta.skipped`,
      not `errors`, and don't fail for skips; same check in guide and calibrate; then trim `pulsePacks` in the ops
      rotation. Done check: a manual workflow run goes green and a data commit lands.
- [ ] **#80 · Nightly probe hits the 35-minute timeout (found 2026-11-08).** With #78 fixed the probe runs: outpost-ops
      220f957 has shots for all 11 levels, but the step was killed at 35 min (all five story levels ran because story files
      changed). Raise the step timeout in `scripts/run-review.mjs` or cap story levels per night in `config/rotation.json`.
      Done check: the next nightly run shows every command ok.
      **Landed 2026-11-08 (outpost-ops 87640e7):** probe timeout 35 → 55 min (the job allows 75); 11 levels took ~25 min of play.
      Tick it when the next nightly run shows every command ok.
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

### Bundle A2: probe re-checks of shipped work (Haiku; start now)
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
- [ ] **#52 · Step A renderer items:**
      - red bolts in a real raid
      - the healing cross with a real medic, and the medic's kneel (the `care` clip may read as picking up rather
        than kneeling)
      - trader order pictures in a live bubble
      - fireworks after a real win (S22)
      - the shovel at a real rockslide (S23, level 3)
      - wall fade on an iPhone, and the core fade in a story level

## Lane L · Look (renderer, no engine bump; one renderer.ts session at a time, after the R7 branches merge)

### Bundle L1: pads and HUD readability (Sonnet)
Add the wave-incoming flag and Doug's level 38 screenshot (ops #46/#50) to #82. #130 joins once Doug answers.
- [ ] **#82 · The dust storm warning shows behind the HUD's progress and goal icons (Doug, 2026-11-08; an old issue).** The
      top banner (`.fo-banner` in `render-3d/src/scene/dom.ts`: `top:10px`, `z-index:2`, filled by `renderer.ts` near
      `bannerEl`) sits under the top HUD row, so "Dust storm coming", the storm countdown and "wave soon" are hidden. Story
      levels already push it down (`story.css` `.story-on .fo-banner`). Move the banner below the HUD row for every level
      (and/or above it in the stacking), on all phone sizes and safe areas. Renderer/client only, no engine bump.
      Done check: on s1-L022, the storm warning and countdown read in full, clear of the progress and goal icons, on iPhone, live.
- [ ] **#122 · Pin heads above pads at half size (Doug, 2026-11-11, ops #41/#42).** `padPin`/`padPinArt` in renderer.ts (~3350–3410): halve the `PAD_LABEL_H*5` factor and fix the pole/position maths that assume it. Done check: on iPhone, level 38, half the diameter on every pad type, the pole meets the pin, and the icon is readable.
- [ ] **#123 · Pin ring fills with payment, in step with the ground ring (Doug, 2026-11-11, ops #43/#47).** Draw the fill as a separate arc or mesh using the decal's `fb/24` steps, not by adding fill to the 256 px canvas cache key (up to 24 redraws per pad). Done check: on iPhone, paying into a pad fills both rings together from empty to full, with no hitch.
- [ ] **#124 · Locked hire-pad text 1.5× larger (Doug, 2026-11-11, ops #53).** `padLabelArt`: `lockPx` 28 → 42 and `PAD_LOCK_H` 36 → ~54; keep `padArtH` and the sprite height in step. Done check: on iPhone, the text at a locked hire pad is 1.5×, not clipped, and clear of the pin.
- [ ] **#125 · Airlock doors fill the resized gate (Doug, 2026-11-11, ops #52).** First confirm it isn't already fixed. `gateDoors` (renderer.ts ~1948) sinks the doors by a hard-coded 1.62 and the leaves are in `assets/buildings.ts` ~420–432: size both from the Meshy gate bounds. Done check: on every airlock level, the closed doors fill the frame with no gap and the open/close sink still hides them.

### Bundle L2: first-frame hitches (Sonnet, after L1)
- [ ] **#127 · Warm shaders through the game's own render path (review, ops #37/#39, #27 merged).** Story level 1's first frames and Sela's arrival on story level 3 hitch for 0.5–2 s (throttled probe). Fix in `warmPrograms` (renderer.ts ~1391) and `lookTest.ts`. Waits for the R7 hitch branches (ops #23/#28) to merge. Done check: `renderer.info.programs` is unchanged across story-L003 `customer_arrived` and story-L001's first frames, all under 50 ms at 4× throttle.

## Lane S · Story (story files: claim them in `docs/STORY-WORK-LOG.md` first)

### Bundle S1: story readability (Sonnet)
- [ ] **#128 · Story guide dots follow the commander smoothly on story level 2 (review, ops #38/#40).** The dots read the sim position through `place()` (`director.ts:456` → `stage.ts:79–81` → `storypresent.ts:83`). Feed the renderer's interpolated hero position, or add a follow-hero flag. Story files: claim them first. Done check: at 60 fps on story level 2 the dots stay locked to the commander while she walks, and a unit test at a mid-tick alpha passes.
- [ ] **#129 · Story captions never cover the speaker's face and stay inside the safe area (review, ops #30–#34).** First look at the probe's proof JPEGs: the face-cover findings may be a probe artefact. Then one placement rule for all story levels: anchor above the head and clamp to the safe insets (`story.css` ~127). Story files: claim them first. Done check: the probe re-run on story levels 1–4 shows face covered at 0.3 or less and nothing outside the safe area; Doug checks story level 1 on his phone.
- [ ] **#132 · Story level 3's camera leaves the store and clerk pad jammed in the top-left corner (review, ops #35, Ready).** Story files: claim them first. Done check: on story level 3 the store and clerk pad sit well inside the frame on an iPhone.

### Bundle S2: films (already handed to a separate session on 2026-11-09)
- [ ] **#109 · Opening film: the commander's feet slide on the ground after he leaves the pod (Doug, 2026-11-09).** The run after the drop is stretched about 2.2x to reach the held start spot, so the feet skate. Proper fix: loop the run cycle for the longer distance at a speed that matches the foot plants (or retime), then re-render only that segment (render time to be estimated; the full night render takes about 50 minutes). Shipped as is on 2026-11-09 because the weekly token limit was nearly used. Done check: a clip of the run with no visible foot sliding, ending on the same start spot, and the hand-off to play still smooth. **Shipped 2026-11-10 (film-feet):** stretch removed, level 1 starts where the drop ends; awaiting Doug's phone check, then move to DONE. Rounds 2-3 the same day: a foot lock removed the glide at the stop and the standing glide in the crane; level 1 now starts at (480.1, 135.2). About 20 cm of feet moving against each other is left in the look-round turn (per-leg IK would be needed).
      **Rounds 4-10 shipped 2026-11-11** (Doug approved round 9, then "push the film live"): no drop, level head, stepped turn, planted step over the wall, relaxed shoulders and arms, upright back, game sand, full wreck, softer shadows, hand-off light; level 1 start (486.5, 122.9), film version 6. Awaiting Doug's phone check, then move to DONE. Left: the get-up's placement slide and the look-round feet (see the work log).
      **Tried 2026-11-09, failed (two attempts, nothing pushed):** the plan to loop a run cycle does not work because the motion capture has no run after the landing. The drop clip ends in a crouched recovery, and the walk after the wall is only one or two strides; the "run" was that recovery sped up. Next account: get or build a real run/walk cycle (a new mocap clip or a generated one) and re-render that segment (about 11 minutes), keeping the held start spot.
- [ ] **#110 · Level 3 coin hand-off: Sela should drop the coin into the commander's hand, not throw it (Doug, 2026-11-09).** Today she tips the coin off her palm and it slides to his; he asked for a real drop into his open hand. Make the coin fall straight from her hand into his open palm (short vertical drop, hand under it, no throwing arc), keep the rounded fingers. Done check: phone-size stills of the coin leaving her hand, mid-fall and resting in his palm, from the game camera, and Doug confirms on level 3.

## Release 2 · one engine bump, existing packs re-pinned, a 15-level test pack (Systems lane)

Order: R2-1 → R2-2 → R2-3 → R2-4. Each runs after the one before it, since they share `sim`, the bots and
`generator/src/build.ts`. Claim the bump once, at R2-1. Doug: no full regeneration until the levels are aligned and the
story release is ready.

### Bundle R2-1: rules (Opus, sim + bots + rater; start now)
#131 joins if Doug picks the banked-scrap version.
- [ ] **#113 · Remove the pile-collapse loss (Doug, 2026-11-11).** The goal type is gone, but `sim/systems/goals.ts` still ends a
      level on a collapsed output pile. A full pile now only stops its processor. Remove the end check, its event,
      renderer and HUD text, bot avoidance and rater metric. Engine bump (shared with Bundle 8). Done check: unit test
      and golden replay.
- [ ] **#100 · Rangers walk through walls to reach hoppers unless the commander is outside the gate (Doug, 2026-11-08, playtesting s1-L017).** A Ranger's movement should not depend on where the commander is. He should path round the walls (out through the gate) to the hoppers whatever the commander does. Sim bug, so an engine bump (Systems).
      Done check: on s1-L017, hire the Ranger with the commander inside the walls; he walks out by the gate to the hoppers and never through a wall.
- [ ] **#33 · R6 #11 attackers appear off screen:** spawn past the visible map, worked out in real metres per family.

### Bundle R2-2: fixed generator settings and economy (Sonnet)
- [ ] **#111 · Fixed generator settings (Doug, 2026-11-11).** Make every setting that isn't a real difficulty lever a constant in
      `packages/generator/data/generator.json` (both ends of its range equal):
      - starting fuel 0.75 (the fill-the-fuel goal keeps its low start);
      - starting cash 0 everywhere, including the walls-before-wave-1 goal, which now starts with 0 walls (Doug: building
        them is that level's difficulty);
      - `costScale` 1, so item prices are fixed, and its threshold rules in `build.ts` (extra unlock, core-level, zone and
        processor-level pads) become goal or feature rules;
      - `margin` 0.37, and remove `reach` (unused);
      - shipped medians for the noise-level settings: premium, orderMax, bulkShare, heatPct, spareIdle, arrivalEvery,
        podFreeze, impatient, spawn, prebuiltRing, ringCost, baseHealth, waveGap, firstWave, arrivals (values in the plan;
        re-check the medians on 0.24.0 first);
      - forest, forestReach, pods, crates and dangerPrey drawn from the level seed, not from pressure, so the map stays
        fixed while the search runs;
      - the repeated-loop fix keeps only its length cut (no cash added, no hire-price cut).

      Per-level dials left: `length`, plus `swarm` and `waves` on defend. Done check: generator tests pass, and a
      6-level sample at targets 0.2 / 0.5 / 0.8 lands within 0.1 of its D.
- [ ] **#112 · Defend fuel hauler is a cheap scrap hire (Doug, 2026-11-12).** On defend levels the core fuel-supplier hire
      costs very little scrap and is open from the start, so the player hires it with the first scrap and moves on;
      burn rate barely matters there. Every defend level gets scrap the player can reach before wave 1 (today only about
      80% have scrap heaps). The bot plan buys it first. Done check: `levels:check` clean on defend levels, and the bot
      never hand-feeds the reactor after its first scrap.
- [ ] **#36 · N6 loop bound:** reject a candidate if any hand-done leg needs more than 5 trips with no affordable
      takeover. Store `loopMax` per level and re-check it in `levels:check`.
- [ ] **#39 · N10 rock slides hide something real:** `node.fuel_deposit` under the rubble, plus a generator check.

### Bundle R2-3: layout and waves (Opus)
Story level 5's authored waves are hand-tuned with the story owner.

**Combat values (Doug, 2026-11-05: "make your own best decisions").** Start from the arena PROPOSALS in
`client/src/dev/arenaModel.ts`, with drops equal to HP:
- Warlord and every other enemy: HP = points = drops, sized from #16's target `ρ` (Doug, 2026-11-07).
- Mites: acid spit (range 40, damage 1, every 2 s) and lunge (30, 0.3 s wind-up, 2 s cooldown).
- Dust crawler: 3 HP, drops 3 scrap, shot range 60.
- Wave share by count: about 70% mites, 20% crawlers, 10% raiders, with 1–3 warlords on the last two waves.
Retune by the attack–defence model (#16) and rater metrics, not by eye.

- [ ] **#99 · Generate pads so none sit behind a building or wall (Doug, 2026-11-08; the larger fix behind #89's pin-and-pole).** Attack levels with walls face south and east by default (the camera side), and every other pad is constrained not to stand behind a building or wall as seen from the camera. Generator and layout rule, so an engine bump and a pack rebuild; the pin-and-pole shipped in #89 covers hidden pads until then.
      Done check: `levels:check` clean, and a scan of the pack finds no pad hidden from the camera by a building or wall.
- [ ] **#41 · G4 / S27 hire pads always fully visible:** the generator places pads clear of model silhouettes, and
      **2026-11-08 (67ea2f4):** pads behind tall models now show faintly through; placement unchanged (generator/pack work, Bundle 8).
      fading never hides a pad. With #10, check the flat markers too.
      With flat markers (#10), this shrinks to placement clear of tall model silhouettes at the 30° camera.
- [ ] **#126 · Turrets border the path they cover, with their pads behind them (Doug, 2026-11-11, ops #45/#49).** A generator rule in `generator.json` `defendRoad` (`towerU`, pad side) plus `laneClear`/`siteR`, made one constraint with #99 so no pad is hidden from the camera. Engine bump; lands in the #121 test pack. Done check: a property test over many seeds shows each turret next to a road cell with its pads on the far side, reachable and visible; `levels:check` has no stall, lost win or star drop.
- [ ] **#24 · R6 #14 more attackers, mixed waves, multiple warlords** (inside #23; warlord values above).
- [ ] **#94 · Denser waves, not only bigger ones (Doug, 2026-11-08).** s1-L037's last waves lag a little at the end; wave design should favour more dense, smaller waves. Fold into Bundle 8's wave sizing from target ρ.

### Bundle R2-4: test pack and ship (Opus)
Re-derive the rater's `reference.json` (only 4 golden levels today), and do the iPhone dense-wave check before
building the test pack.
- [ ] **#121 · A 15-level test pack instead of a full rebuild (Doug, 2026-11-12).**
      - Re-pin the published packs to the new engine, so players keep their levels; fix or re-baseline any level that
        fails `levels:check`, as with #97.
      - The simplified generator (#111–#113) builds `levels/packs/r2-test`: 3 levels per family at targets 0.2 / 0.5 / 0.8.
      - Doug opens it from a hidden link (`?pack=r2-test`; a small client change, never listed for players).
      - Rewrite `start.json` (#44) from it.

      Done check: `levels:check` clean on the re-pinned packs and the test pack, live. Doug's phone check: open the link
      and play one level of each family. Look for: fuel is never the problem, prices feel the same from level to level,
      and on defend the fuel hauler is hired with the first scrap.
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
- [ ] **#115 · Re-measure the difficulty dials after the test pack (Haiku/Sonnet).** Rerun the within-level analysis of
      how far each remaining dial (length, swarm, waves, burn) moves D, on the new candidate log. Report whether targets
      0.15–0.8 are reachable per family; if not, widen that family's range before Release 3.

## Release 2b · hunting and healing (one engine bump, after Release 2 is live; Opus)
- [ ] **#22 · N22 the ranger is back, and hunting is a skill:** the ranger and commander one-shot a spiked hopper
      with `gunDamage`. Hoppers charge as a herd and wind up their bites. Hunting never kills: the injured lie down
      and wait for a medic. Hopper zones hold 0, 3 or 4 (this replaces R6 #12). The ranger pad itself shipped in
      0.20.0.
      **Doug, 2026-11-07, healing a hurt ranger when there's no medic yet:** a red cross bounces over the downed ranger;
      off screen, an edge arrow carries the cross. KILN: "The ranger is hurt, and we haven't trained a medic yet. He needs
      your help." When the commander reaches him, the commander kneels and a green cross bounces over the ranger, as with a
      medic. Evaluate whether every level with a medic should make the player do this once before the medic is hired.
      Hopper zones and the ranger pad (#7) must agree: no ranger pad within a herd's charge range.

## Release 3 · difficulty modes Cadet, Pilot, Captain (one engine bump, after Release 2 is live)

Agreed with Doug 2026-11-03 to 11-12. Plan and session briefs: `Mobile game/docs/refinement/PLAN-2026-11-11-difficulty.md`.
- **Names:** Cadet, Pilot and Captain, plus Auto ("Mission Control").
- **Levels 1–20:** always Cadet. The mode picker appears when level 21 starts and says the player has been playing on
  Cadet; after that the mode lives in Settings.
- **Families that can be lost** (defend now, and any future family with a failure mode) use this table:

  | | Cadet | Pilot | Captain |
  |---|---|---|---|
  | 3 stars on the 1st try | 85% | 50% | 30% |
  | 2+ stars on the 1st try | 95% | 70% | 50% |
  | Cleared on the 1st try | 99% | 90% | 80% |
- **Families that can't be lost** are set on stars and time (targets are waiting on Doug, above).
- **Each level keeps the same map in every mode;** only a few dials change.

Order: #116 needs the test pack. The tooling part of #117 can start now, and its fitting waits for #121. Then #118 (only
if #117 passes), then #119, then #120.

- [ ] **#116 · Hand-made modes test (Sonnet, small).** Hand-edit Cadet and Captain versions of 3 test-pack levels (one
      defend, one harvest, one rescue) with only the planned mode dials:
      - burn 2.9 / 2.1 off defend;
      - swarm ±20% on defend;
      - length ±20% elsewhere.

      Put them in a dev-only pack and run the bot ladder. Pass: clear and star rates within 15 points of the agreed
      bands, then Doug plays the defend and harvest versions. Fail: pick other dials from #115 before any pipeline work.
- [ ] **#117 · Model A, a fast stand-in for the bots (Sonnet; tooling can start now, fitting waits for #121).** An
      offline tool, `tools/model-a/`:
      - **Data:** exported from `levels/candidates/*.jsonl` and `levels/eval/*` (current engine only, split by level).
      - **Model:** gradient-boosted trees that predict D, whether a level can be won, and win rate per bot.
      - **Builds on:** the attack–defence model (#16) is an input, and the search start table (#44) is the baseline to
        beat; neither is duplicated.

      Pass: D error 0.08 or less on held-out levels and better than the start table. Fail: stop, and #119 uses batches
      of 10.
- [ ] **#118 · Model-guided search (Opus; only if #117 passes).**
      - `search.model: off|propose` in the generator: the model proposes, the bots verify, and the old search takes over
        after 2 misses.
      - The model file's hash is pinned in `pack.json`.
      - Done check: on one 20-level batch, bot ratings per level are at least halved and no fewer levels land on target.
- [ ] **#119 · Mode variants in each level (Opus, engine bump).**
      - The level file gains `variants` for Cadet and Captain (params, objectives, prices); `compile.ts` merges the chosen
        one, and the mode is part of the replay input.
      - The generator searches only the mode dials for the Cadet and Captain targets, with the map frozen.
      - `levels:check` replays all three modes, and a test checks Cadet ≤ Pilot ≤ Captain in difficulty.
      - A levels-next batch must finish inside GitHub's 6-hour job limit.
- [ ] **#120 · Modes in the game (Sonnet, client).**
      - **Picker:** shown at the start of level 21 ("You've been playing on Cadet…"), and the mode lives in Settings.
      - **Mission Control:** at most one step per level; one step easier after 2 fails; one step harder after 3 first-try
        3-star clears; the current mode is shown on the level intro.
      - **Guide arrows** (approved 2026-11-12): they appear after 20 s without progress on Cadet and 45 s on Pilot.
        Captain never shows them from level 21 on, and the Settings toggle is greyed out.
      - Telemetry records the mode per attempt.

      Doug's phone check:
      1. Finish level 20: the picker shows.
      2. Pick Captain: level 21's intro says Captain, and no arrows appear however long you stand still.
      3. On Mission Control, fail a level twice: the retry says Pilot.

## Deferred (each says what it waits for)
- [ ] **#114 · The "transformed game" reset (Doug, 2026-11-12).** Wipe levels 31–100+ and reset every player to new:
      progress, stars, coach marks and seen films, with no "keep progress" choice. Everyone starts at level 1 and sees
      "The game has transformed since you first started. You're gonna want to see this!" Same release: trim the nightly
      review's pack list, archive (don't delete) the wiped packs' candidate and eval logs, and simplify `index.json` and
      the re-pin list. **Deferred until the major storyline updates are live and the levels are aligned.**
- [ ] **Model B, bots to real players.** Calibrates bot results against real players' fail rates. **Deferred until there are
      enough players** (the telemetry store exists since 2026-11-06).
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
