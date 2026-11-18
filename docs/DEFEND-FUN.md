# Defend fun bar (outpost-ops#99)

**Call (part 1, 2026-11-18): set a defend fun bar of 0.20. No proxy fix in this item.**

The generator rejects a candidate whose fun F is under the request's `funThreshold` (sequencer.json
`funThresholds`: 0.2 for tutorial slots, 0.4 for the rest). Defend levels rate far below economy levels, so 0.4
throws away most defend candidates for reasons that are built into the rater, not the level.

## Measurement

Tool: `pnpm levels:eval <pack>` then `pnpm levels:eval <pack> --table` (tools/eval-pack.ts; `--table` prints the
per-proxy fun table, defend against every other family, from the side files in `levels/eval/<pack>/`).

**Scratch pack x99, engine 0.35.0, new wave rules** (mixed waves and 2-3 warlords in the final wave, game 5c44b8c).
Defend Levels 54, 104, 109, 126 were built fresh; Level 59 did not finish because the build stopped when economy
Level 53 failed every recipe. Economy Levels 53, 57, 108 are the shipped levels (the wave rules do not touch them),
copied into the scratch pack so both groups are rated in one run. The scratch pack was not committed.

```
proxy           	w	defend raw	defend y	defend v*y	economy raw	economy y	economy v*y
closeFinish     	0.8	 0.67	-0.59	-0.47	 0.52	-0.21	-0.17
lateUncertainty 	0.6	 0.42	 0.00	 0.00	 0.89	 1.00	 0.60
tensionRhythm   	0.5	 8.25	-1.00	-0.50	 1.44	 0.33	 0.17
decisiveness    	0.4	 0.09	 0.02	 0.01	 0.08	-0.21	-0.08
rewardCadence   	0.5	 8.00	-1.00	-0.50	 2.00	 1.00	 0.50
deadTime        	0.5	 0.00	 1.00	 0.50	 0.07	 0.99	 0.49
fairFailure     	0.4	 0.67	 0.33	 0.13	 1.00	 1.00	 0.40
novelty         	0.4	 2.25	 0.50	 0.20	 1.67	 0.67	 0.27
defend: n=4 sum -0.63 F 0.35 (min 0.25, max 0.45), 1/4 at or over 0.4
  s1-L054 waves_survived F=0.25, s1-L104 turret_level F=0.45, s1-L109 hire F=0.35, s1-L126 boss F=0.36
economy: n=3 sum  2.17 F 0.89 (min 0.85, max 0.92), 3/3 at or over 0.4
```

**Shipped pack s1 (old wave rules), same tool:** defend n=11, F mean 0.21 (0.07-0.86), 1/11 at or over 0.4;
economy n=44, F mean 0.79 (0.46-0.96), 44/44 at or over 0.4. Defend F at or over 0.20: 4 of 11.

## Why a bar and not a proxy fix

- The new wave rules already lifted defend F from 0.21 to 0.35 on average. `lateUncertainty` went from -0.82 to 0
  and `fairFailure` from -0.50 to +0.33: the outcome is now open late and losses come with warning.
- Two proxies still score defend at -1 by construction: `tensionRhythm` wants 2-5 threat peaks and every wave is a
  peak (8 on average); `rewardCadence` wants a reward every 8 s with no gap over 30 s and defend rewards come from wave
  drops. `closeFinish` wants the win with 5-20% core health left, where defend wins average 67%. Those three cost
  defend about 2.0 of the sum against economy (-1.47 against +0.50).
- Making those proxies defend-aware is a rater design change that re-rates every candidate of every family and needs
  its own measurement; it is not needed to stop throwing away good defend candidates. Leave it as a later idea:
  count peaks per wave for defend, and widen the close-finish band for core health.

## The number: 0.20

- Every new-rules defend level in the sample clears it (lowest 0.25).
- It still bites on the old-rules levels: 7 of 11 shipped defend levels sit at 0.07-0.18 and would fail it.
- It equals the tutorial bar, so there is no new magic number in the data.

## What part 2 (99.2) changes, exactly

1. `packages/sequencer/data/sequencer.json`: `"funThresholds": { "tutorial": 0.2, "band": 0.4, "defend": 0.2 }`.
2. `packages/sequencer/src/index.ts`: the config type gains `defend: number` in `funThresholds`; the request sets
   `funThreshold: index <= cfg.tutorialLength ? cfg.funThresholds.tutorial : slot.family === "defend" ? cfg.funThresholds.defend : cfg.funThresholds.band`.
3. Sequencer vitest: a defend slot's request carries 0.2, an economy slot's 0.4 (fails before the change).
4. No engine bump and no pack regeneration: the bar only filters candidates of new levels.
5. Its check: a scratch sample of 6 defend slots builds without hitting the re-roll cap. Pick defend slots only
   (e.g. 54, 59, 104, 109, 115, 126); economy Level 53 currently fails every recipe and stops a build.
