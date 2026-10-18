# Model pipeline: Gemini → Meshy → game

Phase 2 of the art direction (ART-DIRECTION.md, DECISIONS 9l). Each asset below goes through:

1. **Gemini** turns the concept sheet into one clean picture of one object.
2. **Meshy** (image to 3D) turns that picture into a textured model (GLB).
3. **Claude** runs `pnpm models:build`, which bakes it down for phones (about 3,000 triangles),
   fits it to the game's footprint and loads it in place of the code-built model (which stays as
   the fallback). See "Bringing models into the game" below.

Concept sheets live outside the repo in `Mobile game/Asset concepts/`. Meshy downloads go in
`Mobile game/Asset workflow/3D Models/` and their Gemini images in `Asset workflow/Solo Mock Ups/`
(outside the repo: they are large, and the repo is public). Name new files by the asset's
**file name** below (`sink.core.l1.png` → `sink.core.l1.glb`); readable names like the first
batch's (`Heat Core 1.glb`) also work, since `meshy.json` maps each file to its id.

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
   - **Carried items and held props:** try `Smart Topology` (target about 400 polygons, about
     5 credits) on **one** item first. Meshy's docs do not say whether Smart Topology output is
     coloured: if it comes back grey, use `High Detail` + Texture on for all items and props
     instead (about 25 credits each) and skip Remesh; the build tool (`pnpm models:build`)
     shrinks them to game size with their colours.
3. Click the **gear** (Model Generation Settings) next to the model picker:
   - **Resolution:** `Standard`. Ultra 2K/4K adds detail the phone version cuts away.
   - **Split:** off. Moving parts are already separate images.
   - **Texture:** **on** (it is off by default). Without it the model comes back plain grey.
   - **Pose:** `A-Pose` for characters, `None` for everything else.
   - **Image Enhancement:** off first, so the model follows the image exactly; turn it on only if
     a result comes out blurry. (It is on by default.)
   - **License:** `Private` (it defaults to CC BY 4.0). Never ship CC BY models.
   - **Multi-view** (optional): if Gemini gave you extra views of the same object (side, back),
     add them; backs come out much better. Single image is fine otherwise.
4. **Generate** (about a minute). Spin the preview: reject models with melted shapes, holes, or
   a back side that makes no sense, and retry (at most twice; a code-built fallback covers anything
   still missing).
5. **Buildings, structures, nodes and props: no remesh.** Download the original; the game's build
   step bakes it straight down to a phone model and needs the full detail to bake from.
   **Characters and creatures:** Remesh (free: Target Polycount `Fixed`, `10K`, Topology
   `Triangle`), then open **Animate**. Auto-rig runs (humanoid or quadruped), then pick clips from the preset library:
   a **walk**, an **idle**, and a **run** if one looks right. Clips are free. Only humanoids and
   four-legged creatures can be rigged: the six-legged dust crawler and dust mites download as
   static models and the game animates them itself.
6. **Download** as **GLB** (for characters, after adding the clips, so they are inside the file).
   Save it as `<file name>.glb` in `Mobile game/Asset workflow/3D Models/`. (The build step bakes
   static models only; rigged characters will need their own path when they arrive.)

Skip **AI Texturing** (it re-paints the model and costs credits). Credits: Meshy 7 costs about 25 per model; 7.1 may differ, so check the credit counter
after the first one and tell Claude if it is much higher.

**Moving parts.** The game animates a few parts on their own, so those are generated as
**separate objects** (noted per asset): turret head and base, airlock door and frame. The
reactor's plasma glow stays code-built inside a model with an open top.

**Tools in hands.** Characters are generated **empty-handed**: held tools break auto-rigging.
The game attaches each role's tool (pickaxe, wrench, shield...) in code.

## Bringing models into the game (built 2026-10-17)

`pnpm models:build` (tools/build-models.ts) reads each entry in
`packages/render-3d/src/assets/meshy.json` and writes `packages/client/public/models/<file>.glb`
plus `meshy.built.json` (triangles, bounds, content hash). `pnpm models:build -- sink.core.l1`
rebuilds one. No Blender: the bake runs in Node (meshoptimizer, watlas, three-mesh-bvh, sharp).

- **Why a bake.** Meshy's texture atlas is cut into hundreds of small islands. Simplifying the
  textured mesh either stalls at 7-18k triangles (the seams hold it) or smears colour across the
  seams (tried: blotchy walls, broken tanks). So the tool simplifies the *shape* alone (about
  3,000 triangles; 1,600 for the turret base, which repeats along walls), unwraps it into a fresh
  atlas, fills each texel from the nearest point on the original's texture, and pads the edges.
  Output: positions, UVs and one 1024 px WebP base colour, quantized, about 200-240 KB per model.
  No normal or metal/roughness maps: three flat-shades it (no normals in the file), matching the
  code models' faceted look.
