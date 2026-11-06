import type { SaveStore, TelemetryEvent, TelemetryRow } from "./save.js";

// Play data (docs/review/CONTRACT.md §1): events queue in IndexedDB and, when an endpoint is set
// (/api/telemetry in production builds), go up in batches a few seconds after they happen, with
// exponential backoff while offline or while the endpoint answers an error. The settings screen can
// also export everything queued to a JSON file.

/** Events per POST: the endpoint takes at most 200 and 64 KB. */
export const BATCH = 100;
/** Gather events this long before posting, so a level's end rows go up together. */
const SETTLE_MS = 3000;

export class TelemetryQueue {
  private backoff = 2000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(private readonly store: SaveStore, private readonly url: string | undefined, private readonly fetchFn: typeof fetch = (...a) => fetch(...a)) {
    if (this.url && typeof window !== "undefined") {
      window.addEventListener("online", () => { this.backoff = 2000; void this.flush(); });
      void this.flush();
    }
  }

  async record(e: TelemetryEvent): Promise<void> {
    await this.store.appendTelemetry(e);
    if (this.url && !this.timer) this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, SETTLE_MS);
  }

  /** POST every unsent row in batches; on failure retry later with doubling delay (cap 5 min). */
  async flush(): Promise<boolean> {
    if (!this.url || this.flushing) return false;
    this.flushing = true;
    try {
      const unsent = (await this.store.allTelemetry()).filter((r) => !r.sent);
      // rows from before play data v2 carry no install id; they are dropped, not sent
      const legacy = unsent.filter((r) => r.v !== 2).map((r) => r.seq!).filter((s) => s !== undefined);
      if (legacy.length) await this.store.markSent(legacy);
      const rows = unsent.filter((r) => r.v === 2);
      for (let i = 0; i < rows.length; i += BATCH) {
        const part = rows.slice(i, i + BATCH);
        const res = await this.fetchFn(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ v: 2, events: part.map(strip) }),
          keepalive: true,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await this.store.markSent(part.map((r) => r.seq!).filter((s) => s !== undefined));
      }
      this.backoff = 2000;
      return true;
    } catch {
      this.schedule();
      return false;
    } finally {
      this.flushing = false;
    }
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.backoff);
    this.backoff = Math.min(300_000, this.backoff * 2);
  }

  /** Download every queued event as a JSON file. */
  async exportFile(): Promise<number> {
    const rows = await this.store.allTelemetry();
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), v: 2, events: rows }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `farthest-outpost-play-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return rows.length;
  }
}

const strip = ({ sent: _s, seq: _q, ...e }: TelemetryRow): TelemetryEvent => e;
