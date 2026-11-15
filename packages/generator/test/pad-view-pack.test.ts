import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { padVisibilityReport, type ViewEnt } from "../src/index.js";

// The pad-visibility baseline of the shipped levels: how many pads are hidden or partly hidden on screen under the real
// camera (viewVisibility.ts) in each level today. The count can only go down: a level that gets worse than the committed
// baseline fails, the known baseline does not. After a re-layout that improves levels, rewrite it:
//   UPDATE_PAD_BASELINE=1 pnpm vitest run packages/generator/test/pad-view-pack.test.ts
interface Row { hidden: number; partly: number; hiddenPads: string[]; partlyPads: string[] }
type Baseline = { _doc: string; total: { levelsAffected: number; levelsHidden: number; hiddenPads: number; partlyPads: number }; levels: Record<string, Row> };

const root = fileURLToPath(new URL("../../../", import.meta.url));
const FILE = fileURLToPath(new URL("./pad-view-baseline.json", import.meta.url));

function measure(): Record<string, Row> {
  const out: Record<string, Row> = {};
  for (const [dir, re] of [["levels/packs/s1", /^s1-L\d+\.json$/], ["levels/story", /^story-L\d+\.json$/]] as const) {
    for (const f of readdirSync(root + dir).filter((x) => re.test(x)).sort()) {
      const j = JSON.parse(readFileSync(`${root}${dir}/${f}`, "utf8")) as { id: string; entities: ViewEnt[] };
      const pads = padVisibilityReport(j.entities).pads;
      out[j.id] = { hidden: pads.filter((p) => p.class === "hidden").length, partly: pads.filter((p) => p.class === "partly").length,
        hiddenPads: pads.filter((p) => p.class === "hidden").map((p) => p.id), partlyPads: pads.filter((p) => p.class === "partly").map((p) => p.id) };
    }
  }
  return out;
}

describe("pad visibility of the shipped levels (baseline: can only go down)", () => {
  const now = measure();
  const total = (l: Record<string, Row>) => ({
    levelsAffected: Object.values(l).filter((r) => r.hidden + r.partly > 0).length, levelsHidden: Object.values(l).filter((r) => r.hidden > 0).length,
    hiddenPads: Object.values(l).reduce((a, r) => a + r.hidden, 0), partlyPads: Object.values(l).reduce((a, r) => a + r.partly, 0),
  });
  if (process.env["UPDATE_PAD_BASELINE"]) {
    const b: Baseline = { _doc: "Pads hidden (75% or more of the disc covered) or partly hidden on screen per shipped level, tower pads included. Test: pad-view-pack.test.ts. Only ever rewritten when the numbers go down.", total: total(now), levels: now };
    writeFileSync(FILE, JSON.stringify(b, null, 1) + "\n");
  }
  const base = JSON.parse(readFileSync(FILE, "utf8")) as Baseline;

  it("measures every shipped level (60: 5 story and 55 pack)", () => {
    expect(Object.keys(now).length).toBe(60);
    expect(Object.keys(base.levels).sort()).toEqual(Object.keys(now).sort());
  });

  it("no level is worse than the committed baseline", () => {
    const worse: string[] = [];
    for (const [id, r] of Object.entries(now)) {
      const b = base.levels[id];
      if (!b) { worse.push(`${id}: not in the baseline`); continue; }
      const newHidden = r.hiddenPads.filter((p) => !b.hiddenPads.includes(p));
      if (r.hidden > b.hidden || newHidden.length) worse.push(`${id}: hidden pads ${r.hidden} (baseline ${b.hidden})${newHidden.length ? `, newly hidden: ${newHidden.join(", ")}` : ""}`);
      else if (r.hidden + r.partly > b.hidden + b.partly) worse.push(`${id}: hidden or partly hidden ${r.hidden + r.partly} (baseline ${b.hidden + b.partly})`);
    }
    expect(worse).toEqual([]);
  });

  it("the totals can only go down", () => {
    const t = total(now), bt = base.total;
    expect(t.levelsAffected).toBeLessThanOrEqual(bt.levelsAffected);
    expect(t.levelsHidden).toBeLessThanOrEqual(bt.levelsHidden);
    expect(t.hiddenPads).toBeLessThanOrEqual(bt.hiddenPads);
  });
});
