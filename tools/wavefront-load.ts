// outpost-ops#202: shared helpers for the wavefront tools: load a shipped pack level, parse --seed / --seeds arguments.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Manifest } from "../packages/generator/src/padRepair.js";
import { convert } from "./wavefront-convert.js";

const root = fileURLToPath(new URL("../levels/packs/", import.meta.url));
export function loadLevel(id: string) {
  for (const pack of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const f = `${root}${pack}/${id}.json`;
    try { return convert(JSON.parse(readFileSync(f, "utf8")) as Manifest); } catch { /* next pack */ }
  }
  throw new Error(`level ${id} not found under levels/packs`);
}
export const levelNumber = (id: string) => Number(id.replace(/^s1-L0*/, ""));
/** "--seed 1", "--seed 1 2 3", "--seed 3-8" (several --seed allowed) */
export function seedsFrom(argv: string[], flag = "--seed"): number[] {
  const out: number[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === flag) for (let j = i + 1; j < argv.length && !argv[j]!.startsWith("--"); j++) {
    const m = /^(\d+)-(\d+)$/.exec(argv[j]!);
    if (m) for (let s = Number(m[1]); s <= Number(m[2]); s++) out.push(s); else out.push(Number(argv[j]));
  }
  return out;
}
export const argOf = (argv: string[], n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
