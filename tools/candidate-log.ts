import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

/** A manifest gzipped and base64-coded for a one-line log row (the `manifestGz` field), and back. */
export const packManifest = (m: unknown): string => gzipSync(Buffer.from(JSON.stringify(m))).toString("base64");
export const unpackManifest = (s: string): unknown => JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8"));

/** A candidate row as the worker reports it, with the raw manifest swapped for its gzipped form. */
export function compactRow<T extends { manifest?: unknown }>(c: T): Omit<T, "manifest"> & { manifestGz?: string } {
  const { manifest, ...rest } = c;
  return manifest ? { ...rest, manifestGz: packManifest(manifest) } : rest;
}

/**
 * #251 part 1: keep a build's raw candidate log. Gzipped into `archiveDir` (levels/candidates/archive, gitignored) and
 * copied to `backupDir` (the ops repo's data/bot-runs/candidates) when that folder exists. An existing file is never
 * overwritten: a name clash gets a numbered name. Returns the paths written.
 */
export function keepRawLog(rows: readonly string[], archiveDir: string, name: string, backupDir: string | null): string[] {
  const free = (dir: string): string => {
    let p = join(dir, name), k = 1;
    while (existsSync(p)) p = join(dir, name.replace(/\.jsonl\.gz$/, `-${++k}.jsonl.gz`));
    return p;
  };
  mkdirSync(archiveDir, { recursive: true });
  const a = free(archiveDir);
  writeFileSync(a, gzipSync(Buffer.from(rows.join("\n") + "\n")));
  const out = [a];
  if (backupDir && existsSync(backupDir)) { const b = free(backupDir); copyFileSync(a, b); out.push(b); }
  return out;
}
