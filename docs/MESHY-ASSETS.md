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
- **Checking a model.** `fit.html`: `&ly=<m>` sets the look height for small props. Dev page (from `packages/render-3d`:
  `node ../client/node_modules/vite/bin/vite.js dev --config dev/vite.config.ts`, port 5190):
  `fit.html?i=<n>&code=0` shows entry n at the game angle with anchors (cyan) and parts (axes);
  `&quad=1` four sides, `&top=1` a plan view, `&span=<m>` zoom; clicking prints a point in model
  coordinates. In a level: `?pack=s1-L014&full=1&stage=build` builds every pad; `&meshy=0` shows the
  code models for a budget comparison.
- **Budget.** In s1-L014 with everything built, 59k triangles and 48 draw calls (code models:
  57k, 52). Crowded levels were already near 60k with the code models; the GLBs add about 1-2k.
  Batch 2, golden level 4 `?level=4&full=1&stage=walls&ff=300` with towers, med bay, barracks and
  guards built: 64k triangles and 70 draw calls (code models 57.9k, 72). Batch 2 adds about 1.6k
  of that (doors, wall tiles, prop LODs); the rest is batch 1's core (3,000 vs 1,100 code) and
  two turret bases (1,600 each), which a lower `tris` and a rebuild would bring back under 60k.

**Adding the next batch:** drop the GLBs in `Asset workflow/3D Models/` (Gemini image in
`Solo Mock Ups/`) and ask Claude to bring them in. Claude adds one entry per model to `meshy.json`
(file, src, id, level if per level, yaw, width, replace, parts, anchors), runs the build, checks it
on the fit page and in a level, and commits the small GLBs. Raw downloads never go in the repo.

| First batch | Id | Yaw | Notes |
|---|---|---|---|
| Reactor Core 1/2/3 (batch 4; was Heat Core) | `sink.core` L1/L2/L3 | 0 / -90 / 90 | Hopper to the front; plasma orb and flame in the well; L2+ spin ring over the rim |
| Trade Kiosk | `sink.sales_point` | 0 | Glass front to +z, airlock to the queue side (+x); shelf crates in front of the glass |
| Smelter | `conv.material_processor` | 90 | Glowing mouth to the front, ore hopper (deposit) on the pickup side |
| Galley | `conv.food_processor` | 180 | Hoppers to the front |
| Parts works | `conv.alloy_works` | 0 | Machining bay to the front |
| Turret Base | `struct.ranged_defense` (all tiers) | 0 | Head turns on top (GLB heads since batch 2); wall towers keep their plinth |

**Second batch (2026-10-18).** Same bake, plus three runtime shapes: `slot` entries swap named
meshes in place so the renderer keeps animating them (gate doors, turret head), `batch` entries
are instanced wall sections, `kind: "prop"` entries fill the code-built characters' tool slots.
Triangle targets are lower than batch 1 because these repeat (walls, doors, heads, props).

