# Done

Items ticked in `docs/BACKLOG.md` move here once they are verified live, newest date first, with the line on what
was seen. Work finished before 2026-11-07 is ticked in the archived round files beside this one
(`BACKLOG-R4.md`, `BACKLOG-R5.md`, `BACKLOG-R6.md`, `BACKLOG-STORY.md`, `POLISH-PLAN.md`).


## 2026-11-09 (Vale and First Watch)

- [x] **#6 · S32 The lieutenant's fall, re-staged (with #55).** In First Watch (story level 5) the warlord stops at its stand-off (`bossStandoff` 70) where guards, turret and commander can all hit it; the commander's last shot plays the in-level fall (Vale thrown on her back, helmet off and rolling, rolls over, gets up), then she runs off in play as Vale at her stride speed; KILN's lines and helmet dots follow; `helmet_reveal` then "Vale?" (`vale_run` dropped). Shots meet characters at the chest. Light dims steadily all level to the helmet film's dark orange and climbs back toward sunrise after it. RAIDER portrait is Vale in the black helmet. Live 2026-11-09 (main `cd3d37f`); Doug: "vale and L5 approved".

## 2026-11-08 (storm look)

- [x] **#79 · Dust storms look like Doug's reference (orange haze, embers, warm dark grade).** New look only: rust storm fog and ambient, a darker key light, lit haze on the far side of the view, a rust vignette and blowing embers in the one-pass storm shader (`softfx.ts` `StormDust`; skin tokens `stormGlow`, `stormEmber`). Live 2026-11-08 (main `ce40366`); Doug: "storm looks great". Step 2 (medium cloud bank) not needed. Dev check: `__lookEnv.stormHold = 1`.

## 2026-11-07 (levels after 60 removed, Doug)

- [x] **#8 · P8 Drop s1-L065** (Doug, 2026-11-07). It is pinned to content 0.17.0, so the client can't load it. Live 2026-11-07 (commit 01fc2d7): index.json lists only s1; the level list ends at 60.
- [x] **#77 · Five shipped packs are pinned to old engines (found 2026-11-07, Bundle 1).** `levels/packs/index.json` ships Live 2026-11-07 (commit 01fc2d7): all eight later packs deleted; pack.test.ts now checks every listed pack and level is pinned to the current engine; s1-L008 loads at "Level 8 / 60".
- [x] **#74 · Unique level ids across packs (from #40).** L051–L060 exist in both s1 and s1-051 and the client keeps Live 2026-11-07 (commit 01fc2d7): s1-051 deleted, so ids are unique (new pack.test.ts check); L060 loads at "Level 60 / 60".

## 2026-11-07 (refinement panel; Doug approved the bundles)

- **Merged** (the number now lives inside another item): #13 → #4, #19 → #17, #23, #25, #27 → #16, #29 → #20,
  #55 → #6, #71 → #7.
- **Dropped:** #38 N13 power budget. #16 covers defence cost; reopen it only if #9's data shows core upgrades
  going unbought.
