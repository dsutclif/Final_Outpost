import { createSim } from "../../packages/sim/src/index.js";
import { readFileSync } from "node:fs";
const m = JSON.parse(readFileSync("levels/packs/s1/s1-L017.json", "utf8"));
const sim = createSim(m);
const st = sim.state as any;
const r = st.residents[0];
r.role = "role.hunter"; r.assign = { from: "node.prey", to: "sink.sales_point", node: null, post: null }; r.status = "ok";
let picked = 0, minD = 1e9;
for (let i = 0; i < 3000; i++) {
  const ev = sim.step({ dx: 0, dy: 0 });
  picked += ev.filter((e: any) => e.t === "picked").length;
  if (i % 150 === 0) console.log(i, Math.round(r.pos.x / 1000), Math.round(r.pos.y / 1000), r.mode, r.n, "prey", st.prey.map((p: any) => `${Math.round(p.pos.x/1000)},${Math.round(p.pos.y/1000)}${p.alive?"":"x"}`).join(" "));
}
console.log("picked", picked);
