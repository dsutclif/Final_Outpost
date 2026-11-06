# Backlog R6

Work ledger for round 6; tick items as they land. Merges the backlog refined on 2026-10-31 (items 1-15)
with Doug's list of 2026-11-02 (items N1-N16), refined against origin/main at 13887aa. Doug's decisions
are recorded inline. Items moved to R5 (done by the other session): #31 ghost size, routing through gates,
the medic kneel, and the 2D renderer hiding #25 pads.

Story levels 2-5 belong to the second account (`docs/STORY-WORK-LOG.md`); check its claims before touching
`client/src/app.ts`, `client/src/story/*`, story cue blocks or meshy.json, and claim any engine bump there.

## Delivery plan, revised 2026-11-05 (against origin/main cadb591, engine 0.19.0)

What changed since the plan was made: engine 0.19.0 (gatedMove); the new look is on by default, with friendly
turret bolts (N5 part) and soft storm sheets (`softfx.ts` `StormDust`, G8 part) already in it; real metres
(1 m = 28 world units); arena PROPOSALS in `client/src/dev/arenaModel.ts` hold Doug's sandbox numbers for Bundle 5;
object sizes and pack s1 rebuilt (859fd14). B's `story-p2` claim on `client/src/app.ts` is still open and
`REPLAY_FILMS` is still on, so #9 stays held.

**Step A, now, no engine bump (renderer and client).** One Sonnet session per file set, in turn where they share
`renderer.ts`:
1. N9 follow-up wall fade (`docs/handoff/wall-fade.md`, no open questions), then the gate width check
   (`docs/handoff/object-sizes.md` step 3).
2. N5/G3 rest: red enemy bolts, drone and hunting shots through `Bolts` (`fx.ts`); G10 healing cross for guards;
   G9 order icon over traders; G1 fireworks. All renderer, same session as 1, after it.
3. G5 + G6 guide arrows (`client/src/guide.ts`, not claimed): a parallel session.
4. Live check on the Vercel URL of Release 1's unseen items (#1, #2, #3, #4, #6, #7, #8): Haiku or Sonnet,
   screenshots only; tick or reopen.
5. G8 is done (Doug, 2026-11-05: the storm dust in live L1 looks realistic, that is the target).
6. G2 joins session 1: `prop.shovel` and the `dig` clip are already in `meshy.json` (used for ore before the
   pickaxe), so play `dig` with the shovel while the hero pays at a `zone.clear` pad.

**Combat values (Doug, 2026-11-05: "make your own best decisions").** Start from the arena PROPOSALS
(`client/src/dev/arenaModel.ts`) as they stand, with drops equal to HP (R5 rule):
- Warlord 24 HP, 24 points, 24 scrap: the arena value, not #14's 15, because raiders rise to 6 HP and a 15 HP
  warlord would sit too close to them for "big, slow and rare at the top".
- Mites (N2): the arena's acid spit (range 40, damage 1, every 2 s) and lunge (30, 0.3 s wind-up, 2 s cooldown).
- Dust crawler (N18): HP 3, drops 3 scrap (not food), shot range 60. Wave share by count about 70% mites,
  20% crawlers, 10% raiders, warlords 1-3 on the last two waves; all inside the point cap from the rules review.
- N13 power budget: go, as a pretotype on 2-3 levels with param overrides (core L1/L2/L3 supply 4/7/10). Ship it
  only if bots then buy core upgrades on those levels; otherwise #10 takes the N1 fallback (per-pad counter, no
  upgrade escalation, cap at 2x base).
Bundle 5 retunes from these by rater metrics (N12 defender losses per wave), not by eye.

**Step B, after the 2026-11-06 rules review: Release 2 as one engine bump (0.20.0) and one pack rebuild.**
Doug's calls needed first: N13 power budget (or the N1 fallback for #10), N18 crawler drop and wave share,
N2 mite numbers (take them from arena PROPOSALS if he agrees), and the review's Rule 7/8/13 changes, which
#14, #15 and N23 depend on.
- Folds: #12 is now N22's 0/3/4 spiked-hopper zones; #14 and #15 are sized inside N23. #11's spawn distance is
  worked out in real metres from the viewW per family. G4 and G7 join this bump.
- Order: Bundle 5 (Opus, one session, `sim` + `bots` + `rater`), then Bundle 6 (Opus, generator), then
  claim the bump in `docs/STORY-WORK-LOG.md`, rebuild in the background, `levels:check`, re-pin golden and
  story levels (B re-checks 3-5), release notes, deploy, iPhone frame-rate check with dense waves.

