import { describe, expect, it } from "vitest";
import { content, checkManifest, Manifest as ManifestSchema } from "@fo/content";
import { createSim, outsideLines, pointInPoly, salesLayout, fp } from "@fo/sim";
import { planBot } from "@fo/bots";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, flowModel, generate, generateDetailed, knobsFor, skinText, templateById, unreadablePairs, timeTarget, TEMPLATES, GEN } from "../src/index.js";

const reqs = sequenceRange(1, 60);
const build = (i: number, p = 0.3) => {
  const r = reqs[i - 1]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p) }, salt);
    } catch { /* next layout draw */ }
  }
  return null;
};

describe("module selection", () => {
  it("adds dependencies and always-on modules, and rejects exclusions", () => {
    expect(closure(["lasso"])).toEqual(expect.arrayContaining(["barrier_lines", "build_pads", "carry", "gather", "core", "sales"]));
    expect(closure(["defenders"])).toEqual(expect.arrayContaining(["defense", "workers", "barrier_lines"]));
    expect(() => generate({ target: 0.3, family: "defend", modules: ["lasso", "defense"], goalType: "waves", seed: 1 })).toThrow(/exclude/);
  });
});

describe("layout and economy per family (stages 2-4)", () => {
  // Levels 1-15 cover every family and every deeper mechanic; built once, on first use.
  const SAMPLE = Array.from({ length: 15 }, (_, k) => k + 1);
  let cache: { r: (typeof reqs)[number]; b: ReturnType<typeof build> }[] | null = null;
  const built = () => (cache ??= SAMPLE.map((i) => ({ r: reqs[i - 1]!, b: build(i) })));

  it("builds a valid manifest for every intro level, with family and three objectives", () => {
    const ok = built().filter((x) => x.b !== null);
    expect(ok.length).toBeGreaterThanOrEqual(SAMPLE.length - 1);
    for (const { r, b } of ok) {
      const m = ManifestSchema.parse(b!.manifest);
      expect(() => checkManifest(m, content)).not.toThrow();
      expect(() => createSim(m)).not.toThrow();
      expect(m.family).toBe(r.family);
      expect(m.objectives).toHaveLength(3);
      expect(m.objectives![0]!.kind).toBe(m.goal.type);
    }
  });

  it("puts a dense fuel forest near the base in every level", () => {
    for (const { b } of built()) {
      if (!b) continue;
      const core = b.manifest.entities.find((e) => e.type === "sink.core")!.at;
      const scrap = b.manifest.entities.filter((e) => e.type === "node.fuel_scrap" && "at" in e && Math.hypot(e.at[0] - core[0], e.at[1] - core[1]) < 260);
      expect(scrap.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("keeps interaction radii apart, key stations and the queue on screen", () => {
    for (const { b } of built()) {
      if (!b) continue;
      const core = b.manifest.entities.find((e) => e.type === "sink.core")!.at;
      expect(unreadablePairs(b.stations, core, 450)).toEqual([]);
      for (const q of b.queue) {
        expect(Math.abs(q[0] - core[0])).toBeLessThanOrEqual(GEN.spacing.screen[0]);
        expect(Math.abs(q[1] - core[1])).toBeLessThanOrEqual(GEN.spacing.screen[1]);
      }
    }
  });

  it("the queue sits where salesLayout puts it", () => {
    const b = built().find((x) => x.r.family === "harvest" && x.b)!.b!;
    const sim = createSim(b.manifest);
    const s = sim.state.sales!;
    const lay = salesLayout(sim.compiled, s.pos, sim.state.core.pos);
    expect(s.queueAt).toEqual(lay.queueAt);
    expect(b.queue[0]).toEqual([lay.queueAt.x / 1000, lay.queueAt.y / 1000]);
  });

  it("walls only where needed: closed rings with a gate on defend and rescue levels, none elsewhere", () => {
    for (const { r, b } of built()) {
      if (!b) continue;
      const m = ManifestSchema.parse(b.manifest); // rings are written as points; the schema normalises them to sections
      const lines = m.entities.filter((e) => e.type === "barrier.line");
      const needs = r.family === "defend" || r.family === "rescue";
      expect(lines.length).toBe(needs ? 1 : 0);
      for (const l of lines) {
        if (l.type !== "barrier.line") continue;
        expect(l.closed).toBe(true);
        expect(l.sections.filter((s) => s.gate).length).toBeGreaterThanOrEqual(1);
        expect(l.sections.filter((s) => s.gate).length).toBeLessThanOrEqual(4);
        // R3 item 11: every side a wave comes from (bar the med bay's probe raid) has a gate.
        if (r.family === "defend") {
          const raidT = Math.min(...m.waves.map((w) => w.t));
          const ys = l.sections.map((s) => s.a[1]!), xs = l.sections.map((s) => s.a[0]!);
          const sideOf = (s: { a: number[]; b: number[] }) => (s.a[1] === s.b[1] ? (s.a[1] === Math.min(...ys) ? "n" : "s") : s.a[0] === Math.min(...xs) ? "w" : "e");
          const gated = new Set(l.sections.filter((s) => s.gate).map(sideOf));
          for (const w of m.waves) {
            if (w.t === raidT && m.modules.includes("medical")) continue;
            for (const sd of Array.isArray(w.side) ? w.side : [w.side ?? "n"]) expect({ side: sd, gated: gated.has(sd) }).toEqual({ side: sd, gated: true });
          }
        }
        const sim = createSim(m);
        const poly = sim.state.barriers[0]!.sections.map((s) => s.a);
        expect(pointInPoly(sim.state.core.pos, poly)).toBe(true);
        if (r.family === "rescue") {
          expect(l.sections.every((s) => s.prebuilt)).toBe(true);
          for (const c of sim.state.captures) expect(outsideLines(sim.state, c.pos)).toBe(true);
        } else expect(l.sections.some((s) => !s.prebuilt)).toBe(true);
      }
    }
  });

  it("every converter has a feed path and every pad is on the bot's plan", () => {
    for (const { b } of built()) {
      if (!b) continue;
      const m = b.manifest;
      const plan = planBot(m);
      const planned = new Set(plan.steps.map((s) => s.pad));
      for (const e of m.entities) {
        if (e.type === "pad.hire" || e.type === "pad.build") expect({ pad: e.id, planned: planned.has(e.id) }).toEqual({ pad: e.id, planned: true });
        if (e.type === "pad.build" && e.build.startsWith("conv.") && e.build !== "conv.level") {
          // a worker brings its input, or a belt does (the parts works on a belted level)
          const fed = m.entities.some((h) => h.type === "pad.hire" && h.role.to === e.build && content.roles[h.role.role]?.behavior !== "stand_at")
            || (e.build === "conv.alloy_works" && m.entities.some((h) => h.type === "pad.build" && h.build === "struct.conveyor"));
          expect({ conv: e.id, fed }).toEqual({ conv: e.id, fed: true });
        }
      }
    }
  });

  it("defend tower levels come after their own tower (Lv3 after its Lv2) in the requires chain", () => {
    let checked = 0;
    for (const { b } of built()) {
      const pads = b?.manifest.entities.filter((e) => e.type === "pad.build") as { id: string; build: string; target?: string; requires?: { pad?: string } }[] | undefined;
      if (!pads) continue;
      const byId = new Map(pads.map((p) => [p.id, p]));
      for (const up of pads.filter((p) => /\.t\d$/.test(p.build) && p.target && byId.has(p.target))) {
        const seen: string[] = [];
        for (let x = byId.get(up.id); x?.requires?.pad; x = byId.get(x.requires.pad)) seen.push(x.requires.pad);
        expect(seen, `${up.id} needs ${up.target} first`).toContain(up.target);
        if (up.build.endsWith(".t3")) expect(seen, `${up.id} needs ${up.target}_up first`).toContain(`${up.target}_up`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("defend levels: turret sockets on every attack road outside the wall, more opening with the waves; scrap heaps outside; the guard post stands", () => {
    let checked = 0, unlocking = 0;
    for (const { r, b } of built()) {
      if (!b || r.family !== "defend") continue;
      const m = b.manifest;
      const towers = m.entities.filter((e) => e.type === "pad.build" && e.build === "struct.ranged_defense") as { id: string; site?: [number, number]; requires?: { wave?: number } }[];
      if (towers.length === 0) continue;
      const sim = createSim(m);
      const sides = [...new Set(m.waves.map((w) => w.side as string))];
      for (const sd of sides) {
        const mine = towers.filter((t) => t.id.startsWith(`tower_${sd}`));
        expect(mine.filter((t) => !t.requires?.wave).length, `${m.id} ${sd} gate`).toBeGreaterThanOrEqual(1);
        for (const t of mine) expect(t.site, t.id).toBeDefined();
      }
      // every socket stands outside the wall, on the road (Doug: two pairs outside each gate are enough)
      for (const t of towers) expect(outsideLines(sim.state, { x: t.site![0] * 1000, y: t.site![1] * 1000 }), t.id).toBe(true);
      for (const h of m.entities.filter((e) => e.type === "node.salvage_pile") as { at: [number, number] }[]) expect(outsideLines(sim.state, { x: h.at[0] * 1000, y: h.at[1] * 1000 }), "scrap heap").toBe(true);
      // sockets that open with the waves (soft: a gate without room for them skips them)
      if (towers.some((t) => (t.requires?.wave ?? 0) > 0)) unlocking++;
      if (m.entities.some((e) => e.type === "pad.hire" && e.id === "train")) {
        expect(m.entities.some((e) => e.type === "struct.barracks")).toBe(true);
        expect((m.entities.find((e) => "id" in e && e.id === "train") as { requires?: unknown }).requires).toBeUndefined();
      }
      checked++;
    }
    expect(unlocking).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(0);
  });

  it("defend levels price the defense in salvage and drop enough of it", () => {
    for (const { r, b } of built()) {
      if (!b || r.family !== "defend") continue;
      const m = b.manifest;
      for (const e of m.entities) if (e.type === "pad.build" && e.build.startsWith("struct.")) expect(Object.keys(e.cost)).toEqual(["res.salvage"]);
      expect(m.waves.some((w) => (w.counts["hostile.swarmling"] ?? 0) >= 3)).toBe(true);
    }
  });

  it("the flow model rejects a core the player cannot sustain alone", () => {
    const b = build(3)!;
    const m = structuredClone(b.manifest);
    m.params["core.burn"] = 0.4;
    const f = flowModel(m, planBot(m), content, 300);
    expect(f.ok).toBe(false);
    expect(f.reason).toMatch(/unsustainable/);
  });

  it("is deterministic: same request, seed and knobs give the same manifest", () => {
    expect(build(9)!.manifest).toEqual(build(9)!.manifest);
    expect(build(8)!.manifest).not.toEqual(build(8, 0.8)!.manifest);
  });

  it("templates are data and cover the sequencer's ids", () => {
    const ids = TEMPLATES.templates.map((t) => t.id);
    for (const r of reqs) expect(ids).toContain(r.template);
  });
});

describe("strict crew slots", () => {
  type E = { id?: string; type: string; at?: [number, number] };
  const crew: Record<string, [string, "in" | "op" | "out"][]> = {
    grill: [["cook", "op"], ["server", "out"]],
    saw: [["sawyer", "op"]],
    alloy: [["refined_carrier", "in"], ["smith", "op"], ["component_server", "out"]],
  };
  // Collectors (the machine's and the warehouse's input workers) stand by their source instead: see below.
  it("puts every crew pad exactly at its machine's slot offset, the belt pad on the belt and the cashier past the clerk", () => {
    let machines = 0, belts = 0, cashiers = 0, depots = 0;
    for (const i of [3, 8, 9, 14, 19, 25, 30, 47]) {
      const b = build(i);
      if (!b) continue;
      const at = new Map<string, [number, number]>();
      for (const e of b.manifest.entities as E[]) if (e.id && e.at) at.set(e.id, e.at);
      for (const [m, slots] of Object.entries(crew)) {
        const mp = at.get(m);
        if (!mp) continue;
        machines++;
        for (const [id, slot] of slots) {
          const p = at.get(id);
          if (!p) continue;
          expect([id, p]).toEqual([id, [mp[0] + GEN.crewStations[slot][0], mp[1] + GEN.crewStations[slot][1]]]);
        }
      }
      const dp = at.get("depot");
      for (const [id, slot] of [["hauler", "out"]] as const) {
        const p = at.get(id);
        if (dp && p) { depots++; expect(p).toEqual([dp[0] + GEN.depotCrewStations[slot][0], dp[1] + GEN.depotCrewStations[slot][1]]); }
      }
      const belt = at.get("belt"), saw = at.get("saw"), alloy = at.get("alloy");
      if (belt && saw && alloy) {
        belts++;
        const pk = content.converters["conv.material_processor"]!.pickupOffset;
        const from = [saw[0] + pk[0], saw[1] + pk[1]];
        expect(belt).toEqual([Math.round(from[0]! + (alloy[0] - from[0]!) / 2), Math.round(from[1]! + (alloy[1] - from[1]!) / 2)]);
      }
      const shop = at.get("shop"), cashier = at.get("hire_cashier");
      if (shop && cashier) {
        cashiers++;
        // one of the cashier slots past the clerk spot, which is south of the stall or (sales.clerkSide) east/west of it
        const sim = createSim(b.manifest), r = sim.state.sales!.register;
        const reg: [number, number] = [r.x / 1000, r.y / 1000], dir = reg[1] >= shop[1] ? 1 : -1;
        expect(GEN.cashierPads.some((o) => cashier[0] === reg[0] + o[0] && cashier[1] === reg[1] + dir * o[1])).toBe(true);
      }
    }
    expect(machines).toBeGreaterThan(0);
    expect(cashiers).toBeGreaterThan(0);
    expect(belts + depots).toBeGreaterThan(0);
  }, 120_000);
});

describe("generate (search + rating + stars)", () => {
  it("returns the same manifest for the same request and seed, with sized objectives", () => {
    const r = reqs[0]!;
    const light = { seeds: { quick: { ref: 2, other: 1 }, full: { ref: 3, other: 1 } }, maxIterations: 8 }; // 4 is too few once budgets are 1.4x longer
    const a = generateDetailed(r, light).best, b = generateDetailed(r, light).best;
    expect(a).not.toBeNull();
    expect(a!.manifest).toEqual(b!.manifest);
    const m = a!.manifest;
    expect(a!.stars.goodAll).toBeGreaterThan(0);
    expect((m.rating as { difficulty: number }).difficulty).toBeGreaterThan(0);
    expect(m.objectives!.map((o) => o.kind)).not.toContain("time_target"); // heat_hold: two heat challenges
    expect(m.text["mars_greenhouse"]!.title.length).toBeGreaterThan(0);
  });

  it("widens the generated time target by the data factor (timeTargetK)", () => {
    expect(GEN.timeTargetK).toBe(1.4);
    expect(timeTarget(100)).toBe(140);
    expect(timeTarget(86, 10)).toBe(120);
    const k = GEN.timeTargetK;
    try {
      const wide = build(8)!.manifest.params["level.budgetSeconds"]!;
      GEN.timeTargetK = 1;
      const plain = build(8)!.manifest.params["level.budgetSeconds"]!;
      expect(wide % 10).toBe(0);
      expect(wide).toBe(Math.round((plain * k) / 10) * 10);
      expect(wide).toBeGreaterThan(plain);
    } finally { GEN.timeTargetK = k; }
  });

  it("titles and tips come from the skin, deterministically", () => {
    const m = build(8)!.manifest;
    const t = skinText(m, ["vips"]);
    expect(t).toEqual(skinText(m, ["vips"]));
    expect(t.tips.length).toBeGreaterThanOrEqual(1);
    expect(fp(1)).toBe(1000);
  });
});

describe("collector pads", () => {
  type E = { id?: string; type: string; at?: [number, number]; role?: { role: string; from?: string; node?: string } };
  it("stand beside the source they gather from", () => {
    let n = 0, beside = 0;
    for (const i of [4, 8, 9, 14, 19, 25, 47]) {
      const b = build(i);
      if (!b) continue;
      const ents = b.manifest.entities as E[];
      const byId = new Map(ents.filter((e) => e.id).map((e) => [e.id!, e]));
      for (const e of ents) {
        if (e.type !== "pad.hire" || e.role?.role !== "role.supplier" || !e.at) continue;
        const srcs = e.role.node ? [byId.get(e.role.node)!.at!] : ents.filter((x) => x.type === e.role!.from && x.at).map((x) => x.at!);
        const near = Math.min(...srcs.map((q) => Math.hypot(q[0] - e.at![0], q[1] - e.at![1])));
        n++;
        // the ideal spot is source range + pad range + margin (64-74); a crowded base pushes the odd one further out
        if (near < 160) beside++;
      }
    }
    expect(n).toBeGreaterThan(5);
    expect(beside / n).toBeGreaterThanOrEqual(0.75);
  });
});