| Second batch | Id | Tris | Notes |
|---|---|---|---|
| Gate frame | `struct.gate` (`replace: frame`) | 650 | 2.7 m; the renderer still stretches it along x to the gate section |
| Gate door | `struct.gate` (`slot: doorL`, `replace: doorR`) | 250 | One door fills the whole opening (Doug's airlock concept); it sinks into the ground to open. A slot entry's `replace` drops parts it makes redundant, `parts` keyed by the slot name moves the part itself |
| Hab Pod | `struct.housing` | 1,300 | Door and ramp to +z; nudged 4 cm back to sit inside the footprint |
| Med Bay | `struct.medical` | 1,400 | 1.75 m, shifted 12 cm left so the heal spot (+0.93 m) is outside the wall |
| Warehouse | `struct.depot` | 1,400 | Open-roof bin, low front lip to +z; 2.1 m (near square, so narrower than the code bin); deposit/pickup moved to z 1.15. `store.depot` stays code-built |
| Wall 1 / Wall 2 | `struct.barrier` / reinforced (`batch`) | 160 / 220 | 1.3 m / 1.5 m tall (taller than a colonist; Doug 2026-10-18, wall-tower plinths raised to 1.6 m), native proportions; each section lays whole tiles end to end. Below half hp the same tile is cut to a jagged top and darkened (generated at load) |
| Turret Top 1/2 | head, `struct.ranged_defense` L1 / `.t2` | 450 / 600 | Yaw 90 / 11 so barrels face +z (Top 2 measured off the mesh: ring centre on the pivot, barrel tip at +z); offset so the turret ring sits on the base axis; muzzle flash moved to the barrel tips |
| Turret Top 3 | head, L3 | 600 | Built, `unwired` (no t3 in content yet): drop the flag when a t3 exists |

Held props (`prop.*`, Smart Topology originals ~4k tris): each is baked twice, a game-size
`<file>.glb` (~600 tris; shield and minigun ~1,000, cart 1,500) kept for the rigged Meshy
characters, and a `<file>.lod.glb` (80-300 tris) that the code-built crowd draws now (budget:
a whole crowd holding 600-tri props cost ~5k triangles in level 4). `tools` in `meshy.json`
maps each prop to the character tool slot it fills and records its **hand-attach transform**
`[x, y, z, rx, ry, rz, scale]` (art metres, degrees) from the code rig's hand frame (hand at the
end of the arm, +z forward, +y up the arm); reuse it for the hand bones in the character pass.

| Prop | Slot (characters.ts) | Held by | Hand transform |
|---|---|---|---|
| Guard Gun | `tool.rifle_guard` (right) | `role.defender` | [0, -0.13, 0.08, 0, 90, 0, 0.8] |
| Guard Shield | `tool.shield_l` (left) | `role.defender` | [0, -0.25, 0.1, 0, 0, 0, 0.75] |
| Hauler Pickaxe | `tool.pick` | `role.supplier` | [0, -0.12, 0.04, 30, 0, 0, 0.9] |
| Technician Wrench | `tool.wrench` | `role.operator` | [0, -0.12, 0.04, 0, 0, -90] |
| Raider Gun | `tool.rifle_raider` | `hostile.raider_humanoid` | [0, -0.11, 0.08, 0, 90, 0, 0.85] |
| Raider Boss Gun | `tool.minigun` | `hostile.boss` | [0, -0.12, 0.1, 0, -90, 0, 0.75] |
| Trader Cart | `tool.cart` (pushed, body frame) | `unit.customer_bulk` | [0, 0.08, 0.62, 0, 90, 0, 0.8] |
| VIP Briefcase | `tool.briefcase` (one hand) | `unit.customer_premium` | [0, -0.47, 0, 0, 90, 0, 1.6] |

The VIP briefcase came out of Meshy brown: the build recolours it (`tint: "gold"`): texel
brightness picks a shade between deep bronze, #c9a24a and a pale highlight with faint horizontal
brushing, near-black texels (handle, clasps) stay dark, and the material gets metalness 0.55 /
roughness 0.38. `decal` stamps "VIP" on both broad faces: letters drawn as SVG paths (no font
or Blender needed) and projected in object space onto the texels of the faces facing ±z, mirrored
on the far side so both read left to right. Until a prop lands (or if it fails) the code tool stays: raiders keep the club,
the guard gets a small code carbine and a left-hand shield; the VIP case and cart have no code
version. `fit.html?crowd=1` shows these characters posed through the crowd batches with their props.

**Characters (rigged), first test 2026-10-18: the trader.** `unit.customer` and its three
variants now come from one rigged Meshy file; every other character is still code-built. What
worked, so the rest can follow the same path:

1. Meshy: High Detail + Texture, A-Pose, then **Remesh** (Fixed, 10K, Triangle) and **Animate**
   (auto-rig, humanoid). The trader's clips: `Walking`, `Running`, `Listening_Gesture` (idle),
   `Cheer_with_Both_Hands_Up`, and a check-watch clip from Text to Motion, which Meshy names with
   a UUID (`01a14d31-...`; 3 s, raises the wrist display to the face). Download one GLB with all
   clips (the trader: 26 MB, 10.4K tris, 70-joint Mixamo skeleton, 2K/4K PNG maps).
2. `meshy.json` entry with `kind: "character"`, `tris`, `texture`, `height` (art metres) and
   `clips` mapping the game's states to clip names: `walk`, `run` (hurried variant moving),
   `idle` (queued), `wait` (hurried variant queued), `cheer` (on its sale, while standing).
3. `pnpm models:build -- unit.customer`: the same shape-only bake in bind-pose space, keeping each
   kept vertex's skin weights (cut to the four strongest joints); skeleton, bind matrices and
   clips stay, keyframes resampled, maps replaced by one 512 px WebP. The trader: **1,000
   triangles, 607 KB** (376 KB of it clips). 1,000 matches a code-built figure (~900): at 2,000,
   a queue of 8 cost 13k more triangles than the code traders.
4. Runtime (`render-3d/src/scene/rigged.ts`): skinned meshes cannot join the crowd's instanced
   batches, so each visible character is a SkeletonUtils clone (geometry and material shared)
   with its own AnimationMixer, pooled by entity id (queue moves keep the clip) and crossfaded
   0.25 s between clips. One draw call per character. Until the file loads, or if it fails, the
   code-built figure stays.
5. Props (`held` in the entry, per variant): on a bone (`mixamorig:RightHand` etc., transform
   `[x, y, z, rx, ry, rz, scale]` in the bone's frame, model metres) or pushed (`grip`: after the
   clip poses the arms, upper arm and forearm turn to point at the handle, both hands). The VIP
   carries one gold case at briefcase size (`[0, 0.5, 0, 180, 0, 0, 1.6]`, about 0.5 m wide:
   the hand bone's +y runs down the fingers), the bulk trader pushes the hover cart (`[0, 0.08, 0.95, 0, 90, 0, 1.3]`, grip
   `[0, 1.0, 0.3]` ± 0.18). A bulk trader that was served wheels its order away on the cart deck
   (renderer `cartLoad`, both the rigged and the code-built figure).

Budget, golden level 4 with a queue of 8 traders (two of each variant): 61.0k triangles and 65
draw calls, against 61.3k and 60 with code traders. `fit.html?rig=1` shows every variant and clip
state (`&k=<n>` one of them). Mixed with the chibi code-built figures, the realistic trader looks
taller and thinner; that settles once the other characters are rigged the same way.

**Third batch (2026-10-18): every character rigged.** Hero, hauler, guard, medic, courier,
colonist, clerk, runner, ranger, raider and boss come from rigged Meshy files (about 1,000
triangles each); the technician stays code-built until its file arrives. The dust crawler and the
mite (seven legs) are rigged without clips: `rigged.ts` finds legs (chains reaching the ground,
each starting under a branching joint) and walks them in an alternating gait. What the runtime adds:

- **Idle from the walk.** Files without an idle get one: each bone at its average over the walk
  cycle, plus a slow breath in the chest.
- **Actions** (`clips` keys beyond walk/run/idle): gathering picks by node type (`mine` ore,
  `reap` grow dome, `pick` fuel cache; both ore nodes `mine` since batch 4 made the small one a crystal rock), from the sim's `gathered` events; `shoot`
  (standing) and `shootMove` from the hero's shots and from hits by guards and hunters; raiders
  shoot while at a barrier or the base. A standing character turns to face what it works on.
  Clip names: `01a14f4e…` is the bent-over dig, `01a14f15…` the rifle-ready stance.
