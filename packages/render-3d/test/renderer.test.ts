import { CONTENT_VERSION, LOOK, modelScaleFor } from "@fo/content";
import { ENGINE_VERSION, FP, createSim, type Input, type SimEvent } from "@fo/sim";
import { SKINS, marsGreenhouse } from "@fo/skins";
import { Matrix4, type InstancedMesh, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import level1 from "../../../levels/golden/proto-L001.json";
import level3 from "../../../levels/golden/proto-L003.json";
import level4 from "../../../levels/golden/proto-L004.json";
import { MAX_DRAW_CALLS, MAX_TRIANGLES, createCamera } from "../src/index.js";
import { Renderer3D, type GLLike } from "../src/renderer.js";
import { ART_M, BUILD_K } from "../src/units.js";

// The renderer runs headless here: three's scene graph is real, WebGLRenderer is replaced by
// a recording fake (never instantiated), and the DOM is a minimal stand-in whose 2D canvas
// context swallows every call, so label art code runs without a browser.

function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      return (..._args: unknown[]) => (k === "measureText" ? { width: 40 } : undefined);
    },
    set(t, k, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function fakeMount(): HTMLElement {
  const doc = { createElement: () => el() };
  function el(): Record<string, unknown> {
    const ctx = fakeCtx();
    return {
      style: {}, className: "", textContent: "", width: 0, height: 0, clientWidth: 390, clientHeight: 780,
      appendChild: () => undefined, remove: () => undefined,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 390, height: 780 }),
      ownerDocument: doc,
    };
  }
  return el() as unknown as HTMLElement;
}

function fakeGL(): GLLike & { renders: number } {
  return {
    renders: 0,
    domElement: { remove: () => undefined } as unknown as HTMLCanvasElement,
    info: { render: { calls: 0, triangles: 0 } },
    shadowMap: { enabled: false, type: 0 as GLLike["shadowMap"]["type"] },
    outputColorSpace: "srgb",
    toneMapping: 0 as GLLike["toneMapping"],
    toneMappingExposure: 1,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    render(): void { this.renders++; },
    dispose: () => undefined,
  };
}

const pin = <T extends object>(m: T): T => ({ ...m, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION });

function finiteMatrices(root: Object3D): string[] {
  const bad: string[] = [];
  const m = new Matrix4();
  root.traverse((o) => {
    if (![o.position.x, o.position.y, o.position.z, o.scale.x, o.scale.y, o.scale.z].every(Number.isFinite)) bad.push(o.name || o.type);
    const im = o as InstancedMesh;
    if (im.isInstancedMesh) {
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        if (!m.elements.every(Number.isFinite)) { bad.push(`${im.name}#${i}`); break; }
      }
    }
  });
  return bad;
}

/** Walk in a slow square so the player gathers, carries and pays. */
function wander(tick: number): Input {
  const phase = Math.floor(tick / 90) % 4;
  const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][phase]!;
  return { dx: d[0]! * FP, dy: d[1]! * FP };
}

function run(manifest: object, ticks: number, input: (t: number, st: ReturnType<typeof createSim>["state"]) => Input, until?: (e: SimEvent) => boolean) {
  const clock = { t: 0 };
  const gl = fakeGL();
  const r = new Renderer3D({ now: () => clock.t, dpr: () => 2, createGL: () => gl, quality: "medium" });
  const sim = createSim(manifest);
  r.init(sim.compiled.manifest, marsGreenhouse, fakeMount());
  const cam = createCamera();
  const seen = new Set<string>();
  let stop = false;
  for (let i = 0; i < ticks && !sim.state.over && !stop; i++) {
    for (const e of sim.step(input(i, sim.state))) {
      seen.add(e.t);
      r.onEvent(e);
      if (until?.(e)) stop = true;
    }
    clock.t += 1000 / 30;
    r.sync(sim.state, (i % 3) / 3, cam);
  }
  return { r, gl, sim, cam, seen };
}

describe("render-3d module", () => {
  it("imports without a DOM and keeps three out of the entry point", async () => {
    expect(typeof globalThis.document).toBe("undefined");
    const mod = await import("../src/index.js");
    expect(typeof mod.loadRenderer3D).toBe("function");
    const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8"));
    expect(src).not.toMatch(/from "three"/);
    expect(src).toMatch(/import\("\.\/renderer\.js"\)/);
  });

  it("loadRenderer3D resolves to a Contract 2 renderer without touching WebGL", async () => {
    const { loadRenderer3D } = await import("../src/index.js");
    const r = await loadRenderer3D({ quality: "low" });
    for (const k of ["init", "sync", "onEvent", "resize", "dispose", "setQuality", "stats"] as const) expect(typeof r[k]).toBe("function");
    expect(r.getQuality()).toBe("low");
  });
});

