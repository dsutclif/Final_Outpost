import type { Manifest } from "@fo/content";
import { FP, createSim, type SimEvent, type State } from "@fo/sim";
import { Renderer2D, type Camera, type CoachMark } from "@fo/render-2d";
import { createCamera as createCamera3D, loadRenderer3D, preloadRenderer3D } from "@fo/render-3d";
import type { Skin } from "@fo/skins";

// One face for both renderers, so the app swaps them live behind the same camera, coach
// marks, coin target and quality toggle. three.js stays in its own chunk: only
// loadRenderer3D() (here, on demand) pulls it in.

export type RendererKind = "2d" | "3d";
export type Tier = "low" | "medium" | "high";

export interface GameRenderer {
  readonly kind: RendererKind;
  init(manifest: Manifest, skin: Skin, mount: HTMLElement): void;
  sync(state: State, alpha: number, cam: Camera): void;
  onEvent(e: SimEvent): void;
  resize(w: number, h: number): void;
  dispose(): void;
  setQuality(q: Tier): void;
  setCoach(c: CoachMark | null): void;
  snapCamera(): void;
  /** World point (world units) to mount CSS px with the last camera. */
  worldToScreen(p: { x: number; y: number }, height?: number): { x: number; y: number };
  hudAnchor: () => { x: number; y: number };
  onCoinLanded: (() => void) | null;
  /** Measured frame rate (3D only reports one). */
  fps(): number | null;
}

