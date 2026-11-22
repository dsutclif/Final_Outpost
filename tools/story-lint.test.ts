import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lintStory, type StoryManifest } from "./story-lint.js";
import { auditArrows } from "./review/arrow-audit.js";
import { analyzeLineGoals, type StoryGate } from "./review/probe-core.js";

const base = (over: Partial<StoryManifest>): StoryManifest => ({ id: "t", entities: [], objectives: [], modules: [], ...over });
const none = { module: {}, kiln: {} };
const rules = (m: StoryManifest, tips = none): string[] => lintStory(m, tips).map((w) => w.rule);

describe("story lint", () => {
  it("flags a job pad far from its building", () => {
    const m = base({ entities: [{ type: "sink.sales_point", id: "k", at: [0, 0] }, { type: "pad.hire", id: "p", at: [400, 0], role: { role: "role.cashier", to: "sink.sales_point" } }] });
    expect(rules(m)).toContain("pad-far");
    m.entities[1]!.at = [100, 0];
    expect(rules(m)).not.toContain("pad-far");
  });
  it("flags a turret off the road", () => {
    const m = base({ entities: [{ type: "sink.sales_point", id: "k", at: [0, 0], route: [[0, 0], [500, 0]] }, { type: "pad.build", id: "t1", at: [200, 600], build: "struct.ranged_defense", site: [200, 620] }] });
    expect(rules(m)).toContain("turret-off-road");
    m.entities[1]!.at = [200, 60];
    m.entities[1]!.site = [200, 80];
    expect(rules(m)).not.toContain("turret-off-road");
  });
  it("flags a goal resource with no HUD chip", () => {
    expect(rules(base({ entities: [{ type: "pad.build", id: "d", cost: { "res.salvage": 8 } }] }))).toContain("chip-missing");
    expect(rules(base({ entities: [{ type: "pad.build", id: "d", cost: { "res.currency": 8 } }] }))).not.toContain("chip-missing");
  });
  it("flags help text that names a gate the level lacks", () => {
    const tips = { module: { lasso: "Step out through the gate." }, kiln: {} };
    expect(rules(base({ modules: ["lasso"] }), tips)).toContain("help-noun-missing");
    expect(rules(base({ modules: ["lasso"], entities: [{ type: "struct.gate", id: "g" }] }), tips)).not.toContain("help-noun-missing");
  });
  it("flags build wording on an unlock goal", () => {
    expect(rules(base({ objectives: [{ id: "dome", kind: "unlock", label: "Build the grow dome" }] }))).toContain("build-vs-unlock");
    expect(rules(base({ objectives: [{ id: "dome", kind: "unlock", label: "Unlock the grow dome" }] }))).not.toContain("build-vs-unlock");
  });
  it("flags decor that looks like scrap beside a heap", () => {
    const m = base({ entities: [{ type: "node.salvage_pile", id: "h", at: [100, 100] }, { type: "decor.ship_wreck", id: "d", at: [150, 100] }] });
    expect(rules(m)).toContain("decor-looks-like-scrap");
    m.entities[1]!.at = [900, 900];
    expect(rules(m)).not.toContain("decor-looks-like-scrap");
  });
});

describe("arrow audit", () => {
  const rec = (arrows: { tick: number; id: string; type: string }[], goals = [{ id: "g1", kind: "hire", target: "", doneTick: 600 }]) =>
    ({ levelId: "t", ticks: 900, goals, arrows: arrows.map((a) => ({ tick: a.tick, key: "k" + a.tick, entityId: a.id, entityType: a.type })) });
  it("passes an arrow on the named pad that starts at once", () => {
    expect(auditArrows(rec([{ tick: 0, id: "cook", type: "pad.hire" }]))).toEqual([]);
  });
  it("flags a wrong target, a missing arrow and a late arrow", () => {
    expect(auditArrows(rec([{ tick: 0, id: "gate", type: "struct.gate" }])).map((w) => w.rule)).toEqual(["arrow-wrong-target", "arrow-missing"]);
    expect(auditArrows(rec([{ tick: 0, id: "ore", type: "node.fuel_scrap" }, { tick: 450, id: "cook", type: "pad.hire" }])).map((w) => w.rule)).toEqual(["arrow-late"]);
  });
});

describe("goal gates", () => {
  const cap = { text: "Then I'll bring in all five" } as never;
  const gate: StoryGate[] = [{ line: "bring in all five", afterGoal: ["pair"], beforeGoal: ["main"] }];
  it("needs the afterGoal done and the beforeGoal not done", () => {
    expect(analyzeLineGoals(cap, { goals: [{ id: "pair", done: true }, { id: "main", done: false }] } as never, gate)).toEqual([]);
    expect(analyzeLineGoals(cap, { goals: [{ id: "pair", done: false }, { id: "main", done: false }] } as never, gate).map((h) => h.check)).toEqual(["line-before-goal"]);
    expect(analyzeLineGoals(cap, { goals: [{ id: "pair", done: true }, { id: "main", done: true }] } as never, gate).map((h) => h.check)).toEqual(["line-after-goal"]);
  });
  it("names only goals the level really has", () => {
    const gates = JSON.parse(readFileSync(new URL("./review/story-gates.json", import.meta.url), "utf8")) as Record<string, StoryGate[]>;
    for (const [id, list] of Object.entries(gates)) {
      if (id.startsWith("_")) continue;
      const lvl = JSON.parse(readFileSync(new URL(`../levels/story/${id}.json`, import.meta.url), "utf8")) as { objectives: { id: string }[] };
      const have = new Set(lvl.objectives.map((o) => o.id));
      for (const g of list) for (const o of [...(g.beforeGoal ?? []), ...(g.afterGoal ?? [])]) expect(have.has(o), `${id}: ${o}`).toBe(true);
    }
  });
});
