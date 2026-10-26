# Story proposals for levels 1–5 (draft, 2026-10-24)

Research into how survival builders and casual puzzle games build story around progression, then
candidate storylines for the teach levels. Nothing here is agreed yet. Once Doug picks one,
it gets a DECISIONS entry and its text goes into the Mars Greenhouse skin.

**Superseded by `docs/STORY-LEVELS.md`** (versions 2 and 3 combined into five fixed levels).

Round 2 (2026-10-25, below) was the second proposal: one story across levels 1–5, in three
versions, on Doug's framework. Round 1 (the research and storylines A–E) follows it for reference.

# Round 2: one story, three versions

## Doug's framework

1. Wake up, get heat going, survive a dust storm.
2. Find the rest of the crash survivors in their pods; collect and thaw your crew.
3. Build and unlock resources (rockslides always block the hopper flats) to sell to settlements
   founded by earlier ships.
4. Turn the settlement into a town by automating processes.
5. Unknown attackers are coming; defend the new town.

## Shared setting (all three versions)

- **You:** the commander of the **Halcyon**, the third colony ship to reach this crater. It came
  down hard; the commander is the first one out of cryo.
- **KILN** (from A): the Halcyon's reactor caretaker program. It's the voice of the guide arrow
  in levels 1–5. Needs a portrait, not a model.
- **Crew** (rigged models already exist): Rhee the medic, Okafor the guard, Pip the hauler.
- **Settlements from earlier ships:** **Meridian Station** (first ship) and **Ardent Reach**
  (second ship). Their traders are the kiosk customers.
- **Knitting rule:** each level's win line causes the next level's problem, so the five families
  read as one continuous story: cold → crew → money → scale → threat.

Each level gets a **hook** (one line on the intro card), three **barks** (one-line guide text
during play, one per step the level teaches) and a **win** line (after the result card,
skippable). Barks teach; the hook and win carry the story.

## Version 1: Third Landing (straightforward)

*No mystery. A clear, upbeat survival arc; the payoff is "we made it, and now we're a town".*

**Level 1: Cold Start (shelter)**
- Hook: "The Halcyon came down hard. The reactor's cold, and a dust storm is coming."
- Barks: KILN: "Ore into the reactor. Stay in the glow." / "Storm in 30 seconds. Fill the reactor
  now." / "The storm drains heat faster. Keep feeding it."
- Win: KILN: "Storm's passed, heat's holding. I'm reading crew pods all over the crater. They're
  getting cold."

**Level 2: Pod Run (rescue)**
- Hook: "Eight crew pods are scattered across the crater. Bring them home."
- Barks: "Throw the tow line at a pod." / "Drag them into the reactor's heat to thaw them." /
  "Keep moving out there. Stop in the cold and you drop the tow."
- Win: Rhee wakes up: "We're alive. We're also hungry, and broke." KILN: "Two settlements in
  range, Meridian and Ardent, both founded by earlier ships. They trade."

**Level 3: Open for Trade (harvest)**
- Hook: "A rockslide is blocking the hopper flats. Clear it and we've got something to sell."
- Barks: "Clear the rockslide; the hopper flats are behind it." / "Hunt hoppers and stock the
  kiosk." / "Meridian's trader is at the counter. Stand on the clerk pad." (Plus, when a
  source pad unlocks: "Spend credits to open up a new resource.")
- Win: Meridian trader: "We could use a steady supplier. Can you keep up?"

**Level 4: Halcyon Works (industrialize)**
- Hook: "Meridian and Ardent both want meals. You can't carry it all yourself."
- Barks: "Hire a hauler for the ore run." / "Staff the galley: greens in, meals out." /
  "Watch the shelves. An overloaded pile topples."
- Win: KILN: "Credits are coming in and you haven't lifted a crate. Halcyon is a town now." Then:
  "Movement on the eastern ridge. Not traders."

**Level 5: First Watch (defend)**
- Hook: "Unknown attackers, closing on Halcyon. Hold the town."
- Barks: Okafor: "The first wave is weak. Fight them and grab the scrap." / "Scrap buys turrets.
  Build one by each gate." / "Hire guards. They hold the wall while you keep the town running."
- Win: "They were scavengers, desperate after a bad season. Halcyon holds. Meridian sends
  congratulations, and a request." (Opens the generated levels as jobs from the settlements.)

