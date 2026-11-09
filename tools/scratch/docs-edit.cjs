const fs = require("fs");
let b = fs.readFileSync("docs/BACKLOG.md", "utf8");
const k = "## Waiting on Doug\n\n";
if (!b.includes(k)) throw new Error("no waiting section");
b = b.replace(k, () => k + `- [ ] **#85 · iPhone checks for Bundle 7 (Release 2 combat, engine 0.22.0).** On a defend level (e.g. s1-L015, s1-L048):
      1. Attackers shoot: acid bolts from mites, longer bolts from crawlers and raiders, in a danger colour; turret, guard, drone and ranger shots show as bolts too.
      2. A mite winds up (0.3 s, stands still) and then jumps you; the commander goes down at 0 hp, drops the pack and gets up. Guards and drones draw fire first, so this is rare with defenders out.
      3. Attackers queue behind each other at the gate instead of stacking; scrap lands where you can walk to it.
      4. Drones go back into their post between waves and come out with the next wave.
      5. A downed guard bleeds out in about a dozen seconds unless a medic reaches it.
      6. #81 on s1-L017: hire the ranger; it walks out through the gate, hunts and comes back in. Also check any walled level with a hired hunter.
      7. Dense-wave frame rate (s1-L037 last waves) still smooth on the phone.
`);
fs.writeFileSync("docs/BACKLOG.md", b);
let w = fs.readFileSync("docs/STORY-WORK-LOG.md", "utf8");
w = w.split("\n").filter((l) => !l.includes("Systems Bundle 7")).join("\n");
w = w.trimEnd() + `

### 2026-11-08 (Systems, Bundle 7): engine 0.22.0 landed, claim released

Release 2 combat is in (every call is in docs/DECISIONS.md, "Release 2 combat"). Story and Look can resume. Shared files touched: \`render-3d/src/renderer.ts\` (the \`shot\` event case: only a shot with no \`by\` makes the commander shoot; attackers get a danger-colour bolt; one-line \`tow_dropped\` floater fix), \`skins/src/mars_greenhouse.ts\` (removed the \`tow_slack\` text only). Level files under \`levels/story\`, \`levels/golden\` and the packs were re-pinned (versions only). Engine facts a story level can rely on: every attacker shoots (range 40–80 units) and prefers guards and drones to the commander; the commander can be downed; the spawn lane is 50 units off the edge; drones dock between waves; bodies queue at the gate. Level 5's authored waves have not been replayed by Story since this change: please run it once.
`;
fs.writeFileSync("docs/STORY-WORK-LOG.md", w);
