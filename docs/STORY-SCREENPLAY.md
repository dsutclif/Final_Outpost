# Screenplay: story levels 1–5 (draft 5 for Doug, 2026-11-12)

This is every line in levels 1–5, in order, with stage notes. **Draft 5 is not approved yet, and nothing in it is
built until Doug approves it.** It does three things to draft 4:

- brings the script up to date with the live game, which had moved ahead of the document;
- applies the review round of 2026-11-11 and 11-12 (two outside reviews of draft 4, two more of the live game's
  changes, and a line-by-line check against the level files);
- applies Doug's rulings of 2026-11-12, marked where they land.

What the game needs to change to match is listed at the end, level by level, and as numbered work in
`docs/BACKLOG.md` under "Story draft 5". Doug confirmed its three open points on 2026-11-16: the ship's purpose, the bay plate names and the note on
the raiders.

**How to read it**

- **NAME:** a line in a speech bubble over the speaker. **KILN:** KILN's terminal readout, with its cloud beside the
  commander.
- **GOAL CARD:** the goal, mid-screen until it is tapped, then it flies to its slot at the top. The goal card is the
  precise version, with numbers and timers.
- *Italics* are stage notes: what the player sees, does and earns.
- **Who says what (Doug, 2026-11-05 and 11-12).** A human gives the reason for a goal. KILN says how it is done, in
  plain words. No line names a price, a number target or a button: the arrows, pad labels, HUD and goal cards carry
  those. The model is KILN's wall line: "Once you've saved enough credits, walk the dashed line."
- **Every goal earns a star (Doug, 2026-11-12).** A training level has as many goals, and so as many stars, as its
  steps need. There are no unstarred story steps.
- **Every line holds play until it is tapped,** including the first lines of a level. Where a note says *Play is
  held*, the player must not be able to move at all until the lines before it have been tapped, because moving
  early would show them the thing a later line asks about. The nightly review checks both (see `tools/review`).
- **Carry-over (Doug, 2026-11-12).** Whatever is built and whoever is trained in one level is there, still working,
  at the start of the next. So anything a later level relies on is a goal, never an optional pad.
- **Who builds, and what it costs (Doug, 2026-11-12).** Until the crew meet the settlers they build with scrap from
  the *Halcyon*, carried by hand (the grow dome). Once Sela offers her road crew, builds cost credits. A rockslide
  costs nothing: the commander digs through it, a square at a time.
- **Camera moves are chosen per level, never a generic pan (Doug, 2026-11-03).** A move only happens where a line or
  an event motivates it and it gives nothing away early: L1 has none, L2 lets the pointers find the pods, L3 lets the
  player walk to Sela's lights, L4 looks at the wreck only when KILN names it, L5 shows the ridge as the visors light.
- Films and live scenes all play as built. Replays keep the lines and skip the films and camera moves, so a line
  after a film must still make sense without it.
- The player knows nothing before level 1. What they learn, level by level, is listed at the end.
- **Screen directions:** north is the top of the screen. The wreck and the bay pods lie north-east of the camp. Lines
  say "the wreck", never a compass point, so the pending crash-site re-layout cannot make them wrong.

**Words the lines use**

- **Protein**, not meat. **Grow dome**, not fields. **Gate**, not airlock (Doug, 2026-11-12: the settlement is not
  sealed, so there is no air to lock). **The signal** for the red pulse on the ridge.
- **Credits** are C coins. A **Halcyon chip** carries an H, is the ship's own money and looks different (Doug,
  2026-11-12).
- **Settlers** are the people of the towns. **Hands** are the workers Sela brings. Tam's title is **grower**.

**The facts the lines rely on**

- The ship is the *Halcyon*, an advance resource ship (Doug, 2026-11-16). It was sent ahead of the colony ships to
  set up the settlement and install the reactor. Its crew of nine slept in stasis pods, bays one to nine; the
  commander in bay nine.
- Bays 1–4 (Pip, Rhee, Okafor, Tam) were thrown clear onto the plain in the crash. They come out of their pods in
  their job's suit (hauler, medic, guard, grower).
- Bays 5–8 lie in the sand beside the wreck, sealed and reading OCCUPIED. There is no deck (Doug, 2026-11-04: no
  pad). Bay 5 is Vale, the first officer. Bays 6–8 are Brandt, engineer; Imani, pilot; Sorrel, navigator. Doug approved the
  names on 2026-11-16; they appear only on name plates.
  - All four pods are empty: those four let themselves out before impact (level 4).
  - They escaped in the lander's escape pod, the scorched one in level 2. It has four seats. They walked away from
    it toward the ridge long ago.
