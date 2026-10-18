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

Done together as engine/content 0.10.0 on 2026-10-18 (DECISIONS.md 9o).

- [x] **The level ends on its slowest goal** (Doug, 2026-10-18). Once the main goal is done the
      level runs on until every star is done or can no longer be done, for at most
      `level.overtimeSeconds` (90); a fail, a pile collapse or the timer after the main goal ends
      it as a win with the open stars lost. Bots play the overtime; time stars and the budget are
      sized from the main goal's tick (`goalTicks`).
- [x] **Traders walk real paths** (Doug, 2026-10-18). The generator writes a route on the kiosk
      (`route`: map edge → back of the line, around every building footprint and blocked ground,
      through a gate's door); the sim walks it in at `customers.walkSpeed` and back out. A ring
      always has a gate in the section nearest the kiosk, and the whole line stands inside it.
- [x] **No pads the level does not need.** After the stars are settled the generator drops each
      optional pad (hires, machine levels, belts, upgrades) the good bot can win and earn as many
      stars without, then re-rates the trimmed level and keeps it if it still passes.
- [x] **Manual warehouse use.** A drop-off pad (anything carried goes in) and a pickup pad per
      stored resource (up to three, in order of arrival), used while standing still on them;
      content offsets, sim, bot (takes stock off the pad when nearer, except where the stock is
      the goal or couriers move it), rater `depotPicks`, generator reserves the pads' ground.
- [x] Footprints: today's generator footprints kept; every Meshy model fits them
      (`render-3d/test/footprints.test.ts`).
- [x] **Layout shaped for the phone under the turned camera.** Doug: keep the straight square
      wall rings (on screen they already read as diagonals), walls need not fit the screen. The
      base is pulled tighter to the core (`corePull` 0.6) inside the lots below; the level-start
      overview already frames the base.
- [x] **Denser, connected bases: lots and streets** (Doug picked 7B). Streets 40 wide cross at
      the core and repeat every 200; buildings go in a 160-unit lot whenever any valid spot is in
      one (`generator.json` `lots`), flat pads and gatherables may use the streets; positions
      snap to 10. The 3D renderer paves every lot in use with its streets and runs pipes along
      them (`lots.block` / `lots.street` params).
