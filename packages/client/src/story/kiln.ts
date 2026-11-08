import { viewWidth } from "@fo/content";
import type { StoryPresentation } from "@fo/render-3d";

// KILN's cloud beside the commander is placed and sized in world units (StoryAction spiritFollow), so on a family
// with a wider view (look.json viewW: defend 300 against 170) it shrank on screen. S40 (Doug, 2026-11-07): it keeps
// one size on screen in every level, the one it has on level 5's defend view, so its size and its ground offset
// (right, up) scale with the ground width on screen, camera zoom included. Its height stays at the hero's head.
// Levels 1-4 come out at about 57% of the old size, about 1 m from the commander's head (before the #86 pull-in below).

type Follow = { right: number; up: number; lag: number; height: number; size: number; glow?: number };

/** The ground width at which a cue's spiritFollow numbers are taken as given: level 5's defend view. */
const KILN_VIEW_W = viewWidth("defend");

/** The story levels' own view width (look.json default): where the pull-in is fully applied. */
const STORY_VIEW_W = viewWidth("harvest");
/** Ground offset kept at the tight views (30% closer), and the exponent of the size follow-up (1 would be pure ground width). */
const NEAR_K = 0.7;
const SIZE_EXP = 0.7;

/** Where KILN floats beside the hero while it coaches a regular level: the story levels' own spiritFollow. */
const KILN_BESIDE: Follow = { right: 60, up: 16, lag: 0.9, height: 80, size: 1.1, glow: 0.6 };

/** A cue's follow, scaled to the ground width on screen now (`groundW`: the family's view width over the zoom). */
export function kilnOnScreen(f: Follow, groundW: number): Follow {
  const k = groundW > 0 ? groundW / KILN_VIEW_W : 1;
  // Closer views (levels 1-4, regular levels) pull KILN in and fatten it (Doug, 2026-11-08, #86): on screen its quad was
  // already level 5's size (about 320 px against 313), but over a daylit floor the additive glow reads about 30% smaller,
  // so the size follows k^0.7 and the ground offset eases to 70% as the view tightens to the story's own 170 wide.
  const tight = k >= 1 ? 0 : Math.min(1, (1 - k) / (1 - STORY_VIEW_W / KILN_VIEW_W));
  const near = 1 - (1 - NEAR_K) * tight;
  return { ...f, right: f.right * k * near, up: f.up * k * near, size: f.size * Math.pow(k, SIZE_EXP) };
}

/**
 * KILN's cloud beside the commander while its coaching lines show on a regular level (#13), at the story's
 * on-screen size: it blooms over the reactor, drifts to the hero's side, speaks, and fades when the lines end.
 */
export class KilnCloud {
  constructor(private readonly present: StoryPresentation, private readonly groundW: () => number, private readonly strength: () => number) {
    present.spirit.bloom();
  }

  frame(): void {
    const sp = this.present.spirit;
    sp.setStrength(this.strength());
    sp.follow(kilnOnScreen(KILN_BESIDE, this.groundW()));
    sp.setState("speaking");
  }

  done(): void { this.present.spirit.setState("fading"); }
}
