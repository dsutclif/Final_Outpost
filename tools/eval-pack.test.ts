import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evalLevel } from "./eval-lib.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, any>;
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("levels/eval side files", () => {
  // Every pack the index lists (the current pack is among them): each level needs a complete side file.
  const packs = (json(join(root, "levels/packs/index.json"))["packs"] as string[]);
  for (const pack of packs) {
    it(`pack ${pack}: every level has every sub-point`, () => {
      const levels = json(join(root, "levels/packs", pack, "pack.json"))["levels"] as { id: string; file: string }[];
      const missing: string[] = [];
      for (const l of levels) {
        const f = join(root, "levels/eval", pack, `${l.id}.json`);
        if (!existsSync(f)) { missing.push(`${l.id}: no file`); continue; }
        const d = json(f), m = json(join(root, "levels/packs", pack, l.file));
        if (d["schema"] !== 1) missing.push(`${l.id}: schema`);
        for (const s of ["fun", "difficulty", "runs"]) if (!d[s] || Object.keys(d[s]).length === 0) missing.push(`${l.id}: ${s}`);
        if (Object.keys(d["fun"]?.proxies ?? {}).length === 0) missing.push(`${l.id}: fun.proxies`);
        if (Object.keys(d["difficulty"]?.metrics ?? {}).length === 0) missing.push(`${l.id}: difficulty.metrics`);
        const waves = (m["waves"] as unknown[]).length;
        if (waves > 0 && (!Array.isArray(d["defendTrace"]) || d["defendTrace"].length !== waves)) missing.push(`${l.id}: defendTrace length != ${waves}`);
      }
      expect(missing).toEqual([]);
    });
  }
});

describe("re-rating", () => {
  it("leaves pack.json and the level file byte-identical", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fo-eval-"));
    const dir = join(tmp, "levels/packs/s1");
    mkdirSync(dir, { recursive: true });
    const src = join(root, "levels/packs/s1");
    const first = (json(join(src, "pack.json"))["levels"] as { id: string; file: string }[])[0]!;
    copyFileSync(join(src, "pack.json"), join(dir, "pack.json"));
    copyFileSync(join(src, first.file), join(dir, first.file));
    const before = [sha(join(dir, "pack.json")), sha(join(dir, first.file)), sha(join(src, "pack.json"))];
    const d = evalLevel({ root: tmp, pack: "s1", refSeeds: 1, otherSeeds: 1 }, first.id);
    expect(d.schema).toBe(1);
    expect(existsSync(join(tmp, "levels/eval/s1", `${first.id}.json`))).toBe(true);
    expect([sha(join(dir, "pack.json")), sha(join(dir, first.file)), sha(join(src, "pack.json"))]).toEqual(before);
  });
});
