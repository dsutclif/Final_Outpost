# Opening film tools: how to run them and the open fix (2026-11-09)

The opening film (`crash_open`) is live and Doug confirmed it on his phone. Everything is in `tools/cinematics/` (needs Blender 5.2 at
`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`; no python on the machine).

**Not in git (backed up):** the CMU motion capture `tools/cinematics/mocap/` and `cache/` (Meshy models). Backup zip, outside the repo:
`C:\Users\dougl\OneDrive - Module12 LLC\Desktop\Projects\Mobile game\backups\film-tools-mocap-cache-2026-11-08.zip`; copies also live in
`fo-wt-handoff\tools\cinematics\` and the main checkout's `tools/cinematics/`. Rendered frames (`out/`) are not kept in git either.

**What renders what**
- `game_set.py`: the crash site from `story-L001.json` (metres from pod0). `POD_BURY` = 0.30 m (pods sit a third in the sand).
- `game_film.py`: the pod sequence (lie, glass opens, sit up, stand, turn on the spot, step over the wall, drop, look, crane to the game
  camera). Flags: `--eevee` lit night dust storm 720x1280 (default is fast Workbench 360x640), `--frames a b`, `--list 5,9,12` (single
  frames), `--stills --at ...`, `--step`, `--top`, `--iso`, `--clip` (numeric suit/pod crossings), `--flat` (motion only), `--approval`.
  Render long runs in chunks of about 64 frames (long Blender sessions glitch a frame yellow; scan with ffmpeg signalstats UAVG < 100).
- `pod_exit.py`: the motion (mocap takes, turn, step scale, slide). Tuning knobs are env vars set at the top of `game_film.py`.
- `game_crash_23.py`: the descent, impact and wreck shots at night (the shipped film keeps the first film's descent and impact frames 1-105).
- Film assembly: frames 1-105 from the first film, 106-165 `game_crash_23.py --shot 3`, then the pod sequence from frame 166; encode with
  `encode.py`. The last 75 frames got a per-frame brightness hold (ffmpeg `lutrgb` gain from the frame's mean luma).
- `film_level_edits.mjs` (already applied) and `cut_pod_floor.py` (already in the shipped pod model).

**Open: the feet slide after the drop.** Cause: the recorded drop clip (`82_02`) has no run, only a crouched recovery, and the film stretches
its travel about 2.2x (`DROP_EXTRA`, 1.3 m) to end on level 1's start spot, so the feet skate. A first attempt to loop a gait cycle failed
because neither the drop clip nor the walk after the wall holds a full cycle (an experiment is on branch `wip-film-feet-2026-11-09`, not
for main). Proper fix: add the walking clip `mocap/01_07.amc` as a new take between the drop and the look-round in `build_takes()`
(`pod_exit.py`), crossfade in and out, run it at its own speed for the extra distance, remove `DROP_EXTRA`; re-render only from the
landing onward (about 15 min at 3.5 s a frame, then re-assemble, hold the crane brightness and re-encode). The film's last frame must stay
at level 1's start (453.9, 130.8 from pod0 -3.75 m, -0.21 m); if the walk's whole steps move the end, change level 1's `start` to match.
Also: level 1 opens in a new "storm" light (skin `look3d.storyNight.storm`, light preset `storm: -2`) matched to the film's last frame.