**Doug's iPhone check, 2026-11-05 evening.** Everything in the check table is good except these:
- [ ] **#1 reopened: gate and repel icons vibrate between waves.** The pulse during an attack is right; between waves
      both the gate icon and the repel chevrons still shake. Nothing should move between waves. (HUD session)
- [ ] **#2 reopened: VIP icon is hollow letters that fill.** Outlined block "VIP" letters (`docs/mockups/vip-icon-hollow.png`: white
      outline, empty inside) that fill as VIPs are served, like the other goal icons that fill. (HUD session)
- [ ] **N24 level titles promise what the level has.** Doug played menu levels 13 and 23 expecting belts and found none.
      Menu 23 "Conveyors and Hiring Drive" (`s1-L019`, goal `hire`) takes "Conveyors" from the `supply_routing` word
      list (`skins/src/mars_greenhouse.ts:759`), but it has no belt. Only 4 of 59 pack levels have one (L014, L025,
      L050, L058; belts need a goal in `conveyorGoals` plus tier2, `generator/src/build.ts:300`, `:608`). Menu 13
      `s1-L009` is a `converter_level` level, not automation. Fix: a title word must name something on the level (skin
      and `levelTitle`, no rebuild). More levels with belts is a generator change for Bundle 6.
- [x] **N9b fade one wall section at a time:** wall fading works; fade only the sections between the commander and the
      camera (a per-instance alpha on the wall `Batch`es) instead of the whole wall. (renderer session)
- [x] **G10 reopened, plus the medic kneel:** the medic still doesn't kneel (R5 leftover, never done). The cross shows
      but sits still. `docs/mockups/heal-cross-bounce.png` (states 1, 2, 1): a 3D, better-looking cross that bobs up and back down while the heal runs, turning
      more transparent at the top of the bounce (not whiter). (renderer session)

**Step C, when B's `story-p2` claim clears and `REPLAY_FILMS` is off:** #9 cutscenes in the level menu (Sonnet).

## Release 1: renderer and client, no engine bump

Landed 2026-11-03 (branches r6-fade, r6-art, r6-hud, r6-stats). Browser-checked on L14: silhouette through the grow dome, dome and warehouse stay solid, the warehouse arrow points inward, ore by the reactor hatch (the deposit anchor sits inside the body, so the pile is placed just outside on its bearing and shows the last fuel fed), and the sandbox stats panel. Not seen on screen: belt goods (#4), curbs (#7), smoothing (#8) beyond the reactor, the HUD items (#1, #2, #3, #6), and N16, which needs two real deploys. Not on an iPhone. The silhouette covers the rigged hero only.

**Live check, 2026-11-05 (Haiku, screenshots on the Vercel URL, fresh profile after clearing the service worker and caches; unlock-all `410864d` live).** The levels were reached by their menu title, not by pack id, because menu 1-5 are story levels. Only a few items could be checked from stills, so most are not seen.

| Item | Level (pack id, title) | Result | What was seen |
|---|---|---|---|
| #1 gate/defence icons shake then glow steady red | s1-L026, Wreckage and Endurance | not seen | The top shield shows the raid timer (0/2:50, then 8/2:50 and 18/2:50) and stays orange in stills. Shake and steady red glow cannot be confirmed from stills. |
| #2 VIP goal icon is "VIP" text | s1-L008, Open Vault | not seen | Level not reached. Level 8 in the menu is a different level, "Blueprints and Paydays", and showed only "Earn 329 credits". |
| #3 "Finish in x:xx" is the last star | s1-L008, Open Vault | not seen | Level not reached. The HUD on the level checked shows a plain timer only. |
| #4 goods ride on belt tops | s1-L014, Warehouse Rush | not seen | Level not reached. |
| #6 impatient trader "!" arrow | s1-L013, Big Orders | not seen | Level not reached. |
| #7 no grey pipe bars on lot edges | s1-L026, Wreckage and Endurance | not seen | Lot edges show stone walls; not clear enough in stills to rule the bars in or out. |
| #8 smooth, not faceted, code-built objects | s1-L026, Wreckage and Endurance | not seen | Buildings look smooth at this size; not checked close up. |

Step A renderer items (not in the list above, same check): wall fade (L14), bolts, healing cross, trader order icons, win fireworks, shovel dig at a rockslide pad. Not reached in this pass. On L26 the guards show "Injured" labels, not a healing cross.

Not reached: s1-L008, s1-L013, s1-L014, s1-L025, s1-L050. Next pass: play s1-L008 past its intro for the VIP and time items, then s1-L014 for belts and s1-L013 for the trader arrow.

### Bundle 1: occlusion (Opus)
- [x] **#5 + N7 never fade:** the grow dome, the warehouse (`struct.depot`) and resource nodes (`node.*`) never
      fade (NO_FADE, `render-3d/src/renderer.ts:129`). This finishes R5 #4's open note (buildings faded with
      the hero inside them).
