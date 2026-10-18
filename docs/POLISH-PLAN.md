# Polish plan (art direction rounds, from 2026-10-17)

Running list of the look-and-feel work agreed with Doug. ART-DIRECTION.md is the target;
DECISIONS.md records what shipped (9l, 9m). Tick items here as they land.

## Done

- [x] Phase 1 look pass: palette, lighting, surface wear, concrete slabs, gunmetal HUD (9l)
- [x] Vibe camera: 30° / 45° near-flat isometric, joystick turned with it (9m)
- [x] World label contrast under the dark HUD theme (9m)

## In progress (Doug)

- [ ] Gemini images → Meshy models for the assets in MESHY-ASSETS.md

## Next: models in the game (fresh session; brief = MESHY-ASSETS.md + ART-DIRECTION.md + this file)

1. [x] GLB loader, phone cleanup, fit to footprint, code model as fallback (2026-10-17, first
   batch of 8: cores L1-L3, kiosk, smelter, galley, parts works, turret base). Built as
   `pnpm models:build`, a Node bake with no Blender; see MESHY-ASSETS.md "Bringing models into the game".
   Second batch 2026-10-18: gate (frame + mirrored doors), hab pod, med bay, warehouse, walls 1/2
   (tiled instanced sections with a generated cracked state), turret heads L1/L2 (L3 built, unwired),
   and eight held props on the code-built characters (crowd LODs; game-size files and hand
   transforms kept for the rigged characters; gold-recoloured VIP case). Open: level 4 with
   everything built is 64k triangles, over the 60k budget because of batch 1's core and turret
   base triangle counts; Rigged characters: the trader (all four customer types, clips, gold cases, pushed cart) proved
   the path on 2026-10-18 (MESHY-ASSETS.md "Characters"); the other characters still need Remesh + Animate.
2. Lighting and soft corner shadowing in each model's texture, a soft contact shadow under each
   building. (Meshy's albedo already carries some; the Node bake copies colour only, so an AO
   pass would be added to tools/build-models.ts rather than Blender.)
3. Static shadows rendered once per level (redrawn when something is built); characters keep
   blob shadows.
4. Cheap glow pass on hot and lit parts (reactor, furnace, fuel cells) and a final colour grade.
5. Hidden-unit outlines: characters and pads behind tall buildings show as a silhouette.

## Polish items (Doug, 2026-10-17)

- [ ] **Actions animated.** Gathering, depositing, machines processing: visible work, not
      just items appearing. Converters show input going in, the machine working, output coming out.
- [ ] **Upgrades that mean something.** Upgraded buildings follow Doug's mock-ups
      (`Upgraded stuctures.jpeg`, already in the MESHY-ASSETS.md Lv2/Lv3 prompts); no
      further upgrade design for now.
- [ ] **Specific pad icons.** Each pad shows what it is for: a register on the clerk/cashier
      pad, a pickaxe on a collector's hire pad, the machine's silhouette on its operator pad.

## After the new models are in: one combined regeneration

Doug, 2026-10-17: hold every change that needs a full level regeneration until the 3D models
are done, since the models may force one anyway. Then do these together under one engine bump.

- [ ] **The level ends on its slowest goal** (Doug, 2026-10-18). Today the level ends the moment
      objective 0 (the main goal) is done and every star objective still open fails
      (`sim/systems/goals.ts` checkEnd, `objectives.ts` settleObjectives): opening a second
      greenhouse before serving the 20th customer costs a star. End instead when every objective
      is done or can no longer be done (fails and the timer still end it early). Rules change:
      engine bump, bots and rater (levels get longer), re-pin golden levels and the pack.
- [ ] **Traders walk real paths** (Doug, 2026-10-18). Customers move in straight lines through
      walls and buildings (`sim/systems/sales.ts`). Route arrivals and departures around
      structures, through a gate; the generator always puts a gate in the wall section nearest the
      kiosk. Rules change (sim movement) plus generator change.

- [ ] **No pads the level does not need.** Pads and conveyor build spaces still appear for
      things the level can be completed without. Generator: only place pads that serve the
      goal or a star objective (or are an intended optional choice, marked as such).
- [ ] **Manual warehouse use.** The player has no way to take goods out of the warehouse.
      Each warehouse gets one drop-off pad (anything the player carries goes in) and one
      pickup pad per stored resource. This is a rules change: content, sim, bots, rater,
      engine bump and pack regeneration (CLAUDE.md rule 5).
- [ ] Footprints refitted to the new models, if they differ from today's.
- [ ] **Layout shaped for the phone under the turned camera.** The map is a tall rectangle,
      but the 45° camera shows it as a diamond, so a lot of each screen is empty ground past
      the map's corners. Lay out bases so their spread fits a portrait screen as the camera
      sees it: long along the screen's vertical (the map's diagonal), narrow across it.
      Options to weigh: generate on a diamond-shaped region, rotate the generator's layout
      45°, or keep the rectangle and cluster the base along the diagonal.
- [ ] Denser, connected bases like the vibe image: tighter spacing, pipes and concrete joining
      buildings, less open sand inside the walls.
