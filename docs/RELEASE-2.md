# Release 2 brief: the attack–defence model, combat values, and what Bundles 7 and 8 follow

Written at the end of Bundle 6 (2026-11-08, engine 0.21.0). Bundles 7 and 8 are briefed from this file, not from chat.
Items: #16 (model), #9a (eval files), #43/#44 (bots, start table) are done; #17–#37, #81 are Bundle 7; #23–#25, #35, #36, #39,
#40, #45, #46, #59 are Bundle 8. `docs/BACKLOG.md` stays the task list.

## 1. The model (v0, in the repo)

Code: `packages/generator/src/defendModel.ts` (pure, floats allowed: it is generator code, not sim).
Fit and error: `pnpm exec vite-node tools/fit-defend-model.ts` (read-only, ~1 min).
Data it is fitted to: `levels/eval/<pack>/<id>.json` → `defendTraceByProfile` (written by `pnpm levels:eval`, #9a).

**What it computes.** `defendInput(manifest, content)` reads the level's own price list (pads), waves, gate and base.
`predictRho(input, fit, skill)` runs a 0.25 s per-lane simulation:

- Defence dps `D(t)` = Σ of bought dps. A tower tier's gain is `damage / rate` from `structures.json` (L1 1.0, L2 +0.82, L3 +1.04
  dps); a guard is `damage / attackInterval` = 1.43 dps. Efficiency `e_k = dps gained / scrap` comes from the manifest's price
  list, never a level-wide counter. The buyer takes the best affordable `e` at every moment (so guards first, then tower L1,
  then upgrades: `e` falls by tier on its own, which is the brake on the reinvestment snowball).
- Economy: every kill returns its drop as scrap, reinvested at once. Start scrap = `start.currency`.
- Attackers spawn per wave (`t`, `gap`), wait for the previous wave to clear plus `defense.waveQuiet`, walk the lane to
  `reach` from contact, are killed first-in-first-out, and those alive at contact hit the gate (30 hp, 1 hit/s × damage), then
  the base (`meters.baseHealth`, 1 hit per 1.6 s × damage, after a 4 s inner walk). Peak arrival rate, lane length and the range
  window are structural.
