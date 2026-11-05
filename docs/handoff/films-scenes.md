# Hand-off: story films, live scenes, crash-site re-layout (Account B, 2026-11-04)

**Branch:** everything is on `main` (worked on local branch `story-replay`, always rebased and pushed straight to
main; last commit `379fd82`). Nothing uncommitted. Full detail: the "Hand-off" section of `docs/STORY-WORK-LOG.md`;
sizes in `docs/SCALE.md`.

## Done and verified (deployed; checked as held frames in a portrait browser, not on a phone)
- `REPLAY_FILMS = true` in `client/src/cinematics.ts`: every story film/scene replays each play (set false later).
- Live scenes in `render-3d/src/scene/livescene.ts`: `empty_bays` (L2), `crash_log` (L4), `sela_arrival` (L3),
  `chip_handoff` (L3). `helmet_reveal` v2 video (L5). L1 S30 opening beat (skin cues).
- Doug's 16 notes of 2026-11-04 (see STORY-WORK-LOG entries): director triggers `{hostile}`/`{who}`, cast `{customer}`,
  L4 cashier, L5 turret/warlord line/helmet line, `unit.customer_sela` (navy tint in tools/build-models.ts).
- Sandbox: Crash site view (`client/src/dev/crashsite.ts`) and Layout mock (`client/src/dev/layoutmock.ts`). Keep the
  other session's "Buildings row" button in sandbox.html / sandbox.ts.

## Doug's layout (2026-11-04, from the Layout mock; metres, x east, z south, 1 m = 28 units)
| Thing | Position | Notes |
|---|---|---|
| Wreck centre | (1.52, -1.88), yaw -18° | 27 m long |
| Commander's pod (featured, open) | (6.49, 6.37) | L1 starts here |
| Two sealed background pods | (8.77, 6.37), (11.05, 6.37) | 2.28 m apart |
| Reactor | (-1.69, 16.19) | 3.2 m west, 18.1 m south of the wreck centre; 12.8 m from the commander's pod |
| Reactor's ore | (-8.35, 19.78) | 7.6 m west-south-west of the reactor |
| Flight recorder | (14.67, -0.67) | 10.8 m from the commander's pod |
| Ridge line | (18,-15) (19.5,-6) (17,3) (19,12) (17.5,19) (18.5,25) | a raised landform, ~1.5 m high, 4 m wide |
**Final (Doug, 2026-11-04): "an accurate representation of the relative locations I want for everything."** The mock's
phone boxes were only for his reference; ignore their positions. (The boxes themselves are correct: an iPhone 17 at
play zoom shows a ground strip ~6 m wide and ~26 m deep, as renderer.ts `halfGround` computes.) Sizes come from
docs/SCALE.md. The sandbox Layout mock opens on an earlier draft; these numbers win.

## Next steps
1. (Done: Doug's layout is above.)
2. **Done 2026-11-04** (`tools/relayout.ts`, re-runnable): the crash site in L1-5 about each level's reactor at Doug's
   offsets (wreck 27 m at -18°, three pods at 2.66 m, base 0.8 m down, the commander's open and Vale's bay 5 open from
   L3, no deck plates, no film-set ore piles, scrap moved with the pods, L4 recorder). L1 also: town moved (110, 80),
   map 980 wide, ore field at Doug's spot (7.6 m WSW of the reactor), start at the commander's pod, the ridge as
   `zone.terrain` rects along his line, cue points shifted, fill goal 30 s -> 45 s (bots back to 5/6 fill stars),
   `openZoom.hero` dropped. Live scenes' pods at 2.66 m (`POD_K` in livescene.ts). Story pack replays clean.
   **Open:** L2-5 keep their ore inside the camp wall. Since engine 0.19.0 (Doug, 2026-11-04) settlers route through
   gates (`gatedMove` in sim/systems/barriers.ts, used by every settler job in residents.ts; guards and medics keep
   their own gate logic), so the ore can now move outside the wall to Doug's spot as in L1. Tried 2026-11-04 (shift the
   L2-5 towns (110, 0), widen L2/L3 to 980, shift `route` arrays and L5's camera `[790, 700]`, `ore: true`): it fails
   `levels:check` (L3 weak/novice bots 0 wins, L4 weak worse): hauler trips through the gates are long enough that the
   reactor runs low. Reverted. Needs tuning first (a lower `core.burn` in L2-5, more haulers, or ore just outside a
   gate), Doug's call. Owed for 0.19.0: a property test for
   `gatedMove` (CLAUDE.md rule 5); L2-5's ridge rects are still the old north ones; nothing was checked visually in the game (the browser
   pane was hidden), so look at L1-5 on a phone first.
3. Re-render `crash_open` from the impact onward from the game's placements: the set as one background plate, then the
   commander alone (holdout layer, per-frame render region), composited. L1's `openZoom.film` framing is provisional
   until then. The old shot-4 night render in `fo-wt-handoff` is superseded.
4. After Account A releases `renderer.ts` (2026-11-05): the L5 warlord fall with the visible helmet drop and S33,
   the L2 old pod's hinged glass (S31), and in-game Sela in `unit.customer_sela`.

## Open questions for Doug
- What KILN stands for (not in any doc or git history).
- Final layout positions (from the mock).

## Traps
- A hidden browser pane pauses rAF: live scenes render only with `window.__live = { at }`; Vite page caches need a
  `?fresh=N` reload. Vercel fails builds on files over the 8 MB precache cap (vite.config.ts).
- Use SSH for git (https is blocked). Rewrite `packages/client/release-notes.json` before a player-facing push.
