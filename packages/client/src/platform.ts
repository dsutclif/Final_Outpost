import type { Progress, ProgressMode, SaveStore, Settings, TelemetryAttempt, TelemetryRow } from "./save.js";

// Thin platform layer: the same calls in the browser and inside the Capacitor shell. Native
// plugins load by dynamic import only when the Capacitor bridge says it is native, so the web
// shell never downloads them. Every call is best-effort and never throws.

export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface Platform {
  readonly native: boolean;
  /** One buzz (ms) or a pattern (on/off ms). */
  haptic(ms: number | number[]): void;
  /** Native key-value store (Preferences) for the save mirror; null on the web. */
  readonly storage: KeyValue | null;
  /** App sent to the background / brought back (native App plugin, else page visibility). */
  onPause(fn: () => void): void;
  onResume(fn: () => void): void;
  /** Status bar text colour for a dark or light backdrop, and its background colour. */
  statusBar(darkBackdrop: boolean, color: string): void;
}

interface CapacitorGlobal { isNativePlatform?: () => boolean; getPlatform?: () => string }

export const isNative = (): boolean => {
  try { return !!(globalThis as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.(); } catch { return false; }
};

/** The browser implementation: navigator.vibrate and page visibility. */
export function webPlatform(doc: Document | null = typeof document !== "undefined" ? document : null): Platform {
  return {
    native: false,
    // Chrome logs an error for vibrate() before the first tap; skip until the user has interacted
    haptic(ms) { try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; navigator.vibrate?.(ms); } catch { /* unsupported */ } },
    storage: null,
    onPause(fn) { doc?.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") fn(); }); },
    onResume(fn) { doc?.addEventListener("visibilitychange", () => { if (doc.visibilityState === "visible") fn(); }); },
    statusBar() { /* the web manifest's theme colour covers it */ },
  };
}

/** Pick the platform: native plugins inside Capacitor, the web otherwise. */
export async function createPlatform(): Promise<Platform> {
  if (!isNative()) return webPlatform();
  try {
    const [{ Haptics, ImpactStyle }, { App }, { Preferences }, { StatusBar, Style }] = await Promise.all([
      import("@capacitor/haptics"), import("@capacitor/app"), import("@capacitor/preferences"), import("@capacitor/status-bar"),
    ]);
    return {
      native: true,
      haptic(ms) {
        const d = Array.isArray(ms) ? ms[0] ?? 10 : ms;
        // short taps feel better as impacts; long ones vibrate for their duration
        if (d <= 15) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
        else if (d <= 35) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
        else void Haptics.vibrate({ duration: d }).catch(() => undefined);
      },
      storage: {
        async get(key) { try { return (await Preferences.get({ key })).value; } catch { return null; } },
        async set(key, value) { try { await Preferences.set({ key, value }); } catch { /* best effort */ } },
      },
      onPause(fn) { void App.addListener("pause", fn); },
      onResume(fn) { void App.addListener("resume", fn); },
      statusBar(dark, color) {
        void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
        void StatusBar.setBackgroundColor({ color }).catch(() => undefined);
      },
    };
  } catch {
    return webPlatform();
  }
}

export const MIRROR_KEY = "fo-save-v1";

/**
 * Wraps the IndexedDB store so progress and settings are mirrored to the native key-value
 * store. iOS may purge a WebView's IndexedDB under storage pressure; on launch, an empty
 * IndexedDB save is restored from the mirror.
 */
export class MirroredStore implements SaveStore {
  constructor(private readonly inner: SaveStore, private readonly kv: KeyValue) {}

  get persistent(): boolean { return true; }

  /** Restore progress and settings from the mirror when IndexedDB has none. */
  async restore(): Promise<boolean> {
    // "keep": an older-epoch save still waiting for the player's choice is not empty
    const p = await this.inner.getProgress("keep");
    const empty = !p.current && !Object.keys(p.cleared).length;
    if (!empty) return false;
    const raw = await this.kv.get(MIRROR_KEY);
    if (!raw) return false;
    try {
      const m = JSON.parse(raw) as { progress?: Progress; settings?: Settings };
      if (m.progress) await this.inner.setProgress(m.progress);
      if (m.settings) await this.inner.setSettings(m.settings);
      return true;
    } catch { return false; }
  }

  private async mirror(): Promise<void> {
    const [progress, settings] = await Promise.all([this.inner.getProgress(), this.inner.getSettings()]);
    await this.kv.set(MIRROR_KEY, JSON.stringify({ progress, settings }));
  }

  getProgress(mode?: ProgressMode): Promise<Progress> { return this.inner.getProgress(mode); }
  progressChoicePending(): Promise<boolean> { return this.inner.progressChoicePending(); }
  async setProgress(p: Progress): Promise<void> { await this.inner.setProgress(p); await this.mirror(); }
  getSettings(): Promise<Settings> { return this.inner.getSettings(); }
  async setSettings(s: Settings): Promise<void> { await this.inner.setSettings(s); await this.mirror(); }
  appendTelemetry(a: TelemetryAttempt): Promise<void> { return this.inner.appendTelemetry(a); }
  allTelemetry(): Promise<TelemetryRow[]> { return this.inner.allTelemetry(); }
  markSent(seqs: number[]): Promise<void> { return this.inner.markSent(seqs); }
}
