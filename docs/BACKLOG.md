# Backlog

This is the only task list for Farthest Outpost. Every open item lives here, whatever the round, account or
session that raised it. This file replaced `BACKLOG-R4/R5/R6.md`, `BACKLOG-STORY.md` and the open boxes in
`POLISH-PLAN.md` and `RELEASE.md` on 2026-11-07. Those files are now in `docs/archive/`, and items keep
their old ids (R6 N2, S24 …), so references in code, commits and the archive still resolve.

**How to use it**
- New work, whether it comes from Doug's feedback, a refinement round or a delivery plan, is added here as one
  checkbox with an id, an owner where it matters, and a done check. New ids follow the section's prefix
  (`R7 #n` for a new round's items, `S<n>` for story levels 1–5, `P<n>` for plot and level rules). No new
  `BACKLOG-*` files.
- Tick an item when it lands, with one line on what was seen and where (local, live or iPhone). "Done" means
  verified live. When an item is done, move it to `docs/archive/DONE.md` under today's date.
- Claims, the change log and engine-bump coordination stay in `docs/STORY-WORK-LOG.md`. Decisions go in
  `docs/DECISIONS.md` once they ship.
- Background for an item is in its archived round file (search the id in `docs/archive/`).

## 1. Decisions waiting on Doug

Terms: **animations** means every scripted story beat with character motion: rendered films, machinima, and live
scenes where play pauses while one character's movement plays out (Doug, 2026-11-07).

- [ ] **`empty_bays` against the films (Sign-off 2).** Doug asked to see it (2026-11-07). It plays at the end of
      story level 2 on https://final-outpost-rho.vercel.app (story films replay on every play while `REPLAY_FILMS`
      is on). Nothing is waiting on this any more, because the other live scenes were built anyway. Close it if
      it reads fine.
- [ ] **Defend fun threshold (R6 Bundle 6).** Doug asked for a summary of `rater/src/fun.ts` first (given in chat
      2026-11-07). Next: measure the per-proxy breakdown on the defend levels (the pack stores only the total F),
      then fix the proxies or set a defend threshold.

## 2. Ready now (no engine bump)

