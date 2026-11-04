# Hand-off: graphics look test (branch `look-test`)

Written 2026-11-04 by the session that built it. Read this before touching the 3D renderer's look.

## Where it is

- **Branch:** `look-test` on GitHub (`dsutclif/Final_Outpost`). Last commit `db44834` ("Look test: effects
  contact sheet"); the code commit before it is `7b71243`. It branched from `main` at `6d42183` (2026-11-04
  morning) and is **not merged**. `main` has moved on since; rebase before merging.
- **Preview:** Vercel builds the branch at
  `https://final-outpost-git-look-test-dougs-projects-6aeeff03.vercel.app/?look=1` (behind Vercel sign-in, which Doug
  can pass). `?look=1` turns the look test on and is remembered on the device in `localStorage` `fo.look`; `?look=0`
  turns it off. A badge in the bottom-left corner shows "LOOK TEST · resolution · fps".
- **Local:** worktree `../fo-wt-look`. The layout sandbox takes `layout.html?l=8&q=high&look=1&zoom=300` for side-by-side
  shots. Before/after images are in `docs/look-test/` on the branch (`compare-l8.jpg`, `effects.jpg`).

## What the look test does (all gated on `?look=1`; with it off the game is unchanged)

| Piece | Files | Status |
|---|---|---|
| HDR composer: Mars-sky image-based light (warm day sky, cool night sky), bloom on glows only, OutputPass | `render-3d/src/lookTest.ts` | Done, tuned on desktop |
| Full-retina resolution (up to 3x) that steps down when fps < 50 | `lookTest.ts` (`DPR_*`) | Done; Doug saw 2.00x at 60 fps |
| Dusty surfaces (roughness >= 0.93) get no sky sheen | `lookTest.ts` `DUST_ROUGH` | Done |
| Reactor: orb and flame replaced by a soft additive smoky glow (Doug: "a reactor, not a furnace") | `lookTest.ts` (`GAS_*`, `findGases`, `driveGases`) | Done, Doug approved the look from a screenshot |
| Particles: soft sprites (dust puffs, streaking chips, fluttering confetti cards) instead of cubes | `scene/softfx.ts` `SoftParticles`, `scene/fx.ts` `enableSoft`/`drawSoft` | Done, checked on desktop |
| Turret shots: bolts of light (white-hot core, blue halo, muzzle flash, impact flash, light on the ground) | `scene/softfx.ts` `Bolts`, `fx.ts` `tracer` | Done; matches BACKLOG-R6 **N5** (updated on main 2026-11-04) |
| Dust storm: full-screen drifting dust sheets and wind streaks instead of sliding bars | `scene/softfx.ts` `StormDust`, `scene/environment.ts` `enableSoftStorm` | Done; streaks are faint |
| Rounded, sand-toned stones instead of dark 12-sided blocks (pebbles and every `GeoBuilder.rock`) | `geom.ts` `ROCKS`/`stoneGeometry`, `environment.ts` `buildScatter` | Done |
| Reactor orb and flame spheres smoothed (12x8 to 32x20) | `assets/buildings.ts` | Done (not gated) |
| Safe ring above the tallest deck tile (it dipped under some tiles) | `scene/environment.ts` `safeRing.position` | Done on the branch; **also a live-game bug** |

Tuning knobs are in `LOOK_TUNE` (`lookTest.ts`) and on `globalThis.__look` in the browser. In look mode the console also has
`__lookFx`, `__lookEnv` and `__lookCam` for firing effects by hand.

