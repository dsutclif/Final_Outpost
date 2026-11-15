/**
 * Runs `fn` once, at the first of `open()` or `ms` after creation. The home screen holds its background downloads
 * behind one of these so they do not compete with the title video on a first visit.
 */
export interface Gate { open(): void; run(fn: () => void): void }

export function createGate(ms: number): Gate {
  let opened = false;
  const queue: Array<() => void> = [];
  const open = (): void => {
    if (opened) return;
    opened = true;
    clearTimeout(timer);
    for (const f of queue.splice(0)) f();
  };
  const timer = setTimeout(open, ms);
  return { open, run: (fn) => { if (opened) fn(); else queue.push(fn); } };
}

/** Longest the title video may hold the background downloads back. */
export const TITLE_VIDEO_HOLD_MS = 8000;
