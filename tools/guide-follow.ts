import { readFileSync } from "node:fs";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION, createSim, FP } from "../packages/sim/src/index.js";
import { marsGreenhouse as skin } from "../packages/skins/src/index.js";
import { Guide } from "../packages/client/src/guide.js";

// Dev helper: pnpm vite-node tools/guide-follow.ts -- levels/packs/s1/s1-L050.json [--seconds 600] [--quiet]
// Plays a level the way a player who only follows the guide arrow would (walk to the arrow, stand
// there) and logs every change of step, so a guide that stalls or loops shows up. (Outside the tools
// typecheck: it reaches into the client package, which is not a project reference.)

const argv = process.argv.slice(2);
const file = argv.find((a) => a.endsWith(".json"))!;
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const seconds = Number(arg("--seconds", "600"));
const quiet = argv.includes("--quiet");
// pinned to the running engine so a level from an older pack can still be tried
const sim = createSim({ ...JSON.parse(readFileSync(file, "utf8")), engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION });
const guide = await Guide.create(sim.compiled.manifest, sim.compiled);
if (!guide) throw new Error("no guide for this level");
let last = "", since = 0;
const runs: Record<string, number> = {};
for (let t = 0; t < seconds * 30 && !sim.state.over; t++) {
  const st = sim.state;
  const g = guide.update(st, skin);
  const key = g ? `${g.key} "${g.text}"` : "none";
  if (key !== last) {
    if (!quiet) console.log(`${(st.tick / 30).toFixed(1)}s  ${key}  fuel=${st.core.fuel} pile=${st.sales?.pileN ?? 0} cur=${st.currency} pack=${st.player.stack.join(",")}`);
    last = key; since = st.tick;
  }
  runs[key] = Math.max(runs[key] ?? 0, st.tick - since);
  let dx = 0, dy = 0;
  if (g) {
    const ex = g.at.x * FP - st.player.pos.x, ey = g.at.y * FP - st.player.pos.y, L = Math.hypot(ex, ey);
    if (L > 6 * FP) { dx = Math.round((ex / L) * 1000); dy = Math.round((ey / L) * 1000); }
  }
  sim.step({ dx, dy });
}
const st = sim.state;
console.log(`end ${(st.tick / 30).toFixed(0)}s over=${st.over} won=${st.won} reason=${st.reason ?? ""}`);
console.log("longest unchanged step (s):", Object.entries(runs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${(v / 30).toFixed(0)} ${k}`).join(" | "));