**Already on main (not part of this branch's diff):** KILN's cloud no longer shows square blocks (`d9526f0`, live and
verified), and BACKLOG-R6 N5 now names the turrets and the "light, not a line" bolt look (`54b1712`).

## Verified and not verified

- Verified: typecheck plus 212 render-3d tests on the branch. Every effect was rendered and screenshotted in the local
  layout sandbox (desktop Chrome pane). The Vercel preview builds.
- **Not verified:** any of the effects on an iPhone, in real play (turrets firing, a real storm, farming dust), or in
  night and story scenes. No frame-rate check on a phone with the storm shader at 3x resolution.

## Next steps

1. **Doug reviews the preview on his iPhone** and says what to keep. Then decide how to ship it: as the default, or as
   the "high" quality tier only (`units.ts` `TIERS`). The full-screen storm shader and 3x resolution are the costliest
   parts.
2. **New request from Doug (2026-11-04, not started): replace the code-built rock outcrops with the real 3D Rockslide
   model.** The outcrops are `buildTerrain` in `render-3d/src/assets/scatter.ts:236`: `terrain.ridge` rows of
   `b.rock(...)` chunks, and the `chasm` rim rocks. The Rockslide GLB is already built for the game as
   `zone.blocked` (`assets/meshy.json:120`, file `Rockslide.glb`, `"batch": "rubble"`, drawn through
   `renderer.ts` `meshyWall` / the `rubble` Batch). Approach: when the Meshy entry lands, draw ridge (and chasm-rim)
   terrain as instances of that geometry tiled along the ridge's long axis. Vary yaw, scale and a little offset per
   instance using `hash01`, and sink each instance slightly. The ridge footprint comes from `w`, `d` and `alongX` in
   `buildTerrain`. Keep the code rocks as the fallback until the GLB loads, as other Meshy swaps do (`onMeshy` in
   `renderer.ts` `init`). Confirm with Doug whether the ore piles (`buildOrePile`) count as "outcrops" too.
3. **Safe-ring fix to main:** one line in `scene/environment.ts`
   (`this.safeRing.position.set(core.x, SLAB_TOP + 0.2, core.z)`). Doug has not yet said whether to ship it
   ahead of the look test.
4. **Meshy model pipeline (bigger visual gain than lighting):** `tools/build-models.ts:491` throws away Meshy's normal and
   metal/roughness maps and sets roughness 0.9 and metalness 0. In order of payoff: turn on `"normalMap": true` for
   buildings and props in `meshy.json` and run `pnpm models:build`; bake metal/roughness (plus ambient occlusion in the
   red channel) the way base colour is baked; then compress textures to KTX2 to save GPU memory. Only the 4 unwired decor
   entries have normal maps today.
5. Smaller items: make the storm's wind streaks stronger (`StormDust` `streak` term); give enemy bolts red
   (`fx.ts` `BOLT_FRIENDLY` is blue only, and N5 wants red for enemies); point hunting shots and drone shots at
   `Bolts` too (R6 G3).

## Open questions for Doug

- Keep which look-test pieces, and ship them as the default or as the high tier only?
- Ship the safe-ring fix to main now?
- Which "rock outcrops" should become Rockslide models: terrain ridges only, or ore piles too?
- Start the Meshy pipeline work (normal maps first)?

## Traps hit (save yourself the time)

- **`scene.environment` strength is `scene.environmentIntensity`** (three r163+). `material.envMapIntensity` only
  scales a material's own `envMap`. To exclude a material from the sky, give it its own `envMap` with intensity 0.
- **Noise hash blocks:** a float hash with big multipliers (`fract(p * vec2(123.34, 456.21))...`) shows square blocks,
  because the compiler regroups the corner sums and iPhones run mediump at 16 bits. Hash the integer lattice
  (`mod(p, 256.0)`, `sin(p.x + p.y * 57.0)`) and use `highp`. This was fixed on main for KILN; the look-test shaders use
  the same hash.
- Additive glow over a bright surface washes out; normal blending shows dark billows. Doug wanted the washed, soft look
  for the reactor.
- A flat billboard at a model's centre gets cut by the model's inner geometry. Moving it toward the camera made things
  worse.
- **Velocity-aligned quads are built mirrored and get back-face culled:** use `DoubleSide` (in `softfx.ts` `Quads`).
- **The layout sandbox redraws only on demand** and doesn't advance effect timers while idle. Dispatch
  `new Event('resize')` to force a frame; the screenshot then shows the previous frame. The camera eases into place for
  about 15 s after load, so aim effects after it settles.
- **Dev-server ports collide with other sessions.** The pane is shared, and port 5191 belonged to another worktree; I
  stopped another session's server by mistake. Use your own port (I used 5197) and never kill a process you didn't
  start. Check its command line first.
- No `python` or `gh` on this machine. Use node scripts, and `curl https://api.github.com/repos/dsutclif/Final_Outpost/commits/<sha>/statuses`
  for Vercel status. Push over SSH (`git@github.com:dsutclif/Final_Outpost.git`).