- **The reactor (Doug, 2026-11-12).** It stands out on the plain, away from the wreck. Installing it was the
  *Halcyon*'s job. Vale's four hauled it off the
  ship after they landed, wired it to the pods and ran it on fuel cells. When the cells ran out they left. The ore
  that feeds it now lay under the sand then; storms move the sand.
- KILN stands for **Knowledge Integration & Logistics Network** (Doug, 2026-11-05). It is the ship's support system.
  The reactor powers it; KILN is not the reactor. It appears as a cloud.
  - When the reactor ran dry, KILN went to its last battery and shut down everything except the pods, including
    its own clock and logs. Its last power kept one beacon lamp lit on the reactor. When the battery was nearly
    gone, the commander's pod opened.
  - KILN's clock started again when the commander relit the reactor. Its readout carries the day: DAY 1 in level
    1, DAY 2 in level 2, DAY 3 in level 3, DAY 4 in level 4. The true count that morning is DAY 4,023.
- The red signal on the ridge is not the raiders. What it is stays unanswered after level 5 (the working
  answer is in the note at the end).
- The raiders live on the ridge and Vale leads them. There are far more than four. Level 5 calls that out and leaves
  it open; a proposed answer is in the notes at the end.
- The planet has no water: no coast, sea or rain (Doug, 2026-11-05).

---

## Before level 1: the opening film

*`crash_open`, about 18 seconds. The* Halcyon *dives through a storm and hits the plain. Dawn on a fresh wreck. Cut to
night, with sand now drifted over the hull: that cut quietly hides the eleven years. Five stasis pods lie in the sand
beside the hull. One cracks open; the commander climbs out and drops to the sand.*

*The film must not show the reactor, a red light on the ridge, or a caption that explains the signal. To be checked
against the cut that shipped on 2026-11-11.*

---

## Level 1: Cold Start (DAY 1, night to sunrise)