## Version 2: The Pull (mystery, from B)

*A signal pulled the Halcyon off course. The traders know more than they say. Nothing is
answered by level 5.*

**Level 1: Off Course (shelter)**
- Hook: "Something pulled the Halcyon off course. The reactor's cold and a storm is rising."
- Barks: KILN: "Ore into the reactor. Stay in the glow." / "Storm front incoming, and a pulse
  inside it. Ignore it. Fill the reactor." / "Heat drops faster in the storm. Keep feeding it."
- Win: KILN: "Heat stable. That pulse came from the ridge, on the same frequency that scrambled
  our navigation. Crew pods are down in the crater."

**Level 2: Nine Pods (rescue)**
- Hook: "Find the crew before the cold does."
- Barks: tow line / thaw in the heat / keep moving (as in version 1). Mid-level KILN line:
  "Nine pod beacons. The Halcyon carried eight."
- Win: The ninth pod has Meridian markings. It's decades old, empty, and still warm inside.

**Level 3: Fresh Rubble (harvest)**
- Hook: "Meridian and Ardent, settlements from the ships before us. Let's see what they'll buy."
- Barks: "Clear the rockslide. Odd: the break is fresh, not weathered." / "Hunt hoppers and stock
  the kiosk." / "Stand on the clerk pad so the trader pays."
- Win: Ardent trader, about the pulse: "Every ship comes down near here. We don't talk about the
  ridge."

**Level 4: Running Quiet (industrialize)**
- Hook: "If we're stranded, we build. Make Halcyon run itself."
- Barks: hauler / galley / shelves (as in version 1). Mid-level KILN line: "Using spare reactor
  cycles to decode the pulse. 12%."
- Win: KILN: "Partial decode: coordinates. Ours, updated every night. It's tracking us." Then:
  "Figures coming down from the ridge."

**Level 5: From the Ridge (defend)**
- Hook: "Red visors, coming from the ridge where the pulse is."
- Barks: fight the first wave for scrap / scrap buys turrets / hire guards (as in version 1).
- Win: The attackers retreat toward the ridge and the pulse goes silent. KILN: "It knows we can
  defend ourselves now. I don't know if that's good."

Payoff to plan before writing further: what the pulse is and who answers it. Crates and rockslides
in the generated levels carry decode fragments; the family finales (levels 10, 20, ...) move the
decode percentage.

## Version 3: The Empty Bay (crew gap, from A)

*A human mystery, no signal. A gap in the crew roster is set up in level 2, grows quietly in 3
and 4, and turns into the main plot after level 5. Level 5's attackers stay unknown until the
final line.*

**Level 1: Cold Start (shelter)**
- Hook: "Reactor at 4%. KILN is barely awake, and a storm is coming."
- Barks: KILN: "Ore into the reactor. Stay in my glow." / "Storm in 30 seconds. Fill me up." /
  "The storm drains heat faster. Keep feeding."
- Win: KILN: "Heat stable. Pod bay eject log: crew pods are scattered across the crater."

**Level 2: Roll Call (rescue)**
- Hook: "Twelve crew on the roster. Bring every pod home."
- Barks: tow line / thaw in the heat / keep moving (as in version 1).
- Win: KILN: "Eight pods recovered. Four bays are empty. Their pods were never ejected." Rhee:
  "Then where are they?"

**Level 3: Open for Trade (harvest)**
- Hook: "No time to search. We need supplies, and Meridian is buying."
- Barks: clear the rockslide / hunt and stock the kiosk / stand on the clerk pad (as in version 1).
- Win: The Meridian trader pays in Halcyon credit chits. "Got these from a crew who came through
  last month."

**Level 4: Halcyon Works (industrialize)**
- Hook: "Eight people can't do the work of twelve. Automate."
- Barks: hauler / galley / shelves (as in version 1).
- Win: KILN plays a corrupted log from the night of the crash: the pod bay doors opening by hand,
  from the inside. Then: "Movement on the ridge."

**Level 5: First Watch (defend)**
- Hook: "Unknown attackers inbound. They know exactly where our gates are."
- Barks: fight the first wave for scrap / scrap buys turrets / hire guards (as in version 1).
- Win: An attacker drops a helmet as they flee. Inside: a Halcyon crew tag.

