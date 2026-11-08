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
  /**
   * Optional world point (world units) the camera leans toward while following, e.g. the
   * nearest pad, so targets near the map edge come fully on screen. Null or absent: none.
   */
  lead?: { x: number; y: number } | null;
  /** The hero drawn this many times its size (a film hand-off's opening, where the film's commander is smaller). */
  heroK?: number;
}

export const createCamera = (): Camera => ({ x: 0, y: 0, zoom: 1, follow: true, lead: null });

/** How far toward `cam.lead` the follow target moves (0 = hero only, 1 = the lead point). */
export const LEAD_WEIGHT = 0.35;

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

/** A coach mark: target in world units and the line to show (same shape as render-2d's). */
export interface CoachMark { key: string; at: { x: number; y: number }; text: string }

/**
 * What an urgent alert is about (backlog R5 #16): the renderer floats a danger marker over it, beside
 * the top-of-screen icon. Named, not placed, so the marker follows a moving colonist or customer.
 */
export type AlertMark =
  | { kind: "core" }
  | { kind: "gate"; barrier: string; section: number }
  | { kind: "converter"; id: string }
  | { kind: "resident"; id: number }
  | { kind: "customer"; id: number };

/** A guide mark: where the player's next step is (world units), the one line that says what to do, and the walk there (corner points, ending at the step's final spot). */
export interface GuideMark { key: string; at: { x: number; y: number }; text: string; path?: { x: number; y: number }[] | undefined }

// ---------------------------------------------------------------- story presentation

export type RidgeSide = "left" | "right" | "top" | "bottom";
export type TallySlots = readonly ["empty" | "done" | "missed", "empty" | "done" | "missed", "empty" | "done" | "missed"];

/** A camera beat: the view eases to `at` (world units) at `zoom` for `seconds` of renderer time, then returns to the hero. */
export interface CameraBeat { at: { x: number; y: number }; zoom?: number; seconds: number }

/** A story vehicle's drive (see StoryPresentation.vehicle): a ground path in world units, eased over `seconds`, then parked. */
export interface StoryVehicleSpec { seq: number; path: readonly { x: number; z: number }[]; seconds: number; lights?: boolean | undefined }

/**
 * The game's ground and light right now, as plain data (the renderer's liveLook()), so a live scene can stand on the
 * same sand under the same light and cut back to play without a jump.
 */
export interface LiveLook {
  /** Sand colours as the game draws them (base, alt, dark; model brightness applied) and the level seed for the noise. */
  sand: readonly [string, string, string];
  seed: number;
  /** Pebble tones (instance colours), the stone colour they multiply, and whether pebbles draw as smooth stones. */
  pebbles: readonly [string, string, string];
  pebbleBase: string;
  smooth: boolean;
  /** Ambient (hemisphere) and key light right now; the key light shines from the game's SUN_OFS direction. */
  hemi: { sky: string; ground: string; intensity: number };
  sun: { color: string; intensity: number };
  /** Fog and background colour right now. */
  fog: string;
  /** Tone-mapping exposure the game draws with. */
  exposure: number;
}

/** A hostile's fall filmed in the level (story `fall`): which kind, and the closer, lower camera (zoom x, pitch degrees). */
export interface FallScene { kind: string; zoom?: number; pitch?: number }

/**
 * What the story director drives (client/src/story). All positions are world units (x, z on the
 * ground; y up). Nothing here touches the sim. At most two things pulse at once, by rank: goal
 * light, pods, lamps, ground dots, spirit cloud; the ridge always shows.
 */
export interface StoryPresentation {
  /** Blue ground dots running toward the next step; null clears them. */
  dots(pts: readonly { x: number; z: number }[] | null, opts?: { period?: number; lit?: boolean; together?: boolean }): void;
  /** A pod's glow and beam; `dim` 1 full, 0 out, below 0 removes it. */
  pod(id: string, x: number, z: number, kind: "old" | "crew", dim: number, beam?: boolean): void;
  /** A point light: a warm lamp/window, or a one-shot goal light (own colour). */
  light(id: string, x: number, y: number, z: number, kind: "lamp" | "goal", intensity: number, goalColor?: string): void;
  lightLevel(id: string, k: number): void;
  flashLight(id: string, len?: number): void;
  removeLight(id: string): void;
  /** Three star slots over a spot; null hides them. */
  /** `scale` sizes the slots (default 1). */
  tally(x: number, y: number, z: number, slots: TallySlots | null, scale?: number): void;
  /** Red ridge pulse from one fixed screen side; null side or k 0 hides it. */
  ridge(side: RidgeSide | null, k?: number): void;
  /** Slow pulses from that side, one per `period` seconds, in step with ground dots of the same period. */
  ridgeSlow(side: RidgeSide | null, period: number, k: number): void;
  /** The ridge pulse this frame, for a screen overlay: the side it comes from and its strength, 0..1. */
  readonly ridgeGlow: { side: RidgeSide; k: number } | null;
  /** `n` quick flashes from the ridge's side, over any slow pulse. */
  ridgeFlash(n: number): void;
  /** Build ghosts with their price; replaces any shown before. */
  ghosts(list: readonly { id: string; x: number; z: number; build?: string | undefined; price: number }[]): void;
  /** Night-to-sunrise, 0..1 (eased toward; `snap` jumps); null turns story lighting off. */
  lighting(progress: number | null, snap?: boolean): void;
  /** The reactor spirit: starts off. */
  spirit: {
    setState(s: "idle" | "speaking" | "pulse" | "fading" | "off"): void;
    /** 0..1 reactor strength. */
    setStrength(k: number): void;
    bloom(): void;
    /** Float beside the hero at a screen-aligned ground offset with a soft lag (ground units); null goes home to the reactor. */
    follow(f: { right: number; up: number; lag: number; height: number; size: number; glow?: number } | null): void;
  };
  /** Walk a mover (interp key: "player", "r:<id>", "h:<id>") to a ground spot and hold it there, drawn only; null walks it back. */
  actor(key: string, to: { x: number; z: number } | null): void;
  /** Where a mover is drawn now (ground units), or null for a key with nothing drawn. */
  actorAt(key: string): { x: number; z: number } | null;
  /** Draw customer `id` with another character model (a named trader, e.g. Sela); loads it on first use. */
  customerModel(id: number, model: string): void;
  /** Draw hostiles of `kind` that broke off (bossRetreat) with another character model; loads it on first use. */
  fleeingModel(kind: string, model: string): void;
  /** Sela's buggy: drive vehicle `id` along a path and park it at the end, lights on; null removes it. Loads its models on first use. */
  vehicle?(id: string, spec: StoryVehicleSpec | null): void;
  /** Show a capture a boss dropped where it lies, before its hiddenUntil reveals it. */
  showDropped(on: boolean): void;
  /** Entity ids the renderer keeps solid (never faded) when the hero stands among them. */
  solid(ids: readonly string[]): void;
  /** Ask the camera to look elsewhere for a while; null cancels. */
  beat(b: (Omit<CameraBeat, "seconds"> & { seconds?: number }) | null): void;
  /** True while a camera beat is running. */
  readonly beating: boolean;
  /** Film the fall of the hostile of `kind` that just broke off, in the level; false at once when it cannot be staged. */
  fall(o: FallScene): Promise<boolean>;
}
