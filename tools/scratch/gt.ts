import { createSim, attackGate, sectionMid } from "../../packages/sim/src/index.js";
import l4 from "../../levels/golden/proto-L004.json";
const b: any = l4;
const RING = { type: "barrier.line", id: "ring", res: "res.salvage", closed: true, costPerSection: 1, points: [[120, 400], [240, 400], [360, 400], [360, 520], [360, 640], [240, 640], [120, 640], [120, 520]], gates: [0, 2, 4, 6], prebuilt: [0,1,2,3,4,5,6,7] };
for (const side of ["n", "e", "s", "w"] as const) for (const seed of [1, 2, 3]) {
  const sim = createSim({ ...b, seed, entities: [...b.entities.filter((e: any) => e.type !== "barrier.line"), RING], params: { ...b.params, "player.rangedRange": 0 }, waves: [{ t: 1, counts: { "hostile.creature": 3 }, side, gap: 0.3 }] });
  const st: any = sim.state;
  const g = attackGate(st, side)!; const mid = sectionMid(g.line.sections[g.idx]!);
  for (let i = 0; i < 20 * 30; i++) sim.step({ dx: 0, dy: 0 });
  console.log(side, seed, "mid", mid.x / 1000, mid.y / 1000, st.hostiles.map((h: any) => `${Math.round(h.pos.x / 1000)},${Math.round(h.pos.y / 1000)}:${h.target}`).join(" "));
}
