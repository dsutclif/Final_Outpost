# Place your base: plan (draft for Doug, 2026-10-18)

Two parts, in order. Part A makes terrain decide where raiders can go; Part B lets the player
pick where to build on that terrain. Doug (2026-10-18): place-your-base is only worth it once
terrain actually limits attack routes, so B waits for A. Background: REDESIGN-R3.md items 17 and 19.

## Where things stand

- Terrain today (`zone.terrain`) is axis-aligned rectangles: ridges, outcrops, chasms. Walkers
  slide along their edges (`sim/systems/common.ts` moveAgent), so a rectangle is a bump, not a wall.
- Raiders walk straight in from their map edge toward the reactor, drifting sideways to meet the
  wall (`sim/systems/defense.ts`). Nothing routes them, so terrain cannot funnel them.
- Traders already follow a generator-made route over a grid (`traderRoute`, engine 0.10.0): the
  route-finding piece exists, but only in the generator.

## Part A: terrain that shapes attacks

**A1. Raiders follow real routes (sim).** At level start, one flow field per attack side over a
coarse integer grid (the trader grid, 6 world units), from that map edge to the reactor, around
terrain. Raiders step down it. Walls are not in the field: raiders still walk into the wall where
their route meets it and attack that section, so where the route crosses the ring is where the
fight is. Deterministic and integer-only (hard rules 2-3); computed once, so cheap per tick.

**A2. Terrain kinds that matter (content + sim).** Shapes become polygons, not rectangles:
- *Cliff / ridge:* impassable. Long ridges with gaps make **passes**.
- *Canyon:* a corridor between two cliffs: one way in.
- *River or chasm with crossings:* impassable except at a **bridge** or ford, so each crossing is
  a natural chokepoint.
- *Rough ground (dunes, rubble):* passable at reduced speed (for example 60%), so raiders prefer
  the clear route but can take the long one.
- *High ground (optional, Doug to decide):* turrets and guards on it get extra range.
All numbers in `content/data` (hard rule 1), each kind with its property test, bot behaviour
and rater metric (hard rule 5).

**A3. Generator: defend maps built around chokepoints.** Templates such as a mountain pass, a
plateau with ramps, a river bend with two bridges, and a canyon fork. The generator places
terrain first, checks that every element is reachable and that each attack side's route
funnels through 1-3 chokepoints, then places the base. Walls then only need to span the chokes
(short, cheap) instead of a full ring, so defend levels become about holding passes with
towers and guards (Doug's R3 note 3). Plain rings stay for open-plain levels.

**A4. Looks (renderer).** Cliff walls, canyon floors, a river or chasm strip and a bridge as
models along the polygon edges, code-built first. Meshy models wanted (Doug): a straight cliff
segment, a cliff corner or end, a bridge, a ford or ramp, a rough-ground patch. Same pipeline as
the walls (tiled pieces).

**A5. Bots and rater.** The bots use the same grid to plan routes; the rater gets route length,
number and width of chokepoints, and how many attack sides reach the base.

One engine bump and one level rebuild for all of Part A.

## Part B: place your base

**B1. Candidate sites (generator).** On each place-your-base level the generator makes 2-3 base
sites on the same terrain. Each is a full layout (pads, walls, raid sides) bot-verified and rated
on its own, and all fall inside the level's difficulty band, so no pick is a trap. They differ in
trade-offs, for example: "plateau: raids come up one ramp, ore is far" against "valley: ore next
door, raids from two passes".

**B2. Manifest and sim.** The manifest carries `sites[]`; everything that depends on the base
(entities, barriers, waves, star thresholds) lives per site. The sim starts from the chosen site;
the rest of the level is unchanged. Replays record the pick.

**B3. Pick screen (client).** Before the level starts, the overview shows the map with each site
marked, the raid routes as arrows, and two or three plain tags per site ("1 pass to hold",
"ore close", "raids from 2 sides"). Tap a site, then Start. A retry can pick again. A suggested
site is pre-selected for players who don't want to choose.

**B4. Telemetry.** Which site was picked and how it went, feeding the batch tuning (off until
Doug sets its target).

Cost: generation time on those levels goes up about 2-3x; one more engine bump and rebuild.

## Order and effort

1. A1 + A2 (routing and terrain kinds), with tests: the core of it.
2. A3 (chokepoint templates) and A5 (bots, rater), then the Part A rebuild.
3. A4 looks, code-built first; Meshy pieces swap in when they arrive.
4. B1-B3, then the Part B rebuild; B4 alongside.

Each step is its own session with a narrow brief. Parts A and B are each a large piece of work,
on the scale of the combined regeneration (several hours of agent time each, plus about an hour
of level rebuild per part).

## Decisions for Doug

1. Terrain kinds: all of cliffs/passes, canyons, rivers or chasms with bridges, and rough
   ground? High ground with a range bonus, yes or no?
2. Which levels get place-your-base: every defend level, or only some (for example each
   family's finale)?
3. Should defend levels with chokepoints drop the full wall ring and build walls only across
   the passes?
4. Meshy pieces for terrain (cliff segment, cliff end, bridge, ramp, rough patch): will you
   make them, or should the first version stay code-built?
