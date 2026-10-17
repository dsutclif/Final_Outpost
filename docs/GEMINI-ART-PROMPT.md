# Gemini art mock-up prompt: Farthest Outpost

How to use: paste **Part 1 (master context)** into Gemini once at the start of a chat, then send
the sheet prompts from **Part 3** one at a time. Each sheet asks for one image. Generate the
**style anchor** (sheet 0) first and re-attach it to later prompts with "match this style
exactly". Part 4 covers the environments, and Part 5 covers the skins planned after launch.

---

## Part 1: Master context (paste first)

> You are the concept artist for **Farthest Outpost: Explore and Survive**, a portrait-mode
> mobile survival-builder game. The look should match the playable ads for Whiteout Survival,
> Kingshot and Township: chunky, toy-like **low-poly 3D**, soft stylised lighting with one warm
> key light, soft blob shadows under everything, saturated colours (never neon), and thick,
> readable silhouettes. No hard black outlines and no photorealism. Use original designs only,
> with no logos or characters from existing games.
>
> **Camera:** tilted top-down, about 50° from horizontal, slight perspective, portrait 9:16
> frame. The hero is about 8–10% of screen height, and the base fills the screen width with a
> margin of terrain around it.
>
> **Scale:** the hero is 1 unit tall with a slightly oversized head and hands. Carried items are
> big and chunky, about half a character tall, stacked in a single tall column on the hero's
> back. Buildings are 2–3× the hero's height.
>
> **Launch setting, "Mars Greenhouse":** a young colony on Mars. The ground is a muted rust/sand
> (#8a4d2e to #a86a44) with dust scatter and cracked plates. The sky is a pale apricot haze
> (#f6caa0) with fog #d9a47c. Structures are white/cream composite panels (#f3ece1) with teal and
> orange (#ff9b3d) accents and green-tinted glass domes (#9cf0d2). Interactive highlights are cyan
> #4fd1ff, danger is #ff5a3c and OK is #62e39a. Interactive objects must pop clearly against the
> rust ground.
>
> **Readability rules:** every object must be recognisable at about 40 px tall from the game
> camera. Character roles differ by **headgear and held tool**, never colour alone. Nothing
> important sits in the top 12% of the frame, where the HUD goes.
>
> For asset sheets: show each object at the 50° game-camera angle on a plain neutral background,
> evenly spaced in a grid, with a small label under each one. For scenes: use the game camera
> and show the gameplay clearly.

---

## Part 2: Complete asset list (Mars Greenhouse)

Every canonical game id that needs art, with its Mars name. The ids are in brackets for
reference.

### Characters (one shared humanoid body plan; roles = hat + tool + accent colour)
| Asset | Description |
|---|---|
| Commander (unit.player) | Hero colonist in a white EVA suit with a tinted gold visor and a small backpack frame for the item stack. Gets a green ground ring. |
| Colonist, idle (role.idle) | Lighter-weight suit, no hat, grey-blue accent #b8c3cc |
| Hauler / collector (role.supplier) | Hard hat, pickaxe or scoop, orange #ffb03b |
| Runner (role.server) | Cap, carry tray, pink #ff7fa8 |
| Clerk (role.cashier) | Visor, handheld scanner, violet #b98cff |
| Technician / operator (role.operator) | Goggles, wrench, white #f5f5f5 |
| Ranger / hunter (role.hunter) | Antenna helmet, net or stun rifle, green #8fd16a |
| Guard / defender (role.defender) | Crested helmet, blaster and shield, steel blue #93acd0 |
| Courier (role.hauler) | A-frame backpack, teal #40c9b5 |
| Medic (role.medic) | White helmet with a red cross, med kit |
| Trader (unit.customer) | Visiting merchant in a grey suit |
| Hurried trader (unit.customer_impatient) | Grey suit, leaning forward, tapping watch |
| VIP trader (unit.customer_premium) | Gold-trimmed suit, cape or sash |
| Bulk trader (unit.customer_bulk) | Big trader with a hover cart, or a small rover truck |
| Raider (hostile.raider_humanoid) | Scavenger in dark rags and patched armour with a glowing red visor |
| Raider warlord, boss (hostile.boss) | Huge (about 2.5× hero), slow, heavy armour, red visor, health bar over it |
| Dust crawler (hostile.creature) | Six-legged dusty insectoid beast |
| Dust mite (hostile.swarmling) | Small, fast six-legged critter that comes in swarms |
| Rock hopper (node.prey / unit.prey) | Cute round hopping Martian critter that gets hunted for protein |
| Spiked hopper (node.prey_dangerous) | Hopper with back spikes and an angry look |

**Character states:** idle, walk, carry-walk (tall item column), gather, deposit, hit,
knockback, cheer, distress (hugging itself, frost meter over the head), injured (bandage, sitting),
frozen (iced over).

### Resource items (big chunky icons; each needs a dark rim)
| Item | Colour | Look |
|---|---|---|
| Ore (res.material_basic) | violet #d89dff | Crystalline ore chunk |
| Alloy (res.material_refined) | silver-white #f4f6ff | Shiny ingot bar |
| Fuel cell (res.fuel_dense) | yellow-green #f2ff3a | Glowing cylinder battery |
| Greens (res.food_raw_1) | bright green #35e65a | Lettuce or crop bundle |
| Protein (res.food_raw_2) | pink #ff8fb8 | Wrapped protein pack or meat |
| Meal (res.food_prepared) | cream #ffdc8a | Sealed meal tray |
| Scrap (res.salvage) | blue-steel #8fb6ff | Bent metal plate and bolts |
| Credits (res.currency) | gold #ffc21f | Coin or credit chip; also stacked cash bricks |
| Parts (res.component) | aqua #4ff2d2 | Gear or machined part |

Also show each item as a **tall back stack** (1, 3, 6 and MAX) and as a **ground drop**.

### Resource nodes (gather sources, each with full / depleted / regrowing states)
- **Ore pile** (node.material_source): violet crystal ore pile. It appears in dense "fuel forest" clusters of many small nodes.
- **Ore scrap** (node.fuel_scrap): small quick-depleting ore scraps.
- **Grow dome** (node.food_source): pressurised glass dome with green crops inside.
- **Fuel cell cache** (node.fuel_deposit): open crate or rack of glowing fuel cells.
- **Wreck** (node.salvage_source): crashed rover or ship hull to pull scrap from.
- **Hopper flats** (node.prey_ground / zone.prey): natural roaming area with tufts and burrows, no outline.

### Hero buildings (each needs build-pad ghost → scaffold → built, plus visual states)
- **Reactor heat core** (sink.core): the centre of the base. It has an orange plasma glow whose light radius equals the safe zone, a fuel hopper and level tiers Lv1–Lv3+. States: full (bright and spinning), low (dim and flickering), out (dark, with a frost ring spreading).
- **Kiosk** (sink.sales_point): sealed pressurised trade pod with a glass display front, an airlock hatch for customers and one shelf crate per good showing visible units and a count chip. Show it empty, half and full.
- **Clerk pad** (sink.sales_point.register): floor pad beside the kiosk where the clerk stands.
- **Credits pile** (sink.sales_point.pile): stacked gold credits and cash bricks beside the counter.
- **Galley** (conv.food_processor): cooking module where greens go in and meals come out. It has an input hopper, an operator spot and an output tray.
- **Smelter** (conv.material_processor): furnace where ore goes in and alloy ingots come out, with a glow and smoke.
- **Parts works** (conv.alloy_works): machining module where alloy goes in and parts come out.
- Converter states: working (animated, glowing), idle, blocked (warning icon) and output at cap (red "!" with the pile wobbling), plus **collapsed pile**.
- **Warehouse** (struct.depot / store.depot): storage hall with a **see-through roof cutaway** showing stacked inventory inside.
- **Habitat hub** (struct.landmark): the colony's showpiece goal building, large and impressive.
- **Hab pod** (struct.housing): small domed living pod.
- **Med bay** (struct.medical): white module with a red cross and a bed visible inside.
- **Guard post** (struct.barracks / struct.training): small barracks with a weapon rack.
- **Conveyor** (struct.conveyor): straight and one-bend belt segments with items moving on them, linking a source to a converter.

### Defences
- **Wall section** (struct.barrier): chunky composite panel segment. States: unbuilt line (dashed "WALK HERE" floor marking), built, cracked/damaged, destroyed (rubble), reinforced (extra plating).
- **Airlock gate** (struct.gate): gate in the wall with its own frame and light.
- **Turret Lv1 / Lv2** (struct.ranged_defense / .t2): wall-mounted tower on a ring post. Lv2 gets a bigger head, a double barrel and a longer range. Show the muzzle flash.
- **Freestanding turret** for levels without walls.

### Captures and lasso
- **Stasis pod** (capture.recruit_container): frosted capsule with a colonist visible inside. States: frozen-over and opening (thawing).
- **Supply crate** (capture.supply_crate): towable crate that pops open in the heat.
- **Tow line**: a sagging cable chain from the hero to up to 3 towed pods.

### Pads, zones and ground decals (flat floor decals, big numbers)
- **Build pad** (pad.build): dashed outline with a white silhouette of the building plus its cost and a fill bar.
- **Hire pad** (pad.hire): role icon plus machine or source icon, price, and a locked state.
- **Operator platform**: always visible beside each converter.
- **Arrivals pad** (zone.waiting): waiting area for new colonists by the airlock.
- **Rockslide** (zone.blocked): boulder pile blocking a path, with a clear pad.
- **Rock ridge** (zone.terrain): impassable ridge.
- **Interaction rings**: cyan proximity ring and the safe-radius ring around the reactor.

### Effects (VFX)
Coins arcing to the HUD, "+N" floaters, squash-and-stretch building pop with a dust ring, item
arcs into hoppers, hit flash and knockback, muzzle flash, frost vignette and frost ring, dust
storm particles, "!" overstock badge, enemy edge arrows with a skull "ENEMY" tag, guide arrow.

### UI / HUD
- Top HUD: heat (lifeline) bar with a 25% tick, Colony HP heart bar, credits chip, objective strip ("VIPs 2/5"), time-target chip, raid countdown banner.
- Customer speech bubble with the item icon and count.
- Pre-level card with three star objectives, and a result card with stars ticked or missed.
- Title screen with the "Farthest Outpost" wordmark (rounded, heavy, white with a dark outline, Baloo 2 style).
- Level map ("Sector N"), Settings, Field guide, and the tap-to-inspect card.
- App icon and splash screen.

---

## Part 3: Sheet prompts (send one at a time)

**0. Style anchor.** "Create one hero gameplay screenshot of Farthest Outpost (Mars Greenhouse
skin) at the game camera: the Commander in a white EVA suit carrying a tall column of violet ore
chunks, walking past the glowing orange reactor at the centre of a small white-and-teal colony on
rust ground, with a glass grow dome, a kiosk with traders queuing, and an ore pile cluster. Portrait 9:16."

**1. Characters A.** "Asset sheet: Commander, idle Colonist, Hauler, Runner, Clerk, Technician,
Ranger, Guard, Courier and Medic in a 5×2 grid at the game camera angle, each labelled. Same body,
different headgear, tool and accent colour as listed."

**2. Characters B.** "Asset sheet: Trader, Hurried trader, VIP trader, Bulk trader (with hover
cart), Raider, Raider warlord (boss, 2.5× size), Dust crawler, Dust mite, Rock hopper and Spiked hopper."

**3. Character states.** "The Commander in states: idle, walking, carrying 6 items, gathering,
hit, cheering, shivering in distress with a frost meter, injured, frozen."

**4. Resource items.** "Asset sheet of 9 chunky item icons: Ore, Alloy, Fuel cell, Greens,
Protein, Meal, Scrap, Credits, Parts, in their listed colours with dark rims, plus a row showing
ore stacked 1, 3, 6 and MAX on a back."

**5. Resource nodes.** "Asset sheet: Ore pile cluster (full, depleted, regrowing), Grow dome,
Fuel cell cache, Wreck, ore scraps, and a hopper flats area."

**6. Reactor.** "The Reactor heat core at Lv1, Lv2 and Lv3, then Lv2 in full, low-fuel and
out-of-fuel states with a frost ring. Show the safe-radius glow on the ground."

**7. Kiosk and sales.** "The Kiosk trade pod (empty, half and full shelves with count chips), the
clerk pad with a clerk, a credits pile, and a queue of 4 traders with speech bubbles."

**8. Converters.** "Galley, Smelter and Parts works, each with an input hopper, operator
platform and output tray. Show the Smelter working, idle, blocked and at cap with a red '!' and
a wobbling pile, then collapsed."

**9. Buildings.** "Habitat hub, Hab pod, Med bay, Guard post, Warehouse with a see-through roof
showing inventory, and a Conveyor belt (straight and bent) carrying items."

**10. Build sequence.** "One building (Hab pod) shown as: dashed build pad with a white
silhouette and price, scaffold, squash-and-stretch pop with a dust ring, finished."

**11. Defences.** "Wall sections: unbuilt dashed line, built, cracked, rubble, reinforced. Airlock
gate. Wall towers Lv1 and Lv2 with a muzzle flash. A freestanding turret."

**12. Captures.** "A stasis pod with a colonist inside (frozen and thawing open), a supply crate
popping open, and the Commander towing 3 pods on a sagging cable."

**13. Pads and decals.** "Floor decals: build pad, hire pad (unlocked and locked) with role and
machine icons, arrivals pad, rockslide with its clear pad, cyan interaction ring, operator platform."

**14. Terrain.** "Terrain kit: rust ground tiles, dust scatter, cracked plates, small rocks, rock
ridge, crater, chasm edge, dune, canyon wall, rockslide boulders."

**15. VFX.** "VFX sheet: coins arcing, '+5' floaters, dust-ring pop, hit flash, muzzle flash,
frost vignette, dust-storm particles, '!' badge, edge arrow with a skull ENEMY tag, guide arrow."

**16. HUD.** "Portrait phone HUD mock-up over gameplay: heat bar with a 25% tick, Colony HP
hearts, credits chip, objective strip, time-target chip and a raid countdown banner. Rounded heavy
white font with a dark outline."

**17. Menus.** "Title screen with the Farthest Outpost wordmark over a Mars colony at dusk; a
level-select map of sectors with stars; the pre-level card with three star objectives; the
result card."

**18. App icon.** "App icon: the glowing reactor under a glass dome on red Mars, bold and simple,
readable at small size. Plus a matching splash screen."

---

## Part 4: Environments (Mars Greenhouse)

Every level is one self-contained colony on a portrait map. The base sits at the centre,
resource fields are around it, and an outer zone lies beyond the walls. Levels come in five
families, each with its own mood. Generate one gameplay scene per family plus the lighting presets.

| Environment | What the player sees | Mood / key elements |
|---|---|---|
| **Shelter** (heat and settlers) | Reactor at the centre, dense ore-pile "fuel forests", hab pods, an arrivals pad by the airlock, rockslides blocking side areas | Cosy warm glow against cold dusk; orange safe ring; colonists gathering |
| **Rescue** (expeditions) | Perimeter wall with an airlock, open wasteland outside with stasis pods and supply crates scattered far out, hopper flats, a blocked pass | Lonely, wide, exploratory; frost on pods; a tow cable trailing the hero |
| **Harvest** (farm and market) | Rows of grow domes, the kiosk with a long trader queue, credits stacking, bulk traders arriving on a dusty road | Busy, cheerful market; greens and gold everywhere |
| **Industrialize** (supply chains) | Galley, smelter and parts works linked by conveyors, the warehouse cutaway, couriers moving goods | Industrial bustle; glows, smoke, moving belts, tidy logistics |
| **Defend** (hold the colony) | Closed perimeter ring, a gate per attack side, wall towers, guards at posts, dirt paths where raiders and crawlers approach from 1–3 edges, a boss | Tense; red danger accents; muzzle flashes; edge "ENEMY" tags |

**Geography variants** (some levels): rock ridges, craters, chasms, dunes and canyon walls that
channel routes and create chokepoints.

**Lighting presets:** day (bright apricot haze), dusk/night (the reactor becomes the main light
source with a deep blue ambient), **dust storm** (ochre sky, blowing particles, the safe ring
shrinks, a warning banner), and **reactor out** (frost-blue vignette, frost creeping in, colonists
shivering).

Scene prompt template: "Gameplay screenshot, Mars Greenhouse skin, **[family]** level, game
camera, portrait 9:16, **[lighting preset]**, showing **[key elements from the table]**."

---

## Part 5: Other planned skins (summary for later mock-ups)

Each skin reskins every asset above for the same gameplay slots. It is a full redesign, not a
recolour. The table gives the core idea per skin, and the right-hand columns show how key slots map.

| Skin | Lifeline / core / hazard | Key looks |
|---|---|---|
| **Frozen camp** (next candidate) | Warmth / barrel stove with log pile / blizzard | Survivor in a parka; logs, coal, fish, meat; wooden market stall; tents; wolves and raiders; ice-block captures; snowdrift blockers |
| **Deep Sea Colony** | Air / oxygen plant / hull breach | Dive suits, kelp farms, glass habitats on the seabed, bioluminescence |
| **Space Station Salvage** | Power / reactor core / solar flare | Station modules, airlocks, floating scrap, starfield |
| **Arctic Research Station** | Heat and power / generator / whiteout | Research huts, snowcats, ice cores, aurora |
| **Desert Oasis Caravan** | Water / well pump / sandstorm | Tents, camels or carts, palm groves, sand dunes |
| **Lighthouse Keepers** | Light / beacon lamp / sea storm | Rocky island, cottages, fishing boats, crashing waves |
| **Sky Islands** | Lift / levitation crystal / wind shear | Floating rocks, rope bridges, airships |
| **Volcano Island Spirits** | Protection / shrine flame / eruption | Tropical volcano, tiki shrines, lava glow, spirit creatures |
| **Haunted Hotel Restoration** | Light / boiler and lamps / ghost surge | Spooky hotel rooms, candles, cute ghosts |
| **Enchanted Bakery Town** | Warmth / town oven / frost night | Storybook village, bread and pastries, cosy cobblestones |

Prompt for a skin overview: "Using the same camera, scale and art style as the style anchor,
show a Farthest Outpost gameplay screenshot in the **[skin]** setting: the core is a **[core]**,
the hero is **[hero]**, with gather nodes, a sales stall with customers, housing and a
perimeter wall reimagined for this world."
