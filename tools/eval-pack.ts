import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evalPack, funTable } from "./eval-lib.js";

// pnpm levels:eval [pack (default s1)] [--only id,id] [--seeds 10] [--others 3] [--table [--bar 0.4]]
// Writes levels/eval/<pack>/<id>.json (every sub-point of the rating plus the defend trace) and index.json.
// Only reads levels/packs; pack.json and its hash are never touched.
// --table rates nothing: it prints the per-proxy fun table, defend against economy goals, from the side files
// already written (outpost-ops#99), and how many levels clear --bar.

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => { const i = args.indexOf(n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const table = args.includes("--table");
if (table) args.splice(args.indexOf("--table"), 1);
const bar = Number(flag("--bar") ?? "0.4");
const only = flag("--only")?.split(",");
const seeds = flag("--seeds"), others = flag("--others");
const pack = args.find((a) => !a.startsWith("--")) ?? "s1";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (table) {
  console.log(funTable(root, pack, bar));
} else {
  const t0 = Date.now();
  const rows = evalPack({ root, pack, ...(only ? { only } : {}), ...(seeds ? { refSeeds: Number(seeds) } : {}), ...(others ? { otherSeeds: Number(others) } : {}), log: (s) => console.log(s) });
  console.log(`${pack}: ${rows.length} levels in index, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