- **Fit.** `yaw` turns the model so its working side faces +z (the core's hopper and each
  converter's input toward the deposit side), `width` scales its widest ground side to art
  metres, and the pivot goes to the ground centre. `render-3d/test/footprints.test.ts` keeps every
  fitted model inside its generator footprint.
- **Runtime** (`render-3d/src/assets/meshy.ts`). The renderer builds the code model as always and
  fetches the GLBs in the background (`models/<file>.glb?v=<hash>`, cache-first in the service
  worker). As each lands, placed copies are rebuilt without the pop: the meshes named in `replace`
  give way to the GLB, animated parts (core orb, flame and spin ring, converter fan and status
  light, turret head, kiosk lamp) move to `parts`, anchors to `anchors`. On a failed load the code
  model stays. Converter pickup trays and operator plates stay code-built.
- **Blueprints.** The build also writes `<file>.outline.glb`: the same shape at about 250
  triangles, positions only (~4 KB). Build-pad blueprints draw it in the cyan ghost material, so
  each outline matches its building without any hand-editing.
- **Checking a model.** Dev page (from `packages/render-3d`:
  `node ../client/node_modules/vite/bin/vite.js dev --config dev/vite.config.ts`, port 5190):
  `fit.html?i=<n>&code=0` shows entry n at the game angle with anchors (cyan) and parts (axes);
  `&quad=1` four sides, `&top=1` a plan view, `&span=<m>` zoom; clicking prints a point in model
  coordinates. In a level: `?pack=s1-L014&full=1&stage=build` builds every pad; `&meshy=0` shows the
  code models for a budget comparison.
- **Budget.** In s1-L014 with everything built, 59k triangles and 48 draw calls (code models:
  57k, 52). Crowded levels were already near 60k with the code models; the GLBs add about 1-2k.

**Adding the next batch:** drop the GLBs in `Asset workflow/3D Models/` (Gemini image in
`Solo Mock Ups/`) and ask Claude to bring them in. Claude adds one entry per model to `meshy.json`
(file, src, id, level if per level, yaw, width, replace, parts, anchors), runs the build, checks it
on the fit page and in a level, and commits the small GLBs. Raw downloads never go in the repo.

| First batch | Id | Yaw | Notes |
|---|---|---|---|
| Heat Core 1/2/3 | `sink.core` L1/L2/L3 | 0 / 90 / -90 | Hopper to the front; plasma orb and flame in the well; L2+ spin ring over the rim |
| Trade Kiosk | `sink.sales_point` | 0 | Glass front to +z, airlock to the queue side (+x); shelf crates in front of the glass |
| Smelter | `conv.material_processor` | 90 | Glowing mouth to the front, ore hopper (deposit) on the pickup side |
| Galley | `conv.food_processor` | 180 | Hoppers to the front |
| Parts works | `conv.alloy_works` | 0 | Machining bay to the front |
| Turret Base | `struct.ranged_defense` (all tiers) | 0 | Code-built head turns on top; wall towers keep their plinth |

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

All four trader types come from **one** rigged trader: the hurried trader plays the check-watch clip and walks faster, the VIP carries the gold briefcase (one per hand) and the bulk trader pushes the hover cart. The game picks the clip and attaches the prop per type, so each still reads by silhouette.

| File name | Asset | Prompt |
|---|---|---|
| `unit.customer` | Trader (all four trader types) | The Trader from the sheet: worn khaki-grey EVA suit, clear bubble helmet, backpack, a wrist display on the left forearm. Empty hands, A-pose. **Animate:** a walk, an idle, and a "check watch" clip (search the library for "watch" or "impatient"; if none fits, Text to Motion: "glances at wristwatch impatiently while waiting"). One file with all clips. |
| `prop.briefcase_gold` | VIP trader's case | One hard-shell briefcase, brushed gold metal with dark handle and clasps. Small prop. **Smart Topology, about 400 polygons.** |
| `prop.hover_cart` | Bulk trader's cart | The bulk trader's hover cart from the sheet **without the trader**: a flat steel cart on four small hover pads, a push handle at the back, strapped crates on top. Remesh to 10K like the buildings. |
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

## Priority B: held props (sheets: `Settlers.jpeg`, `Non settler characters.jpeg`)

Characters are generated empty-handed (held objects break rigging), so what they hold is a
separate small prop the game attaches to the hand bone. One object per image, nothing holding it,
laid out at the usual three-quarter view. Same Meshy settings as the carried items (Smart Topology
if it comes out coloured, else High Detail + Texture). Game size is about 600 triangles (shield
and minigun about 1,000). Same style block and rules.

| File name | Held by | Prompt |
|---|---|---|
| `prop.rifle_raider` | Raider | The raider's rifle from the sheet: a black tactical assault rifle with a short stock, top rail and a long magazine. Worn matte black. |
| `prop.minigun` | Boss raider | The boss raider's rotary minigun from the sheet: six barrels in a cylinder, a heavy box receiver, a top carry handle and an ammunition feed on the side. Gunmetal, worn. |
| `prop.rifle_guard` | Guard | The guard's rifle from the sheet: a compact gunmetal-grey carbine with a short barrel and a red sight. |
| `prop.shield_guard` | Guard | The guard's riot shield from the sheet: a tall rectangular steel shield with angled armour plates, a small viewing slot near the top and a red stripe. Front face visible. |
| `prop.pickaxe` | Hauler | A heavy mining pickaxe: steel head, dark worn wooden handle with a taped grip. |
| `prop.wrench` | Technician | A large adjustable steel wrench, about the length of a forearm, worn grip. |
| `prop.medkit` | Medic | A white hard-shell medical case with a red cross on the side and a top handle. |
| `prop.scanner` | Clerk | A handheld rugged scanner tablet: grey case with a small glowing cyan screen and a grip handle. |
| `prop.rifle_ranger` | Ranger | A long hunting stun rifle: olive-grey, long barrel, scope, padded stock. |

## Priority C: carried items (sheet: `Items.jpeg`)

Singles only: the game builds back stacks, shelf stock and ground piles by repeating the single
item, so the sheet's "stack" art is not needed. Meshy settings: see step 2 above (Smart Topology
only if it comes out coloured). Items are drawn many times at once, so each is cut to about
200–500 triangles in cleanup: generate them simple and chunky, with a strong silhouette;
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

About 70 images. Order: Priority A buildings, A structures, A characters, then B (with the held
props, about 45 credits), then C (items, about 225 credits). If credits run short, drop in this order: `role.server`, `role.hunter`,
`role.cashier` (they fall back to the colonist model with code-built headgear), then the items
(code-built ones stay), then the B nodes and props.
