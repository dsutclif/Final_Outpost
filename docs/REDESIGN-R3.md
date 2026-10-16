# Redesign round 3 (draft plan, 2026-10-16)

Doug's round-3 upgrade list, evaluated against the code at `9c06e0d` (engine/content 0.5.0).
Doug answered the open questions on 2026-10-16 (see "Doug's answers"); where an answer and an
item note below disagree, the answer wins. Once agreed, this becomes the binding brief and
DECISIONS gets a 9j summary entry, as R2 did.

Size: S = under a day, M = 1–3 days, L = a week or more. "Bump" = sim rule change: bumps
`ENGINE_VERSION`/`CONTENT_VERSION`, re-pins `levels/golden` and regenerates `levels/packs/s1`
(~45 min) with `levels:check` clean. All bumps are batched into one 0.6.0 release (phase B) so
the pack is regenerated once, after phase C.

## Evaluation

| # | Item | Where it lives | Size | Bump |
|---|---|---|---|---|
| 1 | Label appears but no building | render-3d (see note) | S–M | no |
| 2 | Operator platforms always visible | render-3d converter/clerk pads | S | no |
| 3 | Defend levels = build/upgrade defences and guards, not fighting each attacker | generator defend family, objectives, wave tuning | M | yes |
| 4 | Longer times, less rush | content defaults + generator flow model | S | yes |
| 5 | Green circle under the player | render-3d | S | no |
| 6 | Larger, more visible, charismatic items | render-3d assets, camera `VIEW_W` | M | no |
| 7 | No more than 5 repetitions of the same action | rater filter + generator costs | M | yes (pack) |
| 8 | Customers take a little time per purchase | sim `sales.ts` serve timer | S | yes |
| 9 | All stocks visible; overstock "!"; visible pile collapse fails the level | render-3d + sim fail rule + rater | M | yes |
| 10 | Edge arrows for each attacker entering | render-3d / client HUD | S | no |
| 11 | A gate facing every attack side whenever a wall exists | generator `build.ts` ring gates | S | yes (pack) |
| 12 | See-through warehouse roof showing inventory | render-3d `buildWarehouse` | S–M | no |
| 13 | Workers named for their machine/source; clear hire-pad icon; tap = full name | skins + render-3d pad art + inspect | M | no |
| 14 | Related hire pads grouped together | generator layout | S–M | yes (pack) |
| 15 | Sizing and proportions like the reference games | render-3d camera + model scale | M | no |
| 16 | Conveyor as an object type | new module: content, sim, bots, rater, render | L | yes |
| 17 | Geographic features on some levels | new terrain zones: content, sim nav, generator, render | L | yes |
| 18 | Towers built into walls | sim placement + generator + render | M–L | yes |
| 19 | Evaluate a place-your-base step for wave-defence levels | see assessment | L | yes |
| 20 | Wall repair at half build cost | sim `barriers.ts` + pad/repair interaction | M | yes |

### Notes on the less obvious items

- **1 Missing buildings.** Every built type in the pack (housing, medical, barracks, turret,
  depot, landmark, three converters) has a registered 3D model, so this is not a missing-asset
  bug. Likely causes to confirm: (a) upgrade pads ("Turret Lv2", "Reinforce walls") whose
  effects change stats but place nothing, so a name plate stands over an empty pad; (b) build
  pads that show the building's name but no preview of it until paid; (c) discovery labels
  pinned to a type's nearest instance landing on a pad, not the building. Step one is a
  reproduction sweep: drive each pack level with the bot, screenshot every `built` event in the
  render-3d lab, and flag any label without a model under it. Fix: a translucent ghost of the
  building on every build pad, a visible change for every upgrade (turret head swap, wall
  plating), and a test that every `built` event leaves a model or a model change.
- **3 Defend rework.** Shift defend goals and stars to "turret Lv X", "train N defenders",
  "complete the perimeter", "keep Colony HP ≥ X%", and drop "defeat N attackers" as a main
  goal. Waves get bigger but turrets and guards scale to handle them, so the player's job is the
  economy feeding the defences. Player melee stays as a fallback, not the plan.
