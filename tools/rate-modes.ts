import { readFileSync } from "node:fs";
import { rate } from "../packages/rater/src/index.js";
const dir = "packages/rater/test/fixtures/modes";
for (const f of ["defend", "harvest", "rescue"]) for (const mo of ["cadet", "pilot", "captain"]) {
  const r = rate(JSON.parse(readFileSync(`${dir}/${f}-${mo}.json`, "utf8")), { refSeeds: 4, otherSeeds: 1 });
  console.log(f, mo, "D", r.D.toFixed(3), "feasible", r.feasible, "win", JSON.stringify(r.winRate), "margin", JSON.stringify(r.margin));
}
