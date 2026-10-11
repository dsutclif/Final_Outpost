import { CONTENT_VERSION, Manifest as ManifestSchema, type Manifest } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";

// Where levels come from: the golden manifests bundled in the shell, then generated packs
// served as static files (Contract 5: levels/packs/<pack>/pack.json plus one manifest JSON per
// level). The service worker caches pack fetches (CacheFirst on /levels/); prefetchLevels()
// warms that cache ahead of the player so the next levels play offline.

export interface LevelMeta {
  id: string;
  /** Position in play order, 0-based. */
  index: number;
  modules: string[];
  goalType: string;
  /** Per-skin text, for titles in the level grid. */
  text: Manifest["text"];
  engineVersion: string;
  contentVersion: string;
  /** Title from the pack index (skin-neutral), when the pack gives one. */
  title?: string;
  /** Rater score from the pack index, when present. */
  rating?: number;
  /** Absolute or base-relative URL of the manifest for fetched levels; absent for bundled ones. */
  url?: string;
}

export interface LevelSource {
  list(): Promise<LevelMeta[]>;
  load(id: string): Promise<Manifest>;
}

const metaOf = (m: Manifest, index: number): LevelMeta => ({
  id: m.id, index, modules: m.modules, goalType: m.goal.type, text: m.text,
  engineVersion: m.engineVersion, contentVersion: m.contentVersion,
});

/** Manifests already in memory (bundled JSON, tests). */
export class StaticLevelSource implements LevelSource {
  private readonly byId = new Map<string, Manifest>();
  private readonly order: Manifest[];

  constructor(raw: readonly unknown[]) {
    this.order = raw.map((r) => ManifestSchema.parse(r)).sort((a, b) => a.id.localeCompare(b.id));
    for (const m of this.order) this.byId.set(m.id, m);
  }

  async list(): Promise<LevelMeta[]> {
    return this.order.map(metaOf);
  }

  async load(id: string): Promise<Manifest> {
    const m = this.byId.get(id);
    if (!m) throw new Error(`unknown level ${id}`);
    return structuredClone(m);
  }
}

/** The prototype levels under levels/golden, bundled into the app shell. */
export function goldenLevelSource(): StaticLevelSource {
  const mods = import.meta.glob("../../../levels/golden/*.json", { eager: true, import: "default" });
  return new StaticLevelSource(Object.values(mods));
}

/** One entry of pack.json (Contract 5). */
export interface PackEntry {
  id: string;
  file: string;
  title?: string;
  modules: string[];
  /** Goal type (or the goal object; only its type is read). */
  goal: string | { type: string };
  rating?: number;
}

/** pack.json (Contract 5). */
export interface PackIndex {
  id: string;
  engineVersion: string;
  contentVersion: string;
  levels: PackEntry[];
}

export interface Versions { engineVersion: string; contentVersion: string }
export const RUNNING: Versions = { engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION };

