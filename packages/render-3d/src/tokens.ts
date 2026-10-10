import { mix, type Skin } from "@fo/skins";

// Every colour the 3D renderer uses, derived from the active skin's palette tokens. Nothing
// here names a skin or holds a literal colour: a new skin re-themes the whole scene, and the
// grey debug skin stays grey. Derived tokens (sky, suit, visor...) are mixes of real tokens.

export interface Tokens {
  ground: string;
  groundAlt: string;
  groundDark: string;
  structure: string;
  structureDark: string;
  accent: string;
  interactive: string;
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
  /** Trim on structures (teal accent bands in the launch skin). */
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
}

export function deriveTokens(skin: Skin): Tokens {
  const p = skin.palette;
  const sky = mix(p.accent, p.structure, 0.62);
  return {
    ground: p.ground,
    groundAlt: p.groundAlt,
    groundDark: p.groundDark,
    structure: p.structure,
    structureDark: p.structureDark,
    accent: p.accent,
    interactive: p.interactive,
    danger: p.danger,
    ok: p.ok,
    ink: p.ink,
    glass: p.glass,
    sky,
    skyTop: mix(sky, p.interactive, 0.25),
    fog: mix(sky, p.groundAlt, 0.35),
    storm: mix(p.accent, p.groundAlt, 0.55),
    sun: mix(p.structure, p.accent, 0.22),
    plasma: p.accent,
    plasmaHot: mix(p.accent, p.structure, 0.55),
    trim: mix(p.glass, p.interactive, 0.35),
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
    res: { ...p.res },
    role: { ...p.role },
  };
}

export const resToken = (t: Tokens, res: string): string => t.res[res] ?? t.interactive;
export const roleToken = (t: Tokens, role: string): string => t.role[role] ?? t.role["role.idle"] ?? t.structureDark;
