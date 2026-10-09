import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// Saves in IndexedDB: progress, settings and the telemetry queue. Every read merges with
// defaults, so a fresh install, an older save or a missing store all load cleanly. When
// IndexedDB is unavailable (private mode, tests) an in-memory store stands in.

export interface Progress {
  cleared: Record<string, true>;
  /** Best winning time per level, in ticks. */
  best: Record<string, number>;
  /** Quit count per level. */
  quits: Record<string, number>;
  current: string | null;
}

export interface Settings {
  renderer: "2d" | "3d";
  haptics: boolean;
  sound: boolean;
  quality: "auto" | "low" | "medium" | "high";
  skin: string;
  debug: boolean;
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

export const DEFAULT_PROGRESS: Progress = { cleared: {}, best: {}, quits: {}, current: null };
export const DEFAULT_SETTINGS: Settings = { renderer: "2d", haptics: true, sound: true, quality: "auto", skin: "mars_greenhouse", debug: false };

interface FoDB extends DBSchema {
  kv: { key: string; value: unknown };
  telemetry: { key: number; value: TelemetryRow };
}

const DB_NAME = "farthest-outpost";
const DB_VERSION = 1;

export interface SaveStore {
  getProgress(): Promise<Progress>;
  setProgress(p: Progress): Promise<void>;
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<void>;
  appendTelemetry(a: TelemetryAttempt): Promise<void>;
  allTelemetry(): Promise<TelemetryRow[]>;
  markSent(seqs: number[]): Promise<void>;
  readonly persistent: boolean;
}

export function mergeProgress(raw: unknown): Progress {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Progress>;
  return {
    cleared: { ...(r.cleared ?? {}) },
    best: { ...(r.best ?? {}) },
    quits: { ...(r.quits ?? {}) },
    current: typeof r.current === "string" ? r.current : null,
  };
}

export function mergeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...r };
}

class IdbStore implements SaveStore {
  constructor(private readonly db: IDBPDatabase<FoDB>, readonly persistent: boolean) {}
  async getProgress(): Promise<Progress> { return mergeProgress(await this.db.get("kv", "progress")); }
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
  async getProgress(): Promise<Progress> { return mergeProgress(this.progress); }
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
    const db = await openDB<FoDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Version 1: first schema. Later versions add steps below, never rewrite these.
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
          if (!db.objectStoreNames.contains("telemetry")) db.createObjectStore("telemetry", { keyPath: "seq", autoIncrement: true });
        }
      },
    });
    return new IdbStore(db, persistent);
  } catch {
    return new MemoryStore();
  }
}
