# Backlog: story levels 1–5, round S1 (Doug's feedback, 2026-11-03)

Doug's feedback came in three groups: general, all tutorials, and per level. His "Lv4" group also held level 5
items; they are filed under level 5 here. Each item has an owner, its dependencies and a done check. Tick an item
when it is verified live. Claims and the change log stay in `docs/STORY-WORK-LOG.md`.

**Owners.** A is the account that owns level 1 and R6. B is the account on story levels 2–5 and the shared story
client (`client/src/story/*`, story cue blocks). Items that change `renderer.ts` or effects for every level go to A,
because A has `renderer.ts` claimed for R6.

**Game-wide items live in R6 (Doug, 2026-11-03).** S8 (arrows follow the goal), S9 (one loop around close pods),
S22 (fireworks), S23 (shovel dig), S23b (lasers) and S27 (hire pads visible) are R6 Bundle 7, items G1–G6. They stay
listed here only for the parts levels 1–5 need on their own: checks or data. S16's missing hub price is a levels 1–5 bug,
not game-wide.

**Hold lifted (Doug, 2026-11-04): films and live scenes go ahead now.** The levels are close enough that the content
below won't need rewriting, so S30–S33 and the parked scenes (`crash_log`, Sela's reveal and buggy, the live helmet
fall) can be produced and published. While they're being edited, every story film and scene plays on every play of
levels 1–5 (`REPLAY_FILMS` in `client/src/cinematics.ts`; set it false to go back to once per version).
(Was: on hold from 2026-11-03 until the dialogue and staging settled.)

## Order of work

1. **S1 screenplay first.** Most of the dialogue, goal and staging items depend on it.
2. **In parallel, the items that don't depend on the words:** presentation (S2–S6), guidance (S7–S9), the HUD (S10),
   assets (S20–S23) and continuity fixes (S24–S27).
3. **After Doug approves the screenplay:** each level's lines, goals and staging, one level at a time (S11–S19).
4. **Last:** the held films and live scenes, re-cut to the new script (S30–S33).

## 1. Story and dialogue

- [x] **S1 Screenplay for levels 1–5 (B; A reviews level 1). Approved by Doug 2026-11-03 (draft 4 + per-level camera note).** Draft 3 is in `docs/STORY-SCREENPLAY.md` (2026-11-03),
  after two naive-reader rounds. Draft 4 takes in Doug's notes of 2026-11-03 and awaits his review. A single doc,
  `docs/STORY-SCREENPLAY.md`, holds every line in order, with stage notes such as "goal card appears: *Fill the
  reactor*", "commander fills the reactor and earns the star" or "Rhee walks to the orange pod". It assumes the
  player knows nothing before level 1, and longer text is fine. Rules:
  - **Dialogue sets the goal.** A line gives the context and says the objective in full. Then the short goal card
    appears in the middle of the screen until it is tapped, and flies to its slot at the top. Dialogue and goal
    cards alternate, one at a time (S5).
  - **KILN speaks in full sentences** ("Four pods are still sealed…", "My sensors are picking up four crew…").
  - **Every character introduction is natural and can run longer.** Tam's line is a rewrite (e.g. starting "We made
    it…"). Sela gets real lines.
  - **The endings stand on their own.** Level 3's eleven-years reveal and level 5's helmet are written so a player
    who knows only what the game has shown follows them. "First silence in eleven years" is cut.
  - **Lines Doug has already given go in**, with their wording tightened:
    - L1: "…you're late. Hurry and get this up to full power before my last battery dies." Then, once the reactor
      is full: "Four pods are still sealed…", "…Vale is in there", "Don't let it…", then the next goal.
    - L2: "…freezing. I'll add pointers to your heads-up display (HUD) to help you find them." The pod pointers
      appear at the screen edge on that line (S8).
    - L4: KILN "It looks like the flight recorder survived." Commander "…they need me here [reason]." Rhee
      "…on its own. We need that box to know what happened to us." Lines that say outright "we can help" and "you'll
      need to train the team to keep things running".
    - L5: better lines for defending the town and training settlers to guard it.
  - **Naive-reader test.** Each level's draft goes to a fresh agent (Haiku or Sonnet) with no story context, which
    says what it would do next and what it thinks is happening. Iterate until a few fresh agents in a row describe
    the goals and the story correctly. Keep the transcripts of the last round as evidence.
  - Done when Doug approves the doc. Implementation follows it level by level.

