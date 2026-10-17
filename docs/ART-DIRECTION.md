# Art direction

The gameplay feedback follows the survival-builder playable ads (Whiteout Survival, Kingshot,
Township-style "feed the fire / stock the stall" mini-games). The **look** follows Doug's concept
sheets (2026-10-17, kept outside the repo in `Asset concepts/`): a brutalist, near-realistic
frontier outpost of poured concrete and steel on pale dust, low saturation. Where a sheet and
the "General Vibe" image disagree, the vibe image wins. This file is the reference board in
words; it governs both renderers and every skin.

## The ad look, decomposed

| Element | What the ads do | Our rule |
|---|---|---|
| Camera | Tilted top-down, about 50° from horizontal, slight perspective, portrait frame, follows the hero with lag | 3D: fixed 50° pitch, FOV ~40°, eased follow. 2D: straight top-down, eased follow |
| Geometry | Chunky, readable silhouettes; no thin parts | ≤ 8k tris per character, ≤ 5k per hero building. Concept look: chamfered blocky modules, ribbed tubes, framed domes, pipes and vents |
| Shading | Soft PBR, one low key light, long shadows, filmic tone mapping | ACES filmic, exposure 1.35; low sun from the left; low ambient. Procedural wear in the shader (`materials.ts addWear`): concrete grain, blotches, streaks on vertical faces, contact darkening; poured-panel seams on hero structures. Blob shadows under every unit |
| Colour | Low saturation: concrete greys, pale dust, steel; colour only where it means something | Palette tokens per skin: ground, structure, accent, interactive, danger, one per resource. Interactive-on-ground luminance contrast ≥ 3:1 on the palette; `look3d.saturation` and `look3d.groundLift` mute and pale the scene on screen without touching the checked palette |
| Ground | Poured concrete aprons and paths over dust | Square slabs on a 40-unit grid under every building site, paved back to the core (`Environment.buildSlabs`); sand shows in the joints |
| Scale | Hero slightly oversized head/hands; buildings 2–3× hero height; resources are big chunky icons | Hero 1.0 unit tall; items 0.35 units; buildings 2–3 units |
| Hero feedback | Items stack on the back and wobble; back stack grows visibly; speed unchanged | Back stack of carried items, per-type colour, sine wobble on move |
| Economy feedback | Coins fly in an arc to the HUD counter; "+N" floaters; counters tick up | Every sale: coin sprites arc to the HUD chip; counter tweens |
| Build feedback | Pads fill like a progress bar as coins pour in; building pops in with squash-and-stretch and a dust ring | Pad fill ratio drawn; pop-in scale 0 → 1.15 → 1.0 over 400 ms |
| Urgency | The fire/warmth meter drains visibly; the hero shivers; vignette tints blue; a banner counts down | Lifeline meter always visible; distress overlay by skin; hazard banner with countdown |
| Threat | Enemies arrive in a visible wave, walls crack, towers flash when shooting | Hit flash + knockback on hostiles, crack decal on damaged sections, muzzle flash on turrets |
| Crowd | Lots of small busy workers with distinct hats/tools; customers in a tidy queue | Role silhouettes differ in headgear and held tool, not just colour |
| Typography | Condensed industrial, uppercase for headings and buttons; numbers huge | Barlow Condensed (display, bundled via @fontsource) and Barlow (body); outline stroke on world-space text |
| UI chrome | Gunmetal plates, square corners, hazard stripes | Dark panels with a lit top edge and hard base (`--plate`), 2–6 px radii, a hazard stripe under the HUD, accent-orange primary buttons with dark text |
| Rhythm | Something rewarding every few seconds; a visible goal bar | Reward cadence metric from the rater; goal progress bar in the HUD |

## Skin: Mars Greenhouse (launch)

- Ground: dusty khaki (`#645849` palette, lifted toward the haze on screen), concrete slab
  aprons and paths, dust scatter.
- Sky/fog: pale dust haze; dust storm turns it ochre with blowing particles.
- Structures: weathered poured concrete and steel with panel seams; steel-grey trim; glass
  tinted grey-green. Colour on a building means heat (orange) or interaction (cyan).
- Interactive highlight: cyan `#5cd8ff`. Danger: `#ff5a3c`.
- Resources: Ore crystal blue, Alloy silver, Fuel cells hot orange, Greens green,
  Protein pink, Meal pale yellow, Scrap pale rust, Credits gold, Parts teal.
- Core: reactor heat core, orange plasma glow whose radius equals the safe radius; glow dims
  and flickers as fuel runs low; distress = frost-blue vignette and colonists hugging themselves.
- Hero: colonist in a white EVA suit with a tinted visor; workers get coloured helmet stripes
  and tools; customers are visiting traders in grey suits; raiders are scavengers in dark rags
  with red visors; creatures are six-legged dust crawlers.

## Readability rules (enforced by tests where possible)

1. Every canonical id renders recognisable at ~40 px tall from the game camera.
2. Roles differ in silhouette (headgear + tool), never colour alone.
3. Interactive objects contrast with the ground by a fixed luminance margin.
4. Nothing important sits in the top 12% of the screen (HUD) or under the thumb zone.
5. Hints and banners never cover the hero.
