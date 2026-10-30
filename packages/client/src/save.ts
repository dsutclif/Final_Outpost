import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { PROGRESS_EPOCH } from "./epoch.js";
import { normalizeTimeTargetPct } from "./timetarget.js";

// Saves in IndexedDB: progress, settings and the telemetry queue. Every read merges with
// defaults, so a fresh install, an older save or a missing store all load cleanly. When
// IndexedDB is unavailable (private mode, tests) an in-memory store stands in.

export interface Progress {
  cleared: Record<string, true>;
  /** Best winning time per level, in ticks. */
  best: Record<string, number>;
  /** Quit count per level. */
  quits: Record<string, number>;
  /** Finished attempts per level up to and including its first clear (level supply tuning). */
  tries: Record<string, number>;
  current: string | null;
  /** Coach-mark completions per rule id; a rule retires after a few. */
  coach: Record<string, number>;
  /** Best star rating per level (1 to 3, from the win margin). */
  stars: Record<string, number>;
  /** Objective ids achieved per level, best-ever union across attempts (the stars the level grid shows). */
  starSet: Record<string, string[]>;
  /** Canonical ids of object types the player has interacted with (discovery labels, field guide). */
  discovered: Record<string, true>;
  /** Cinematics already shown (cinematics.ts ids); each plays once, never on replay. */
  cinematics: Record<string, true>;
  /** Which pack generation the level progress belongs to (PROGRESS_EPOCH). */
  epoch?: number;
}

export { PROGRESS_EPOCH };

/** What happens to level progress from an older epoch; the player picks on the first boot after the update. */
export type ProgressMode = "keep" | "reset";

export interface Settings {
  haptics: boolean;
  sound: boolean;
  quality: "auto" | "low" | "medium" | "high";
  skin: string;
  debug: boolean;
  /** Show guide arrows on every level (they always show on the first five). */
  guide: boolean;
  /** Show the guide arrow on any level after a stretch with no progress toward its goals. */
  stuckArrow: boolean;
  /** Scale on the level time target, in percent (100-200 in steps of 20). */
  timeTargetPct: number;
  /** Frames per second the "auto" quality probe measured in play, or null before it ran. */
  probeFps: number | null;
}

export interface TelemetryAttempt {
  levelId: string;
  engineVersion: string;
  contentVersion: string;
  outcome: "win" | "lose" | "quit";
  reason: string;
  ticks: number;
  quits: number;
  ts: number;
}

export interface TelemetryRow extends TelemetryAttempt { seq?: number; sent: boolean }

export const DEFAULT_PROGRESS: Progress = { cleared: {}, best: {}, quits: {}, tries: {}, current: null, coach: {}, stars: {}, starSet: {}, discovered: {}, cinematics: {}, epoch: PROGRESS_EPOCH };
export const DEFAULT_SETTINGS: Settings = { haptics: true, sound: true, quality: "auto", skin: "mars_greenhouse", debug: false, guide: false, stuckArrow: true, timeTargetPct: 100, probeFps: null };

interface FoDB extends DBSchema {
  kv: { key: string; value: unknown };
  telemetry: { key: number; value: TelemetryRow };
}

const DB_NAME = "farthest-outpost";
const DB_VERSION = 1;

export interface SaveStore {
  /** Progress merged with defaults; `mode` applies only to a save from an older epoch. */
  getProgress(mode?: ProgressMode): Promise<Progress>;
  /** The save holds level progress from an older epoch, so the player should choose a ProgressMode. */
  progressChoicePending(): Promise<boolean>;
  setProgress(p: Progress): Promise<void>;
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<void>;
  appendTelemetry(a: TelemetryAttempt): Promise<void>;
  allTelemetry(): Promise<TelemetryRow[]>;
  markSent(seqs: number[]): Promise<void>;
  readonly persistent: boolean;
}

/** True when `raw` is an older-epoch save with level progress worth asking about. */
export function needsProgressChoice(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Partial<Progress>;
  return r.epoch !== PROGRESS_EPOCH && (Object.keys(r.cleared ?? {}).length > 0 || typeof r.current === "string");
}

