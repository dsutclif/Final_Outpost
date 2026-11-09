import { createSim, fp } from "../../packages/sim/src/index.js";
import { gatedMove } from "../../packages/sim/src/systems/barriers.js";
import l4 from "../../levels/golden/proto-L004.json";
const RING = { type: "barrier.line", id: "ring", res: "res.salvage", closed: true, costPerSection: 1,
  points: [[120, 400], [240, 400], [360, 400], [360, 520], [360, 640], [240, 640], [120, 640], [120, 520]], gates: [1, 5], prebuilt: [0,1,2,3,4,5,6,7] };
const b: any = l4;
const s = createSim({ ...b, entities: [...b.entities.filter((e: any) => e.type !== "barrier.line"), RING] });
const pos = { x: fp(108), y: fp(670) }, t = { x: fp(109), y: fp(300) };
for (let i = 0; i < 400; i++) { gatedMove(s.state, s.compiled, pos, t, 2667, 3000); if (i % 20 === 0) console.log(i, pos.x / 1000, pos.y / 1000); }
