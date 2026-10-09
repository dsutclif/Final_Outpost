# Build plan and workstream contracts

Owner: the orchestrating session. Workers: agents, each confined to the directories named in
its brief. This file is the contract between them. Read `CLAUDE.md` and `DECISIONS.md` first.

## Goal

A complete, playable Farthest Outpost: installable offline web app for phones, every level
generated and bot-verified, Mars Greenhouse skin, 2D renderer first and a three.js renderer
on top, Capacitor-ready for the App Store. Reference feel: the low-poly, tilted-top-down,
item-stack-on-back, confetti-and-coins look of Whiteout Survival / Kingshot / Township ads.

## Waves

| Wave | Streams (parallel) | Depends on |
|------|--------------------|------------|
| 1 | **A** sim rules: every catalog module, levels 2–4 as golden manifests · **B** client shell + 2D renderer + Mars skin for the Phase-0 modules | Phase 0 |
| 2 | **C** bots + rater · **B2** renderer for every module | A |
| 3 | **D** generator + sequencer + batch CLI → level packs | C |
| 4 | **E** 3D renderer (three.js, procedural low-poly) · **F** client integration: level packs, progression, telemetry queue, settings | D, B2 |
| 5 | polish, playtest loop, performance, Capacitor config, store checklist | all |

## Package map

```
packages/content     registries, manifest schema            (A owns; B/C/D read)
packages/sim         rules                                  (A owns)
packages/bots        planner bot, skill ladder, stall detector (C owns)
packages/rater       metrics, difficulty/fun indexes          (C owns)
packages/generator   layout templates, flow model, mutation   (D owns)
packages/sequencer   intro order, subset rule, curve shaping  (D owns)
packages/render-2d   canvas renderer                          (B owns)
packages/render-3d   three.js renderer                        (E owns)
packages/skins       skin data packs (names, palettes, sprite/model keys) (B owns, E extends)
packages/client      Vite PWA app shell, HUD, menus, saves, telemetry queue (B/F own)
levels/golden        prototype levels as manifests (A)
levels/packs         generated packs (D)
tools/               batch CLIs (D)
```

Rules for all workers: stay inside your directories; do not edit another stream's package;
do not commit (the orchestrator commits); `pnpm check` must pass before you report done; add a
dependency only if you need it and say so in your report.

## Contract 1: simulation API (A → everyone)

`createSim(manifest, opts) → Sim` with `step(input) → SimEvent[]`, `state`, `snapshot()`,
`hash()`, `safeRadius()`. Input is `{dx, dy}` fixed point (`FP = 1000`), one per tick at
`TPS = 30`. State is plain data (see `packages/sim/src/state.ts`); renderers read it and
events, never write.

Phase-1 state additions (names are fixed so B2/C can code against them before A finishes):

```
state.residents[]   { id, pos, role, status: ok|injured|healing|frozen|towed|releasing|waiting|arriving,
                      carry: res|null, n, mode: gather|deliver, target: entityId|null, assign: {...} }
state.pads[]        { id, type, pos, done, paid: {res: n}, visible, locked }
state.structures[]  { id, type: struct.*, pos, level, hp?, hpMax? }
state.barriers[]    { id, a: Vec, b: Vec, res, costPerSection, sections: [{ a, b, built, hp, hpMax, gate }] }
state.zones[]       { id, type: zone.blocked|zone.waiting, rect: {x,y,w,h}, cleared }
state.captures[]    { id, type: capture.*, pos, state: idle|towed|releasing, timer }
state.prey[]        { id, pos, hp, alive, respawn, zone }
state.hostiles[]    { id, type: hostile.*, pos, hp, target }
state.drops[]       { id, res, pos }
state.converters[]  { id, type: conv.*, pos, inQ: res[], out, acc, operatorPos, pickupPos }
state.depot         { pos, stock: {res: n} } | null
state.meters        { lifeline, baseHealth, baseHealthMax }
state.waves         { idx, pending: [{tick, type}], active }
state.hazard        { phase: none|warning|active, until }
state.lasso         { trail: Vec[], towing: captureId[], engaged }
state.player.tow    captureId[]
state.timers        { gateAcc, gateLeft }
state.stats         { sold, built, rescued, injured, barriersLost, lifelineLowTicks, idleTicks, ... }
```

