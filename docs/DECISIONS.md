# Decisions log

Decisions made after `SPEC.md` was written. Where they conflict with the spec, these win.

## 2026-10-09 — Phase 0 kickoff

1. **Barrier lines are their own module, and the lasso needs one.** A barrier line
   is the demarcation of where a wall can be built; walking along it while carrying
   the line's resource builds a section. It exists in any level where a wall can be
   built, defense or not. The lasso's tow line engages only when the player leaves
   through a gate, so `lasso` requires `barrier_lines`. Introduction order changes to:
   4 barrier lines + gate, 5 lasso and recruit rescue, 6 housing, 7 core levels and
   blocked zones, then the rest shift down one (see `packages/content/data/modules.json`).
2. **Lifeline grace period.** When fuel hits zero the lifeline starts draining at
   once; `core.grace` is the time from empty core to level failure (22 s in the
   prototype). Fuel restores recovery immediately.
3. **Fixed-point sim.** Integer milli-units for space, ticks for time, `mulberry32`
   for randomness. Content and manifests stay in decimals and are converted in
   `compile.ts`. Chosen over floats so Node, every browser and every phone agree
   bit-for-bit on replays and bot ratings.
4. **Renderer naming.** "2D renderer" and "3D renderer" replace the spec's "Phase 1/2"
   in the visuals section; the build is sequential (prove everything in 2D, then swap
   the renderer). "Phase N" means the build plan only.
5. **Housing before its module.** Levels that rescue or admit recruits before
   `housing` is introduced rely on `housing.base` slots from the manifest.
6. **Day timer.** Optional per level via `timer.seconds` in params (0 = none). The
   open decision about making it standard stays open.
7. **Repo.** New standalone repo at `C:\Users\dougl\Projects\farthest-outpost`,
   pnpm workspace, TypeScript, Vitest, fast-check, zod. GitHub remote later.
8. **Delivery.** Installable offline web app first (service worker, level-pack
   prefetch, IndexedDB saves), loaded on the phone over local Wi-Fi during
   development and from free static hosting after; App Store port behind the gate.
9. **Models.** Fable 5.1 for architecture-heavy phases (0, 2, 3, 6); Opus 5.5 for
   UI, offline shell, 3D renderer and the store port (1-UI, 4, 5, 7).
10. **Goal building id.** The prototype's "Lodge" and "Trading Post" are the same
    function: `struct.landmark`.
