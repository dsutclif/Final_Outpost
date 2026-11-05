# Hand-off: object and decor sizes (Doug, 2026-11-04)

**Merged and live on main (859fd14), 2026-11-05.** Only step 1 (story levels 1-5) and step 3 (gate check) are left.

## Done on the branch
- **New sizes:** meshy.json widths from Doug's Sandbox **Buildings row** settings. `node.fuel_scrap` is unchanged (Doug: ignore it).

  | Model | Width |
  |---|---|
  | `struct.gate` | 4.05 |
  | recruit_container and decoy | 1.859 |
  | supply_crate | 1.011 |
  | `decor.ship_scrap` (salvage L1, plus decor) | 9.9 |
  | `decor.scrap_field` (salvage L2, plus decor) | 2.736 |
  | `node.salvage_pile.l3` | 5.6 |
  | lieutenant_helmet | 0.448 |
  | `node.material_source` (ore pile, plus `decor.ore_pile`) | 2.28 |
  | `zone.prey.l1` | 2.032 |
  | `zone.prey.l2` | 2.48 |
  | `node.fuel_deposit` | 1.26 |

- **Rebuilt sharper:** every model above was rebuilt from the Meshy originals with `pnpm models:build -- <files>`. Textures: 2048 px for anything grown 3× or more (ship scrap), 1024 px for 1.25× or more. Doug asked for max resolution; 2048 everywhere would blow the iPhone's graphics memory.
- **Map space:** generator.json footprints now cover the bigger models. Salvage pile: [-139,-117,139,117]. Ore pile y1: 32. The render-3d, generator and content tests pass.
- **Decor matches playable:** the decor scrap and ore piles share their model files with the interactive salvage and ore piles, so they now match at the model level. The live sandbox was showing the old models.

## Left to do
1. **Story levels 1-5** (`levels/story/story-L00{1..5}.json`) place 2 × `decor.ship_scrap` (scale 0.741), 3 × `decor.ore_pile` and 5 pods + glass with per-entity `scale`. Doug wants decor scrap to match playable scrap: set those scales to 1, or fold them into the crash-site re-layout. The re-layout is in docs/handoff/films-scenes.md step 2 and docs/SCALE.md: ship 27 m, decor pods 2.66 m long × 1.44 m tall, base 0.80 m in the sand; glass in proportion. Then run `pnpm levels:check --pack levels/story`. Level 1 is normally the other account's file; Doug asked for L1-5 to be updated.
2. **Done 2026-11-05:** pack s1 rebuilt with the new footprints, levels:check 59/59 clean, live at 859fd14. A later size change needs another regen.
3. **Check the gate** in a level: it is now 4.05 m wide, up from 2.7 m, and may not meet the wall sections.
4. **Doug answered yes to both (2026-11-04):** crystal scrap now matches the fuel scrap (0.95 m, rebuilt on the branch), and the 9.9 m ship scrap is intended.
5. **Buildings:** their sizes are unchanged (look.json `modelScale` matches Doug's settings).

## Traps
- Two meshy.json entries share each scrap file (decor + salvage). Keep both widths equal.
- Use SSH for git; https is blocked.