- `B = gate hp + base health`; **`ρ = damage dealt / B`**; `ρ ≥ 1` is a loss. Attackers cannot hurt towers, so towers and
  guard HP are not in `B` (guards' HP, medics and bleed-out arrive with #21).
- Fitted numbers (`DEFEND_FIT`): overkill/pickup `η = 0.608`, commander presence `0.962` of a 1.67 dps ranged shooter,
  guards fielded `4`, `reach = 102` units, skill per ladder rung `good 1, average 0.98, weak 0.91, novice 0.79, floor 0.76`.

**Stated error (13 defend levels × 5 rungs = 65 points, engine 0.21.0, measured ρ = gate+wall+base damage ÷ B from one seed-1 run per rung).**

| | |
|---|---|
| RMSE in-sample | 0.27 (predict-zero baseline 0.53) |
| RMSE leave-one-level-out | 0.32 |
| Pearson r, all points / across levels | 0.76 / 0.76 |
| Lost-vs-not-lost agreement (ρ ≥ 0.99) | 53 of 65 |

Read this as **a ranking tool, not a calibrated one**: good, average and weak rungs are over-predicted by about 0.1–0.2 on easy
levels (real good bots take ~0), and the real ladder is bimodal and not monotone on single seeds (e.g. s1-L060 floor 0.22,
weak 1.00). Known gaps for v1: one seed per rung (use the pooled win rate and margin over 3–10 seeds as a second target),
guards' sorties and HP, equal split across lanes when a level has more than one attack side, creature drops are food not scrap
until #26, bots do not model the walk-in from a mid-map spawn.

## 2. Combat values for Bundle 7 (Doug, 2026-11-05: "make your own best decisions")

Start from `client/src/dev/arenaModel.ts` PROPOSALS, drops equal to HP. Today (0.21.0): swarmling 1 hp / speed 62; creature 3 hp /
44; raider 4 hp / 36; boss 36 hp / 20, damage 4. Defence: tower damage 1, range 115 / 135 / 150, rate 1.0 / 0.55 / 0.35 s; guard
10 hp, damage 1 per 0.7 s, range 75; gate 30 hp; base 15 health default; player ranged 1 per 0.6 s, melee 1 per 0.32 s.

- **HP = points = drops**, sized from target ρ (warlord too). Bodies-per-wave cap beside the points budget (~200 bodies at 375 points).
- **Mites:** acid spit (range 40, damage 1, every 2 s), lunge (30, 0.3 s wind-up, 2 s cooldown).
- **Dust crawler:** 3 hp, drops 3 scrap, shot range 60 (`hostile.creature` drops food today: content change).
- **Wave share by count:** ~70% mites, 20% crawlers, 10% raiders; 1–3 warlords on the last two waves.
- Attackers do not damage towers: only the gate, the base, guards and the commander.

## 3. What Bundle 7 (Opus, one engine bump) must follow

1. Claim the bump in `docs/STORY-WORK-LOG.md` first; Story and Look pause until it lands. Story level 5's authored waves are tuned with the story owner.
2. **Every mechanic that changes damage, range, HP or timing changes the model's inputs.** After the bump, rerun `pnpm levels:eval` and `tools/fit-defend-model.ts`, and
   add each new term to `defendInput`/`predictRho` (ranged hits at range, lunges, bleed-out, medics, footprints/touch melee, off-screen spawn distance = longer `laneLen`).
3. Keep the sim integer-only (CLAUDE.md rules 2–4); the model stays outside the sim.
4. Items: #34, #17 (+#19), #18, #20 (+#29, with a spatial hash), #21, #26, #28, #32 with #33, #30 with #31, #37. Each ships its property test, bot behaviour and rater metric.
5. **#81 (protein hunter can't pass a gate).** First find whether gates block the hunter's pathing or only the player's. If it is a pathing rules fix it joins this bump (it changes where hired hunters walk, so existing runs change); if it is a bot-only or nav-data issue, fix it without a bump. Doug has not said which level shows it: ask for one before starting. Done check: a hired hunter walks out through the gate and back on a walled level, seen live, plus a property test.
6. Re-pin `levels/golden` and `levels/packs/s1` with `levels:repin`; `levels:check` must stay clean. **Do not rebuild the pack here**; that is Bundle 8. `pack.json` changes only through repin, and its hash is in every level URL.
7. Rewrite `packages/client/release-notes.json` (player-facing behaviour changes).

## 4. What Bundle 8 (Sonnet + Haiku, one pack rebuild) must follow

1. Refit the model on Bundle 7's engine (v1), then make it the generator's accept test: cheap ρ for all candidates, bot-measured ρ on the closest. A level is accepted only if measured ρ lands near its target.
2. One fitted function maps the sequencer's target D to a target ρ so the two dials don't fight. Shape knobs stay inside `fun.ts` tensionRhythm (2–5 peaks, no squeeze over 25% of the run) and keep the `waveQuiet` gap. Enemy mix and synergy rules stay an authored layer.
3. Re-derive the rater's `reference.json` (only 4 golden levels today). Then #23, #24, #25, #27 (sized from ρ), #36, #39, #40, #45, #35 (defend fun threshold, decided from the eval files), #59.
4. After the rebuild: `pnpm levels:start-table <raw log>` (the table is ignored until its engine matches, #44), `pnpm levels:eval` for every pack (pack side files under `levels/eval/`; a test fails if a level lacks one), `levels:check`, the iPhone dense-wave check, release notes, deploy (#46).

## 5. Measurement pieces now in the repo

- `levels/eval/<pack>/<id>.json` + `index.json`: per level, each fun proxy and difficulty feature with weight and contribution, per-rung runs, filters, terrain, `defendTrace` (reference bot, seed 1) and `defendTraceByProfile` (keys `0`–`4` = good…floor). Never inside `levels/packs`.
- Re-rated D can differ from the D recorded at generation (s1-L010: 0.60 now vs 0.23): novelty history and reference stats differ. `packRecord` keeps the recorded values.
- Not yet in the side files: the `tools/review` measures (pulse, guide, telemetry, calibrate) and the generator's per-candidate digest (#9a leftovers); 9b (the bot-vs-player view) is deferred.
