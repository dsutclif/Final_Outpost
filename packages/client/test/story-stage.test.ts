import { describe, expect, it, vi } from "vitest";
import { FP, type SimEvent, type State } from "@fo/sim";
import type { SkinStory, StoryLevel } from "@fo/skins";
import { StoryDirector, type StoryHost, type StoryView } from "../src/story/director.js";

// r4 (Doug 2026-11-24): the stage step, state-driven guide rules and a closing scene that needs no walking.

const UI = { missed: "Missed", tryAgain: "Again", keepPlaying: "Keep", seeResults: "Results", tapToContinue: "Tap" };
const story = (level: StoryLevel): SkinStory => ({ ui: UI, speakers: { kiln: { name: "KILN" }, okafor: { name: "OKAFOR" }, sela: { name: "SELA" }, commander: { name: "CMDR" } }, levels: { x: level } });

const fp = (v: number): number => Math.round(v * FP);
const state = (over: Record<string, unknown> = {}): State =>
  ({ tick: 0, over: false, player: { pos: { x: fp(100), y: fp(100) }, stack: [] }, objectives: [], stats: {}, currency: 0, residents: [{ id: 7, origin: "start", pos: { x: fp(900), y: fp(100) } }], captures: [], hostiles: [], ...over }) as unknown as State;

function harness(level: StoryLevel, hostOver: Partial<StoryHost> = {}) {
  const log: string[] = [];
  let tap: (() => void) | null = null;
  const view: StoryView = {
    line: (l) => log.push(`line:${l.who ?? l.name}:${l.text}`),
    clearLine: () => log.push("clear"),
    card: (c) => log.push(`card:${c.text}`),
    clearCard: () => {},
    onTap: (f) => { tap = f; },
    prompt: () => {}, clearPrompt: () => {}, hud: () => {}, goals: () => {}, dispose: () => {},
  };
  const host: StoryHost = {
    cam: { x: 0, y: 0, zoom: 1, follow: true },
    entityAt: () => null,
    film: vi.fn((f: string) => { log.push(`film:${f}`); return Promise.resolve(); }),
    retry: vi.fn(), goalSettled: vi.fn(),
    ...hostOver,
  };
  const d = new StoryDirector(story(level), level, view, host, false);
  return { d, log, host, tap: () => { vi.setSystemTime(Date.now() + 1000); tap?.(); } };
}

const cast = { okafor: { person: 0 }, sela: { customer: 0 } } as const;

