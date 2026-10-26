# First-appearance story intros (draft, 2026-10-25)

Every item and mechanic the player has **not** met in story levels 1–5 (`docs/STORY-LEVELS.md`)
gets a one-time story intro the first time it appears in play. Each intro is one or two short
lines from a character, giving a story reason first and the how-to second, in the style of
"The people need protein. Go hunt some hoppers, but keep your distance from the spiky ones."

## Already introduced in levels 1–5 (no intro needed)

Moving, ore and the ore pile, the reactor, heat and the safe radius, dust storms (L1); the tow
line, stasis pods, gentle pod freezing, crew who join as workers (L2); greens and the grow dome,
the kiosk, clerk pad, credits, traders, rockslides, rock ridges, the hopper flats, rock hoppers
and protein, source unlocks (L3); the galley and meals, hire pads (hauler, technician, picker,
clerk), stock caps and pile collapse, automation (L4); night, walls and the airlock gate,
raiders, scrap, wall turrets, guards and the guard post, Colony HP, a retreating boss (L5).

## How the triggers work

- **First instance, per player, saved.** An intro fires the first time its id shows up in any
  level the player plays, never again (saved with discovery in `progress.ts`). It is keyed by
  canonical id or module id, never by level number, so it works whatever order the generator
  and sequencer produce (hard rule 1 holds).
- **Three trigger kinds:**
  - `start`: the level includes the module and the player has never seen it. The line opens the
    level (spoken over the first second of play; no extra screen).
  - `view`: the object first comes on screen. The camera doesn't move; the bark shows with a
    spotlight ring on the object for 2 s.
  - `event`: a sim event fires for the first time (first injury, first wall breached, first
    angry trader).
- **One at a time.** If several fire together, they queue at least 6 s apart, `start` first.
  At most three per level; the rest wait for the next level where they appear.
- **The arrow helps.** For `view` intros the guide arrow points at the object for the next 4 s.
- **Story-free mode.** Settings "Story lines: on/off"; off still shows the existing one-line
  discovery label.
- **Replays** never re-fire an intro.
- Text lives in the skin (`story.firsts`), so another skin gets its own lines on the same ids.

"First in pack" is where the id first appears in the current pack s1 (levels 6+ are unchanged
when the story levels replace 1–5); it moves when the pack is regenerated, and the trigger
doesn't care.

## Shelter

| Id | First in pack | Trigger | Speaker | Line |
|---|---|---|---|---|
| `zone.waiting` (gate arrivals) | L6 | start | KILN | "Our heat's visible for kilometres. People are coming to the gate. Give them a bed." |
| `struct.housing` (hab pod) | L6 | view | Tam | "Build hab pods. Nobody joins a colony that makes them sleep in the dust." |
| colonist freezing (`no_colonist_freezes`) | L6 | event: first colonist starts freezing | Rhee | "Someone's freezing out there. Get them inside the heat, fast." |
| `sink.core.level` (reactor levels) | L11 | view | KILN | "Upgrade me and I'll burn hotter and reach further. I'll remember more, too." (Mystery: each reactor level restores a KILN log fragment, shown as a win line.) |
| `node.fuel_deposit` / `res.fuel_dense` (fuel cells) | when it appears | view | Pip | "Fuel cells from the Halcyon's stores. One of these is worth a pile of ore." |
| `node.fuel_scrap` (ore scrap) | when it appears | view | Pip | "Loose ore scrap. Quick fuel, but it won't last." |
| `struct.landmark` (habitat hub) | L42 | start | Sela | "Meridian has a habitat hub. Build one and the settlements will take you seriously." |

## Rescue

| Id | First in pack | Trigger | Speaker | Line |
|---|---|---|---|---|
| `capture.supply_crate` | L7 | view | KILN | "A Halcyon cargo crate. Tow it into the heat and it'll unpack." (Mystery: some crates carry signal-decode fragments; the first one does: "There's a recorder in this one... same pulse.") |
| `node.prey_dangerous` (spiked hopper) | L7 | view | Okafor | "Spiked hoppers bite. Keep your distance and shoot from range." |
| `role.hunter` (ranger) | when its pad appears | view | Tam | "Hire a ranger and the hunting's handled. You've got a town to run." |
| pod timers (`rescue_before_freeze`) | L12 | start | Rhee | "These pods have been out for days. Their heaters are failing. Get them before they freeze over." |
| clearing pass (`clearing_pass`) | L12 | view | Pip | "A slide's cut off the pass. Clear it or we can't reach the pods." |
| full tow (`tow_full_trip` star) | L23 | start | Okafor | "Bring them all home in one run. Don't drop a single pod." |

## Harvest

