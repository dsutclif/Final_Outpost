import { luminance, mix, type Skin } from "@fo/skins";

// Every colour the 3D renderer uses, derived from the active skin's palette tokens. Nothing
// here names a skin or holds a literal colour: a new skin re-themes the whole scene, and the
// grey debug skin stays grey. Sky, fog and storm are skin tokens; derived tokens (suit,
// visor...) are mixes of real tokens. skin.look3d.saturation nudges the scene's colour
// (the palette the contrast tests check is untouched).

export interface Tokens {
  ground: string;
  groundAlt: string;
  groundDark: string;
  structure: string;
  structureDark: string;
  accent: string;
  interactive: string;
  guideShadow: string;
  guideLight: string;
  danger: string;
  ok: string;
  ink: string;
  glass: string;
  /** Pale haze at the horizon and the fog colour. */
  sky: string;
  skyTop: string;
  fog: string;
  /** Fog colour while the hazard event is active. */
  storm: string;
  /** Key light tint (warm). */
  sun: string;
  /** Plasma core: outer glow and hot centre. */
  plasma: string;
  plasmaHot: string;
  /** Trim on structures (steel bands). */
  trim: string;
  metal: string;
  metalDark: string;
  /** Hero suit, visor. */
  suit: string;
  suitDark: string;
  visor: string;
  /** Customers' suits. */
  customer: string;
  customerDark: string;
  /** Raiders: dark rags and a danger-coloured visor. */
  raider: string;
  raiderDark: string;
  raiderVisor: string;
  creature: string;
  creatureDark: string;
  prey: string;
  /** Distress overlay tint. */
  frost: string;
  res: Record<string, string>;
  role: Record<string, string>;
  /**
   * Colours for chips and labels drawn in the world: `panel` is always the light one and `ink`
   * the dark one, whichever way round the skin's UI theme has them (a dark HUD flips them).
   */
  paper: { panel: string; ink: string; muted: string };
}

/** Scale a hex colour's HSL saturation by k (clamped). */
export function saturate(hex: string, k: number): string {
  if (k === 1) return hex;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((x) => parseInt(x, 16) / 255) as [number, number, number];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return hex;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  const s0 = d / (1 - Math.abs(2 * l - 1));
  const s = Math.min(1, s0 * k);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - q;
  const ch = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    const v = t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  };
  return "#" + [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function deriveTokens(skin: Skin): Tokens {
  const k = skin.look3d?.saturation ?? 1;
  const sat = (c: string): string => saturate(c, k);
  const lift = skin.look3d?.groundLift ?? 0;
  const sky = sat(skin.palette.sky);
  const g = (c: string): string => mix(sat(c), sky, lift);
  const p = { ...skin.palette, ground: g(skin.palette.ground), groundAlt: g(skin.palette.groundAlt), groundDark: g(skin.palette.groundDark), accent: sat(skin.palette.accent) };
  return {
    ground: p.ground,
    groundAlt: p.groundAlt,
    groundDark: p.groundDark,
    structure: p.structure,
    structureDark: p.structureDark,
    accent: p.accent,
    interactive: p.interactive,
    guideShadow: p.guideShadow,
    guideLight: p.guideLight,
    danger: p.danger,
    ok: p.ok,
    ink: p.ink,
    glass: p.glass,
    sky,
    skyTop: mix(sky, p.interactive, 0.25),
    fog: sat(p.fog),
    storm: sat(p.storm),
    sun: mix(p.structure, p.accent, 0.22),
    plasma: p.accent,
    plasmaHot: mix(p.accent, p.structure, 0.55),
    trim: mix(p.glass, p.structureDark, 0.45),
    metal: mix(p.structureDark, p.ink, 0.3),
    metalDark: mix(p.structureDark, p.ink, 0.6),
    suit: p.structure,
    suitDark: mix(p.structureDark, p.ink, 0.12),
    visor: mix(p.ink, p.interactive, 0.38),
    customer: mix(p.structureDark, p.ink, 0.28),
    customerDark: mix(p.structureDark, p.ink, 0.5),
    raider: mix(p.ink, p.groundDark, 0.35),
    raiderDark: mix(p.ink, p.groundDark, 0.12),
    raiderVisor: p.danger,
    creature: mix(p.groundDark, p.ink, 0.45),
    creatureDark: mix(p.groundDark, p.ink, 0.75),
    prey: mix(p.groundAlt, p.structureDark, 0.45),
    frost: mix(p.glass, p.interactive, 0.5),
    res: Object.fromEntries(Object.entries(p.res).map(([id, c]) => [id, sat(c)])),
    role: { ...p.role },
    paper: luminance(p.ui.panel) >= luminance(p.ui.ink)
      ? { panel: p.ui.panel, ink: p.ui.ink, muted: p.ui.muted }
      : { panel: p.ui.ink, ink: p.ui.panel, muted: p.ui.muted },
  };
}

export const resToken = (t: Tokens, res: string): string => t.res[res] ?? t.interactive;
export const roleToken = (t: Tokens, role: string): string => t.role[role] ?? t.role["role.idle"] ?? t.structureDark;