describe("the stage step", () => {
  it("walks the speaker in from the frame edge and holds the line until they have arrived", () => {
    vi.useFakeTimers();
    let drawn = { x: 900, y: 400 };
    const h = harness({ goals: [], cast, cues: [{ on: { start: true }, do: [{ stage: "okafor", by: [-16, 24] }, { line: "hello", who: "okafor" }] }] }, {
      inFrame: (p) => p.x < 500,
      drawnAt: () => drawn,
      entryFrom: () => ({ x: 480, y: 100 }),
    });
    h.d.update(16, state());
    // walking, not talking yet; play is held while they come in
    expect(h.log.some((l) => l.startsWith("line:"))).toBe(false);
    expect(h.d.frozen).toBe(true);
    const a = h.d.world.actors.find((x) => x.who === "okafor")!;
    expect(a.face).toBe(true);
    expect(a.from).toEqual({ x: 480, y: 100 });
    expect(a.to).toEqual({ x: 84, y: 124 });
    drawn = { x: 84, y: 124 };
    h.d.update(16, state());
    expect(h.log).toContain("line:okafor:hello");
    vi.useRealTimers();
  });

  it("starts the walk from where they stand when that is already on screen", () => {
    vi.useFakeTimers();
    const h = harness({ goals: [], cast, cues: [{ on: { start: true }, do: [{ stage: "okafor" }, { line: "hi", who: "okafor" }] }] }, {
      inFrame: () => true, drawnAt: () => ({ x: 200, y: 100 }), entryFrom: () => ({ x: 1, y: 1 }),
    });
    h.d.update(16, state());
    expect(h.d.world.actors[0]!.from).toBeUndefined();
    vi.useRealTimers();
  });

  it("gives up after the timeout so a blocked walk cannot hang the level", () => {
    vi.useFakeTimers();
    const h = harness({ goals: [], cast, cues: [{ on: { start: true }, do: [{ stage: "okafor" }, { line: "late", who: "okafor" }] }] }, {
      inFrame: () => false, drawnAt: () => ({ x: 900, y: 900 }), entryFrom: () => null,
    });
    h.d.update(16, state());
    expect(h.log.some((l) => l.startsWith("line:"))).toBe(false);
    for (let i = 0; i < 10; i++) h.d.update(1000, state());
    expect(h.log).toContain("line:okafor:late");
    vi.useRealTimers();
  });

  it("waits for a trader to be on screen with play running", () => {
    vi.useFakeTimers();
    let on = false;
    const h = harness({ goals: [], cast, cues: [{ on: { start: true }, do: [{ stage: "sela" }, { line: "I'm Sela", who: "sela" }] }] }, { inFrame: () => on });
    const st = state({ sales: { pos: { x: fp(500), y: fp(500) }, queue: [{ id: 0, pos: { x: fp(500), y: fp(500) } }], leaving: [] } });
    h.d.update(16, st);
    expect(h.d.frozen).toBe(false);
    expect(h.log.some((l) => l.startsWith("line:"))).toBe(false);
    on = true;
    h.d.update(16, st);
    expect(h.log).toContain("line:sela:I'm Sela");
    vi.useRealTimers();
  });

  it("stages an off-screen speaker before their line when the level asks for it (autoStage), and leaves others alone", () => {
    vi.useFakeTimers();
    const lvl = (autoStage: boolean): StoryLevel => ({ goals: [], cast, autoStage, cues: [{ on: { start: true }, do: [{ line: "from afar", who: "okafor" }] }] });
    const host = { inFrame: (p: { x: number }) => p.x < 500, drawnAt: () => ({ x: 900, y: 100 }), entryFrom: () => ({ x: 520, y: 100 }) };
    const on = harness(lvl(true), host);
    on.d.update(16, state());
    expect(on.d.world.actors.some((x) => x.who === "okafor")).toBe(true);
    expect(on.log.some((l) => l.startsWith("line:"))).toBe(false);
    const off = harness(lvl(false), host);
    off.d.update(16, state());
    expect(off.log).toContain("line:okafor:from afar");
    expect(off.d.world.actors).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe("guide rules", () => {
  const level: StoryLevel = {
    goals: [], cast,
    guideRules: [
      { when: [{ fired: "done" }, { credits: 120 }], to: { at: [5, 5] } },
      { when: [{ fired: "done" }, { carrying: "res.food" }], to: { at: [1, 1] } },
      { when: [{ not: "done" }], to: { at: [9, 9] } },
    ],
    cues: [{ on: { start: true }, do: [{ guide: true, to: { at: [3, 3] } }] }, { id: "done", on: { event: "go" }, do: [] }],
  };
  it("the first matching rule sets the arrows each frame; none matching leaves the cue's arrow", () => {
    const h = harness(level);
    h.d.update(16, state());
    expect(h.d.world.guideTo).toEqual({ x: 9, y: 9 });
    h.d.onEvent({ t: "go" } as unknown as SimEvent, state());
    h.d.update(16, state());
    // no rule matches (nothing carried, no credits): the cue's own arrow stands, not the stale rule
    expect(h.d.world.guideTo).toEqual({ x: 3, y: 3 });
    h.d.update(16, state({ player: { pos: { x: 0, y: 0 }, stack: ["res.food"] } }));
    expect(h.d.world.guideTo).toEqual({ x: 1, y: 1 });
    h.d.update(16, state({ currency: 120, player: { pos: { x: 0, y: 0 }, stack: ["res.food"] } }));
    expect(h.d.world.guideTo).toEqual({ x: 5, y: 5 });
  });
  it("a rule with `off` turns the arrows off, and coins waiting at the register count", () => {
    const h = harness({ goals: [], guideRules: [{ when: [{ coinsWaiting: true }], to: { at: [2, 2] } }, { when: [{ goal: "g", is: "done" }], off: true }], cues: [] });
    h.d.update(16, state());
    expect(h.d.world.guideTo).toBeNull();
    h.d.update(16, state({ sales: { pileN: 3, queue: [], leaving: [] } }));
    expect(h.d.world.guideTo).toEqual({ x: 2, y: 2 });
  });
});

describe("guide conditions for a machine output and a full shelf", () => {
  const level: StoryLevel = { goals: [], cues: [], guideRules: [
    { when: [{ shelfFull: true }], to: { at: [8, 8] } },
    { when: [{ outputWaiting: "conv.food_processor" }], to: { at: [4, 4] } },
  ] };
  const conv = (out: number, type = "conv.food_processor") => ({ converters: [{ type, out, inQ: [] }] });
  it("outputWaiting leads to the machine only while finished goods wait in a converter of that type", () => {
    const h = harness(level);
    h.d.update(16, state(conv(0)));
    expect(h.d.world.guideTo).toBeNull();
    h.d.update(16, state(conv(1, "conv.other")));
    expect(h.d.world.guideTo).toBeNull();
    h.d.update(16, state(conv(2)));
    expect(h.d.world.guideTo).toEqual({ x: 4, y: 4 });
    h.d.update(16, state(conv(0)));
    expect(h.d.world.guideTo).toBeNull();
  });
  it("shelfFull holds only when every shelf of the kiosk is at its cap", () => {
    const h = harness(level);
    const sales = (shelf: Record<string, number>) => ({ converters: [], sales: { pileN: 0, queue: [], leaving: [], sells: ["a", "b"], shelf } });
    h.d.update(16, state(sales({ a: 8, b: 7 })));
    expect(h.d.world.guideTo).toBeNull();
    h.d.update(16, state(sales({ a: 8, b: 8 })));
    expect(h.d.world.guideTo).toEqual({ x: 8, y: 8 });
  });
});

describe("a closing scene that needs no walking", () => {
  it("queues the whole scene when the main goal is done and holds the result until it is told", async () => {
    vi.useFakeTimers();
    const level: StoryLevel = { goals: [], cast, cues: [{ id: "hubDone", on: { goal: "main", is: "done" }, ordered: true, do: [
      { freeze: true }, { vehicle: "buggy", path: [{ at: [0, 0] }, { last: "player", by: [70, 20] }], seconds: 1 }, { wait: 1 }, { vehicleOff: "buggy" },
      { line: "Congratulations", who: "sela" }, { film: "chip_handoff" }, { line: "A chip", who: "sela" },
    ] }] };
    const h = harness(level);
    h.d.update(16, state());
    const ended = state({ over: true });
    h.d.onEvent({ t: "objective", id: "main", done: true, failed: false } as unknown as SimEvent, ended);
    h.d.onEvent({ t: "level_end", won: true } as unknown as SimEvent, ended);
    expect(h.d.world.vehicles).toHaveLength(1);
    let shown = 0;
    expect(h.d.holdResult(() => { shown++; })).toBe(true);
    // the sim has stopped (no afterTick), yet the scene plays on frame updates alone
    h.d.update(1100, ended);
    expect(h.d.world.vehicles).toHaveLength(0);
    expect(h.log).toContain("line:sela:Congratulations");
    h.tap();
    await Promise.resolve();
    h.d.update(16, ended);
    expect(h.log).toContain("film:chip_handoff");
    h.d.update(16, ended);
    expect(h.log).toContain("line:sela:A chip");
    expect(shown).toBe(0);
    h.tap();
    expect(shown).toBe(1);
    vi.useRealTimers();
  });
});

describe("a vehicle rider with no sim trader (Sela at the end of a level)", () => {
  const sales = (queue: unknown[]) => ({ queue, leaving: [], pos: { x: fp(220), y: fp(830) } });
  const level: StoryLevel = { goals: [], cast, cues: [{ id: "end", on: { start: true }, do: [{ vehicle: "buggy", path: [{ at: [0, 0] }, { last: "player", by: [70, 20] }], seconds: 1, rider: "sela" }] }] };

  it("is drawn by the vehicle (solo, facing the commander) and stands at its park point, not at the kiosk", () => {
    const h = harness(level);
    const st = state({ sales: sales([]) });
    h.d.update(16, st);
    const v = h.d.world.vehicles[0]!;
    expect(v.rider).toBe(0);
    expect(v.solo).toEqual({ faceX: 100, faceZ: 100 });
    expect(h.d.castAt("sela", st)).toEqual({ x: 170, y: 120 });
  });

  it("keeps the kiosk fallback and no solo flag while a sim trader exists for her", () => {
    const h = harness(level);
    const st = state({ sales: sales([{ id: 0, pos: { x: fp(300), y: fp(310) } }]) });
    h.d.update(16, st);
    expect(h.d.world.vehicles[0]!.solo).toBeUndefined();
    expect(h.d.castAt("sela", st)).toEqual({ x: 300, y: 310 });
  });
});
