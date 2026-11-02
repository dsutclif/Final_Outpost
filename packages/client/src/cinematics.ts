import crashOpenPoster from "./cinematics/crash_open.poster.png";
import crashOpenVideo from "./cinematics/crash_open.mp4";
import helmetRevealPoster from "./cinematics/helmet_reveal.poster.png";
import helmetRevealVideo from "./cinematics/helmet_reveal.mp4";
import titleLoopVideo from "./cinematics/title_loop.mp4";

// Pre-rendered Blender cinematics (tools/cinematics, docs/STORY-LEVELS.md). The files live in
// src/cinematics and are imported as URLs so Vite fingerprints them (assets/<name>-<hash>.mp4):
// a re-rendered file gets a new URL and phones never keep a stale copy. They are deliberately
// outside the service-worker precache (vite.config.ts): iOS Safari cannot play a video the worker
// answers from the cache without range-request support, so they stream from the network and a
// failure just skips ahead.

export type CinematicId = "crash_open" | "helmet_reveal";

/**
 * A film's hand-off into play: `fadeMs` the cross-fade into the level, and `grade` a CSS grade on the
 * video's closing `seconds` (no re-render) so its last frame lands in the level's own light. brightness and
 * saturate are the filter values reached at the very end (1 = untouched).
 */
export interface FilmInfo { video: string; poster: string; fadeMs?: number; grade?: { seconds: number; brightness: number; saturate: number } }

export const CINEMATICS: Record<CinematicId, FilmInfo> = {
  // the film ends warm and bright; level 1 opens in moonlit night, its sand about half as bright
  crash_open: { video: crashOpenVideo, poster: crashOpenPoster, fadeMs: 500, grade: { seconds: 2.5, brightness: 0.5, saturate: 0.88 } },
  helmet_reveal: { video: helmetRevealVideo, poster: helmetRevealPoster },
};

/** Bump a film's version when it is re-rendered: players who saw an older one see it again. */
export const FILM_VERSIONS: Record<CinematicId, number> = { crash_open: 1, helmet_reveal: 1 };

/** Is this id a film we have, not yet seen in its current version? */
export function filmDue(id: string, seen: Readonly<Record<string, number>>): id is CinematicId {
  return id in CINEMATICS && (seen[id] ?? 0) < FILM_VERSIONS[id as CinematicId];
}

/** The landing screen's muted loop (title.ts); the canvas backdrop stays as its fallback. */
export const TITLE_LOOP_VIDEO: string = titleLoopVideo;

/**
 * Client-side registration of cinematics by story level id (DECISIONS #14: never a level check in the
 * sim). `before` plays ahead of the level's first play, `afterWin` after its first win.
 */
// Level 5's helmet_reveal plays from its story cues (skins story-L005), so the lines and Vale's card follow it.
export const STORY_CINEMATICS: Readonly<Record<string, { before?: CinematicId; afterWin?: CinematicId }>> = {
  "story-L001": { before: "crash_open" },
};

/** The cinematic to play at `when` for a level, or null when none is registered or its current version was seen (Progress.cinematics). */
export function cinematicFor(levelId: string, when: "before" | "afterWin", seen: Readonly<Record<string, number>>): CinematicId | null {
  const id = STORY_CINEMATICS[levelId]?.[when];
  return id && filmDue(id, seen) ? id : null;
}

/** ended and skipped count as seen; failed (error, stall, autoplay refused) does not, so it can try again later. */
export type CinematicResult = "ended" | "skipped" | "failed";

export interface PlayOptions {
  /** Label of the Skip button. */
  skipLabel?: string;
  /** No first frame within this long: give up and carry on. */
  startMs?: number;
  /** Playback frozen (buffering) for this long: give up and carry on. */
  stallMs?: number;
  /** Cross-fade out at the end, in ms. */
  fadeMs?: number;
}

/**
 * Full-screen cinematic over `host`. Tap anywhere (or the Skip button) skips. The poster shows while
 * loading; an error or stall resolves "failed" at once. On ended/skipped the overlay fades out over
 * fadeMs (0.3 s) while the promise resolves, so the next screen is mounted under the fade.
 */
export function playCinematic(host: HTMLElement, id: CinematicId, opts: PlayOptions = {}): Promise<CinematicResult> {
  const doc = host.ownerDocument;
  const c = CINEMATICS[id];
  const { skipLabel = "Skip", startMs = 5000, stallMs = 3500, fadeMs = c.fadeMs ?? 300 } = opts;
  const wrap = doc.createElement("div");
  wrap.className = "cine";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Cinematic");
  const v = doc.createElement("video");
  v.className = "cine-video";
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.preload = "auto";
  v.poster = c.poster;
  v.src = c.video;
  const skip = doc.createElement("button");
  skip.className = "cine-skip";
  skip.type = "button";
  skip.textContent = skipLabel;
  wrap.append(v, skip);
  host.append(wrap);

  return new Promise<CinematicResult>((resolve) => {
    let done = false;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = (): void => { wrap.remove(); v.removeAttribute("src"); v.load(); };
    const finish = (r: CinematicResult): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      v.pause();
      if (r === "failed") { release(); resolve(r); return; }
      wrap.style.transition = `opacity ${fadeMs}ms linear`;
      wrap.style.pointerEvents = "none";
      void wrap.offsetWidth;
      wrap.style.opacity = "0";
      resolve(r);
      setTimeout(release, fadeMs + 50);
    };
    const arm = (ms: number): void => { clearTimeout(timer); timer = setTimeout(() => finish("failed"), ms); };
    // the closing grade: ease the picture toward the level's light over the last seconds
    const g = c.grade;
    const grade = (): void => {
      if (done || !g) return;
      const left = (v.duration || Infinity) - v.currentTime;
      const k = Math.max(0, Math.min(1, 1 - left / g.seconds));
      const e = k * k * (3 - 2 * k);
      v.style.filter = e > 0 ? `brightness(${(1 - (1 - g.brightness) * e).toFixed(3)}) saturate(${(1 - (1 - g.saturate) * e).toFixed(3)})` : "";
      raf = requestAnimationFrame(grade);
    };
    if (g) v.addEventListener("playing", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(grade); }, { once: true });
    wrap.addEventListener("click", () => finish("skipped"));
    v.addEventListener("ended", () => finish("ended"));
    v.addEventListener("error", () => finish("failed"));
    v.addEventListener("playing", () => arm(stallMs));
    v.addEventListener("timeupdate", () => { if (!v.paused && !v.ended) arm(stallMs); });
    v.addEventListener("waiting", () => arm(stallMs));
    arm(startMs);
    const p = v.play();
    if (p) p.catch(() => finish("failed"));
  });
}
