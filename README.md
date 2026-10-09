# Farthest Outpost

A real-time survival game whose every level is generated, rated and sequenced by a
parametric engine. One deterministic simulation drives the game, the generator, the
rating bots and both renderers.

- `docs/SPEC.md` — the game and level-engine spec
- `docs/DECISIONS.md` — decisions made after the spec, which override it
- `CLAUDE.md` — rules for the coding agent
- `docs/prototype/frost-camp-demo.html` — the playable prototype (open in a browser)

## Status

Phase 0 (sim core): content schemas, fixed-step headless sim, seeded RNG, event bus,
determinism and property tests, prototype level 1 as a golden manifest. Modules
running: carry, gather, core, sales. No renderer yet.

## Develop

```
pnpm install
pnpm check
```
