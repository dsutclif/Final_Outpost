# Review tools (bot side and telemetry side)

The nightly review pipeline's measuring half. Interfaces: `docs/review/CONTRACT.md` (kept outside this
repo with the pipeline plan). Every command writes only under `--out` (plus the `--history` file) and
every limit lives in `boredom-limits.json`, never in code.

| Command | Reads | Writes |
|---|---|---|
| `pnpm review:pulse -- --out <dir> [--packs a,b,c] [--seeds 3] [--history f.jsonl] [--jobs N] [--only id,id]` | pack folders (default `levels/golden`, `levels/packs/s1`, `levels/story`) | `pulse.json`, `candidates-pulse.json`; one row per level appended to the history |
| `pnpm review:guide -- --out <dir> [--story levels/story] [--pack levels/packs/s1] [--first 10] [--seconds 600]` | story levels and the first levels of a pack | `guide.json`, `candidates-guide.json` |
| `pnpm review:telemetry -- --in <dir of batch files> --out <dir> [--since YYYY-MM-DD]` | Blob batches `{"v":2,"events":[…]}` at any folder depth | `telemetry-agg.json`, `candidates-data.json` |
| `pnpm review:calibrate -- --pulse <pulse.json> --telemetry <telemetry-agg.json> --out <dir>` | the two files above | `calibration.json` |

## Pulse

Per level it runs the rater (`measure` + `score`, with `--seeds` runs per rung instead of the rater's 10/3),
then the human-view bot for the same number of seeds, and reads three things off the human bot:

- **`shape`**: the `PlayShape` real players report (`packages/bots/src/shape.ts`), median over the seeds.
- **`oneTaskS` / `noTaskS`**: every `sampling.everyTicks` (15) ticks the planner is asked which kinds of
  task it has on offer that score at least `sampling.minScore` (30) (`Brain.taskKinds`, read-only: runs
  play identically with and without the sampling, which `packages/bots/test/task-kinds.test.ts` checks).
  `oneTaskS` is the longest stretch with exactly one kind on offer (no real choice), `noTaskS` the longest
  with none (nothing worth doing). Resolution 0.5 s.
- **`loopMax`**: the longest run of identical player trips (`BotTrace.loopMax`).

`moved` in `pulse.json` lists every tracked number that changed past its `tolerance` since the previous
history row of the same level (nothing when the seed count differs or there is no previous row). Only a
fall in human-view stars also becomes a candidate.

## Candidates

All commands emit the CONTRACT §4 shape. Fingerprints are `cat<N>|<levelId or *>|<subject>|<check>`; the
subject and check never hold a measured number (`segment()` in `lib.ts` turns stray ones into `#`).
The telemetry tool uses the same fingerprint as the pulse where both measure the same thing (reward
drought), so the two sources land on one issue.

Not measured here (needs the screen probes or the skins): long or unskippable text.

## Story line timing

The screen probe (`probe.ts`, story levels) checks two things at every caption, with the limits in
`probe-limits.json` under `story`:

- **`line-play-not-held`**: after the caption shows, the probe runs the game `holdSeconds` (1 s) more without a tap. If
  the same line is still up and more than `holdSlackTicks` (3) ticks ran, play is not held while the line is up and the
  player can walk on before reading it. Severity 2 on a gated line, 3 otherwise. Each `lines[]` entry in the summary
  carries `heldTicks` and the `why` of its gates.
- **Gates** (`story-gates.json`, one list per level id): `line-after-sight` when a line holding something `unseen` plays
  while that thing is at least `seenFraction` (0.25) on screen; `line-names-unseen` when a line that needs something
  `seen` plays and it is not; `line-out-of-order` when a line comes up before a line listed in its `after` has played
  (the answer before the question). Gates that never showed are listed in `extras.gatesNotReached`.

A real run on story-L001 (2026-11-12) showed why the order gate matters: every line held play, but the bot reached the
reactor in about 2.3 s and got "A reactor, and it's cold" while "That light. Someone's out there." was still waiting on
its 3 s timer.

To add a gate, add `{ "line": "<substring of the caption text>", "unseen": [ids], "seen": [ids], "after": ["<substring of an earlier line>"], "why": "<one sentence>" }`
under the level id. Ids must match `things[].id` from `window.R.snap()` (`sink.core`, `node.fuel_deposit`, ...). Add one
whenever a script line asks about or points at something.
