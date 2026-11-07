# Done

Items ticked in `docs/BACKLOG.md` move here once they are verified live, newest date first, with the line on what
was seen. Work finished before 2026-11-07 is ticked in the archived round files beside this one
(`BACKLOG-R4.md`, `BACKLOG-R5.md`, `BACKLOG-R6.md`, `BACKLOG-STORY.md`, `POLISH-PLAN.md`).

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
