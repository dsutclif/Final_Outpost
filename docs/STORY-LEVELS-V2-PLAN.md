# Implementation plan: story levels 1–5 (2026-10-31)

Story and level detail: `docs/STORY-LEVELS-V2.md`. Reviewed for token use, architecture, visual polish and story (agents); findings are worked in.
Done: ground arrows, shipped across the whole game.

## Order

Level 1 ships first as a complete slice for Doug to play, then 2, 3, 4, 5. Shared work is built only as far as the next level needs.

| Stage | Work | Model | Runs |
|---|---|---|---|
| 1 | **B** Rules batch | Opus | Alone first: everything tuned later depends on it |
| 2 | **A** Director | Opus | After B, in parallel with C, D, E, F1 |
| 2 | **C** World light | Sonnet | Exports a module; no `renderer.ts` edits |
| 2 | **D** Reactor-spirit cloud | Sonnet | Exports a module; no `renderer.ts` edits |
| 2 | **E** Assets | Sonnet; Haiku for reduction and export runs | Own files |
| 2 | **F1** `crash_open` recut | Sonnet | Blender only; the file lands with level 1 |
| 3 | **W** Wire C and D, the `run` clip and hidden captures into `renderer.ts` | Sonnet | One owner, after C and D |
| 4 | **G1** Level 1 manifest, cues, text; ship with F1 | Sonnet | Needs B, A, C, D, W, wreck from E |
| 5 | Doug's sign-off on level 1 (below) | | Blocks further levels |
| 6 | **F2** Live-scene player, parity test on `empty_bays` | Sonnet | After A; touches `app.ts`, so not alongside A |
| 7 | **G2–G5** Remaining levels, one push each | Sonnet | Needs F2, rest of E |

Briefs point at sections only: A: cue format in `STORY-LEVELS.md`, V2 beats. B: `CLAUDE.md` engine rules, `DECISIONS.md` #14, the list below. C, D: V2 lighting and cloud sections. E: `meshy.json`, the Assets list. F: `tools/cinematics`, Films below. G: one level's V2 section, manifest schema.

## B: Rules batch (one engine bump)

Options are off by default, so generated levels keep their results. Each ships with property test, bot behaviour and rater metric (hard rule 5). Files include `objectives.json`, `schema.ts`, `manifest.ts`, skin text and bots.

