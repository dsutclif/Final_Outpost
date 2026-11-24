import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim } from "../src/index.js";

// outpost-ops#366: a manifest person can carry `boost` (story level 4's Tam): once its objective is done it carries more and
// alternates its delivery targets. Without the field (every other person) nothing changes.

const L4 = JSON.parse(readFileSync(new URL("../../../levels/story/story-L004.json", import.meta.url), "utf8")) as { people: { node?: string; boost?: unknown }[] };

function tam(boosted: boolean) {
  const sim = createSim(L4);
  const r = sim.state.residents.find((x) => x.assign.node === "field1")!;
  if (boosted) sim.state.objectives.find((o) => o.id === "train")!.done = true;
  let maxN = 0;
  const tos = new Set<string | null>();
  for (let i = 0; i < 2400; i++) { sim.step({ dx: 0, dy: 0 }); maxN = Math.max(maxN, r.n); tos.add(r.assign.to); }
  return { maxN, tos };
}

describe("person boost", () => {
  it("level 4's Tam has the boost field", () => expect(L4.people.find((p) => p.node === "field1")?.boost).toBeDefined());
  it("carries 3 before the objective, up to 6 after", () => {
    expect(tam(false).maxN).toBe(3);
    expect(tam(true).maxN).toBe(6);
  });
  it("alternates its target once boosted, never before", () => {
    expect(tam(false).tos.size).toBe(1);
    expect(tam(true).tos.size).toBe(2);
  });
});
