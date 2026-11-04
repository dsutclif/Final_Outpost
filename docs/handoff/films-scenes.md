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

## Next steps
1. Doug arranges the site in the sandbox Layout mock and pastes Copy settings. Do not rebuild levels before that.
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
