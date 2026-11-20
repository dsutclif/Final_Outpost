// Scratch trace (stuck-fixes fix 4): can a ladder rung lose a rescue level at more pods? One request per slot, pods dial set by knob override.
//   vite-node tools/rescue-trace.ts -- 12,23 6,9 0.5
import { writeFileSync } from "node:fs";
import { closure, sequenceRange } from "../packages/sequencer/src/index.js";
import { buildLevel, templateById, knobsFor, GEN } from "../packages/generator/src/index.js";
import { PROFILES, playBot } from "../packages/bots/src/index.js";
const [slots, podsList, pArg] = process.argv.slice(2).filter((a) => a !== "--");
const reqs = sequenceRange(1, 25);
for (const slot of slots!.split(",").map(Number)) {
  const r = reqs[slot - 1]!;
  for (const pods of podsList!.split(",").map(Number)) {
    for (const fz of (process.env["FZ"] ?? "85").split(",").map(Number)) {
      
      let b: ReturnType<typeof buildLevel> | null = null;
      for (let salt = 0; salt < GEN.search.layoutTries && !b; salt++) { try { b = buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType, modules: closure(r.modules), template: templateById(r.template), knobs: { ...knobsFor(Number(pArg ?? 0.5), {}, r.family), pods, podFreeze: fz }, walls: true }, salt); } catch { /* next */ } }
      if (!b) { console.log(`L${slot} pods ${pods} fz ${fz}: no build`); continue; }
      const pods_n = (b.manifest.entities as { type: string }[]).filter((e) => /rescue|survivor|pod/.test(e.type)).length;
      const out = ["good", "average", "weak", "novice", "floor"].map((n) => { const x = playBot(b!.manifest, PROFILES[n]!, 1, { timeBudgetSeconds: 900 }) as { won: boolean; margin?: number; reason?: string }; return `${n}:${x.won ? "W" : "L"}${x.margin !== undefined ? (x.margin).toFixed(2) : ""}`; });
      console.log(`L${slot} ${r.goalType} pods ${pods} (${pods_n} pod ents) fz ${fz}: ${out.join(" ")}`);
    }
  }
}
