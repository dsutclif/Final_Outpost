import { viewWidth } from "@fo/content";
import type { StoryPresentation } from "@fo/render-3d";

// KILN's cloud beside the commander is placed and sized in world units (StoryAction spiritFollow), so on a family
// with a wider view (look.json viewW: defend 300 against 170) it shrank on screen. S40 (Doug, 2026-11-07): it keeps
// one size on screen in every level, the one it has on level 5's defend view, so its size and its ground offset
// (right, up) scale with the ground width on screen, camera zoom included. Its height stays at the hero's head.
// Levels 1-4 come out at about 57% of the old size, about 1 m from the commander's head.

type Follow = { right: number; up: number; lag: number; height: number; size: number; glow?: number };

/** The ground width at which a cue's spiritFollow numbers are taken as given: level 5's defend view. */
const KILN_VIEW_W = viewWidth("defend");

/** Where KILN floats beside the hero while it coaches a regular level: the story levels' own spiritFollow. */
const KILN_BESIDE: Follow = { right: 60, up: 16, lag: 0.9, height: 80, size: 1.1, glow: 0.6 };

/** A cue's follow, scaled to the ground width on screen now (`groundW`: the family's view width over the zoom). */
export function kilnOnScreen(f: Follow, groundW: number): Follow {
  const k = groundW > 0 ? groundW / KILN_VIEW_W : 1;
  return { ...f, right: f.right * k, up: f.up * k, size: f.size * k };
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
