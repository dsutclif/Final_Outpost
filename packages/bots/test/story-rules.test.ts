import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTENT_VERSION, Manifest } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";
import { PROFILES, playBot } from "../src/index.js";

// Bot behaviour for the story rules batch (docs/STORY-LEVELS-V2-PLAN.md, B): the two-pod tow, the recorder
// fetch that appears only once its objective is done, and lighting a dark core for the lit clock.

type Ent = { type: string; [k: string]: unknown };
const here = dirname(fileURLToPath(import.meta.url));
const story = (f: string): Record<string, unknown> & { entities: Ent[] } => ({
  ...JSON.parse(readFileSync(resolve(here, "../../../levels/story", f), "utf8")),
  engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION,
});
const objs = (kind: string, params: Record<string, unknown>, second: Record<string, unknown>): unknown[] => [
  { id: "main", kind, params }, { id: "gate", ...second }, { id: "b", kind: "no_colonist_freezes", params: {} },
];
const good = PROFILES["good"]!;

describe("bots on the story rules", () => {
  it("tows two pods home in one trip", () => {
    const L = story("story-L002.json");
    const m = Manifest.parse({ ...L, goal: { type: "tow_trip", n: 2 }, objectives: objs("tow_trip", { n: 2 }, { kind: "no_injuries", params: {} }) });
    const r = playBot(m, good, 1);
    expect({ won: r.won, stalls: r.stalls }).toEqual({ won: true, stalls: 0 });
  });

  it("fetches a recorder once its objective reveals it", () => {
    const L = story("story-L002.json");
    const pod = L.entities.find((e) => e.type === "capture.recruit_container")!;
    const m = Manifest.parse({
      ...L,
      entities: [...L.entities, { type: "capture.recorder", at: pod["at"], hiddenUntil: "gate" }],
      goal: { type: "crates", n: 1 },
      objectives: objs("crates", { n: 1 }, { kind: "rescue", params: { n: 1 } }),
    });
    const r = playBot(m, good, 1);
    expect({ won: r.won, stalls: r.stalls }).toEqual({ won: true, stalls: 0 });
    expect(r.trace.story.items).toBe(1);
  });

  it("lights a dark core for core_lit and for a lit clock", () => {
    const L = story("story-L001.json");
    expect(L.entities.some((e) => e.type === "sink.core" && (e["params"] as { lit?: boolean }).lit === false)).toBe(true);
    const lit = playBot(Manifest.parse({ ...L, goal: { type: "core_lit" }, objectives: objs("core_lit", {}, { kind: "settlement_never_freezes", params: {} }) }), good, 1);
    expect(lit.won).toBe(true);
    expect(lit.trace.story.litTicks).toBeGreaterThan(0);
    const clock = playBot(Manifest.parse({ ...L, goal: { type: "survive", seconds: 30, fromLit: 1 }, objectives: objs("survive", { seconds: 30, fromLit: 1 }, { kind: "core_lit", params: {} }) }), good, 1);
    expect(clock.won).toBe(true);
    expect(clock.trace.story.litTicks).toBeGreaterThan(0);
  });

  it("works a staffed source for converters_running sources", () => {
    const L = story("story-L004.json");
    const m = Manifest.parse({ ...L, goal: { type: "converters_running", k: 1, seconds: 5, sources: 1 }, objectives: objs("converters_running", { k: 1, seconds: 5, sources: 1 }, { kind: "no_injuries", params: {} }) });
    const r = playBot(m, good, 1);
    expect(r.won).toBe(true);
  });
});
