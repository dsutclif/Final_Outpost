# Model pipeline: Gemini → Meshy → game

Phase 2 of the art direction (ART-DIRECTION.md, DECISIONS 9l). Each asset below goes through:

1. **Gemini** turns the concept sheet into one clean picture of one object.
2. **Meshy** (image to 3D) turns that picture into a textured model (GLB).
3. **Claude** shrinks it for phones, fits it to the game's footprint and loads it in place of
   the code-built model (which stays as the fallback).

Concept sheets live outside the repo in `Mobile game/Asset concepts/`. Raw Gemini images and
Meshy downloads go in `Mobile game/Asset models/` (also outside the repo: they are large, and
the repo is public). Name every file by the asset's **file name** below, e.g.
`sink.core.l1.png` → `sink.core.l1.glb`.

## How to run it

**Gemini**
- Start a **new Gemini chat per group** (the `##` headings below). Long chats drift: colours
  warm up, styles blur, objects start sharing details. A fresh chat per group keeps each one
  anchored to the sheet.
- In each new chat: paste the **style block** first, attach `General Vibe.jpeg` plus the sheet the
  group names, then send that group's prompts one at a time.
- Keep the best image per asset, save it as `<file name>.png`. Reject any image with text,
  a cast shadow on the ground, more than one object, or a cropped edge.
- For levelled buildings (reactor, turret, wall), make Lv1 first, then attach that image to the
  Lv2 prompt ("same building, upgraded"), and Lv2 to Lv3, so the levels match.

**Meshy** (one paid month on Pro or above, for the Private license; start only when the images
are ready). Checked against meshy.ai and docs.meshy.ai on 2026-10-17; the interface changes often,
so if a name below has moved, look for the same idea nearby.

On the meshy.ai home page, **Quick Generate** tab:

1. **Upload a photo or sketch**: drop in one Gemini image.
2. Under the upload box, set the two pickers:
   - **Buildings, structures, characters, creatures, nodes and props:** `High Detail` and
     `Meshy 7.1 - Flagship`.
   - **Carried items (Priority C):** `Smart Topology` instead, with the target polygon count at
     about **400**. It is far cheaper (about 5 credits) and already game-sized.
3. Click the **gear** (settings) next to the model picker:
   - **License:** `Private` (the paid-plan option). Never ship CC BY models from the free plan.
   - **Geometry resolution:** `Standard`. Ultra 2K/4K adds detail the phone version cuts away.
   - **Image Enhancement:** `Off` first, so the model follows the image exactly; turn it on only
     if a result comes out blurry.
   - **Pose Control** (characters only): `Custom Pose`, then the **A-pose** preset.
   - **Multi-view** (optional): if Gemini gave you extra views of the same object (side, back),
     add them; backs come out much better. Single image is fine otherwise.
4. **Generate** (about a minute). Spin the preview: reject models with melted shapes, holes, or
   a back side that makes no sense, and retry (at most twice; a code-built fallback covers anything
   still missing).
5. **Characters and creatures only:** open **Remesh** (free) and remesh to about 10,000 faces, then
   open **Animate**. Auto-rig runs (humanoid or quadruped), then pick clips from the preset library:
   a **walk**, an **idle**, and a **run** if one looks right. Clips are free. Only humanoids and
   four-legged creatures can be rigged: the six-legged dust crawler and dust mites download as
   static models and the game animates them itself.
6. **Download** as **GLB** (for characters, after adding the clips, so they are inside the file).
   Save it as `<file name>.glb` next to its image in `Mobile game/Asset models/`.

Skip **AI Texturing** (it re-paints the model, costs credits, and the Blender step bakes lighting
anyway). Credits: Meshy 7 costs about 25 per model; 7.1 may differ, so check the credit counter
after the first one and tell Claude if it is much higher.

**Moving parts.** The game animates a few parts on their own, so those are generated as
**separate objects** (noted per asset): turret head and base, airlock door and frame. The
reactor's plasma glow stays code-built inside a model with an open top.

**Tools in hands.** Characters are generated **empty-handed**: held tools break auto-rigging.
The game attaches each role's tool (pickaxe, wrench, shield...) in code.

## Style block (paste at the start of every Gemini chat)

