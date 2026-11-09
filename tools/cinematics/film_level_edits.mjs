// The level edits the reworked crash_open film needs (Doug approved the film set 2026-11-09). NOT applied yet: the story files
// are being edited by another session. Run from the repo root once they are free, then `pnpm levels:check --pack levels/story`:
//   node tools/cinematics/film_level_edits.mjs [--dry]
// Idempotent: it sets absolute values, so running it twice changes nothing the second time.
//  - the crash-site tube scrap `scrap` moves 100 units west (L1 469.4 -> 369.4; L2-3 359.4 -> 259.4; L4-5 359.4 -> 259.4);
//  - level 1 `start` = the film's last frame (game_film.py END print: commander at -3.75 m, -0.21 m from pod0)
//    = [453.9, 130.8]; Doug's held spot was [451.7, 138.9], 0.3 m away;
//  - the pods sit 0.30 m in the sand, not 0.80 (docs/SCALE.md): pod lift -22.4 -> -8.4, closed glass lift 13.3 -> 27.3;
//  - the commander's glass (lid0) opens widthwise, hinged on the long side: yaw -90, roll -105 about its own long axis,
//    at pod0 + (16.5, -0.6) units, lift 31.5 (the film's end pose, game_film.py "LID OPEN pose"); the renderer already turns decor roll
//    about the model's own long axis before yaw (three Euler order YXZ), so no renderer change is needed;
//  - FILM_VERSIONS.crash_open bump in packages/client/src/cinematics.ts.
import fs from "node:fs";

const dry = process.argv.includes("--dry");
const SCRAP_X = { 1: 369.4, 2: 369.4, 3: 369.4, 4: 369.4, 5: 369.4 }; // the shared map (82641ab) puts every level's scrap at 469.4
const FILM_END = { dx: -105.1, dy: 5.8 }; // game_film.py END: commander at -3.75 m, -0.21 m from pod0 (28 units per metre)
const POD_LIFT = -8.4, CLOSED_LID_LIFT = 27.3;
const LID0 = { dx: 16.5, dy: -0.6, lift: 31.5, yaw: -90, roll: -105 };
let changed = 0;

for (const n of [1, 2, 3, 4, 5]) {
  const p = `levels/story/story-L00${n}.json`;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const by = Object.fromEntries(j.entities.filter((e) => e.id).map((e) => [e.id, e]));
  const set = (o, k, v) => { if (JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; changed++; } };
  set(by.scrap.at, 0, SCRAP_X[n]);
  if (n === 1) { set(j.start, 0, Math.round((by.pod0.at[0] + FILM_END.dx) * 10) / 10); set(j.start, 1, Math.round((by.pod0.at[1] + FILM_END.dy) * 10) / 10); }
  for (let i = 0; i < 5; i++) {
    const pod = by[`pod${i}`], lid = by[`lid${i}`];
    if (pod) set(pod, "lift", POD_LIFT);
    if (!lid) continue;
    if (!lid.roll) { set(lid, "lift", CLOSED_LID_LIFT); continue; }
    // an opened glass (lid0 everywhere, lid1 from level 3): the film's open pose, turned into this pod's frame
    // (level coordinates: turning the pod by d degrees of yaw turns the offset by -d)
    const ph = (-(pod.yaw + 90) * Math.PI) / 180, c = Math.cos(ph), sn = Math.sin(ph);
    const ox = LID0.dx * c - LID0.dy * sn, oy = LID0.dx * sn + LID0.dy * c;
    set(lid.at, 0, Math.round((pod.at[0] + ox) * 10) / 10);
    set(lid.at, 1, Math.round((pod.at[1] + oy) * 10) / 10);
    set(lid, "lift", LID0.lift); set(lid, "yaw", pod.yaw); set(lid, "roll", LID0.roll);
  }
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