- **Props placed from the clips.** A held prop with `align` is fitted once per file from a
  two-handed clip of that character (gun: barrel from the right hand through the left in
  `Run_and_Shoot`; tool: handle from the left hand through the right in `Heavy_Hammer_Swing` or
  the dig), then rides the right hand in every clip. `when` shows it only during those actions
  (the hero swaps pickaxe, shovel and the guard's gun by task; the hammer swing is for ore only, crops use the kneel-and-pick clip, so the scythe prop is built but unused). Without `axis` the tool's
  long axis and head end are read off its mesh (the diagonal shovel).
- **Guard shield arm.** `shieldArm` braces the left arm across the chest over every clip (the
  clips are two-handed rifle clips); the shield rides the chest in front of the forearm.
- **Runner carry.** With a `carry` clip the goods are held in front of the chest, not on the back.
- Frozen residents and those lying in the med bay keep the code figure (it has those poses).

Also: `res.material_basic` (`kind: "item"`) replaces the code ore in every stack and shelf;
`kind: "decor"` entries (the flat scrap field) are scattered in the band just outside the map edge.
The medic carries `prop.medkit` in the right hand (its download is named `Ore Scrap 1 decor.glb`).
`fit.html?rig=<id>` shows a character in each state (`&k=<n>` one; pass `&w=&h=` in the browser
pane), `fit.html?clips=<file>` every clip in a row (`&ck=<n>` one clip at five moments).
Golden level 4 with guards and haulers working: 64k triangles, 50 draw calls (was 70).

**Fourth batch (2026-10-19): reactor redo, scatter, items.** New reactor files for all three
levels (`Reactor Core 1/2/3.glb` replace `Heat Core`; L2 and L3 turned 180° so the hopper faces
+z). The orb, flame and spin ring are placed from each mesh: the well centre is the largest empty
circle among the vertices above 70% of the height, the ring sits 0.18 m over the rim, the orb 0.22 m
under it (L1 [-0.1, 0.7, -0.12], L2 [-0.03, 1.0, -0.04], L3 [-0.06, 0.91, -0.05]).

| Fourth batch | Id | Tris | Notes |
|---|---|---|---|
| Guard Post | `struct.barracks` | 1,400 | 1.6 m, road barriers to +z |
| Grow Dome | `node.food_source` | 1,600 | Open planter (no glass): drops the code glass and lamp |
| Stasis Pod / Cargo Crate | `capture.recruit_container` / `.supply_crate` | 900 / 600 | Whole model; the code lid is dropped, so release shows only the shake. No footprint test (towed) |
| Rockslide | `zone.blocked` (`batch: "rubble"`) | 500 | Squared to the 1 x 1 m tile the renderer stretches over the zone |
| Items | `res.*` (`kind: "item"`) | 200-300 | Alloy, fuel cell, greens, protein, meal, coin (`tint: "gold"`), scrap bale (800: at 300 its 7.7M-tri source collapsed to a wedge). Stacks use each model's own height |
| Protein Ground | `res.food_raw_2` (`ground: true`) | 250 | The steak a hunted hopper drops; the wrapped pack stays the carried unit |
| Crystalline Ore Pile 1 / 2 | `node.material_source` / `node.fuel_scrap` | 900 / 400 | Wide sandy heap is the ore pile (2.0 m), the single crystal rock the small ore node (0.95 m). A GLB pile has no draw-range steps, so it squashes down (height 35-100%) as its stock runs out |
| Ship Scrap 1 / 2 | `decor.ship_scrap` / `decor.ship_wreck` | 350 / 500 | Border dressing. Decor kinds now share one border's worth of copies (bigger pieces fewer) |

Golden level 4 at tick ~850: 58.0k triangles, 42 draw calls (55.5k before this batch; code
models 49.7k). Still code-built: the fuel cell cache (`node.fuel_deposit`, no GLB yet), the habitat hub,
the parts item.

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

## Priority B: conveyor kit (sheet: `Miscellaneous structures.jpeg`)

Belts are built from repeatable pieces like the wall: the game tiles the straight segment along the
belt, puts a drive end at each end and a corner at a bend. The belt surface and the goods riding it
stay code-drawn (the surface scrolls), so every piece is the **frame only, with the belt bed empty
and flat**. Remesh to 10K like the buildings. Same style block and rules.

| File name | Asset | Prompt |
|---|---|---|
| `struct.conveyor.segment` | Straight segment | One straight section of industrial conveyor frame from the sheet: dark steel side rails with rollers between them, four angled legs, a flat empty belt bed, about three times as long as it is wide. **Both ends open and cut square** so identical sections join seamlessly end to end. No goods on it. |
| `struct.conveyor.drive` | Drive end | The drive end of the same conveyor: a short frame section ending in a chunky motor housing with a large exposed gear on the side, as on the sheet. The open end is cut square to join a straight section. No goods on it. |
| `struct.conveyor.corner` | 90° corner | A 90-degree corner piece of the same conveyor frame: a square section with curved rails and rollers turning the belt bed a quarter turn. Both open ends cut square to join straight sections. No goods on it. |

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

One item per resource, **made to stack**: the game builds back stacks, shelf stock and ground
piles by repeating this one item on top of itself, so every item is a compact unit with a **flat
bottom and a flat top**, about **twice as wide as it is tall** (brick-like), with nothing sticking
up above its top face. All nine should be roughly the same footprint so mixed stacks look tidy. The
designs follow the stack art on the Items sheet (crates, strapped bundles, ration boxes). Meshy
settings: see step 2 above. Items are drawn many times at once, so each is cut to about 200–500
triangles in cleanup: chunky shapes, strong silhouette, no fine print or stamped text.

Add this line to every item prompt: *"A single stackable unit: flat bottom, flat top, nothing
sticking up above the top face, about twice as wide as it is tall."*

| File name | Asset | Prompt |
|---|---|---|
| `res.material_basic` | Crystalline ore | One block of crystalline ore: pale blue crystal cut into a rough rectangular slab, its sides showing jagged crystal facets, held by two dark steel straps. Flat top and bottom faces. |
| `res.material_refined` | Alloy | One ingot of shiny alloy: a brushed silver trapezoid bar with bevelled edges, lying flat. |
| `res.fuel_dense` | Fuel cell | One fuel cell from the sheet lying on its side in a low steel cradle: a steel canister with four windows glowing orange-red and chunky end rings; the cradle gives it a flat base and the canister top is level with the cradle rails. |
| `res.food_raw_1` | Greens | One shallow wooden crop crate filled with leafy green crops, the leaves trimmed level with the crate's rim. Like one crate from the sheet's crate stack. |
| `res.food_raw_2` | Protein | One vacuum-wrapped protein block: a pale grey-silver plastic-wrapped brick with crimped ends and one strap around the middle, lying flat. |
| `res.food_prepared` | Meal | One sealed ration box: an olive-drab hard plastic box with a flat lid and rounded corners, like one box from the sheet's meal stack. |
| `res.salvage` | Scrap | One compacted scrap bale: rusty bent metal crushed into a rough rectangular block, two steel bands around it, a few short torn edges on the sides only. |
| `res.currency` | Credits | One short stack of three thick hexagonal gold credit coins with a raised ring emblem, neatly aligned. |
| `res.component` | Parts | One machined parts block: a compact steel housing with a gear set into its side and bolted end plates, like one unit from the sheet's parts rack. |

## Not sent to Meshy

Kept code-built, because they are flat or animated in ways a single model cannot do: pads and
rings, the moving belt surface (the conveyor frame is the kit above), the hopper flats ground patch, the reactor glow, and all effects. They
follow the concept look through the palette and the shader.

## Priority and credit budget

About 70 images. Order: Priority A buildings, A structures, A characters, then B (with the held
props, about 45 credits), then C (items, about 225 credits). If credits run short, drop in this order: `role.server`, `role.hunter`,
`role.cashier` (they fall back to the colonist model with code-built headgear), then the items
(code-built ones stay), then the B nodes and props.