## 2. Dialogue presentation (all story levels; B, shared director)

- [x] **S2 Speech bubbles.** (Dialogue style `bubble`, the skin default; levels 3–5 get their cast as they are rebuilt.) Every non-KILN line shows directly above the speaker's head, with a tail pointing to
  them. That includes the commander, crew, Sela and the raider. The bubble follows the character and stays inside
  the screen, near the notch and edges. KILN keeps its terminal readout.
- [x] **S3 Character busts (Doug, 2026-11-03: yes, one per person).** A bust portrait to the left of the text. Each
  crewmate already comes out of their pod in their job's suit (role models: hauler, medic, guard, settler; Sela is the
  trader model; the commander and the raider have their own models). So render one bust per character from those GLBs,
  with no training-costume story needed. Characters keep their L2 bust when their job changes later.
- [x] **S4 KILN smaller, brighter, unmissable.** (L2–5: size 1.1, glow 0.6; L1 the same, A 2026-11-06.) About half the current size, with its height about three times
  the commander's head height. Brighter. It appears right beside the commander on KILN's first line.
  - B: `spiritFollow.size` and the brightness option in levels 2–5. A: level 1's cue.
  - Done: one screenshot per level at the first KILN line.
- [x] **S5 Goal cards in the tutorials.** (On in L1–5; L1 by A, live 2026-11-06.) The goal shows mid-screen until it is tapped, as in later levels, then
  flies to the top. One at a time, alternating with dialogue. This replaces "goals appear silently at the top" in
  levels 1–5.
  - Covers L3's "the goal changed to clear the rockslide with no context or notice": every goal change gets its card
    and a line.