> You are making clean reference images for converting into 3D game models, one object per
> image. Art style: matches the attached "General Vibe" image: brutalist, near-realistic
> frontier outpost on a dusty planet. Weathered poured concrete and dull steel, chamfered
> blocky modules, panel seams, bolts, pipes, vents, light dust and grime. Low saturation:
> greys and pale sand. Colour only where it means something: glowing orange for heat, small
> cyan screens or lights.
>
> Every image must follow these rules:
> - exactly one object, centred, filling about 80% of a **square 1:1** frame, nothing cropped
> - **three-quarter view from above**: camera about 35° above the horizon, object turned about
>   35° so two sides and the top are visible
> - plain flat **light grey background (#d8d8d8)**, no floor, no ground plane, no cast shadow
> - soft, even, overcast studio light; no strong highlights or dark shadows baked in
> - no text, no labels, no logos, no UI, no people unless the object is a character
> - high detail, sharp edges, 2048×2048
>
> Characters: full body, standing in a relaxed **A-pose** (arms about 30° away from the body,
> legs slightly apart), facing the camera at a slight three-quarter angle, **empty hands**,
> nothing held or slung that hides the arms or legs.
>
> I will send one object per message. Keep the same style, light and background for all.

## Priority A: hero buildings (sheet: `Basic buildings.jpeg`, then `Upgraded stuctures.jpeg`)

| File name | Asset | Prompt |
|---|---|---|
| `sink.core.l1` | Reactor heat core Lv1 | Reactor heat core, level 1, from the attached sheet: a squat round poured-concrete reactor ring, about twice as wide as tall, with heavy buttresses, vent grilles, a small side tank and pipes. **The top is an open round well** (the glow inside is added later, so the well is dark and empty). A fuel hopper chute on the front. |
| `sink.core.l2` | Reactor Lv2 | Attach the Lv1 image. The same reactor, upgraded to level 2 like "Reactor core Lv2" on the second sheet: thicker armoured ring, more pipes and cabling, a second tank, hazard stripes, small exhaust stacks. Open dark top well, same footprint. |
| `sink.core.l3` | Reactor Lv3 | Attach the Lv2 image. Level 3 like "Reactor core Lv3": tall angular concrete pylons rising around the ring, heavy cable bundles, glowing orange slot windows on the sides. Open dark top well, same footprint, about 1.5× the Lv2 height. |
| `sink.sales_point` | Kiosk (trade kiosk) | Trade kiosk from the sheet: a rounded steel-and-concrete trade module with a **large open glass display front with empty shelves**, an airlock door on the right side, a dish and antenna on the roof, a small terminal by the door. Glass is clear so the empty shelves show. |
| `conv.material_processor` | Smelter | Smelter from the sheet: blocky concrete furnace module, an arched furnace mouth on the front glowing orange, two exhaust chimneys on top, a small hopper of dark ore on one side and a tray on the other. No smoke. |
| `conv.food_processor` | Galley | Galley from the sheet: low concrete module with an arched hatch on one end, pipes over the top, and two hoppers on the front side holding food packs. |
| `conv.alloy_works` | Parts works | Parts works from the sheet: long concrete workshop module with a machining bay open on the front, a small robot arm on a side pad, vents on the roof. |

## Priority A: structures and defences (sheet: `Miscellaneous structures.jpeg`, `Upgraded stuctures.jpeg`)

| File name | Asset | Prompt |
|---|---|---|
| `struct.ranged_defense.base` | Turret base (all levels) | Turret base only, from "Turret Lv1": a round stepped concrete plinth with buttress feet, **flat round top with nothing on it** (the gun head is a separate model). |
| `struct.ranged_defense.head` | Turret head Lv1 | Turret gun head only, from "Turret Lv1": an armoured steel housing with one short heavy barrel, seen from the three-quarter angle, **no base or post under it**, floating on the grey background. |
| `struct.ranged_defense.t2.head` | Turret head Lv2 | Attach the Lv1 head image. Upgraded head like "Turret Lv2": twin longer barrels, an ammunition drum on the side, a sensor box on top. Head only, no base. |
| `struct.ranged_defense.t3.head` | Turret head Lv3 (optional: the game has no Lv3 turret yet) | Attach the Lv2 head image. Heavy head like "Turret Lv3": wide armoured housing, twin long barrels with glowing orange coils, side ammunition packs. Head only, no base. |
| `struct.barrier` | Wall section | Wall section from the sheet: one straight segment of poured-concrete barrier, about three times as long as tall and thin, with angled buttresses on the back face and yellow-black hazard stripes. Seen so the long face is clearly visible. |
| `struct.barrier.reinforced` | Reinforced wall | Attach the wall image. The same wall segment reinforced like "Reinforced wall": extra steel plating, more buttresses, hazard stripes, small lights and an antenna. Same length and thickness. |
| `struct.gate.frame` | Airlock gate frame | Airlock gate frame only, from "Airlock gate": a heavy concrete frame with yellow lights and a keypad, **the doorway open and empty** (the doors are a separate model). Same length as one wall segment. |
| `struct.gate.door` | Airlock gate door | One sliding airlock door panel for the attached frame image: thick steel slab with panel lines and a yellow stripe, flat-on three-quarter view, nothing else. |
| `struct.landmark` | Habitat hub | Habitat hub from the sheet: a large ribbed concrete dome with round porthole windows on top of a chunky base with side modules, pipes and an entrance ramp. |
| `struct.housing` | Hab pod | Hab pod from the sheet: a small rounded steel living pod with a big round porthole window and a short entry airlock. |
| `struct.medical` | Med bay | Med bay from the sheet: a rounded white-grey medical module with faded red crosses on the sides and an antenna on the roof. |
| `struct.training` | Guard post | Guard post from the sheet: square armoured concrete bunker with louvred slits, antennas and a dish on the roof, two small concrete road barriers in front. |
| `struct.depot` | Warehouse | Warehouse from the sheet, shown as a **cutaway with no roof**: a steel-frame shed with corrugated walls, stacks of crates inside. |

## Priority A: characters (sheet: `Settlers.jpeg`; render them realistic like the vibe image, not like the inked sheet)

All characters: realistic, muted versions of the sheet designs, **empty-handed, A-pose**.

| File name | Asset | Prompt |
|---|---|---|
| `unit.player` | Commander | The Commander: a white EVA suit with muted gold trim, gold-tinted visor helmet, life-support backpack with antennas, a wrist display. Weathered and dusty. |
| `role.supplier` | Hauler | The Hauler: rugged ochre-yellow work suit with dark armour pads, an orange hard-hat helmet with a dark visor. |
| `role.operator` | Technician | The Technician: grey work suit with leather-brown harness and tool belt, a helmet with mounted multi-lens goggles and a breathing mask. |
| `role.defender` | Guard | The Guard: heavy dark gunmetal armour, a helmet with a short red crest and a red visor slit. No shield and no weapon. |
| `role.medic` | Medic | The Medic: white EVA suit with faded red stripes and red crosses on the shoulders, gold-tinted visor, a medical backpack. |
| `role.hauler` | Courier | The Courier: grey-brown field suit with orange accents, a helmet with a cyan goggle band, and a tall strapped A-frame backpack loaded with crates and canisters. |
| `role.idle` | Colonist | A plain colonist: light grey-blue work suit, a simple open-face helmet, no backpack. |
| `role.cashier` | Clerk | A clerk: light grey suit with a muted violet chest panel, a peaked visor cap over a light helmet, a scanner clipped to the belt. |
| `role.server` | Runner | A runner: lightweight grey suit with muted rose stripes, a soft cap-style helmet, a small hip bag. |
| `role.hunter` | Ranger | A ranger: olive-grey field suit, a helmet with a tall antenna and a monocular scope over one eye. |

## Priority B: visitors, raiders, creatures (sheet: `Non settler characters.jpeg`)

| File name | Asset | Prompt |
|---|---|---|
| `unit.customer` | Trader | The Trader from the sheet: worn khaki-grey EVA suit, clear bubble helmet, backpack. Empty hands. |
| `unit.customer_impatient` | Hurried trader | The Hurried trader: the same suit, leaner, a glowing cyan wrist display. Empty hands. |
| `unit.customer_premium` | VIP trader | The VIP trader: a smarter suit with brass trim and a dark mirrored visor. Empty hands (the cases are added later). |
| `unit.customer_bulk` | Bulk trader | The Bulk trader **with his hover cart** from the sheet: a trader standing behind a flat hover cart loaded with strapped crates, hands on the handle. One object. |
| `hostile.raider_humanoid` | Raider | The Raider: black tactical armour, helmet with a glowing red visor band. No weapon. |
| `hostile.boss` | Raider warlord | The Boss raider: huge powered armour suit, bulky shoulders and limbs, small head with a red visor. No weapon. |
| `hostile.creature` | Dust crawler | The Dust crawler: a large armoured six-legged insect-like creature, segmented dusty brown shell, standing on all legs. |
| `hostile.swarmling` | Dust mite | One Dust mite: a small bristly six-legged mite, dusty brown. Just one, not a group. |
| `node.prey` | Rock hopper | The Rock hopper: a squat lizard-like creature with a rocky armoured back, short legs and a curled tail. |
| `node.prey_dangerous` | Spiked hopper | The Spiked hopper: a lean aggressive hopper covered in long spikes, mouth open. |

## Priority B: resource nodes and props (sheets: `Environment elements.jpeg`, `Miscellaneous assets.jpeg`)

| File name | Asset | Prompt |
|---|---|---|
| `node.material_source` | Ore pile | One crystalline ore pile: a sandy rock outcrop with clusters of pale blue crystals growing out of it, from the sheet. |
| `node.fuel_scrap` | Ore scrap | A small heap of rusty scrap metal pieces with a few blue crystals mixed in, on a little patch of sand. |
| `node.food_source` | Grow dome | One grow dome: a geodesic glass dome on a concrete ring base with green plants inside and a small door. |
| `node.fuel_deposit` | Fuel cell cache | Fuel cell cache: an open steel crate holding rows of fuel cells with glowing orange-red windows. |
| `node.salvage_source` | Wreck | The spaceship wreck: a crashed, broken silver-grey ship hull lying on its side, torn panels, on a patch of sand with scattered debris. |
| `capture.recruit_container` | Stasis pod | The stasis pod: a horizontal steel capsule with a frosted window showing a sleeping colonist, pipes along the base. |
| `capture.supply_crate` | Supply crate | The towable supply crate: a rugged rusty-steel crate with strap bands, a handle and four small wheels. |
| `zone.blocked` | Rockslide | A rockslide: a low wide pile of tan boulders and broken rock. |

## Priority C: carried items (sheet: `Items.jpeg`)

Singles only: the game builds back stacks, shelf stock and ground piles by repeating the single
item, so the sheet's "stack" art is not needed. Items are drawn many times at once, so each is cut
to about 200–500 triangles in cleanup: generate them simple and chunky, with a strong silhouette;
fine print (labels, stamped text) will not survive and is not wanted. Same style block and rules.

| File name | Asset | Prompt |
|---|---|---|
| `res.material_basic` | Crystalline ore | One chunk of crystalline ore from the sheet: a fist-sized lump of pale blue crystal growing from a little sandy rock base. Chunky, few large facets. |
| `res.material_refined` | Alloy | One ingot of shiny alloy: a brushed silver trapezoid bar with bevelled edges. No text stamped on it. |
| `res.fuel_dense` | Fuel cell | One fuel cell from the sheet: a short steel canister with a mesh cap and four tall windows glowing orange-red, chunky end rings. |
| `res.food_raw_1` | Greens | One bundle of green leafy crops tied with twine at the stems, a few roots showing. Compact, chunky leaves. No tag. |
| `res.food_raw_2` | Protein | One vacuum-wrapped protein block: a pale grey-silver plastic-wrapped brick with crimped ends. No printed label. |
| `res.food_prepared` | Meal | One sealed meal pouch: a khaki foil pouch, slightly puffed, with a crimped top edge. No text. |
| `res.salvage` | Scrap | One piece of bent scrap: a torn, rusty steel plate with a couple of twisted rods attached. Chunky. |
| `res.currency` | Credits | One gold credit coin: a thick hexagonal gold coin with a raised ring emblem, seen at a three-quarter angle so its thickness shows. |
| `res.component` | Parts | One machined part from the sheet: a steel gear fused to a short cylinder housing with bolts. Chunky. |

## Not sent to Meshy

Kept code-built, because they are flat or animated in ways a single model cannot do: pads and
rings, the conveyor belt, the hopper flats ground patch, the reactor glow, and all effects. They
follow the concept look through the palette and the shader.

## Priority and credit budget

About 60 images. Order: Priority A buildings, A structures, A characters, then B, then C (items,
about 225 credits). If credits run short, drop in this order: `role.server`, `role.hunter`,
`role.cashier` (they fall back to the colonist model with code-built headgear), then the items
(code-built ones stay), then the B nodes and props.