*Night. The commander stands on dark sand beside the wreck. Five pods lie scattered in the sand by the hull: one open
(the commander's), four sealed under frost with small lights reading OCCUPIED.*

*Play is held from the first frame.*

**COMMANDER:** What happened? Where's the rest of my crew?

*Far off, beyond the screen's edge, a large soft white glow reaches onto the edge of the screen. It is fixed where it
is in the world, not a point that moves with the screen. One bright pulse, then an arrow appears at that edge pointing
toward it. There is no red light yet.*

**COMMANDER:** That light. Someone's out there.

> GOAL CARD: **Reach the light**

*Only when this card is tapped can the commander move. The floor arrows lead toward the glow. On the way, two fuel
cells lie half buried in the sand, each with a faint glint, and the arrows run past both. Walking over a cell picks
it up. On the first:*

**COMMANDER:** Fuel cells. Ship's stock. What are they doing out here?

*The glow stays on the screen edge until the commander is close enough to see its source: a single beacon lamp on a
dead reactor, standing alone in the sand, its cables running off toward the wreck. Goal star.*

**COMMANDER:** A reactor? All the way out here?

**COMMANDER:** It's ours, the one we came here to install. Somebody set it up, and let it run dry.

> GOAL CARD: **Restart the reactor**

*The commander drops the two fuel cells in. The reactor lights and flares. A blue cloud appears right beside the
commander, close enough that it can't be missed. The fuel gauge appears at the top. Goal star.*

**KILN:** Commander. You're late.

*KILN's first readout opens with a boot header above the text (level 1 only, no extra line or tap):
`K.I.L.N. · KNOWLEDGE INTEGRATION AND LOGISTICS NETWORK · BATTERY 2% · DAY 1`.*

**KILN:** I'm KILN, the support system of the advance ship *Halcyon*.

**KILN:** Your stasis pod, bay nine, finally opened. I kept that beacon lit on the last of my battery.

**COMMANDER:** Then who put the reactor out here?

**KILN:** I have no record. My logs stop at the crash.

*A gust runs ahead of the storm and strips the sand off a seam of ore just past the reactor. Ore piles show, one after
another.*

**KILN:** Those cells won't last the night. The wind just uncovered ore, and ore burns. Fill the reactor before it
dies, and me with it.

> GOAL CARD: **Fill the reactor in 45 s**

*The commander carries ore from the seam to the reactor; the gauge fills. Goal star. KILN brightens. Its readout now
heads `K.I.L.N. · REACTOR ONLINE · DAY 1`.*

**KILN:** Thank you. Four pods by the wreck are still sealed: bays five to eight.

**COMMANDER:** My first officer, Vale, is in bay five. Open them.

**KILN:** Not yet. The reactor has to burn all night before there's power to open them.

**KILN:** Keep it burning until morning. A storm is coming, and in a storm it eats ore twice as fast.

> GOAL CARD: **Keep the reactor burning till morning** *(with a countdown)*

*The gauge drains as the reactor burns, and the commander tops it up with ore. The storm comes in: the gauge drains
twice as fast, and the wind uncovers more ore closer to the reactor as it blows. Mid-storm, the ridge pulses red
twice, and the camera nudges toward it.*

**KILN:** Something on that ridge is sending a signal. I can't read it.

*The storm passes; sunrise. Goal star. The level ends.*

*If the 45 seconds run out, a Try again prompt appears. If the player carries on instead, nothing is skipped: KILN
opens with "Barely in time." in place of "Thank you.", and the bays, Vale and the storm lines follow as above.*

*If the reactor goes out:*

**COMMANDER:** The reactor's out.

*Try again.*

---

## Level 2: Roll Call (DAY 2, grey dawn)

*Grey morning over the same camp. No opening camera move: the camera stays on the commander, and the pods are found
through the pointers, not shown in advance. Out on the plain, four pods glow cold white, scattered and half buried.
The pods themselves glow; no light shines down on them. The lander's escape pod is dark and has no pointer yet.*

*Play is held. KILN's readout heads `K.I.L.N. · DAY 2`.*

**KILN:** The reactor held. There's still not enough power for bays five to eight, but my sensors are back.

**KILN:** Bays one to four were thrown clear when we hit. Four crew are out there in their pods, and they're freezing.

**KILN:** Their glow fades as they freeze. If a pod goes dark, we've lost them. I'll mark them for you.

*Pointers appear at the screen edge, one for each of the four pods.*

> GOAL CARD: **Tow the nearest pod into the heat**

*The floor arrows circle the nearest pod. The commander loops it; the tow line catches; one of the tally's three slots
fills. The pod reaches the heat; frost melts; it opens. Play is held. Pip steps out in a hauler's suit.*

**PIP · hauler:** Boss! Tell me this is the landing site. No? Thought not. Where is everyone?

**COMMANDER:** Scattered across the plain, and freezing. Can you keep the reactor fed while I bring them in?

**PIP:** Give me something to carry. Ore in, fire stays on.

*Pip starts carrying ore, and the commander no longer has to. Goal star.*

**KILN:** Two pods came down close together. Bring them both in one trip.

> GOAL CARD: **Tow two pods at once**

*The arrows draw one circle around both pods. Both catch; the tally shows two of three. In the heat they thaw one at
a time, play held, a tap for each.*

**RHEE · medic:** How long were we under? Never mind. Is anyone hurt? I'll set up by the reactor.

**OKAFOR · guard:** Who's watching the camp? Nobody? Then I am.

*Goal star. Rhee sets a med crate and a lamp beside the reactor: her aid station, there from now on. She kneels
beside Pip. Okafor walks the camp's edge.*

*Far out, a fifth glow comes on, dull scorched orange, and its pointer appears.*

**KILN:** One more out there. A fifth pod. It's ours, the lander's escape pod, but nobody was assigned to it.

**COMMANDER:** Then I'll bring in all five.

> GOAL CARD: **Bring all 5 pods home**

*The commander brings the last crew pod in. Tam steps out in grower's overalls.*

**TAM · grower:** So this is the new world. Bit cold. Give me something to do.

**COMMANDER:** Soon. We'll need a grow dome, and someone to run it.

*The commander tows the orange pod in. Up close it is the lander's escape pod: a little bigger than a stasis pod,
scorched orange by a hot landing, its hatch hanging open on four empty seats. Rhee walks over and stands beside it.*

**COMMANDER:** Who was in this?

**KILN:** My logs say it never launched. Someone launched it by hand.

**RHEE:** Opened from the inside. The hatch is packed with dust. Whoever rode it down walked away, a while back.

*Goal star. The reactor brightens.*

**KILN:** Power's up. I can open bays five to eight now. Here's my camera at the wreck.

*`empty_bays` pops up in a small frame over play, so the crew keep speaking beside it: KILN's camera on the four
sealed pods in the sand by the hull. All four read OCCUPIED. Bay 5 unlocks; its plate shows a photo and VALE, FIRST
OFFICER. The glass lifts on an empty pod. Bays 6, 7 and 8 unlock one after another, each plate with a name and a
photo. All empty.*

**COMMANDER:** All four read occupied. All four are empty.

**RHEE:** Then where is Vale?

*The level ends.*

*If a pod goes dark, the level stops with a Try again prompt.*

---

## Level 3: Open for Trade (DAY 3, dusk into night)

*Dusk. The crew are huddled at the reactor in blowing dust. No opening camera move. KILN's readout heads
`K.I.L.N. · DAY 3`.*

*Play is held.*

**TAM:** You promised me a grow dome, Boss. Give me one and I'll feed this camp.

**COMMANDER:** There's hull scrap lying all round the wreck. Enough to build one.

**KILN:** Carry scrap to the dome's frame. It goes up when the frame is full.

> GOAL CARD: **Build the grow dome**

*A dome's ghost outline stands beside the camp, with a scrap count on its pad. The arrows lead to the scrap piles. The
commander gathers scrap and carries it to the frame, load by load. The dome rises, its grow lamps come on and greens
sprout. Goal star.*

**TAM:** It'll do.

*Night falls. Far to the south, beyond the edge of the map, a pair of lights moves, then stops. A soft glow sits on
the south screen edge with an arrow in it.*

**COMMANDER:** Lights, to the south. Something's moving out there.

> GOAL CARD: **Follow the lights**

*The commander walks south, past the old edge of the map. The sand gives way to a packed road. Beside it stands an
old trading kiosk, dark, with sand drifted against its shutter. Goal star.*

**COMMANDER:** A road. And a kiosk, shut up for years. People were here.

*The lights come up the road: a buggy (the arrival scene as built). It parks by the kiosk. A woman in a navy suit
climbs out and walks over. Play is held until she has spoken.*

**SELA:** Well. Somebody's living out here. I'm Sela.

**SELA:** I trade between the settlements. Salvage, food, whatever people need.

**COMMANDER:** Settlements? There are other people on this planet?

**SELA:** Colony ships have been setting down at the landing fields for years. You came down a long way off. Hardly
anyone drives out this far.

**SELA:** Three towns along this road, and every one of them is hungry. Open this old kiosk up and I'll buy your
greens.

**KILN:** Traders. Stock the kiosk's shelf with greens, then stand at the counter so she can pay.

> GOAL CARD: **Sell Sela some greens**

*The commander picks greens at the dome, carries them to the kiosk, stocks the shelf and stands at the counter. C
coins fly; the credits counter appears. Goal star.*

**SELA:** You built that dome yourselves? Out of your own hull?

**SELA:** Save your scrap. My road crew builds for credits, and they bring their own steel.

*From here on, every build pad shows a price in credits. When one is paid, Sela's road crew come up the road and raise
it.*

**OKAFOR:** A road that brings traders can bring raiders. Wall first, before anything else.

**KILN:** Once you've saved enough credits, walk the dashed line and the wall goes up behind you.

> GOAL CARD: **Build the camp wall (8)**

*A dashed line rings the camp. The commander walks it, and each section rises behind them. Gates are left in it,
facing the road and facing the ridge. Goal star.*

**RHEE:** These pods kept us alive, but they won't last another storm. We need a habitat hub.

*The camera holds on the hub's ghost outline beside the camp, and its price.*

**KILN:** Keep selling. When you have the credits, stand on the hub's outline to pay for it.

*A second trader reaches the front of the line, looks at the shelf and turns away.*

**TRADER:** No protein? I'm leaving.

**SELA:** Protein sells for a premium around here. Those rock hoppers past the rockslide would fetch a good price.

*Play pauses; the camera pans past the rubble to hoppers moving in a pool of light, then back to the rubble.*

**KILN:** The slide is loose rock. Stand against it and dig; it clears a square at a time.

> GOAL CARD: **Dig through the rockslide**

*The commander stands at the rubble and shovels. A ring fills over the square in front of them, then that square
sinks in a burst of dust; then the next, until a path is open. It costs no credits. Goal star.*

**KILN:** That slide is fresh. Something up on the ridge shook it loose.

**KILN:** Rock hoppers. Run into one to knock it down, then pick up the protein when it falls.

> GOAL CARD: **Sell protein at the kiosk**

*The commander runs into a hopper; it falls and drops protein. The commander picks it up, stocks the shelf and sells
it. A second trader arrives. Goal star.*

**TAM:** Boss, let me run the dome. You hunt; I'll keep the shelf full of greens.

**KILN:** Pip, Rhee and Okafor are doing the jobs they trained for. A new job needs gear, and gear costs credits.
Stand on Tam's pad when you have them.

> GOAL CARD: **Train Tam to run the dome**

*Tam's training pad lights beside the dome, with its price. The commander stands on it and pays. Tam walks to the
dome, picks greens, carries them to the kiosk shelf and keeps doing it. Goal star.*

**RHEE:** Keep selling. When we have enough, we'll build the hub.

> GOAL CARD: **Build the habitat hub (150)**

*While the commander saves, at about half the hub's price, a trader at the counter looks up at the ridge.*

**TRADER:** A town, this close to the ridge? Brave.

**COMMANDER:** What's on the ridge?

**TRADER:** Folk who don't trade.

*The last coins land. The road crew raise the hub; its windows light, the brightest thing on the map; the crew walk
inside. Goal star.*

*Sela comes over and holds out a worn chip stamped with an H. Close-up: she drops it into the commander's open hand.*

**SELA:** For your first night under a roof. A *Halcyon* chip.

**COMMANDER:** *Halcyon* chips? That's our ship's money. Where did you get it?

**SELA:** Four people in suits like yours still spend them. Up on the ridge.

**COMMANDER:** That's not possible. We've only been down three days.

**SELA:** Friend. The *Halcyon* came down eleven years ago.

*Hold on the commander. The hub glows behind them.*

**PIP:** Eleven... years?

*Cut to black. The level ends.*

---

## Level 4: Halcyon Works (DAY 4, morning to dusk)

*Morning. No opening move: the camera is on the commander at the reactor, the crew nearby. Tam is already at the
dome, picking.*

*Play is held.*

**COMMANDER:** KILN. Is it true? Eleven years?

**KILN:** I shut down everything except the pods to save power, my clock too. It only started again when you woke me.

*KILN dims as it says it.*

**KILN:** I've set it against the stars overhead, and against Sela's clock. They agree. It's been four thousand and
twenty-three days.

*A card: DAY 4, struck through and replaced by DAY 4,023. Under it, smaller: "KILN's clock only started when the
reactor was relit."*

**RHEE:** I asked how long we were under. I didn't really want to know.

**COMMANDER:** Eleven years. And four empty pods. Why?

**KILN:** With the reactor up I can scan the wreck. The flight recorder survived. Bring it to me and I can read it.

*Only now, on KILN's line, the camera travels to the wreck, far out on the plain, and back to the commander, so the
distance reads.*

**COMMANDER:** That's a long walk, and there's a line at the kiosk. If I go, the town stops.

**RHEE:** Then we'll learn to run things on our own. We need that box to know what happened to us.

*Sela's buggy pulls up at the kiosk again. Three people in road-worn gear climb out behind her and walk to the camp's
gate, where they wait.*

**SELA:** Storm season's close. The towns will pay well for hot meals.

**SELA:** I've brought three hands who want steady work. They're at your gate.

**KILN:** Stand by the gate to let them in.

> GOAL CARD: **Let the newcomers in**

*The commander stands by the gate. It opens; the three walk in and wait beside the hub. Goal star.*

**KILN:** A galley cooks greens into meals. Pay for it at its outline and the road crew will raise it.

> GOAL CARD: **Build the galley**

*The commander pays at the galley's outline; the road crew raise it. Goal star.*

**COMMANDER:** Tam, greens go to the galley from now on.

**TAM:** Greens to the galley. Fine.

*Tam changes route without retraining: dome to galley.*

**KILN:** Three more jobs will keep it running: cook at the galley, carry meals to the kiosk, mind the counter.

**KILN:** Do each job once yourself and its training pad lights. Then stand on the pad to train one of the newcomers.

> GOAL CARD: **Train the three newcomers**

*The commander cooks one batch by hand: stands at the galley until a meal comes out, carries the meal to the kiosk
and rings up the sale. Each step done by hand lights that job's training pad, one after another: cook, runner, clerk.
Each pad shows its price in credits. Standing on a lit pad with enough credits trains one newcomer, who walks to that
post. The goal card ticks one, two, three. Pip stays on ore, Rhee at the aid station, Okafor on watch. Goal star.*

**KILN:** They've got it. Head for the wreck while the town runs without you.

*A small light starts blinking at the wreck, the only new light on the map as the day turns.*

> GOAL CARD: **Reach the wreck while the town runs itself**

*A bar under the goal fills for as long as the dome, the galley and the kiosk all keep working. If any of them stops,
the bar empties and the arrows point back to whatever stopped. Behind the commander Tam picks, the cook cooks, the
runner carries and the clerk rings up; the credits counter keeps ticking up.*

*The walk passes the four bay pods in the sand by the hull, lids up, empty. Bay 5's plate still shows Vale's photo.*

*At the hull an orange flight recorder blinks, wedged in a crack: a steel box the size of a crate. As the commander
comes near it rattles, the crack bursts, and it tumbles out onto the sand. Goal star.*

**KILN:** That's it. Bring it home to me.

> GOAL CARD: **Bring the flight recorder home**

*It is too heavy to carry. Arrows circle it; the tow line catches it. The commander walks back as the town's lights
come on one by one. In the heat beside the reactor, the recorder opens. KILN brightens. Goal star.*

*`crash_log`: grainy security footage, no sound. FOUR MINUTES TO IMPACT. Four pods open from inside. Four suited
figures, seen only from behind, climb out, close and lock the empty pods from outside, and walk away. The lights
turn to OCCUPIED. Static.*

**KILN:** Four minutes before impact, they let themselves out.

**KILN:** Then they locked their pods behind them, empty, so the pods would still read occupied.

**COMMANDER:** Vale and three others walked away from their own pods?

**KILN:** And into the lander's escape pod, the scorched one you towed in. It has four seats.

**COMMANDER:** Four seats. So they saved themselves, and left the rest of us asleep.

**KILN:** Not quite. Someone hauled the reactor off the ship and wired it to your pods. It must have been them.

**KILN:** It ran on fuel cells until the cells ran out. The ore was under the sand then.

**COMMANDER:** They kept us alive. Then they left. Why?

*The ridge flashes red.*

**KILN:** Movement on the ridge.

*The level ends.*

---

## Level 5: First Watch (night of DAY 4, to dawn)

*Dusk falls to full dark. Behind the wall the town is working: Tam at the dome, the cook at the galley, the runner on
the path, the clerk at the kiosk. The camera moves to the ridge; one by one, a line of red visors switches on. There
are dozens.*

*Play is held.*

**OKAFOR:** Raiders, coming down off the ridge. They'll go for the gate.

**COMMANDER:** Sela said four people lived up there. I count dozens.

**OKAFOR:** Count them later. Hold the gate now.

**RHEE:** The town runs without you now. Keep them off the hub and the reactor, or we lose everything.

**RHEE:** Anyone who goes down, I'll get back on their feet.

**KILN:** Three are coming first. Get close, as you did with the hoppers, and you'll open fire.

> GOAL CARD: **Stop the first raiders**

*The commander closes on each raider and fires. Three fall, and each drops scrap. Walking over the scrap picks it up.
A socket on the wall beside the gate lights up. Goal star.*

**KILN:** Their scrap will build a turret. Carry it to the socket by the gate.

> GOAL CARD: **Build a turret**

*The commander carries the scrap to the socket. The turret rises and opens fire in the next wave. Goal star.*

*Two figures run up the road to the gate, lit by the turret's lamp.*

**SETTLER:** Let us in! They burned our camp on the road!

**KILN:** Two at the gate. Stand by it to let them in.

> GOAL CARD: **Let the settlers in**

*The commander stands by the gate; it opens and the two run in. The guard post beside the gate lights up. Goal star.*

**OKAFOR:** Good. Train one as a guard to hold the gate with me.

> GOAL CARD: **Train a guard**

*The post's pad shows its price in scrap. A settler steps onto it and comes out armed. A second can be trained the
same way. Goal star.*

**KILN:** Hold them off until sunrise.

> GOAL CARD: **Hold until dawn** *(the card counts the waves left)*

*The next wave comes, and with it dust mites, boiling up out of the sand among the raiders.*

**OKAFOR:** Dust mites! The noise is bringing them up out of the sand.

*It stays night and grows darker, to a dim ember orange. Guards who go down lie where they fell; Rhee runs to each
and gets them up. The town keeps working behind the wall. In the last wave comes a bigger raider with a red name tag.*

**RAIDER:** You should have stayed asleep, Commander.

*`warlord_fall`, in the level with play paused and no lines (as built; Doug, 2026-11-12: the face stays). The
commander's last shot throws the leader down in slow motion. The helmet comes off and rolls away. The camera closes
on the bare face: it is Vale, the face from the plate in level 2. Vale gets up and runs. The last raiders run too.
The camera holds on the helmet. Goal star.*

*The visors are gone from the ridge. Behind it, the red pulse beats on.*

**KILN:** They're running. It's over for tonight.

**KILN:** But the signal hasn't stopped. That was never them.

*The helmet lies on the sand, a small red light pulsing inside it.*

**KILN:** They dropped something.

> GOAL CARD: **Pick up the helmet**

*The arrows lead to it. The commander kneels and lifts it in both hands (a new pick-up animation). `helmet_reveal`:
the helmet in the commander's hands, its black paint scratched through to Halcyon white and gold. Inside, an ID card
with the Halcyon's H: BAY 5 · FIRST OFFICER · VALE, and the face from the plate.*

**COMMANDER:** Vale?

*Dawn: the light comes up behind the commander. Goal star. The level ends there, with no walk home (Doug, 2026-11-12).*

---

## What the player knows after each level

| After | They know |
|---|---|
| L1 | They crashed. A reactor stands out on the plain and nobody knows who put it there. KILN runs the ship's support. Four pods by the wreck are still sealed; Vale is in one. Something on the ridge sends a signal. |
| L2 | Four crew survived on the plain. The lander's escape pod was ridden down long ago and abandoned. Bays 5–8 read occupied, but all four are empty. |
| L3 | Others live here and trade, and a road crew builds for credits. The people on the ridge do not trade. The ship crashed eleven years ago, not three days ago. Four people in Halcyon suits are on the ridge. |
| L4 | KILN's clock was stopped while it slept. Vale and three others let themselves out before the crash, locked their pods empty and left in the lander pod. They also set up the reactor that kept the sleepers alive, then left. Something moves on the ridge. |
| L5 | Raiders from the ridge attack, far more than four. Their leader knows the commander and is Vale. The signal is something else, and it has not stopped. |

**Left open on purpose after level 5:** why Vale left; why Vale kept the sleepers alive and then attacked them; who
the rest of the raiders are; what the signal is.

**Note for later levels: the working answer (Doug, 2026-11-16; not in levels 1–5, and not to be written into the game
yet).** There have been many wrecks. The people on the ridge are the survivors of those wrecks, and settlers who
walked up there; Vale's four joined them and, over eleven years, Vale came to lead them. That is why there are so many
raiders, and the player discovers it gradually. The longer-running mystery is what causes so many wrecks: the pulse
is not man-made. The planet itself emits it, and it scrambles the instruments of landers. Seeds already in the
script: Sela's "ships have been setting down for years", the trader's "folk who don't trade", and a lander pod buried
in years of dust.

## What changes in the game

Each line is a change against the live game as of 2026-11-12. The numbered work is in `docs/BACKLOG.md`.

**All levels**
- Every line holds play, as it does today. What is new is that level 1 also holds movement until the "Reach the
  light" card is tapped: today the player can walk in the three seconds between the first line and "That light",
  reach the reactor, and hear "A reactor, and it's cold" first (seen in a browser run on 2026-11-12).
- Every goal has a star: 4 in level 1, 3 in level 2, 8 in level 3, 5 in level 4, 6 in level 5.
- Each level starts with what the last one built and trained.
- KILN's readout carries the day.
- The credits coin is a C again throughout the game; the H appears only on the *Halcyon* chip and Vale's ID.
- The game's label "Airlock" becomes "Gate".
- Rockslides are dug through, with no credits, in every level of the game. Doug has said this is bundled with the
  other whole-game changes in sprint planning.

**Level 1**
- Play is held until the "Reach the light" card is tapped.
- Two half-buried fuel cells on the path, with the commander's line; they light the reactor in place of the first
  ore.
- The commander's two lines of surprise at the reactor, the exchange with KILN about who put it there, and the
  beacon line.
- A gust uncovers the ore before the fill, and the storm uncovers more.
- KILN's introduction is two bubbles; the long storm line is two bubbles; "by the wreck" replaces "on the deck".
- The missed-fill branch keeps the bays and Vale lines. The fail line is "The reactor's out."

**Level 2**
- Three opening lines replace four; the freeze warning moves to the opening.
- The lander pod is dark and unmarked until KILN names it after the pair.
- Pip's and Tam's first lines; Tam is a grower; "grow dome" replaces "fields".
- Rhee's aid station appears beside the reactor.
- The lander pod gets an open hatch and four seats, and is a little bigger than a stasis pod.
- All four bay pods open empty on KILN's camera, each with a name plate, and stay open from level 3 on. Today only
  bay 5 opens.

**Level 3**
- New first goal: build the grow dome from ship scrap.
- New second goal: follow the lights. The kiosk and the road are found by walking; Sela's arrival plays after that.
- Sela's lines are split, lose "the coast" and offer the old kiosk.
- Sela's road-crew offer; build pads are priced in credits from then on.
- Okafor gives the reason for the wall; KILN's wall line no longer names a price.
- The rockslide is dug, and KILN says how.
- KILN's hunting line; "protein" in the trader's line and the goal.
- Training Tam is a goal, with KILN's line on why new jobs cost credits.
- The second grow dome's pad and KILN's line about it are removed.
- A trader's three-line exchange about the ridge while the commander saves for the hub.
- "We've only been down three days."
- The level is long: play-test the time from the first sale to the hub before settling the hub's price.

**Level 4**
- Tam starts the level at work. The opening card is DAY 4, and KILN's first line changes.
- Rhee's line about asking how long they were under.
- KILN says why it can find the recorder now; the commander's reason for staying is the line at the kiosk.
- Sela's three hands arrive at the gate and are let in (the game's arrivals rule), as a goal.
- Three jobs and three training pads (cook, runner, clerk). Tam is re-pointed to the galley for free. Rhee's "One
  more" line goes.