/** True when a WebGL context can be created (cheap probe on a detached canvas). */
export function webglAvailable(doc: Document | null = typeof document !== "undefined" ? document : null): boolean {
  if (!doc) return false;
  try {
    const c = doc.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch { return false; }
}

class Wrap2D implements GameRenderer {
  readonly kind = "2d" as const;
  constructor(private readonly r: Renderer2D) {}
  init(m: Manifest, s: Skin, el: HTMLElement): void { this.r.init(m, s, el); }
  sync(st: State, a: number, cam: Camera): void { this.r.sync(st, a, cam); }
  onEvent(e: SimEvent): void { this.r.onEvent(e); }
  resize(w: number, h: number): void { this.r.resize(w, h); }
  dispose(): void { this.r.dispose(); }
  setQuality(q: Tier): void { this.r.setQuality(q); }
  setCoach(c: CoachMark | null): void { this.r.setCoach(c); }
  snapCamera(): void { this.r.snapCamera(); }
  worldToScreen(p: { x: number; y: number }): { x: number; y: number } { return this.r.worldToScreen(p); }
  get hudAnchor(): () => { x: number; y: number } { return this.r.hudAnchor; }
  set hudAnchor(fn: () => { x: number; y: number }) { this.r.hudAnchor = fn; }
  private coin: (() => void) | null = null;
  get onCoinLanded(): (() => void) | null { return this.coin; }
  set onCoinLanded(fn: (() => void) | null) { this.coin = fn; this.r.onCoinLanded = fn; }
  fps(): number | null { return null; }
}

type Handle3D = Awaited<ReturnType<typeof loadRenderer3D>>;

class Wrap3D implements GameRenderer {
  readonly kind = "3d" as const;
  constructor(private readonly r: Handle3D) {}
  init(m: Manifest, s: Skin, el: HTMLElement): void { this.r.init(m, s, el); }
  sync(st: State, a: number, cam: Camera): void { this.r.sync(st, a, cam); }
  onEvent(e: SimEvent): void { this.r.onEvent(e); }
  resize(w: number, h: number): void { this.r.resize(w, h); }
  dispose(): void { this.r.dispose(); }
  setQuality(q: Tier): void { if (this.r.getQuality() !== q) this.r.setQuality(q); }
  setCoach(c: CoachMark | null): void { this.r.setCoach(c); }
  snapCamera(): void { this.r.snapCamera(); }
  worldToScreen(p: { x: number; y: number }, h = 0): { x: number; y: number } { return this.r.worldToScreen(p, h); }
  get hudAnchor(): () => { x: number; y: number } { return this.r.hudAnchor; }
  set hudAnchor(fn: () => { x: number; y: number }) { this.r.hudAnchor = fn; }
  get onCoinLanded(): (() => void) | null { return this.r.onCoinLanded; }
  set onCoinLanded(fn: (() => void) | null) { this.r.onCoinLanded = fn; }
  fps(): number | null { return this.r.stats().fps; }
}

/**
 * Build a renderer. The 3D one loads its chunk first and throws when WebGL is unavailable or
 * the context cannot be created; callers fall back to 2D.
 */
export async function createRenderer(kind: RendererKind, quality: Tier): Promise<GameRenderer> {
  if (kind === "2d") return new Wrap2D(new Renderer2D({ quality }));
  if (!webglAvailable()) throw new Error("WebGL unavailable");
  return new Wrap3D(await loadRenderer3D({ quality }));
}

export const warm3D = (): void => { void preloadRenderer3D().catch(() => undefined); };

// ------------------------------------------------------------------ first-launch benchmark

/** Below this the 3D renderer is not the default (ART/spec: 30 fps floor plus headroom). */
export const BENCH_MIN_FPS = 40;
export const BENCH_MS = 3000;

export interface BenchResult { fps: number; ok: boolean; reason: "ok" | "slow" | "webgl" | "load" | "hidden" }

/** The renderer the benchmark picks. */
export const pickRenderer = (r: BenchResult): RendererKind => (r.ok && r.fps >= BENCH_MIN_FPS ? "3d" : "2d");

/** Quality tier for "auto" from the benchmark (3D) or the core count (2D, no benchmark). */
export function autoTier(benchFps: number | null, cores: number): Tier {
  if (benchFps !== null && benchFps > 0) return benchFps >= 57 && cores >= 6 ? "high" : benchFps >= BENCH_MIN_FPS ? "medium" : "low";
  return cores <= 2 ? "low" : cores <= 4 ? "medium" : "high";
}

/**
 * Play a hidden level in 3D on `medium` for ~3 s behind the title screen, stepping the real sim
 * with a slow wander, and read the renderer's own fps counter (r.stats().fps, refreshed every
 * 0.5 s). The first 0.6 s are skipped (shader compiles, first texture uploads); the result is
 * the median of the samples after that. Hidden pages abort (rAF stops when backgrounded).
 */
export async function benchmark3D(manifest: Manifest, skin: Skin, host: HTMLElement, ms = BENCH_MS): Promise<BenchResult> {
  const doc = host.ownerDocument;
  if (!webglAvailable(doc)) return { fps: 0, ok: false, reason: "webgl" };
  let r: Handle3D;
  try { r = await loadRenderer3D({ quality: "medium" }); } catch { return { fps: 0, ok: false, reason: "load" }; }
  const box = doc.createElement("div");
  box.className = "bench";
  host.appendChild(box);
  try {
    r.init(manifest, skin, box);
    const rect = host.getBoundingClientRect();
    r.resize(rect.width || 390, rect.height || 700);
  } catch {
    box.remove();
    try { r.dispose(); } catch { /* ignore */ }
    return { fps: 0, ok: false, reason: "webgl" };
  }
  const sim = createSim(manifest);
  const cam = createCamera3D();
  const samples: number[] = [];
  const t0 = performance.now();
  let lastSample = t0;
  let hidden = false;
  await new Promise<void>((done) => {
    // rAF never fires in a background tab: give up after the run plus a margin
    let finished = false;
    const finish = (): void => { if (!finished) { finished = true; done(); } };
    const guard = setTimeout(() => { hidden = true; finish(); }, ms + 2500);
    if (doc.visibilityState === "hidden") { hidden = true; clearTimeout(guard); finish(); return; }
    const frame = (now: number): void => {
      if (finished) return;
      if (doc.visibilityState === "hidden") { hidden = true; clearTimeout(guard); finish(); return; }
      const tick = sim.state.tick;
      const ph = Math.floor(tick / 60) % 4;
      const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][ph]!;
      for (const e of sim.step({ dx: d[0]! * FP, dy: d[1]! * FP })) r.onEvent(e);
      r.sync(sim.state, 0, cam);
      if (now - t0 > 600 && now - lastSample >= 500) { samples.push(r.stats().fps); lastSample = now; }
      if (now - t0 >= ms) { clearTimeout(guard); finish(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  try { r.dispose(); } catch { /* ignore */ }
  box.remove();
  if (hidden) return { fps: 0, ok: false, reason: "hidden" };
  samples.sort((a, b) => a - b);
  const fps = samples.length ? samples[Math.floor(samples.length / 2)]! : 0;
  return { fps, ok: fps >= BENCH_MIN_FPS, reason: fps >= BENCH_MIN_FPS ? "ok" : "slow" };
}
