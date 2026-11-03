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

**On hold: films and live scenes (Doug, 2026-11-03).** No new video or live-scene work until the dialogue and staging
below settle, because the scenes may need to change with them. `empty_bays` stays live as it is. Sign-offs 2 (empty_bays)
and 3 (reduced buggy) are parked, not rejected.

## Order of work

1. **S1 screenplay first.** Most of the dialogue, goal and staging items depend on it.
2. **In parallel, the items that don't depend on the words:** presentation (S2–S6), guidance (S7–S9), the HUD (S10),
   assets (S20–S23) and continuity fixes (S24–S27).
3. **After Doug approves the screenplay:** each level's lines, goals and staging, one level at a time (S11–S19).
4. **Last:** the held films and live scenes, re-cut to the new script (S30–S33).

## 1. Story and dialogue

- [ ] **S1 Screenplay for levels 1–5 (B; A reviews level 1).** A single doc,
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

- [ ] **S2 Speech bubbles.** Every non-KILN line shows directly above the speaker's head, with a tail pointing to
  them. That includes the commander, crew, Sela and the raider. The bubble follows the character and stays inside
  the screen, near the notch and edges. KILN keeps its terminal readout.
- [ ] **S3 Character busts (optional; skipped unless Doug wants new art).** A bust portrait to the left of the
  text. Crew share character models and an earlier decision was "faces are never assumed", so believable busts
  need new character art. Open question Q1.
- [ ] **S4 KILN smaller, brighter, unmissable.** About half the current size, with its height about three times
  the commander's head height. Brighter. It appears right beside the commander on KILN's first line.
  - B: `spiritFollow.size` and the brightness option in levels 2–5. A: level 1's cue.
  - Done: one screenshot per level at the first KILN line.
- [ ] **S5 Goal cards in the tutorials.** The goal shows mid-screen until it is tapped, as in later levels, then
  flies to the top. One at a time, alternating with dialogue. This replaces "goals appear silently at the top" in
  levels 1–5.
  - Covers L3's "the goal changed to clear the rockslide with no context or notice": every goal change gets its card
    and a line.
- [ ] **S6 Show what is happening.** Characters act out their lines. The first case is Rhee walking to the opened
  orange pod and standing beside it for "Locked. Nobody home." A director action that moves a named crew member to a
  place and holds them is generic (no level ids), so the screenplay's stage notes can use it.

## 3. Guidance

- [ ] **S7 Floor arrows from the first moment in levels 1–5.** No waiting for the player to get stuck. Level 1 is
  A's: drop `noGuide` and the 600-tick fallback. Levels 2–5 already show them.
- [ ] **S8 Arrows follow the current goal: levels 1–5 part.** The behaviour itself is R6 G5. Here: check it on L3
  (kiosk, then rockslide). Edge pointers for pods appear on KILN's HUD line in L2.
- [ ] **S9 One loop around both pods: levels 1–5 part.** The behaviour is R6 G6. Here: check L2 goal 2's pair, and
  move the pods closer if they don't read as one group.

## 4. HUD in the tutorials

- [ ] **S10 Restart and Levels buttons in levels 1–5.** Level 1 hides `retry`. Show them in all five (A for L1,
  B for 2–5).

## 5. Level by level (after S1 is approved)

### Level 1 (A)
- [ ] **S11 The way to the reactor.**
  - Lose the red light before "What's that light over there?". Instead, one bright white pulse, then an edge
    pointer (like the pod pointers) toward it.
  - Place the ore farther out than the reactor.
  - The reactor's white light stays off until the reactor is found. When on, it glows onto the screen edge while
    the light itself stays off screen.
- [ ] **S12 Level 1 lines and goals per S1:** KILN "…you're late…", then fill the reactor, then the pods, Vale and
  the night, in the agreed pattern.

### Level 2 (B)
- [ ] **S13 Five pods, five rescues.** The goal is "Bring all 5 pods home", including the orange one, so the level
  can't end before it's found.
  - Rules: an opt-in objective option that counts decoy pods (e.g. `rescue_all` with `decoys: 1`). That's a
    training-level-only rule, with an engine bump and re-pin and no pack rebuild.
  - The decoy lines and Rhee's walk (S6) play before the ending.
- [ ] **S14 Level 2 lines per S1:** "My sensors are picking up…", the HUD pointer line, the new crew introductions.

### Level 3 (B)
- [ ] **S15 Hoppers and protein are taught.** Protein becomes a goal with its own reason, for example a front-of-line
  trader who wants meat: "No meat? I'm leaving." The hoppers and their market value are introduced. Four or five
  goals are fine if that's what it takes to lead the player.
