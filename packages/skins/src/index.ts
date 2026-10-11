import { debugSkin } from "./debug.js";
import { humanise } from "./ids.js";
import { marsGreenhouse } from "./mars_greenhouse.js";
import type { Skin } from "./types.js";

export type { Skin, SkinLook3D, SkinPalette, SkinText } from "./types.js";
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

/** One-line purpose of a canonical id, or "" when the skin has none. */
export function purposeOf(skin: Skin, id: string): string {
  return skin.purposes?.[id] ?? "";
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

/** Seconds as m:ss. */
export const clockText = (seconds: number): string => { const s = Math.max(0, Math.ceil(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/**
 * Name of a star objective: the manifest's own label, else the skin template for its kind with
 * params filled in (ids through names, seconds as m:ss).
 */
export function objectiveText(skin: Skin, kind: string, params: Record<string, number | string> = {}, label?: string, padBuild?: (pad: string) => string | null): string {
  if (label) return label;
  const tpl = skin.text.objectives?.[kind];
  if (!tpl) return humanise(kind);
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === "seconds" && typeof v === "number") vars["time"] = clockText(v);
    else if (k === "target" && typeof v === "string") vars["target"] = nameOf(skin, padBuild?.(v) ?? "struct.landmark");
    else if (typeof v === "string") vars[k] = nameOf(skin, v);
    else vars[k] = v;
  }
  return fmt(tpl, vars).replace(/\s+/g, " ").trim();
}

/** One-line guide instruction for a bot task kind; {res} {name} are substituted. */
export function guideText(skin: Skin, kind: string, vars?: Record<string, string | number>): string {
  return fmt(skin.text.guide?.[kind] ?? humanise(kind), vars);
}

export function resColor(skin: Skin, res: string): string {
  return skin.palette.res[res] ?? skin.palette.interactive;
}

/** What levelTitle() reads from a manifest or a pack entry. */
export interface TitleSource {
  id: string;
  goal: { type: string } | string;
  modules: readonly string[];
  text?: Record<string, { title?: string } | undefined>;
}

/** Modules every level has; a title names something more distinctive when it can. */
const BASIC_MODULES = new Set(["carry", "gather", "core", "sales", "workers"]);

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Title of a level in this skin: the manifest's own text, else the skin's title for that level
 * id, else one built from the goal and the headline module (the last non-basic module), picked
 * deterministically from the level id ("Dust and Foundations"). Null when the skin has no words.
 */
export function levelTitle(skin: Skin, m: TitleSource): string | null {
  const own = m.text?.[skin.id]?.title;
  if (own) return own;
  const fixed = skin.levelTitles?.[m.id];
  if (fixed) return fixed;
  const words = skin.text.titleWords;
  if (!words) return null;
  const goal = typeof m.goal === "string" ? m.goal : m.goal.type;
  const gw = words.goals[goal] ?? [];
  const head = [...m.modules].reverse().find((x) => !BASIC_MODULES.has(x)) ?? m.modules[m.modules.length - 1];
  const mw = (head && words.modules[head]) || [];
  const h = hash32(m.id);
  const g = gw.length ? gw[h % gw.length]! : "";
  const w = mw.length ? mw[(h >>> 8) % mw.length]! : "";
  if (g && w) return `${w} and ${g}`;
  return g || w || null;
}
