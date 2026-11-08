import type { Manifest } from "@fo/content";
import type { SimEvent, State } from "@fo/sim";
import { loadRenderer3D, preloadRenderer3D, type AlertMark, type Camera, type CoachMark, type DebugScene, type GuideMark, type LiveLook, type StoryPresentation } from "@fo/render-3d";
import type { Skin } from "@fo/skins";

// The client's face of the 3D renderer. three.js stays in its own chunk: only
// loadRenderer3D() (here, on demand) pulls it in, so the shell boots without it.

export type Tier = "low" | "medium" | "high";

export interface GameRenderer {
  init(manifest: Manifest, skin: Skin, mount: HTMLElement): void;
  sync(state: State, alpha: number, cam: Camera): void;
  onEvent(e: SimEvent): void;
  resize(w: number, h: number): void;
  dispose(): void;
  setQuality(q: Tier): void;
  setCoach(c: CoachMark | null): void;
  setGuide(g: GuideMark | null): void;
  setAlertMarks(marks: readonly AlertMark[]): void;
  snapCamera(): void;
  /** World point (world units) to mount CSS px with the last camera. */
  worldToScreen(p: { x: number; y: number }, height?: number): { x: number; y: number };
  /** Dev review probes: what is drawn now (null when the renderer cannot say). */
  debugScene(): DebugScene | null;
  /** Canonical id of the object under a mount CSS px point, or null. */
  pick(x: number, y: number): string | null;
  /** pick() with the inspect card text: workers and hire pads are named for what they work. */
  inspect(x: number, y: number): { id: string; name: string; purpose: string } | null;
  /** Which types still show a discovery label (name + purpose); null shows none. */
  setDiscovery(isNew: ((id: string) => boolean) | null): void;
  /** Story presentation handle: world light, reactor spirit, camera beat. Null when the renderer is not 3D. */
  story(): StoryPresentation | null;
  /** The reactor spirit's portrait on `canvas`; null when the renderer cannot draw one. */
  spiritPortrait(canvas: HTMLCanvasElement): { readonly canvas: HTMLCanvasElement; update(t: number): void; dispose(): void } | null;
  /** The ground and light right now, for a live scene to match; null when there is none. */
  liveLook(): LiveLook | null;
  hudAnchor: () => { x: number; y: number };
  onCoinLanded: (() => void) | null;
  /** Measured frame rate. */
  fps(): number;
}

type Handle3D = Awaited<ReturnType<typeof loadRenderer3D>>;

/**
 * True when WebGL works well enough for the 3D renderer: a context can be created on a
 * detached canvas and it offers the few limits the scene relies on (vertex textures are not
 * needed; instancing is core in WebGL2 and an extension in WebGL1).
 */
export function webglAvailable(doc: Document | null = typeof document !== "undefined" ? document : null): boolean {
  if (!doc) return false;
  try {
    const c = doc.createElement("canvas");
    const gl2 = c.getContext("webgl2") as WebGL2RenderingContext | null;
    const gl = (gl2 ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const ok = (gl2 !== null || gl.getExtension("ANGLE_instanced_arrays") !== null) && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 2048;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch { return false; }
}

class Wrap3D implements GameRenderer {
  constructor(private readonly r: Handle3D) {}
  init(m: Manifest, s: Skin, el: HTMLElement): void { this.r.init(m, s, el); }
  sync(st: State, a: number, cam: Camera): void { this.r.sync(st, a, cam); }
  onEvent(e: SimEvent): void { this.r.onEvent(e); }
  resize(w: number, h: number): void { this.r.resize(w, h); }
  dispose(): void { this.r.dispose(); }
  setQuality(q: Tier): void { if (this.r.getQuality() !== q) this.r.setQuality(q); }
  setCoach(c: CoachMark | null): void { this.r.setCoach(c); }
  setGuide(g: GuideMark | null): void { this.r.setGuide(g); }
  setAlertMarks(marks: readonly AlertMark[]): void { this.r.setAlertMarks(marks); }
  snapCamera(): void { this.r.snapCamera(); }
  worldToScreen(p: { x: number; y: number }, h = 0): { x: number; y: number } { return this.r.worldToScreen(p, h); }
  debugScene(): DebugScene | null { return this.r.debugScene(); }
  pick(x: number, y: number): string | null { return this.r.pick(x, y); }
  inspect(x: number, y: number): { id: string; name: string; purpose: string } | null { return this.r.inspect(x, y); }
  setDiscovery(isNew: ((id: string) => boolean) | null): void { this.r.setDiscovery(isNew); }
  get hudAnchor(): () => { x: number; y: number } { return this.r.hudAnchor; }
  set hudAnchor(fn: () => { x: number; y: number }) { this.r.hudAnchor = fn; }
  get onCoinLanded(): (() => void) | null { return this.r.onCoinLanded; }
  set onCoinLanded(fn: (() => void) | null) { this.r.onCoinLanded = fn; }
  story(): StoryPresentation { return this.r.story(); }
  spiritPortrait(canvas: HTMLCanvasElement) { return this.r.spiritPortrait(canvas); }
  liveLook(): LiveLook | null { return this.r.liveLook(); }
  fps(): number { return this.r.stats().fps; }
}

/** Load the 3D chunk and build a renderer; throws when WebGL is unavailable. */
export async function createRenderer(quality: Tier): Promise<GameRenderer> {
  if (!webglAvailable()) throw new Error("WebGL unavailable");
  // the new look (sky light, bloom, soft effects, full retina) is on except on the low tier
  return new Wrap3D(await loadRenderer3D({ quality, look: quality !== "low" && lookTest() }));
}

/** The new look is on by default; ?look=0 turns it off and ?look=1 back on (with a debug badge), remembered on the device. */
function lookTest(): boolean {
  try {
    const q = new URLSearchParams(location.search).get("look");
    if (q !== null) localStorage.setItem("fo.look", q === "1" ? "1" : "0");
    return localStorage.getItem("fo.look") !== "0";
  } catch { return true; }
}

export const warm3D = (): void => { void preloadRenderer3D().catch(() => undefined); };

/** Render small thumbnails of canonical ids (field guide); empty when the chunk or WebGL fails. */
export async function thumbnails(ids: readonly string[], skin: Skin, px = 96): Promise<Map<string, string>> {
  try {
    const mod = await preloadRenderer3D() as { renderThumbnails?: (ids: readonly string[], skin: Skin, px: number) => Promise<Map<string, string>> };
    return (await mod.renderThumbnails?.(ids, skin, px)) ?? new Map();
  } catch { return new Map(); }
}

// ------------------------------------------------------------------ quality probe

/** Seconds of play the "auto" quality probe watches before it settles on a tier. */
export const PROBE_SEC = 4;

/** Quality tier for "auto" from the probed frame rate, else the core count. */
export function autoTier(probeFps: number | null, cores: number): Tier {
  if (probeFps !== null && probeFps > 0) return probeFps >= 55 && cores >= 6 ? "high" : probeFps >= 38 ? "medium" : "low";
  return cores <= 2 ? "low" : cores <= 4 ? "medium" : "high";
}
