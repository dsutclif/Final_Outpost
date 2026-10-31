import { describe, expect, it } from "vitest";
import { content, checkManifest, Manifest } from "@fo/content";
import { TPS, createSim, type SimEvent } from "../src/index.js";
import { LEVEL_1, LEVEL_2, grant, idle, newSim, walkTo } from "./helpers.js";

// The rules batch for story levels (docs/STORY-LEVELS-V2-PLAN.md, B): the lit clock, core_lit, staffed
// sources, hidden captures, item lassoables and flee speed. Every option is off by default.

type Ent = { type: string; [k: string]: unknown };
type Loose = Record<string, unknown> & { entities: Ent[] };
const L1 = LEVEL_1 as unknown as Loose, L2 = LEVEL_2 as unknown as Loose;
const dark = (over: Record<string, unknown> = {}): Loose => ({
  ...L1,
  entities: L1.entities.map((e) => (e.type === "sink.core" ? { ...e, params: { fuel: 0, level: 1, lit: false } } : e)),
  ...over,
});
const main = (kind: string, params: Record<string, unknown>): Record<string, unknown> => ({
  goal: { type: kind, ...params },
  objectives: [{ id: "main", kind, params }, { id: "a", kind: "no_colonist_freezes", params: {} }, { id: "b", kind: "settlement_never_freezes", params: {} }],
});
const parse = (m: unknown): Manifest => Manifest.parse(m);
const light = (sim: ReturnType<typeof newSim>): SimEvent[] => {
  grant(sim, { items: ["res.material_basic", "res.material_basic"] });
  const ev = walkTo(sim, sim.state.core.pos, 60);
  while (sim.state.stats.litTick === undefined && sim.state.tick < 2000) ev.push(...idle(sim, 1));
  return ev;
};
const storm = [{ type: "event.hazard", warnAt: 2, start: 4, end: 6 }];
const stormy = (over: Record<string, unknown>): Loose => dark({ events: storm, ...over });

describe("core_lit", () => {
  it("is done on the first deposit and not before", () => {
    const sim = newSim({}, dark(main("core_lit", {})));
    idle(sim, 60);
    expect(sim.state.objectives[0]!.done).toBe(false);
    light(sim);
    expect(sim.state.objectives[0]!.doneTick).toBe(sim.state.stats.litTick);
  });

  it("needs a dark core", () => {
    expect(() => checkManifest(parse({ ...L1, ...main("core_lit", {}) }), content)).toThrow(/dark core/);
  });
});

describe("fromLit", () => {
  it("an unlit core fails no fuel_full and finishes no survive, however long it waits", () => {
    const sim = newSim({}, dark(main("fuel_full", { seconds: 1, fromLit: 1 })));
    idle(sim, 10 * TPS);
    expect(sim.state.objectives[0]!.failed).toBe(false);
    const s2 = newSim({}, dark(main("survive", { seconds: 1, fromLit: 1 })));
    idle(s2, 10 * TPS);
    expect(s2.state.objectives[0]!.done).toBe(false);
    expect(s2.state.objectives[0]!.progress).toBe(0);
  });

  it("survive counts its seconds from the lighting", () => {
    const sim = newSim({}, dark(main("survive", { seconds: 2, fromLit: 1 })));
    idle(sim, 3 * TPS);
    light(sim);
    const lit = sim.state.stats.litTick!;
    while (!sim.state.objectives[0]!.done && sim.state.tick < lit + 5 * TPS) idle(sim, 1);
    expect(sim.state.objectives[0]!.doneTick).toBe(lit + 2 * TPS);
  });

  it("fuel_full's deadline counts from the lighting", () => {
    const sim = newSim({}, dark(main("fuel_full", { seconds: 1, fromLit: 1 })));
    idle(sim, 3 * TPS);
    light(sim);
    const o = sim.state.objectives[0]!;
    expect(o.failed).toBe(false);
    while (!o.failed && sim.state.tick < sim.state.stats.litTick! + 3 * TPS) idle(sim, 1);
    expect(o.failed).toBe(true);
    expect(sim.state.tick).toBe(sim.state.stats.litTick! + TPS + 1);
  });

  it("takes only the number 1, and only with a dark core", () => {
    expect(() => checkManifest(parse(dark(main("survive", { seconds: 2, fromLit: 2 }))), content)).toThrow();
    expect(() => checkManifest(parse({ ...L1, ...main("survive", { seconds: 2, fromLit: 1 }) }), content)).toThrow(/dark core/);
  });

  it("off by default: survive still counts from tick 0", () => {
    const sim = newSim({}, dark(main("survive", { seconds: 1 })));
    idle(sim, TPS + 1);
    expect(sim.state.objectives[0]!.done).toBe(true);
  });
});

describe("hazardsFromLit", () => {
  it("an unlit core starts no hazard; lit, warning, start and end all shift by litTick", () => {
    const sim = newSim({}, stormy({ hazardsFromLit: true, params: { ...(L1.params as object), "level.budgetSeconds": 600 } }));
    const early = idle(sim, 10 * TPS);
    expect(early.some((e) => e.t.startsWith("hazard_"))).toBe(false);
    expect(sim.state.hazard.phase).toBe("none");
    const ev = light(sim);
    const lit = sim.state.stats.litTick!;
    ev.push(...idle(sim, Math.max(0, lit + 7 * TPS - sim.state.tick)));
    const warn = ev.find((e) => e.t === "hazard_warning") as { start: number } | undefined;
    expect(warn?.start).toBe(lit + 4 * TPS);
    const start = ev.find((e) => e.t === "hazard_start") as { end: number } | undefined;
    expect(start?.end).toBe(lit + 6 * TPS);
    expect(ev.some((e) => e.t === "hazard_end")).toBe(true);
  });

  it("off by default: the same dark level warns on the manifest's schedule", () => {
    const sim = newSim({}, stormy({}));
    const ev = idle(sim, 3 * TPS);
    expect((ev.find((e) => e.t === "hazard_warning") as { start: number }).start).toBe(4 * TPS);
  });

  it("needs a dark core", () => {
    expect(() => checkManifest(parse({ ...L1, events: storm, hazardsFromLit: true }), content)).toThrow(/dark core/);
  });
});

