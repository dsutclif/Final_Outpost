# Story levels 1–5: "The Empty Bay" (draft plan, 2026-10-25)

Doug's direction (2026-10-25): combine story versions 2 (The Pull) and 3 (The Empty Bay) from
`docs/STORY-PROPOSALS.md`; levels 1–5 become five fixed, hand-made levels that are not generated;
they may use mechanics no other level has, for early engagement and cinema; teach through play
with minimal how-to text; level 1 short. The crew gap is planted early and becomes the main plot
after level 5. Not agreed yet; once it is, DECISIONS gets an entry (including the hard rule 1
amendment proposed at the end).

## The story

**Premise.** The colony ship **Halcyon** is the third to reach the crater. Two earlier ships
founded **Meridian Station** and **Ardent Reach**. A pulse from the ridge scrambles every ship's
navigation on approach, and every ship has lost people to it.

**What really happened (players learn this later, not in 1–5).** Four Halcyon crew heard the
pulse in cryo-watch weeks before landing. On the final approach they opened their bays by hand,
took the lander and flew to the ridge, leaving the Halcyon to crash. Over decades, the ridge has
gathered people from every ship; they are the red-visored raiders. What the pulse is stays the
long-term mystery for the generated levels.

**Cast.** The commander (player). **KILN**, the Halcyon's reactor program, which speaks most lines
and gets clearer as the reactor gets stronger. **Pip** (hauler), **Rhee** (medic), **Okafor**
(guard), **Tam** (picker, later galley operator): the four crew who come out of the pods. **Sela**, a Meridian trader. Raiders with red visors;
a **red-visor lieutenant** in level 5.

**The two threads, one beat per level:**

| # | Signal thread (version 2) | Crew-gap thread (version 3) |
|---|---|---|
| 1 | A pulse flashes inside the dust storm, from the ridge | (none: survive first) |
| 2 | An extra beacon: an old Meridian pod, empty, still warm | Four pods, eight on the roster: four bays never ejected |
| 3 | The rockslide is fresh, not weathered | Sela pays in Halcyon credit chits "from a crew who came through last month" |
| 4 | KILN decodes part of the pulse: it tracks our position | Log from the crash night: bays opened by hand, from inside |
| 5 | Raiders come from the ridge; the pulse goes silent when they retreat | The lieutenant drops a helmet with a Halcyon crew tag |

After level 5 the question is "why did our own crew leave us, and what is calling them?"

## Teaching principles for all five

1. **First input inside 5 seconds.** The first thing to touch is next to the spawn point and
   glowing cyan. No screen before play except the one-line intro card.
2. **One new verb per level, shown before it's needed.** The level puts the thing in view,
   then creates the need for it.
3. **Teach with the world, not text.** Cold vignette and shivering say "get warm"; a trader's
   speech bubble with a protein icon says "bring protein"; a pad's ghost silhouette says what it
   builds; a pod's frost says "bring it to the heat".
4. **Text budget.** Barks are at most about eight words, spoken by a character, never "Tap X to
   do Y". At most four barks per level during play, plus the intro hook and a win line.
5. **The guide arrow is always on (Doug, 2026-10-25).** On all five story levels the arrow shows
   the next step from the first second to the win, without waiting for the player to get stuck
   (generated levels keep the 20 s stuck rule). The bot planner picks the step as it does today;
   the director can override it with a scripted target (the first crystal, the decoy pod).
   Its one-line instruction stays short ("Ore", "Reactor", "Tow the pod") so the barks carry
   the story and the arrow carries the how-to.
6. **Can't really lose level 1.** Failures start at level 2, and level 2 fails gently.
7. **Cinema never costs control for long.** Camera beats are 1.5–3 s, skippable with a tap, and
   pause the sim while they play so no beat costs the player resources.

## Level by level

Times are targets for a first-time player. "Director" lines are scripted presentation (see the
implementation plan); everything else is the sim and existing modules.

### Level 1: Cold Start (shelter) · about 75 s

**Learns:** move, gather ore, feed the reactor, stay in the heat. **Goal:** survive the storm
(`hazard_survive`). **Stars:** win · reactor never goes out · finish under 90 s.

