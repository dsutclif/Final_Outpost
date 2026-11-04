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
