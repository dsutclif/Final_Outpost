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
