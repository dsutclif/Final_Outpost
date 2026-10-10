# Farthest Outpost

A real-time survival builder in the style of the Whiteout Survival / Kingshot playable ads,
where every level is generated, bot-verified, rated and sequenced by a parametric engine.
One deterministic simulation drives the game, the generator, the rating bots and both renderers.

## Status (2026-10-10)

Playable end to end as an installable, offline web app; Capacitor iOS/Android projects in place.

- **Sim:** all 21 catalog modules, integer fixed point, bit-for-bit deterministic (engine/content 0.4.0).
- **Levels:** 4 golden prototype levels + 60 generated levels (`levels/packs/s1`), all bot-feasible,
  zero stalls, curve and intro order in `docs/LEVELS.md`.
- **Client:** Mars Greenhouse skin; three.js 3D renderer (chosen by a first-launch benchmark)
  with a 2D canvas fallback; coach marks, stars, sectors, saves, telemetry queue; service worker
  precaches the shell and prefetches the next 30 levels. Shell 92 kB gz, 3D chunk 159 kB gz.
- **Tooling:** planner bot + five-rung skill ladder, rater (difficulty/fun indexes, quality
  filters), generator + sequencer, `levels:build` / `levels:check`.

Known limits: the bot ladder separates only at the bottom rungs, so predicted difficulty needs
real-player calibration; floaters can overlap; a few generated titles repeat.

## Run

```
pnpm install
pnpm dev            # http://localhost:5180 (and http://<lan-ip>:5180 on a phone)
pnpm build          # packages/client/dist, static; host anywhere with https to install
pnpm check          # typecheck + 309 tests
pnpm levels:build --from 1 --to 60 --out levels/packs/s1   # regenerate the pack (~45 min)
pnpm levels:check   # replay every pack level with the bot ladder
```

## Docs

- `docs/SPEC.md` spec · `docs/DECISIONS.md` decisions that override it · `docs/PLAN.md` contracts
- `docs/SIM.md` sim reference · `docs/LEVELS.md` the generated curve · `docs/ART-DIRECTION.md`
- `docs/RELEASE.md` web + store path · `docs/STORE-LISTING.md` · `CLAUDE.md` agent rules
- `docs/screenshots/` both renderers, golden and generated levels
