# Opening film: what ships together (prepared 2026-11-09, branch `film-game-side`, NOT pushed)

The reworked opening film (night dust storm; wreck shot and pod sequence re-rendered on the game's own crash site, descent and
impact kept from the first film) only matches level 1 once all of this lands in one push:

1. `packages/client/src/cinematics/crash_open.mp4` + poster: the new 740-frame film (this branch).
2. `packages/client/public/models/decor.stasis_pod.glb`: the pod with its interior floor plate cut out (this branch; made by
   `tools/cinematics/cut_pod_floor.py`, 1,778 faces removed, bounding box unchanged).
3. Level edits (not applied: another session is editing `levels/story/story-L001..005.json`): run
   `node tools/cinematics/film_level_edits.mjs` from the repo root, then `pnpm levels:check --pack levels/story`. It moves the crash-site
   scrap 100 units west, sets level 1's `start` to the film's last frame [453.9, 130.8], sinks the pods 0.30 m instead of 0.80 m
   (lift -22.4 -> -8.4; closed glass 13.3 -> 27.3), re-poses the commander's glass and bumps `FILM_VERSIONS.crash_open`.
4. Renderer: no change needed (decor roll already turns about the model's own long axis before yaw).
5. Check on a phone (not done): level 1 (the opening film, then the first screen): the film's last frame matches where you start,
   the commander stands alone with no pod crowding him, pods read as sunk about a third into the sand; levels 2-5: the old
   pod's glass still opens correctly and the pods look right.