describe("Renderer3D (fake WebGL)", () => {
  it("plays level 1 with finite transforms, renders every frame and stays inside the budgets", () => {
    const { r, gl, sim, cam } = run(pin(level1), 900, wander);
    expect(gl.renders).toBeGreaterThan(100);
    expect(Number.isFinite(cam.x) && Number.isFinite(cam.y)).toBe(true);
    expect(finiteMatrices(r.three.scene)).toEqual([]);
    const s = r.stats();
    expect(s.estDrawCalls).toBeGreaterThan(5);
    expect(s.estDrawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
    expect(s.estTriangles).toBeLessThanOrEqual(MAX_TRIANGLES);
    expect(sim.state.tick).toBeGreaterThan(100);
    r.dispose();
  });

  it("draws a built converter at full model size", () => {
    // regression: the converter's build bounce once overwrote the model scale with ~1, shrinking it 28x
    const at = { x: 170 * FP, y: 630 * FP };
    const steer = (_t: number, st: ReturnType<typeof createSim>["state"]): Input => {
      st.currency = 99;
      const dx = at.x - st.player.pos.x, dy = at.y - st.player.pos.y, d = Math.hypot(dx, dy);
      return d < 3 * FP ? { dx: 0, dy: 0 } : { dx: Math.round((dx / d) * FP), dy: Math.round((dy / d) * FP) };
    };
    const out = run(pin(level3), 30 * 25, steer, (e) => e.t === "built");
    expect(out.seen.has("built")).toBe(true);
    for (let i = 0; i < 30; i++) out.r.sync(out.sim.state, 0, out.cam);
    const roots: Object3D[] = [];
    out.r.three.scene.traverse((o) => { if (o.name === "conv.food_processor" && !o.userData["ghost"]) roots.push(o); });
    expect(roots.length).toBeGreaterThan(0);
    // the building scale times the galley's own size multiplier (look.json modelScale)
    for (const o of roots) expect(o.scale.y).toBeCloseTo(ART_M * BUILD_K * modelScaleFor(LOOK.modelScale, "conv.food_processor"), 0);
    out.r.dispose();
  });

  it("level 4 during the first wave stays inside the budgets on every tier", () => {
    const { r, seen } = run(pin(level4), 2400, () => ({ dx: 0, dy: 0 }), (e) => e.t === "wave_started");
    expect(seen.has("wave_started")).toBe(true);
    for (const q of ["low", "medium", "high"] as const) {
      r.setQuality(q);
      const s = r.stats();
      expect(s.quality).toBe(q);
      expect(s.estDrawCalls, `${q} draw calls`).toBeLessThanOrEqual(MAX_DRAW_CALLS);
      expect(s.estTriangles, `${q} triangles`).toBeLessThanOrEqual(MAX_TRIANGLES);
    }
    expect(finiteMatrices(r.three.scene)).toEqual([]);
    r.dispose();
  });

  it("keeps the camera look point on the map", () => {
    const { r, cam } = run(pin(level1), 200, () => ({ dx: -FP, dy: -FP }));
    expect(cam.x).toBeGreaterThanOrEqual(0);
    expect(cam.y).toBeGreaterThanOrEqual(0);
    expect(cam.x).toBeLessThanOrEqual(480);
    expect(cam.y).toBeLessThanOrEqual(900);
    r.dispose();
  });

  it("re-inits, resizes, switches skins and disposes cleanly", () => {
    const gl = fakeGL();
    const r = new Renderer3D({ now: () => 0, createGL: () => gl });
    const sim = createSim(pin(level4));
    for (const skin of Object.values(SKINS)) {
      r.init(sim.compiled.manifest, skin, fakeMount());
      r.resize(320, 640);
      r.sync(sim.state, 0, createCamera());
      expect(finiteMatrices(r.three.scene)).toEqual([]);
    }
    r.dispose();
    // sync after dispose is a no-op
    r.sync(sim.state, 0, createCamera());
  });

  it("projects world points, shows coach marks and leans the camera toward cam.lead", () => {
    const { r, sim, cam } = run(pin(level1), 30, () => ({ dx: 0, dy: 0 }));
    const pl = { x: sim.state.player.pos.x / FP, y: sim.state.player.pos.y / FP };
    const s = r.worldToScreen(pl);
    expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(390);
    r.setCoach({ key: "k", at: { x: 20, y: 880 }, text: "Go here" });
    r.sync(sim.state, 0, cam);
    r.setCoach({ key: "k", at: pl, text: "Here" });
    r.sync(sim.state, 0, cam);
    const before = { ...cam };
    r.snapCamera();
    r.sync(sim.state, 0, { ...cam, lead: { x: pl.x, y: pl.y + 300 } });
    const leaned = { x: 0, y: 0, zoom: 1, follow: true, lead: { x: pl.x, y: pl.y + 300 } };
    r.snapCamera();
    r.sync(sim.state, 0, leaned);
    expect(leaned.y).toBeGreaterThanOrEqual(before.y);
    r.setCoach(null);
    r.dispose();
  });

  it("labels new types, picks what is under a tap and shows a MAX tag over a full pack column", () => {
    const sim = createSim(pin(level1));
    const gl = fakeGL();
    const r = new Renderer3D({ now: () => 0, createGL: () => gl });
    r.init(sim.compiled.manifest, marsGreenhouse, fakeMount());
    r.resize(390, 780);
    const cam = createCamera();
    const seen: string[] = [];
    r.setDiscovery((id) => { seen.push(id); return id !== "sink.core"; });
    // a full column of greens and a partial one of ore
    const cap = sim.compiled.resources["res.food_raw_1"]!.cap!;
    sim.state.player.stack = [...new Array<string>(cap).fill("res.food_raw_1"), "res.material_basic"];
    r.snapCamera();
    r.sync(sim.state, 0, cam);
    expect(seen).toContain("sink.core");
    const { scene } = r.three;
    let sprites = 0;
    scene.traverse((o) => { if (o.visible && (o as { isSprite?: boolean }).isSprite) sprites++; });
    expect(sprites).toBeGreaterThan(0);
    // tap on the hero: the hero is the closest character to the screen centre column
    const pl = sim.state.player.pos;
    const p = r.worldToScreen({ x: pl.x / FP, y: pl.y / FP }, 14);
    expect(r.pick(p.x, p.y)).toBe("unit.player");
    // the kiosk body under its screen point
    const k = r.worldToScreen({ x: sim.state.sales!.pos.x / FP, y: sim.state.sales!.pos.y / FP }, 30);
    expect(r.pick(k.x, k.y)).toBe("sink.sales_point");
    expect(r.pick(-500, -500)).toBeNull();
    r.setDiscovery(null);
    r.sync(sim.state, 0, cam);
    r.dispose();
  });
});
