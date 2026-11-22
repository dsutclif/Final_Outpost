// Defend warning trigger (S4, outpost-ops#273; Doug 2026-11-22): the player is warned once the base has taken its first leak
// or sits below half health. One pure rule shared by the client alarm (HUD cue + sound) and the rater's fairFailure (bots).
// Reads meters only; no sim state changes, so no engine bump.
export type DefendWarn = "none" | "leak" | "half";

export function defendWarn(baseHealth: number, baseHealthMax: number): DefendWarn {
  if (baseHealthMax <= 0 || baseHealth >= baseHealthMax) return "none";
  return baseHealth * 2 < baseHealthMax ? "half" : "leak";
}