| Id | First in pack | Trigger | Speaker | Line |
|---|---|---|---|---|
| `unit.customer_premium` (VIP) | L8 | view | Sela | "That's a Meridian council buyer. Serve them first. They pay double." |
| `unit.customer_impatient` (hurried trader) | when it appears | view | Sela | "Ardent runners don't wait. Serve them fast or they walk." |
| `unit.customer_bulk` / bulk orders | L13 | view | Sela | "Ardent's stocking up for winter. One big order, so fill the whole thing." |
| angry trader (`no_angry_customers`) | first time one leaves angry | event | Sela | "You lost one. Word travels fast between settlements." |
| `role.server` (runner) | when its pad appears | view | Tam | "Hire a runner to keep the shelves full while you're out." |
| `res.food_raw_2` as a crop (second food source) | when it appears | view | Tam | "A second crop. More to sell, more mouths fed." |

## Industrialize

| Id | First in pack | Trigger | Speaker | Line |
|---|---|---|---|---|
| `conv.material_processor` (smelter) / `res.material_refined` (alloy) | L9 | view | Pip | "A smelter. Feed it ore and it turns out alloy. The traders want that badly." |
| `conv.level` (converter levels) | L9 | view | KILN | "Upgrade a machine and it works faster. Credits well spent." |
| `conv.alloy_works` (parts works) / `res.component` | when it appears | view | Pip | "Parts works: alloy in, parts out. This is how the Halcyon was built." |
| tier-2 chain | L9 | start | KILN | "One machine feeds another now. Keep the first one running or the second one starves." |
| `store.depot` (warehouse) / `role.hauler` (courier) | L14 | view | Pip | "A warehouse. Fill it once and the couriers carry it where it's needed." |
| `struct.conveyor` | L14 | view | Tam | "A conveyor. Build it and the goods move themselves." |

## Defend

| Id | First in pack | Trigger | Speaker | Line |
|---|---|---|---|---|
| multi-side attacks (`multi_side`) | L10 | start | Okafor | "They've learned our gates. Attacks from more than one side now. Spread the defences." |
| salvage upgrades (turret Lv2, reinforced walls) | L10 | view | Okafor | "Scrap buys upgrades. A tougher turret holds longer." |
| `struct.barracks.t2` (guard post Lv2) | when it appears | view | Okafor | "Upgrade the post and it trains guards on its own." |
| wall building (`barrier.line`, walking the line) | when a wall must be built | view | Okafor | "Walk the line carrying ore and the wall goes up behind you." |
| wall repair | first damaged wall | event | Okafor | "That wall's cracked. Patching it costs half a new one." |
| `hostile.swarmling` (dust mites) | first wave that has them | view | Okafor | "Dust mites. Weak alone, nasty in a swarm. Let the turrets work." |
| `hostile.creature` (dust crawler) | first wave that has them | view | Rhee | "Crawlers. The ridge stirs them up. Don't let them reach the colony." |
| `struct.medical` (med bay) / injuries | L15 | event: first colonist injured | Rhee | "We have wounded. Build me a med bay and I'll get them back on their feet." |
| `hostile.boss` (raider warlord) | L15 | view | KILN | "That's no scavenger. That armour is Halcyon-issue." (Story: the first boss is the missing first officer; their face is the Bay Five ID photo. Win line: "Bay Five. You knew the way to our gates because you built them.") |
| `node.salvage_pile` / `node.salvage_source` (scrap heap, wreck) | when it appears | view | Pip | "Scrap from the wreck. Enough to start the defences before they arrive." |

## Family finales (every 10th level from 20)

Not first-instance: these are chapter beats that move the two mystery threads. One win line
each, from the director, keyed to the finale slot in the sequence (data, not level number).

| Finale | Signal thread | Crew-gap thread |
|---|---|---|
| L20 | Decode 25%: the pulse repeats a ship registry | KILN log: Bay Five pinged the ridge from cryo-watch |
| L30 | Decode 50%: every registry is a ship that came down here | Sela admits Meridian lost a crew the same way |
| L40 | Decode 75%: the pulse is asking for something | A message from Bay Six, asking to come home |
| L50 | Decode 100%: the coordinates of what lies beyond the ridge | Bay Six arrives at the gate, alone |
| L60 | (season finale: the expedition to the ridge) | |

## Implementation notes

- Skin: `story.firsts: Record<id, { on: "start" | "view" | "event", event?: string, speaker,
  line }>`, plus speaker portraits.
- Client: a small `firsts.ts` beside `discovery.ts` (same "seen" store): on level start it checks
  modules; each frame it checks which labelled ids are on screen (the renderer already knows
  for discovery labels); it listens for the named sim events. Fires through the director's bark
  UI when that exists, or the coach toast until then.
- Tests: every id the pack uses has an entry or is on the "introduced in 1–5" list (a coverage
  test like `skins/test/coverage.test.ts`), and no line exceeds about 15 words.
