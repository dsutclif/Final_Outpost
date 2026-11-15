// Imported by vite.config.ts as well as tests, so it stays free of app imports.

/** The built title-loop video among the bundle's emitted file names, or null (dev server, or the file moved). */
export function findTitleVideo(fileNames: readonly string[]): string | null {
  return fileNames.find((f) => /(^|\/)title_loop-[^/]*\.mp4$/.test(f)) ?? null;
}

/** The preload tag that puts the title video first in the queue on a first visit. */
export const titleVideoPreloadTag = (base: string, file: string): { tag: string; attrs: Record<string, string>; injectTo: "head-prepend" } => ({
  tag: "link",
  attrs: { rel: "preload", as: "video", type: "video/mp4", href: `${base}${file}` },
  injectTo: "head-prepend",
});

/** Home-screen faces worth a preload (the display weight on the title, the body weight under it); the other weights load when first drawn. */
export const TITLE_FONT_PRELOADS: readonly RegExp[] = [/(^|\/)barlow-condensed-latin-800-normal-[^/]*\.woff2$/, /(^|\/)barlow-latin-500-normal-[^/]*\.woff2$/];

/** The built woff2 files to preload, in order, at most two. */
export const findTitleFonts = (fileNames: readonly string[]): string[] =>
  TITLE_FONT_PRELOADS.flatMap((re) => fileNames.filter((f) => re.test(f)).slice(0, 1));

export const fontPreloadTag = (base: string, file: string): { tag: string; attrs: Record<string, string>; injectTo: "head-prepend" } => ({
  tag: "link",
  attrs: { rel: "preload", as: "font", type: "font/woff2", crossorigin: "", href: `${base}${file}` },
  injectTo: "head-prepend",
});
