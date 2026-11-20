import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTENT_VERSION, Manifest } from "@fo/content";
import { ENGINE_VERSION, createSim, fp, TPS } from "@fo/sim";
import { PROFILES, playBot } from "../src/index.js";

// Level 3 part 1 (outpost-ops#129): the grow dome is built from carried ship scrap, and the old kiosk stays shut
// (no customer, so no Sela) until the player has walked to it.

const here = dirname(fileURLToPath(import.meta.url));
const manifest = (): Manifest => Manifest.parse({
  ...JSON.parse(readFileSync(resolve(here, "../../../levels/story/story-L003.json"), "utf8")),
  engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION,
});

describe("level 3: scrap dome and the found kiosk", () => {
  it("the dome pad is priced in salvage and unlocks the dome; scrap piles stand by the wreck", () => {
    const m = manifest();
    const dome = m.entities.find((e) => e.id === "dome") as { cost: Record<string, number>; build: string; target: string };
    expect(Object.keys(dome.cost)).toEqual(["res.salvage"]);
    expect(dome.build).toBe("node.enable");
    expect(dome.target).toBe("field1");
    expect((m.entities.find((e) => e.id === "field1") as { enabled: boolean }).enabled).toBe(false);
    expect(m.entities.filter((e) => e.type === "node.salvage_pile").length).toBeGreaterThanOrEqual(2);
    expect(m.objectives!.some((o) => o.id === "dome")).toBe(true);
  });

  it("no customer arrives until the player is within reach of the kiosk", () => {
    const m = manifest();
    const sim = createSim(m);
    const kiosk = m.entities.find((e) => e.id === "kiosk") as { at: [number, number]; openAfter: string };
    expect(kiosk.openAfter.startsWith("@reach:")).toBe(true);
    // the dome is open (the shelf could be stocked) but the player stays at the reactor: nothing queues for minutes
    sim.state.nodes.forEach((n) => { n.enabled = true; });
    for (let i = 0; i < 90 * TPS; i++) sim.step({ dx: 0, dy: 0 });
    expect(sim.state.sales!.queue.length + sim.state.sales!.nextCustomerId).toBe(0);
    // stand at the kiosk: customers start
    sim.state.player.pos = { x: fp(kiosk.at[0]), y: fp(kiosk.at[1] + 40) };
    for (let i = 0; i < 60 * TPS; i++) sim.step({ dx: 0, dy: 0 });
    expect(sim.state.sales!.nextCustomerId).toBeGreaterThan(0);
  });

  it("the bot still wins and earns the dome star", () => {
    const r = playBot(manifest(), PROFILES["good"]!, 1);
    expect(r.won).toBe(true);
    expect(r.objectives.find((o) => o.kind === "unlock")?.done).toBe(true);
  });
});

// levels:check (tools/regress-levels.ts): story levels list more than three star slots (outpost-ops#123), so a full
// run earns 4-6 stars; "no three-star seed" must mean no seed reached three, not no seed landed on exactly three.
describe("levels:check three-star rule", () => {
  it("counts a seed that earns more than three stars as a three-star seed", () => {
    const src = readFileSync(resolve(here, "../../../tools/regress-levels.ts"), "utf8");
    expect(src).toContain("rs.filter((r) => r.stars >= 3).length");
    expect(src).not.toContain("rs.filter((r) => r.stars === 3).length");
  });
});
