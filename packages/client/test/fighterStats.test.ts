import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { fighterSections } from "../src/dev/fighterStats.js";

describe("fighter stats panel", () => {
  it("shows every fighter group with a source on each row", () => {
    const secs = fighterSections();
    const ids = secs.map((s) => s.id);
    for (const id of ["player", "guard", "drone", "tower1", "tower2", "tower3", "medic", "hostile:hostile.swarmling", "hostile:hostile.boss"]) expect(ids).toContain(id);
    for (const s of secs) for (const r of s.rows) { expect(r.src.length).toBeGreaterThan(0); expect(r.value).not.toContain("NaN"); }
  });
  it("reads values from content, not copies", () => {
    const player = fighterSections().find((s) => s.id === "player")!;
    expect(player.rows.find((r) => r.label === "HP")!.value).toBe(String(content.defaults["player.hp"]));
  });
});