- [ ] **S6 Show what is happening.** (Built: `{ walk, to }`; Rhee's walk in L2.) Characters act out their lines. The first case is Rhee walking to the opened
  orange pod and standing beside it for "Locked. Nobody home." A director action that moves a named crew member to a
  place and holds them is generic (no level ids), so the screenplay's stage notes can use it.

## 3. Guidance

- [x] **S7 Floor arrows from the first moment in levels 1–5.** (L1 live 2026-11-06: on from the start, led to the light until the reactor is found.) No waiting for the player to get stuck. Level 1 is
  A's: drop `noGuide` and the 600-tick fallback. Levels 2–5 already show them.
- [ ] **S8 Arrows follow the current goal: levels 1–5 part.** The behaviour itself is R6 G5. Here: check it on L3
  (kiosk, then rockslide). Edge pointers for pods appear on KILN's HUD line in L2.
- [ ] **S9 One loop around both pods: levels 1–5 part.** The behaviour is R6 G6. Here: check L2 goal 2's pair, and
  move the pods closer if they don't read as one group.

## 4. HUD in the tutorials

- [x] **S10 Restart and Levels buttons in levels 1–5.** (L1 live 2026-11-06; L2–5 never hid them.) Level 1 hides `retry`. Show them in all five (A for L1,
  B for 2–5).

## 5. Level by level (after S1 is approved)

### Level 1 (A)
- [x] **S11 The way to the reactor.** (Live 2026-11-06: white pulse, then the edge glow with a pointer; arrows to the light; the reactor's lights on when found at 90 units; ore past it since d898a02; red ridge only mid-storm.)
  - Lose the red light before "What's that light over there?". Instead, one bright white pulse, then an edge
    pointer (like the pod pointers) toward it.
  - Place the ore farther out than the reactor.
  - The reactor's white light stays off until the reactor is found. When on, it glows onto the screen edge while
    the light itself stays off screen.
- [x] **S12 Level 1 lines and goals per S1:** (Live 2026-11-06, screenplay draft 4 word for word, plus the KILN boot header; storm moved after the fill window.) KILN "…you're late…", then fill the reactor, then the pods, Vale and
  the night, in the agreed pattern.

### Level 2 (B)
- [x] **S13 Five pods, five rescues.** (2026-11-03: `rescue_all` `decoys: 1`, no engine bump.) The goal is "Bring all 5 pods home", including the orange one, so the level
  can't end before it's found.
  - Rules: an opt-in objective option that counts decoy pods (e.g. `rescue_all` with `decoys: 1`). That's a
    training-level-only rule, with an engine bump and re-pin and no pack rebuild.
  - The decoy lines and Rhee's walk (S6) play before the ending.
- [x] **S14 Level 2 lines per S1:** "My sensors are picking up…", the HUD pointer line, the new crew introductions.

### Level 3 (B)
- [x] **S15 Hoppers and protein are taught.** (A "Sell meat" step after the slide.) Protein becomes a goal with its own reason, for example a front-of-line
  trader who wants meat: "No meat? I'm leaving." The hoppers and their market value are introduced. Four or five
  goals are fine if that's what it takes to lead the player.
- [x] **S16 The habitat hub has context and a price (a levels 1–5 bug, Doug 2026-11-03).**
  - Dialogue gives the reason for the hub (S1).
  - Its pad shows the price, 150. Today it doesn't, which is a bug: check whether a `big` landmark pad hides its
    cost.
- [x] **S17 Level 3 lines and ending per S1,** including Sela's real lines.

### Level 4 (B)
- [x] **S18 Level 4 lines per S1**, including the specific lines above.
- [x] **S19 The walk to the ship.** (Seen 2026-11-07 on a dev server with the recorder forced revealed: it stands on open sand beside the hull break.) See S24–S26 for the continuity fixes; the recorder must be visible on approach.

### Level 5 (B, with A for turrets and hire pads if `renderer.ts` is involved)
- [x] **S19b Defend lines per S1:** defending the town and training settlers as guards.
- [x] **S19c Turrets between the attackers and the first building.** (Pad at 620,640.) Today raiders come from the east and pass the
  hub and galley before the turret socket at the gate. Move the socket and the attack line so the first building
  they reach is covered.

## 6. Assets

- [x] **S20 Orange pod as a model.** (`capture.recruit_container_decoy`, `tint: "scorch"`.) Tint the surfaces of the existing stasis pod model and save it as its own GLB
  (an entry in `meshy.json` with a tint), not a code tint. Hinged glass is part of S31 (held).
- [x] **S21 The ship is the wreck from the crash film,** (L2–5; L1 is A's.) not the pile of fragments. Use the film's
  `Halcyon_Wreck.glb` and reduce it as before. The current `decor.halcyon_wreck` was built from the debris-cleared
  site model.
- [ ] **S22 Fireworks instead of confetti: R6 G1.** Nothing separate for levels 1–5.
- [ ] **S23 Shovel dig on clearing a rockslide: R6 G2.** Levels 1–5 part: check it on L3's rockslide.
- [ ] **S23b Rifle lasers (R6 G3): levels 1–5 part.** R6 Bundle 5 N5 (blaster fire: white-hot core, blue glow) and
  N2/N3 (ranged raiders) must apply to L5's raiders, guards and turrets too. No separate work if R6 lands them
  generically; check L5 after R6 Release 2.

## 7. Continuity and staging fixes

- [ ] **S24 Pod count audit (answer for Doug).** (Bay 5's lid open in L3–5, 2026-11-03.)
  - The wreck's deck shows 5 pods in every level: bays 5–8 sealed, plus the commander's bay 9, open.
  - L2 adds the 4 ejected crew pods (bays 1–4) and the old orange pod on the plain.
  - Bug: after L2's `empty_bays` opens bay 5, levels 3–5 still show it sealed. Fix: L3–5 show bay 5's lid open.
  - The screenplay (S1) should make the count readable: "four sealed in the wreck, four crew thrown clear".
- [x] **S25 The ship stays put and far away.** (Doug 2026-11-03: same placement relative to the town in L1–5; L4's walk goes past the deck to the recorder.)
  - The ship is the same 513 units from the reactor in every level. In L1–3 it sits off the north edge of the map,
    and in L4 the map grew to include it, so it looks as if it moved next to the town.
  - Fix: keep it on screen-reachable ground in every level, farther from town (a real walk in L4), and in the same
    spot relative to the camp throughout.
- [x] **S26 Solid wreck and deck; a ramp; a visible recorder.** (Doug's redo: the recorder is lodged in a crack, rattles loose and bursts out onto open sand as the hero comes near; no ramp or deck walk needed.) A drifted-sand ramp (a model or terrain shape) lets the
  commander walk up onto the deck plate, since the game has no jump.
  - The commander walks through the deck plate. Decor doesn't block: give the deck and wreck footprints
    `zone.terrain` (data only).
  - The recorder can't be seen on approach. Place it in the open beside the hull break, lit, and showing as soon as
    the town runs itself.
- [x] **S27 Hire pads visible: levels 1–5 part (game-wide in R6 G4).** never covered by buildings or walls. Check every pad in levels 1–5 from
  the game camera, then move pads in the data. If occlusion fading is the cause, that's A's R6 area.

- [x] **S34 Pods glow; no beams.** (`podLights: "glow"`.) In L2 the pods themselves glow, cold white for crew and scorched orange for the
  lander pod. The light beams over them go (a `podLights` change in `stage.ts`/`storylights.ts`).
- [x] **S35 Camera moves chosen per level (Doug, 2026-11-03: never a generic pan).** A move happens only where a line
  or event motivates it and it spoils nothing:
  - L1: none (it would ruin the light's mystery). L1's opening is the film (S30).
  - L2: none; the pointers find the pods.
  - L3: follows Sela's lamp from the south edge to the kiosk.
  - L4: none at the start; on KILN's flight-recorder line the camera goes east to the wreck and back.
  - L5: to the ridge as the visors light.
- [x] **S36 Text cards for held scenes.** (Checked 2026-11-07: no card stands in for a scene any more.) Until a film or live scene is ready, the live game shows a short text card
  describing it wherever it will play: the L5 lieutenant's fall, `crash_log`, Sela's arrival, the helmet, and
  so on. `empty_bays` already plays live.
- [x] **S37 The wreck lies east of the camp.** Screen up is north, so place the wreck to the east in every level (with
  S25).
- [x] **S38 The orange pod is the Halcyon's lander pod,** scorched orange, opened from the inside long ago. It replaces
  "another ship's pod" (story change, draft 4). The S20 model tint should read as scorched, not painted.

## 8. Films and live scenes (hold lifted 2026-11-04)

- [x] **S30 Opening film end (L1; done by B 2026-11-04, played live in level 1's opening cues).** It pans up to show the pulsing light on the ridge, then a white flash from
  the screen's left, then play starts with the arrow pointing toward the white light.
- [ ] **S31 Old pod opening (L2):** hinged glass on the S20 model. (2026-11-07: the hatch change does nothing, the S20 GLB's glass is part of its body; needs a body without glass plus a hinged glass, see the work log.)
- [ ] **S32 The lieutenant's fall (L5):** (Live 2026-11-07 as `warlord_fall`, rough blocking; Doug to look.)
  - Machinima triggered by the commander's last shot at the warlord: it falls, gets up and starts running, all in
    slow motion. Then back to live speed as it runs off.
  - The helmet-drop clip plays once it passes the screen edge.
- [ ] **S33 (live 2026-11-07 as `vale_run`) "Vale?" is the last line of the clip or machinima,** as the commander runs two steps toward the screen
  edge holding the helmet, then stops.
- [x] `crash_log` (L4) is a live scene (2026-11-04, B), replacing its text card.
- [x] Sela's arrival in the buggy (L3) is a live scene (`sela_arrival`, 2026-11-04, B), buggy at Doug's 2.64 m.
- [x] `helmet_reveal` re-rendered with the H mark and Vale's ID card (version 2, 2026-11-04, B).
- Also parked: Sela's reveal (beyond the arrival), the buggy arrival (branch `story-buggy`), and the live helmet fall.

## Open questions for Doug

- **Q2 KILN size (S4).** Reading "half the size, about 3× the commander's head height" as the cloud's height being
  about three head-heights. Right?
- **Q4 L2's goal (S13).** Counting the old pod as one of "all 5 pods" needs a small training-only rule (an engine
  bump, no pack rebuild). OK?
