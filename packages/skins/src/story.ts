// The story director's data format (docs/STORY-LEVELS-V2-PLAN.md, "A: Director"). A skin's `story`
// block holds this, keyed by level id; a level without an entry plays exactly as if the director
// did not exist. Pure presentation: nothing here can reach sim state.

/** A world position (world units), or a manifest entity's position by id. */
export type StoryPlace = { at: readonly [number, number] } | { entity: string };

/** What fires a cue. Each cue fires once unless it sets `repeat`. */
export type StoryTrigger =
  /** Play has begun (after any film). */
  | { start: true }
  /** A sim event by its `t`; `match` compares the event's own fields, e.g. { role: "role.hauler" }. */
  | { event: string; match?: Readonly<Record<string, string | number | boolean>> }
  /** An objective, by manifest objective id, became done or failed in the sim (even before its turn). */
  | { goal: string; is: "done" | "failed" }
  /** The player came within `r` world units. */
  | { near: StoryPlace; r: number }
  /** `ticks` sim ticks after the cue `after` fired (from tick 0 without it). Sim time, so freezes don't count. */
  | { after?: string; ticks: number };

/** A camera beat: pan to a place, hold, hand back to the follow camera. */
export interface StoryCameraBeat {
  to: StoryPlace;
  /** Seconds to pan there. Default 0.8. */
  pan?: number;
  /** Seconds to hold. Default 1. */
  hold?: number;
  /** Seconds to hand back. Default 0.8. */
  back?: number;
  /** Fraction of the way to the place, 0..1, for a nudge. Default 1. */
  share?: number;
  /** Camera zoom during the beat. Default: unchanged. */
  zoom?: number;
  /** Pause the sim during the beat. Default true; false for a nudge during play. */
  freeze?: boolean;
}

/** The HUD parts a level can hide. Goals have their own display and are not listed. */
export type StoryHudPart = "credits" | "fuel" | "walls" | "name" | "retry" | "settings" | "help";

export interface StoryGhost {
  id: string;
  at: StoryPlace;
  /** Canonical id of what would be built there. */
  build?: string;
  price: number;
}

/**
 * What a cue does. A level's actions run one after another from a single queue. Actions marked "beat"
 * are dropped on replays (DECISIONS #14); lines stay, without pausing play.
 */
export type StoryAction =
  /** One line in the dialogue strip. Times itself, or with `tap` pauses play until a tap (first play only). */
  | { line: string; who?: string; tap?: boolean; seconds?: number }
  /** Crew introduction: name, tag ("hauler") and line; play pauses until a tap (first play only). */
  | { crew: string; who: string; tag?: string }
  /** Beat: a camera move. */
  | { camera: StoryCameraBeat }
  /** Beat: pause or resume the sim. Released automatically when the queue runs dry, so play cannot stick. */
  | { freeze: boolean }
  /** Beat: wait for a tap, paused. */
  | { tap: true }
  /** Change the world lighting to a named preset over `seconds`. The renderer reads it from director.world. */
  | { light: string; seconds?: number }
  /** Beat: a film or live scene by id, paused until it ends. An unknown id is skipped. */
  | { film: string }
  /** Show a goal whose StoryGoal has `hold`. */
  | { goal: string }
  | { hide: readonly StoryHudPart[] }
  | { show: readonly StoryHudPart[] }
  /** Beat: text card over black; a tap ends it early. */
  | { card: string; sub?: string; seconds?: number }
  /** Beat: large day card over black ("DAY 4,023"); a tap ends it early. */
  | { day: string; sub?: string; seconds?: number }
  /** Show a build ghost with its price. The renderer reads it from director.world. */
  | { ghost: StoryGhost }
  | { ghostOff: string }
  /** The large Try again prompt, with optional different wording. */
  | { tryAgain: true; text?: string };

export interface StoryCue {
  /** Needed only when another cue's `after` names it. */
  id?: string;
  on: StoryTrigger;
  do: readonly StoryAction[];
  repeat?: boolean;
}

/** One star slot, in display order. Goals show one at a time; one met early completes on its turn. */
export interface StoryGoal {
  /** The manifest objective id. */
  id: string;
  /** Missing it raises the large Try again prompt at once (L1 Fill the reactor, L2 Bring everyone home). */
  tryAgain?: boolean;
  /** Wait for a `{ goal: id }` action before appearing. The slot still shows. */
  hold?: boolean;
}

export interface StoryLevel {
  goals: readonly StoryGoal[];
  cues: readonly StoryCue[];
  /** HUD parts hidden from the first frame. */
  hide?: readonly StoryHudPart[];
  /** Keep the usual goal cards and overview before play. Default false: straight into play after any film. */
  intro?: boolean;
  /** No frost, buzz or heartbeat for a cold core until it is first lit (the walk to a dormant reactor). */
  calmUntilLit?: boolean;
}

export interface StorySpeaker {
  name: string;
  /** Portrait key; the dialogue style draws it. Omit for crew: faces are never assumed, only names. */
  portrait?: string;
}

/** Wording the director's own UI needs. */
export interface StoryUi {
  missed: string;
  tryAgain: string;
  keepPlaying: string;
  seeResults: string;
  tapToContinue: string;
}

export interface SkinStory {
  ui: StoryUi;
  /** By speaker key, used by `who`. An unknown key shows as written. */
  speakers: Readonly<Record<string, StorySpeaker>>;
  /** Dialogue style name (client/src/story/view.ts). Default "strip". */
  dialogue?: string;
  levels: Readonly<Record<string, StoryLevel>>;
}
