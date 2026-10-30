# Up-front level generation rules (draft)

Goal: reject fewer candidates, and eventually test less, by building levels that are viable by
construction. **Nothing here is implemented or validated.** Fixed rules cannot guarantee viability in a
nonlinear sim, so `levels:check` stays as the final safety check.

## Data

- `levels/candidates/digest/<YYYY-MM-DD>.json` (committed): one file per day with builds. Outcome counts by family,
  goal and reject reason, the D range reached per level, and `hist|family|setting|bin|outcome` counters for every
  setting the rules use. See `tools/candidate-digest.ts`.
- `levels/candidates/<pack>.jsonl` (gitignored): raw records of local builds, kept 14 days. GitHub Actions builds
  keep only the digest.
- The 990-candidate sweep behind the findings below (55 levels, p 0.1-0.9, with and without jitter, engine 0.14.0)
  stopped at quick rating, so it says nothing about star objectives, idle elements or fun. It was not committed.

Sweep findings: quick-check pass rate is shelter 99%, rescue 85%, harvest 79%, industrialize 78%, defend 27%.
On 20 of 55 levels the target D was outside anything that goal reached. About 30 levels jump by 0.3 D or more
between neighbouring candidates in pressure order. Defend takes 58% of build time.

## Status

Done in engine 0.16.0: rule 7; only the closest candidates get the full check; a fresh search per seed; an early human-view
check that lowers pressure; idle features dropped; a search start table per goal (`data/start.json`). Result on levels 6-50:
526 → 179 CPU-seconds per level, no level failed (6 of 45 did in the 0.14.0 baseline), but mean D error rose from 0.073 to
0.094 on the levels both builds made. Not done: one-setting-per-step search, solve-first building, layout first. Mirrored
levels (no value after the table). Open: defend fun scores sit around 0.15 against a 0.4 threshold.

## Rules, most to least recommended

Tags: M measured (correlation; pressure moves most settings together), D derived from content numbers, J judgement.
`T̂` is the estimated finish time from rule 5.

| # | Rule | Why | Tag |
|---|------|-----|-----|
| 1 | Each goal gets a D range; the sequencer only assigns it a target inside that range | Largest cause of off-target levels | M |
| 2 | Build backwards from the goal: only include what its dependency chain needs | Idle elements nearly impossible by construction | D |
| 3 | Include a module only if `manual time ≥ 1.25 × budget` | Stops idle workers, gating, supply routing | D |
| 4 | Static buy-order check: `cumulative income(t) ≥ cumulative cost(t)` at every step | Replaces the bot's deadlock and stall check | D |
| 5 | `T̂ = Σ(distance/155 + items × interval + wait for money)` | Everything time-based depends on it | D |
| 6 | `budget = T̂ / 0.41` | Median bot-time share of budget on passing levels | M |
| 7 | Defend: peak wave 225-375 points, never 450+, where points = enemy HP (swarmling 1, raider 4, boss 36). Doug: count enemy strength, not enemies. Doug: salvage drops are proportionate to HP, 1 per HP (raider 4, boss 36). Both applied in engine 0.16.0, as a 375-point cap inside R5's scrap budget | 0-24% infeasible below 375 points, 95% at 450+ (engine 0.14.0, points inferred from wave size and drops). Re-measure after the drop change, since rule 11 depends on drops too | M |
| 8 | Defend: `towers ≥ peak wave / 30` (8 sockets in that band) | 3% infeasible at ≤30 per tower, 15% at ≤40 | M |
| 9 | Defend: base health 9-10 | 2% infeasible at ≥10; 11+ tends towards trivial | M |
| 10 | Defend: p between 0.3 and 0.6 | 33 of 40 infeasible at p ≥ 0.7; easy-end flags cluster at 0.1-0.3 | M |
| 11 | Defend: `drops before last wave = 0.42-0.58 × total salvage price` | Passing levels sit here; leaves ladder to buy | M |
| 12 | Defend: `drops through second-last wave ≥ 1.25 × goal path cost` | `turret_level` n=3 often finished too late | D |
| 13 | Defend: `enemy HP arriving per second ≤ 0.8 × DPS available by that wave`, per side | Attacker-per-turret sizing from first principles | D |
| 14 | Defend: no med bay unless a probe raid is guaranteed to hurt someone | Top idle module in defend (43 flags) | M |
| 15 | Defend: salvage upgrades only if `drops ≥ 1.5 × their price` after core defences | 14 idle flags | J |
| 16 | Replace the single p with 2-3 independent knobs per family | Removes cliffs at their source | M |
| 17 | No ±0.12 jitter; pick from fixed, named presets | Repeatable and explainable | J |
| 18 | Positions from reserved template slots, required items first | 524 layout rejects in the build log | M |
| 19 | Rate goals: `N = floor(0.7 × steady rate × (T − ramp-up time))` | Replaces the bot probe, with more margin | D |
| 20 | Time star `= 1.6 × T̂` | Combines the existing 1.4 and 1.15 factors | D |
| 21 | Each goal gets two pre-approved star challenges, chosen by the level's features | 354 `objectives` rejects, mostly rescue | M |
| 22 | Fixed star thresholds: HP floor 50, heat floor 30, streak 8 | Removes run-based sizing; starting guesses | J |
| 23 | Rescue: at least 4 pods, 3 reachable on one tow | Tow stars can always be earned | D |
| 24 | Freeze timer `≥ 1.6 × 2d / (155 × (1 − 0.1 × towed))` | Fair pod timers from distance and tow penalty | D |
| 25 | Industrialize: p ≤ 0.45 on `automate`, `converters_running`, `produce` | Their infeasible runs start at p 0.5 | M |
| 26 | Industrialize: `T̂ ≤ 600 s`, at most 13 hires, at most 250 currency | All 9 infeasible runs ran out of time | M |
| 27 | Keep flow limits: player feeding ≤ 60% of opening, one supplier ≥ 75% of burn | Already works, cheap | M |
| 28 | Block combinations with no passing candidates until fixed: L15 `turret_level`, L37 `waves`, L40 `sell` | Stops wasted search; causes not diagnosed | M |
| 29 | Hazards end by `0.7 × T̂` | Keeps the "pull storms in" fix without a bot run | D |
| 30 | `heaps + first-wave drops ≥ cost of first wall and tower` | Player can afford a first defence | D |
| 31 | Rescue: `burn ≥ 2.4` | Weak signal: stalled median 2.33, passing 2.55 | M |
| 32 | `trips = need / carry ≤ 5` before the first helper | Replaces the `repetitive` check, which rarely fires | M |
