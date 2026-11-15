import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const built = new URL("../dist/index.html", import.meta.url);
// a build older than its sources says nothing about them
const fresh = existsSync(built) && statSync(built).mtimeMs > Math.max(statSync(new URL("../index.html", import.meta.url)).mtimeMs, statSync(new URL("../vite.config.ts", import.meta.url)).mtimeMs, statSync(new URL("../src/titlepreload.ts", import.meta.url)).mtimeMs);

describe("inline boot poster", () => {
  const src = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  it("the source puts the poster style and its div before the app script", () => {
    expect(src.indexOf("#boot-poster")).toBeGreaterThan(-1);
    expect(src.indexOf("%TITLE_POSTER_DATA%")).toBeLessThan(src.indexOf('<script type="module"'));
    expect(src.indexOf('id="boot-poster"')).toBeLessThan(src.indexOf('id="root"'));
  });

  // runs against the output of `pnpm build`; skipped when no build is on disk
  it.skipIf(!fresh)("the built document carries the poster as a data URI before any script or file reference", () => {
    const html = readFileSync(built, "utf8");
    const at = html.indexOf("url(data:image/jpeg;base64,");
    expect(at).toBeGreaterThan(-1);
    expect(html).not.toContain("%TITLE_POSTER_DATA%");
    expect(at).toBeLessThan(html.indexOf("<script"));
    expect(at).toBeLessThan(html.indexOf('<link rel="stylesheet"'));
    expect(html.indexOf('id="boot-poster"')).toBeLessThan(html.indexOf('id="root"'));
    expect(html.length).toBeLessThan(60_000);
  });
});
