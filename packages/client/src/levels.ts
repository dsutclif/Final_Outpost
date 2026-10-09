import { Manifest as ManifestSchema, type Manifest } from "@fo/content";

// Where levels come from. For now the golden manifests are bundled statically; a later
// stream adds fetched level packs (levels/packs/<pack>/pack.json) behind the same interface,
// and the service worker caches those fetches (CacheFirst on levels/**).

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

/** A generated pack served as static files: pack.json lists the levels, one file per level. */
export class PackLevelSource implements LevelSource {
  private index: { id: string; file: string }[] | null = null;

  constructor(private readonly baseUrl: string, private readonly fetchFn: typeof fetch = (...a) => fetch(...a)) {}

  private async pack(): Promise<{ id: string; file: string }[]> {
    if (this.index) return this.index;
    const res = await this.fetchFn(`${this.baseUrl}/pack.json`);
    if (!res.ok) throw new Error(`pack ${this.baseUrl}: HTTP ${res.status}`);
    const body = (await res.json()) as { levels: ({ id: string; file?: string } | string)[] };
    this.index = body.levels.map((l) => (typeof l === "string" ? { id: l, file: `${l}.json` } : { id: l.id, file: l.file ?? `${l.id}.json` }));
    return this.index;
  }

  async list(): Promise<LevelMeta[]> {
    const idx = await this.pack();
    const out: LevelMeta[] = [];
    for (let i = 0; i < idx.length; i++) out.push(metaOf(await this.load(idx[i]!.id), i));
    return out;
  }

  async load(id: string): Promise<Manifest> {
    const entry = (await this.pack()).find((l) => l.id === id);
    if (!entry) throw new Error(`unknown level ${id}`);
    const res = await this.fetchFn(`${this.baseUrl}/${entry.file}`);
    if (!res.ok) throw new Error(`level ${id}: HTTP ${res.status}`);
    return ManifestSchema.parse(await res.json());
  }
}

/** Several sources played back to back (golden levels first, then packs). */
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