describe("converters_running sources", () => {
  const staffed = (extra: Record<string, unknown>): Loose => ({
    ...L1,
    people: [{ role: "role.supplier", from: "node.material_source", to: "sink.core" }],
    goal: { type: "survive", seconds: 600 },
    objectives: [{ id: "main", kind: "survive", params: { seconds: 600 } }, { id: "a", kind: "converters_running", params: { k: 1, seconds: 1, ...extra } }, { id: "b", kind: "no_colonist_freezes", params: {} }],
  });

  it("counts a staffed source node when opted in", () => {
    const sim = newSim({}, staffed({ sources: 1 }));
    idle(sim, 2 * TPS);
    expect(sim.state.objectives[1]!.done).toBe(true);
  });

  it("is opt-in: without it the same gatherer counts for nothing", () => {
    const sim = newSim({}, staffed({}));
    idle(sim, 2 * TPS);
    expect(sim.state.objectives[1]!.done).toBe(false);
  });
});

describe("hidden captures and items", () => {
  const first = L2.entities.findIndex((e) => e.type === "capture.recruit_container");
  const objectives = (kind = "core_level", params: Record<string, unknown> = { n: 9 }): unknown[] => [
    (L2.objectives as unknown[])[0], { id: "gate", kind, params }, { id: "b", kind: "no_colonist_freezes", params: {} },
  ];
  const hiding = (patch: Record<string, unknown>, kind?: string, params?: Record<string, unknown>): Loose => ({
    ...L2, objectives: objectives(kind, params),
    entities: L2.entities.map((e, i) => (i === first ? { ...e, ...patch, hiddenUntil: "gate" } : e)),
  });

  it("nothing counts a hidden pod, freezes it or tows it", () => {
    const sim = newSim({}, hiding({ id: "secret", freeze: 1 }));
    const c = sim.state.captures[0]!;
    expect(c.state).toBe("hidden");
    idle(sim, 2 * TPS);
    expect(sim.state.captures).toContain(c);
    expect(sim.state.stats.podsLost).toBe(0);
    expect(c.freezeTicks).toBe(TPS);
  });

  it("is revealed, idle, on the tick its objective is done", () => {
    const sim = newSim({}, hiding({}, "survive", { seconds: 1 }));
    const ev = idle(sim, TPS);
    const c = sim.state.captures[0]!;
    expect(c.state).toBe("idle");
    expect(c.hiddenUntil).toBeUndefined();
    expect(sim.state.objectives[1]!.doneTick).toBe(TPS);
    expect(ev.filter((e) => e.t === "capture_revealed")).toHaveLength(1);
  });

  it("hiddenUntil must name an objective that can be done in play", () => {
    const bad = (m: Loose) => () => checkManifest(parse(m), content);
    expect(bad({ ...hiding({}), objectives: L2.objectives })).toThrow(/unknown objective/);
    expect(bad(hiding({}, "no_injuries", {}))).toThrow(/guard/);
  });

  it("an item pays nothing and counts as a crate", () => {
    const sim = newSim({}, { ...L2, entities: [...L2.entities, { type: "capture.recorder", at: [425, 830] }] });
    const c = sim.state.captures[sim.state.captures.length - 1]!;
    const before = sim.state.currency;
    c.state = "towed";
    sim.state.player.tow.push(c.id);
    c.pos = { ...sim.state.core.pos };
    const ev = idle(sim, 1);
    expect(sim.state.stats.crates).toBe(1);
    expect(sim.state.stats.itemsFetched).toBe(1);
    expect(sim.state.currency).toBe(before);
    expect(sim.state.drops).toHaveLength(0);
    expect(sim.state.captures).not.toContain(c);
    expect(ev.some((e) => e.t === "crate_delivered" && e.item === true)).toBe(true);
  });
});

describe("defense.fleeSpeed", () => {
  it("defaults to 0, the hostile's own speed", () => {
    expect(content.defaults["defense.fleeSpeed"]).toBe(0);
    expect(createSim(parse(L1)).compiled.defense.fleeSpeed).toBe(0);
  });

  it("moves a fleeing hostile at the given speed", () => {
    const run = (params: Record<string, number>): number => {
      const sim = newSim({}, { ...L1, params: { ...(L1.params as object), ...params } });
      const h = { id: 99, type: "hostile.swarmling", pos: { x: 100000, y: 500000 }, side: "n" } as unknown as NonNullable<typeof sim.state.fleeing>[number];
      sim.state.fleeing = [h];
      return flee(sim, h);
    };
    const flee = (sim: ReturnType<typeof newSim>, h: { pos: { y: number } }): number => {
      const y0 = h.pos.y;
      idle(sim, 1);
      return y0 - h.pos.y;
    };
    const own = run({});
    const fast = run({ "defense.fleeSpeed": 300 });
    expect(own).toBeGreaterThan(0);
    expect(fast).toBe(createSim(parse({ ...L1, params: { ...(L1.params as object), "defense.fleeSpeed": 300 } })).compiled.defense.fleeSpeed);
    expect(fast).not.toBe(own);
  });
});