type FetchFn = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** FNV-1a over pack.json's JSON text, as 8 hex chars: any change to the pack changes every level URL. */
export function packRevision(body: unknown): string {
  const s = JSON.stringify(body);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
const defaultFetch: FetchFn = (url) => fetch(url);

/**
 * A generated pack served as static files. list() reads pack.json only (no per-level fetch);
 * a pack built for another engine or content version lists nothing, so a player never sees a
 * level the running rules would play differently from how it was rated.
 */
export class PackLevelSource implements LevelSource {
  private index: PackIndex | null = null;
  private skipped = false;

  constructor(private readonly baseUrl: string, private readonly fetchFn: FetchFn = defaultFetch, private readonly running: Versions = RUNNING) {}

  /** True after list() when the pack's versions did not match the running sim. */
  get incompatible(): boolean { return this.skipped; }

  private async pack(): Promise<PackIndex | null> {
    if (this.index || this.skipped) return this.index;
    const res = await this.fetchFn(`${this.baseUrl}/pack.json`);
    if (!res.ok) throw new Error(`pack ${this.baseUrl}: HTTP ${res.status}`);
    const body = (await res.json()) as Partial<PackIndex>;
    if (body.engineVersion !== this.running.engineVersion || body.contentVersion !== this.running.contentVersion || !Array.isArray(body.levels)) {
      this.skipped = true;
      return null;
    }
    this.index = {
      id: String(body.id ?? this.baseUrl), engineVersion: body.engineVersion, contentVersion: body.contentVersion,
      levels: body.levels.map((l) => ({ ...l, file: l.file || `${l.id}.json`, modules: l.modules ?? [] })),
    };
    this.rev = packRevision(body);
    return this.index;
  }

  /** Short hash of pack.json; level URLs carry it so a changed pack never serves cached old levels. */
  private rev = "";

  urlOf(entry: PackEntry): string { return `${this.baseUrl}/${entry.file}${this.rev ? `?v=${this.rev}` : ""}`; }

  async list(): Promise<LevelMeta[]> {
    const p = await this.pack();
    if (!p) return [];
    return p.levels.map((l, i) => {
      const meta: LevelMeta = {
        id: l.id, index: i, modules: l.modules, goalType: typeof l.goal === "string" ? l.goal : l.goal?.type ?? "build",
        text: {}, engineVersion: p.engineVersion, contentVersion: p.contentVersion, url: this.urlOf(l),
      };
      if (l.title) meta.title = l.title;
      if (typeof l.rating === "number") meta.rating = l.rating;
      return meta;
    });
  }

  async load(id: string): Promise<Manifest> {
    const p = await this.pack();
    const entry = p?.levels.find((l) => l.id === id);
    if (!p || !entry) throw new Error(`unknown level ${id}`);
    const res = await this.fetchFn(this.urlOf(entry));
    if (!res.ok) throw new Error(`level ${id}: HTTP ${res.status}`);
    return ManifestSchema.parse(await res.json());
  }
}

/**
 * Packs listed in levels/packs/index.json ({ packs: ["s1", ...] }, written by the build and
 * served by the dev server). A missing index or folder means no packs, never an error.
 */
export async function discoverPacks(base: string, fetchFn: FetchFn = defaultFetch, running: Versions = RUNNING): Promise<PackLevelSource[]> {
  try {
    const res = await fetchFn(`${base}/index.json`);
    if (!res.ok) return [];
    const body = (await res.json()) as { packs?: unknown };
    const ids = Array.isArray(body.packs) ? body.packs.filter((x): x is string => typeof x === "string" && /^[\w.-]+$/.test(x)) : [];
    return ids.map((id) => new PackLevelSource(`${base}/${id}`, fetchFn, running));
  } catch {
    return [];
  }
}

/** Several sources played back to back (packs in order). */
export class ChainLevelSource implements LevelSource {
  private owner = new Map<string, LevelSource>();

  constructor(private readonly sources: LevelSource[]) {}

  async list(): Promise<LevelMeta[]> {
    const out: LevelMeta[] = [];
    for (const s of this.sources) {
      let metas: LevelMeta[] = [];
      try { metas = await s.list(); } catch { continue; } // an unreachable pack must not hide the rest
      for (const m of metas) {
        if (this.owner.has(m.id)) continue;
        this.owner.set(m.id, s);
        out.push({ ...m, index: out.length });
      }
    }
    return out;
  }

  async load(id: string): Promise<Manifest> {
    if (!this.owner.size) await this.list();
    const s = this.owner.get(id);
    if (!s) throw new Error(`unknown level ${id}`);
    return s.load(id);
  }
}

/**
 * Every compatible pack the server lists. The prototype (golden) levels are a dev-build extra,
 * listed after the packs so level 1 is always the first pack level; shipped builds never show them.
 */
export async function allLevels(base: string, fetchFn?: FetchFn, includeGolden: boolean = import.meta.env.DEV): Promise<ChainLevelSource> {
  const packs = await discoverPacks(base, fetchFn);
  return new ChainLevelSource(includeGolden ? [...packs, goldenLevelSource()] : packs);
}

// ------------------------------------------------------------------ offline cache

export const LEVEL_CACHE = "fo-levels";

/** The minimal Cache Storage surface used here; injectable for tests. */
export interface CacheLike {
  match(url: string): Promise<unknown>;
  put(url: string, res: Response): Promise<void>;
}

export interface CachesLike { open(name: string): Promise<CacheLike> }

const globalCaches = (): CachesLike | null => (typeof caches !== "undefined" ? (caches as unknown as CachesLike) : null);

/** The fetched levels after `currentIndex`, up to `n`, that have a URL. */
export function upcoming(levels: readonly LevelMeta[], currentIndex: number, n = 30): LevelMeta[] {
  return levels.filter((l) => l.url && l.index > currentIndex).slice(0, n);
}

/**
 * Fetch and cache the given levels (pack.json is cached on the way). Skips ones already cached;
 * stops quietly on the first network failure (offline). Returns how many were added.
 */
export async function prefetchLevels(levels: readonly LevelMeta[], fetchFn: (url: string) => Promise<Response> = (u) => fetch(u), store: CachesLike | null = globalCaches()): Promise<number> {
  if (!store) return 0;
  let added = 0;
  try {
    const cache = await store.open(LEVEL_CACHE);
    for (const l of levels) {
      if (!l.url || (await cache.match(l.url))) continue;
      const res = await fetchFn(l.url);
      if (!res.ok) continue;
      await cache.put(l.url, res);
      added++;
    }
  } catch { /* offline or storage refused: the next launch tries again */ }
  return added;
}

/** Levels playable offline: bundled ones plus fetched ones already in the cache. */
export async function offlineReady(levels: readonly LevelMeta[], store: CachesLike | null = globalCaches()): Promise<number> {
  let n = levels.filter((l) => !l.url).length;
  if (!store) return n;
  try {
    const cache = await store.open(LEVEL_CACHE);
    for (const l of levels) if (l.url && (await cache.match(l.url))) n++;
  } catch { /* no cache storage */ }
  return n;
}
