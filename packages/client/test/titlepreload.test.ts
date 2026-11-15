import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findTitleFonts, findTitleVideo, fontPreloadTag, titleVideoPreloadTag } from "../src/titlepreload.js";

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

  it("picks at most two woff2 faces, the display weight first", () => {
    const names = ["assets/barlow-latin-700-normal-a.woff2", "assets/barlow-latin-500-normal-b.woff2", "assets/barlow-latin-500-normal-b.woff", "assets/barlow-condensed-latin-800-normal-c.woff2", "assets/barlow-condensed-latin-600-normal-d.woff2"];
    expect(findTitleFonts(names)).toEqual(["assets/barlow-condensed-latin-800-normal-c.woff2", "assets/barlow-latin-500-normal-b.woff2"]);
    expect(fontPreloadTag("/", "assets/x.woff2").attrs).toMatchObject({ as: "font", type: "font/woff2", crossorigin: "" });
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

  it.skipIf(!fresh)("the build ships no .woff and preloads at most two fonts, after the video", () => {
    const dir = new URL("../dist/assets/", import.meta.url);
    const files = readdirSync(dir);
    expect(files.filter((f) => f.endsWith(".woff"))).toEqual([]);
    expect(files.filter((f) => f.endsWith(".woff2")).length).toBeGreaterThan(0);
    const links = [...readFileSync(built, "utf8").matchAll(/<link[^>]*rel="preload"[^>]*>/g)].map((m) => m[0]);
    expect(links.filter((l) => /as="font"/.test(l)).length).toBeLessThanOrEqual(2);
    expect(links.findIndex((l) => /as="video"/.test(l))).toBe(0);
  });
});