- `core_lit` objective: done on first deposit.
- `fromLit: 1` param (booleans aren't accepted) on `fuel_full` and `survive`, plus a manifest option shifting hazard warn, start and end ticks and the warning event by `stats.litTick`. Wave ticks and `timerTicks` don't shift. An unlit core starts and fails nothing; test it.
- `sources` param on `converters_running`, counting a staffed source node. Must be opt-in, because `s1-L031` and `s1-L081` use this objective.
- Capture state `hidden`, flipped after `stepObjectives` by `hiddenUntil: <objective id>`. Lasso, `recruitPods`, the bot, guide and renderer all ignore it (the flight recorder).
- Lassoable result `item`, with no payout (the schema rejects an empty bundle), incrementing `crates`.
- `fleeSpeed`, where 0 means the hostile's own speed. Rater `story` metrics gain the recorder.
- `levels:repin` extended to `pack.json` and `s1-L*`. `pack.test` must fail, not skip, on a stale pack.

Already settable per manifest, no rule change: `defense.spawnY`, `stock.collapseSeconds` (0 on levels 1–5).

Bots: the two-pod tow and recorder fetch must pass `levels:check`. The backlog session is told when the bump lands. Pack rebuilds stay Doug's call; this needs only re-pinning.

## A: Director

Data only, in the skin, keyed by level id: `{ on, do }` cues. It never changes sim state.

- **Triggers:** start, sim event, objective done, player within radius, ticks since a cue (sim time, so freezes don't count).
- **Actions:** line, camera beat, freeze, tap-to-continue, light change, film or live scene, show goal, hide or show HUD parts (credits chip, fuel), day card, ghost with price.
- **Freezing:** the client's frame loop breaks out of its tick loop when a cue fires and clears the stepper accumulator, so a freeze doesn't overshoot.
- **Goals:** one at a time, star slots always visible, cracked when missed.
- **Try again prompt:** a per-goal flag, set only on L1 Fill the reactor and L2 Bring everyone home.
- **Crew introductions:** a queue, one per tap, then a tap resumes play.
- **Replays:** no beats or films, per `DECISIONS` #14. Lines remain.
- **Films:** `Progress.cinematics` stores a version per film; saved `true` migrates to version 1, with `cinematics.test` updated. Plays when unseen, on a new version, or after a level reset for an update.

## C: World light

Night floor is a measured minimum for sand and ridge brightness, checked on the phone at low brightness and outdoors.

Only one "go here" light is brightest at a time, and at most two things pulse at once:

| Rank | Role | Colour |
|---|---|---|
| 1 | Current goal light (fourth dot, wreck light, red helmet) | Goal's own |
| 2 | Pods and beams, dimming with their freeze timer | Orange for the old pod, cold white for crew |
| 3 | Headlights, hub windows | Warm |
| 4 | Ground dots | Blue |
| 5 | Cloud above the reactor | Blue, ambient |
| Always | Ridge pulse | Red, from one fixed screen side |

Also: lighting changes driven by level progress, tally above the head (3 slots, safe from notch and star slots), arrows circling two pods when a goal needs both.

## D: Reactor-spirit cloud

Port the agreed shader as `scene/corespirit.ts` (generic name, hard rule 6). Blue patch on the ground. States wired to the sim and director: nothing before ignition, bloom, breathing, speaking, red glitch on pulse, small and unsteady on low fuel, growth with reactor strength.

## E: Assets

- **Wreck:** reduced for the game, fixed position from level 1 to 5. Needed for level 1.
- **Pod deck:** reduced for live scenes.
- **Buggy:** `Buggy no Wheels.glb` is 2.9 million triangles and 95 MB. Reduced to about 40k triangles, 2 MB, with a normal map baked from the original. This is a written exception to the 5k building budget, for one brief scene; it loads only for level 3. Silhouette compared against the original from the game camera.
- **Wheels:** `Buggy Wheel.glb` reduced to about 3k, four placed per the `Mars Rover Buggy` mock-ups. Opposite side uses a pre-flipped copy with correct winding, hubs facing out. All roll at one ground-speed rate, in the same travel direction. Hub centres and radius checked against the body.
- **Old pod:** `cryo_pod` and `cryo_glass` reduced and recoloured orange, glass hinged separately, interior empty.
- **Helmet:** reduced for the game.
- **Built in code:** flight recorder, Halcyon chip (design waiting on Doug's pick).

## F: Films

- **F1 `crash_open`:** another session removed the reactor; recut to about 18 s, shot 4 at night, sand on the hull, OCCUPIED lights, two captions, ridge pulse on its fixed side. Final shot rendered near-orthographic to match the game camera (30° pitch, 45° yaw), same grade and exposure, 0.5 s crossfade, with a last-frame versus first-frame comparison.
- **F2 live scenes:** `empty_bays`, `crash_log`, Sela's reveal. `empty_bays` is built first as a parity test against `crash_open`; the others follow only if Doug accepts it. Filter applied, no lingering shots over 2.5 s.
- **Helmet fall:** the existing rendered `helmet_reveal` video is the fallback, and stays the default until a live version beats it. It lacks Vale's name, so a re-render with the new card is a separate call.

## G: Levels

Each level's manifest and cue table cover every beat in its V2 section, which is the checklist: lines, triggers, freezes, lights, props, freeze timers, pad names, decoy, modules. Level goals as listed in V2.

## Checks for each level

`pnpm check`, `levels:check`, drive it start to finish in the browser, screenshot at its darkest moment, release notes, push, verify live. iPhone: frame rate with cloud, storm and lights together, heat after 5 minutes, memory with the buggy loaded, sunlight readability, notch overlap.

## Doug's sign-offs

1. Before Stage 4: Halcyon chip design.
2. On level 1: night brightness, light ranking, cloud in place.
3. On F2: live scene against film quality.
4. On level 3: reduced buggy.
5. On level 5: live helmet or existing video.