- [ ] **S24 Two more sealed pods at the crash site (Doug, 2026-11-07: option 1).** Add two sealed
      `decor.stasis_pod` + `decor.stasis_glass` pairs toward the back of the wreck in `story-L001..5.json`, so the
      deck shows five (the commander's open pod, bay 5 open from level 3, three sealed). They must stay **out of
      frame of `crash_open`** (the first film), and also clear of the game's start view and the film's held
      level edits (section 4). No scene or line changes.
- [ ] **S40 KILN looks the same in levels 1–5 (Doug, 2026-11-07: bigger in L1 than L4).** Every level's cue
      sets `spiritFollow` to the same values (size 1.1, glow 0.6, height 80), so the difference comes from
      somewhere else: the camera zoom per level (L1's `openZoom`), map scale, or the renderer's cloud sizing. Find
      it and make KILN's on-screen size and rendering identical in all five. Done check: a screenshot of KILN at
      the same moment in each level, at phone size.
- [ ] **S41 Sela's buggy at the signed-off size (Doug confirmed several times; last on 2026-11-07).** Use the size in
      the sandbox and in the `sela_arrival` scene: 2.64 m long (the 4.4 m build x 0.6). Merge the reduced model from
      branch `story-buggy` (39.9k tris, 2.5 MB, two wheels) at that size, then wire it into level 3 with headlights
      and the drive to the kiosk. No further sign-off.

- [ ] **P7 Ship the revised ranger pad rule.** Doug, 2026-11-07: the ranger hire pad goes inside the hunting grounds,
      clear of the burrow models. If that fails, it goes just inside the gate nearest them, or on the settlement
      edge facing them when there's no wall. Manual first. It is built but uncommitted in worktree `fo-wt-plot`
      (branch `plot-p1-p6`, behind main): `generator/src/build.ts`, the `ranger` block in
      `generator/data/generator.json`, rebuilt `s1-L017` / `s1-L034`, `pack.json`, `build-log.json`,
      `docs/LEVELS.md` and the 2026-11-07 digests. Steps: commit on the branch, merge main, `pnpm check`,
      `pnpm levels:check`, rebuild L017/L034 if the merge touched the generator, release notes, push, verify live.
      The same worktree holds uncommitted retry output for s1-L012 / s1-L037. Land it only if `levels:check`
      stays clean, else discard it.
- [ ] **P8 Drop s1-L065** (Doug, 2026-11-07). It is pinned to content 0.17.0, so the client can't load it. Remove
      it from the `s1-051` pack and the pack index, and don't rebuild it.
- [ ] **R6 #9 Cutscenes in the level menu.** Replay after Start Over (`save.ts` keeps the seen ones), a "!" until
      a cutscene's version is watched, and list only cutscenes from levels reached. Held until the story claim on
      `client/src/app.ts` clears and `REPLAY_FILMS` is off.
- [ ] **S6 Show what is happening.** Characters act out their lines with the generic `{ walk, to }` director
      action. Rhee's and Okafor's walks are done. Still to do from the screenplay's stage notes: Rhee kneeling
      beside Pip, hires walking to their posts in level 4, and the commander picking up the helmet.
- [ ] **S42 KILN on screen when it teaches a new skill (Doug, 2026-11-07).** On levels after 5, when a KILN coaching
      line teaches a mechanic for the first time, KILN's cloud appears beside the commander for that line, as it does
      in levels 1–5, instead of the line showing alone. Same size and look as in the story levels (S40).
- [ ] **S43 The training levels teach wall building (Doug, 2026-11-07).** Today level 2 starts with a prebuilt ring,
      so the walls appear from nowhere. After the freezing pods are rescued, the player builds the walls (wall pads
      with a goal card and a line saying why: the night and the raiders). Needs a look at which level carries it
      (2 or 3), whether a wall pad exists in the rules (an opt-in option if not), and the bots' and
      `levels:check` result.
- [ ] **S32 The lieutenant's fall, re-staged (Doug, 2026-11-07).** Claimed by the `story-vale-scrap` session; check
      the work log first. What's wrong now: the alignment is a mess, the fall comes with no cause, and it plays after
      the run has started. The cause: the scene is triggered by the sim's `retreated` event, which fires when the
      warlord has already turned to flee. The beat Doug wants, in order:
      1. Vale is attacking and taking damage in normal play.
      2. The animation starts on the hit that brings the warlord to its retreat threshold: one shot too many knocks
         Vale down.
      3. The helmet falls off **at that spot**.
      4. Vale gets up.
      5. Only now does Vale run off screen.
      Use Doug's new models (`hostile.boss_vale` with `item.vale_head`, the black `item.lieutenant_helmet`). After
      the animation, the in-play helmet lies where it fell, not at its manifest spot (760, 770).
      Dialogue timing: "You should have stayed asleep, Commander." stays as the warlord walks into frame. No line
      during the animation. Then KILN's "They're running. It's over for tonight." and "They dropped something." (with
      the dots on the helmet) come straight after Vale leaves the screen. They replace the line that waits for the
      fleeing warlord to pass the helmet. The capture then plays `helmet_reveal`, `vale_run` and "Vale?" (S33) as now.
      **Question for Doug:** the rework shows Vale's face when the helmet comes off, before the ID card and "Vale?".
      Keep the face hidden in the fall (back to camera, or in shadow), or let the player see it first?

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
Retune by rater metrics (defender losses per wave), not by eye.

### Bundle 5: combat
- [ ] **N2/N3 ranged raiders:** a real ranged attack with a sim "shot" event (today they only hit on contact).
- [ ] **N2 mites lunge and spit acid** (numbers above).
- [ ] **N19 nobody stops to shoot:** every mobile fighter keeps closing while it shoots and switches to melee at
      contact reach. Towers stay put. Each species spits its own acid colour (`arenaModel.ts` `closeIn`,
      `ACID_COLOR`).
- [ ] **N20 footprints and touch melee:** each character keeps its model's footprint, and melee means touching.
      The commander walks through anyone, and drones fly over.
- [ ] **N21 guards, medics, bleed-out:** medics can't be hurt. A downed guard takes half damage and dies at 0
      unless a medic reaches it. The commander can be killed by attackers. Rater metric: guard deaths per wave.
- [ ] **N22 the ranger is back, and hunting is a skill:** the ranger and commander one-shot a spiked hopper with
      `gunDamage`. Hoppers charge as a herd and wind up their bites. Hunting never kills: the injured lie down and
      wait for a medic. Hopper zones hold 0, 3 or 4 (this replaces #12). The ranger pad itself shipped in 0.20.0.
- [ ] **N23 dense mixed waves:** rows several abreast, mixed evenly (`waveOrder`). This sizes #14 and #15.
- [ ] **N18 dust crawlers in waves** (`hostile.creature`, scrap drop, share as above).
- [ ] **#14 more attackers, mixed waves, multiple warlords** (inside N23; warlord values above).
- [ ] **#15 faster arrivals:** biggest wave within about 30 s; check the iPhone frame rate.
- [ ] **N12 more damage per attacker,** set by the defender-losses-per-wave metric.
- [ ] **N8 drones dock between waves** and don't spawn until the next wave; they keep their HP.
- [ ] **N15 + N17 no character overlaps another:** integer separation in the sim. Fliers only avoid other fliers.
- [ ] **N5 blaster fire, rest:** turret (`struct.ranged_defense`) and drone shots as travelling glow bolts with
      muzzle and impact flashes and a ground glow. There is no drone shot event yet. The renderer part of N5 is done.
- [ ] **G3 / S23b rifle lasers everywhere,** including hunting shots and the hunter role. Check level 5's raiders,
      guards and turrets once this lands.
- [ ] **N4 scrap lands where it can be reached:** snap drops to the nearest walkable point (`spawnDrops`). Required
      with #11.
- [ ] **#11 attackers appear off screen:** spawn past the visible map, worked out in real metres per family.
- [ ] **P9 Attack–defence ratio model (Doug, 2026-11-07; replaces the N13-or-N1 choice for #10).** Balance defence
      with one formula, assuming the best action at every moment, then tune a single ratio per level:
      - A defence type's **efficiency** `e` is the defender damage per second bought per scrap, at its best buy. The
        price is flat per defence type, with no level-wide escalation counter (this closes #10/N1).
      - Drops equal HP, so killing a wave of total HP `H_w` returns `H_w` scrap. Reinvested, that adds `e·H_w` to
        defender DPS. So `D_{w+1} = D_w + e·H_w`, with `D_0` set by the starting scrap.
      - A wave with total attacker DPS `A_w` dies in about `H_w / D_w` seconds (plus its walk-in time inside range).
        Its damage to the defence is about `L_w = A_w · H_w / (2·D_w)` (attackers fall linearly under focused fire).
      - The level's **pressure ratio** is `ρ = Σ L_w / B`, where `B` is what can be lost (gate, base, guards' HP).
        `ρ < 1` is winnable with best play, and the target band (about 0.6–0.9) gives close finishes.
      - Each level meets its `ρ` quota freely: compress or spread the waves in time, or push more attacker damage
        into later waves. Difficulty becomes a shape, not a count.
      - What the formula can't see (lanes, travel, overkill, drops out of reach, melee vs ranged, bleed-out) goes in
        as fitted correction factors per family, measured by the bots, not hand-set.
      Steps: write the model in the generator (or the rater) as a pure function, check it against bot runs on the
      current defend levels, fit the corrections, then size Bundle 5's waves (N23, #14, #15, N12) from target `ρ`.
- [ ] **G7 drop the tow line's slack rule:** remove `lasso.slackTime` / `slackTicks`, the `tow_dropped` "slack"
      reason, the bots' never-stand-still rule, and the hint and skin text.

### Bundle 6: economy and generator
- [ ] **N6 loop bound:** reject a candidate if any hand-done leg needs more than 5 trips with no affordable
      takeover. Store `loopMax` per level and re-check it in `levels:check`.
- [ ] **#13 the hands-off goal needs x machines running** (a new `machines` param on automate).
- [ ] **N13 core levels matter (power budget).** No longer needed for defence cost (P9 covers that). Keep it only
      if core upgrades still go unbought after P9; otherwise drop it.
- [ ] **N10 rock slides hide something real:** `node.fuel_deposit` under the rubble, plus a generator check.
- [ ] **N6b level-order audit:** a pack check for repeated goal kinds and templates.
- [ ] **G4 / S27 hire pads always fully visible:** the generator places pads clear of model silhouettes, and
      fading never hides a pad.
- [ ] **N24 follow-up: more levels with belts** (only 4 of 55 have one).
- [ ] **Bot tow loop through a wall:** `Brain.loopAround` can place loop points inside a ring.
- [ ] **Search start table per engine:** make `startPressure` ignore a `start.json` from another engine, then
      rewrite it with `pnpm levels:start-table` from this rebuild.
- [ ] **Levels far off their target D** (L23, L26, L27, L28, L35, L44, L47 in 0.16.0): re-check against the
      latest digest. Give the sequencer per-goal D ranges where a goal can't reach its target.
- [ ] **Defend fun threshold** (section 1). P9 should lift `closeFinish` and `lateUncertainty` on defend levels.
- [ ] Engine bump, rebuild, check, re-pin, release notes, deploy (see the order above).

## 4. Level 1 opening film (`crash_open`, Release 3)

Nothing player-facing has shipped. Stage 1 (blocking stills) and stage 2 (animation test) are done; Doug has not
approved a full render. The tools and run command are in the WRAP UP hand-off in `docs/STORY-WORK-LOG.md`.
- [ ] **Fix stage 2:** (1) the glass slides through the commander; key a hinge on its edge. (2) The open glass
      blocks the camera at the step-out. (3) The drop to the sand is cut away. (4) The third camera frames
      mostly black sky. (5) The commander faces away in the look-round; turn toward the light. (6) The final view
      crowds them against the wreckage. Ask Doug for his own list too.
- [ ] **Held level edits, shipped with the film:** crash-site `scrap` x minus 100 units in `story-L001..005`; L1
      `start` to [451.7, 138.9]; bump `FILM_VERSIONS.crash_open`; check `openZoom.film` lands on the last frame.
- [ ] **Re-render shots 2–3** (impact, wreck at dawn) from the new set, then the full render (set as one plate,
      commander on a holdout layer, composite).

## 5. Seen only in code or locally: check live

Built and shipped, but never seen working on the Vercel URL or an iPhone. Tick each one when it is seen, or
reopen it here.
- [ ] **R6 Release 1 HUD and art:** #3 "Finish in x:xx" as the last star (s1-L008), #4 goods on belt tops
      (s1-L014), #6 impatient trader "!" (s1-L013), #7 no lot-edge pipes, #8 smooth code-built objects, and
      N16 the old homepage flash (needs two real deploys).
- [ ] **R6 #1 and #2 through a real wave:** icons still between waves; the VIP icon mid-fill.
- [ ] **Step A renderer items:** red bolts in a real raid, the healing cross with a real medic, and the medic's
      kneel (the `care` clip may read as picking up rather than kneeling). Also: trader order pictures in a live
      bubble, fireworks after a real win (S22), the shovel at a real rockslide (S23, level 3), wall fade on an
      iPhone, and the core fade in a story level.
- [ ] **G5 / S8 arrows follow the goal:** story level 3 (kiosk, then rockslide).
- [ ] **G6 / S9 one loop around close pods:** level 2 goal 2's pair, on screen together.
- [ ] **S33 `vale_run`** ("Vale?" as the commander runs two steps toward the screen with the helmet): check it on a
      phone once S32 is re-staged.

## 6. Release gates (web, then stores; details in `docs/RELEASE.md`)

- [ ] At least 20 cached levels play start to finish in airplane mode on a mid-range iPhone at 60 fps (2D) /
      30 fps (3D).
- [ ] The save survives a cleared cache (export/import in v1).
- [ ] The playtest retention target is met.
- [ ] Bot regression suite: no stalls or infeasible levels in any shipped pack.
- [ ] A 15–30 s preview video.
- [ ] A support URL and contact.
- [ ] Original names, art and themes only.

## 7. Older items: confirm they're still wanted

These are from the art rounds (`POLISH-PLAN.md`, 2026-10-17 on) and round 4. They were never closed, and later
work may cover them. Keep each one here, or drop it.
- [ ] **Gemini images → Meshy models** for the assets in `MESHY-ASSETS.md` (Doug's own task).
- [ ] **Actions animated:** gathering, depositing and machines processing show visible work. Converters show
      input going in and output coming out.
- [ ] **Upgrades that mean something:** upgraded buildings follow Doug's mock-ups (the Lv2/Lv3 prompts in
      `MESHY-ASSETS.md`).
- [ ] **Specific pad icons:** a register on the cashier pad, a pickaxe on a collector's hire pad, and the machine's
      silhouette on its operator pad.
- [ ] **R4: generate about 5 levels for Doug to playtest.** Probably superseded by the s1 pack and the `levels:next`
      batches.
