// Contract 3: a skin is a data pack keyed by canonical id. It changes names, colours,
// sprite/model keys, audio and story text; never ids, rules or level data.

export interface SkinPalette {
  /** Main ground fill; every interactive colour is contrast-checked against it. */
  ground: string;
  /** Ground scatter and patches. */
  groundAlt: string;
  /** Darker ground details (cracks, plate seams). */
  groundDark: string;
  /** Building panels. */
  structure: string;
  /** Building trim and shadows of structures. */
  structureDark: string;
  /** Warm key accent: core glow, goal pads, primary buttons. */
  accent: string;
  /** Interactive highlight: pads, rings, operator spots, pointers. */
  interactive: string;
  danger: string;
  /** Positive state: staffed, healthy, cleared. */
  ok: string;
  /** World-space text and outlines. */
  ink: string;
  /** Glass, domes, pods. */
  glass: string;
  /** One colour per resource id. */
  res: Record<string, string>;
  /** Body colour per role id (plus "role.idle"). */
  role: Record<string, string>;
  /** HUD and menu colours (CSS). */
  ui: { bg: string; panel: string; panelAlt: string; ink: string; muted: string; go: string; goShade: string; bad: string; overlay: string };
}

export interface SkinText {
  /** One line per sim hint key. Unknown keys fall back to a humanised key. */
  hints: Record<string, string>;
  /** Result-card text per end reason ("goal", "meter.lifeline", "timer", ...). */
  reasons: Record<string, string>;
  /** Goal templates per goal type; {target} {n} are substituted. */
  goals: Record<string, string>;
  /** Short floaters and banners per event key; {n} {name} {s} are substituted. */
  floaters: Record<string, string>;
  /** UI strings: button labels, chip labels, menu copy. */
  ui: Record<string, string>;
  /** Tips shown on a level intro card when the manifest has none for this skin. */
  genericTips: string[];
}

export interface Skin {
  id: string;
  /** Display name of the skin, also the installed app's name. */
  name: string;
  tagline: string;
  /** What the lifeline meter is called (Heat, Warmth, Air). */
  lifelineName: string;
  /** What the core burns, as shown in the HUD. */
  fuelName: string;
  /** Hazard event name (Dust storm, Blizzard). */
  hazardName: string;
  /** Name of every canonical id. */
  names: Record<string, string>;
  palette: SkinPalette;
  /** 2D sprite key per canonical id; the 2D renderer maps keys to draw routines. */
  sprites: Record<string, string>;
  /** 3D model key per canonical id (the 3D renderer fills these in). */
  models: Record<string, string>;
  text: SkinText;
  /** Synth patch key per event key. */
  audio: Record<string, string>;
  /** Draw the canonical-id label on every entity (debug skin). */
  labelAll?: boolean;
  /** Web app manifest theme colour. */
  themeColor: string;
}
