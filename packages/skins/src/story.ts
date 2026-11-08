// The story director's data format (docs/STORY-LEVELS-V2-PLAN.md, "A: Director"). A skin's `story`
// block holds this, keyed by level id; a level without an entry plays exactly as if the director
// did not exist. Pure presentation: nothing here can reach sim state.

/** A world position (world units), a manifest entity's position by id, or where the last sim event of a type happened. */
export type StoryPlace = { at: readonly [number, number] } | { entity: string } | { last: string };

/** What fires a cue. Each cue fires once unless it sets `repeat`. */
export type StoryTrigger =
  /** Play has begun (after any film). */
  | { start: true }
  /** A sim event by its `t`; `match` compares the event's own fields, e.g. { role: "role.hauler" }; `count`: on the n-th such event. */
  | { event: string; match?: Readonly<Record<string, string | number | boolean>>; count?: number }
  /** An objective, by manifest objective id, became done or failed in the sim (even before its turn). */
  | { goal: string; is: "done" | "failed" }
  /** The player came within `r` world units (once the cue `after` has fired, when given). */
  | { near: StoryPlace; r: number; after?: string }
  /** `ticks` sim ticks after the cue `after` fired (from tick 0 without it). Sim time, so freezes don't count. */
  | { after?: string; ticks: number }
  /**
   * A hostile of type `hostile` came within `r` world units of `at` (the player without it); `fleeing` looks at the
   * ones breaking off (bossRetreat) instead of the ones fighting. Fires once the cue `after` has fired, when given.
   */
  | { hostile: string; r: number; at?: StoryPlace; fleeing?: boolean; after?: string }
  /** Cast member `who` (the level's `cast`) came within `r` world units of `at`. Fires once the cue `after` has fired, when given. */
  | { who: string; r: number; at: StoryPlace; after?: string };

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
  /** `head`: a status row above the text, for a terminal readout (a boot header); off by default. */
  | { line: string; who?: string; tap?: boolean; seconds?: number; head?: string }
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
  /** A live scene in a small frame over play; the queue carries on beside it (lines keep coming). */
  | { inset: string }
  /** Beat: wait this many seconds (play carries on), e.g. for an inset to reach its moment. */
  | { wait: number }
  /** Show a goal whose StoryGoal has `hold`. */
  | { goal: string }
  | { hide: readonly StoryHudPart[] }
  | { show: readonly StoryHudPart[] }
  /** Beat: text card over black; a tap ends it early. `image`: a skin image shown above the text (a close-up). */
  | { card: string; sub?: string; seconds?: number; image?: string }
  /** Beat: large day card over black ("DAY 4,023"); a tap ends it early. */
  | { day: string; sub?: string; seconds?: number }
  /** Show a build ghost with its price. The renderer reads it from director.world. */
  | { ghost: StoryGhost }
  | { ghostOff: string }
  /** The large Try again prompt, with optional different wording. */
  | { tryAgain: true; text?: string }
  /** Small pulsing lights on the ground, replacing any before; `period` seconds a beat. */
  | { dots: readonly StoryPlace[]; period?: number }
  | { dotsOff: true }
  /** Slow pulses from one fixed screen side, for as long as the level runs; `k` their strength, 0..1. */
  | { ridge: "left" | "right" | "top" | "bottom"; period?: number; k?: number }
  /** That many quick flashes from the ridge's side, on top of its slow pulse. */
  | { ridgeFlash: number }
  /** The reactor spirit: bloom out of the flare, glitch red, or an explicit state. */
  | { spirit: "bloom" | "pulse" | "idle" | "fading" | "off" }
  /**
   * The cloud drifts to the player and floats beside them, at a fixed offset in screen directions (ground
   * units: `right` toward the screen's right, `up` toward its top) with a soft lag, its ground patch with it.
   * `delay` seconds first, so the bloom stays above the reactor. `false` sends it home.
   */
  | { spiritFollow: { right: number; up: number; lag?: number; delay?: number; height?: number; size?: number; glow?: number } | false }
  /**
   * A glow on the screen edge toward a place off screen; it fades as the place comes into view. Null removes it.
   * `size` is the disc across in vmin (default 36), `strength` its peak opacity, 0..1 (default 0.4).
   * `arrow`: an edge pointer in the glow pointing at the place, gone with the glow (off by default).
   */
  | { edgeGlow: (StoryPlace & { size?: number; strength?: number; arrow?: boolean }) | null }
  /**
   * Turn the guide arrows on or off (see StoryLevel.noGuide). `to`: the arrows lead straight to this place instead of
   * the guide's own pick, with no coach marks, until the next guide action (off by default).
   */
  | { guide: boolean; to?: StoryPlace }
  /**
   * A cast member walks to a place and holds there, drawn only (the sim keeps its own position); `walk: false`
   * walks them back to where the sim has them. Keys are StoryLevel.cast keys.
   */
  | { walk: string; to: StoryPlace | false };

export interface StoryCue {
  /** Needed only when another cue's `after` names it. */
  id?: string;
  on: StoryTrigger;
  do: readonly StoryAction[];
  repeat?: boolean;
  /**
   * Run every action in line order, world changes included (light, spirit, ridge, dots...), so a dim or a flash
   * can land on a given line. Default: world changes apply the moment the cue fires.
   */
  ordered?: boolean;
  /** Belongs to the walk from the level's start: skipped when an in-level retry starts at `retryFrom` instead. */
  walk?: boolean;
}

