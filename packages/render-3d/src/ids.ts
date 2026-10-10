import type { Content } from "@fo/content";
import { canonicalIds } from "@fo/skins";

// Asset classes, budgets and anchors (docs/SPEC.md "Asset pipeline and art direction").
// Three-free: tests and tools read these without loading the renderer.

export type AssetClass = "character" | "hero" | "prop" | "scatter" | "decal" | "env";

/** Triangle budget per model, by class. */
export const TRI_BUDGET: Readonly<Record<AssetClass, number>> = {
  character: 8000,
  hero: 5000,
  prop: 500,
  scatter: 500,
  decal: 500,
  env: 20_000,
};

export type AnchorName = "deposit" | "pickup" | "queue" | "interact" | "safe" | "pad" | "stack" | "hand_L" | "hand_R" | "head";
export const ANCHOR_NAMES: readonly AnchorName[] = ["deposit", "pickup", "queue", "interact", "safe", "pad", "stack", "hand_L", "hand_R", "head"];

/** Anchors every model of a class must expose. Ids add their own on top (see the registry). */
export const CLASS_ANCHORS: Readonly<Record<AssetClass, readonly AnchorName[]>> = {
  character: ["stack", "hand_L", "hand_R", "head"],
  hero: ["interact", "pad"],
  prop: [],
  scatter: ["interact"],
  decal: [],
  env: [],
};

/** Canonical-id prefixes that never render as a model (HUD meters, module and goal labels). */
export const NON_VISUAL_PREFIXES: readonly string[] = ["module.", "goal.", "meter."];

/** Every canonical id the 3D renderer must be able to build: content plus Contract 1, minus non-visual ids. */
export function modelIds(c: Content): string[] {
  return canonicalIds(c).filter((id) => !NON_VISUAL_PREFIXES.some((p) => id.startsWith(p)));
}