Payoff after level 5: reactor levels (from level 11) restore more of KILN's logs; the first boss
(level 15) is the missing first officer, who took four crew and left before the crash.

## How the three compare

| | 1 Third Landing | 2 The Pull | 3 The Empty Bay |
|---|---|---|---|
| Question that pulls players onward | "Will we make it?" | "What is the signal?" | "Where did the four go?" |
| Tone | Hopeful | Eerie | Tense, personal |
| What carries it past level 5 | Jobs from Meridian and Ardent | Decode fragments in crates, finales | KILN logs on reactor levels, boss reveal |
| Risk | Little pull after level 5 | The answer must be good | Darker; betrayal can feel bleak |

Versions 2 and 3 can share levels 1 and 4–5 barks with version 1, so the in-play teaching text is
written once and only the hooks and win lines change.

## What the framework changes in the levels

The story needs a few gameplay changes. They touch the sequencer and generator (and so need a pack
regeneration), not the sim's rules:

- **Level 1 needs a dust storm.** Today teach levels have no features (`sequencer/src/index.ts`,
  `features = []` for the teach phase) and dust storms first appear at level 11. Level 1 would
  carry `dust_storms` with one gentle, early-warned storm.
- **Level 2's "thaw".** Towing a pod into the reactor heat already completes a rescue, so "thaw" is
  just wording. A visible frost-melt effect on arrival would sell it (renderer only). Pod timers
  stay at level 12.
- **Level 3 needs rockslides, hunting and source unlocks.** In the skin, the hopper flats are the
  hunting ground (`zone.prey`), so "rockslides block the hopper flats" means level 3 carries
  `rockslides` (now at level 11), `hunting` (level 7) and `source_unlocks` (level 8), with the
  generator placing a rockslide on the path to the flats. That makes level 3 much busier than
  today's earn-credits level, so its difficulty target needs checking.
- **Level 4's goal.** "Automating" fits the industrialize `automate` goal (credits flow for T
  seconds with no player deposits) better than the current `produce` goal, plus a hauler pad.
- **Level 5.** Unchanged: waves, scrap from the first kills, guards and towers.
- **Mechanism:** a fixed feature list per teach level in the sequencer's family data (data,
  not `if (level === n)`), so hard rule 1 still holds.

# Round 1

## What the teach levels must cover

From `docs/LEVELS.md` (pack s1). The story has to fit this order, because REDESIGN-R2 fixed it.

| # | Family | What the player learns | Goal |
|---|---|---|---|
| 1 | shelter | Gather ore, feed the reactor, stay inside the heat | Hold heat ≥ 70% for 85 s |
| 2 | rescue | Tow line: lasso pods and drag them home | Rescue 4 colonists |
| 3 | harvest | Grow greens, stock the kiosk, stand on the clerk pad so traders pay | Earn 194 credits |
| 4 | industrialize | Converter: greens into meals; don't overload stock | Produce 23 meals |
| 5 | defend | Waves; scrap from early kills buys turrets and guards | Survive the waves |

Levels 6–15 then add each family's deeper modules (arrivals and hab pods, crates and hunting,
source unlocks and VIPs, converter levels, walls and turrets, reactor levels and dust storms,
pod timers, bulk orders, conveyors, bosses and med bay). After 15 the families rotate, with a
two-family finale every 10th level.

Existing cast (rigged): commander (the player, "does everything the first time"), guard,
hauler, medic, courier, trader in a grey suit, raiders with red visors, a raider warlord boss,
dust crawlers, dust mites.

## Research: how comparable games do it

**Whiteout Survival, Kingshot (Century Games).** One-sentence premise (glacial apocalypse; a
rebellion overthrew the dynasty), then straight into play. Story mostly comes from the base
itself: survivors show up at the gate needing beds and food, and the furnace is the heart of the
town. Chapter missions steer early building, so "story" means the next problem to solve, not
cutscenes. Named heroes carry personality in one-line barks. *Takeaway: the core is a character,
people arriving are the plot, and missions double as narrative beats.*

**Frostpunk (11 bit).** The generator is the protagonist's heartbeat. The campaign's story
moves through exploration: scouts bring back pieces of what caused the freeze. Laws come up
when someone in the city asks for something, so the systems create the drama. *Takeaway: tie
mystery reveals to going outside (our rescue family, crates, pods), and let a need voiced by a
person introduce each new mechanic.*

