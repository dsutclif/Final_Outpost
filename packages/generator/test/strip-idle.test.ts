import { describe, expect, it } from "vitest";
import type { Manifest } from "@fo/content";
import { stripIdle } from "../src/index.js";

const mk = (entities: unknown[]): Manifest => ({ entities } as unknown as Manifest);

describe("stripIdle", () => {
  it("removes an idle pad, a line and disables an idle node type", () => {
    const m = mk([
      { type: "pad.build", id: "housing1", build: "struct.housing" },
      { type: "pad.build", id: "a", build: "conv.x", requires: { pad: "housing1" } },
      { type: "barrier.line", id: "L1" },
      { type: "node.wood", id: "n1", at: [0, 0] },
      { type: "pad.hire", id: "h" },
    ]);
    const out = stripIdle(m, ["pad housing1", "line L1", "nodes node.wood"])!;
    expect(out.entities.map((e) => (e as { id: string }).id)).toEqual(["n1", "h"]);
    expect((out.entities[0] as { enabled?: boolean }).enabled).toBe(false);
    expect(m.entities).toHaveLength(5);
  });
  it("returns null when something cannot be removed cleanly", () => {
    for (const x of ["turret ladder", "captures", "prey", "no winning run"]) expect(stripIdle(mk([]), ["pad a", x])).toBeNull();
  });
});