**Map:** small and tight. Crash wreck and reactor at centre; three glowing ore crystals in a
short line from the spawn toward the reactor (the first one within a step); a ridge on the north
edge of the frame.

| When | What happens |
|---|---|
| before play | **Crash cinematic** (Blender, about 5 s, skippable; see "Cinematics and landing screen"): the Halcyon comes down through the storm and the pulse flashes on the ridge. Its last frame matches the game camera. |
| 0 s | The hook types out over the last frame: "Reactor at 4%. Anyone awake?" The live game takes over, close on the commander by the wreck. Frost vignette, the commander shivers. The reactor is **dark** (new: dormant core). |
| ~2 s | The arrow points at the nearest crystal, a step away; the crystals form a trail to the reactor and the arrow follows it. |
| first deposit | **Ignition:** the reactor flares, the heat ring blooms outward, the vignette clears, the camera eases out to normal zoom. KILN: "...Warm. Thank you. Keep me fed." |
| ~25 s | Siren. KILN: "Dust storm. Fill me up, now." The storm-countdown banner appears (the hazard warning, already in the game). |
| ~35 s | Storm: ochre sky, heat ring shrinks, burn rate rises. Ore keeps the player busy for about 30 s. |
| mid-storm | **Director:** a slow pulse of light flashes on the ridge, twice, and the reactor flickers in time. No bark; a short camera nudge toward the ridge (1.5 s). |
| ~65 s | Storm passes; the sky clears. Win. |
| Win line | KILN: "Heat stable. Crew pod beacons out in the crater. They're cold." |

**Notes.** Fuel and burn are tuned so a player who keeps gathering never sees the reactor go out;
if it does, the freeze grace is long and KILN says "Hurry. I'm fading." (no fail on level 1). No
kiosk, pads, workers or credits on screen: nothing but ore, reactor and storm.

### Level 2: Roll Call (rescue) · under 60 s for half the bots

**Learns:** the tow line, towing several pods, keeping the reactor going while away, pods
turning into workers. **Goal:** rescue every crew pod. **Stars:** win · no pod freezes over · tow 3
home in one trip.

**Length (Doug, 2026-10-25):** at least half the bot ladder must finish in under 60 s; the pod count
and distances are whatever fits that. The working assumption is **4 crew pods plus the decoy**
on a roster of **8**, which keeps "four bays never ejected" as the reveal. The final numbers come
from bot tuning, and the story lines take them from data (`{rescued}`, `{roster}`), so retuning
never means rewriting.

**Map:** the level 1 base (same reactor, same wreck) with the crater around it. Pod beacons
scattered at increasing distance: the first pod in view, the rest marked by edge beacons
(existing edge arrows, styled as pulsing pod beacons).

