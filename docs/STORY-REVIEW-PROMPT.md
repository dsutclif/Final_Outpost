# Outside review prompt for the screenplay

Attach `docs/STORY-SCREENPLAY.md` and paste the prompt below into ChatGPT and into Gemini. One prompt serves both:
it opens with a one-line task (OpenAI's advice for long documents), keeps the background in tagged blocks and puts
the full instructions last (Google's advice). The answer format is fixed so the two reviews can be set side by side.

Check every finding against the level files and the story cues before acting on it. In the first round
(2026-11-11) one shared top finding came from an error in the brief, and several others were already fixed in the
game.

```
Task: review the attached screenplay for the first five story levels of a mobile game. Full instructions are at the end.

<context>
The attached file, STORY-SCREENPLAY.md, is the complete script for story levels 1-5: every line of dialogue, every goal card and the stage notes, in order. Its opening sections (how to read it, the words the lines use, the facts) are rules the script follows. Its closing sections (what the player knows, what changes in the game, the review record) are notes for the team: use the knowledge table to check what the player is meant to know, and do not review the change list as story.

About the game (not all of it is in the file):
- It is a real-time survival builder for phones. The player is the commander. They walk around one map, gather and carry things (ore, fuel cells, scrap, greens, protein), drop them where they are needed, sell goods to traders for credits, pay credits at pads to build and to train crew into jobs, then defend the camp from raiders with turrets and guards.
- Each line appears in a phone speech bubble and holds play until the player taps.
- Every goal earns a star, and a level has as many goals as its steps need.
- Deliberate rules (these are NOT defects): a human gives the reason for a goal and KILN, the ship's support system, says how it is done in plain words. No line names a price, a number target or a button. Arrows, pad labels, the HUD and goal cards carry those, and the stage notes describe them.
- The red signal on the ridge is not the raiders. What it is stays unanswered after level 5, on purpose.

What a brand-new player must understand by the end of level 5:
moving; picking up, carrying and delivering; keeping something fuelled over time; towing, including several things at once; selling and credits; building by carrying scrap, then by paying credits; raising a wall by walking its line; digging through a rockslide; hunting; training crew into jobs and what that costs; letting arrivals in at the gate; letting the town run itself while away; fighting, turrets, guards and the medic; surviving waves; what loses a level.
</context>

<review_areas>
1. Continuity: facts, names, counts, places, days and cause and effect stay consistent across levels. Nothing is used before it is introduced. No contradictions except signalled twists.
2. Storytelling: each level has a hook, a turn and a reason to play on. The reveals are earned and not given away early. The open questions after level 5 are clearly open, not dropped.
3. Completeness: no story gaps, no dropped threads, no unexplained jumps, and every goal has a reason given by a person in the story.
4. Naturalness: lines sound like people under stress, not exposition or a tutorial. Flag lines too long for a phone bubble, stiff, repetitive, or that say things the characters would never say to each other.
5. Training: judge the lines, goal cards and stage notes together. Flag a gap only where none of the three teaches something on the list above.
6. Line timing: flag any line that asks about or points at something the player could already have seen, or could not yet see, at the moment it plays.
</review_areas>

<constraints>
- Be critical and specific. Do not open with praise.
- Quote the exact line or stage note and give its level for every point.
- Rank by how much each issue would hurt a first-time player. Keep real problems separate from matters of taste.
- Give one concrete fix per issue, with the exact replacement line where a line changes, in the script's plain, short style. Do not rewrite the whole script and do not add characters or plot.
- Where something is ambiguous rather than wrong, say what a first-time player would probably assume.
- Rely only on the file and the context above. Label anything you infer as an inference.
</constraints>

<output_format>
1. Verdict: three or four sentences, plus a 1-5 score for each review area.
2. Issues table: | # | Level | Area | Quote | Problem | Severity (High/Med/Low) | Suggested fix |
3. First-time player walkthrough: for each level, two or three bullets on what a new player understands, feels and is confused by.
4. Training coverage table: each item from the list in the context, where it is first taught, how, and whether it is Taught, Weak or Missing.
5. Threads ledger: each story thread, where it is set up, where it is advanced or paid off, and whether it is left open on purpose after level 5.
6. Top five changes, in priority order.
</output_format>

Based on the screenplay above and the context provided, review the script against the six review areas. Follow the constraints and use the output format exactly.
```
