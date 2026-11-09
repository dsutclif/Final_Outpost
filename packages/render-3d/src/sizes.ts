/**
 * The one place real sizes live, in metres (docs/SCALE.md, Doug 2026-11-04/05). Sandbox views, live scenes and
 * tools/relayout.ts read these; the level files carry numbers generated from them. Where views disagree, what the
 * playable game draws is right.
 */
export const SIZES = {
  /** Crew, traders, Sela. */
  person: 1.8,
  /** Commander and ranger: x1.1 on purpose. */
  commander: 1.8 * 1.1,
  /** Halcyon wreck length. */
  wreck: 27,
  /** Decor stasis pod (crash site and films). Playable towable pods keep their own size. */
  pod: {
    length: 2.66,
    /** The pod model's own length and the height of its cavity floor above the cradle's base, in build metres. */
    buildLength: 3.9847,
    buildCavity: 1.809,
    /** Base below the sand. */
    buried: 0.3,
  },
  /** Sela's buggy. */
  buggy: { length: 2.64, buildLength: 4.4 },
} as const;

/** Scale of the decor pod's build to its real size. */
export const POD_K = SIZES.pod.length / SIZES.pod.buildLength;
/** The pod's cavity floor above the sand, metres (the base is `buried` below it). */
export const POD_CAVITY_M = SIZES.pod.buildCavity * POD_K - SIZES.pod.buried;
