/**
 * What the install precaches (vite.config.ts) and so what the first-launch screen's download total counts
 * (dist/precache.json is read back from the worker's list). Kept apart from the config so a test can read it.
 * The crash film (about 5 MB) is the only cinematic included: it plays on the first story level, which a new
 * player reaches while possibly offline. The other films stay out to keep the install small.
 */
export const PRECACHE_GLOBS: string[] = [
  "**/*.{js,css,html,svg,png,webmanifest,woff2}",
  "models/**/*.glb",
  "assets/crash_open-*.mp4",
];