- [ ] **S16 The habitat hub has context and a price (a levels 1–5 bug, Doug 2026-11-03).**
  - Dialogue gives the reason for the hub (S1).
  - Its pad shows the price, 150. Today it doesn't, which is a bug: check whether a `big` landmark pad hides its
    cost.
- [ ] **S17 Level 3 lines and ending per S1,** including Sela's real lines.

### Level 4 (B)
- [ ] **S18 Level 4 lines per S1**, including the specific lines above.
- [ ] **S19 The walk to the ship.** See S24–S26 for the continuity fixes; the recorder must be visible on approach.

### Level 5 (B, with A for turrets and hire pads if `renderer.ts` is involved)
- [ ] **S19b Defend lines per S1:** defending the town and training settlers as guards.
- [ ] **S19c Turrets between the attackers and the first building.** Today raiders come from the east and pass the
  hub and galley before the turret socket at the gate. Move the socket and the attack line so the first building
  they reach is covered.

## 6. Assets

- [ ] **S20 Orange pod as a model.** Tint the surfaces of the existing stasis pod model and save it as its own GLB
  (an entry in `meshy.json` with a tint), not a code tint. Hinged glass is part of S31 (held).
- [ ] **S21 The ship is the wreck from the crash film,** not the pile of fragments. Use the film's
  `Halcyon_Wreck.glb` and reduce it as before. The current `decor.halcyon_wreck` was built from the debris-cleared
  site model.
- [ ] **S22 Fireworks instead of confetti: R6 G1.** Nothing separate for levels 1–5.
- [ ] **S23 Shovel dig on clearing a rockslide: R6 G2.** Levels 1–5 part: check it on L3's rockslide.
- [ ] **S23b Rifle lasers (R6 G3): levels 1–5 part.** R6 Bundle 5 N5 (blaster fire: white-hot core, blue glow) and
  N2/N3 (ranged raiders) must apply to L5's raiders, guards and turrets too. No separate work if R6 lands them
  generically; check L5 after R6 Release 2.

## 7. Continuity and staging fixes

- [ ] **S24 Pod count audit (answer for Doug).**
  - The wreck's deck shows 5 pods in every level: bays 5–8 sealed, plus the commander's bay 9, open.
  - L2 adds the 4 ejected crew pods (bays 1–4) and the old orange pod on the plain.
  - Bug: after L2's `empty_bays` opens bay 5, levels 3–5 still show it sealed. Fix: L3–5 show bay 5's lid open.
  - The screenplay (S1) should make the count readable: "four sealed in the wreck, four crew thrown clear".
- [ ] **S25 The ship stays put and far away.**
  - The ship is the same 513 units from the reactor in every level. In L1–3 it sits off the north edge of the map,
    and in L4 the map grew to include it, so it looks as if it moved next to the town.
  - Fix: keep it on screen-reachable ground in every level, farther from town (a real walk in L4), and in the same
    spot relative to the camp throughout.
- [ ] **S26 Solid wreck and deck; a visible recorder.**
  - The commander walks through the deck plate. Decor doesn't block: give the deck and wreck footprints
    `zone.terrain` (data only).
  - The recorder can't be seen on approach. Place it in the open beside the hull break, lit, and showing as soon as
    the town runs itself.
- [ ] **S27 Hire pads visible: levels 1–5 part (game-wide in R6 G4).** never covered by buildings or walls. Check every pad in levels 1–5 from
  the game camera, then move pads in the data. If occlusion fading is the cause, that's A's R6 area.

## 8. Held: films and live scenes (after the screenplay)

- [ ] **S30 Opening film end (L1, A).** It pans up to show the pulsing light on the ridge, then a white flash from
  the screen's left, then play starts with the arrow pointing toward the white light.
- [ ] **S31 Old pod opening (L2):** hinged glass on the S20 model.
- [ ] **S32 The lieutenant's fall (L5):**
  - Machinima triggered by the commander's last shot at the warlord: it falls, gets up and starts running, all in
    slow motion. Then back to live speed as it runs off.
  - The helmet-drop clip plays once it passes the screen edge.
- [ ] **S33 "Vale?" is the last line of the clip or machinima,** as the commander runs two steps toward the screen
  edge holding the helmet, then stops.
- Also parked: `crash_log`, Sela's reveal, the buggy arrival (branch `story-buggy`), and the live helmet fall.

## Open questions for Doug

- **Q1 Busts (S3).** Crew share character models, so believable busts need new character art. Skip for now, or
  commission busts?
- **Q2 KILN size (S4).** Reading "half the size, about 3× the commander's head height" as the cloud's height being
  about three head-heights. Right?
- **Q4 L2's goal (S13).** Counting the old pod as one of "all 5 pods" needs a small training-only rule (an engine
  bump, no pack rebuild). OK?