| When | What happens |
|---|---|
| 0 s | Hook: "Eight on the roster. Bring every pod home." Camera starts on the first pod, frosted, beacon blinking, then eases to the commander (1.5 s). |
| first pod | Walking up to it hooks the tow line (existing auto-lasso). Dragging it into the heat ring: frost melts off, the pod opens, **Pip** steps out and immediately starts carrying ore to the reactor (new: rescued crew join as named workers). Pip: "Boss. I've got the reactor. Go." |
| next pods | More pods further out. The player learns towing several by doing; the reactor needs less attention because Pip is feeding it (a preview of level 4's automation). |
| pod 2 | **Rhee** joins and becomes the medic (stands by the reactor; foreshadows the med bay). |
| pod 3 | **Okafor** joins and patrols the edge (foreshadows level 5). |
| pod 4 | **Tam** joins and starts picking greens (foreshadows level 3). |
| extra beacon | One beacon is different (dull orange, older). The pod is a different shape with Meridian markings. Towing it home: it opens empty, frost-free, warm inside. KILN: "That's not ours. It's decades old." It counts toward nothing. |
| all rescued | Win. |
| Win line | KILN: "Four pods. Four bays are empty. They never ejected." Rhee: "Then where are they?" |

**Notes.** Pods freeze over on gentle timers (existing `freeze`), long for the first two pods.
The decoy pod sits close enough to a crew pod that towing both in one trip is natural.
Dropping the tow (stopping out in the cold) is the first soft failure the player meets; it's
shown by the pods sliding off and frosting up, not by text.

### Level 3: Open for Trade (harvest) · about 4 min

**Learns:** greens field, kiosk, clerk pad and credits; clearing a rockslide with credits;
hunting hoppers; unlocking a resource. **Goal:** earn N credits. **Stars:** win · time target ·
serve 8 traders in a row with none angry.

**Map:** the base grows south to a road. Greens field west of the reactor; kiosk by the road.
East, a rockslide fills the only gap in a rock ridge (existing terrain) and the hopper flats sit
behind it, visible: hoppers can be seen hopping over there. A second locked source pad (an ore
seam or second field) is visible with its ghost silhouette.

| When | What happens |
|---|---|
| 0 s | Hook: "Traders on the road. They saw our heat." **Director:** camera follows Sela's buggy rolling up the road to the kiosk (2.5 s); her bubble shows a greens icon. |
| first sale | The player picks greens and stands at the kiosk; Sela pays and coins arc to the HUD chip. That chip appears **now** (credits were hidden until here). Sela: "Fair price. Got any meat?" Her next bubble shows protein, and it's not available yet. |
| ~60 s | The rockslide has a clear pad whose price is about four sales. The player can see hoppers past it. KILN (once, when the player first walks near the rockslide): "This rubble is fresh. Not weathered." |
| clear | The rockslide crumbles (dust ring, camera shake). The hopper flats open. |
| hunting | Walking into a hopper hunts it; protein sells for more. A second trader (Ardent) arrives; the queue gets busier. |
| unlock | The locked source pad becomes affordable; buying it doubles a supply line. |
| goal | Win. |
| Win line | Sela pays in Halcyon credit chits. "Got these from a crew who came through last month." |

**Notes.** This is the busiest teach level, so the order is strict: the rockslide pad needs
credits (only greens give credits early), and the second source pad needs `requires` on the
clear. Customer patience stays generous. The kiosk's clerk pad is part of the kiosk, so serving
is "stand at the counter" with no explanation.

### Level 4: Halcyon Works (industrialize) · about 4 min

**Learns:** the galley converter (greens into meals), hiring workers for each job, not
overloading a shelf, and the payoff: the town running without you. **Goal:** `automate` (credits
flow for 20 s with no player deposits). **Stars:** win · time target · no stockpile overload.

**Map:** the same base, larger. Two traders' roads (Meridian and Ardent). A galley build pad with
its ghost silhouette next to the greens field. Hire pads grouped by what they serve: field picker,
galley operator, ore hauler, kiosk clerk.

| When | What happens |
|---|---|
| 0 s | Hook: "Five of us, doing the work of nine. Build a town that runs itself." Both roads have traders whose bubbles show meals. |
| galley | The player builds the galley, carries greens in, and meals come out. Traders pay double for meals. |
| hires | Each hire pad shows a crew portrait; hiring one makes that worker walk off and start the job. Pip is the ore hauler again, keeping continuity. |
| first overload | When a shelf hits its cap the existing "!" and wobble countdown start. Rhee: "Shelf's about to go. Move it or sell it." (only bark about it) |
| all staffed | **Director:** when the last role is staffed, KILN: "Step back. Watch." The camera slowly pulls back over 20 s to show the whole town working, while the `automate` meter fills. The player can still move. Credits tick up on their own. |
| goal | Win. |
| Win line | KILN, in a glitching voice: "Recovered log, crash night: bays five to eight, opened by hand, from inside." Pause. "Movement on the ridge." |

**Signal thread:** a small "Decoding pulse 0–100%" line under KILN's portrait climbs as the
galley runs (spare reactor cycles). At 100% (mid-level), KILN: "It's not a message. It's
tracking us." This is the level's mystery bark; the win line is the crew-gap beat.

### Level 5: First Watch (defend) · about 4 min

**Learns:** fighting off weak attackers, scrap as currency, turrets (towers in the wall),
guards; the town keeps earning while you defend. **Goal:** survive the waves. **Stars:** win ·
Colony HP ≥ 80% · gate held.

**Map:** the level 4 town at **night** (new lighting preset), a perimeter wall with one gate
facing the ridge to the north. Tower sockets on the wall with ghost turret silhouettes. Okafor's
barracks pad next to the gate.

| When | What happens |
|---|---|
| 0 s | Hook: "Lights on the ridge. Coming this way." **Director:** camera to the ridge: a line of red visors switches on in the dark (2.5 s). |
| wave 1 | Three weak raiders. The commander fights them (existing hero shots); each drops scrap. Okafor: "Weak ones first. Grab their scrap." |
| towers | The tower sockets cost exactly what wave 1 drops. Building one: muzzle flashes during the next wave. |
| wave 2 | Bigger. Okafor's barracks pad becomes affordable; hiring guards lets the player go back to running the town (the economy from level 4 is still working). |
| wave 3 | The **red-visor lieutenant** (a boss with a big number over them) comes with the wave. At 25% HP they **retreat** to the ridge instead of dying (new: retreating boss). As they turn, their helmet falls off. |
| waves done | The pulse on the ridge flashes once and goes dark. Win. |
| Win line | The camera finds the helmet in the dust. Inside, a Halcyon crew tag. KILN: "That's Bay Nine." |

**Notes.** Waves come from one side only (the ridge). The economy keeps running so that the
player feels the town they built paying for its defence: the level 4 payoff carried into level 5.

## Implementation plan

### 1. Story levels as fixed manifests (no generator)

- Hand-author `levels/story/story-L001.json` … `story-L005.json` like the golden levels: pinned
  to engine/content versions, with `family`, three `objectives`, `events` (the storm), `waves`,
  capture entities with `freeze`, `zone.blocked`, `zone.terrain`, `zone.prey`.
- Bundle them in the shell (like `StaticLevelSource`) so the first session never waits on a
  pack download, and list them ahead of the generated pack in the level grid.
- **Verification:** `levels:check` replays them with the bot ladder and the human-view bot like
  any pack level. They must pass every rung (they're the easiest levels in the game), and each
  star must be earnable by the human-view bot.
- **Sequencer:** drop the teach phase (`storyLength` 0), start the generated pack at level 6
  and add the story levels' modules (dust storms, rockslides, hunting, source unlocks, workers,
  converters, defense) to the "already seen" set, so levels 6–15 introduce only the deeper
  mechanics. That shifts the generated curve by five; the pack is regenerated once.

### 2. A story director (client, data-driven)

A small client module that plays scripted presentation on top of the sim, driven by data:

- **Data:** the skin's `story` block keyed by level id (text is per skin), with cues
  `{ on, do }`. Triggers (`on`): level start, tick or time, a sim event (`deposited`,
  `captured`, `rescued`, `hazard_warning`, `wave_started`, `built`, `hired`, `sold`), an
  objective reaching a value, the player entering a rect, an entity's first appearance on
  screen. Actions (`do`): bark (portrait + line), camera beat (pan to a point or entity, hold,
  return; or slow pull-back), letterbox in/out, spotlight ring on an entity, override the guide
  arrow's target, hide or show a HUD element (credits chip until the first sale), lighting
  preset, play a sting.
- **Arrow always on:** story data sets `guide: "always"` for the level, so `guide.ts` skips the
  `StuckTimer` and shows the planner's step from the first tick; director cues can override the
  target. The player's "Arrow when I seem lost" setting still governs generated levels.
- **Determinism:** the director never touches sim state. Camera beats pause sim stepping (the
  client simply doesn't advance ticks), so bots, replays and stars are unaffected.
- Reuse beyond 1–5: the same cues serve the two-family finales every 10th level and future
  skins, which supply their own story text against the same level ids.

### 3. New mechanics (generic modules, used only by story levels for now)

Each follows hard rule 5 (schema + data, property test, bot behaviour, rater metric) and is
switched on by manifest data, not by level id:

| Mechanic | Used in | Rule | Size |
|---|---|---|---|
| Dormant core | L1 | `sink.core` param `lit: false`: no burn and no freeze countdown until the first deposit, which lights it | S |
| Rescued crew join as workers | L2 | capture entity param `joins: { role, from, to }`: on rescue, a worker with that binding is added | S–M |
| Retreating boss | L5 | hostile param `retreatAtPct`: below it, the unit walks back to its spawn edge and is removed; counts as defeated for goals | S |
| Decoy capture (the empty pod) | L2 | capture entity with `counts: false` (not a rescue) | S |
| Night lighting preset | L5 | renderer only; the skin already allows day/night/storm presets | S |

All of these bump the engine version once (one batch), re-pin golden levels and regenerate the
pack together with the sequencer change.

### 4. Art and audio

KILN portrait (with a "glitch" state); crew portraits for Pip, Rhee, Okafor, Sela; an older
Meridian pod variant (retexture of the pod); Sela's buggy (or the trader on foot); a dropped
helmet prop; letterbox bars; stings for ignition, the pulse and the helmet reveal.

### 5. Order of work

1. Director with cues and bark UI, tested against the existing golden levels (no engine change).
2. The five mechanics in one engine batch, each with its test, bot behaviour and rater metric.
3. Author the five manifests; tune on the bot ladder; then on Doug's iPhone.
4. Sequencer change and pack regeneration; `levels:check` clean; release notes; push; verify live.
5. Telemetry per story beat (time to first deposit, drop-off per level, cinematic skips) to tune.

## Is level-specific code worth it?

**Not in the sim. Yes, narrowly, in the client.**

- **Sim and bots: no.** Every effect above is a data flag on a generic module. Hard rule 1 is
  what keeps levels replayable, bot-verified and pinned; a hidden `if (level === 3)` rule would
  make the bots and rater blind to it and break replays when versions change. The mechanics
  that make these levels special (dormant core, crew who join, a boss who retreats) cost about
  the same as data flags and become available to generated levels later.
- **Presentation: a data-driven director gets about 95% of what a scripted level gives** (camera
  beats, barks, reveals, HUD gating, lighting) without level-specific code, because cues are
  data keyed by level id.
- **The one case where bespoke code is worth it:** one-off cinematics that no data cue can
  describe well, such as the opening crash in level 1 or the helmet close-up in level 5. Allow
  them as named client cinematics (`cinematic: "crash_open"`) registered in the client and
  called from story data. They run before or after play, or while the sim is paused, never
  inside its rules.
- **Proposed amendment to hard rule 1 (DECISIONS entry when agreed):** "No level-specific code in
  the sim, bots, generator or rater. The client may register named cinematics and the skin may
  carry story cues keyed by level id; neither may change sim state."

## Doug's decisions (2026-10-25)

1. **Level 2 length:** under 60 s for at least half the bot ladder; pod count and distances are
   whatever fits (working assumption: 4 crew pods plus the decoy, roster of 8).
2. **Crash opening:** yes, as a Blender cinematic (below).
3. **Replays:** story levels are replayable for stars like any level. On replay there are no
   cinematics and no director camera beats; barks still show as non-blocking lines and the arrow
   stays on. "Seen" is saved per level in `progress.ts`.
4. **Arrows:** on throughout all five story levels, from the first second.

## Cinematics and landing screen (Blender)

Pre-rendered in Blender (5.2) from the game's own GLB models, scripted in Python so every shot
re-renders from code (no hand-keyed Blender files to maintain). Built 2026-10-26.

**Pipeline** (`tools/cinematics/`, run from that folder with
`blender -b --factory-startup -P <script> -- <args>`):

| Script | Does |
|---|---|
| `prep.py` | Reduces Doug's raw Meshy models (Halcyon flying and wreck, helmet, Bay 5 bust) to 200–400k triangles into `cache/` (gitignored). Run once after the source files change. |
| `site_prep.py` | The crash-site wreck: Doug's wreck at 60 m with the loose debris in front of the hull break removed (`cache/halcyon_wreck_site.glb`), so the deck set and cameras have room. Run after `prep.py`. |
| `lib.py` | Shared kit: models placed in metres, sand, seeded ridges, sky and bounded haze, sun, reactor glow, bloom, dust motes that loop seamlessly, rig poses (Mixamo bones), the in-game camera. |
| `title.py` | Landing screen. `--quick` preview, default 1080×1920 still, `--frames` the 180-frame loop, `--check` seam frames. |
| `crash.py` | `crash_open`: shots 1–3, then the pod sequence (shot 4) cut across four cameras and appended after frame 165; `--shot N`, `--quick`, `--check` (also reports body/pod overlaps), `--close F,…`. The commander now turns a quarter in the stride after standing so he steps out over the pod's long side; the stage is fitted so everything from the limp on lands where the first render (`crash_v1_set.json`) had it, on the same deck plate, and `--shot 4 --pods-only` re-renders only frames with a pod in view. |
| `cryo_pod.py` | Doug's stasis pod and its glass (`prep.py` ids `cryo_pod`, `cryo_glass`): scaled until the commander fits the cavity, sunk so its side walls stand just under the rim height the step-over clears, cradle cut away under a pad at deck level, glass fitted on a hinge along the back long edge with its frosted pane see-through; plus a triangle-overlap check of the body against pod and glass. |
| `glitch.py`, `render_pod.sh` | Long Eevee sessions on the integrated GPU corrupt frames after a few hundred. `render_pod.sh` renders the pod sequence in 100-frame sessions; `glitch.py` flags frames whose tiles jump from their neighbours (`--delete` to redo them). |
| `mocap.py`, `retarget.py`, `pod_exit.py` | CMU motion capture (ASF/AMC in `mocap/`, gitignored) retargeted onto the commander's Mixamo rig with a rigid, profile-calibrated trunk (Doug: neutral back). `pod_exit.perform()` chains Doug's five takes (get up 140_08, step over 143_15, limp 139_19 at half speed, jump down 82_02, look round 77_01), locks feet to the ground, fits the pod rim and deck drop to the motion and checks every frame; run on its own it renders a flat-grey four-view preview. `stick.py` and `tile.py` are its review tools. |
| `helmet.py` | `helmet_reveal`; `--quick`, `--check`. |
| `badge.py` | Re-letters the ID card (`assets/badge_commander.jpg` → `assets/badge_bay5.png`) in Barlow. |
| `encode.py` | Frame folder → H.264 MP4 (yuv420p, 30 fps) plus a poster PNG, with Blender's own FFmpeg. |
| `contact.py`, `posetest.py`, `inspect.py` | Review sheets, a rig pose lab, a GLB report. |

Output goes to `tools/cinematics/out/` (gitignored); finished MP4s and posters are copied into
`packages/client/src/cinematics/` (same file names), which the client imports so Vite fingerprints
them: a re-render just replaces the file and ships with the next push.

**Seamless hand-off.** `crash_open` ends on the game camera (30° pitch, 45° yaw, near-
orthographic) centred on the commander at 7.3 m across (look.json viewW 170 = 4 hero heights),
so the last video frame and the first live frame line up. Level 1's manifest must put the
commander, the dark reactor and the ore trail where the shot does (`crash.py` `shot4`: the reactor
3.3 m left and 2.4 m toward camera of the landing spot, the ore between); the
client should still cross-fade 0.3 s to hide the renderer change.

**Shots.**

| Shot | Where | Length | Content |
|---|---|---|---|
| `title_loop` | Landing screen | 6 s seamless loop | Dusk over the outpost: reactor glow breathing, a crewmate mining, the medic and commander breathing, dust drifting, the pulse beating twice on the ridge. Title and Play over it. |
| `title_still` | Landing fallback, store art | still | Frame 1 of the loop at 1080×1920. |
| `crash_open` | Before level 1 | about 29 s | 1 the Halcyon dives through the storm; the pulse flashes and the engines cut out. 2 wide: it hits the plain, flash, dust plume. 3 dawn: the broken wreck (Doug's model) on the plain, red emergency light in the hull break. 4 a torn deck plate by the break with five of Doug's stasis pods sunk into it (four sealed under frosted glass: bays five to eight, the crew-gap clue). The commander's pod vents, its glass already cracked; it swings back along its long edge as they sit up; in motion capture they get up, turn, step out over the side wall, limp to the plate's edge, jump down to the sand and look round, and the camera cranes out to the game view over the dark reactor, the wreck behind. |
| `helmet_reveal` | After level 5's win | 4 s | Night. The lieutenant's helmet (Halcyon-issue, painted black, white and gold showing through) where it fell, dust settling; the camera creeps in and tips down to the ID card that slipped out: BAY 5, FIRST OFFICER. |

The commander's own pod failed to eject, which is why they wake in the wreck (agreed with Doug
2026-10-26). The face on the card is Bay 5's (the first officer, the level 15 boss); the bust
model is kept for that reveal.

The in-level beats (ignition, pod thaw, town pull-back, red visors on the ridge) stay in the live
3D renderer through the director: they need the player's own base, and they stay interactive.

**Format.** Portrait 720×1280 at 30 fps, H.264 MP4 with a poster PNG; title loop about 1.2 MB,
the others about 2 MB. Played muted with `playsinline` (iOS autoplay rule) and the game's own
sound stings on top. The canvas backdrop in `title.ts` stays as the fallback while the loop loads
or if video fails. Videos stay out of the service-worker precache (install size, and iOS Safari
range requests); offline they fail fast and the game carries on. Tap to skip; never shown on replay.

**Wired (2026-10-29).** `packages/client/src/cinematics.ts` registers them by story level id
(`story-L001` before: `crash_open`; `story-L005` after the win: `helmet_reveal`); the title screen plays
`title_loop` over its canvas. Seen flags live in `Progress.cinematics`; a failed or stalled video is
not marked seen. Dev: `__fo.debugCinematic("crash_open")`.

**Still to do.** Put the Halcyon wreck model into the game for level 1, and re-check the hand-off
frame against level 1's layout.

## Built (2026-10-26)

`levels/story/story-L001..005.json`, laid out by the generator's plot code for each level's family
and features, then finished by hand. All five pass `pnpm levels:check --pack levels/story`: every
rung of the bot ladder wins every level, and the human-view bot earns the star bar on all five.
Where the build differs from the plan above:

- **L1** about 60 s (one storm, warn 20 s, 28–60 s; a full tank left alone dies before it ends, R5 #29). Stars: survive · reactor never goes out · fill
  the reactor by 28 s ("Fill me up, now"). Core grace 15 s, so a slow second trip is forgiven.
- **L2** 19–28 s for every rung (well under the 60 s bar). Crew pods: Pip and Rhee feed the reactor
  (there is no medic role; medics come from the med bay later), Okafor guards the wall ring, Tam stays a
  colonist (no fields yet). The decoy is the old Meridian pod; bots never tow it. Stars: all pods ·
  under 24 s · three in one trip.
- **L3** about 100 s. The hopper flats sit in a ridged hollow whose only gap is the rockslide; greens
  pay for clearing it, then protein, then a second field (the third star is "unlock a source"). The
  reactor-upgrade pad from the draft was removed (the module stays: rockslides require it).
- **L4** about 100 s: build the galley, staff it (feeder, cook, runner on one staff slot), hand the
  kiosk to a clerk; `automate` 20 s. Stars: town runs itself · under 115 s · no angry customers (R5 #7).
- **L5** about 140 s at night, waves from the west (the ridge side of this layout): 3 raiders, then
  a swarm, then the lieutenant (`bossRetreat` 25) with a bigger swarm. Two wall towers and the guard
  post; no tower upgrades (left for the generated levels). Stars: hold · Colony HP ≥ 80% · gate held. Waves drop the 43 scrap every purchase costs, and a medic can be hired outside the west gate (R5).
- Not built yet (deferred with the cinematics): the dark reactor's frost vignette and ignition flare,
  the older look of the Meridian decoy pod, crew names over the joined workers, and the story text
  beyond each level's title and one-line hook.