Events added: `hired`, `built`, `unlocked`, `captured`, `released`, `recruit_arrived`,
`moved_in`, `hit`, `died`, `drop`, `picked`, `wave_started`, `wave_cleared`, `barrier_built`,
`barrier_broken`, `injured`, `healed`, `hazard_warning`, `hazard_start`, `hazard_end`,
`core_upgraded`, `zone_cleared`, `converted`, `pad_paid` (partial payment tick).

## Contract 2: renderer (B/E ← client)

```ts
interface Renderer {
  init(manifest: Manifest, skin: Skin, mount: HTMLElement): void;
  sync(state: State, alpha: number, cam: Camera): void;   // alpha in [0,1) between ticks
  onEvent(e: SimEvent): void;                            // animation, particles, sound hooks
  resize(w: number, h: number): void;
  dispose(): void;
}
```

Fixed-point world (x, y) maps to 2D canvas (x, y) and to 3D ground (x, z); height is visual
only. Camera follows the player with easing; the world is 480 × 900 units portrait.

## Contract 3: skin (B owns `packages/skins`)

A skin is a data pack keyed by canonical id: `{ id, name, lifelineName, names: {id: string},
palette: {ground, structure, accent, interactive, danger, res: {id: color}}, sprites: {id: key},
models: {id: key}, text: {hints: {hintKey: string}, ...}, audio: {eventKey: key} }`. Skins:
`mars_greenhouse` (launch), `debug` (grey, every id labelled). `frozen_camp` names exist for
golden-level text only. A CI test fails if any canonical id in content lacks a name in a skin.

## Contract 4: bots (C → D)

```ts
type BotProfile = { name, reactionTicks, routeNoise, priorityErr, multitask: boolean, learn: number };
playBot(manifest, profile, seed) → { won, reason, ticks, margin, stalls: number, stallStates: [],
  trace: { lifelineMin, lifelineLowTicks, concurrentDemand, routeShare, baseHpLost, barriersBroken,
           injuries, currencyNeeded, currencyEarned, rewardGaps: number[], deadTicks, modulesUsed } }
```

Ladder: `good`, `average`, `weak`, `novice`, `floor`. `rate(manifest) → { D, F, metrics, botsPassed,
margin, filters: {idleModule, trivial, stall, unreadable, duplicate} }`.

## Contract 5: generator (D → client)

`generate({ target, modules, goalType, seed, template? }) → Manifest | null` (null when the
mutation budget is exhausted). `sequence(index, history) → request`. Batch CLI
`pnpm levels:build --from 1 --to 60 --out levels/packs/s1` writes `pack.json` (manifest list +
versions) plus one file per level. Packs are static assets the client fetches and caches.

## Contract 6: client (B/F)

Vite + TypeScript, `vite-plugin-pwa` (Workbox) precaching the shell and the active skin,
runtime caching for `levels/packs/**`. Saves in IndexedDB (`idb`), `navigator.storage.persist()`
on launch. Telemetry events queue in IndexedDB and post to `VITE_TELEMETRY_URL` when set
(no backend in v1: export-to-file button instead). Portrait, safe-area insets, floating
joystick on drag, arrow keys on desktop. Settings: renderer (2D/3D), quality tier, haptics,
sound. Menus: title, level select (cleared/locked), intro card per level, result card.

## Definition of done (whole build)

1. `pnpm check` green; bot regression over every shipped level green (no stalls, all feasible).
2. At least 60 generated levels in packs, difficulty curve per spec, plus the 4 golden levels.
3. The app installs to a phone home screen, plays ≥ 20 cached levels in airplane mode, keeps progress.
4. 3D renderer at 30 fps on a mid-range phone, 2D fallback, Mars Greenhouse complete.
5. Capacitor project configured (iOS + Android), privacy manifest and store listing checklist in
   `docs/RELEASE.md`. Signing and upload need Doug's Apple account and a Mac.
