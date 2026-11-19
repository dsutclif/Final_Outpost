import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sequenceRange } from "../packages/sequencer/src/index.js";
import { findFit } from "../packages/sequencer/src/pool.js";
import { levelsDirOf, loadPool, removeEntry, savePassing, type PoolRow } from "./level-pool.js";

// Pool file side (outpost-ops#254): what is saved, dedupe, engine filter on save, removal on use.
const req = sequenceRange(1, 30)[29]!;
const row = (over: Partial<PoolRow> & { D?: number; F?: number } = {}): PoolRow => ({
  seed: 7, attempt: 0, iteration: 3, rejects: ["offTarget"], manifest: { id: "m", n: over.D ?? 0.5 }, stars: { good: 3 },
  rating: { D: over.D ?? req.target + 0.3, F: over.F ?? 0.9, feasible: true }, ...over,
});
const path = () => join(mkdtempSync(join(tmpdir(), "pool-")), "level-pool.json");
const meta = { engine: "0.36.0", date: "2026-11-19" };

describe("level pool save", () => {
  it("saves a candidate whose only reject is offTarget, with its level file", () => {
    const p = path();
    const saved = savePassing(p, req, "recipe-key", [row()], meta);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ family: req.family, goalId: req.goalId, features: req.features, engine: "0.36.0", recipeId: "recipe-key", seed: 7, date: "2026-11-19", slotId: req.id });
    expect(loadPool(p).entries).toHaveLength(1);
    expect(existsSync(join(levelsDirOf(p), saved[0]!.file))).toBe(true);
  });
  it("keeps out anything that failed another check, low fun, infeasible, the level that shipped, and repeats", () => {
    const p = path();
    const rows = [row({ rejects: ["offTarget", "stars"] }), row({ rejects: [] }), row({ F: req.funThreshold - 0.1 }), row({ rating: { D: 0.9, F: 1, feasible: false } }), row({ D: 0.77 })];
    expect(savePassing(p, req, "k", rows, { ...meta, skipD: 0.77 })).toHaveLength(0);
    expect(savePassing(p, req, "k", [row()], meta)).toHaveLength(1);
    expect(savePassing(p, req, "k", [row()], meta)).toHaveLength(0); // same level again
  });
  it("drops entries from an older engine when it saves", () => {
    const p = path();
    savePassing(p, req, "k", [row({ manifest: { id: "old" } })], { ...meta, engine: "0.35.0" });
    savePassing(p, req, "k", [row({ manifest: { id: "new" } })], meta);
    expect(loadPool(p).entries.map((e) => e.engine)).toEqual(["0.36.0"]);
    expect(readdirSync(levelsDirOf(p))).toHaveLength(1);
  });
  it("a saved entry is found by findFit for a slot it fits, and leaves when used", () => {
    const p = path();
    const [e] = savePassing(p, req, "k", [row({ D: req.target + 0.06 })], meta);
    const hist: never[] = [];
    expect(findFit(loadPool(p), req, hist, { failGap: 0.1, engine: "0.36.0" })?.id).toBe(e!.id);
    expect(removeEntry(p, e!.id)).toBe(true);
    expect(findFit(loadPool(p), req, hist, { failGap: 0.1, engine: "0.36.0" })).toBeNull();
    expect(existsSync(join(levelsDirOf(p), e!.file))).toBe(false);
  });
});
