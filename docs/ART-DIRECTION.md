# Art direction

The target is the look of the survival-builder playable ads (Whiteout Survival, Kingshot,
Township-style "feed the fire / stock the stall" mini-games). This file is the reference board
in words; it governs both renderers and every skin.

## The ad look, decomposed

| Element | What the ads do | Our rule |
|---|---|---|
| Camera | Tilted top-down, about 50° from horizontal, slight perspective, portrait frame, follows the hero with lag | 3D: fixed 50° pitch, FOV ~40°, eased follow. 2D: straight top-down, eased follow |
| Geometry | Low-poly, chunky, rounded; no thin parts; everything reads as a toy | ≤ 8k tris per character, ≤ 5k per hero building, bevelled or rounded silhouettes |
| Shading | Soft stylised PBR or flat toon with a single warm key light, soft ambient occlusion blobs, no hard black outlines in 3D | One shading model across all skins (decision open: soft PBR vs toon ramp). Blob shadows under every unit |
| Colour | Saturated but not neon; ground is a muted, desaturated field so interactive objects pop; one accent per resource | Palette tokens per skin: ground, structure, accent, interactive, danger, one per resource. Interactive-on-ground luminance contrast ≥ 3:1 |
| Scale | Hero slightly oversized head/hands; buildings 2–3× hero height; resources are big chunky icons | Hero 1.0 unit tall; items 0.35 units; buildings 2–3 units |
| Hero feedback | Items stack on the back and wobble; back stack grows visibly; speed unchanged | Back stack of carried items, per-type colour, sine wobble on move |
| Economy feedback | Coins fly in an arc to the HUD counter; "+N" floaters; counters tick up | Every sale: coin sprites arc to the HUD chip; counter tweens |
| Build feedback | Pads fill like a progress bar as coins pour in; building pops in with squash-and-stretch and a dust ring | Pad fill ratio drawn; pop-in scale 0 → 1.15 → 1.0 over 400 ms |
| Urgency | The fire/warmth meter drains visibly; the hero shivers; vignette tints blue; a banner counts down | Lifeline meter always visible; distress overlay by skin; hazard banner with countdown |
| Threat | Enemies arrive in a visible wave, walls crack, towers flash when shooting | Hit flash + knockback on hostiles, crack decal on damaged sections, muzzle flash on turrets |
| Crowd | Lots of small busy workers with distinct hats/tools; customers in a tidy queue | Role silhouettes differ in headgear and held tool, not just colour |
| Typography | Rounded, heavy, white with dark outline; numbers huge | Baloo 2 / Nunito-class rounded sans, 800 weight, outline stroke on world-space text |
| Rhythm | Something rewarding every few seconds; a visible goal bar | Reward cadence metric from the rater; goal progress bar in the HUD |

## Skin: Mars Greenhouse (launch)

- Ground: muted rust/sand (`#8a4d2e` → `#a86a44` gradient), dust scatter, cracked plates.
- Sky/fog: pale apricot haze; dust storm turns it ochre with blowing particles.
- Structures: white/cream composite panels with teal accents; glass domes tinted green.
- Interactive highlight: cyan `#4fd1ff`. Danger: `#ff5a3c`.
- Resources: Ore grey-blue, Alloy silver, Fuel cells yellow-green, Greens bright green,
  Protein pink-red, Meal cream, Scrap dark steel, Credits gold.
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
