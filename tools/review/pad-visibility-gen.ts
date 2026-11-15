// Pad visibility per shipped level under the real camera, from the shared measurement (packages/generator/src/viewVisibility.ts),
// printed as JSON { <levelId>: { hidden, partly, visible, pads: [ { id, type, at, visible, hidden, by, class } ] } }.
// pad-visibility.cjs measures the same thing in the running renderer; the generator test compares the two.
//   pnpm vite-node tools/review/pad-visibility-gen.ts -- <out.json>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { padVisibilityReport, type ViewEnt } from "../../packages/generator/src/index.js";

const out: Record<string, unknown> = {};
for (const [dir, re] of [["levels/packs/s1", /^s1-L\d+\.json$/], ["levels/story", /^story-L\d+\.json$/]] as const) {
  for (const f of readdirSync(dir).filter((x) => re.test(x))) {
    const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as { id: string; entities: ViewEnt[] };
    const r = padVisibilityReport(j.entities);
    out[j.id] = { hidden: r.hidden, partly: r.partly, visible: r.visible, pads: r.pads.map((p) => ({ id: p.id, type: p.type, at: p.at, visible: p.visible, hidden: p.hidden, by: p.by, class: p.class })) };
  }
}
writeFileSync(process.argv[process.argv.length - 1]!, JSON.stringify(out, null, 1));
