# Backlog round 4 (agreed with Doug, 2026-10-22)

The ledger for this round. Tick items as they land and are verified live on the Vercel URL;
add a dated note under an item when something changes. Decisions here go into DECISIONS.md
when they ship. Batches run in the order below.

## Batch 0: layout sandbox (dev page, no rules change)

- [x] Dev page on the Vercel URL with sliders for building density (lot size, street width,
      building gap, pad margin, pull to core), building size and camera zoom. It renders a sample base
      from the real generator layout code and the real models, with the vibe reference image
      in a corner for comparison. Live at /sandbox.html (2026-10-22); every pad is forced built,
      unlock gates skipped; "Copy link" carries the values in the URL.
- [x] Doug plays with it; the chosen values are recorded here and feed Batch 3.
      Chosen 2026-10-22 (screenshot, L4): lot size 60, street 0, building gap 0, pad margin 0,
      pull to core 3, building size 1.1, view width 240, text size 8 (TEXT x 0.8). All 60 s1
      levels still generate with them. Four sliders sit at their minimum and pull at its maximum,
      so the ranges may need widening. Outer reach barely moves (mean 252 vs 257): resource fields
      come from the level templates, which the sliders do not control.
      Shipped now (renderer only): view width 240 (units.ts VIEW_W) and text main 8 (TEXT x 0.8;
      Doug: 10 was slightly too large). Bot view box scaled with the camera (bots/data/view.json
      viewW 319). Slider ranges widened: lot size down to 20, building gap down to -10, pull to 8.
- Keep the sandbox (Doug, 2026-10-22): it stays for future tuning; never delete it.

## Batch 1: renderer/client fixes (no engine bump, no pack regeneration)

- [x] **Model swap on replay (backlog 12).** `loadMeshy` returns early for cached files
      without calling `onLoad`, so a second `init()` keeps code-built walls, decor, items and
      held props (`render-3d/src/assets/meshy.ts`, `renderer.ts` 343-372).
- [x] **Full offline (11).** Precache every built GLB (`meshy.built.json`, with `?v=`), the
      pack index and all level files on install; add `clientsClaim`. About 10 MB is fine.
      Done 2026-10-22: models + fonts precached (11 MB), clientsClaim; levels stay on the
      runtime prefetch (precaching them would hide new batches). Doug to test in airplane mode.
- [x] **Buildings above floor tiles (7).** Lift buildings by the slab thickness.
- [x] **Mites smaller (10).** Visual only; hit range unchanged. Scale 0.62 -> 0.45.
- [x] **Helper arrow (9).** Show the guide arrow on any level after 20 s with no progress
      toward level goals (not raw inactivity); add an off setting.
      Done 2026-10-22: client guide.ts StuckTimer; progress = new best on the main goal, an
      objective done or a pad finished. Setting "Arrow when I seem lost", on by default.
- [x] **Text size.** "Max" text is unreadable and smaller than the rest; all dynamic on-screen
      text is slightly too small. One consistent, larger size scale for every dynamic text
      element, fixed on screen. Second time asked (first on 2026-10-18): check every element live.
      Done 2026-10-22: render-3d units.ts TEXT {main 10, sub 8, big 13} drives every world label
      and floater (MAX was 3.2, now 10); in-play HUD text 14 px. Tune all of it from TEXT.

## Batch 2: level checking and generation (code only; no pack ships except a playtest set)

- [x] **Human-view bot (3).** Bot sees only what is on screen and in the HUD, reacts at human
      speed with some error; stars must be earned by this bot, not the perfect one.
      `levels:check` enforces a star rate.
      Done 2026-10-22 (8d5c6ab): HUMAN profile + screen/HUD perception filter (bots/src/view.ts);
      each star must be earned on 4 of 6 human-view seeds plus one 3-star seed (generator.json
      humanStars). Finding: hiding off-screen info barely weakens the bot (47/60 levels still pass);
      the hard feel likely comes from its perfect planning and attention. Open: tune it harder or
      calibrate it against Doug's own play telemetry.
- [x] **Turret upgrade before turret (6).** `generator/src/build.ts` ~806-815 puts second-round
      towers after all upgrades; chain each upgrade after its own tower and add a pad-order
      check for upgrade targets.
      Done 2026-10-22 (b3d184a), with a regression test that fails on the old order.
- [x] **No new levels after finishing the pack.** Diagnose and fix the `levels:next` path.
      Done 2026-10-22 (b890dfc), probable cause: one failed level made the CI build exit 1, so the
      whole batch was discarded and every later trigger rebuilt and failed the same batch. Now the
      levels before a failure are kept. s1-061 holds 20 levels (80 published, not 84).
- [ ] Generate about 5 levels for Doug to playtest all changes so far.

## Batch 3: one engine bump (0.13.0), then the single regeneration

Defence (option B with Doug's changes):
- [ ] Player kicks off each defend level by shooting; kills earn the first defence purchase
      quickly. Player keeps shooting alongside guards and towers afterwards.
- [ ] Guard post pre-built on defend levels; first purchase is hiring guards.
- [ ] Walls are built by hand and cannot be broken. The gate can be broken and cannot be
      repaired. Attackers past the gate go straight for the core.
- [ ] Narrower attacker paths funnel to the gate; turret sockets sit at the gate, inside or
      outside the wall.
- [ ] Keep building and upgrading till the end: more towers on sockets, tower levels 2 and 3
      (level 3 is new), rising costs.
- [ ] Stars: "no wall lost" becomes "gate held". A broken gate loses the star only; a broken
      reactor core loses the level.

Other:
- [ ] Pull resource fields (ore, scrap, greens) in toward the core so the whole base is compact like
      the vibe image; today the level templates place them and the sandbox sliders do not reach them
      (Doug, 2026-10-22). Add a sandbox slider for it first.
- [ ] Building packing and screen alignment from the Batch 0 values; the camera keeps
      following the player (the base need not fit the screen).
- [x] Player walks through buildings (not walls or turrets); others path around; the building
      goes see-through while the player is inside.
- [x] Player loadout block: gather speed, carry capacity, shot damage and rate, move speed,
      range, all as params (foundation for between-level equipment).
      Done 2026-10-22 (9e504de): player.* params already per level; added player.gatherSpeed (%)
      and player.carryBonus; bots use sim playerCap/gatherTicks. Defaults change nothing.
- [ ] Bump ENGINE_VERSION, re-pin golden levels, regenerate the pack as **50 levels**,
      `levels:check` clean. All player progress resets to L1 (alpha rule).

## Later (not this round)

- Ammo logistics for turrets (option C).
- Guard post upgrade that trains soldiers instead of guards.
- Economy links: guards need settlers (housing), tower level capped by reactor core level.
- Between-level equipment: scythe (picking speed), backpack (carry), and so on.
- Zoom gesture: dropped; the sandbox zoom answer replaces it.
- Backlog 8 (L50 goods machines hidden behind a long pad chain): dropped; the helper arrow
  should cover it. Revisit if it still feels like a slog.
- Backlog 1 (no models per level): already true; was a symptom of 12.

## Open questions

- Can the gate be upgraded for more HP, even though it cannot be repaired? (asked 2026-10-22)
  Doug: not yet. Groundwork exists: gate HP is its own param (barrier.gateHpMax) and upgrade
  effects can target gates only ("gate": true, see struct.barrier.reinforced in upgrades.json), so a
  gate upgrade is a data entry plus generator pad placement and a bot purchase rule, no engine work.
