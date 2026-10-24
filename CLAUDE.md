# Farthest Outpost: rules for the coding agent

Read `docs/SPEC.md` before changing rules. `docs/prototype/frost-camp-demo.html` is the
playable prototype; its numbers and behaviours are the source of truth where the spec
is silent. `docs/DECISIONS.md` records decisions made after the spec was written and
overrides the spec where they conflict.

## Hard rules

1. **No level-specific code.** Never `if (level === n)`. Every number a mechanic uses
   reads from `packages/content/data/*.json` (defaults) or the manifest's `params`.
2. **`packages/sim` imports nothing that renders.** No DOM, canvas, Phaser, three.js,
   Node fs, timers or `Math.random`. It depends on `@fo/content` only.
3. **The sim is integer-only.** Positions, speeds and radii are fixed point
   (`FP = 1000` milli-units); durations are ticks (`TPS = 30`). Decimals exist only
   in content/manifest files and are converted once in `compile.ts`. Use `mulDiv`,
   `isqrt`, `within`; never `Math.hypot`, `Math.sin`, floats, or `Math.random`.
   Randomness comes from `state.rng` only.
4. **State is plain data.** No classes, closures or object references inside `State`;
   index or id references only, so it hashes, clones and replays.
5. **Every new mechanic ships with:** its content schema + data, a manifest entity
   type if needed, a property test, a bot behaviour (from Phase 2) and a rater metric
   (from Phase 2). Add it to `IMPLEMENTED_MODULES` in `sim.ts` only when all of its
   rules run.
6. **Canonical ids only** in data, code and assets: `category.function`
   (`res.food_raw_1`, `node.material_source`, `sink.core`). No user-facing name,
   colour or asset path in code; skins supply them. Prose in docs uses generic names.
7. **Shipped manifests are pinned** to `engineVersion` and `contentVersion`. A rules
   change bumps `ENGINE_VERSION` / `CONTENT_VERSION` and re-baselines the golden levels
   under `levels/golden/`; it never silently changes a level a player has seen.
8. **Renderer naming:** say "2D renderer" and "3D renderer", never "Phase 1/2
   renderer". "Phase N" refers to the build plan only (0 sim core … 7 App Store port).

## Layout

```
packages/content   registries (JSON + zod schemas), manifest schema, cross-ref checks
packages/sim       fixed-step headless simulation; systems/ one file per mechanic group
levels/golden      prototype levels as manifests with recorded results (CI baseline)
docs/              SPEC.md, DECISIONS.md, prototype/
```

Later packages (bots, generator, rater, sequencer, render-2d, render-3d, client,
calibration) follow the spec's tech-stack section.

## Commands

```
pnpm install
pnpm test          # vitest: determinism, property and port tests
pnpm typecheck     # tsc project references
pnpm check         # both
pnpm dev           # client on 0.0.0.0:5180
pnpm build         # production build into ./dist (Vercel output)
pnpm levels:build --from 1 --to 60 --out levels/packs/s1   # regenerate the pack (~45 min)
pnpm levels:check  # replay every pack level with the bot ladder (~30 s)
```

## Working on this project (for any machine)

- **Read first:** `docs/DECISIONS.md` (overrides the spec), `docs/REDESIGN-R2.md` (latest agreed
  design), `README.md` status. Doug's feedback rounds are recorded there, not in chat history.
  The current round's work ledger is `docs/BACKLOG-R4.md`; tick items there as they land.
- **Hosting:** GitHub `dsutclif/Final_Outpost` (public), Vercel auto-deploys `main` to
  https://final-outpost-rho.vercel.app (`vercel.json`; root build copies the client into `./dist`).
  Doug plays on an iPhone from that URL. After pushing, wait for the new `assets/index-*.js` to
  appear on the URL, then verify there; "done" means verified live.
- **Pushing:** this repo is Doug's alone; commit and push freely, no PR needed.
- **Engine bumps:** any rules change bumps `ENGINE_VERSION`, re-pins `levels/golden` and
  `levels/packs/s1`, then `pnpm levels:check` must stay clean. Level URLs carry the pack hash, and a
  waiting service worker offers itself on menu screens (Update now / Later); edit
  `packages/client/release-notes.json` before pushing a release, since its notes are what players see.
- **Models:** Doug wants cheaper models where they fit: Opus for large judgment-heavy work, Sonnet
  for narrow fixes, playtests and docs, Haiku for mechanical checks. Lean briefs that point at
  specific docs/files rather than the whole spec. If a usage limit stops an agent, resume it.
- **Browser checks:** never start the Browser pane by launch-config name from another project's
  folder; run `pnpm dev` yourself and open it by URL.
- **Windows toolchain:** if `pnpm` isn't found in Git Bash, run it from PowerShell (node lives in
  `C:\Program Files\nodejs`, pnpm in `%APPDATA%\npm`). Vitest is capped at 3 workers because the
  long synchronous bot/rater hooks time out under heavy parallel load.

## Conventions

- Systems run in a fixed order in `sim.ts`: move → core → nodes → player actions →
  pile → sales → end check. Add new systems to that list deliberately.
- Events are the only channel to renderers; add an event rather than letting a
  renderer inspect state diffs.
- Hints are events with keys (`hint`/`carry_max`); text lives in skins.
- Keep comments to the why; match the surrounding density.
