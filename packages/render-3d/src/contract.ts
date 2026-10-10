import type { Manifest } from "@fo/content";
import type { SimEvent, State } from "@fo/sim";
import type { Skin } from "@fo/skins";

// Same shapes as @fo/render-2d's contract.ts (structurally identical), so the client can
// hand either renderer the same camera object and swap them freely.

/** Camera in world units; the renderer eases it toward the player, clamps it and writes it back. */
export interface Camera {
  x: number;
  y: number;
  /** Extra zoom on top of the fit-to-width framing. */
  zoom: number;
  follow: boolean;
}

export const createCamera = (): Camera => ({ x: 0, y: 0, zoom: 1, follow: true });

/** Contract 2 (docs/PLAN.md). */
export interface Renderer {
  init(manifest: Manifest, skin: Skin, mount: HTMLElement): void;
  sync(state: State, alpha: number, cam: Camera): void;
  onEvent(e: SimEvent): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

export interface RenderStats {
  /** Draw calls in the last frame (WebGL info when available, else the scene estimate). */
  drawCalls: number;
  triangles: number;
  fps: number;
  /** Scene-side estimate of visible draw calls and triangles (no shadow pass). */
  estDrawCalls: number;
  estTriangles: number;
  quality: string;
}
