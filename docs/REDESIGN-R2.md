# Redesign round 2 (agreed with Doug 2026-10-10)

The binding brief for this round. Where it conflicts with SPEC.md or older DECISIONS entries,
this wins (DECISIONS 11–24 summarise it). Feedback came from Doug playing the Vercel build on
an iPhone.

## 1. Bugs
- B1 In-level gear button must open Settings (and pause). Only the title screen works today.
- B2 Phantom sales: sales happen while no customer is queued, with customers clearly visible
  when present. Every `sold` event must come from exactly one queued customer who is removed
  and walks off paid. Add a test that fails on any sale without a customer leaving the queue.
- B3 Pads must show every resource they cost with the remaining count (3D label shows only
  the first). The "need more materials" hint names the missing resource.
- B4 A generated level had a material processor with no supplier hire pad. Every converter
  needs a feed path; the generator must reject levels with an unfed converter.
- B5 Backpack: one stack per resource side by side; "MAX" above any stack at cap.

## 2. Simplify and restyle
- 3D only. Remove the 2D renderer from the client, the renderer setting and the benchmark
  fallback; devices without WebGL (or failing a minimal capability check) get an
  "unsupported device" screen. packages/render-2d may stay in the repo for tests/tools but is
  not shipped.
- Clerk pad: remove the register object; the cashier (or player) stands on a pad beside the
  kiosk, like the operator at a converter.
- Martian kiosk: sealed pressurised trade pod, glass display front, airlock hatch for the
  customer; one shelf crate per sellable good with visible units plus a count chip.
- Prey zones: no box outline; critters roam a natural area.
- "Hull" becomes **Colony HP**: heart-style bar, flashes red and shakes when hit.

## 3. Core loop and threat clarity
- Fuel forests: dense clusters of many small fuel (material) nodes in every level.
- Reactor-out countdown: when fuel hits 0, the heat bar becomes "Colony freezes in 0:22"
  (warning pulse earlier at low fuel), a frost ring drains around the reactor, frost meters
  fill over each colonist.
- Colonists freeze one at a time while the reactor is out (each loss costs population; spread
  the losses across the grace period); the level fails when everyone is gone or the countdown
  ends. Refuelling stops further losses.
- Customer line always stocked: keep 3–4 customers waiting (faster arrivals, fuller queue),
  forming in view beside the kiosk (camera-visible side, never off the map edge).

## 4. Walls and defense
- Perimeter ring around the base with 1–2 gates, cheap (≈1–2 resource per section).
- Walls only where something needs them: attackers, or a rescue expedition (lasso needs a
  gate to leave through). Never superfluous.
- Attackers from 1–3 sides by difficulty; walls stop hostiles approaching from any direction.
- Waves: many weak attackers, bigger waves; their drops (scrap / res.salvage) buy walls,
  turret upgrades and defenders. Occasional bosses: big, slow, tanky, health bar, big payout.

## 5. Five level families

| Family | Fantasy | Mechanics |
|---|---|---|
| shelter | heat and settlers | reactor + upgrades, fuel forests, housing, gate arrivals, dust storms, rockslides (blocked zones) |
| rescue | expeditions | perimeter + gate, lasso stasis pods and supply crates, hunting, clearing the pass |
| harvest | farm and market | crops and livestock (food sources), kiosk, customer variety/VIPs, unlocking sources |
| industrialize | supply chains | converters, two-step chains, warehouse/depot, haulers, automation |
| defend | hold the colony | walls, turrets, defenders, scrap economy, bosses, med bay |

Goal types (* = needs a small new sim feature). The generator picks one main goal; stars use
other goals of the family plus time targets.

- shelter: colonists N · reactor level X · build N hab pods · ride out a dust storm · heat ≥ X%
  for T s · fill the reactor by time T · admit N arrivals · clear N rockslides · house every
  waiting colonist · survive until dawn (hold out T s)*
- rescue: rescue N · rescue every pod · tow 3 home in one trip · rescue N before pods freeze
  over* · hunt N critters · bring home N protein · clear the pass · house N rescued colonists ·
  bring a full tow home without losing one* · recover N supply crates* (lassoable crate that
  pays resources in the safe radius)
- harvest: sell N of a crop · earn N credits · serve N VIPs · unlock N crops/livestock · every
  shelf full at once · N customers in a row with none angry · sell ≥ N of each of K goods ·
  hire N farm workers · earn N credits within T s · fill a bulk order* (one big trader order)
- industrialize: produce N processed goods · run K converters at once for T s · haulers deliver
  N goods · build a two-step chain* (tier-2 converter) · fully automate: credits flow for T s with
  no player deposits · hire N operators/haulers · stockpile N alloy in the warehouse · build the
  landmark from processed materials · upgrade a converter to Lv X* · don't overload any stockpile
  (no converter output, warehouse or shelf hits cap)
- defend: survive N waves · defeat N attackers · defeat the boss · turret Lv X · keep Colony HP ≥ X%
  · no colonist injured · complete the perimeter before wave 1 · collect N scrap · lose no wall
  section · train N defenders

Sequence: levels 1–5 are the story in order: shelter → rescue → harvest → industrialize →
defend. Levels 6–15 add each family's deeper mechanics inside the family. After 15 the
generator rotates families with a two-family finale every 10th level. 60 levels, every
element in a level must be used (no superfluous walls, converters, pads).

## 6. Stars
- Three named objectives per level: the main goal, a time target, a family challenge.
- Heat challenges include "Settlement never freezes" (fuel never hits 0), "No colonist
  freezes to death", "Heat never below 25%".
- Shown on the pre-level card; in frame during play: 25% tick on the heat bar, time-target chip,
  live objective strip with counters ("VIPs 2/5"). Result card shows each star ticked or missed.
- Objectives are data in the manifest (`objectives: [{ kind, params, label }]`), evaluated from
  sim stats so bots, rater and client agree.

## 7. Teaching and readability
- Guide arrows on levels 1–5: one arrow at the next required step chosen by the bot planner
  (packages/bots plan + brain), one-line instruction, hysteresis so it holds a target until done;
  afterwards optional via Settings ("Show guide").
- Discovery labels: floating name + one-line purpose over every object type not yet interacted
  with; per player (saved), not per level.
- First-touch card: small non-blocking toast the first time a type is used.
- Tap to inspect: a tap without drag shows name + purpose any time.
- Field guide: Settings tab listing discovered types with icon + purpose.

## 8. Offline
Cache the entire 60-level pack on first launch (under 1 MB), not just the next 30.
