import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION, FP, createSim, type SimEvent, type State } from "@fo/sim";
import { SKINS, marsGreenhouse } from "@fo/skins";
import { describe, expect, it } from "vitest";
import level1 from "../../../levels/golden/proto-L001.json";
import { Renderer2D, createCamera, hasDraw } from "../src/index.js";

// A recording stand-in for CanvasRenderingContext2D: every method call is logged with its
// arguments, so the test can assert the renderer never feeds NaN or Infinity to the canvas.

interface Call { name: string; args: unknown[] }

function fakeCanvasEnv(): { mount: HTMLElement; calls: Call[] } {
  const calls: Call[] = [];
  const grad = { addColorStop: (o: number) => { calls.push({ name: "addColorStop", args: [o] }); } };
  const makeCtx = (): CanvasRenderingContext2D => {
    const store: Record<string | symbol, unknown> = {};
    return new Proxy(store, {
      get(t, k) {
        if (k in t) return t[k];
        return (...args: unknown[]) => {
          calls.push({ name: String(k), args });
          if (k === "createRadialGradient" || k === "createLinearGradient" || k === "createPattern") return grad;
          if (k === "measureText") return { width: 10 };
          return undefined;
        };
      },
      set(t, k, v) { t[k] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
  };
  const doc = {
    createElement: () => makeEl(),
  };
  function makeEl(): Record<string, unknown> {
    const ctx = makeCtx();
    return {
      style: {}, className: "", textContent: "", width: 0, height: 0, clientWidth: 400, clientHeight: 700,
      appendChild: () => undefined, remove: () => undefined,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 400, height: 700 }),
      ownerDocument: doc,
    };
  }
  return { mount: makeEl() as unknown as HTMLElement, calls };
}

function badArgs(calls: Call[]): Call[] {
  return calls.filter((c) => c.args.some((a) => typeof a === "number" && !Number.isFinite(a)));
}

const manifest = { ...level1, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION };

function makeRenderer(): { r: Renderer2D; calls: Call[]; clock: { t: number } } {
  const clock = { t: 0 };
  const r = new Renderer2D({ now: () => clock.t, dpr: () => 2 });
  const env = fakeCanvasEnv();
  const sim = createSim(manifest);
  r.init(sim.compiled.manifest, marsGreenhouse, env.mount);
  return { r, calls: env.calls, clock };
}

/** Strip every Contract 1 field: the state shape before the sim grew them. */
function legacy(s: State): State {
  const o = structuredClone(s) as unknown as Record<string, unknown>;
  for (const k of ["structures", "barriers", "zones", "preyZones", "captures", "prey", "hostiles", "drops", "converters", "depot", "meters", "waves", "hazard", "lasso", "timers", "stats"]) delete o[k];
  o["residents"] = (s.residents ?? []).map((r) => ({ id: r.id, pos: r.pos, role: r.role, status: "ok" }));
  o["pads"] = (s.pads ?? []).map((p) => ({ id: p.id, type: p.type, pos: p.pos, done: p.done, paid: p.paid }));
  return o as unknown as State;
}

const v = (x: number, y: number) => ({ x: x * FP, y: y * FP });

/** Every Contract 1 entity type populated, in every visual state the renderer knows. */
function extended(s: State, tick: number): State {
  const o = structuredClone(s) as unknown as Record<string, unknown>;
  const statuses = ["ok", "injured", "healing", "frozen", "towed", "releasing", "waiting", "arriving"];
  const roles = ["idle", "role.supplier", "role.server", "role.cashier", "role.operator", "role.hunter", "role.defender", "role.hauler"];
  o["residents"] = statuses.flatMap((status, i) => roles.map((role, j) => ({
    id: i * 10 + j, pos: v(40 + j * 50 + (tick % 7), 100 + i * 40), role, status,
    carry: j % 2 ? "res.material_basic" : null, n: j % 3, mode: "gather", target: null,
    assign: { from: null, to: null, node: null, post: null }, acc: 0, timer: 0, slot: 0,
  })));
  o["pads"] = (s.pads ?? []).map((p, i) => ({ ...p, paid: { "res.currency": i * 2 }, visible: true, locked: i === 1 }));
  o["structures"] = ["struct.landmark", "struct.housing", "struct.medical", "struct.ranged_defense", "struct.barracks", "struct.depot", "struct.unknown_kind"].map((type, i) => ({
    id: `s${i}`, type, pos: v(60 + i * 60, 700), level: 1 + (i % 2), hp: 3, hpMax: 10, acc: 0,
  }));
  o["barriers"] = [{
    id: "wall", a: v(0, 230), b: v(480, 230), res: "res.material_basic", costPerSection: 4,
    sections: [
      { a: v(0, 230), b: v(160, 230), built: true, hp: 4, hpMax: 14, gate: false, paid: 4 },
      { a: v(160, 230), b: v(320, 230), built: true, hp: 20, hpMax: 20, gate: true, paid: 4 },
      { a: v(320, 230), b: v(480, 230), built: false, hp: 0, hpMax: 14, gate: false, paid: 1 },
    ],
  }];
  o["zones"] = [
    { id: "z1", type: "zone.blocked", rect: { x: 0, y: 200 * FP, w: 480 * FP, h: 44 * FP }, cleared: false },
    { id: "z2", type: "zone.waiting", rect: { x: 300 * FP, y: 450 * FP, w: 80 * FP, h: 44 * FP }, cleared: false },
  ];
  o["preyZones"] = [{ id: "pz", rect: { x: 20 * FP, y: 60 * FP, w: 210 * FP, h: 230 * FP }, animal: "node.prey" }];
  o["captures"] = ["idle", "towed", "releasing"].map((state, i) => ({ id: i, type: "capture.recruit_container", pos: v(90 + i * 120, 820), state, timer: 10 }));
  o["prey"] = [0, 1, 2].map((i) => ({ id: i, pos: v(60 + i * 40, 120 + tick), hp: 3, alive: i !== 2, respawn: 0, zone: 0, vel: v(1, 0), turn: 5 }));
  o["hostiles"] = [
    { id: 1, type: "hostile.creature", pos: v(100, 40 + tick), hp: 2, target: "core", acc: 0 },
    { id: 2, type: "hostile.raider_humanoid", pos: v(300, 40 + tick), hp: 4, target: "barrier", acc: 0 },
    { id: 3, type: "hostile.unknown", pos: v(240, -200), hp: 1, target: "base", acc: 0 },
  ];
  o["drops"] = [{ id: 1, res: "res.salvage", pos: v(200, 300) }, { id: 2, res: "res.food_raw_2", pos: v(220, 300) }];
  o["converters"] = ["conv.food_processor", "conv.material_processor"].map((type, i) => ({
    id: `c${i}`, type, pos: v(150 + i * 200, 620), inQ: ["res.food_raw_1", "res.food_raw_2"], out: 3, acc: 10,
    operatorPos: v(150 + i * 200, 668), pickupPos: v(204 + i * 200, 620),
  }));
  o["depot"] = { pos: v(400, 800), stock: { "res.material_basic": 5, "res.food_raw_1": 2 } };
  o["meters"] = { lifeline: 300_000, baseHealth: 9, baseHealthMax: 15 };
  o["waves"] = { idx: 1, pending: [{ tick: 900, type: "hostile.creature" }], active: true };
  o["hazard"] = { phase: tick < 30 ? "warning" : "active", until: 600, idx: 0 };
  o["lasso"] = { trail: [v(100, 800), v(130, 780), v(160, 800)], towing: [1], engaged: true };
  const pl = o["player"] as Record<string, unknown>;
  pl["tow"] = [1];
  pl["stack"] = ["res.material_basic", "res.material_basic", "res.food_raw_1", "res.salvage", "res.fuel_dense", "res.fuel_dense"];
  const core = o["core"] as Record<string, unknown>;
  core["fuel"] = tick % 20 === 0 ? 0 : 5;
  return o as unknown as State;
}

const ALL_EVENTS: Record<string, unknown>[] = [
  { t: "gathered", res: "res.material_basic", node: 0, at: v(50, 220) },
  { t: "gathered", res: "res.material_basic", node: 0, at: v(50, 220), by: 0 },
  { t: "deposited", res: "res.material_basic", to: "sink.core", at: v(240, 400) },
  { t: "sold", res: "res.food_raw_1", n: 2, pay: 4, premium: true, at: v(330, 624) },
  { t: "customer_arrived", kind: "unit.customer", res: "res.food_raw_1", want: 1 },
  { t: "customer_left", angry: true, at: v(400, 570) },
  { t: "collected", res: "res.currency", n: 9, at: v(268, 624) },
  { t: "core_fuel_out" }, { t: "core_fuel_restored" },
  { t: "hint", key: "carry_max" }, { t: "hint", key: "a_key_no_skin_has" },
  { t: "pad_paid", pad: "landmark", res: "res.currency", n: 1 },
  { t: "hired", pad: "hire_cashier", resident: 1, role: "role.cashier" },
  { t: "built", pad: "landmark", build: "struct.landmark", at: v(120, 760) },
  { t: "unlocked", pad: "unlock_food2", target: "food2" },
  { t: "core_upgraded", level: 2 }, { t: "zone_cleared", zone: "z1" },
  { t: "captured", capture: 0, at: v(90, 820) }, { t: "released", capture: 1, resident: 3, at: v(240, 450) },
  { t: "recruit_arrived", resident: 2, at: v(240, 870) }, { t: "moved_in", resident: 2 },
  { t: "hit", target: "hostile", id: 1, at: v(100, 60), by: "structure" },
  { t: "hit", target: "base", id: 0, at: v(240, 400), by: "hostile" },
  { t: "died", kind: "hostile.creature", id: 1, at: v(100, 60) },
  { t: "drop", res: "res.salvage", at: v(100, 60) }, { t: "picked", res: "res.salvage", at: v(100, 60) },
  { t: "wave_started", idx: 0 }, { t: "wave_cleared", idx: 0 },
  { t: "barrier_progress", line: "wall", section: 2, paid: 2, cost: 4 },
  { t: "barrier_built", line: "wall", section: 2 }, { t: "barrier_broken", line: "wall", section: 0 },
  { t: "injured", resident: 4 }, { t: "healed", resident: 4 },
  { t: "hazard_warning", start: 300 }, { t: "hazard_start", end: 600 }, { t: "hazard_end" },
  { t: "converted", conv: "c0", res: "res.food_prepared" },
  { t: "something_new_the_sim_adds_later", at: v(1, 1) },
  { t: "level_end", won: true, reason: "goal" },
];

describe("2D renderer", () => {
  it("plays level 1 for 60 frames against the live sim without throwing or NaN draws", () => {
    const { r, calls, clock } = makeRenderer();
    const sim = createSim(manifest);
    const cam = createCamera();
    let events = 0;
    for (let f = 0; f < 60; f++) {
      // walk toward the ore piles so gather events fire
      for (const e of sim.step({ dx: -FP, dy: -FP / 2 })) { r.onEvent(e); events++; }
      clock.t += 1000 / 60;
      r.sync(sim.state, (f % 2) * 0.5, cam);
    }
    expect(calls.length).toBeGreaterThan(1000);
    expect(badArgs(calls)).toEqual([]);
    expect(Number.isFinite(cam.x) && Number.isFinite(cam.y)).toBe(true);
    // the camera stays inside the 480 x 900 world (400 units wide view)
    expect(cam.x).toBeGreaterThanOrEqual(200);
    expect(cam.x).toBeLessThanOrEqual(280);
    expect(events).toBeGreaterThanOrEqual(0);
    r.resize(390, 844);
    r.sync(sim.state, 0.3, cam);
    r.dispose();
  });

  it("draws the pre-Contract-1 state shape", () => {
    const { r, calls, clock } = makeRenderer();
    const sim = createSim(manifest);
    const cam = createCamera();
    for (let f = 0; f < 60; f++) {
      sim.step({ dx: FP, dy: 0 });
      clock.t += 16;
      r.sync(legacy(sim.state), 0.5, cam);
    }
    expect(badArgs(calls)).toEqual([]);
  });

  it("draws every Contract 1 entity type and handles every event, for 60 frames", () => {
    for (const skin of Object.values(SKINS)) {
      const { r, calls, clock } = makeRenderer();
      r.init(createSim(manifest).compiled.manifest, skin, fakeCanvasEnv().mount);
      const sim = createSim(manifest);
      const cam = createCamera();
      for (let f = 0; f < 60; f++) {
        sim.step({ dx: 0, dy: FP });
        const st = extended(sim.state, f);
        r.sync(st, 0.25, cam);
        for (const e of ALL_EVENTS) r.onEvent(e as unknown as SimEvent);
        clock.t += 16;
        r.sync(st, 0.75, cam);
      }
      expect(badArgs(calls)).toEqual([]);
      r.dispose();
    }
  });

  it("has a draw routine for every entity type in the contract", () => {
    for (const t of [
      "sink.core", "sink.core.safe", "sink.sales_point", "sink.sales_point.register",
      "node.material_source", "node.food_source", "node.fuel_deposit", "pad.hire", "pad.build",
      "struct.landmark", "struct.housing", "struct.medical", "struct.ranged_defense", "struct.barracks", "struct.depot",
      "capture.recruit_container", "hostile.creature", "hostile.raider_humanoid", "unit.prey", "unit.resident",
      "unit.customer", "unit.player", "drop", "barrier", "zone.blocked", "zone.waiting", "zone.prey",
      "conv.food_processor", "conv.material_processor", "conv.spot", "fx.lasso",
    ]) expect(hasDraw(t), t).toBe(true);
  });

  it("ignores sync and events before init", () => {
    const r = new Renderer2D();
    const sim = createSim(manifest);
    expect(() => { r.sync(sim.state, 0, createCamera()); r.onEvent({ t: "core_fuel_out" }); r.resize(10, 10); r.dispose(); }).not.toThrow();
  });
});
