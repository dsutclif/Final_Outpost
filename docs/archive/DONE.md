# Done

Items ticked in `docs/BACKLOG.md` move here once they are verified live, newest date first, with the line on what
was seen. Work finished before 2026-11-07 is ticked in the archived round files beside this one
(`BACKLOG-R4.md`, `BACKLOG-R5.md`, `BACKLOG-R6.md`, `BACKLOG-STORY.md`, `POLISH-PLAN.md`).


## 2026-11-08 (storm look)

- [x] **#79 · Dust storms look like Doug's reference (orange haze, embers, warm dark grade).** New look only: rust storm fog and ambient, a darker key light, lit haze on the far side of the view, a rust vignette and blowing embers in the one-pass storm shader (`softfx.ts` `StormDust`; skin tokens `stormGlow`, `stormEmber`). Live 2026-11-08 (main `ce40366`); Doug: "storm looks great". Step 2 (medium cloud bank) not needed. Dev check: `__lookEnv.stormHold = 1`.

## 2026-11-07 (levels after 60 removed, Doug)

- [x] **#8 · P8 Drop s1-L065** (Doug, 2026-11-07). It is pinned to content 0.17.0, so the client can't load it. Live 2026-11-07 (commit 01fc2d7): index.json lists only s1; the level list ends at 60.
- [x] **#77 · Five shipped packs are pinned to old engines (found 2026-11-07, Bundle 1).** `levels/packs/index.json` ships Live 2026-11-07 (commit 01fc2d7): all eight later packs deleted; pack.test.ts now checks every listed pack and level is pinned to the current engine; s1-L008 loads at "Level 8 / 60".
- [x] **#74 · Unique level ids across packs (from #40).** L051–L060 exist in both s1 and s1-051 and the client keeps Live 2026-11-07 (commit 01fc2d7): s1-051 deleted, so ids are unique (new pack.test.ts check); L060 loads at "Level 60 / 60".

## 2026-11-07 (refinement panel; Doug approved the bundles)

- **Merged** (the number now lives inside another item): #13 → #4, #19 → #17, #23, #25, #27 → #16, #29 → #20,
  #55 → #6, #71 → #7.
- **Dropped:** #38 N13 power budget. #16 covers defence cost; reopen it only if #9's data shows core upgrades
  going unbought.
- **Made a standing rule:** #62 (original names, art and themes only) is now in `CLAUDE.md` Conventions.
- **Doug's answers:** #14 wall building goes in level 3. Enemy HP follows #16: HP = points = drops, sized from target
  `ρ`. Attackers can't damage turrets. Healing a hurt ranger with no medic is in #22. #6: the game's warlord is paused
  and hidden during the fall, then Vale's head on the warlord body runs off. KILN is 1 m from the head at the scale of
  levels 1–4 (#4). This session claims the story files. Cleanup of #68–#73 is approved.

## 2026-11-07 (older items reviewed with Doug)

- **Upgrades that mean something:** done. Tier models are in the game (`sink.core.l2/l3`, `struct.barracks.l2`,
  turret heads `struct.ranged_defense.head1-3`), and Doug has seen the upgraded reactor and turrets.
- **Specific pad icons:** done. Hire pads draw a role icon (`renderer.ts`: register for cashier, pick or basket for
  supplier, wrench for operator, tray, crate for hauler, shield, scope, cross). Doug has seen the cashier and hauler
  pads. The operator pad shows a wrench rather than the machine's silhouette.
- **Gemini images → Meshy models:** dropped (Doug).
- **R4: generate about 5 levels for Doug to playtest:** dropped (Doug).
- **Actions animated:** kept, at low priority (now backlog #15).
- **Vale's face in the fall (S32):** Doug is fine with the face showing.

## 2026-11-07 (Doug's decisions)

- **Level 1 sign-off, removed as an item.** Nothing waits on it, and every story level gets signed off in the end
  anyway. The `crash_open` film approval stays in the backlog (section 4).
- **Q2 KILN size and Q4 the old pod in level 2's goal:** closed as shipped. KILN's size now lives under S40.
- **S39 The escape pod is burnt Ship Scrap 2 (L2)** (story-vale-scrap, 0dc66ae): `capture.recruit_container_decoy`
  is Ship_Scrap_2 with the `scorch` tint, replacing the S20 tinted stasis pod and the S31 hinged glass.

## 2026-11-07 (backlog consolidation)

- **R6 G8 realistic storm dust.** Doug, 2026-11-05: "the storm dust in live L1 looks realistic, that is the
  target." It was never ticked in `BACKLOG-R6.md`.
- **Plot P1–P6** (engine 0.20.0, 4f9b997, verified live): warehouse drop-only for the player, the parts works input
  worker withdrawn if the belt is built first, bent Kiosk queues, the ranger hire pad on hunting levels, the pack
  test, and s1 starting at level 6 again. These were tracked in the plot chat's `OPEN-ITEMS-plot-layout-chat.md`,
  outside the repo.
