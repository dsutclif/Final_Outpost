import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { marsGreenhouse, type StoryLevel } from "@fo/skins";
import { traceStory, type TraceFailure } from "../src/story/trace.js";

// r4 (Doug 2026-11-24): the story sequence trace plays Levels 1-5 headless through the real director and sim and fails on
// (a) a world speaker off screen when their line shows, (b) anyone moving during a line, (c) play held > 4 s with
// nothing to read, (d) an arrow at something done or hidden, (e) the level ending with closing cues still waiting or
// the result card before the story queue is empty, (f) anything thrown, (g) a speaker, the commander or a buggy inside a built
// building, (h) the two speakers of a line not facing each other. See packages/client/src/story/trace.ts.
//
// ALLOW: known failures, each with a written reason. Phase B lanes fix the level and DELETE the entry; nothing ships
// until every "phase B" entry is gone. Match = level + check + cue + a piece of the message.

const PHASE_B = "phase B: known sequencing fault found by the r4 trace, to be fixed in the level's data";
const ALLOW: readonly { level: string; check: TraceFailure["check"]; cue: string; has: string; why: string }[] = [
  // Doug 2026-11-25: Sela is parked at exactly her level 3 end spot from the first frame (no drive-in). From the commander's start the buggy sits
  // near the right edge of a 390 px phone (her figure and her lines are in frame); the trace models it as a drive-in, so it is allowed here.
  // Rhee used to speak from off screen here (the walk-in did not run while a line was up); now the director waits for her to walk in, so the hub
  // glance and her walk are one 4.7 s held stretch. Both are real beats: the hub is shown, then she arrives beside the commander.
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
  it("flags the commander and a vehicle inside a built hub while a line is up (g)", async () => {
    // Level 3's closing before the walk-out: the commander stays on the hub pad and the buggy parks beside him, inside the hub's body
    const real = marsGreenhouse.story!.levels["story-L003"]!;
    const level: StoryLevel = {
      ...real,
      cues: real.cues.map((c) => c.id !== "hubDone" ? c : {
        ...c,
        do: c.do.filter((a) => !("walk" in a)).map((a) => "vehicle" in a ? { ...a, path: [{ last: "player", by: [160, 70] }, { last: "player", by: [74, 26] }] } : a),
      }),
    };
    const t = await traceStory("story-L003", manifest("story-L003"), { level });
    const g = t.failures.filter((f) => f.check === "g").map((f) => f.message);
    expect(g.some((m) => m.startsWith("commander stands inside a built struct.landmark"))).toBe(true);
    expect(g.some((m) => m.startsWith("vehicle buggy stands inside a built struct.landmark"))).toBe(true);
  }, 180_000);

  const base = (cues: StoryLevel["cues"], cast: StoryLevel["cast"]): StoryLevel => ({ goals: [], cues, ...(cast ? { cast } : {}) });

  it("flags a speaker off screen (a) and a closing cue that can never fire (e)", async () => {
    const level = base([
      { id: "open", on: { start: true }, do: [{ line: "I am far away.", who: "far" }] },
      { on: { near: { at: [5, 5] }, r: 3, after: "open" }, do: [{ line: "Never.", who: "kiln" }] },
    ], { far: { at: [5, 5] } });
    const t = await traceStory("story-L001", manifest("story-L001"), { level });
    expect(t.failures.some((f) => f.check === "a" && f.message.includes("far speaks off screen"))).toBe(true);
    expect(t.failures.some((f) => f.check === "e" && f.message.includes("can never fire"))).toBe(true);
  }, 180_000);

  it("flags a commander who keeps facing his walk direction while Sela talks (h)", async () => {
    // the old renderer: a speaker faces the way they last walked. Level 3's closing walks the commander south-west out of the hub
    const t = await traceStory("story-L003", manifest("story-L003"), { faceTalk: false });
    const h = t.failures.filter((f) => f.check === "h" && f.cue === "hubDone").map((f) => f.message);
    expect(h.some((m) => m.includes("commander faces") && m.includes("off the sela") && m.includes("Congratulations"))).toBe(true);
    // with the conversation facing modelled every level is clean (also asserted per level above)
    const ok = await traceStory("story-L003", manifest("story-L003"));
    expect(ok.failures.filter((f) => f.check === "h")).toEqual([]);
  }, 180_000);

  it("flags a long hold with nothing to read (c)", async () => {
    const level = base([{ on: { start: true }, do: [{ freeze: true }, { wait: 6 }, { freeze: false }] }], {});
    const t = await traceStory("story-L001", manifest("story-L001"), { level });
    expect(t.failures.some((f) => f.check === "c")).toBe(true);
  }, 180_000);
});
