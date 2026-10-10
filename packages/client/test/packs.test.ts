import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ChainLevelSource, StaticLevelSource, discoverPacks, offlineReady, prefetchLevels, upcoming, type CacheLike } from "../src/levels.js";
import golden1 from "../../../levels/golden/proto-L001.json";

// Contract 5 packs read from the fixture folder through a fetch stub, the way the client reads
// dist/levels/packs over HTTP.

const root = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
// the fixture is pinned to whatever versions it was written with; tests run "as" that engine
const fixtureVersions = JSON.parse(readFileSync(join(root, "packs/t1/pack.json"), "utf8")) as { engineVersion: string; contentVersion: string };
const running = { engineVersion: fixtureVersions.engineVersion, contentVersion: fixtureVersions.contentVersion };
const fsFetch = async (url: string): Promise<Response> => {
  const p = join(root, url.replace(/^\//, ""));
  return existsSync(p) ? new Response(readFileSync(p, "utf8")) : new Response("", { status: 404 });
};

describe("level packs", () => {
  it("discovers packs, skips one built for another engine version, and lists entries from pack.json only", async () => {
    let levelFetches = 0;
    const counting = async (url: string) => { if (/L00\d\.json$/.test(url)) levelFetches++; return fsFetch(url); };
    const packs = await discoverPacks("/packs", counting, running);
    expect(packs).toHaveLength(2);
    const chain = new ChainLevelSource([new StaticLevelSource([golden1]), ...packs]);
    const list = await chain.list();
    expect(list.map((l) => l.id)).toEqual(["proto-L001", "t1-L001", "t1-L002"]);
    expect(list.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(levelFetches).toBe(0);
    expect(list[2]!.title).toBe("Fixture Two");
    expect(list[1]!.rating).toBeCloseTo(0.31);
    expect(list[1]!.url).toBe("/packs/t1/t1-L001.json");
    expect(packs[1]!.incompatible).toBe(true);
    const m = await chain.load("t1-L002");
    expect(m.id).toBe("t1-L002");
    await expect(chain.load("old-1")).rejects.toThrow();
  });

  it("tolerates the packs folder being absent", async () => {
    expect(await discoverPacks("/nowhere", fsFetch)).toEqual([]);
    expect(await discoverPacks("/x", async () => { throw new Error("offline"); })).toEqual([]);
  });

  it("prefetches the next levels into the cache and counts what plays offline", async () => {
    const store = new Map<string, Response>();
    const cache: CacheLike = { match: async (u) => store.get(u), put: async (u, r) => { store.set(u, r); } };
    const caches = { open: async () => cache };
    const list = await new ChainLevelSource([new StaticLevelSource([golden1]), ...(await discoverPacks("/packs", fsFetch, running))]).list();
    expect(upcoming(list, 0, 30).map((l) => l.id)).toEqual(["t1-L001", "t1-L002"]);
    expect(upcoming(list, 1, 30).map((l) => l.id)).toEqual(["t1-L002"]);
    expect(await offlineReady(list, caches)).toBe(1);
    expect(await prefetchLevels(upcoming(list, 0), fsFetch, caches)).toBe(2);
    expect(await prefetchLevels(upcoming(list, 0), fsFetch, caches)).toBe(0);
    expect(await offlineReady(list, caches)).toBe(3);
    // offline: fetch throws, nothing breaks
    expect(await prefetchLevels([{ ...list[1]!, url: "/packs/t1/missing.json" }], async () => { throw new Error("offline"); }, caches)).toBe(0);
  });
});
