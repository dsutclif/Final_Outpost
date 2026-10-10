import type { Manifest } from "@fo/content";
import type { SimEvent, State } from "@fo/sim";
import type { Skin } from "@fo/skins";

/**
 * Camera in world units. The renderer eases it toward the player and clamps it to the
 * world every sync, writing the result back, so the client can read where it looks.
 */
export interface Camera {
  /** View centre, world units. */
  x: number;
  y: number;
  /** Extra zoom on top of the fit-to-width scale (1 = STAGE_W world units across). */
  zoom: number;
  /** Follow the player (true) or hold the given centre (false). */
  follow: boolean;
  /**
   * Optional world point the camera leans toward while following (nearest pad, coach target),
   * so targets near the map edge come fully on screen. Null or absent: follow the hero only.
   */
  lead?: { x: number; y: number } | null;
}

export const createCamera = (): Camera => ({ x: 0, y: 0, zoom: 1, follow: true, lead: null });

/** How far toward `cam.lead` the follow target moves (0 = hero only, 1 = the lead point). */
export const LEAD_WEIGHT = 0.35;

/** Contract 2 (docs/PLAN.md). Both the 2D and the 3D renderer implement this. */
export interface Renderer {
  init(manifest: Manifest, skin: Skin, mount: HTMLElement): void;
  /** alpha in [0,1): how far the frame sits between the previous tick and this one. */
  sync(state: State, alpha: number, cam: Camera): void;
  onEvent(e: SimEvent): void;
  resize(w: number, h: number): void;
  dispose(): void;
}