- [x] **N9 player behind walls:** pretotype first. Draw the hero as a silhouette that shows through any
      occluder, walls included (walls are instanced and can't fade per tile). Build per-tile wall fading
      only if the silhouette reads wrong.
      **2026-11-04 follow-up (Doug):** fade the whole wall, and every building except his named exclusions (grow dome, warehouse). DONE 2026-11-05 (r6-stepA): whole wall batches and every building fade, silhouette removed; seen in L14, the wall near the commander turned see-through and the commander stood solid with no green; not seen: the core in a story level, an iPhone. Plan in `docs/handoff/wall-fade.md`.

### Bundle 2: base and building art (Sonnet)
- [x] **#4 goods below the belt top:** probably the belt is lifted by SLAB_TOP and the goods aren't
      (renderer.ts ~1537). Confirm first.
- [x] **#7 remove the curbs:** lot-edge pipes on stands (`environment.ts:237`, `:262`).
- [x] **#8 smooth code-built objects:** remove the faceted look and keep intentional edges (normals by
      angle; `materials.ts` flatShading).
- [x] **N14 warehouse arrow points inward:** the drop-off pad art (`depotPadArt`, renderer.ts) points away
      from the building.
- [x] **N11 ore in the reactor hopper:** the core stores fuel as a number. Draw ore at its `deposit` anchor,
      scaled from fuel (`syncCore`), the way converters show `inQ`.

### Bundle 3: HUD and client (Sonnet)
- [x] **#1 gate/defence icons:** they shake continuously while at risk. Change to a short burst when the
      danger starts or a hit lands, then a steady red glow.
- [x] **#2 VIP goal icon:** no face; block "VIP" text as the icon (text from the skin).
- [x] **#3 "Finish in x:xx" is always the last star:** sort it in the HUD now, and fix the order in
      generator `index.ts` for future builds. No re-pin.
- [x] **#6 impatient trader "!" arrow** on any level, not only with the no_angry_customers goal under 20%.
- [x] **N16 old homepage flashes before the new one:** the service worker serves the cached build until the
      player taps Update (`registerType: "prompt"`, `client/src/pwa.ts`). On the title screen only, with no
      level in progress, apply a waiting update before the title paints. Reproduce it first.
- [ ] **#9 cutscenes in the level menu:** replay after Start Over (save.ts keeps seen ones), a "!" until
      a cutscene's version is watched, listing only cutscenes from levels reached. **Held** until the story
      session's Phase 2 push lands: it owns `app.ts` and film versions in the save.

### Bundle 4: sandbox stats panel (Sonnet)
- [x] **N5b fighter stats in the sandbox viewer** (`client/sandbox.html`, `client/src/dev/sandbox.ts`):
      range, damage, attack interval, HP, speed and contact reach for every character that fights
      (commander, guards, drones, towers, medic, mites, raiders, warlords). Read only existing values from
      content data, defaults and level params, and mark the ones written into code. Doug: "don't make new
      ones up". Release 2 is tuned against this panel.

### Bundle 7: game-wide items from Doug's story feedback (2026-11-03)
From `docs/BACKLOG-STORY.md`, round S1. Doug sorted these as game-wide on 2026-11-03. Where levels 1–5 need their own
follow-up, it stays in the story backlog under the same S number, so each part is in both plans.
- [x] **G1 (S22) fireworks for level wins:** realistic fireworks replace the confetti on every level. Done 2026-11-05: seven staggered shells with spark trails and ember bursts; seen from a faked win event on L1 (bursts sit near the top edge of the frame); not seen after a real win.
- [x] **G2 (S23) shovel and dig when clearing a rockslide:** while the player pays at a `zone.clear` pad, the hero Done 2026-11-05 in code; see the Step A batch notes at the foot of this file.
      digs with a shovel (a tool prop plus a dig clip), on every level.