- **4 Longer times.** Per answer 5: only the level time target, +40% (default 300 → 420 s,
  and the generator's flow-model budgets ×1.4), plus a Settings multiplier for the time star.
- **7 Repetition cap.** Needs a precise "action". Proposal: one trip that ends in a deposit to
  the same pad, converter or core counts as one action; no target may need more than 5 trips at
  the player's carry cap. The rater measures it from the planner bot's trace, the generator
  lowers costs or adds a hire option until it holds, and pads costing more than 5 trips must
  offer a worker.
- **8 Purchase time.** `serve()` is instant today. Add `sales.serveSeconds` (start 0.6 s): the
  front customer stands at the window while a progress chip fills, then pays. Throughput drops,
  so queue arrivals are re-tuned in the same bump.
- **9 Stocks.** Shelves, converter outputs, the warehouse and backpack stacks already have caps.
  Renderer: show every stock with a count chip and a red "!" at cap. "Pile collapse" is either a
  topple animation at cap (no rule change) or overstock actually spilling and losing units (a
  rule; question 3).
- **11 Gates.** The generator puts exactly one gate on every ring (`ringGates = [one index]`).
  Change it to one gate per attack side plus one for rescue exits, each centred on its side.
- **13 Names.** Name roles from their assignment: `role.supplier` + `node.material_source` →
  "Ore digger", `role.operator` + `conv.material_processor` → "Smelter operator",
  hauler → "Ore hauler". It's done in the skin as a template keyed by role and target id (no
  new ids). The hire-pad decal shows the role icon plus the machine or source icon, and a tap
  gives the full name and duty.
- **15 Proportions.** Needs the reference screenshots. Today `VIEW_W` = 360 world units across
  at a 50° pitch. Reference games typically show a closer camera with larger characters (around
  6–8% of screen height); expect `VIEW_W` near 260–300 plus bigger models, then re-check pad
  ranges and label overlap.
- **16 Conveyor.** A new module under hard rule 5: schema + data (`struct.conveyor`: from, to,
  rate, capacity), a sim system that moves units tick by tick between a source and a sink, a bot
  behaviour (build it when trips are long), a rater metric, and a 3D belt with moving items. It
  sits in the industrialize family as the step after haulers. Placement: the generator
  lays a straight or one-bend belt between an existing source and converter.
- **17 Geography.** Ridges, chasms, dunes and craters as impassable or slowing zones that shape
  routes. The sim already has blocked zones and the bots have nav, so this extends zones with
  shapes (polylines/polygons), adds terrain to nav, generator placement rules (keep every
  element reachable, make chokepoints on defend maps) and terrain meshes.
- **18 Towers in walls.** Today turrets are freestanding build pads. Proposal: some barrier
  sections become tower sockets; a build pad inside the wall builds a turret on the socket, and
  the turret gets wall HP protection. Freestanding turrets remain for non-wall levels.
- **20 Wall repair.** A damaged built section exposes a repair pad (or the player walks the
  line carrying the resource, as building does) costing `ceil(costPerSection / 2)`, restoring
  full HP. Add a repair hint and a cracked-wall state that's visible from a distance.

### 19 Place-your-base assessment

Difficulty: **high, but feasible in a limited form.** Levels are generated with absolute
coordinates around a fixed base. Every level is bot-verified and rated for that one layout. A
free placement would make difficulty unbounded and unverifiable.

