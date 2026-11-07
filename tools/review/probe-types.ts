// The data shapes shared by the in-page probes (packages/client/src/dev/review.ts, `window.R`) and the
// probe runner (tools/review/probe.ts). No imports: both sides include this file as it is.
// All boxes are in viewport CSS px (x right, y down) unless a field says otherwise.

export interface Box { x0: number; y0: number; x1: number; y1: number }

/** One visible element of the game's own DOM (HUD, labels, captions, buttons). */
export interface DomItem {
  /** Index in the list of the nearest ancestor that is also an item, or -1: a button's own label is not "overlapping" the button. */
  parent: number;
  /** Stable selector: `#id`, or `tag.class` under its nearest identified parent. No text, no numbers that change. */
  sel: string;
  /** What it says (first 60 characters), or its aria-label for an icon. */
  text: string;
  box: Box;
  region: "hud" | "story" | "overlay" | "toast" | "world" | "other";
  /** A button, link, input or anything else a thumb can press. */
  tap: boolean;
  fontPx: number;
  color: string;
  /** The nearest opaque background behind it in the DOM; null when it sits straight over the 3D world. */
  bg: string | null;
  /** Text with an outline or shadow (readable over the world without a plate). */
  outlined: boolean;
  opacity: number;
}

/** A thing drawn in the world: a model or a character. */
export interface ThingSample {
  key: string;
  /** Canonical id (`sink.core`, `node.fuel_deposit`, `unit.player`). */
  id: string;
  kind: "building" | "node" | "decor" | "character" | "other";
  box: Box;
  /** Distance from the camera: smaller is nearer. */
  depth: number;
  head: { x: number; y: number } | null;
  /** A character's feet, projected; null for things that are not characters. */
  feet: { x: number; y: number } | null;
  /** World height of its lowest point and of the base the renderer's rules intend (units; 1 m = 28 u). */
  baseY: number;
  ruleY: number;
  /** World height of its top, in units. */
  topY: number;
  /** Ground footprint in world units: x0..x1 east, z0..z1 south. */
  foot: { x0: number; z0: number; x1: number; z1: number };
  /** Seconds since it appeared (a model pops in over 0.45 s). */
  age: number;
}

export interface LabelSample {
  /** What the label is: its cache key (`lock|Locked`, `ord|...`). */
  key: string;
  box: Box;
  depth: number;
  /** Where the label hangs in the world (x, z on the ground; y up). */
  world: { x: number; y: number; z: number };
}

export interface CaptionSample {
  sel: string;
  /** `bubble` hangs over the speaker's head; `strip` and `terminal` are fixed panels. */
  style: "bubble" | "strip" | "terminal" | "other";
  box: Box;
  text: string;
  /** Cast key of the speaker, and where they are on screen. */
  speaker: string | null;
  speakerBox: Box | null;
  head: { x: number; y: number } | null;
}

export interface Sample {
  /** Milliseconds since the level opened. */
  t: number;
  tick: number;
  levelId: string;
  screen: string;
  viewport: { w: number; h: number };
  /** Safe-area insets in px (a notch's reserve); zero when the device has none. */
  safe: { top: number; right: number; bottom: number; left: number };
  /** The camera on the ground (x, z) and its horizontal forward direction, to tell what stands nearer to it. */
  cam: { x: number; z: number; fx: number; fz: number };
  dom: DomItem[];
  things: ThingSample[];
  labels: LabelSample[];
  caption: CaptionSample | null;
  /** Story night-to-day progress, or null. */
  lighting: number | null;
}

/** One frame of the frame-time log. */
export interface FrameRec {
  /** performance.now() at the frame. */
  t: number;
  /** Milliseconds since the previous frame (wall clock: meaningless while a run steps the sim by hand). */
  dt: number;
  /** Milliseconds of JavaScript for this frame: the slowest single sim tick since the last draw plus the draw itself. The GPU's share is not in it. */
  cpu: number;
  /** The slowest single sim tick since the last draw, in ms (part of `cpu`). */
  step: number;
  tick: number;
  /** The sim events (types) that came since the previous frame, oldest first (at most 8). */
  ev: string[];
  /** The last sim event type seen before this frame (may be older than the previous frame). */
  last: string;
}

/** Who and what is where, for comparing the end of a film with the start of its level. */
export interface StorySnapshot {
  levelId: string;
  tick: number;
  player: { x: number; y: number; carry: string[]; hp: number; tow: number };
  residents: { id: number; role: string; status: string; x: number; y: number; carry: string | null }[];
  traders: { id: number; kind: string; x: number; y: number }[];
  captures: { id: number; type: string; state: string; x: number; y: number }[];
  hostiles: number;
  built: string[];
  core: { fuel: number; level: number; lit: boolean };
  /** Story light: night-to-day progress, or null. */
  lighting: number | null;
  /** Names the director's cast has, and who is speaking. */
  cast: string[];
}

/** What a live scene (a film staged in three.js) holds at its end. */
export interface FilmEnd {
  film: string;
  /** Named objects and lights in the staged scene. */
  objects: { name: string; x: number; y: number; z: number }[];
  lights: { kind: string; intensity: number; color: string }[];
  /** A picture of the last frame, as a PNG data URL; empty when the canvas could not be read. */
  png: string;
}

/** What `window.R` offers the probe runner (packages/client/src/dev/review.ts implements it). */
export interface ReviewApi {
  version: number;
  /** Open a level (like the level list does, without the intro) and start the logs afresh. */
  play(id: string): Promise<boolean>;
  /** Everything measurable right now. */
  snap(): Sample | null;
  /** Let a bot (a profile of @fo/bots: good, average, human ...) play the running level in real time; null stops it. */
  drive(profile: string | null, seed?: number): boolean;
  /** Step the driving bot `ticks` sim ticks at once (no frames between), draw once and report; for runs where the GPU is slow. */
  stepBot(ticks: number): { tick: number; over: boolean; won: boolean | null; reason: string | null } | null;
  /** Runs the game's frame function on a made-up 30 fps clock without drawing, until `seconds` have passed or the story shows a line after the `seenSeq`th. */
  ff(seconds: number, seenSeq: number): { tick: number; seq: number; over: boolean };
  /** Draws `frames` frames on the made-up clock, so a caption settles over its speaker. */
  settle(frames: number): void;
  /** Frame-time log entries from index `from`. */
  frames(from?: number): { total: number; frames: FrameRec[] };
  errors(): string[];
  /** Who and what is where in the running level, for film-to-level continuity. */
  state(): StorySnapshot | null;
  /** Play a live scene held at its last second and report what it staged; null for a film that is a video. */
  filmEnd(film: string): Promise<FilmEnd | null>;
  /** Hold or release the whole page's visibility, as a phone does when the app goes to the background. */
  visibility(visible: boolean): void;
  /** Milliseconds since the level opened. */
  levelMs(): number;
  /** The skin's palette (colour by meaning), for the colour-blind pass. */
  palette(): Record<string, unknown>;
  /** Film and live-scene ids a story level plays: its registered level-start film plus the films its cues call. */
  films(levelId: string): string[];
}
