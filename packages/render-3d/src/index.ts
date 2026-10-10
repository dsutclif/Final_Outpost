// Public entry of @fo/render-3d. Deliberately three-free: importing this module costs
// nothing, and loadRenderer3D() pulls three.js in a separate chunk only when the player
// switches to the 3D renderer, so the 2D-only bundle stays small.

import type { RenderStats, Renderer } from "./contract.js";
import type { QualityTier } from "./units.js";

export type { Camera, CoachMark, RenderStats, Renderer } from "./contract.js";
export { createCamera, LEAD_WEIGHT } from "./contract.js";
export { ART_M, FOV_DEG, PITCH_DEG, VIEW_W, QUALITY_TIERS, TIERS, MAX_DRAW_CALLS, MAX_TRIANGLES, type QualityTier, type TierSettings } from "./units.js";
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
  /** Jump the camera onto the hero on the next sync. */
  snapCamera(): void;
  /** World point (world units, on the ground) to mount CSS px, with the last camera. */
  worldToScreen(p: { x: number; y: number }, height?: number): { x: number; y: number };
}

export interface LoadRenderer3DOptions {
  quality?: QualityTier;
  now?: () => number;
  dpr?: () => number;
}

/** Async factory: code-splits three.js and the renderer out of the main bundle. */
export async function loadRenderer3D(opts: LoadRenderer3DOptions = {}): Promise<Renderer3DHandle> {
  const mod = await import("./renderer.js");
  return new mod.Renderer3D(opts) as unknown as Renderer3DHandle;
}

/** Optional: warm the chunk (e.g. on the settings screen) without constructing a renderer. */
export function preloadRenderer3D(): Promise<unknown> {
  return import("./renderer.js");
}


