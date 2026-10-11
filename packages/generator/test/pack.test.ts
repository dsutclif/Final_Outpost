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
  const pack = present ? JSON.parse(readFileSync(packFile, "utf8")) as { id: string; engineVersion: string; contentVersion: string; levels: { id: string; file: string; title: string; family: string; modules: string[]; goal: string; rating: number }[] } : null!;
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
      // REDESIGN-R2: a family and three named star objectives, the first mirroring the goal.
      expect(m.family).toBe(e.family);
      expect(m.objectives).toHaveLength(3);
      expect(m.objectives![0]!.kind).toBe(m.goal.type);
    }
  });

  it("levels 1-5 are the family story in order, and every family appears equally often", () => {
    expect(pack.levels.slice(0, 5).map((e) => e.family)).toEqual(["shelter", "rescue", "harvest", "industrialize", "defend"]);
    const counts: Record<string, number> = {};
    for (const e of pack.levels) counts[e.family] = (counts[e.family] ?? 0) + 1;
    for (const f of ["shelter", "rescue", "harvest", "industrialize", "defend"]) expect(counts[f]).toBe(pack.levels.length / 5);
  });

  it("barrier lines appear only on defend and rescue levels, as closed rings", () => {
    for (const e of pack.levels) {
      const m = load(e.file);
      const lines = m.entities.filter((x) => x.type === "barrier.line");
      if (m.family !== "defend" && m.family !== "rescue") expect({ id: e.id, lines: lines.length }).toEqual({ id: e.id, lines: 0 });
      for (const l of lines) if (l.type === "barrier.line") expect(l.closed).toBe(true);
    }
  });

  it("a sample of five levels is won by the good bot with at least 20% margin", () => {
    const n = pack.levels.length;
    const sample = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1].map((i) => pack.levels[i]!);
    for (const e of sample) {
      const r = playBot(load(e.file), PROFILES["good"]!, 1);
      expect({ id: e.id, won: r.won, stalls: r.stalls }).toEqual({ id: e.id, won: true, stalls: 0 });
      expect(r.margin).toBeGreaterThanOrEqual(0.2);
      expect(r.stars).toBeGreaterThanOrEqual(1);
    }
  });
});

describe.skipIf(!present)("pack titles", () => {
  it("are unique and never fall back to the level id", async () => {
    const pack = JSON.parse(readFileSync(packFile, "utf8")) as { levels: { id: string; file: string; title: string }[] };
    const titles = pack.levels.map((e) => e.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const e of pack.levels) {
      expect(e.title).not.toBe(e.id);
      const m = JSON.parse(readFileSync(join(packDir, e.file), "utf8")) as { text: Record<string, { title: string }> };
      expect(m.text["mars_greenhouse"]!.title).toBe(e.title);
    }
  });

  it("dedupeTitles keeps reserved titles and never repeats", async () => {
    const { dedupeTitles } = await import("../src/index.js");
    const items = Array.from({ length: 40 }, (_, i) => ({ id: `t-${i}`, goal: "kills", modules: ["carry", "lasso"] }));
    const out = dedupeTitles(items, { "t-0": "Hand Made" });
    expect(out["t-0"]).toBe("Hand Made");
    expect(new Set(Object.values(out)).size).toBe(40);
  });
});

describe.skipIf(!present)("star parameter caps", () => {
  it("no shipped star objective exceeds the human-fair caps", async () => {
    const { STAR_CAPS } = await import("../src/index.js");
    const pack = JSON.parse(readFileSync(packFile, "utf8")) as { levels: { file: string }[] };
    for (const e of pack.levels) {
      const m = JSON.parse(readFileSync(join(packDir, e.file), "utf8")) as { objectives: { id: string; kind: string; params: Record<string, number> }[] };
      for (const o of m.objectives.filter((x) => x.id !== "main")) {
        if (o.kind === "streak") expect(o.params["n"]).toBeLessThanOrEqual(STAR_CAPS.streak);
        if (o.kind === "hp_floor") expect(o.params["pct"]).toBeLessThanOrEqual(STAR_CAPS.hpFloor);
        if (o.kind === "heat_floor") expect(o.params["pct"]).toBeLessThanOrEqual(STAR_CAPS.heatFloor);
      }
    }
  });
});
