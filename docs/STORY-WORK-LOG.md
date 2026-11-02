# Story levels 2–5: shared work log

Two Claude accounts push to this repo. **Read this file before you start, and fetch before you push.**

| Who | Works on |
|---|---|
| Account A (built everything up to 2026-11-01) | Level 1, the R5/R6 backlog, generated levels, engine and generator |
| Account B (from 2026-11-02) | Story levels 2–5 (G2–G5 in `docs/STORY-LEVELS-V2-PLAN.md`), one level at a time |

## Agreed with Doug (2026-11-02)

- Levels 2–5 are built one at a time. Each one goes to `main` and is live as soon as it's checked.
- If a rule needed by a story level doesn't fit the existing rules, it becomes an **opt-in manifest option**: off by default, used only by the training levels. Generated levels must keep their results.
- An engine bump is allowed if a story level needs it (re-pin with `levels:repin`, then `levels:check`). **No pack regeneration.** Before a bump, claim it below, fetch, and push straight after, to keep the window short.
- Account B builds on level 1 as it stands and does not edit level 1's files or cues. Where shared code (director, view, stage, story lights, cloud) needs new behaviour, Account B adds an option or a new cue action and leaves the existing defaults alone.
- Account B works in `fo-wt-story-lN` worktrees off `origin/main` and never touches the `farthest-outpost` main checkout. That checkout holds Account A's unpushed commits.

## Claims (files being edited right now)

Add a line when you start editing a shared file. Remove it when your push lands. If someone else has claimed the file, add your edit after their push, or note it here and message Doug.

| Since | Who | Branch | Files | For |
|---|---|---|---|---|
| 2026-11-02 | B | `story-l2` | `levels/story/story-L002.json`; `skins/src/mars_greenhouse.ts` (only the `story-L002` cue block and its strings); `client/src/story/*` (additions only) | Level 2 Roll Call |

`packages/client/release-notes.json` belongs to whoever is pushing at that moment. Rewrite it from scratch for your own push.

## Level status

| Level | Status | Notes |
|---|---|---|
| 1 Cold Start | Account A, live; Doug's sign-off pending | Not edited by B |
| 2 Roll Call | B, in progress | |
| 3 Open for Trade | Not started (old-story manifest still live) | |
| 4 Halcyon Works | Not started (old-story manifest still live) | |
| 5 First Watch | Not started (old-story manifest still live) | |

## Log

Newest first. Record what changed, which shared files were touched and why, rules and engine changes, and anything left open.

- **2026-11-02, B:** Started level 2 on branch `story-l2` from `0c569fa`.