/** One star slot, in display order. Goals show one at a time; one met early completes on its turn. */
export interface StoryGoal {
  /** The manifest objective id. */
  id: string;
  /** Missing it raises the large Try again prompt at once (L1 Fill the reactor, L2 Bring everyone home). */
  tryAgain?: boolean;
  /** Wait for a `{ goal: id }` action before appearing. The slot still shows. */
  hold?: boolean;
  /** The goal's wording here and on the result screen, instead of the skin's generic one. `{left}` is the time left on a timed goal. */
  label?: string;
  /**
   * A story step, not a manifest objective: it shows like a goal (card and top line) but has no star slot, and it is
   * done when this trigger fires (an event, a goal, or the player coming near). `id` is then the step's own name.
   */
  until?: StoryTrigger;
}

/**
 * Who a cast key is on the map, for speech bubbles and walks: the hero, the crewmate out of a capture (manifest
 * capture order), the n-th starting resident (manifest `people` order), the boss, or a fixed place.
 */
/** `customer`: the n-th trader to arrive (0 = the first), while at or walking to and from the kiosk. */
export type StoryCastRef = { player: true } | { capture: number } | { person: number } | { boss: true } | { customer: number } | StoryPlace;

export interface StoryLevel {
  goals: readonly StoryGoal[];
  /** Speaker key to where they stand. `commander` is the hero unless set. */
  cast?: Readonly<Record<string, StoryCastRef>>;
  /**
   * Each goal opens with its card mid-screen, paused until a tap, then the card flies to its slot at the top.
   * The card waits its turn behind any lines already queued.
   */
  goalCards?: boolean;
  cues: readonly StoryCue[];
  /** HUD parts hidden from the first frame. */
  hide?: readonly StoryHudPart[];
  /** Keep the usual goal cards and overview before play. Default false: straight into play after any film. */
  intro?: boolean;
  /** No frost, buzz or heartbeat for a cold core until it is first lit (the walk to a dormant reactor). */
  calmUntilLit?: boolean;
  /** The guide arrows stay off until a `{ guide: true }` action: the light in the world leads first. */
  noGuide?: boolean;
  /** Where the Try again prompt restarts the player (world units). The result screen's retry walks again from the start. */
  retryFrom?: readonly [number, number];
  /** Canonical ids the renderer never fades when the hero stands among them (a reactor that must stay solid). */
  solid?: readonly string[];
  /**
   * Start the camera zoomed out to match a film's last frame, easing to the play zoom: `from` is the camera
   * zoom (below 1 is out), `seconds` the ease, run when the player first moves or after `hold` seconds.
   * `film` instead gives the film's last frame in world units (width, height at the look point): the video
   * covers the screen, so the zoom fits whatever part of that frame this screen shows. `hero` draws the hero
   * at that fraction of its size until then (the film's commander is smaller), growing back with the ease.
   */
  openZoom?: { from?: number; film?: readonly [number, number]; hero?: number; seconds: number; hold?: number };
  /**
   * Every pod on the map glows with a beam, dimming as its freeze timer runs down (cold white for crew,
   * orange for a decoy), so in dim light the pods are the brightest thing around (story level 2). "glow": the
   * pods glow themselves, with no beam over them.
   */
  podLights?: boolean | "glow";
  /** Three slots over the hero's head fill with the pods in tow, so the tow limit shows (story level 2). */
  tally?: boolean;
  /** Customers drawn with their own character model: customer id (spawn order) to model id (story level 3: Sela). */
  customerModels?: Readonly<Record<number, string>>;
  /** Hostiles drawn with another character model once they break off (bossRetreat): kind to model id (story level 5:
   *  the warlord runs off as Vale, helmet off). The run eases in from three-quarter pace over its first second. */
  fleeingModels?: Readonly<Record<string, string>>;
  /** A capture a boss carried shows where it was dropped before its `hiddenUntil` reveals it (story level 5: Vale's
   *  helmet lies at the fall spot); it can be towed only once revealed. */
  showDropped?: boolean;
}

export interface StorySpeaker {
  name: string;
  /** Portrait key; the dialogue style draws it. Omit for crew: faces are never assumed, only names. */
  portrait?: string;
  /** Dialogue style for this speaker's lines (client/src/story/view.ts). Default: the skin's `dialogue`. */
  dialogue?: string;
  /** Speaks through the reactor spirit: the cloud brightens while this speaker's line is on screen, and the portrait is the live cloud. */
  spirit?: boolean;
  /** A bust image (public path) beside the line. */
  bust?: string;
  /** The line's job tag after the name ("hauler"). */
  tag?: string;
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
  /** Lighting presets for `{ light }` actions: 0 full night to 1 sunrise. */
  lights?: Readonly<Record<string, number>>;
  levels: Readonly<Record<string, StoryLevel>>;
  /** Live scenes' words and images by scene id (render-3d scene/livescene.ts reads them by key). */
  scenes?: Readonly<Record<string, { text: Readonly<Record<string, string>>; images: Readonly<Record<string, string>> }>>;
}
