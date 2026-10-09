import type { SaveStore, TelemetryAttempt } from "./save.js";

// One row per attempt, queued in IndexedDB. With VITE_TELEMETRY_URL set, unsent rows are
// POSTed in the background with exponential backoff; without it, the settings screen
// exports them to a JSON file (no backend in v1).

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

  async record(a: TelemetryAttempt): Promise<void> {
    await this.store.appendTelemetry(a);
    if (this.url) void this.flush();
  }

  /** POST every unsent row; on failure retry later with doubling delay (cap 5 min). */
  async flush(): Promise<boolean> {
    if (!this.url || this.flushing) return false;
    this.flushing = true;
    try {
      const rows = (await this.store.allTelemetry()).filter((r) => !r.sent);
      if (!rows.length) return true;
      const res = await this.fetchFn(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attempts: rows.map(({ sent: _s, ...r }) => r) }),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.store.markSent(rows.map((r) => r.seq!).filter((s) => s !== undefined));
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

  /** Download every queued attempt as a JSON file. */
  async exportFile(): Promise<number> {
    const rows = await this.store.allTelemetry();
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), attempts: rows }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `farthest-outpost-telemetry-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return rows.length;
  }
}
