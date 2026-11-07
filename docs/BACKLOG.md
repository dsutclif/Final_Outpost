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

- [ ] **Pod count at the crash site (S24).** The screenplay, `empty_bays` and `crash_log` talk about five deck pods
      (the commander's, open, plus four sealed). The levels show three (`pod0`–`pod2`). Option 1: add two sealed
      `decor.stasis_pod` + `decor.stasis_glass` pairs behind the wreck's far end in `story-L001..5.json`. This is
      Doug's lean, and no scene or line changes. Option 2: keep three and reword `empty_bays`, `crash_log`, KILN's
      "bays five to eight" and the screenplay. Who edits `story-L001.json` is also open.
- [ ] **Level 1 sign-off, and the full render of the `crash_open` film** (see section 4).
- [ ] **`empty_bays` good enough against the films?** (Sign-off 2, 2026-11-03.) The other live scenes are only
      built if it is.
- [ ] **Reduced buggy (Sign-off 3).** Branch `story-buggy` (not merged): body 4.4 m wide (this needs your
      confirmation), 39.9k tris, 2.5 MB. It is wired into level 3 with headlights only after sign-off. Sela's
      buggy in play is already signed off at 2.64 m.
- [ ] **N13 power budget, or the N1 fallback for #10 (R6).** Pretotype the power budget on 2–3 levels (core
      L1/L2/L3 supply 4/7/10). Ship it only if bots then buy core upgrades; otherwise #10 takes the per-pad
      counter, with no upgrade escalation and a cap at 2x base.
- [ ] **Defend fun threshold (R6 Bundle 6).** Defend levels rate F 0.1–0.3 against the 0.4 bar. Either set a
      defend threshold from the data, or fix what `rater/src/fun.ts` misses on defend levels.
- [ ] **Look at the level 5 scenes on a phone (S32, S33).** `warlord_fall` and `vale_run` are live with rough
      blocking. The raider keeps its helmet on until the drop.
- [ ] **Q2 KILN size (S4)** and **Q4 counting the old pod in level 2's goal (S13).** Both shipped as read
      (KILN size 1.1; `rescue_all` `decoys: 1`). Close them unless Doug objects.

## 2. Ready now (no engine bump)

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
- [ ] **#10 + N1 guard-post cost:** depends on the N13 decision (section 1).
- [ ] **G7 drop the tow line's slack rule:** remove `lasso.slackTime` / `slackTicks`, the `tow_dropped` "slack"
      reason, the bots' never-stand-still rule, and the hint and skin text.

### Bundle 6: economy and generator
- [ ] **N6 loop bound:** reject a candidate if any hand-done leg needs more than 5 trips with no affordable
      takeover. Store `loopMax` per level and re-check it in `levels:check`.
- [ ] **#13 the hands-off goal needs x machines running** (a new `machines` param on automate).
- [ ] **N13 power budget pretotype** (if Doug agrees; section 1).
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
- [ ] **Defend fun threshold** (section 1).
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
