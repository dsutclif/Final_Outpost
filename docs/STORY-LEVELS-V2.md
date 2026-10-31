# Story levels 1–5: "The Late Wake" (draft for Doug's approval, updated 2026-10-31)

**Summary.** A pulse from the ridge scrambles the colony ship Halcyon's navigation and it crashes. The
commander wakes alone in the wreck, relights the reactor, waking KILN, the voyage's AI support system, and
survives a dust storm. Towing crew pods home, they find an old, empty pod from an earlier ship, then learn four
sealed bays have nobody inside. To build a shelter, they clear a rockslide and trade with a salvager, who
pays in Halcyon chips and says the ship crashed eleven years ago. Automation lets the commander leave the
town to fetch the flight recorder from the wreck, which shows four crew let themselves out and resealed their
pods empty. Red-visored raiders attack from the ridge. Their retreating lieutenant drops a helmet holding a
Halcyon crew ID.

Built on Doug's level 1. Reviewed by a mystery author, a science fiction writer, a screenwriter, a game
designer and a new player (agents). Replaces the story beats in `docs/STORY-LEVELS.md` once approved. Lines marked
**Build** are instructions for whoever builds the level. Times and numbers are starting points for tuning.

## The story behind it

**The crash wasn't last night. It was eleven years ago.** The commander's pod jammed in the wreck. KILN shut off every
system that wasn't keeping the pods alive, to save as much energy as it could. That included its clock, so KILN thinks it has
been days too. When the fuel finally ran out, the commander's pod failsafe opened, which is why the game starts now. Nobody
knows until the end of level 3.

**What really happened (writers' reference; by the end of level 5 the player knows only that four crew resealed their pods empty and that a raider carries Vale's ID):** First Officer **Vale** (Bay 5) and the crew of bays 6, 7 and 8 began hearing a pulse from the ridge
during cryo-watch, calling crew by bay number. Minutes before impact they let themselves out, closed and locked their empty pods from outside so the ship still read them
as occupied, and ejected bays 1–4 so those crew would survive. Bay 9's eject jammed. Vale stood at the commander's
glass, chose not to wake them, and left on the lander. Vale's people are now the red visors on the ridge, still spending
Halcyon chips. **Saved for later levels:** who locked the bays and why, the ejects, Vale at the commander's glass, the pulse being a roll call of crew that is still calling the commander, what the pulse is, and whether Vale was saving the crew or discarding them.

**Cast.** The commander, the player (Bay 9). Pip, hauler, jokes when scared (Bay 1). Rhee, medic, clipped (Bay 2). Okafor, guard,
blunt (Bay 3). Tam, picker, dry (Bay 4). Vale, first officer (Bay 5). KILN, precise and quietly lonely. Sela, a Meridian salvage
trader who sizes everyone up.

## Build notes for all five levels

- **Words:** every line either sets up the goal or moves the story. Each shows the speaker's name. Crew faces are never assumed: use names, not portraits.
- **Goals:** three goals per level, one on screen at a time, all three star slots always visible. A goal met early completes
  when its turn comes. Objectives already latch (`objectives.ts`), so this is client display only, and the sim never blocks a goal behind another. No time or challenge stars.
- **Missing a star:** a large centre-screen **You missed it. Try again?** appears only for goals that matter to the story's progress: L1 Fill the reactor and L2 Bring everyone home. Other missed stars just crack their slot and the next goal appears. The result screen offers **Try again for 3 stars** either way.
- **Guide:** lights in the world first, then KILN's lines. Ground arrows are always on, drawn as soft **shadows by day and light spots by night**, and circling any pod to show the tow loop. Built and live across the whole game (2026-10-31).
- **Lighting changes:** each level gradually changes its lighting as it plays, for example night slowly turning to sunrise, driven by level progress in the client. Night is used to make one light the obvious next step.
- **Night needs moonlight:** the current night setting shows the sand as almost pure black. Raise it so the sand and ridge read faintly, or Doug's level 1 walk and the ridge pulses won't show.
- **Films:** skippable with a tap. They play automatically the first time, again when a player resets levels for a new update, and again when that video itself is updated (each film has its own saved version). Replaying from the levels menu is in a separate backlog.
- **Continuity:** each training level uses the map and buildings the last one left, and rescued crew keep the jobs they took. Levels after training don't carry over.
- **Stock overload** is removed from levels 1–5 only: no overload star, and no collapse rule on these manifests (`stock.collapseSeconds` 0). Removing it from later levels is in a separate backlog, so `docs/STORY-FIRSTS.md` teaches it there for now.

