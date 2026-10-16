import { CONTENT_VERSION } from "@fo/content";
import { describe, expect, it } from "vitest";
import level3 from "../../../levels/golden/proto-L003.json";
import { ENGINE_VERSION, FP, createSim, fp } from "../src/index.js";

// R3 item 18: a build pad may name a `site` where its structure stands (a wall tower's post),
// while the player still pays on the pad. Without a site nothing changes.

type Ent = Record<string, unknown> & { id?: string };
const withSite = (site: [number, number] | null) => {
  const m = structuredClone({ ...level3, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION }) as { entities: Ent[] };
  const grill = m.entities.find((e) => e.id === "grill")!;
  if (site) grill["site"] = site;
  return { m, at: grill["at"] as [number, number] };
};

function buildGrill(manifest: object, at: [number, number]) {
  const sim = createSim(manifest);
  const tx = fp(at[0]), ty = fp(at[1]);
  for (let i = 0; i < 30 * 30 && !sim.state.converters.length; i++) {
    sim.state.currency = 99;
    const p = sim.state.player.pos, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    sim.step(d < 3 * FP ? { dx: 0, dy: 0 } : { dx: Math.round((dx / d) * FP), dy: Math.round((dy / d) * FP) });
  }
  return sim;
}

describe("build pad site", () => {
  it("places the structure at its site, not on the pad", () => {
    const { m, at } = withSite([100, 560]);
    const sim = buildGrill(m, at);
    const cv = sim.state.converters[0]!;
    expect(cv.pos).toEqual({ x: fp(100), y: fp(560) });
    expect(cv.operatorPos.y - cv.pos.y).toBeGreaterThan(0); // offsets follow the site
  });

  it("without a site the structure stands on the pad as before", () => {
    const { m, at } = withSite(null);
    const sim = buildGrill(m, at);
    expect(sim.state.converters[0]!.pos).toEqual({ x: fp(at[0]), y: fp(at[1]) });
    expect(sim.state.pads.find((p) => p.id === "grill")!.site).toBeUndefined();
  });
});
