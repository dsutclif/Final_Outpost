import { describe, expect, it } from "vitest";
import { PROFILES, playBot } from "@fo/bots";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById } from "../src/index.js";

// Engine 0.37: on an automate level every converter's output has a buyer (the smelter's ingots are carried to the sales point),
// and a supplier's gather time is the sized one, not the node's slower worker rate; so grill + smelter (2 machines) is winnable.
const mods = ["build_pads", "carry", "converters", "core", "gather", "sales", "supply_routing", "workers"];
describe("automate with a grill and a smelter", () => {
  it("gives the smelter an ingot server, sells ingots, and the good bot wins on some seed", () => {
    const base = sequenceRange(1, 25, [], { targetOffset: 0 })[24]!;
    let b: ReturnType<typeof buildLevel> | undefined;
    for (let salt = 0; salt < 6 && !b; salt++) {
      try { b = buildLevel({ id: "ai", seed: base.seed, family: "industrialize", secondary: null, features: ["material_processor"], goalType: "automate", modules: closure(mods as never), template: templateById(base.template), knobs: knobsFor(0.3) } as never, salt); } catch { /* next layout salt */ }
    }
    if (!b) throw new Error("no layout");
    const m = b.manifest as unknown as { goal: { machines: number }; entities: { type: string; sells?: string[] }[]; pads?: unknown };
    expect(m.goal.machines).toBe(2);
    expect(JSON.stringify(b.manifest)).toContain("ingot_server");
    expect(m.entities.find((e) => e.type === "sink.sales_point")!.sells).toContain("res.material_refined");
    const wins = [1, 2, 3, 4].filter((s) => playBot(b.manifest, PROFILES["good"]!, s, { timeBudgetSeconds: 900 }).won).length;
    expect(wins).toBeGreaterThan(0);
  }, 300_000);
});

describe("chain with a belt and a depot", () => {
  it("lays out (the plan has no requirement loop through the belt)", () => {
    const base = sequenceRange(1, 25, [], { targetOffset: 0 })[24]!;
    const errs: string[] = [];
    let ok = 0;
    for (let salt = 0; salt < 6; salt++) {
      try { buildLevel({ id: "cx", seed: base.seed, family: "industrialize", secondary: null, features: ["conveyors", "depot", "material_processor", "tier2"], goalType: "chain", modules: closure([...mods, "conveyors"] as never), template: templateById(base.template), knobs: knobsFor(0.3) } as never, salt); ok++; } catch (e) { errs.push((e as Error).message.slice(0, 80)); }
    }
    expect(errs.filter((e) => e.startsWith("plan order") || e.startsWith("pad order"))).toEqual([]);
    expect(ok).toBeGreaterThan(0);
  }, 120_000);
});
