import type { Content, Manifest } from "@fo/content";
import type { Compiled } from "@fo/sim";
import type { Skin, SkinPalette } from "@fo/skins";
import type { V, WorldView } from "../view.js";
import type { G } from "./prim.js";

/** Static info about a pad, read once from the manifest (costs, label, requirements). */
export interface PadInfo {
  id: string;
  kind: "hire" | "build";
  cost: Record<string, number>;
  label: string;
  big: boolean;
  requiresPad?: string;
  /** Label of the required pad, for the lock reason. */
  requiresLabel?: string;
  requiresCoreLevel?: number;
  /** Hire pads: where the worker takes from and delivers to. */
  from?: string;
  to?: string;
  /** This pad completes the level's build goal. */
  goal?: boolean;
  /** For hire pads: the role hired. For build pads: what is built (struct.*, node.enable, ...). */
  what: string;
}

/** Everything a draw routine may read. Built once per frame by the renderer. */
export interface DC {
  g: G;
  skin: Skin;
  pal: SkinPalette;
  content: Content;
  manifest: Manifest;
  cp: Compiled | null;
  world: WorldView;
  /** Seconds since init, for idle animation. */
  t: number;
  /** Interpolated position (world units) for a mover key, falling back to fixed-point pos. */
  pos(key: string, fpPos: V): V;
  /** Fixed-point to world units, no interpolation. */
  w(fpPos: V): V;
  name(id: string): string;
  ui(key: string, vars?: Record<string, string | number>): string;
  /** Hit-flash intensity 0..1 for an entity key. */
  flash(key: string): number;
  /** Seconds since a pop started for this key; Infinity if none. */
  popAge(key: string): number;
  /** Items of this type still flying onto the player's back stack. */
  inFlight(res: string): number;
  safeR: number;
  fuelCap: number;
  pads: Map<string, PadInfo>;
  registerStaffed: boolean;
  /** Pixels per world unit on screen, for line widths that must stay crisp. */
  px: number;
  /** 0..1, how fast the player is moving (drives back-stack wobble). */
  moving: number;
  /** Seconds since `value` was first seen for `key` (state-change timers without sim fields). */
  since(key: string, value: string): number;
  /** Per-tick displacement of a mover key, world units (zero when unknown). */
  vel(key: string): V;
  /** Knockback offset for an entity key after a hit, or null. */
  knock(key: string): V | null;
  /** Back-stack sway in world units (a damped spring on the hero's motion). */
  sway: V;
  /** True while the hero stands outside the core's safe radius. */
  outside: boolean;
  /** Render quality tier. */
  quality: "low" | "medium" | "high";
}

/** Sprite key for a canonical id: the skin's choice, else the generic default. */
export function spriteKey(dc: DC, id: string): string {
  return dc.skin.sprites[id] ?? DEFAULT_SPRITES[id] ?? id;
}

// Generic keys per canonical id, used by skins that do not choose (the debug skin).
const DEFAULT_SPRITES: Record<string, string> = {
  "res.material_basic": "item.ore",
  "res.material_refined": "item.alloy",
  "res.fuel_dense": "item.fuel_cell",
  "res.food_raw_1": "item.greens",
  "res.food_raw_2": "item.protein",
  "res.food_prepared": "item.meal",
  "res.salvage": "item.scrap",
  "res.currency": "item.coin",
  "role.idle": "hat.none",
  "role.supplier": "hat.hardhat",
  "role.server": "hat.cap",
  "role.cashier": "hat.visor",
  "role.operator": "hat.goggles",
  "role.hunter": "hat.antenna",
  "role.defender": "hat.crest",
  "role.hauler": "hat.frame",
  "role.medic": "hat.cross",
};