**Homescapes, Gardenscapes, Royal Match (Playrix, Dream Games).** Puzzle levels and story are
two separate layers: stars from levels unlock the next story beat, and each chapter ends on a
cliffhanger. Playrix's creative director contrasts this with Candy Crush: players want to know
what happens to the characters. Some players only care about the puzzles and some only about
the meta, so the story has to be skippable and must never block play. *Takeaway: a story beat
after each level, paid for by stars, ending on a question.*

**Onboarding research.** If the "this is fun" moment takes more than about 90 seconds, a large
share of players never come back for a second session, and 80–90% of installs never return
after the first use anyway. Narrative is best used as a hook that gets players through the
tutorial, taught through play, not as exposition. A mystery works when the first session gives
a quick gameplay win and leaves the question open. *Takeaway: zero story before the first
input. Story goes in one-line radio barks during play and a two-line cliffhanger after the win.*

### Patterns to use

1. **The core is alive.** The reactor has a voice, a name or a history; its dimming glow is an
   emotional signal, not just a meter.
2. **Every mechanic arrives as someone's need.** "The pods are drifting" introduces the tow; "the
   rescued are starving" introduces the galley. The guide arrow is that person talking.
3. **One mystery, revealed through going outside.** Pods, crates and rockslides carry fragments.
4. **A threat you see before it hits.** Raider sign shows up in level 2 or 3 so level 5 lands as a
   payoff, not a surprise.
5. **Cliffhanger after the result card,** unlocked by finishing the level, ending on a question.
6. **Modular beats.** Levels 6+ are generated, so beats attach to *the first time a module
   appears* and to the family finales, never to a specific layout (this fits hard rule 1).

## Storylines

Each storyline gives, per level: the **hook** (one line on the intro card), an in-play **bark**
that teaches the mechanic, and the **cliffhanger** after the win. Barks are one line, show on
the guide arrow, and never pause play.

### A. Last Light (the reactor's story)

*Tone: Frostpunk-lite, earnest. Mystery: why did Greenhouse Seven go dark?*

You wake from cryo as the colony's junior engineer. Everyone senior is gone; the reactor is
almost cold and its old caretaker program, **KILN**, talks to you in fragments.

| # | Hook | Bark (teaches) | Cliffhanger |
|---|---|---|---|
| 1 | "Reactor at 4%. Anyone awake?" | KILN: "Ore in the hopper. Stay in my glow." | KILN: "Heat stable. Seventeen sleepers unaccounted for. Their pods ejected." |
| 2 | "Pods in the dust, beacons fading." | "Throw the tow line. Walk them home. Don't stop out in the cold." | A rescued sleeper whispers: "They didn't eject us. Someone *opened* the bay." |
| 3 | "A dust trader saw our heat from the ridge." | Trader: "Greens for credits. Stock the kiosk, then stand at the counter." | The trader pays in coins stamped with Greenhouse Seven's crest. Where did they get them? |
| 4 | "Forty mouths, raw greens won't do." | Medic: "The galley turns greens to meals. Don't let the shelf overflow." | KILN plays a corrupted log: the night the colony went dark, gunfire in the airlock. |
| 5 | "Red visors on the ridge, the trader sold our location." | Guard: "Fight the first ones off, then spend the scrap on turrets." | The raider leader's helmet bears our crest. Our missing crew didn't leave. They became the raiders. |

Later: reactor levels (L11) restore KILN's memory step by step; the boss (L15) is the former
colony chief. Strong spine; the risk is that it reads darker than the ad-style art.

### B. The Signal (mystery-first)

*Tone: quiet sci-fi, Subnautica-style curiosity. Mystery: what is broadcasting from beyond the
ridge?*

A supply run went wrong. Your shuttle's landing wrecked the outpost's reactor shielding, and a
pulse in a pattern nobody recognises sweeps the horizon every night.

