# Closed: graphics look test, live on main (2026-11-04)

The look-test work is **merged and live** (`main` at `2b0b2b1`, release notes rewritten, deployed bundle checked).
Nothing is left half-done from this session. The branch `look-test` is behind `main` and can be deleted.

## What shipped (on by default, off on the low quality tier or with `?look=0`)
- HDR composer: Mars-sky image-based light (warm day, cool night), bloom on glows, full-retina resolution up to 3x that
  steps down when fps < 50 (`render-3d/src/lookTest.ts`, `LOOK_TUNE`). `?look=1` shows an fps badge.
- Reactor: a soft, smoky additive glow replaces the orb and flame (`lookTest.ts` `GAS_*`).
- Particles: soft sprites (dust puffs, streaking chips, fluttering confetti); turret shots as bolts of light; dust-storm
  sheets (`scene/softfx.ts`, `scene/fx.ts`, `scene/environment.ts`).
- Rounded, sand-toned stones (`geom.ts` `ROCKS`), safe ring above the deck tiles.
- Ridge and outcrop terrain (hopper bounds, the land beyond the gates) is now tiles of the Rockslide GLB in one instanced
  batch (`renderer.ts` `syncZones`, `walls.terrain`). Chasm rims keep their code rocks.
- KILN's cloud: no square blocks (`d9526f0`).

## Not verified
On an iPhone (frame rate with the storm at 3x), in real play (turrets firing, real storms), and ridge tiles in daylight.

## Follow-ups (new work, not leftovers)
- Meshy pipeline: normal maps (`"normalMap": true` in `meshy.json`, then `pnpm models:build`), then bake
  metal/roughness and AO, then KTX2 (`tools/build-models.ts:491` currently drops these maps).
- BACKLOG-R6 N5/G3: red bolts for enemies, and drone and hunting shots through `Bolts` (`fx.ts` `BOLT_FRIENDLY`).
- Stronger storm wind streaks if Doug wants them (`softfx.ts` `StormDust`).

## Traps
See git history of this file (`0bae6d4`) for the full list. The key ones: `scene.environmentIntensity`, not
`envMapIntensity`; hash the integer lattice at highp; velocity-aligned quads need `DoubleSide`; the layout sandbox redraws
only on demand; never kill a dev server you didn't start (ports are shared between sessions).

## Added 2026-11-04 evening (live at `8cc20e4`)
- iPhone flash fixed: resolution steps now apply before drawing (resizing the canvas after a frame blanked it), climb back
  only after 10 good seconds, and stop climbing after two drops (`lookTest.ts` `pendingDpr`, `drops`).
- Coins flying to the cash counter shrink on screen to the counter's 26 px coin icon (`fx.ts` `hudScale`, renderer `init`,
  client `coinTarget` returns `size`).
- **For whoever moves scrap to the HUD (Doug: "scrap is up top only and not carried on the back"):** fly scrap with
  `fx.coins(from, () => this.fromScreen(hud.x, hud.y), n, "<scrap res id>", true)`. The last argument makes it shrink to the
  HUD icon too. Point `hudAnchor`'s `size` at the scrap icon when that HUD element exists.

## Added 2026-11-04 late (live at `0a5c443`) and session close
- **Brightness trim:** Doug found the new look brighter. Measured on L8 (layout sandbox, desktop, same camera), the mean
  luminance (0–255) was 132.6 for the old look and 135.1 for the new one. `LOOK_TUNE.exposure` is now 0.95 (applied to
  `toneMappingExposure` only while the look draws) and `env` is 0.1. A test at 0.93 measured 130.0, so 0.95 should land
  near 132; 0.95 itself was not measured. Not checked on an iPhone. To re-measure, screenshot `layout.html?l=8&q=high&zoom=300` with and without
  `&look=1` after the camera settles (~18 s), then average with sharp.
- **Current live tuning** (`render-3d/src/lookTest.ts` `LOOK_TUNE`): exposure 0.95, env 0.1, hemi 0.9, glow 2.2, bloom 0.45
  (radius 0.05, threshold 2), reactor gas (W 1.0, rise 0.2, bright 4). Resolution: up to 3x, step 0.25, min 1.5; drops when
  fps < 50, climbs after 10 s at fps >= 57, and never climbs again after two drops.
- **What Doug has confirmed:** he likes the effects contact sheet and the smoky reactor glow. The iPhone flash and coin size
  were fixed after his video; he has not reported back on either yet.
- **Worktrees and branches you can delete:** `../fo-wt-look` (branch `look-test`, stale: everything is on main) and
  `../fo-wt-kiln` (branches `kiln-noise` and `fix-flash`, all pushed to main). Nothing in them is unpushed.
- **Open items (all optional, none half-done):** Meshy pipeline (normal maps first); red enemy bolts and drone and hunting
  shots via `Bolts` (R6 N5/G3); scrap-to-HUD flight (see above); stronger storm streaks; ridge tiles in daylight checked on
  a phone.
