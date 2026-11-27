/**
 * Live-scene films a story level plays over its own set (a cue's `fall: { film }`), found in its cues, so the level can
 * load their models at start instead of when the scene first plays (outpost-ops#396).
 */
export function fallFilms(level: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      const film = k === "fall" && x && typeof x === "object" ? (x as { film?: unknown }).film : undefined;
      if (typeof film === "string") out.add(film);
      walk(x);
    }
  };
  walk(level);
  return [...out];
}
