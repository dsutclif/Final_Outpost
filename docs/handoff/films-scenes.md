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
2. Apply to `levels/story/story-L00{1..5}.json` (three crash-site pods, not five: the commander's featured one and two sealed in the background, per Doug): wreck `scale` for 27 m; pods/lids for 2.66 m with the base 0.80 m in
   the sand; delete `deck`, `deck2`, `stripe`; move `core`, the town and `recorder`; add a ridge landform. Then
   `pnpm levels:check --pack levels/story`. Scale the live scenes' pods the same way (cavity maths in layoutmock.ts).
3. Re-render `crash_open` from the impact onward from the game's placements: the set as one background plate, then the
   commander alone (holdout layer, per-frame render region), composited. No hero growth at the hand-off (drop
   `openZoom.hero` in the L1 cues). The old shot-4 night render in `fo-wt-handoff` is superseded.
4. After Account A releases `renderer.ts` (2026-11-05): the L5 warlord fall with the visible helmet drop and S33,
   the L2 old pod's hinged glass (S31), and in-game Sela in `unit.customer_sela`.

## Open questions for Doug
- What KILN stands for (not in any doc or git history).
- Final layout positions (from the mock).

## Traps
- A hidden browser pane pauses rAF: live scenes render only with `window.__live = { at }`; Vite page caches need a
  `?fresh=N` reload. Vercel fails builds on files over the 8 MB precache cap (vite.config.ts).
- Use SSH for git (https is blocked). Rewrite `packages/client/release-notes.json` before a player-facing push.
