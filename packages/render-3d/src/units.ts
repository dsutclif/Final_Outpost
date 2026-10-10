// Scale and camera constants. Three-free so the lazy entry point can import them.
//
// The scene works in sim world units on the ground plane: sim (x, y) / FP maps to three
// (x, 0, y), so +y in the sim ("down the screen") is +z, toward the camera. Models are
// authored in art metres (the hero is 1.0 tall, ART-DIRECTION.md) and scaled by ART_M.

/** World units per art metre: the hero stands about as tall as the 2D figure (28 units). */
export const ART_M = 28;

/** Camera pitch below the horizon, degrees (ART-DIRECTION.md: about 50). */
export const PITCH_DEG = 50;
/** Vertical field of view, degrees: slight perspective. */
export const FOV_DEG = 40;
/**
 * Ground width visible at the look point, world units. The 2D stage shows 400; a tilted
 * camera sees more ground depth for the same screen, so 3D frames a little tighter.
 */
export const VIEW_W = 320;
/** Follow easing rate, 1/s (same as the 2D renderer). */
export const FOLLOW_RATE = 6;

export type QualityTier = "low" | "medium" | "high";
export const QUALITY_TIERS: readonly QualityTier[] = ["low", "medium", "high"];

/** Per-tier settings (docs/SPEC.md "Performance tiers"). */
export interface TierSettings {
  shadows: boolean;
  /** Shadow map size; low has none (blob shadows only). */
  shadowSize: number;
  softShadows: boolean;
  /** Dynamic lights besides the core (key + fill); low has only the core. */
  extraLights: number;
  maxPixelRatio: number;
  /** Additive glow halos (the cheap stand-in for bloom). */
  halos: boolean;
  particleScale: number;
}

export const TIERS: Readonly<Record<QualityTier, TierSettings>> = {
  low: { shadows: false, shadowSize: 0, softShadows: false, extraLights: 0, maxPixelRatio: 1, halos: false, particleScale: 0.5 },
  medium: { shadows: true, shadowSize: 1024, softShadows: false, extraLights: 2, maxPixelRatio: 1.5, halos: true, particleScale: 1 },
  high: { shadows: true, shadowSize: 2048, softShadows: true, extraLights: 2, maxPixelRatio: 2, halos: true, particleScale: 1 },
};

/** Scene budgets (docs/SPEC.md "Performance budget"). */
export const MAX_DRAW_CALLS = 100;
export const MAX_TRIANGLES = 60_000;
