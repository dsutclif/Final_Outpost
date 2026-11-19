// Write a register that excludes the first K offered recipes of a slot: pnpm vite-node tools/recipe-skip.ts -- <out.json> <level index> <K>
import { readFileSync, writeFileSync } from "node:fs";
import { sequenceRange, recipeOf, recipeKey } from "../packages/sequencer/src/index.js";
const a = process.argv.slice(-3); // out, index, skipCount
const [out, idxS, kS] = a as [string, string, string];
const idx = Number(idxS), K = Number(kS);
const reg = { about: "scratch", settings: { failGap: 0.1, maxRerolls: 0, targetBand: 0.1 }, entries: [] as unknown[] };
for (let k = 0; k <= K; k++) {
  const r = sequenceRange(1, idx, [], { targetOffset: 0, register: reg as never, engine: "0.35.0" }).at(-1)!;
  if (k === K) console.log("OFFERED", k + 1, recipeKey(recipeOf(r, 0.1)).replace(/\|m:[^|]*/, ""));
  else reg.entries.push({ key: recipeKey(recipeOf(r, 0.1)), recipe: recipeOf(r, 0.1), engine: "0.35.0", date: "x" });
}
writeFileSync(out, JSON.stringify(reg));
