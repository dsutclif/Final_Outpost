# Handoff: fade walls and every building in front of the commander

Status 2026-11-04: **not started, no code changed, no branch.** Stopped on the weekly budget. Any Claude account can pick this up.

## What Doug asked for
> "I don't mind fading the whole wall though. why not do that? I want to see where commander is walking and we already do it for some buildings, why not all? (except those specifically excluded by name earlier like grow dome, where no special effect is needed as commander just walks on top of it)"

Today (origin/main `b27288d`) the commander shows as a green see-through silhouette behind walls and the buildings that never fade (backlog R6 N9, `packages/render-3d/src/scene/silhouette.ts`). Doug wants walls to **fade** like buildings do, and all buildings to fade apart from the ones he excluded by name.

## Where the code is (origin/main, `packages/render-3d/src/renderer.ts`)
- `NO_FADE` (about line 135): `/^(struct\.(gate|conveyor|depot)$|barrier\.|node\.)/`. These never fade. Gate, conveyor and barrier are flat or belong to the walls. **depot = warehouse** and **node.* (includes `node.food_source`, the grow dome)** are Doug's own exclusions (backlog R6 #5 + N7). Keep the dome and the warehouse excluded. Check that nothing else Doug did *not* exclude is caught by `node.`.
- `place()` (about line 1105) builds an `Occ` for each placed model through `occluder()` (about line 1128). Each one gets its own pre-compiled see-through material copies.
- `fadeOccluders()` (about line 1160) runs a 2D line-versus-box test per frame. It skips `this.storyP?.solidIds`, so **check what story levels put in `solidIds`**. Doug's screenshot showed the commander behind the **core/reactor** in a story level ("Gather Ore") with no fade, only the silhouette. Either `solidIds` holds the core there or the core isn't a placed model. Whatever the cause, make the core fade too.
- Walls are instanced `Batch`es in `this.walls` (`wall`, `cracked`, `reinforced`, `crackedR`, `dash`, `rubble`, `crate`). Batch class: `packages/render-3d/src/scene/instancing.ts`. The segments are built around line 1224 (`run`, `h`).

## Suggested approach
1. **Walls:** a whole-batch fade, which Doug OK'd ("fading the whole wall"). Keep a list of wall segment boxes (start/end plus height) as they are laid out. Each frame, run the same `segHitsBox` test from `fadeOccluders` against them. If any segment hides the commander, swap every wall batch's material to a pre-made transparent clone and ease its opacity to `FADE_TO`, using the same rates (out at dt*6, back at dt*4). Make and `compileAsync` the clones when the batches are created, so no shader recompiles mid-game. Per-instance fading would need a custom shader attribute and isn't needed.
2. **Buildings:** remove the `solidIds` skip, or narrow it to the excluded ids only, so the core and every other building fades. Leave `NO_FADE` as is unless one of its entries isn't one of Doug's exclusions.
3. **Silhouette:** keep it. It still covers the dome, the warehouse and nodes. Ask Doug whether he still wants it once walls fade.
4. Work in a new worktree off origin/main, e.g. `fo-wt-wall-fade` on branch `wall-fade`. Fetch and push over SSH (`git@github.com:dsutclif/Final_Outpost.git`, because https is blocked). Do **not** work on the `farthest-outpost` main checkout: it is 158 commits behind and has uncommitted story edits.
5. Verify in the browser: walk the commander behind a wall run and behind the core in a story level and in L14. The walls and core should fade; the dome and warehouse should stay solid with the silhouette showing. Then rewrite `release-notes.json` before pushing to main (project rule).

## Open questions for Doug
- Keep the green silhouette once walls fade, or keep it only for the dome and warehouse?

## Traps
- `git grep` across origin/main from the OneDrive checkout is very slow (it timed out at 2 min). Use the Grep tool inside a worktree.
