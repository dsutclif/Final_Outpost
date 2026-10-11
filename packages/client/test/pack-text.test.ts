import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Manifest } from "@fo/content";
import { marsGreenhouse as skin, guideText } from "@fo/skins";
import { labelOf, manifestObjectives } from "../src/objectives.js";
import { ChainLevelSource, StaticLevelSource } from "../src/levels.js";
import { nextLevel } from "../src/progress.js";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../levels/packs/s1");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^s1-L\d+\.json$/.test(f)) : [];
const manifests = files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Manifest);

describe.skipIf(files.length === 0)("pack objective text", () => {
  it("every objective kind in the pack has a skin template", () => {
    const kinds = new Set(manifests.flatMap((m) => manifestObjectives(m).map((o) => o.kind)));
    expect(kinds.size).toBeGreaterThan(10);
    for (const k of kinds) expect(skin.text.objectives?.[k], `template for ${k}`).toBeTruthy();
  });

  it("every objective renders a complete human label (no raw placeholders)", () => {
    for (const m of manifests) for (const o of manifestObjectives(m)) {
      const t = labelOf(m, skin, o);
      expect(t.length, `${m.id}:${o.kind}`).toBeGreaterThan(3);
      expect(t, `${m.id}:${o.kind}`).not.toMatch(/[{}_]/);
    }
  });
});

describe("guide text", () => {
  it("has skin text for every kind Brain.suggest can return", () => {
    const kinds = ["gather", "feed", "stock", "register", "pile", "pay", "tow", "gate", "barrier", "operate", "deposit", "fetch", "drop", "admit", "fight", "hunt"];
    for (const k of kinds) expect(skin.text.guide?.[k], k).toBeTruthy();
    expect(guideText(skin, "gate")).toMatch(/airlock/i);
  });
});

describe("level list", () => {
  const meta = (id: string, index: number) => ({ id, index }) as never;
  it("progress keyed by unknown (prototype) ids does not break continuing", () => {
    const levels = [meta("s1-L001", 0), meta("s1-L002", 1)];
    const p = { current: "proto-L003", cleared: { "proto-L001": { stars: 3 } } } as never;
    expect(nextLevel(levels, p)?.id).toBe("s1-L001");
  });
  it.skipIf(files.length < 2)("a chain of packs alone starts at the first pack level", async () => {
    const chain = new ChainLevelSource([new StaticLevelSource(manifests.slice(0, 2))]);
    expect((await chain.list()).map((l) => l.id)).toEqual(manifests.slice(0, 2).map((m) => m.id).sort());
  });
});