- [ ] **G3 (S23b) rifle lasers apply everywhere:** this is the existing N5 blaster fire plus N2/N3 ranged raiders
      (Bundle 5). Nothing extra here; the story backlog keeps a check of level 5 once Release 2 lands.
      **Doug, 2026-11-03 (again): guns still fire no laser bolts, and hunting rock hoppers must fire them too** (the
      hero's hunting shots and the hunter role), not only combat.
- [ ] **G4 (S27) hire pads always fully visible:** no pad is hidden behind a building or a wall from the game camera.
      The generator places pads clear of model silhouettes, and occlusion fading never hides a pad. Generated
      pads mean a pack rebuild, so this belongs to Release 2. The story backlog keeps a check of levels 1–5's
      hand-placed pads.
- [x] **G5 (S8) guide arrows follow the current goal:** the floor arrows lead to what the current goal needs, not an
      older step (on story level 3 they kept pointing at the kiosk with the rockslide money in hand). **After level
      5 they still appear only when the player is stuck (the 20 s rule, Doug 2026-11-03).** Levels 1–5 show them
      from the first moment, and that stays in the story backlog (S7).
      **Done 2026-11-05 (0347a8a):** `Brain.suggest` drops an older held step (register pile, gather) when a pad is payable now; arrows still only when stuck after level 5 (already so). Live: the new bundle holds the fix. Not seen: story level 3 played through in the browser (only the sim-side logic and `levels:check` clean, 59/59).
- [ ] **G7 drop the tow line's slack rule (Doug, 2026-11-03):** standing still with a tow no longer drops it, on every
      level. Remove `lasso.slackTime` / `slackTicks` and the `tow_dropped` "slack" reason from the sim, the bots'
      never-stand-still rule, hints and skin text. A rules change: engine bump, so it belongs to Release 2. Story
      level 2's line about it is already cut.
- [ ] **G8 realistic storm dust (Doug, 2026-11-03):** dust storms look like soft, translucent drifting clouds, like
      KILN's cloud, instead of the hard lines drawn now. Every level with a hazard (`render-3d` fx/environment).
- [x] **G6 (S9) one loop around pods side by side:** when pods sit close together, the arrows draw one circle around
      the group instead of one per pod, so towing several at once is taught. It's client guide code; the story
      backlog keeps a check of level 2's pair.
      **Done 2026-11-05 (0347a8a):** pods within 110 units, chained, share one loop (`towGroup`, unit test). Not seen with two pods on screen in the browser.
- [x] **G9 a trader's order shows the item, not a coloured dot (Doug, 2026-11-03):** the dot over a waiting trader's head Done 2026-11-05.
      becomes a small image of the item they want (the resource's own icon or model), on every level, so players learn
      to read orders without matching colours. Story level 3 already has the angry trader who wants meat; once G9 lands
      the story session can point at the icon in that beat.
- [x] **G10 healing cross (Doug, 2026-11-04):** while a medic heals someone, a green medical cross floats over them and Done 2026-11-05 for guards.
      fills up as the heal runs; when it is full it disappears and they get up. Renderer only for guards (`medic_heal`
      already fires); injured rangers and the commander get it with N22.

## Release 2: one engine bump, one pack rebuild

### Bundle 5: combat (Opus). Tune together, inside R5's rules (no strike above a guard's full health; the
defend scrap budget). Aim at the R5 difficulty targets that 16+ levels missed.
- [ ] **N2/N3 ranged raiders:** they hold rifles and play a shoot pose but only hit on contact (18). Give
      them a real ranged attack with a sim "shot" event. Guards behind the leash are only reachable this way.
- [ ] **N2 mites lunge and spit acid (Doug):** propose range, damage and rate before tuning.
- [ ] **N19 nobody stops to shoot (Doug, 2026-11-03):** every mobile fighter (attackers, guards, drones, the hero's
      auto-fire) keeps closing while it shoots and switches to melee once in contact reach; no shot from inside it.
      Towers stay put. Every animal with a ranged attack spits acid, each species its own colour (mites green, crawlers
      amber). Arena reference: `client/src/dev/arenaModel.ts` `closeIn`, `ACID_COLOR`.
- [ ] **N20 footprints and touch melee (Doug, 2026-11-04):** extends N17. No two characters overlap even partly: each
      keeps its model's footprint (not a fixed 6), so melee counts as touching (footprints plus a small gap) rather
      than 18 between centres. The commander walks through anyone; only settlement walls stop him. Drones still fly over.
- [ ] **N21 guards, medics, bleed-out (Doug, 2026-11-04):** medics can't be hurt. A downed guard takes half damage and
      dies at 0 unless a medic reaches it; no damage while a medic is healing it. Rater metric: guard deaths per wave.
      The commander can be killed by attackers (Doug, 2026-11-04); hunting never kills (N22).
- [ ] **N22 the ranger is back, and hunting is a skill (Doug, 2026-11-04):** the R2 generator rewrite (2d433a7,
      2026-10-11) dropped the `role.hunter` hire pad without a recorded decision; put it back on hunting levels. Ranger
      and commander one-shot a spiked hopper with the gun (new `gunDamage`, melee weaker); spiked hoppers charge as a
      herd from past gun reach, wind up each bite (a moving target dodges it) and stun. Three up close beat a hunter
      who stands; one who keeps moving wins. Arena numbers in `arenaModel.ts` PROPOSALS.
      Hunting never kills (Doug, 2026-11-04): an injured ranger, or the commander on a hunt, lies down, can't be hurt,
      and waits for a medic or the commander to heal him. Hopper zones hold 0, 3 or 4 spiked hoppers: 0 is routine, 3
      rarely needs the medic for a ranger, 4 often does. Doug's sandbox numbers (2026-11-04) are the arena PROPOSALS.
      **Don't drop this:** the ranger and the dust crawler (N18) both ship in this release.
- [ ] **N23 dense mixed waves (Doug, 2026-11-04):** waves come in rows of several abreast and mix their types evenly
      (`waveOrder`); mites dense and weak, then crawlers, raiders and warlords larger, slower, stronger and rarer. A
      drone is worth about one crawler. Sizing, drops and iPhone frame rate per the 2026-11-03 plan (#14, #15, N18).
- [ ] **N12 more damage per attacker:** set by a rater metric (defender losses per wave, target band), not
      by eye.
- [ ] **N8 drones dock between waves and don't spawn until the next wave (Doug).** They keep their HP.
- [ ] **N15 + N17 no character overlaps another (Doug, 2026-11-03):** grows N15 (drone ring slots collide, id % 12)
      to every character: the hero, guards, settlers, visitors, attackers and hoppers push apart while moving (integer
      separation in the sim, bodies under the 18 contact reach). Fliers (drones) only avoid other fliers, so they can
      pass over ground units. The sandbox arena already does this (`client/src/dev/arenaModel.ts` `separate`, `BODY`).
- [ ] **N5 blaster fire:** a white-hot core (as in the title loop, whose tracer reads white) with a blue glow
      for friendlies and red for enemies. Uses the new shot events plus tower and drone shots.
      **Doug, 2026-11-04: the reactor-defence turrets (`struct.ranged_defense`) fire the same bolts, and every bolt reads
      as light, not a line:** a short travelling glow (white-hot core, coloured halo, soft falloff) with a muzzle flash,
      an impact flash, and a glow spilling onto the ground under it. The look-test branch (`look-test`, `scene/fx.ts`
      `bolt`) has a first version to start from; today the turret tracer is a row of small cubes.
- [ ] **N4 scrap lands where it can be reached:** gun range and pickup range are already both 90; drops scatter
      with no check (`spawnDrops`, `common.ts:198`). Snap them to the nearest walkable point on the map.
      Required with #11.
- [ ] **#11 attackers appear off screen:** push `defense.spawnY` past the visible map.
- [ ] **#12 enough spiky hoppers to be a threat;** bots dodge.
- [ ] **N18 dust crawlers in waves (Doug asked why they never appear):** `hostile.creature` is in `enemies.json` and
      has a model, but the generator's waves (`generator/src/build.ts` ~1101) only send mites, raiders and the warlord;
      only prototype level 4 uses it. It drops `res.food_raw_2`, not scrap. Decide its drop and wave share, then add it.
- [ ] **#14 more attackers, mixed waves, multiple warlords:** warlord 15 HP, 15 points, 15 scrap drop.
- [ ] **#15 faster arrivals:** biggest wave within about 30 s; check iPhone frame rate.
- [ ] **#10 + N1 guard-post cost:** escalation multiplies one level-wide counter by 1.08 per defence purchase,
      with no cap (a level 3 tower costs 102 after 15 buys). Replace it with the N13 power budget if Doug
      agrees; otherwise give each pad its own counter, don't escalate upgrades, and cap at 2x base.

### Bundle 6: economy and generator (after the 2026-11-06 rules review)
- [ ] **N6 loop bound (Doug):** for each hand-done leg, trips = units needed / carry. Reject a candidate before
      simulating if any leg needs more than 5 trips with no affordable takeover (worker, carry, better source).
      Core hand-feeding stops being exempt. Store `loopMax` per level and re-check it in `levels:check`.
- [ ] **#13 the hands-off goal needs x machines running** (new `machines` param on automate).
- [ ] **N13 core levels matter (Doug, open to suggestions):** proposed power budget. Machines, towers and posts
      use power, core L1/L2/L3 supply about 4/7/10, and burn rate rises with power in use. Pretotype on 2-3
      levels with param overrides first. **Awaiting Doug's OK.**
- [ ] **N10 rock slides hide something real:** put `node.fuel_deposit` (dense fuel, worth 4) under the rubble,
      with a fuel cell model, plus a generator check that the rubble hides something not available elsewhere.
      Story levels 3-4 do this already.
- [ ] **N6b level-order audit:** a pack check in `levels:check` for repeated goal kinds and templates.
- [ ] **Bot tow loop through a wall** (story log note): `Brain.loopAround` can place loop points inside a ring.
- [ ] **Search start table per engine (docs/LEVEL-RULES.md):** `generator/data/start.json` is still from engine 0.16.0
      and `startPressure` (generator `index.ts`) never checks its engine. Make it ignore a table from another engine
      (falling back to the formula), then rewrite it from this release's rebuild: `pnpm levels:start-table
      levels/candidates/s1.jsonl` on the machine that ran the build (GitHub Actions keeps only digests).
- [ ] **Defend fun threshold:** defend levels mostly rate F 0.1-0.3 against the 0.4 bar, so they ship as off target
      after every retry (0.16.0 rebuild). After the 11-06 review, either set a defend threshold from the data or
      fix what the rater's fun proxies miss on defend (`rater/src/fun.ts`). Needs Doug's call on which.
- [ ] **Levels far off their target D:** in 0.16.0, L23, L26, L27, L28, L35, L44 and L47 shipped more than 0.2 from
      their target. Re-check against the 0.19.0 digest (`levels[*]` dMin/dMax/target) and, where a goal can't reach
      its target on any seed, give the sequencer per-goal D ranges (rule 1) rather than searching longer.
- [ ] Engine bump (claim it in the story log), `levels:build`, `levels:check`, re-pin golden and story levels,
      the story session re-checks levels 3-5, `levels:start-table`, release notes, deploy.

### Step A renderer batch, 2026-11-05 (branch r6-stepA, renderer and client only)
- [x] **Wall fade + remove silhouette (N9 follow-up):** seen on L14 (wall fades, hero solid, no green). Not seen: core fade in a story level; the `director.solid` list no longer blocks fading.
- [x] **Gate width check:** L14, the 4.05 m gate sits flush in its wall with wall runs either side; no renderer fix needed. Looked only at the left side up close; not checked on other ring levels.
- [x] **N5/G3 bolts:** red bolts from the nearest hostile on `hit` events by hostiles (target player, guard, troop, base; skipped when the hostile stands on its target); blue bolts for defender, hunter, turret and troop hits. Seen: a red bolt on L14 from a placed fake hostile. Not seen: a real raid, hunting. No event exists for drone shots: note for Release 2.
- [x] **G10 healing cross (guards):** seen on L14 with forced `healing` residents (cross filling green); not seen with a real medic.
- [x] **G9 order picture:** each item is drawn once into a small picture from its own model (`scene/itemicons.ts`); 14 resource pictures checked on L12; not seen inside a live order bubble.
- [x] **G1 fireworks:** see the G1 line above.
- [x] **G2 shovel and dig:** the `dig` act is set on `pad_paid` for a `zone.clear` pad (checked with a faked pad and a pose change); the shovel itself and a real clear pad were not seen.
- Live: pushed as 5850b9e; the new bundle (index-xRIQq0n4, renderer chunk with the red bolt colour) is on the Vercel URL and the update toast appeared. Not played live (debug unlock did not stick on the live origin), so every item above was seen on the local dev server only.

### Doug's iPhone check items done, 2026-11-06 (branch r6-stepA2, renderer only)
- [x] **N9b:** wall pieces fade one at a time (own opacity each, eased; faded ones draw in a see-through twin batch). Seen on L14 locally: pieces beside the commander turned see-through, the far wall stayed solid. Not seen on an iPhone or the live site.
- [x] **G10 + kneel:** 3D bevelled cross bobbing and fading at the top, seen locally with forced `healing` residents. The medic's kneel plays the existing `care` clip (crouch-pick) while its patient is `healing`; it is not seen on screen (no real medic heal reached), and the clip may read as picking rather than kneeling.
