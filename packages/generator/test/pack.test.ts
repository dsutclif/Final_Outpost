import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTENT_VERSION, content, checkManifest, Manifest as ManifestSchema } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";
import { PROFILES, playBot } from "@fo/bots";

// Shipped-pack smoke test: schema, version pins and a sample of levels won by the reference bot.
// The full ladder regression over every level is `pnpm levels:check` (minutes, not seconds).

const packDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../levels/packs/s1");
const packFile = join(packDir, "pack.json");
const present = existsSync(packFile);

describe.skipIf(!present)("level pack s1", () => {
  const pack = present ? JSON.parse(readFileSync(packFile, "utf8")) as { id: string; engineVersion: string; contentVersion: string; levels: { id: string; file: string; title: string; modules: string[]; goal: string; rating: number }[] } : null!;
  const load = (file: string) => ManifestSchema.parse(JSON.parse(readFileSync(join(packDir, file), "utf8")));

  it("is pinned to the running engine and content versions", () => {
    expect(pack.engineVersion).toBe(ENGINE_VERSION);
    expect(pack.contentVersion).toBe(CONTENT_VERSION);
    expect(pack.levels.length).toBeGreaterThanOrEqual(60);
  });

  it("every level parses, cross-checks against content and matches its pack entry", () => {
    for (const e of pack.levels) {
      const m = load(e.file);
      expect(() => checkManifest(m, content)).not.toThrow();
      expect(m.id).toBe(e.id);
      expect(m.engineVersion).toBe(ENGINE_VERSION);
      expect(m.contentVersion).toBe(CONTENT_VERSION);
      expect(m.modules).toEqual(e.modules);
      expect(m.goal.type).toBe(e.goal);
      expect(m.rating?.difficulty).toBeCloseTo(e.rating, 3);
      expect(m.text["mars_greenhouse"]?.title).toBe(e.title);
      expect(m.params["level.budgetSeconds"]).toBeGreaterThan(0);
    }
  });

  it("a sample of five levels is won by the good bot with at least 20% margin", () => {
    const n = pack.levels.length;
    const sample = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1].map((i) => pack.levels[i]!);
    for (const e of sample) {
      const r = playBot(load(e.file), PROFILES["good"]!, 1);
      expect({ id: e.id, won: r.won, stalls: r.stalls }).toEqual({ id: e.id, won: true, stalls: 0 });
      expect(r.margin).toBeGreaterThanOrEqual(0.2);
    }
  });
});
