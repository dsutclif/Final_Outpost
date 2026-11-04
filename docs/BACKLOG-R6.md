# Backlog R6

Work ledger for round 6; tick items as they land. Merges the backlog refined on 2026-10-31 (items 1-15)
with Doug's list of 2026-11-02 (items N1-N16), refined against origin/main at 13887aa. Doug's decisions
are recorded inline. Items moved to R5 (done by the other session): #31 ghost size, routing through gates,
the medic kneel, and the 2D renderer hiding #25 pads.

Story levels 2-5 belong to the second account (`docs/STORY-WORK-LOG.md`); check its claims before touching
`client/src/app.ts`, `client/src/story/*`, story cue blocks or meshy.json, and claim any engine bump there.

## Release 1: renderer and client, no engine bump

Landed 2026-11-03 (branches r6-fade, r6-art, r6-hud, r6-stats). Browser-checked on L14: silhouette through the grow dome, dome and warehouse stay solid, the warehouse arrow points inward, ore by the reactor hatch (the deposit anchor sits inside the body, so the pile is placed just outside on its bearing and shows the last fuel fed), and the sandbox stats panel. Not seen on screen: belt goods (#4), curbs (#7), smoothing (#8) beyond the reactor, the HUD items (#1, #2, #3, #6), and N16, which needs two real deploys. Not on an iPhone. The silhouette covers the rigged hero only.

### Bundle 1: occlusion (Opus)
- [x] **#5 + N7 never fade:** the grow dome, the warehouse (`struct.depot`) and resource nodes (`node.*`) never
      fade (NO_FADE, `render-3d/src/renderer.ts:129`). This finishes R5 #4's open note (buildings faded with
      the hero inside them).
- [x] **N9 player behind walls:** pretotype first. Draw the hero as a silhouette that shows through any
      occluder, walls included (walls are instanced and can't fade per tile). Build per-tile wall fading
      only if the silhouette reads wrong.

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
- [ ] **G1 (S22) fireworks for level wins:** realistic fireworks replace the confetti on every level.
- [ ] **G2 (S23) shovel and dig when clearing a rockslide:** while the player pays at a `zone.clear` pad, the hero
      digs with a shovel (a tool prop plus a dig clip), on every level.
- [ ] **G3 (S23b) rifle lasers apply everywhere:** this is the existing N5 blaster fire plus N2/N3 ranged raiders
      (Bundle 5). Nothing extra here; the story backlog keeps a check of level 5 once Release 2 lands.
      **Doug, 2026-11-03 (again): guns still fire no laser bolts, and hunting rock hoppers must fire them too** (the
      hero's hunting shots and the hunter role), not only combat.
- [ ] **G4 (S27) hire pads always fully visible:** no pad is hidden behind a building or a wall from the game camera.
      The generator places pads clear of model silhouettes, and occlusion fading never hides a pad. Generated
      pads mean a pack rebuild, so this belongs to Release 2. The story backlog keeps a check of levels 1–5's
      hand-placed pads.
- [ ] **G5 (S8) guide arrows follow the current goal:** the floor arrows lead to what the current goal needs, not an
      older step (on story level 3 they kept pointing at the kiosk with the rockslide money in hand). **After level
      5 they still appear only when the player is stuck (the 20 s rule, Doug 2026-11-03).** Levels 1–5 show them
      from the first moment, and that stays in the story backlog (S7).
- [ ] **G7 drop the tow line's slack rule (Doug, 2026-11-03):** standing still with a tow no longer drops it, on every
      level. Remove `lasso.slackTime` / `slackTicks` and the `tow_dropped` "slack" reason from the sim, the bots'
      never-stand-still rule, hints and skin text. A rules change: engine bump, so it belongs to Release 2. Story
      level 2's line about it is already cut.
- [ ] **G8 realistic storm dust (Doug, 2026-11-03):** dust storms look like soft, translucent drifting clouds, like
      KILN's cloud, instead of the hard lines drawn now. Every level with a hazard (`render-3d` fx/environment).
- [ ] **G6 (S9) one loop around pods side by side:** when pods sit close together, the arrows draw one circle around
      the group instead of one per pod, so towing several at once is taught. It's client guide code; the story
      backlog keeps a check of level 2's pair.
- [ ] **G9 a trader's order shows the item, not a coloured dot (Doug, 2026-11-03):** the dot over a waiting trader's head
      becomes a small image of the item they want (the resource's own icon or model), on every level, so players learn
      to read orders without matching colours. Story level 3 already has the angry trader who wants meat; once G9 lands
      the story session can point at the icon in that beat.
- [ ] **G10 healing cross (Doug, 2026-11-04):** while a medic heals someone, a green medical cross floats over them and
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
- [ ] Engine bump (claim it in the story log), `levels:build`, `levels:check`, re-pin golden and story levels,
      the story session re-checks levels 3-5, release notes, deploy.