| # | Hook | Bark | Cliffhanger |
|---|---|---|---|
| 1 | "Crash landing. Reactor cracked. Night is coming." | Commander's log: "Ore keeps it lit. I stay near the heat." | The pulse comes again, and the reactor flickers in time with it. |
| 2 | "Escape pods from the shuttle, scattered west." | "Lasso, tow, and keep moving." | Pod four isn't ours. It is older, and empty, and warm inside. |
| 3 | "A trader followed the pulse here too." | "They pay for greens. Stock it, then serve them." | The trader leaves a map scrap: "Everyone hears it. No one who went found anything." |
| 4 | "Crew wants hot food before any expedition." | "Galley: greens in, meals out." | Pulse decoded partly: coordinates, and a countdown. |
| 5 | "Something else follows the pulse." | "Scrap from the first raiders buys a turret." | The raiders flee *toward* the signal, as if it called them. |

Later: crates (L7) and rockslides (L11) hold signal fragments; each family finale moves the
countdown. Best long-term hook and easy to keep going across 60 generated levels; the risk is
an answer that disappoints, so the payoff has to be planned before writing.

### C. The Founder's Ledger (warm, Township-style)

*Tone: cosy and hopeful; fits the "Greenhouse" name. Mystery is small and personal.*

Your grandmother founded this greenhouse. She left you the deed, a ledger of handwritten notes,
and a colony that has fallen apart. Each level, you rebuild one of her dreams; each cliffhanger
turns a ledger page.

| # | Hook | Bark | Cliffhanger |
|---|---|---|---|
| 1 | "The deed is yours. So is the cold." | Ledger: "First, the reactor. A warm home brings people back." | Ledger page: "If the lights come on, Tomas will come home." Who's Tomas? |
| 2 | "Old friends stranded in the dunes." | Tomas, over the radio: "Hook my pod and drag me in, kid." | Tomas: "Your gran owed the traders a lot. They'll come to collect." |
| 3 | "The trader caravan is back, and they remember her." | Trader: "Pay her debt in greens and we're square." | The debt is paid, and the trader hints the ledger has a missing page. |
| 4 | "Gran's galley, still in its crate." | Ledger: "Greens feed one. Meals feed a colony." | Missing page found: a map to her second greenhouse, overrun. |
| 5 | "Scavengers want what she built." | Guard (Tomas): "First fights pay for the turrets." | The warlord carries Gran's missing ledger page. |

Later: each new module is "Gran's next idea"; hab pods, VIPs and bulk orders become people
coming home. Most suitable for broad audiences and for future skins; the weakest tension.

### D. The Long Night (countdown seasons)

*Tone: urgent, like the ads. No mystery; the drama is the clock.*

A season-ending dust storm, the **Long Night**, reaches the outpost in 60 sols. Each level is a
sol; every level makes the outpost one step closer to surviving it. The storm front is visible
on the horizon and gets closer as levels pass.

| # | Hook | Bark | Cliffhanger |
|---|---|---|---|
| 1 | "Sol 1. Storm in 60 sols. Reactor first." | "Ore in, stay warm." | Weather drone: "The front is bigger than forecast." |
| 2 | "Sol 2. Survey crew caught outside." | "Tow them in before the dust thickens." | Survey crew: "We need supplies for sixty people, not six." |
| 3 | "Sol 3. Traders are buying before the storm." | "Sell greens while prices are high." | Traders: "Raiders are moving inside the storm's edge." |
| 4 | "Sol 4. Stockpile meals for the dark." | "Galley turns greens into meals that keep." | The horizon turns ochre. Sol 5 arrives early. |
| 5 | "Sol 5. Raiders ride the storm front." | "First kills pay for walls and turrets." | "Raiders turned back. The storm didn't. 55 sols." |

Later: dust storms (L11) are the Night's outer edges; every 10th-level finale is a "storm surge"
chapter, and L60 is the Long Night itself. This fits a generated, sequenced pack well because it
needs no clue placement, just a sol counter. Thin on characters unless paired with A or C.

### E. Rival Concession (competitive, corporate)

*Tone: wry, rivalry like Township meets Kingshot. Antagonist from level 1.*

Two corporations hold competing claims on this crater. You run the underdog outpost; **Vantor
Holdings** runs the polished rival dome over the ridge and wants you to fail before the claim
audit.

