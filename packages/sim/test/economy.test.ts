import { describe, expect, it } from "vitest";
import { fp, isAutomation, jobOf, padCost, type Sim } from "../src/index.js";
import { stepManual } from "../src/systems/economy.js";
import { LEVEL_1, newSim } from "./helpers.js";

// docs/ECONOMY-PLAN.md: manual first (the first hire of a job kind waits until the player has done that
// job by hand) and the automation tax (each worker, belt or upgrade bought raises the next one's price).

type Ent = Record<string, unknown> & { id?: string; type: string };
const withManual = (): Sim => {
  const m = structuredClone(LEVEL_1) as unknown as { entities: Ent[] };
  for (const e of m.entities) if (e.type === "pad.hire") e["manual"] = true;
  return newSim({ entities: m.entities });
};

describe("automation tax", () => {
  it("raises every automation pad's price by the growth per purchase, never machines", () => {
    const sim = newSim(), st = sim.state, cp = sim.compiled;
    const hire = Object.values(cp.entityById).find((e) => e.type === "pad.hire")!;
    if (hire.type !== "pad.hire") throw new Error("level 1 has a hire pad");
    expect(isAutomation(cp, hire)).toBe(true);
    const base = Object.values(hire.cost)[0]!;
    expect(Object.values(padCost(st, cp, hire))[0]).toBe(base);
    st.automation = 2;
    expect(Object.values(padCost(st, cp, hire))[0]).toBe(Math.ceil(base * cp.pads.automationGrowthPm / 1000 * cp.pads.automationGrowthPm / 1000 - 1e-9));
    const build = Object.values(cp.entityById).find((e) => e.type === "pad.build" && (e.build.startsWith("struct.housing") || e.build.startsWith("conv.food")));
    if (build && build.type === "pad.build") expect(padCost(st, cp, build)).toEqual(build.cost);
  });
});

describe("manual first", () => {
  it("hides a manual hire pad until its job is done by hand, then shows it", () => {
    const sim = withManual(), st = sim.state, cp = sim.compiled;
    const hire = Object.values(cp.entityById).find((e) => e.type === "pad.hire" && jobOf(cp, e)?.startsWith("carry:"));
    if (!hire || hire.type !== "pad.hire") throw new Error("level 1 has a collector hire");
    const job = jobOf(cp, hire)!;
    sim.step({ dx: 0, dy: 0 });
    expect(st.pads.find((p) => p.id === hire.id)!.visible).toBe(false);
    st.manual = { src: {}, done: [job] };
    sim.step({ dx: 0, dy: 0 });
    expect(st.pads.find((p) => p.id === hire.id)!.visible).toBe(true);
  });

  it("records a carry job from the player's own gather and deposit", () => {
    const sim = withManual(), st = sim.state, cp = sim.compiled;
    const hire = Object.values(cp.entityById).find((e) => e.type === "pad.hire" && (e.role.to === "sink.core" || e.role.to === "sink.sales_point") && e.role.from?.startsWith("node."));
    if (!hire || hire.type !== "pad.hire") throw new Error("level 1 has a node collector");
    const res = cp.nodes[hire.role.from!]!.yields;
    const node = st.nodes.find((n) => n.type === hire.role.from)!;
    // the two events a hand trip makes, as the tracker reads them from a tick
    st.manual = { src: {}, done: [] };
    stepManual(st, cp, [
      { t: "gathered", res, node: st.nodes.indexOf(node), at: { ...node.pos } },
      { t: "deposited", res, to: hire.role.to!, at: { x: fp(1), y: fp(1) } },
    ]);
    expect(st.manual.done).toContain(jobOf(cp, hire));
  });
});
