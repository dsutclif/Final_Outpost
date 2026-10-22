# Backlog round 4 (agreed with Doug, 2026-10-22)

The ledger for this round. Tick items as they land and are verified live on the Vercel URL;
add a dated note under an item when something changes. Decisions here go into DECISIONS.md
when they ship. Batches run in the order below.

## Batch 0: layout sandbox (dev page, no rules change)

- [x] Dev page on the Vercel URL with sliders for building density (block, street, footprint
      gap, core pull, screen radius), building size and camera zoom. It renders a sample base
      from the real generator layout code and the real models, with the vibe reference image
      in a corner for comparison. Live at /sandbox.html (2026-10-22); every pad is forced built,
      unlock gates skipped; "Copy link" carries the values in the URL.
- [ ] Doug plays with it; the chosen values are recorded here and feed Batch 3.

## Batch 1: renderer/client fixes (no engine bump, no pack regeneration)

- [ ] **Model swap on replay (backlog 12).** `loadMeshy` returns early for cached files
      without calling `onLoad`, so a second `init()` keeps code-built walls, decor, items and
      held props (`render-3d/src/assets/meshy.ts`, `renderer.ts` 343-372).
- [ ] **Full offline (11).** Precache every built GLB (`meshy.built.json`, with `?v=`), the
      pack index and all level files on install; add `clientsClaim`. About 10 MB is fine.
- [ ] **Buildings above floor tiles (7).** Lift buildings by the slab thickness.
- [ ] **Mites smaller (10).** Visual only; hit range unchanged.
- [ ] **Helper arrow (9).** Show the guide arrow on any level after 20 s with no progress
      toward level goals (not raw inactivity); add an off setting.
- [ ] **Text size.** "Max" text is unreadable and smaller than the rest; all dynamic on-screen
      text is slightly too small. One consistent, larger size scale for every dynamic text
      element, fixed on screen. Second time asked (first on 2026-10-18): check every element live.

## Batch 2: level checking and generation (code only; no pack ships except a playtest set)

- [ ] **Human-view bot (3).** Bot sees only what is on screen and in the HUD, reacts at human
      speed with some error; stars must be earned by this bot, not the perfect one.
      `levels:check` enforces a star rate.
- [ ] **Turret upgrade before turret (6).** `generator/src/build.ts` ~806-815 puts second-round
      towers after all upgrades; chain each upgrade after its own tower and add a pad-order
      check for upgrade targets.
- [ ] **No new levels after finishing the pack.** Diagnose and fix the `levels:next` path.
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
- [ ] Building packing and screen alignment from the Batch 0 values; the camera keeps
      following the player (the base need not fit the screen).
- [ ] Player walks through buildings (not walls or turrets); others path around; the building
      goes see-through while the player is inside.
- [ ] Player loadout block: gather speed, carry capacity, shot damage and rate, move speed,
      range, all as params (foundation for between-level equipment).
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
