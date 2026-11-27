import { describe, expect, it } from "vitest";
import { flattenHidingScrap, occluders, padVisibility, type ViewEnt } from "../src/index.js";

// Standing rule (Doug, 2026-11-21): a scrap heap that hides a pad uses the flat scrap model (look 2).
const heap = (at: [number, number]): ViewEnt => ({ type: "node.salvage_pile", at });
const pad = (at: [number, number]): ViewEnt => ({ type: "pad.build", id: "p1", at, build: "struct.guard_post" });

describe("scrap heap that hides a pad", () => {
  // find a spot where the tall ship scrap (look 1) hides the pad: sweep behind the heap along the camera's far side
  const spot = (() => {
    for (let x = -60; x <= 60; x += 4) for (let z = -60; z <= 60; z += 4) {
      const ents = [{ ...heap([0, 0]), look: 1 } as ViewEnt, pad([x, z])];
      if (padVisibility(ents)[0]!.hidden > 0) return [x, z] as [number, number];
    }
    return null;
  })();

  it("a tall heap hides the pad before the change", () => {
    expect(spot).not.toBeNull();
  });
  it("the covering heap switches to the flat model, an uncovering one keeps the tall one", () => {
    const ents: ViewEnt[] = [{ ...heap([0, 0]), look: 1 } as ViewEnt, pad(spot!), { ...heap([400, 400]), look: 1 } as ViewEnt];
    expect(flattenHidingScrap(ents)).toBe(1);
    expect((ents[0] as { look?: number }).look).toBe(2);
    expect((ents[2] as { look?: number }).look).toBe(1);
    expect(padVisibility(ents)[0]!.hidden).toBe(0);
    expect(occluders(ents).filter((o) => o.name === "node.salvage_pile").length).toBe(1);
  });
});
