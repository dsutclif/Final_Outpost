// Public entry of @fo/render-3d. Deliberately three-free: importing this module costs
// nothing, and loadRenderer3D() pulls three.js in a separate chunk, so the app shell boots
// (title, menus, the unsupported-device screen) without downloading it.

import type { AlertMark, LiveLook, RenderStats, Renderer, StoryPresentation } from "./contract.js";
import type { QualityTier } from "./units.js";
import type { DebugScene } from "./probe.js";

export type { DebugScene, DebugThing, DebugLabel, ScreenBox, ThingKind } from "./probe.js";

export type { AlertMark, Camera, CameraBeat, CoachMark, GuideMark, LiveLook, RenderStats, Renderer, RidgeSide, StoryPresentation, TallySlots } from "./contract.js";
export { createCamera, LEAD_WEIGHT } from "./contract.js";
export { SIZES, POD_K, POD_CAVITY_M } from "./sizes.js";
export { ART_M, BUILD_K, CHAR_K, viewWFor, FOV_DEG, PITCH_DEG, YAW_DEG, VIEW_W, TEXT, screenToWorld, worldToScreenPlane, QUALITY_TIERS, TIERS, MAX_DRAW_CALLS, MAX_TRIANGLES, type QualityTier, type TierSettings } from "./units.js";
export { TRI_BUDGET, CLASS_ANCHORS, ANCHOR_NAMES, modelIds, type AssetClass, type AnchorName } from "./ids.js";

/** What the client holds: Contract 2 plus the 3D extras. */
export interface Renderer3DHandle extends Renderer {
  setQuality(tier: QualityTier): void;
  getQuality(): QualityTier;
  stats(): RenderStats;
  hudAnchor: () => { x: number; y: number };
  onCoinLanded: (() => void) | null;
  /** Contextual coach mark (world units), or null to hide it; drawn as a DOM overlay. */
  setCoach(c: { key: string; at: { x: number; y: number }; text: string } | null): void;
  /** Guide arrow target (world units) with its one-line instruction, or null to hide it. */
  setGuide(g: { key: string; at: { x: number; y: number }; text: string } | null): void;
  /** The things the current urgent alert is about (a danger marker floats over each); empty for none. */
  setAlertMarks(marks: readonly AlertMark[]): void;
  /** Jump the camera onto the hero on the next sync. */
  snapCamera(): void;
  /** Dev review probes: what is drawn now, with world and screen bounds (read-only; see probe.ts). */
  debugScene(): DebugScene;
  /** World point (world units, on the ground) to mount CSS px, with the last camera. */
  worldToScreen(p: { x: number; y: number }, height?: number): { x: number; y: number };
  /** Canonical id of the object under a mount CSS px point (tap to inspect), or null. */
  pick(x: number, y: number): string | null;
  /** pick() with display text: hire pads and hired colonists are named for what they work. */
  inspect(x: number, y: number): { id: string; name: string; purpose: string } | null;
  /** Which types still show a floating discovery label (name + purpose); null shows none. */
  setDiscovery(isNew: ((id: string) => boolean) | null): void;
  /** Story presentation (world light, reactor spirit, camera beat); inactive until a story level uses it. */
  story(): StoryPresentation;
  /** The reactor spirit's small copy, drawn on its own canvas. */
  spiritPortrait(canvas: HTMLCanvasElement): { readonly canvas: HTMLCanvasElement; update(t: number): void; dispose(): void };
  /** The ground and light right now, for a live scene to match; null before a level is built. */
  liveLook(): LiveLook | null;
}

export interface LoadRenderer3DOptions {
  quality?: QualityTier;
  now?: () => number;
  dpr?: () => number;
  /** Look test: image-based light, bloom, dynamic full-retina resolution. */
  look?: boolean;
}

/** Async factory: code-splits three.js and the renderer out of the main bundle. */
/** The live-scene player (scene/livescene.ts), loaded only when a scene plays so three stays out of the shell. */
export const loadLiveScene = (): Promise<typeof import("./scene/livescene.js")> => import("./scene/livescene.js");

export async function loadRenderer3D(opts: LoadRenderer3DOptions = {}): Promise<Renderer3DHandle> {
  const mod = await import("./renderer.js");
  return new mod.Renderer3D(opts) as unknown as Renderer3DHandle;
}

/** Optional: warm the chunk (e.g. on the settings screen) without constructing a renderer. */
export function preloadRenderer3D(): Promise<unknown> {
  return import("./renderer.js");
}

