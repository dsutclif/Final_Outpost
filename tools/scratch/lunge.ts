import { createSim, fp } from "../../packages/sim/src/index.js";
import l4 from "../../levels/golden/proto-L004.json";
const b: any = l4;
const RING = { type: "barrier.line", id: "ring", res: "res.salvage", closed: true, costPerSection: 1, points: [[120, 400], [240, 400], [360, 400], [360, 520], [360, 640], [240, 640], [120, 640], [120, 520]], gates: [0, 2, 4, 6], prebuilt: [0,1,2,3,4,5,6,7] };
const sim = createSim({ ...b, waves: [{ t: 9999, counts: { "hostile.creature": 1 }, side: "n", gap: 1 }], entities: [...b.entities.filter((e: any) => e.type !== "barrier.line"), RING] });
const st: any = sim.state;
st.player.pos = { x: fp(200), y: fp(300) };
const def = sim.compiled.hostiles["hostile.swarmling"]!;
console.log(def.lungeRange, def.lungeWindTicks, st.player.stun, st.player.hp);
st.hostiles.push({ id: 99, type: "hostile.swarmling", pos: { x: fp(226), y: fp(300) }, hp: 1, hpMax: 1, side: "n", target: "core", acc: 0 });
for (let i = 0; i < 30; i++) { const ev = sim.step({ dx: 0, dy: 0 }); console.log(i, st.hostiles[0]?.pos.x, st.player.pos.x, ev.map((e: any) => e.t).join(",")); }