- **Made a standing rule:** #62 (original names, art and themes only) is now in `CLAUDE.md` Conventions.
- **Doug's answers:** #14 wall building goes in level 3. Enemy HP follows #16: HP = points = drops, sized from target
  `ρ`. Attackers can't damage turrets. Healing a hurt ranger with no medic is in #22. #6: the game's warlord is paused
  and hidden during the fall, then Vale's head on the warlord body runs off. KILN is 1 m from the head at the scale of
  levels 1–4 (#4). This session claims the story files. Cleanup of #68–#73 is approved.

## 2026-11-07 (older items reviewed with Doug)

- **Upgrades that mean something:** done. Tier models are in the game (`sink.core.l2/l3`, `struct.barracks.l2`,
  turret heads `struct.ranged_defense.head1-3`), and Doug has seen the upgraded reactor and turrets.
- **Specific pad icons:** done. Hire pads draw a role icon (`renderer.ts`: register for cashier, pick or basket for
  supplier, wrench for operator, tray, crate for hauler, shield, scope, cross). Doug has seen the cashier and hauler
  pads. The operator pad shows a wrench rather than the machine's silhouette.
- **Gemini images → Meshy models:** dropped (Doug).
- **R4: generate about 5 levels for Doug to playtest:** dropped (Doug).
- **Actions animated:** kept, at low priority (now backlog #15).
- **Vale's face in the fall (S32):** Doug is fine with the face showing.

## 2026-11-07 (Doug's decisions)

- **Level 1 sign-off, removed as an item.** Nothing waits on it, and every story level gets signed off in the end
  anyway. The `crash_open` film approval stays in the backlog (section 4).
- **Q2 KILN size and Q4 the old pod in level 2's goal:** closed as shipped. KILN's size now lives under S40.
- **S39 The escape pod is burnt Ship Scrap 2 (L2)** (story-vale-scrap, 0dc66ae): `capture.recruit_container_decoy`
  is Ship_Scrap_2 with the `scorch` tint, replacing the S20 tinted stasis pod and the S31 hinged glass.

## 2026-11-07 (backlog consolidation)

- **R6 G8 realistic storm dust.** Doug, 2026-11-05: "the storm dust in live L1 looks realistic, that is the
  target." It was never ticked in `BACKLOG-R6.md`.
- **Plot P1–P6** (engine 0.20.0, 4f9b997, verified live): warehouse drop-only for the player, the parts works input
  worker withdrawn if the belt is built first, bent Kiosk queues, the ranger hire pad on hunting levels, the pack
  test, and s1 starting at level 6 again. These were tracked in the plot chat's `OPEN-ITEMS-plot-layout-chat.md`,
  outside the repo.

## 2026-11-09 (wind-down tidy)

Shipped and live; items waiting on Doug's phone stay in "Waiting on Doug".

- [x] **#76 · Screen-probe pass for the never-seen-live items.** Run `pnpm review:probe` on s1-L008, s1-L013, s1-L014 and
      story levels 2–3 (bot-driven, phone-size) and use its shots as evidence for #50, #51, #53 and #54. What the probes
      can't show (real iPhone Safari, frame rate, the medic kneel, fade feel, two-deploy update) becomes one short list of
      iPhone checks for Doug.
      **Done 2026-11-07:** shots and notes in `docs/review/probe-2026-11-07/` (README names each shot); five levels, no page errors;
      iPhone checklist is under "Waiting on Doug". Ran against a hand-started vite server (`--base`) because `probe.ts` resolves
      `vite/bin/vite.js`, which the installed vite's `exports` blocks (ERR_PACKAGE_PATH_NOT_EXPORTED): its own server start is broken.

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

- [x] **#78 · `review:probe` can't start its own server (found 2026-11-07, #76).** `tools/review/probe.ts` resolves
      `vite/bin/vite.js`, which the installed vite's `exports` blocks (ERR_PACKAGE_PATH_NOT_EXPORTED), so the probe only runs
      against a hand-started server. Start vite through its JS API or the `.bin` shim. Done check: `pnpm review:probe` on
      s1-L008 runs end to end with no server started by hand, locally and in the nightly workflow.
      **Done 2026-11-08 (bed725e):** `probe.ts` starts vite through its JS API; `pnpm review:probe` on s1-L008 ran end to end locally (15 findings, 18 shots). The nightly run is not yet seen.

- [x] **#98 · Upgrade outline only while the player stands on the pad (Doug, 2026-11-08).** An upgrade's ghost shows only while the player is on that pad paying in; it hides on stepping off and returns on coming back. New-build ghosts unchanged. Renderer only (`syncPads`), no engine bump.
      Done check: on a level with an upgrade, stand on the pad (outline shows), step off part-paid (gone), step back (returns), live.
      **Shipped 2026-11-08 (fe87bb1): the upgrade ghost shows only while standing on the pad; Doug confirmed.**

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

- [x] **#10 · Flat ground markers instead of raised pads (Doug, 2026-11-07).** Replace the raised standing pads
      **Live 2026-11-08 (67ea2f4):** flat decals in guide-arrow shades, faint see-through copy behind tall models; checked at phone size in Chromium only (day/storm/night; dusk simulated). iPhone check: #84.
      with 2D projections on the ground: a light or dark marking in the same shade as the guide arrows, so it
      contrasts in any lighting. Applies to every pad kind (hire, build, upgrade, warehouse, clear). Done check: pads
      read clearly in day, dusk, night and storm light on a phone.
      **Refinement (mobile):** pads already draw a flat canvas decal (`renderer.ts` ~1983); the raised part is the pad
      model. Hide the model, make the decal the pad, colour it from the guide arrow tokens (`scene/groundmarks.ts`) with a
      dark outline. Perf is neutral or better. Then #41.

- [x] **#43 · Bot tow loop through a wall:** `Brain.loopAround` can place loop points inside a ring.
      **Landed 2026-11-08 (6dc3639):** tow loop points stay on walkable ground; new bots test.

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

- [x] **#34 · G7 drop the tow line's slack rule:** remove `lasso.slackTime` / `slackTicks`, the `tow_dropped`
      "slack" reason, the bots' never-stand-still rule, and the hint and skin text.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#17 · N2/N3 ranged raiders:** a real ranged attack with a sim "shot" event (today they only hit on contact).
      **Merged:** #19 (nobody stops to shoot; Doug's acid colours per species) is part of this item.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#18 · N2 mites lunge and spit acid** (numbers above).
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#20 · N20 footprints and touch melee:** each character keeps its model's footprint, and melee means touching.
      The commander walks through anyone, and drones fly over.
      **Merged:** #29 (no character overlaps another: integer separation, fliers avoid only fliers) is part of this item.
      Use a spatial hash: separation over about 200 bodies is O(n²) without one, and must stay deterministic.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#21 · N21 guards, medics, bleed-out:** medics can't be hurt. A downed guard takes half damage and dies at 0
      unless a medic reaches it. The commander can be killed by attackers. Rater metric: guard deaths per wave.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#26 · N18 dust crawlers in waves** (`hostile.creature`, scrap drop, share as above).
      **Refinement:** `hostile.creature` drops `res.food_raw_2` today (`content/data/enemies.json`), so this is a content
      change to scrap = HP. Its wave share is sized by #16.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#28 · N8 drones dock between waves** and don't spawn until the next wave; they keep their HP.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#32 · N4 scrap lands where it can be reached:** snap drops to the nearest walkable point (`spawnDrops`).
      Required with #33.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#30 · N5 blaster fire, rest:** turret (`struct.ranged_defense`) and drone shots as travelling glow bolts with
      muzzle and impact flashes and a ground glow. There is no drone shot event yet. The renderer part of N5 is done.
      **Refinement:** the sim emits a real `shot` event only for the player; turret, drone, raider and hunter shots need
      sim events (engine bump). Do with #31.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#31 · G3 / S23b rifle lasers everywhere,** including hunting shots and the hunter role. Check level 5's
      raiders, guards and turrets once this lands.
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#37 · R6 #13 the hands-off goal needs x machines running** (a new `machines` param on automate).
      **Shipped 2026-11-08 in engine 0.22.0 (01c2492), live; seen headless only. Doug's phone check: #85.**

- [x] **#86 · KILN closer and the same size in L1–5 (Doug, 2026-11-08).** Bring KILN about 30% closer to the commander in levels 1–4, and make its size match level 5 (L1–4 look slightly smaller now; L5 looks right). Done check: screenshots at phone size of L1–L5 with the same on-screen size and distance. Includes level 1, which has never been captured.
      **Shipped 2026-11-08 (e4e1df3), live. Doug's phone check: #83/#87 follow-up if anything is off.**

- [x] **#87 · Level 3 wall: leave a gap between the back wall and the rock piles (Doug, 2026-11-08).** The wall is good, but builders get stuck building from the outside when the ring touches the rock piles. Done check: every section reachable from outside; `levels:check --pack levels/story` still builds the wall.
      **Shipped 2026-11-08 (e4e1df3), live. Doug's phone check: #83/#87 follow-up if anything is off.**

- [x] **#88 · Buggy arrival (Doug, 2026-11-08).** Today Sela walks beside the buggy and it rolls with no driver. Skip that part of the cutscene or cut it before she gets out, so the buggy drives all the way to the stall, she gets out, then goes to the stall. Keep the buggy in frame during the animated section.
      **Shipped 2026-11-08 (e4e1df3), live. Doug's phone check: #83/#87 follow-up if anything is off.**

- [x] **#89 · Pads and occlusion (Doug, 2026-11-08; replaces #41's faint see-through).** Keep the flat look (Doug likes it). A player or character in front of a pad must hide it: no pad drawn on top of a character. A pad behind a wall or building must still be findable: it showed at full strength, so try dashed lines, a pulse, and a fainter copy, and show Doug mocks of each (phone-size screenshots, same scene) before choosing. These are the operate pads (clerk pad and so on), not just the pads Doug first thought of.
      **Shipped 2026-11-08 (fb98a4d, c8a945b, 2eb87a5, b0f0bae): character in front hides the pad; a pad behind a wall or building shows as a pin and pole (no outline); Doug confirmed.**

- [x] **#90 · Trader order pictures 2x the size** in the bubble (Doug, 2026-11-08).
      **Shipped 2026-11-08 (36325b4 and later): trader order pictures at 2x; Doug confirmed.**

- [x] **#93 · Hold poses (Doug, 2026-11-08).** The protein hunter holds his gun oddly, walking and shooting: straighten it. The hauler holds his pick the wrong way round (sharp point up): point it down. Done check: stills of walk and shoot for the hunter and of the hauler's carry, from the game camera.
      **Shipped 2026-11-08 (cd10a7d, b33ac0d): pick spike leads and points down for commander and hauler (Doug approved the pick position 2026-11-09); hauler re-baked with the pick as its own part; ranger rifle aligned to the shooting pose.** Doug confirmed 2026-11-09: ranger gun line good enough for now; to be improved later.

- [x] **#91 · Attackers spread out at the gate rather than lining up in a queue (Doug, 2026-11-08).** #85 3: they should fan out around the gate.
      **Shipped 2026-11-08 in engine 0.23.0 (da748e2): attackers fan out at the gate. Phone check: #96.**

- [x] **#92 · Guards: a visible 15 s timer after a fall (Doug, 2026-11-08).** A guard died instantly when shot down. A downed guard has 15 s, shown on screen, for the commander or a medic to heal it before it dies. A medic can't arrive during the fall animation itself. Property test, bot behaviour, HUD.
      **Shipped 2026-11-08 in engine 0.23.0 (da748e2): a downed guard has a visible 15 s timer. Phone check: #96.**

