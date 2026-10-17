# Economy plan: pricing, timing and rewards (draft, 2026-10-16)

Doug's brief: pricing, timing and rewards are set so that **every job is done by hand at least
once before a worker can be hired for it**, and **prices rise as automation grows**. This is the
long-standing incremental / "idle arcade" economy archetype. This plan grounds it in how those
games tune it, then says how it maps onto our sim, generator and bots. Not agreed yet: questions
at the end.

## What the genre does

- **Exponential prices, roughly linear output.** The standard incremental model prices the n-th
  copy of anything at `base × growth^n` while each copy adds a fixed amount of output, so every
  purchase is worth less per unit of cost than the last and the player always chases the next
  step. Typical growth factors are 1.07–1.15 per purchase (AdVenture Capitalist's lemonade stand
  is 1.07; its car wash about 1.14). Sources: [The math of idle games, part I][m1], [part II][m2],
  [AdVenture Capitalist wiki][acw].
- **Do it yourself, then hire it out.** AdVenture Capitalist's core loop is click a business to
  run one cycle by hand; a *manager* automates that business and is the first big purchase for
  it. Idle Mining Empire starts the player tapping workers and sells managers to automate them.
  Idle-arcade games (the genre our reference ads come from) build on carrying stacks by hand and
  unlocking helpers and upgrades as you go. Sources: [AdVenture Capitalist wiki][acw],
  [Idle Mining Empire review][ime], [Supersonic on idle arcade design][ss].
- **Payback time is the real tuning knob.** What players feel is how long a purchase takes to pay
  for itself: `price ÷ extra income per second`. Short paybacks early teach that buying is good;
  paybacks lengthen as the run goes on. (This is the usual way to reason about it; the sources
  above give the cost formulas but not payback targets.)
- **Steep curves are hard to tune.** Idle Idol's post-mortem found that a 0.01 change in growth
  factor swung the 20th purchase a lot, and they ended up hand-setting costs from playtests. Our
  levels have 5–20 purchases, so a gentler curve and bot-measured checks keep this under control.
  Source: [Balancing tips from Idle Idol][ii].

## Rules for Farthest Outpost

1. **Manual first.** A worker's hire pad stays hidden until the player has done that job once by
   hand: delivered resource R from source S to target T (the same trip definition as the loop
   cap). The pad appears with a "Hire one to do this for you" moment. This replaces "hire pads
   visible from the start".
2. **Affordable after 1 to 5 loops.** The hire price for a job is set from the value of one manual
   loop of that job (what one trip earns or saves at the player's carry cap): between 1× and 5×
   that value. With the loop cap (at most 5 identical loops), the player always does a job at
   least once and never more than five times before the worker is affordable.
3. **Automation tax.** Each hire, conveyor or machine upgrade raises the price of the next by
   `pads.automationGrowth` (start 1.2, so the 5th automation costs about 2× the 1st). The pad
   shows its live price. It's a sim rule, so it holds whatever order the player buys in.
4. **Payback windows.** Each automation should pay for itself within a target window that
   lengthens through a level and across the pack: about 15 s for the first worker, 30–45 s for
   later ones, and longer in late-pack levels. Measured from the bots, enforced by the generator.
5. **Reward cadence.** Keep feedback frequent: the first sale or deposit lands within about 10 s,
   the first hire is affordable within about 30 s, and early on there is never more than about
   20 s without a reward. We already record reward gaps (`stats.rewardGapMax`), so this is a check
   on existing data.
6. **Across the pack.** Base prices rise level to level (the existing `costScale` knob), and so
   does income (more and better sources), so the feel stays the same while numbers grow.

## How it would be built

| Step | What | Where | Rule change |
|---|---|---|---|
| E1 | Track "job done by hand once" per (source, resource, target) | sim stats + events | yes |
| E2 | `requires: { manual: job }` on hire pads (hidden until done once) | manifest schema, sim pads, generator | yes |
| E3 | Automation tax on hire, conveyor and level-up pads (`pads.automationGrowth`) | sim pads, content default, 3D pad price label | yes |
| E4 | Price each hire from one manual loop's value × k (1–5), k growing with progression | generator cost model (replaces flat `hire.*` costs) | pack |
| E5 | Bot metrics: manual loops before each hire, payback seconds per purchase, reward gaps | bots trace, rater measurement | no |
| E6 | Generator rejects levels outside the windows (loops 1–5, payback window, reward cadence) | generator filters + data | pack |
| E7 | Tune from bot ladder and playtests; levels:check and stars per rung | data only | pack |

E1–E3 are one engine bump; E4–E7 come with a single pack rebuild. Roughly the size of Phase B.
I'd split it as before: a Sonnet agent each for E1+E2, E3 and E5, with me on E4, E6 and tuning.

## Doug's answers (2026-10-16)

1. **Manual first for every first job of a kind:** the first greenhouse opened is worked by hand
   before its collector can be hired, but later greenhouses are not. No manual pass is needed
   again before upgrades.
2. **Automation tax per level:** it resets each level.
3. **Building machines does not count** toward the tax; only workers, belts and upgrades do.
4. **Payback windows:** try about 15 s early and 30–45 s later, and tune by feel.

## Questions for Doug (answered above)

1. Manual first for **every** job, including defenders and the cashier, or only for gathering,
   hauling and machine work?
2. Automation tax: does it apply per level (resets each level, my default), or does it grow
   across the pack?
3. Should building a machine (not hiring for it) count as automation for the tax, or only
   workers, belts and upgrades?
4. Payback windows of about 15 s early and 30–45 s later: do they feel right for 3–7 minute
   levels?

## Generator follow-up (engine 0.8.0)

Manual first and the tax slow every economy, so the generator now adapts levels to them:

- **Goal sizing:** a rate goal's probe that falls short runs again at 1.6× and 2.4× the level
  length before the candidate is dropped. Earn-within goals keep their deadline.
- **No spare automation:** if the winning bot never needed some optional automation (hires,
  belts, machine levels, upgrades, wall reinforcement), later builds of that level leave those
  pads out, along with any pad that requires them. If no worker is ever needed, the workers
  module goes too. This keeps every pad a level offers worth buying.
- **Bots:** the bot works a full hopper down by hand before loading it for a manual job. It
  also moves on to the next pending manual job when the first can't progress. A machine the
  player works by hand counts as progress for stall detection.

[m1]: https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i
[m2]: https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii
[acw]: https://adventure-capitalist.fandom.com/wiki/File:BadDay.png
[ime]: https://www.thefictionaddiction.com/idle-mining-empire/amp/
[ss]: https://supersonic.com/?p=82671
[ii]: https://gamedeveloper.com/design/balancing-tips-how-we-managed-math-on-idle-idol
