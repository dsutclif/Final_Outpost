# Level supply: endless levels, built ahead of the player

The spec's "endless series of levels" with generation kept as an offline batch (SPEC "Generation
and rating time"): levels are still built and bot-tested on a computer, never on the phone, but now
in batches as the player advances instead of one fixed pack. DECISIONS 9n.

## How it works

1. **The game reports progress** when online (the same moments it looks for new packs), at most
   once an hour and only when a batch could be due, which starts when the player is within 50
   levels of the end, so a batch is built long before the last 10: how many levels the player has cleared, plus the last
   10 cleared levels with their stars and attempts to first clear (`packages/client/src/supply.ts`).
2. **`api/progress.js`** (a Vercel function) counts the levels already published for the player's
   engine version. If there is room for at least 10 more without going past **60 levels ahead of
   the player**, it starts the GitHub workflow. It stores nothing.
3. **`.github/workflows/levels-next.yml`** runs `pnpm levels:next`: plan one batch (up to 20
   levels), build it with the normal generator and bots (`tools/build-levels.ts`), commit it to
   `main` as a new pack (`levels/packs/s1-061/`, `s1-081/`, ...). Runs queue one at a time and
   stop after 6 batches in 24 hours.
4. **Vercel deploys** the commit. While online, the game looks for new packs at launch, on
   reconnect, after each win, on opening the level list and every 15 minutes; new levels are cached
   for offline play and announced with a "new levels ready" note.

Levels keep their ids in one sequence (`s1-L061`, `s1-L062`, ...); the sequencer works for any level
number, so families, finales every 10th level and the difficulty sawtooth continue past 60.

## Turning it on (one-time, Doug)

Nothing builds until this is done.

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token. Repository
   access: only `dsutclif/Final_Outpost`. Permissions: **Actions: Read and write**. Copy it.
2. Vercel → the project → Settings → Environment Variables → add `LEVELS_DISPATCH_TOKEN` (Production)
   with the token. Optional: `LEVELS_REPO` if the repository moves.
3. Redeploy once (Vercel → Deployments → Redeploy) so the function sees the variable.

To try it without building anything: GitHub → Actions → "Build next level batch" → Run workflow with
`cleared` = 60 and "Plan only" ticked; the log shows the batch it would build.

## Tuning each batch to the player

`packages/sequencer/data/sequencer.json` → `adapt` (off by default until a goal is chosen):

| Setting | Meaning | Default |
|---|---|---|
| `enabled` | Tune batches at all | `false` |
| `window` / `minSamples` | Recent cleared levels used; fewer than `minSamples` keeps the offset | 10 / 5 |
| `attempts` | Goal band for mean attempts per cleared level (1.0 = every level first try) | 1.0–1.5 |
| `stars` | Goal band for mean stars per cleared level | 1.8–2.6 |
| `step` | Change to the batch's target difficulty per batch | 0.05 |
| `offset` | Limits on the total change | −0.25 to +0.15 |

Each batch: too many attempts or too few stars → the batch gets easier by one step; first-try clears
with stars above the band → harder by one step; otherwise unchanged. Attempts win a conflict. The
offset and the numbers behind it are saved in each batch's `pack.json` (`tuning`).

The defaults lean easy on purpose, from the research in SPEC ("Research behind the proxies"): more
success kept players longer with no sweet spot of challenge (Lomas et al. 2013, 2017); narrow wins
are enjoyed, narrow losses don't help (Abuhamdeh et al. 2015; 2019 near-miss study); in a 300,000-player
puzzle-game field test, easing difficulty for players at risk of quitting raised engagement and revenue
(Netzer, Ascarza and Runge, Columbia); a 2024 study of a commercial mobile puzzle game saw easy levels
cleared in about one attempt and hard ones in about seven (arXiv 2401.17436).

## Limits

- One shared sequence: with several players, batches follow whoever reports from furthest ahead.
  Per-player tuning needs per-player sequences (later; the spec's IRT stage).
- The endpoint cannot verify a report, so the workflow's daily cap bounds what a fake report can do.
- An engine bump makes published packs incompatible; the next run then rebuilds from level 1 in batches.