export function mergeProgress(raw: unknown, mode: ProgressMode = "reset"): Progress {
  const r0 = (raw && typeof raw === "object" ? raw : {}) as Partial<Progress>;
  // an older pack generation: what the player has learned stays; "keep" also carries which levels are
  // cleared and where Play continues, but not times, stars or tries earned on the old layouts
  const learned: Partial<Progress> = { ...(r0.coach ? { coach: r0.coach } : {}), ...(r0.discovered ? { discovered: r0.discovered } : {}), ...(r0.cinematics ? { cinematics: r0.cinematics } : {}) };
  const r: Partial<Progress> = !raw || r0.epoch === PROGRESS_EPOCH ? r0
    : mode === "keep" ? { ...learned, cleared: r0.cleared ?? {}, current: r0.current ?? null }
    : learned;
  return {
    epoch: PROGRESS_EPOCH,
    cleared: { ...(r.cleared ?? {}) },
    best: { ...(r.best ?? {}) },
    quits: { ...(r.quits ?? {}) },
    tries: { ...(r.tries ?? {}) },
    current: typeof r.current === "string" ? r.current : null,
    coach: { ...(r.coach ?? {}) },
    stars: { ...(r.stars ?? {}) },
    starSet: { ...(r.starSet ?? {}) },
    discovered: { ...(r.discovered ?? {}) },
    cinematics: { ...(r.cinematics ?? {}) },
  };
}

export function mergeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings> & Record<string, unknown>;
  // fields from the 2D/3D era (renderer, rendererChosen, benchFps) are dropped
  const { renderer: _r, rendererChosen: _c, benchFps: _b, ...rest } = r;
  const out = { ...DEFAULT_SETTINGS, ...rest } as Settings;
  out.timeTargetPct = normalizeTimeTargetPct(out.timeTargetPct);
  return out;
}

class IdbStore implements SaveStore {
  constructor(private readonly db: IDBPDatabase<FoDB>, readonly persistent: boolean) {}
  async getProgress(mode?: ProgressMode): Promise<Progress> { return mergeProgress(await this.db.get("kv", "progress"), mode); }
  async progressChoicePending(): Promise<boolean> { return needsProgressChoice(await this.db.get("kv", "progress")); }
  async setProgress(p: Progress): Promise<void> { await this.db.put("kv", p, "progress"); }
  async getSettings(): Promise<Settings> { return mergeSettings(await this.db.get("kv", "settings")); }
  async setSettings(s: Settings): Promise<void> { await this.db.put("kv", s, "settings"); }
  async appendTelemetry(a: TelemetryAttempt): Promise<void> { await this.db.add("telemetry", { ...a, sent: false }); }
  async allTelemetry(): Promise<TelemetryRow[]> { return this.db.getAll("telemetry"); }
  async markSent(seqs: number[]): Promise<void> {
    const tx = this.db.transaction("telemetry", "readwrite");
    for (const s of seqs) {
      const row = await tx.store.get(s);
      if (row) await tx.store.put({ ...row, sent: true });
    }
    await tx.done;
  }
}

export class MemoryStore implements SaveStore {
  private progress: unknown = null;
  private settings: unknown = null;
  private rows: TelemetryRow[] = [];
  readonly persistent = false;
  async getProgress(mode?: ProgressMode): Promise<Progress> { return mergeProgress(this.progress, mode); }
  async progressChoicePending(): Promise<boolean> { return needsProgressChoice(this.progress); }
  async setProgress(p: Progress): Promise<void> { this.progress = structuredClone(p); }
  async getSettings(): Promise<Settings> { return mergeSettings(this.settings); }
  async setSettings(s: Settings): Promise<void> { this.settings = { ...s }; }
  async appendTelemetry(a: TelemetryAttempt): Promise<void> { this.rows.push({ ...a, sent: false, seq: this.rows.length + 1 }); }
  async allTelemetry(): Promise<TelemetryRow[]> { return this.rows.map((r) => ({ ...r })); }
  async markSent(seqs: number[]): Promise<void> { for (const r of this.rows) if (r.seq !== undefined && seqs.includes(r.seq)) r.sent = true; }
}

/** Open the save database, asking the browser to keep it (navigator.storage.persist). */
export async function openSaves(): Promise<SaveStore> {
  let persistent = false;
  try { persistent = (await navigator.storage?.persist?.()) ?? false; } catch { persistent = false; }
  if (typeof indexedDB === "undefined") return new MemoryStore();
  try {
    // a stuck open (blocked by another tab's pending upgrade or delete) must not hang the boot
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
    const db = await Promise.race([timeout, openDB<FoDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Version 1: first schema. Later versions add steps below, never rewrite these.
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
          if (!db.objectStoreNames.contains("telemetry")) db.createObjectStore("telemetry", { keyPath: "seq", autoIncrement: true });
        }
      },
    })]);
    if (!db) return new MemoryStore();
    return new IdbStore(db, persistent);
  } catch {
    return new MemoryStore();
  }
}
