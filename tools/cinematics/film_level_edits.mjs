// The level edits the reworked crash_open film needs (Doug approved the film set 2026-11-09). NOT applied yet: the story files
// are being edited by another session. Run from the repo root once they are free, then `pnpm levels:check --pack levels/story`:
//   node tools/cinematics/film_level_edits.mjs [--dry]
// Idempotent: it sets absolute values, so running it twice changes nothing the second time.
//  - the crash-site tube scrap `scrap` moves 100 units west (L1 469.4 -> 369.4; L2-3 359.4 -> 259.4; L4-5 359.4 -> 259.4);
//  - level 1 `start` = the film's last frame (game_film.py END print: commander at -3.75 m, -0.21 m from pod0)
//    = [453.9, 130.8]; Doug's held spot was [451.7, 138.9], 0.3 m away;
//  - the pods sit 0.30 m in the sand, not 0.80 (docs/SCALE.md): pod lift -22.4 -> -8.4, closed glass lift 13.3 -> 27.3;
//  - the commander's glass (lid0) opens widthwise, hinged on the long side: yaw -90, roll -105 about its own long axis,
//    at pod0 + (16.5, -0.6) units, lift 31.5 (the film's end pose, game_film.py "LID OPEN pose"). NEEDS the renderer to
//    apply `roll` about the model's own axis before `yaw` (three Euler order "YXZ"; today XYZ), see docs/handoff/film-game-side.md;
//  - FILM_VERSIONS.crash_open bump in packages/client/src/cinematics.ts.
import fs from "node:fs";

const dry = process.argv.includes("--dry");
const SCRAP_X = { 1: 369.4, 2: 259.4, 3: 259.4, 4: 259.4, 5: 259.4 };
const L1_START = [453.9, 130.8];
const POD_LIFT = -8.4, CLOSED_LID_LIFT = 27.3;
const LID0 = { dx: 16.5, dy: -0.6, lift: 31.5, yaw: -90, roll: -105 };
let changed = 0;

for (const n of [1, 2, 3, 4, 5]) {
  const p = `levels/story/story-L00${n}.json`;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const by = Object.fromEntries(j.entities.filter((e) => e.id).map((e) => [e.id, e]));
  const set = (o, k, v) => { if (JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; changed++; } };
  set(by.scrap.at, 0, SCRAP_X[n]);
  if (n === 1) set(j, "start", L1_START);
  for (let i = 0; i < 5; i++) {
    const pod = by[`pod${i}`], lid = by[`lid${i}`];
    if (pod) set(pod, "lift", POD_LIFT);
    if (!lid) continue;
    if (lid.roll) continue; // an opened glass (lid0 everywhere, lid1 from level 3) is posed below / by its own level
    set(lid, "lift", CLOSED_LID_LIFT);
  }
  const l0 = by.lid0, p0 = by.pod0;
  set(l0.at, 0, Math.round((p0.at[0] + LID0.dx) * 10) / 10);
  set(l0.at, 1, Math.round((p0.at[1] + LID0.dy) * 10) / 10);
  set(l0, "lift", LID0.lift); set(l0, "yaw", LID0.yaw); set(l0, "roll", LID0.roll);
  if (!dry) fs.writeFileSync(p, JSON.stringify(j, null, 1) + "\n");
}
{
  const p = "packages/client/src/cinematics.ts";
  const t = fs.readFileSync(p, "utf8");
  const m = t.match(/crash_open: (\d+)/);
  const want = Number(m[1]) + 1;
  if (!process.argv.includes("--no-bump")) {
    const u = t.replace(/crash_open: \d+/, `crash_open: ${want}`);
    if (!dry) fs.writeFileSync(p, u);
    console.log(`FILM_VERSIONS.crash_open ${m[1]} -> ${want}`);
  }
}
console.log(`${dry ? "would change" : "changed"} ${changed} level values`);
