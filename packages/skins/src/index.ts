import { debugSkin } from "./debug.js";
import { humanise } from "./ids.js";
import { marsGreenhouse } from "./mars_greenhouse.js";
import type { Skin } from "./types.js";

export type { Skin, SkinPalette, SkinText } from "./types.js";
export { canonicalIds, CONTRACT_IDS, humanise } from "./ids.js";
export { luminance, contrast, mix, alpha, parseHex, MIN_INTERACTIVE_CONTRAST } from "./color.js";
export { marsGreenhouse, debugSkin };

export const SKINS: Readonly<Record<string, Skin>> = {
  [marsGreenhouse.id]: marsGreenhouse,
  [debugSkin.id]: debugSkin,
};

export const DEFAULT_SKIN = marsGreenhouse.id;

export function getSkin(id: string | null | undefined): Skin {
  return (id && SKINS[id]) || marsGreenhouse;
}

/** Display name of a canonical id; never throws, so a missing name shows as a readable label. */
export function nameOf(skin: Skin, id: string): string {
  return skin.names[id] ?? humanise(id);
}

/** Fill {key} placeholders. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function hintText(skin: Skin, key: string): string {
  return skin.text.hints[key] ?? humanise(key);
}

export function uiText(skin: Skin, key: string, vars?: Record<string, string | number>): string {
  return fmt(skin.text.ui[key] ?? humanise(key), vars);
}

export function floaterText(skin: Skin, key: string, vars?: Record<string, string | number>): string {
  return fmt(skin.text.floaters[key] ?? humanise(key), vars);
}

export function resColor(skin: Skin, res: string): string {
  return skin.palette.res[res] ?? skin.palette.interactive;
}
