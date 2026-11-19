// List the next 8 recipes the sequencer offers for a slot: pnpm vite-node tools/recipe-peek.ts -- <register.json> <level index>
import { readFileSync } from "node:fs";
import { sequenceRange, recipeOf, recipeKey } from "../packages/sequencer/src/index.js";
const reg = JSON.parse(readFileSync(process.argv[process.argv.length - 2]!, "utf8"));
const idx = Number(process.argv[process.argv.length - 1]);
for (let k = 0; k < 8; k++) {
  const r = sequenceRange(1, idx, [], { targetOffset: 0, register: reg, engine: "0.35.0" }).find((q: any) => q.index === idx || q.id === "s1-L0" + idx) ?? sequenceRange(1, idx, [], { targetOffset: 0, register: reg, engine: "0.35.0" }).at(-1)!;
  const key = recipeKey(recipeOf(r, 0.1));
  console.log("OFFERED", k, key, "target", r.target);
  reg.entries.push({ key, recipe: recipeOf(r, 0.1), engine: "0.35.0", date: "x" });
}
