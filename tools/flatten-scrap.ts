// Sets `look: 2` (the flat scrap field) on every scrap heap that hides a pad, in the shipped pack and story levels.
//   pnpm vite-node tools/flatten-scrap.ts -- [--write]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { flattenHidingScrap, padVisibilityReport, type ViewEnt } from "../packages/generator/src/index.js";

const write = process.argv.includes("--write");
let before = 0, after = 0, heaps = 0;
for (const [dir, re] of [["levels/packs/s1", /^s1-L\d+\.json$/], ["levels/story", /^story-L\d+\.json$/]] as const) {
  for (const f of readdirSync(dir).filter((x) => re.test(x)).sort()) {
    const path = `${dir}/${f}`, raw = readFileSync(path, "utf8"), j = JSON.parse(raw) as { id: string; entities: ViewEnt[] };
    const b = padVisibilityReport(j.entities).hidden;
    const n = flattenHidingScrap(j.entities), a = padVisibilityReport(j.entities).hidden;
    before += b; after += a; heaps += n;
    if (n) console.log(`${j.id}: ${n} heaps flattened, hidden pads ${b} -> ${a}`);
    if (n && write) {
      // edit the text in place (the files have their own layout): add `"look": 2` after the type line of each flattened heap
      const heapsIdx = j.entities.filter((e) => e.type === "node.salvage_pile");
      let k = -1;
      const text = raw.replace(/^(\s*)"type": "node\.salvage_pile",\r?\n/gm, (m, ind: string) => (++k, (heapsIdx[k] as { look?: number }).look === 2 ? `${m}${ind}"look": 2,${m.endsWith("\r\n") ? "\r\n" : "\n"}` : m));
      writeFileSync(path, text);
    }
  }
}
console.log({ before, after, heaps });
