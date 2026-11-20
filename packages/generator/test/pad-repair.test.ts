import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { candidates, padTimeline, repairPads, lifetimeVisibility, type Manifest } from "../src/padRepair.js";
import { occluders } from "../src/viewVisibility.js";

const fix = (id: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/pad-visibility-levels/${id}.json`, import.meta.url)), "utf8")) as Manifest;
const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("pads visible for their whole life (Doug, 2026-11-15)", () => {
  it("does not count walls or wall-line gates, but counts the survivors' arrival gate", () => {
    const m = JSON.parse(readFileSync(`${root}levels/fixtures/s1-old/s1-L060.json`, "utf8")) as Manifest;
    const names = occluders(m.entities, { walls: "none" }).map((o) => o.name);
    expect(names).not.toContain("wall");
    expect(names.filter((n) => n === "struct.gate")).toHaveLength(1);
  });

  it("tries the south-east arc of the pad's own building at its own distance, south-east first", () => {
    expect(candidates([100, 100], 100)).toEqual([[171, 171], [197, 126], [126, 197]]);
  });

  it("Level 41 before the repair: the Core worker pad hides behind the shop; the repair swings it south-east of the Core", () => {
    const m = fix("s1-L041"), win = padTimeline(m);
    expect(lifetimeVisibility(m, win).find((p) => p.id === "hire_core")!.hidden).toBe(1);
    const r = repairPads(m, win);
    expect(r.moves.map((x) => [x.pads, x.to])).toEqual([[["hire_core"], [348, 589]]]);
    expect(r.unresolved).toEqual([]);
    expect(lifetimeVisibility(r.manifest).every((p) => p.hidden === 0)).toBe(true);
  });
});
