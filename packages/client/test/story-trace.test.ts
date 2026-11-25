import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { StoryLevel } from "@fo/skins";
import { traceStory, type TraceFailure } from "../src/story/trace.js";

// r4 (Doug 2026-11-24): the story sequence trace plays Levels 1-5 headless through the real director and sim and fails on
// (a) a world speaker off screen when their line shows, (b) anyone moving during a line, (c) play held > 4 s with
// nothing to read, (d) an arrow at something done or hidden, (e) the level ending with closing cues still waiting or
// the result card before the story queue is empty, (f) anything thrown. See packages/client/src/story/trace.ts.
//
// ALLOW: known failures, each with a written reason. Phase B lanes fix the level and DELETE the entry; nothing ships
// until every "phase B" entry is gone. Match = level + check + cue + a piece of the message.

const PHASE_B = "phase B: known sequencing fault found by the r4 trace, to be fixed in the level's data";
const ALLOW: readonly { level: string; check: TraceFailure["check"]; cue: string; has: string; why: string }[] = [
  { level: "story-L003", check: "c", cue: "selaIn", has: "play held", why: PHASE_B },
  { level: "story-L003", check: "d", cue: "selaMet", has: "pad already done (dome)", why: PHASE_B },
  { level: "story-L003", check: "c", cue: "tamTrained", has: "play held", why: PHASE_B },
  { level: "story-L003", check: "c", cue: "wallDone", has: "play held", why: PHASE_B },
  { level: "story-L003", check: "c", cue: "proteinTip", has: "play held", why: PHASE_B },
  { level: "story-L003", check: "a", cue: "hubDone", has: "sela speaks off screen", why: PHASE_B },
  { level: "story-L003", check: "c", cue: "hubDone", has: "play held", why: PHASE_B },
];

const manifest = (id: string): unknown => JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "levels", "story", `${id}.json`), "utf8"));
const allowed = (level: string, f: TraceFailure): boolean => ALLOW.some((a) => a.level === level && a.check === f.check && a.cue === f.cue && f.message.includes(a.has));

describe("story sequence trace, Levels 1-5", () => {
  for (const id of ["story-L001", "story-L002", "story-L003", "story-L004", "story-L005"]) {
    it(`${id} plays through with no new sequencing faults`, async () => {
      const t = await traceStory(id, manifest(id));
      expect(t.won, `${id} should be won by the good bot`).toBe(true);
      const fresh = t.failures.filter((f) => !allowed(id, f)).map((f) => `(${f.check}) t ${f.t.toFixed(1)} cue ${f.cue}: ${f.message}`);
      expect(fresh).toEqual([]);
      // an allowance that no longer matches is stale: delete it (the level got fixed)
      const stale = ALLOW.filter((a) => a.level === id && !t.failures.some((f) => a.check === f.check && a.cue === f.cue && f.message.includes(a.has)));
      expect(stale.map((a) => `${a.check} ${a.cue} ${a.has}`)).toEqual([]);
    }, 180_000);
  }
});

describe("the trace catches what it must", () => {
  const base = (cues: StoryLevel["cues"], cast: StoryLevel["cast"]): StoryLevel => ({ goals: [], cues, cast });

  it("flags a speaker off screen (a) and a closing cue that can never fire (e)", async () => {
    const level = base([
      { id: "open", on: { start: true }, do: [{ line: "I am far away.", who: "far" }] },
      { on: { near: { at: [5, 5] }, r: 3, after: "open" }, do: [{ line: "Never.", who: "kiln" }] },
    ], { far: { at: [5, 5] } });
    const t = await traceStory("story-L001", manifest("story-L001"), { level });
    expect(t.failures.some((f) => f.check === "a" && f.message.includes("far speaks off screen"))).toBe(true);
    expect(t.failures.some((f) => f.check === "e" && f.message.includes("can never fire"))).toBe(true);
  }, 180_000);

  it("flags a long hold with nothing to read (c)", async () => {
    const level = base([{ on: { start: true }, do: [{ freeze: true }, { wait: 6 }, { freeze: false }] }], {});
    const t = await traceStory("story-L001", manifest("story-L001"), { level });
    expect(t.failures.some((f) => f.check === "c")).toBe(true);
  }, 180_000);
});
