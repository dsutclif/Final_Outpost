import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { marsGreenhouse } from "@fo/skins";
import { FILM_VERSIONS } from "../src/cinematics.js";

// Bay pods (outpost-ops#126): bays 5-8 are four pods in the sand, named in both films, with every lid open from level 3 on.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const NAMES = ["VALE", "BRANDT", "IMANI", "SORREL"];
type Ent = { id: string; type: string; roll?: number };
const decor = (n: number): Ent[] => (JSON.parse(readFileSync(resolve(root, `levels/story/story-L00${n}.json`), "utf8")) as { entities: Ent[] }).entities;
const scenes = marsGreenhouse.story!.scenes!;

describe("bay pods", () => {
  it("empty_bays has a photo, name and rank for each of bays 5-8", () => {
    const s = scenes["empty_bays"]!;
    NAMES.forEach((name, i) => {
      expect(s.text[`name${i + 5}`]).toBe(name);
      expect(s.text[`rank${i + 5}`]).toBeTruthy();
      const img = s.images[`badge${i + 5}`]!;
      expect(existsSync(resolve(root, "packages/client/public", img))).toBe(true);
    });
  });
  it("the four badge files are different pictures (each crew member has their own face)", () => {
    const sums = [5, 6, 7, 8].map((n) => createHash("sha1").update(readFileSync(resolve(root, `packages/client/public/scenes/badge_bay${n}.png`))).digest("hex"));
    expect(new Set(sums).size).toBe(4);
  });
  it("crash_log names the same four crew", () => {
    NAMES.forEach((name, i) => expect(scenes["crash_log"]!.text[`name${i + 5}`]).toBe(name));
  });
  it("both films were re-versioned", () => {
    expect(FILM_VERSIONS.empty_bays).toBeGreaterThanOrEqual(3);
    expect(FILM_VERSIONS.crash_log).toBeGreaterThanOrEqual(2);
  });
  it.each([1, 2, 3, 4, 5])("level %i has the commander's pod plus four bay pods", (n) => {
    expect(decor(n).filter((e) => e.type === "decor.stasis_pod").map((e) => e.id)).toEqual(["pod0", "pod1", "pod2", "pod3", "pod4"]);
  });
  it.each([3, 4, 5])("level %i has all four bay lids (lid1-lid4) open", (n) => {
    const e = decor(n);
    for (const k of [1, 2, 3, 4]) expect(e.find((x) => x.id === `lid${k}`)?.roll).toBe(-105);
  });
  it.each([1, 2])("level %i bay lids stay shut", (n) => {
    const e = decor(n);
    for (const k of [1, 2, 3, 4]) expect(e.find((x) => x.id === `lid${k}`)?.roll).toBeUndefined();
  });
});
