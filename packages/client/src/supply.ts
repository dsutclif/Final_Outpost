import type { LevelMeta } from "./levels.js";

// The level supply, client side: tell the server how far the player has got so it can build the
// next batch (api/progress.js → .github/workflows/levels-next.yml). The server never builds more
// than SUPPLY_AHEAD levels past the player; the report only goes out when a batch could be due,
// and at most once per REPORT_EVERY_MS. The pure parts are unit tested.

export const SUPPLY_AHEAD = 60;
/** The server starts a batch only when it can add at least this many levels. */
export const SUPPLY_MIN_BATCH = 10;
/** Recent cleared levels sent for batch tuning. */
export const REPORT_WINDOW = 10;
export const REPORT_EVERY_MS = 60 * 60 * 1000;

export interface ProgressReport {
  /** Levels cleared, as a count in play order (the highest cleared level's number). */
  cleared: number;
  /** The most recent cleared levels: 1-based number, stars and attempts to first clear. */
  played: { index: number; stars: number; attempts: number }[];
}

/** What the server needs from saved progress. Only levels from the shipped packs count. */
export function progressReport(levels: readonly LevelMeta[], cleared: Readonly<Record<string, true>>, stars: (id: string) => number, tries: Readonly<Record<string, number>>): ProgressReport {
  const done = levels.filter((l) => l.url && cleared[l.id]);
  const top = done.reduce((m, l) => Math.max(m, l.index + 1), 0);
  const played = done.slice(-REPORT_WINDOW).map((l) => ({ index: l.index + 1, stars: Math.max(0, Math.min(3, stars(l.id))), attempts: Math.max(1, tries[l.id] ?? 1) }));
  return { cleared: top, played };
}

/** True when the published supply has room for a batch (mirrors the server's own check). */
export function supplyLow(published: number, cleared: number): boolean {
  return Math.min(cleared, published) + SUPPLY_AHEAD - published >= SUPPLY_MIN_BATCH;
}

const LAST_KEY = "fo-supply-last";

/** Send the report if a batch could be due and none went out recently. Never throws. */
export async function reportProgress(url: string, report: ProgressReport, published: number, versions: { engine: string; content: string }, now = Date.now()): Promise<boolean> {
  if (!supplyLow(published, report.cleared)) return false;
  try {
    const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    if (now - last < REPORT_EVERY_MS) return false;
    localStorage.setItem(LAST_KEY, String(now));
  } catch { /* no storage: still report, the server and workflow debounce */ }
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...report, ...versions }) });
    return res.status === 202;
  } catch {
    return false;
  }
}
