# Backlog

This is the only task list for Farthest Outpost. Every open item lives here, whatever the round, account or
session that raised it. This file replaced `BACKLOG-R4/R5/R6.md`, `BACKLOG-STORY.md` and the open boxes in
`POLISH-PLAN.md` and `RELEASE.md` on 2026-11-07. Those files are now in `docs/archive/`.

**How to use it**
- **Every item has a permanent number** (`#12`). Refer to items by it. Numbers are never reused or renumbered: a
  new item takes the next free number (currently **#63**), whatever section it goes in. Older ids (R6 N2, S24 …)
  stay beside the number, so references in code, commits and the archive still resolve.
- Add new work here as one numbered checkbox, whether it comes from Doug's feedback, a refinement round or a delivery
  plan. Give it an owner where that matters, and a done check. No new `BACKLOG-*` files.
- Tick an item when it lands, with one line on what was seen and where (local, live or iPhone). "Done" means
  verified live. Done items move to `docs/archive/DONE.md` under the date, keeping their number.
- Claims, the change log and engine-bump coordination stay in `docs/STORY-WORK-LOG.md`. Decisions go in
  `docs/DECISIONS.md` once they ship.
- Background for an old id is in its archived round file (search the id in `docs/archive/`).

**Terms.** *Animations* means every scripted story beat with character motion: rendered films, machinima, and live
scenes where play pauses while one character's movement plays out (Doug, 2026-11-07).

## 1. Waiting on Doug

- [ ] **#1 · `empty_bays` against the films (Sign-off 2).** It plays at the end of story level 2 on
      https://final-outpost-rho.vercel.app (story films replay on every play while `REPLAY_FILMS` is on). Nothing
      is waiting on it. Close it if it reads fine.

## 2. Ready now (no engine bump)

- [ ] **#2 · Only the new title loop ever shows (Doug, 2026-11-07; bug, do first).** At first the old background
      showed while the animated loop loaded. Now the loop never appears, only the old SVG-style home background.
      Found so far: the live bundle's `/assets/title_loop-*.mp4` serves fine (200, 1.2 MB, video/mp4). `title.ts`
      keeps the video hidden until frames flow and removes it on `error`, leaving the canvas fallback.
      Likely cause, to confirm: the service worker now serves the cached video as a plain 200, and iPhone Safari
      needs range (206) responses for video. So it worked before the cache filled, and fails once it is cached.
      Fix: exclude the mp4s from precache, or serve range requests, and never paint the old background. Show a
      plain dark frame (or the loop's first frame as a poster) until the video plays. Check on an iPhone, live,
      after a second visit.
- [ ] **#3 · S24 Two more sealed pods at the crash site (Doug, 2026-11-07: option 1).** Add two sealed
      `decor.stasis_pod` + `decor.stasis_glass` pairs toward the back of the wreck in `story-L001..5.json`, so the
      deck shows five (the commander's open pod, bay 5 open from level 3, three sealed). They must stay **out of
      frame of `crash_open`** (the first film), and clear of the game's start view and the film's held level edits
      (#48). No scene or line changes.
- [ ] **#4 · S40 KILN the same size on screen in every level, and closer (Doug, 2026-11-07).**
      Why level 5 looks zoomed out: its family is `defend`, and `content/data/look.json` `viewW` shows 300 units
      of ground across the screen on defend levels against 170 everywhere else (L1 shelter, L2 rescue, L3 harvest
      and L4 industrialize all use 170). KILN is sized in world units (`spiritFollow` size 1.1 in all five cue
      blocks), so it shrinks with the wider view.
      Fix: size KILN against the screen, not the world (scale by `viewWFor(family)` / 170, or size it in screen
      space). Use level 5's on-screen size, so levels 1–4 KILN gets smaller (about 57% of today). Bring it to about
      1 m (28 units) from the commander's head. Today `right: 60, up: 16` puts it about 2.2 m away.
      Done check: a screenshot of KILN at its first line in each level, at phone size, all the same size.
- [ ] **#5 · S41 Sela's buggy at the signed-off size (Doug confirmed several times; last on 2026-11-07).** Use the
      sandbox's size, also used in the `sela_arrival` scene: 2.64 m long (the 4.4 m build x 0.6). Merge the
      reduced model from branch `story-buggy` (39.9k tris, 2.5 MB, two wheels) at that size, then wire it into
      level 3 with headlights and the drive to the kiosk. No further sign-off.
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
- [ ] **#7 · P7 Ship the revised ranger pad rule.** Doug, 2026-11-07: the ranger hire pad goes inside the hunting
      grounds, clear of the burrow models. If that fails, it goes just inside the gate nearest them, or on the
      settlement edge facing them when there's no wall. Manual first. It is built but uncommitted in worktree
      `fo-wt-plot` (branch `plot-p1-p6`, behind main): `generator/src/build.ts`, the `ranger` block in
      `generator/data/generator.json`, rebuilt `s1-L017` / `s1-L034`, `pack.json`, `build-log.json`, `docs/LEVELS.md`
      and the 2026-11-07 digests. Steps: commit on the branch, merge main, `pnpm check`, `pnpm levels:check`,
      rebuild L017/L034 if the merge touched the generator, release notes, push, verify live. The same worktree
      holds uncommitted retry output for s1-L012 / s1-L037. Land it only if `levels:check` stays clean, else
      discard it.
- [ ] **#8 · P8 Drop s1-L065** (Doug, 2026-11-07). It is pinned to content 0.17.0, so the client can't load it.
      Remove it from the `s1-051` pack and the pack index, and don't rebuild it.
- [ ] **#9 · Rater detail for every eval (Doug, 2026-11-07).** Today the packs store only each level's totals
      (`rating.difficulty`, `rating.fun`, `botMargin`, `botsPassed`, `stars`), so no one can see why a level scores
      what it does. Throw those totals away as the record, and capture every sub-point of the AI-driven evaluation,
      for every level, not only defend:
      - each fun proxy's raw value and score (`closeFinish`, `lateUncertainty`, `tensionRhythm`, `decisiveness`,
        `rewardCadence`, `deadTime`, `fairFailure`, `novelty`, from `rater/src/fun.ts`);
      - each difficulty feature (`skillNeeded`, `marginRef`, `marginMedian`, `lifelineRisk`, `concurrentDemand`,
        `routeLoad`, `threatPressure`, `animalHits`, `economyTightness`, `moduleCount`, `novelty`, from
        `rater/data/weights.json`) with its weighted contribution;
      - the per-profile bot results behind them (win, margin, stars, stall reason, `ticks`).
      Write them into each level's `rating` and into the candidate digest. Re-rate the current pack (no rebuild
      needed if rating is separate from generation), and add a sandbox or `docs/LEVELS.md` table that shows the
      breakdown per level. Then #35 (defend fun) can be decided from data.
- [ ] **#10 · Flat ground markers instead of raised pads (Doug, 2026-11-07).** Replace the raised standing pads
      with 2D projections on the ground: a light or dark marking in the same shade as the guide arrows, so it
      contrasts in any lighting. Applies to every pad kind (hire, build, upgrade, warehouse, clear). Done check: pads
      read clearly in day, dusk, night and storm light on a phone.
- [ ] **#11 · R6 #9 Cutscenes in the level menu.** Replay after Start Over (`save.ts` keeps the seen ones), a "!"
      until a cutscene's version is watched, and list only cutscenes from levels reached. Held until the story claim
      on `client/src/app.ts` clears and `REPLAY_FILMS` is off.
- [ ] **#12 · S6 Show what is happening.** Characters act out their lines with the generic `{ walk, to }` director
      action. Rhee's and Okafor's walks are done. Still to do from the screenplay's stage notes: Rhee kneeling beside
      Pip, hires walking to their posts in level 4, and the commander picking up the helmet.
- [ ] **#13 · S42 KILN on screen when it teaches a new skill (Doug, 2026-11-07).** On levels after 5, when a KILN
      coaching line teaches a mechanic for the first time, KILN's cloud appears beside the commander for that line,
      as it does in levels 1–5, instead of the line showing alone. Same on-screen size as #4.
- [ ] **#14 · S43 The training levels teach wall building (Doug, 2026-11-07).** Today level 2 starts with a prebuilt
      ring, so the walls appear from nowhere. After the freezing pods are rescued, the player builds the walls (wall
      pads with a goal card and a line saying why: the night and the raiders). Needs a look at which level carries
      it (2 or 3), whether a wall pad exists in the rules (an opt-in option if not), and the bots' and
      `levels:check` result.
- [ ] **#15 · Actions animated (low priority; Doug kept it 2026-11-07).** Gathering, depositing and machines
      processing show visible work, not just items appearing. Converters show input going in, the machine working,
      and output coming out.

## 3. Release 2: combat and economy (one engine bump, one pack rebuild)

Order: Bundle 5 (Opus, one session, `sim` + `bots` + `rater`), then Bundle 6 (Opus, generator). Then claim
the bump in `docs/STORY-WORK-LOG.md`, rebuild in the background, run `levels:check`, re-pin golden and story
levels (the story owner re-checks 3–5), `levels:start-table`, release notes, deploy, and an iPhone frame-rate
check with dense waves. Engine 0.20.0 (plot P1–P4) has already shipped, so this release is 0.21.0.

**Combat values (Doug, 2026-11-05: "make your own best decisions").** Start from the arena PROPOSALS in
`client/src/dev/arenaModel.ts`, with drops equal to HP:
- Warlord: 24 HP, 24 points, 24 scrap.
- Mites: acid spit (range 40, damage 1, every 2 s) and lunge (30, 0.3 s wind-up, 2 s cooldown).
- Dust crawler: 3 HP, drops 3 scrap, shot range 60.
- Wave share by count: about 70% mites, 20% crawlers, 10% raiders, with 1–3 warlords on the last two waves.
Retune by the attack–defence model (#16) and rater metrics, not by eye.

### Bundle 5: combat
- [ ] **#16 · P9 Attack–defence model: one formula as the common reference and control lever (Doug, 2026-11-07;
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
      **Research (2026-11-07), recommended combination:**
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
      harder in Hind & Harvey's test. Sources are in the 2026-11-07 chat.
- [ ] **#17 · N2/N3 ranged raiders:** a real ranged attack with a sim "shot" event (today they only hit on contact).
- [ ] **#18 · N2 mites lunge and spit acid** (numbers above).
- [ ] **#19 · N19 nobody stops to shoot:** every mobile fighter keeps closing while it shoots and switches to melee at
      contact reach. Towers stay put. Each species spits its own acid colour (`arenaModel.ts` `closeIn`,
      `ACID_COLOR`).
- [ ] **#20 · N20 footprints and touch melee:** each character keeps its model's footprint, and melee means touching.
      The commander walks through anyone, and drones fly over.
- [ ] **#21 · N21 guards, medics, bleed-out:** medics can't be hurt. A downed guard takes half damage and dies at 0
      unless a medic reaches it. The commander can be killed by attackers. Rater metric: guard deaths per wave.
- [ ] **#22 · N22 the ranger is back, and hunting is a skill:** the ranger and commander one-shot a spiked hopper
      with `gunDamage`. Hoppers charge as a herd and wind up their bites. Hunting never kills: the injured lie down
      and wait for a medic. Hopper zones hold 0, 3 or 4 (this replaces R6 #12). The ranger pad itself shipped in
      0.20.0.
- [ ] **#23 · N23 dense mixed waves:** rows several abreast, mixed evenly (`waveOrder`). This sizes #24 and #25.
- [ ] **#24 · R6 #14 more attackers, mixed waves, multiple warlords** (inside #23; warlord values above).
- [ ] **#25 · R6 #15 faster arrivals:** biggest wave within about 30 s; check the iPhone frame rate.
- [ ] **#26 · N18 dust crawlers in waves** (`hostile.creature`, scrap drop, share as above).
- [ ] **#27 · N12 more damage per attacker,** set from #16's target `ρ` and the defender-losses-per-wave metric.
- [ ] **#28 · N8 drones dock between waves** and don't spawn until the next wave; they keep their HP.
- [ ] **#29 · N15 + N17 no character overlaps another:** integer separation in the sim. Fliers only avoid other
      fliers.
- [ ] **#30 · N5 blaster fire, rest:** turret (`struct.ranged_defense`) and drone shots as travelling glow bolts with
      muzzle and impact flashes and a ground glow. There is no drone shot event yet. The renderer part of N5 is done.
- [ ] **#31 · G3 / S23b rifle lasers everywhere,** including hunting shots and the hunter role. Check level 5's
      raiders, guards and turrets once this lands.
- [ ] **#32 · N4 scrap lands where it can be reached:** snap drops to the nearest walkable point (`spawnDrops`).
      Required with #33.
- [ ] **#33 · R6 #11 attackers appear off screen:** spawn past the visible map, worked out in real metres per family.
- [ ] **#34 · G7 drop the tow line's slack rule:** remove `lasso.slackTime` / `slackTicks`, the `tow_dropped`
      "slack" reason, the bots' never-stand-still rule, and the hint and skin text.

### Bundle 6: economy and generator
- [ ] **#35 · Defend fun threshold.** Defend levels rate F 0.1–0.3 against the 0.4 bar (waves_survived 0.07,
      turret_level 0.19, survive 0.37, against 0.8–0.9 for most economy goals). Decide from #9's per-proxy data
      whether to fix the proxies or set a defend threshold. #16 should lift `closeFinish` and `lateUncertainty`.
- [ ] **#36 · N6 loop bound:** reject a candidate if any hand-done leg needs more than 5 trips with no affordable
      takeover. Store `loopMax` per level and re-check it in `levels:check`.
- [ ] **#37 · R6 #13 the hands-off goal needs x machines running** (a new `machines` param on automate).
- [ ] **#38 · N13 core levels matter (power budget).** No longer needed for defence cost (#16 covers that). Keep it
      only if core upgrades still go unbought after #16; otherwise drop it.
- [ ] **#39 · N10 rock slides hide something real:** `node.fuel_deposit` under the rubble, plus a generator check.
- [ ] **#40 · N6b level-order audit:** a pack check for repeated goal kinds and templates.
- [ ] **#41 · G4 / S27 hire pads always fully visible:** the generator places pads clear of model silhouettes, and
      fading never hides a pad. With #10, check the flat markers too.
- [ ] **#42 · N24 follow-up: more levels with belts** (only 4 of 55 have one).
- [ ] **#43 · Bot tow loop through a wall:** `Brain.loopAround` can place loop points inside a ring.
- [ ] **#44 · Search start table per engine:** make `startPressure` ignore a `start.json` from another engine, then
      rewrite it with `pnpm levels:start-table` from this rebuild.
- [ ] **#45 · Levels far off their target D** (L23, L26, L27, L28, L35, L44, L47 in 0.16.0): re-check against the
      latest digest. Give the sequencer per-goal D ranges where a goal can't reach its target.
- [ ] **#46 · Release 2 ship steps:** engine bump, rebuild, check, re-pin, release notes, deploy (see the order
      above).

## 4. Level 1 opening film (`crash_open`, Release 3)

Nothing player-facing has shipped. Stage 1 (blocking stills) and stage 2 (animation test) are done; Doug has not
approved a full render. The tools and run command are in the WRAP UP hand-off in `docs/STORY-WORK-LOG.md`.
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

## 5. Seen only in code or locally: check live

Built and shipped, but never seen working on the Vercel URL or an iPhone. Tick each one when it is seen, or
reopen it here.
- [ ] **#50 · R6 Release 1 HUD and art:**
      - R6 #3 "Finish in x:xx" as the last star (s1-L008)
      - R6 #4 goods on belt tops (s1-L014)
      - R6 #6 impatient trader "!" (s1-L013)
      - R6 #7 no lot-edge pipes
      - R6 #8 smooth code-built objects
      - N16 the old homepage flash (needs two real deploys; see #2)
- [ ] **#51 · R6 #1 and #2 through a real wave:** icons still between waves; the VIP icon mid-fill.
- [ ] **#52 · Step A renderer items:**
      - red bolts in a real raid
      - the healing cross with a real medic, and the medic's kneel (the `care` clip may read as picking up rather
        than kneeling)
      - trader order pictures in a live bubble
      - fireworks after a real win (S22)
      - the shovel at a real rockslide (S23, level 3)
      - wall fade on an iPhone, and the core fade in a story level
- [ ] **#53 · G5 / S8 arrows follow the goal:** story level 3 (kiosk, then rockslide).
- [ ] **#54 · G6 / S9 one loop around close pods:** level 2 goal 2's pair, on screen together.
- [ ] **#55 · S33 `vale_run`** ("Vale?" as the commander runs two steps toward the screen with the helmet): check it
      on a phone once #6 is re-staged.

## 6. Release gates (web, then stores; details in `docs/RELEASE.md`)

- [ ] **#56 ·** At least 20 cached levels play start to finish in airplane mode on a mid-range iPhone at 60 fps (2D)
      / 30 fps (3D).
- [ ] **#57 ·** The save survives a cleared cache (export/import in v1).
- [ ] **#58 ·** The playtest retention target is met.
- [ ] **#59 ·** Bot regression suite: no stalls or infeasible levels in any shipped pack.
- [ ] **#60 ·** A 15–30 s preview video.
- [ ] **#61 ·** A support URL and contact.
- [ ] **#62 ·** Original names, art and themes only.