| # | Hook | Bark | Cliffhanger |
|---|---|---|---|
| 1 | "Claim audit in 60 days. Our reactor's sabotaged." | "Ore in. Prove we can keep the lights on." | A Vantor drone filmed you. Your reactor fault was no accident. |
| 2 | "Vantor dropped our supply pods in the dunes, 'by accident'." | "Tow them back." | One pod has a Vantor tracker in it. |
| 3 | "Traders are boycotting us on Vantor's orders. One isn't." | "Win them over: fast service, full shelves." | The trader is a Vantor defector. |
| 4 | "Vantor undercuts our prices. Make something they can't." | "Meals sell for more than greens." | Vantor's dome goes dark. Their workers are walking toward you. |
| 5 | "The raiders came out of Vantor's dome." | "Scrap pays for turrets." | Vantor's CEO on the radio: "Those aren't ours. They took our dome first." |

Later: the rival becomes an ally against a bigger threat around L15; VIPs and bulk orders are
corporate politics. Fun, but the antagonist's dialogue costs more writing per beat.

## Comparison

| | Hook strength | Fits ad-style tone | Scales to 60 generated levels | Writing cost | Reskins (frozen camp, etc.) |
|---|---|---|---|---|---|
| A Last Light | High | Medium (dark) | Good (KILN memory per reactor level) | Medium | Good |
| B The Signal | High | Medium | Very good (fragments on crates and pods) | Medium, needs a planned payoff | Good |
| C Founder's Ledger | Medium | High | Good (one ledger page per module) | Low | Very good |
| D Long Night | Medium | Very high | Very good (sol counter, storm finales) | Very low | Very good (blizzard, flood, etc.) |
| E Rival Concession | Medium-high | High | Medium | High | Medium |

## Recommendation

**D as the frame with A's characters inside it.** The Long Night's sol counter and approaching
storm give every level urgency and a reason to exist, cost almost nothing to extend across a
generated pack, and map onto every planned skin (blizzard, flood, sandstorm). KILN and the
"what happened to the crew" thread from A give the cliffhangers a person and a question, so the
story isn't just a countdown. If the target audience skews casual, swap A's thread for C's
grandmother ledger.

## How it would fit the code (no sim change)

- Story text is skin data, like titles and tips: add `story` to the skin (`packages/skins/src/
  types.ts`) keyed by beat id, with `hook`, `bark` and `cliffhanger` lines.
- Beat ids key on **level id for 1–5** (fixed teach order) and on **first appearance of a
  module** or **family finale** afterwards, so generated levels pick up beats without
  level-specific code (hard rule 1).
- Hook: one line on the existing intro card (`app.ts renderIntro`). Bark: the guide arrow's
  instruction line (`guide.ts`) for levels 1–5. Cliffhanger: a short panel on the result card
  after a win, skippable, saved as seen in `progress.ts`.
- A "Story" list in the field guide lets players re-read beats.
- Characters needed: commander, guard, medic and trader are rigged already. KILN (or the
  ledger, or the signal) needs only a portrait or icon, not a model.

## Sources

- [Whiteout Survival basics (MuMu)](https://www.mumuglobal.com/blog/basics-white-out-survival.html)
- [Kingshot on the App Store](https://apps.apple.com/app/id6739554056)
- [Frostpunk: how the cold changes us (Narrative Design Talk)](https://narrativedesigntalk.substack.com/p/frostpunk-how-the-cold-changes-us)
- [Frostpunk preview (Game Informer)](https://gameinformer.com/games/frostpunk/b/pc/archive/2018/03/25/new-game-from-this-war-of-mine-developer-leaves-you-with-difficult-choices)
- [Frostpunk review (Start Menu)](https://www.startmenu.co.uk/home/review-frostpunk)
- [Playrix soft-launches Homescapes (PocketGamer.biz)](https://www.pocketgamer.biz/news/66301/playrix-soft-launches-sequel-homescapes/)
- [Homescapes monetization (Udonis)](https://www.blog.udonis.co/mobile-marketing/mobile-games/homescapes-monetization)
- [Mobile game onboarding and retention (Playio)](https://blog.playio.co/mobile-game-onboarding-retention)
- [Enhancing the first-time user experience (PocketGamer.biz)](https://www.pocketgamer.biz/pgc-digital-how-to-enhance-the-first-time-user-experience)
- [All aboard: onboarding hooks (BKOM Studios)](https://www.bkomstudios.com/blog/all-aboard/)
- [Onboarding in narrative-rich games (Chalmers thesis)](https://odr.chalmers.se/items/208425d7-7e28-4386-88a7-56edbd4ab554)
