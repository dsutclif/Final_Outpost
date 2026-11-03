# Backlog R6

Work ledger for round 6; tick items as they land. Merges the backlog refined on 2026-10-31 (items 1-15)
with Doug's list of 2026-11-02 (items N1-N16), refined against origin/main at 13887aa. Doug's decisions
are recorded inline. Items moved to R5 (done by the other session): #31 ghost size, routing through gates,
the medic kneel, and the 2D renderer hiding #25 pads.

Story levels 2-5 belong to the second account (`docs/STORY-WORK-LOG.md`); check its claims before touching
`client/src/app.ts`, `client/src/story/*`, story cue blocks or meshy.json, and claim any engine bump there.

## Release 1: renderer and client, no engine bump

### Bundle 1: occlusion (Opus)
- [ ] **#5 + N7 never fade:** the grow dome, the warehouse (`struct.depot`) and resource nodes (`node.*`) never
      fade (NO_FADE, `render-3d/src/renderer.ts:129`). This finishes R5 #4's open note (buildings faded with
      the hero inside them).
- [ ] **N9 player behind walls:** pretotype first. Draw the hero as a silhouette that shows through any
      occluder, walls included (walls are instanced and can't fade per tile). Build per-tile wall fading
      only if the silhouette reads wrong.

### Bundle 2: base and building art (Sonnet)
- [ ] **#4 goods below the belt top:** probably the belt is lifted by SLAB_TOP and the goods aren't
      (renderer.ts ~1537). Confirm first.
- [ ] **#7 remove the curbs:** lot-edge pipes on stands (`environment.ts:237`, `:262`).
- [ ] **#8 smooth code-built objects:** remove the faceted look and keep intentional edges (normals by
      angle; `materials.ts` flatShading).
- [ ] **N14 warehouse arrow points inward:** the drop-off pad art (`depotPadArt`, renderer.ts) points away
      from the building.
- [ ] **N11 ore in the reactor hopper:** the core stores fuel as a number. Draw ore at its `deposit` anchor,
      scaled from fuel (`syncCore`), the way converters show `inQ`.

### Bundle 3: HUD and client (Sonnet)
- [ ] **#1 gate/defence icons:** they shake continuously while at risk. Change to a short burst when the
      danger starts or a hit lands, then a steady red glow.
- [ ] **#2 VIP goal icon:** no face; block "VIP" text as the icon (text from the skin).
- [ ] **#3 "Finish in x:xx" is always the last star:** sort it in the HUD now, and fix the order in
      generator `index.ts` for future builds. No re-pin.
- [ ] **#6 impatient trader "!" arrow** on any level, not only with the no_angry_customers goal under 20%.
- [ ] **N16 old homepage flashes before the new one:** the service worker serves the cached build until the
      player taps Update (`registerType: "prompt"`, `client/src/pwa.ts`). On the title screen only, with no
      level in progress, apply a waiting update before the title paints. Reproduce it first.
- [ ] **#9 cutscenes in the level menu:** replay after Start Over (save.ts keeps seen ones), a "!" until
      a cutscene's version is watched, listing only cutscenes from levels reached. **Held** until the story
      session's Phase 2 push lands: it owns `app.ts` and film versions in the save.

### Bundle 4: sandbox stats panel (Sonnet)
- [ ] **N5b fighter stats in the sandbox viewer** (`client/sandbox.html`, `client/src/dev/sandbox.ts`):
      range, damage, attack interval, HP, speed and contact reach for every character that fights
      (commander, guards, drones, towers, medic, mites, raiders, warlords). Read only existing values from
      content data, defaults and level params, and mark the ones written into code. Doug: "don't make new
      ones up". Release 2 is tuned against this panel.

## Release 2: one engine bump, one pack rebuild

### Bundle 5: combat (Opus). Tune together, inside R5's rules (no strike above a guard's full health; the
defend scrap budget). Aim at the R5 difficulty targets that 16+ levels missed.
- [ ] **N2/N3 ranged raiders:** they hold rifles and play a shoot pose but only hit on contact (18). Give
      them a real ranged attack with a sim "shot" event. Guards behind the leash are only reachable this way.
- [ ] **N2 mites lunge and spit acid (Doug):** propose range, damage and rate before tuning.
- [ ] **N12 more damage per attacker:** set by a rater metric (defender losses per wave, target band), not
      by eye.
- [ ] **N8 drones dock between waves and don't spawn until the next wave (Doug).** They keep their HP.
- [ ] **N15 drones don't overlap:** ring slots collide (id % 12); add separation while moving.
- [ ] **N5 blaster fire:** a white-hot core (as in the title loop, whose tracer reads white) with a blue glow
      for friendlies and red for enemies. Uses the new shot events plus tower and drone shots.
- [ ] **N4 scrap lands where it can be reached:** gun range and pickup range are already both 90; drops scatter
      with no check (`spawnDrops`, `common.ts:198`). Snap them to the nearest walkable point on the map.
      Required with #11.
- [ ] **#11 attackers appear off screen:** push `defense.spawnY` past the visible map.
- [ ] **#12 enough spiky hoppers to be a threat;** bots dodge.
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
