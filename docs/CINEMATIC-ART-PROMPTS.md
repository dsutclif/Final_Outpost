# Gemini prompts: cinematic assets (2026-10-25)

Reference images for the story cinematics (`docs/STORY-LEVELS.md`, "Cinematics and landing
screen"). Images 1–3 go through Meshy image-to-3D like the other assets (`docs/MESHY-ASSETS.md`);
image 4 is used as a 2D texture (ID photo) and as a face reference for later.

Send them in one Gemini chat, in order. Attach the "General Vibe" image to every prompt, and the
Commander image where noted, so the Halcyon's kit matches the hero's suit.

## 1. The Halcyon in flight (Meshy model, seen at a distance in `crash_open`)

```
Clean reference image for converting into a 3D game model. Art style: matches the attached
"General Vibe" image: brutalist, near-realistic, weathered, low saturation. One object only.

The object: the HALCYON, a mid-sized colony transport ship from a hard-science-fiction
future. Long, heavy and utilitarian, not sleek: a blunt armoured nose with a narrow band of
dark cockpit windows, a long central spine of stacked chunky cargo-and-cryo modules held in
a steel truss frame, four big bell-shaped engine nozzles at the rear grouped in a square,
two short stubby stabiliser fins, radiator panels folded flat along the sides, heat-scorched
ablative tiles on the belly. Hull panels are off-white and pale grey composite with muted
gold trim lines (the same palette as the attached Commander's EVA suit), dull steel
framework, panel seams, bolts, hazard stripes around hatches, light scorch and grime. One
row of small round hatch doors along the cryo module (the crew pod bays). No glowing parts
except a faint orange glow deep inside the engine nozzles. Proportions: about 5 times as
long as it is wide.

Rules: exactly one object, centred, filling about 80% of a square 1:1 frame, nothing cropped;
three-quarter view from above (camera about 35 degrees above the horizon, ship turned about
35 degrees so the side, top and nose are visible); plain flat light grey background
(#d8d8d8), no floor, no cast shadow, no smoke, no flames, no stars; soft even overcast studio
light; no text, no labels, no logos, no people; high detail, sharp edges, 2048x2048.
```

## 2. The Halcyon wreck (Meshy model, level 1 set piece and the end of `crash_open`)

Optional but recommended: level 1 opens beside the wreck, so it should be recognisably the ship
from image 1. Attach image 1.

```
Attach the Halcyon image. Same ship, same style, light and background, now CRASHED on a
dusty planet: the hull broken in two behind the cockpit, the front half nose-down and tilted
about 15 degrees, the truss frame bent and snapped, several cargo modules torn open, one
engine nozzle broken off, radiator panels crumpled, hull panels scorched dark near the
breaks, dust and sand piled against the lower edge. The row of round crew pod hatches is
visible: most hatches are blown open (pods ejected), and four of them in a row are still
closed and intact. Keep the off-white, pale grey and muted gold palette. Exactly one object,
square 1:1, three-quarter view from above, plain light grey background, no ground plane, no
smoke or fire, no text, 2048x2048.
```

## 3. The lieutenant's helmet (Meshy model, `helmet_reveal`)

Attach the Commander image: the helmet is the same Halcyon-issue EVA helmet, painted over by the
raiders. The scratched paint showing white and gold underneath is the clue, readable without
text. The crew tag and helmet liner are added in Blender.

```
Clean reference image for converting into a 3D game model. Art style: matches the attached
"General Vibe" image: near-realistic, weathered, low saturation. One object only.

The object: a single space-suit helmet lying on its side, the same helmet design as the
attached Commander's (same shell shape, visor shape, side lamps and neck ring), but taken by
raiders and repainted: the shell is roughly spray-painted matte black, and the paint is
heavily chipped and scratched so the original off-white shell and muted gold trim show
through in many places, especially around the edges and the neck ring. The original
visor has been replaced by a narrow horizontal red-tinted visor band, cracked across one
corner, with a faint red glow inside. Crude welded steel plates bolted on one side, a frayed
strap, dents, dust in every crevice. The neck ring opening faces slightly toward the viewer
so the dark padded interior is just visible.

Rules: exactly one object, centred, filling about 80% of a square 1:1 frame, nothing cropped;
three-quarter view from above (camera about 35 degrees above the horizon); plain flat light
grey background (#d8d8d8), no floor, no cast shadow; soft even overcast studio light; no text,
no numbers, no logos, no people; high detail, sharp edges, 2048x2048.
```

## 4. The face: crew ID photo for Bay Five (2D)

The helmet reveal doesn't need a 3D face. The crew tag inside the helmet is a small ID card
with this photo, so the player sees who the lieutenant was without the raider taking the helmet
off. The same face is the reference for the full reveal later (the first boss, level 15), when a
3D head can be made from it.

```
A crew identification photo of one person, head and shoulders, facing the camera straight on,
neutral expression with a calm, steady, slightly intense gaze. Photorealistic but clean,
like a high-quality official portrait.

The person: early thirties, androgynous: not clearly male or female, balanced features
neither delicate nor heavy, a defined but not square jaw, straight medium-thick eyebrows,
straight nose, medium lips, no makeup, no facial hair, no jewellery, no scars or tattoos.
Not ethnically specific: features that read as a blend rather than any one group, medium
warm-neutral skin tone, grey-green eyes. Very short, neat, dark brown hair, a clean-cut
crop. Sharp, clean, composed, professional.

Clothing: the collar and shoulders of an off-white flight suit with muted gold trim lines,
a small plain rectangular patch on the chest with no writing.

Background: flat pale grey studio backdrop, soft even front light, no shadows on the
backdrop. Portrait 4:5 frame, sharp focus, no text, no logos, no borders, 2048x2560.
```

If Gemini's face leans one way (male or female, or a specific ethnicity), reply: "Make the face
more androgynous and less ethnically specific: soften the jaw slightly and balance the brow, keep
the clean-cut crop," and regenerate a few times. Pick the one that reads as neither.