The workable version: for defend levels the generator produces **2–3 candidate base sites**
on a geography map (item 17). Each site gets its own walls, gates, wave sides and pads, and
each is fully bot-verified and rated. Before the level starts, the player picks a site on an
overview map showing the access routes and attack advantage of each ("high ground: attacks from
1 side, far from ore" vs "open plain: 3 sides, rich ore"). The manifest carries `sites[]`; the
sim starts from the chosen site, and the star thresholds are per site.

Cost: depends on 17; roughly 3× generation time for those levels; manifest schema, a pre-level
picker UI, per-site rating. Recommend scheduling it after 17 and the defend rework, as phase D.

## Plan

**Phase A: renderer and skin, no rule change (ships immediately, one push per item).**
1 missing buildings (sweep + fix + test), 5 player ring, 2 operator pads, 10 edge arrows,
13 names and hire-pad icons, 12 warehouse cutaway, 9 stock chips and "!" (visual), then 15 + 6
proportions and item scale once reference images arrive. Verify each on the live URL on iPhone.

**Phase B: engine 0.6.0 rules (one branch of commits, no pack regen yet).**
8 purchase time, 4 time target +40% with the Settings override, 20 wall repair, 18 wall towers
replacing turrets on walled levels, 9 collapse countdown and failure,
then 16 conveyor as its own module. Each item comes with its property test, bot behaviour and
rater metric.

**Phase C: generator and pack (finishes 0.6.0).**
11 gates per side, 14 grouped hire pads, 7 repetition cap filter, 3 defend family rework,
17 geography. Then regenerate `levels/packs/s1`, re-pin golden levels, run `levels:check`, update
`docs/LEVELS.md` and the README status, push, verify live.

**Phase D: place-your-base (after C, if the assessment is accepted).**

Models (per CLAUDE.md): Opus for 16, 17, 18, 19 and the defend rework; Sonnet for phase A items
and tuning; Haiku for sweeps and doc updates.

## Doug's answers (2026-10-16)

1. **References:** five screenshots (a fishing/snow camp builder, Township ads, a path-defence
   runner, a canyon tower-defence). What they show is under "Reference notes" below.
2. **Repetition cap:** no more than 5 of an identical loop (get crop → go to market → sell
   crop, repeated). It's measured on the planner bot's trace as repeats of the same
   source → target cycle, and a 6th repeat must be unnecessary (a worker, a bigger carry, or
   a cheaper cost).
3. **Pile collapse:** the collapse is visual only (no goods are lost), and it **fails the level**.
   Proposed rule: at cap the stock shows "!" and a short wobble countdown (`stock.collapseSeconds`,
   start 8 s), and if it is still at cap when that runs out, the pile topples and the level ends
   as a failure. Cap-hold time becomes a rater metric so the generator avoids unavoidable
   collapses. (This adds a fail condition, so it moves into phase B.)
4. **Defend levels:** agreed. The first resources come from the player fighting (scrap from the
   early weak waves); those resources then buy guards and towers, which carry the later, bigger
   waves.
5. **Times:** only the level time target (`level.budgetSeconds`, which drives the time star) goes
   +40%. Settings gets a "Time target" control (e.g. 100–200%, default 140%) that scales
   the time-star threshold for that player. It's applied as a manifest param override passed
   into the sim at level start, so the star is still evaluated in the sim. Bots rate at the
   default. The reactor countdown, waves and customer patience stay as they are.
6. **Conveyors:** agreed, the step after haulers in the industrialize family.
7. **Towers in walls:** replace. On walled levels every turret is a wall tower; freestanding
   turrets only on levels without walls.

## Reference notes (from the screenshots)

- **Camera:** much closer than ours. The player is about 8–10% of screen height, and the
  playable base fills the screen width with a margin of terrain. Target `VIEW_W` ≈ 220–260
  (now 360), with the camera following the player and edge arrows for what's off-screen.
- **Carried items:** a tall single column of big items on the player's back, each item roughly
  half a character tall. Item count reads at a glance from the column height.
- **Build pads:** a dashed outline on the ground with a white silhouette of what will be built
  and its price. This is the fix for item 1: every build pad shows the building's silhouette,
  so a label is never over nothing.
- **Pads on the ground:** cost rings and plates are flat floor decals with big numbers, not
  floating panels. Fewer floating labels, which also helps the overlap limit.
- **Customers:** a speech bubble with the wanted item's icon and count over each customer;
  vehicles (trucks, bikes) as customers on roads; green cash bricks stacked beside the counter.
- **Threats:** an "ENEMY" skull tag at the screen edge (item 10); attackers follow visible dirt
  paths; towers flank the path; bosses are huge with a number over them.
- **Geography:** cliffs, water, tunnels and canyon walls bound the map and channel routes
  (item 17 and the base-placement assessment).
- **Style:** saturated colours, chunky low-poly shapes, soft shadows, thick readable silhouettes.