## Opening film: `crash_open` (about 18 s)

The Halcyon dives through a storm. A pulse flashes on a ridge and the engines cut. It hits the plain. Dawn: a broken, fresh
wreck. Cut to night, with sand now drifted on the hull. That cut quietly hides the eleven years. On a torn deck, five pods: four
sealed under frost with small status lights reading OCCUPIED, and a fifth that cracks and vents. The commander climbs out, limps
to the edge and jumps to the sand. Far off, the ridge pulses once more against the sky.

**Build:** recut from about 29 s. Relight shot 4 to night and add sand to the hull. Add the status lights and two captions ("HALCYON. Third
ship to this crater." and "A pulse from the ridge scrambled our navigation."). End on the commander on dark, empty sand, the ridge's pulse visible on the side of the
screen it will stay on in play, and no reactor in frame. Last frame matches the game camera.

## Level 1: Cold Start (about 2:10, night to sunrise)

*Teaches: moving, following a light, gathering, carrying, fuel, the heat ring, riding out a storm.*

**Build:** `lighting` night, changing to sunrise over goal 3. Commander starts on sand, reactor about two screen widths away, wreck behind the start (the wreck model goes into the game here and stays in this position through level 5). Ridge along one side of the map, also fixed through level 5. No HUD except star slots. Reactor `lit: false`, half buried. No fail during the walk.

1. The commander stands in the dark: **"Oh no, what happened? Where is the rest of my crew?"** Light from the ridge pulses on one side of the screen, carried straight over from the film.
   **Build:** the ground camera doesn't see the sky, so show the pulse as a wash of light from that screen edge, with the ridge itself in frame during the walk.
2. A faint glow appears at the edge of the screen. **"Wait, what's that light over there?"**
   **Build:** glow at the screen edge within 1 s, in the reactor's direction, on a different side from the ridge. Lines play as the player moves. Target walk about 8 s.
3. The player walks. The half-buried wreck slides away behind, the ridge stays in view with slow pulses lighting up behind it, and the player connects the flashes to that place. The glow turns out to be three small lights pulsing on the ground around a dead, half-buried reactor.
   **Build:** computer-generated dots, not models. Their pulse uses the ridge pulse's rhythm (a clue for later levels).
4. Walking up to it: **"This reactor is out of fuel. We'll have to collect some ore."**
   A fourth light, like the others, turns on near the edge of the screen beside a pile of ore. Nobody says who lit it.
   **Build:** trigger on entering a radius of the reactor; the ore pile is unlit until then.
5. **Goal 1: Restart the reactor.** The player carries ore over and drops it in. The reactor flares, the heat ring blooms, and KILN rises above the core as a cloud of cold blue light.
   **KILN: "...Commander. You're late."**
   **Build:** star on first deposit (new objective `core_lit`). KILN is the computer-generated cloud described below.
6. **Goal 2: Fill the reactor** in 30 s. While it fills: **KILN: "Four pods still sealed in the wreck. I need power to open them."** **Commander: "My first officer, Vale, is in there."**
   **Build:** `fuel_full` counts from level start today; it needs to count from ignition, since the walk varies.
7. **Goal 3: Keep the reactor burning till morning** (real timer, 1:30, shown as time till morning). **KILN: "Then don't let me go out before morning."** Dust storm from 0:25 to 0:55: burn rises and the heat ring shrinks. Mid-storm, the ridge flashes twice from its side of the screen, and KILN glitches red in time with it: **KILN: "Something out there is calling."**
   **Build:** the storm and timer also start from ignition (a `fromLit` option on `survive` and event times). Camera nudges 1.5 s toward the ridge.
8. The light grows through the storm, faster once it ends. At sunrise the third star lands and the level ends.

**If the reactor dies:** frost closes in, the commander says "Not yet...", and a large Try again button retries from the reactor.

## Level 2: Roll Call (60–90 s plus introductions, grey dawn)

*Teaches: the tow loop, towing several, stopping drops the tow, crew who work for you.*

**Build:** same map and reactor, dim grey light throughout. Four crew pods with `joins`, one decoy pod, freeze timers that are long on the first two. `lasso` on. Reactor fed by the player until Pip joins.

1. Sunrise from level 1 fades to grey. **KILN: "Four crew still alive out there. Freezing."** Four thin beams of light rise from the plain.
   **Build:** one beam on screen, close; the rest are pulsing markers at the screen edge. The pods themselves glow, so in dim light or night they are the brightest thing around (use this in later night levels too).
2. **Goal 1: Bring the nearest pod into the heat.** Near the pod, arrows on the ground curve in a circle around it. The player follows them, the loop closes, and the tow line catches the pod.
   **Build:** `rescue n:1`. The game captures by walking a closed loop, which isn't intuitive, so arrows must draw the circle every time a pod is uncaptured (mocked). A **tally above the commander's head** fills as pods are caught, three slots, so the limit of 3 is visible.
3. In the heat, the frost melts and the pod opens. A shaking crewmate steps out: PIP · hauler. Play and the freeze timers pause while the name shows.
   **Pip: "Boss? Where is everyone?"** **Commander: "Feed the reactor. I'm going back out to find them."** Tap continues. Pip starts carrying ore, and the player sees they no longer have to.
4. **Goal 2: Tow two at once.** Two beams stand close together, and the ground arrows circle both, so the player sees they can catch several at once. The tally shows two.
   **Build:** `tow_trip n:2`. Stopping for 2.5 s outside the heat already drops the whole tow (`lasso.slackTime`), so a stop shows the pods sliding away, with no text.
5. **Goal 3: Bring everyone home before they freeze.** The remaining beams slowly dim as their timers run. Crew who arrive together thaw **one at a time**: play and timers pause, one introduction shows, and a tap brings the next. After the last, a tap restarts play.
   **Rhee · medic: "How long was I under?"** **Okafor · guard: "Who's watching this camp?"** **Tam · picker: "Any word from home?"** Each then starts a small job.
   **Build:** `rescue_all` (main). Client pauses stepping during introductions, so sim and replays are unaffected. If a pod freezes, a large Try again retries the level; check it is forgiving on the bot ladder.
6. Off the route, a fifth beam burns dull orange. Towed home, its glass swings open: nobody inside, still warm, strange markings. **Commander: "Whose pod is this?"** **KILN: "Not ours. Decades old."**
   **Build:** optional, `decoy`. The stasis pod and glass from `crash_open` (`cryo_pod`, `cryo_glass`), recoloured orange and reduced to game size as a level asset, with its glass as a separate moving piece and an empty interior.
7. As the last crewmate lands, the reactor brightens. The commander stays at the reactor. **KILN: "Power's up. Opening bays five to eight."**
8. **Film `empty_bays` (6 s, KILN's camera feed):** the wreck's pod deck on a flickering feed. Status lights say OCCUPIED. Bay 5's lock releases. Its name plate has a photo: VALE, FIRST OFFICER. The glass lifts on an empty pod.
   **Commander: "They read occupied."** **Rhee: "Locked. Nobody home."**
   **Build:** new, on the existing pod deck set. Photo readable for at least 2 s. The commander does not walk to the wreck; going there is level 4's whole premise.

## Level 3: Open for Trade (about 2:30, dusk into night)

*Teaches: greens, the kiosk counter, credits, paying at pads, clearing rubble, hunting, a second source, saving up to build.*

**Build:** same base, growing south to a road. Crew from level 2 keep their jobs. Greens field, kiosk, rockslide with hopper flats behind it, second field pad, hub pad with ghost outline. Start credits 0. No hire pads in this level; hiring is first in level 4. Credits chip hidden until the first sale.

1. Dusk. The crew huddle at the reactor in blowing dust. **Rhee: "One more storm and they're dead. We need a habitat hub to keep our people safe."** A ghost outline of the hub appears with its price, 150.
   **Build:** camera holds on the ghost for 2 s. Price comes from data.
2. Night falls until the map is nearly dark. Far off, headlights: the only moving light. The camera follows them to an old kiosk.
   **Sela: "Sela. Salvage. Came for that wreck. Didn't expect anyone home. Got food?"**
   **Build:** darkens over about 3 s; camera beat 2.5 s, sim paused. Uses `Buggy no Wheels.glb` and four `Buggy Wheel.glb` from `Asset workflow/3D Models`, proportioned per the Mars rover buggy mock-up. Wheels are mirrored on the opposite side, and all four roll at the same speed while driving. Headlights added in code. Only used in this scene for now.
3. A greens field glows beside the player. Sela's bubble shows greens. **Goal 1: Sell Sela some greens.** Coins fly and the credits chip appears.
   **Build:** `earn n:1`. Sold by standing at the counter. Field lit from now on.
4. Sela's bubble changes to **meat and two coins**. Play freezes and the camera pans: beyond a wall of rubble, hoppers move in a pool of light, then a pad on the rubble glows with its price. The camera returns and play resumes.
   **Build:** sim paused for the pan, about 2.5 s. Rubble pad price about four sales.
5. **Goal 2: Clear the rockslide.** The rubble wall sinks into a burst of dust, with a camera shake. **KILN: "That slide's fresh."**
   **Build:** `build target: clear0`. No new model: the existing rock wall is scaled down in code on top of the existing `zone_cleared` effect.
6. The player hunts hoppers and sells the meat. A second trader's headlights arrive. A dimmer pad reveals a second field.
   **Build:** no lines; the pad's ghost and price explain it. Hub pad has no `requires`.
7. **Goal 3: Build the habitat hub.** The last coins land and the hub rises. Its windows light up, the brightest thing on the map, and the crew walk inside.
   **Build:** `build target: hub` (main) on `struct.landmark`, price 150. Replaces `earn 150`.
8. Sela comes over to settle up, holding out a worn coin stamped with the Halcyon's H. **Commander: "Halcyon chips?"** **Sela: "Four in suits like yours still spend them."** **Commander: "We landed four days ago."** **Sela: "Friend. The Halcyon came down eleven years ago."**
   Hold on the commander. The chip drops. The hub glows behind them. **Pip: "Boss? Eleven *years*?"** No answer. Cut to black.
   **Build:** in-game scene, sim stopped after the win. The chip is Doug's new H coin, which replaces the old coin everywhere in the game, shown as a close-up. The same H appears on the ID card in level 5.

## Level 4: Halcyon Works (about 2:30, morning to dusk)

*Teaches: converters, hiring for each job, connected machines, automation.*

**Build:** same town, hub standing. Grow dome and galley ghost side by side, hire pads named for each crewmate around them, second trader's road open, wreck in its level 1 position. Light changes from morning to dusk over goals 2 and 3. Modules add `lasso` and `crates`.

1. Black. Typed in the corner: DAY 5. It's struck through and replaced: DAY 4,023. Morning. The commander stands alone at the reactor.
   **KILN: "I shut down everything but the pods. Even my clock. It took everything."** KILN dims briefly on the last words.
   **Commander: "Vale's pod was empty. Why?"**
   **KILN: "The flight recorder survived. Retrieve it and I can read it for you."**
   **Commander: "I can't leave. They need me here."**
   **Rhee: "Then let's get this town running on its own."**
2. Sela calls from the kiosk: **"Storm season's close. Everyone's buying hot meals."** The galley's ghost lights up beside the grow dome. The town now needs to feed itself through what's coming, and earn from it too.
3. **Goal 1: Build the galley.** The player carries greens in and meals come out. Traders pay more.
   **Build:** `build target: galley`. Dust gathers on the horizon as the level goes on, keeping the storm warning alive.
4. Hire pads glow, each with a crewmate's name. Each hire walks off to a post, until the player has nothing left to carry and the grow dome is feeding the galley on its own.
   **Build:** hire pads for the dome's collector, the galley operator and delivery to the kiosk. Pip goes back on ore.
5. **Goal 2: Automate both machines long enough to reach the ship.** As soon as both are staffed: **KILN: "They've got it. Go."** A small light starts blinking at the wreck, the only new light on the map as dusk falls. A bar fills while the player walks there, for the first time since waking. If a machine shuts down, the bar drops to zero and the player has to sort it out.
   **Build:** `converters_running` already holds a run and resets when a machine stops, but it only counts converters, so it needs to count the grow dome and its collector as well. A player deposit also resets it. `seconds` = the walk to the wreck plus a few seconds (about 12 s). Delivery must keep up, because a full machine stops. Show its progress as a bar.
6. The commander reaches the wreck. When the bar is full, an orange flight recorder is lying in the hull break, its light blinking. If the bar isn't full yet, it appears the moment it is.
   **Build:** computer-generated, no Meshy model: a chunky, bevelled orange box with hazard stripes and one blinking light. Uses the crate system with a new look, plus a new data option to keep it hidden until goal 2 is done.
7. **Goal 3: Bring the flight recorder home.** Ground arrows circle it and the tow line catches it. The player walks back as the town's lights come on one by one, the town working without them. Dragged into the heat beside KILN, it opens.
   **Build:** `crates n:1` (main). KILN brightens.
8. **Film `crash_log` (8 s, grainy security footage, no sound):** FOUR MINUTES TO IMPACT. Four pods open from inside. Four suited figures climb out, seen only from behind, close and lock the empty pods from outside, and walk out of frame. Status lights turn to OCCUPIED. Static.
   **Build:** new, same pod deck, filtered. No faces, no caption, no eject.
9. Back on the darkening town. **KILN: "They let themselves out. Then locked the pods empty."** A beat. **"Movement on the ridge."**

## Level 5: First Watch (about 2:30, night to sunrise)

*Teaches: fighting, scrap, turrets, guards, keeping the town running under attack.*

**Build:** the town from level 4, still running. Wall and gate facing the ridge. `lighting` night, changing to sunrise by waves cleared. Waves as built, `bossRetreat` 25. All attackers enter from beyond the edge of the screen, past where the player can walk: `defense.spawnY` is -10 today, just outside the map, which is still in view.

1. Dusk falls to full dark. The camera moves to the ridge, and one by one a line of red visors switches on.
   **Okafor: "They're coming for the gate. We can use the scrap they drop to build defenses."**
   **Build:** camera beat 2.5 s, sim paused.
2. **Goal 1: Stop the first raiders.** The commander shoots three. Scrap falls, and a socket on the wall lights up.
   **Build:** `waves_survived n:1`. Socket price matches wave 1's scrap.
3. **Goal 2: Build a turret.** It opens fire in the next wave. The guard post lights up beside the gate. **Okafor: "Let's train some guards to watch the gate while you build defenses."**
   **Build:** `build target:` the socket. Replaces the HP and gate stars.
4. **Goal 3: Hold until dawn.** Waves grow and the light grows as each breaks. In the last wave comes a bigger raider, with a red name tag. **"You should have stayed asleep."**
   **Build:** `waves` (main).
5. Hit hard, the raider turns and runs, and their helmet falls. The last raiders run too, off past the screen edge. The sun rises and the ridge goes dark. **KILN: "First silence in eleven years."**
   **Build:** retreat at 25% already exists but walks at unit speed; make it faster with the `run` animation clip. Drop the helmet inside the walkable area and apart from any scrap.
6. The helmet lies on the sand, a small red light pulsing inside it. The player walks to it, the only thing left to do.
   **Build:** the existing helmet model as a level asset, reduced for the game. Walk-up trigger, then the film.
7. **Film `helmet_reveal` (about 7 s):** the helmet rests on the sand in first light, its black paint scratched through to Halcyon white and gold. An ID card marked with the Halcyon's H fills the frame: **BAY 5 · FIRST OFFICER · VALE**, the same face. **Commander: "Vale?"** Text on black: **Why did you leave me?**
   **Build:** rebuild the current film. Helmet sitting on the sand, brighter light, sharp card with Vale's name.

## How to film the scenes

Live in the game engine (machinima) where it can look right, because it saves render time and download size:

| Scene | How | Why |
|---|---|---|
| `crash_open` | Blender, as now | Full-ship shots and motion capture already exist |
| `empty_bays` | Live in the game | KILN's flickering feed hides the lower detail |
| Sela's reveal | Live in the game | Same place and models as play |
| `crash_log` | Live in the game | The grainy filter hides the lower detail |
| `helmet_reveal` | Try live; fall back to the existing rendered video | It's a close-up, so it needs the most detail |

Live scenes still need the pod deck and pods reduced to game size, which level 2's old pod needs anyway.

## When the player learns each skill

| Level | Skill | Taught by | Needed for |
|---|---|---|---|
| 1 | Move, follow a light | The walk | Everything |
| 1 | Gather, carry, deposit | Goal 1 | Everything |
| 1 | Fuel gauge, heat ring | Goal 2 | Shelter levels; L6, L11 |
| 1 | Riding out a storm | Goal 3 | L16, L22 |
| 2 | Tow loop | Goal 1 | L7 crates, L12 pod timers |
| 2 | Towing several, the limit of 3, stopping drops the tow | Goal 2 | L12, L23 |
| 2 | Crew work for you | Pip takes the reactor | L6, workers |
| 3 | Grow, pick, serve at the counter, credits | Goal 1 | Harvest levels; L8, L13 |
| 3 | Pay by standing on a pad, clearing | Goal 2 | Every build and hire |
| 3 | Hunting, second source | Between goals 2 and 3 | L7, L17, L24 |
| 3 | Saving up to build | Goal 3 | L42 |
| 4 | Converters | Goal 1 | L9, L14 |
| 4 | Hiring for each job, connected machines | Goal 2 | L9 chains, L19, L41 |
| 4 | Automation | Goal 2: town runs while you walk away | L25 and later |
| 5 | Fight, loot scrap | Goal 1 | Defend levels |
| 5 | Turrets, guards | Goal 2 and Okafor's line | L10, L15, L21, L26 |
| 5 | Run the town under attack | Goal 3 | Finales |

Everything else appears through the first-appearance intros in `docs/STORY-FIRSTS.md`, already updated to match this draft.

## How KILN appears (look agreed by Doug, 2026-10-30)

A computer-generated cloud of light floating just above the reactor (layered moving noise, no model or
video), with a small copy beside KILN's name when KILN speaks away from the reactor.

- **Colour:** cold, artificial light, not fire: deep blue through electric blue to a near-white centre, with
  very faint moving scan lines. The glowing patch on the ground under it uses the same blue.
- **Idle:** slow drift and breathing.
- **Speaking:** brightens with each syllable while a line is on screen.
- **Ridge pulse:** glitches red for two beats, the colour of the raiders' visors.
- **Low fuel or dying:** small, dim and unsteady.
- **Story:** nothing shows before ignition; it blooms out of the flare and grows larger and steadier as the
  reactor gets stronger.
- **Check when building:** frame rate on the iPhone; readability in daylight (denser, plus a faint shimmer);
  that it stays distinct from any cyan "touch this" marker. If they look alike, change the marker.
