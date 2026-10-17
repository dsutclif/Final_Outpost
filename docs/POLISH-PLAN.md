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

1. GLB loader, phone cleanup (decimate, texture size), fit each model to its footprint, keep
   the code-built model as the fallback.
2. Blender bake: lighting and soft corner shadowing baked into each model's texture, a soft
   contact shadow under each building.
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
