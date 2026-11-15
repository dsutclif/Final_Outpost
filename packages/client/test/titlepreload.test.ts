import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findTitleVideo, titleVideoPreloadTag } from "../src/titlepreload.js";

describe("title video preload", () => {
  it("finds the hashed title loop among the emitted files and nothing else", () => {
    expect(findTitleVideo(["assets/main-1.js", "assets/title_loop-BIJKC-7P.mp4", "assets/title_loop.poster-x.jpg"])).toBe("assets/title_loop-BIJKC-7P.mp4");
    expect(findTitleVideo(["assets/main-1.js"])).toBeNull();
  });

  it("builds a video preload that goes at the very top of the head", () => {
    const t = titleVideoPreloadTag("/", "assets/title_loop-a.mp4");
    expect(t.attrs).toMatchObject({ rel: "preload", as: "video", href: "/assets/title_loop-a.mp4" });
    expect(t.injectTo).toBe("head-prepend");
  });

  // runs against the output of `pnpm build`; skipped when no build is on disk
  const built = new URL("../dist/index.html", import.meta.url);
// a build older than its sources says nothing about them
const fresh = existsSync(built) && statSync(built).mtimeMs > Math.max(statSync(new URL("../index.html", import.meta.url)).mtimeMs, statSync(new URL("../vite.config.ts", import.meta.url)).mtimeMs, statSync(new URL("../src/titlepreload.ts", import.meta.url)).mtimeMs);
  it.skipIf(!fresh)("in the built index.html the title video preload is the first preload", () => {
    const links = [...readFileSync(built, "utf8").matchAll(/<link[^>]*rel="(?:preload|modulepreload)"[^>]*>/g)].map((m) => m[0]);
    expect(links[0]).toMatch(/as="video"/);
    expect(links[0]).toMatch(/title_loop-[^"]*\.mp4/);
  });
});