- The bar under the wreck goal is explained on screen; the walk passes the open bay pods.
- The recorder reads as a heavy crate.
- KILN's long line after the footage is two bubbles, and three lines explain who set up the reactor.
- Check the opening economy: the galley leaves almost no credits before the first training pad.

**Level 5**
- The level 4 workers are at their posts all level.
- The commander calls out the numbers; Rhee states what is at stake and what she does.
- KILN's firing line refers back to the hoppers.
- Scrap is picked up and carried to the socket.
- Two settlers arrive at the gate and are let in, as a goal.
- Okafor's dust mite line; the goal card counts the waves left.
- After the raiders run, the signal still pulses and KILN says it was never them.
- The helmet is picked up by hand with a new animation, the film plays, "Vale?", dawn, and the level ends. There is
  no tow and no walk home.

## Review record

- **Drafts 1 to 4 (2026-11-03).** Three rounds of first-time-reader tests, each with fresh readers who saw only the
  lines, goal cards and on-screen notes. Each round's confusions were fixed in the next draft: pod counts, terms used
  before they were introduced, unclear steps, and the orange pod, which became the *Halcyon*'s own lander pod. The
  full record is in draft 4 in the file's history.
- **Outside reviews of draft 4 (2026-11-11).** ChatGPT and Gemini each reviewed draft 4 for continuity, storytelling,
  completeness, natural lines and training. A check of their findings against the level files found that the document
  was behind the live game, and that one shared finding (the rockslide's cost) came from an error in the brief.
- **Outside reviews of the live game's changes (2026-11-12).** Both models reviewed the differences between the game
  and draft 4. They agreed on fixing the job and worker counts in level 4, keeping level 4's workers in level 5 and
  the missed-fill branch. They split on the dawn wording, the dust mites and where Vale is revealed; Doug decided
  those. One item in that brief was wrong: it said the crash site showed three pods. It shows five; that fix shipped
  on 2026-11-08.
- **Doug's rulings (2026-11-12),** all applied above: the reactor found on the plain and explained in level 4; the
  kiosk discovered by walking; the grow dome built from scrap, then credits once the road crew is offered; rockslides
  dug; trained people carry over; every goal a star; C credits; "gate"; Vale's face stays in the fall; level 5 ends
  at the helmet with dawn; the raiders' numbers called out and left open; arrivals welcomed through the gate.
- **Doug's answers (2026-11-16):** the *Halcyon* is an advance resource ship sent to set up the settlement and install
  the reactor; the three bay plate names are approved; the note on the raiders and the signal is the working answer
  for a later reveal.
- **Still to run:** the first-time-reader test and both outside reviews on this draft.
