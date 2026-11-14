import { describe, expect, it } from "vitest";
import { keyPath, megabytes, progressOf, type PrecacheInfo } from "../src/loader";

const info: PrecacheInfo = { count: 3, bytes: 100, files: { "assets/a.js": 10, "models/b.glb": 70, "index.html": 20 } };

describe("first-launch progress", () => {
  it("strips the origin, base and revision from a precache key", () => {
    expect(keyPath("https://x.test/assets/a.js?__WB_REVISION__=abc", "/")).toBe("assets/a.js");
    expect(keyPath("https://x.test/game/models/b.glb?__WB_REVISION__=1", "/game/")).toBe("models/b.glb");
  });
  it("counts cached bytes against the build's list, once per file, ignoring strangers", () => {
    const p = progressOf(["https://x.test/models/b.glb?__WB_REVISION__=1", "https://x.test/models/b.glb", "https://x.test/other.png"], info, "/");
    expect(p).toEqual({ files: 1, bytes: 70, frac: 0.7 });
    expect(progressOf([], info, "/").frac).toBe(0);
    expect(progressOf(["/assets/a.js", "/models/b.glb", "/index.html"], info, "/").frac).toBe(1);
  });
  it("rounds the size shown on the Wi-Fi button", () => {
    expect(megabytes(57_273_027)).toBe(57);
    expect(megabytes(10)).toBe(1);
  });
});
