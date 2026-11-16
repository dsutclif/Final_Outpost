# Rating determinism (outpost-ops#196)

Question: does the same recipe + seed always give the same rating? Needed so a full regeneration's "on target" numbers are reproducible.

## Method
- Built slots 20, 35, 50 twice with the build worker (`vite-node tools/build-levels.ts -- --worker --index N --out <scratch> --retries 3`, same seeds, two scratch folders). The worker is the same code path `pnpm levels:build` runs per slot, minus the writes into `levels/` (candidates log, pack.json).
- Compared level files byte for byte and the `RESULT` D/F the build recorded.
- Re-rated the scratch files with `measure` + `score` (generator reference stats, history of earlier slots, 10/3 seeds), twice, and with variations (no history, quick seeds 4/2, rater's default reference).

## Result: yes, deterministic
- Both builds: level files byte-identical for all three slots; recorded D, F, seed, attempts and rating count identical (L20 D .3808, L35 D .5431, L50 D .6916).
- Re-rating the same file twice gives bit-identical D and F. No `Math.random`, `Date` or iteration-order dependence in rater, bots, sim or generator logic (the only `Date.now` calls are timing fields in logs/candidate records).
- Re-rate vs recorded: L20 and L35 match exactly. L50 (shipped off target) does not: recorded D .6916, re-rate D .7736 (quick seeds .7155). Same pattern as the known non-reproducing shipped levels: the off-target "best" candidate is recorded from a rating taken before final verification/trim steps changed the manifest. Not investigated further; follow-up below.

## Inputs a rating depends on besides recipe and seed
1. Reference stats. The generator rates against `packages/generator/data/reference.json` (50-sample calibration, rewritten in place by `--calibrate`). The rater package and `pnpm levels:eval` default to a different file, `packages/rater/data/reference.json` (4 golden prototypes). Same manifest: L20 D .381 (generator ref) vs .171 (rater default); F unaffected. So `levels:eval` D does not equal build D by design; compare only against the same reference.
2. History of earlier levels (modules, goal, template of slots 1..N-1) feeds the duplicate/variety filter and the fun score F. L20 F .8025 with history vs .7315 without; L35 D .543 vs .443 without. Build history = `sequenceRange(1, N, [], {targetOffset})` requests, so it depends on the sequencer output and `--target-offset`.
3. Seed counts (refSeeds/otherSeeds: build full 10/3, quick 4/2), `packages/rater/data/{weights,filters}.json`, `packages/generator/data/generator.json`, content version.
4. Engine version: rating does not read it for any calculation (only stamped into manifests and eval detail), but any sim rule change that alters bot play changes ratings. A version-string-only re-pin (`pnpm levels:repin`) needs no re-rate; an engine change that alters behavior does.
5. Retry/search state: `--retries`, `--retry-base`, and the search memory only affect which seed is chosen; the chosen candidate is deterministic.
6. Post-rating edits: night cadence (`applyNightCadence`), title dedupe, hand edits and old re-pins change the shipped file after rating (night lighting did not change L20's rating in our check).

## What the regeneration must do
- Freeze `packages/generator/data/reference.json` first (run `--calibrate` once, commit it), then do not pass `--calibrate` again mid-run; otherwise slot targets shift between runs.
- Build every slot with the same sequencer output, `--target-offset`, retries and engine/content version; record these in the pack log.
- Verify with `levels:eval` only after pointing it at the same reference, or compare D from the build log, not eval.
- Treat off-target (`*`) levels' recorded D as unreliable; re-rate the final file.
- Version-string re-pin: no re-rate needed.

## Follow-ups (not fixed here)
- `levels:eval` and the generator use two different reference files; make eval use the generator's reference (or state it in output).
- Off-target shipped candidates record the rating of a pre-final manifest (seen on L50); record the re-rate of the written file.
- `tools/build-levels.ts` writes `levels/candidates/` even with `--no-doc`/scratch `--out`.

Test: `packages/rater/test/determinism.test.ts`.
