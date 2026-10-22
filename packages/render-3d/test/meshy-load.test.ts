import { Group } from "three";
import { describe, expect, it, vi } from "vitest";

// A replay (second renderer init) must hear about every model already in the loader cache, or
// the walls, decor, items and props it swaps in keep their code-built look (backlog R4 item 12).

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class { loadAsync() { return Promise.resolve({ scene: new Group(), animations: [] }); } },
}));

describe("loadMeshy", () => {
  it("reports cached models to a later load, as it did to the first", async () => {
    vi.stubGlobal("document", { baseURI: "http://test/" });
    vi.stubGlobal("fetch", () => Promise.reject(new Error("unused")));
    const { loadMeshy } = await import("../src/assets/meshy.js");
    const first: string[] = [], second: string[] = [];
    await loadMeshy((e) => first.push(e.file));
    expect(first.length).toBeGreaterThan(0);
    await loadMeshy((e) => second.push(e.file));
    expect(second.sort()).toEqual(first.sort());
    vi.unstubAllGlobals();
  });
});
