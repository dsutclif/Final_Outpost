import { describe, expect, it, vi } from "vitest";
import { createSim, type SimEvent, type State } from "@fo/sim";
import type { SkinStory, StoryAction, StoryLevel } from "@fo/skins";
import { StoryDirector, lineSeconds, type StarSlot, type StoryHost, type StoryToken, type StoryView } from "../src/story/director.js";

const UI = { missed: "Missed", tryAgain: "Again", keepPlaying: "Keep", seeResults: "Results", tapToContinue: "Tap" };
const storyOf = (level: StoryLevel): SkinStory => ({ ui: UI, speakers: { kiln: { name: "KILN", portrait: "kiln" }, pip: { name: "PIP" } }, levels: { x: level } });

const state = (over: Partial<State> = {}): State =>
  ({ tick: 0, over: false, player: { pos: { x: 0, y: 0 } }, objectives: [], stats: {}, ...over }) as unknown as State;

function harness(level: StoryLevel, replay = false) {
  const log: string[] = [];
  let tap: (() => void) | null = null;
  let retry: (() => void) | null = null, other: (() => void) | null = null;
  let slots: readonly StarSlot[] = [], current: string | null = null;
  const view: StoryView = {
    line: (l) => log.push(`line:${l.name}:${l.text}${l.portrait ? `:${l.portrait}` : ""}`),
    clearLine: () => log.push("clear"),
    card: (c) => log.push(`${c.day ? "day" : "card"}:${c.text}`),
    clearCard: () => log.push("cardoff"),
    onTap: (f) => { tap = f; },
    prompt: (p, r, o) => { log.push(`prompt:${p.text}:${p.other}`); retry = r; other = o; },
    clearPrompt: () => log.push("promptoff"),
    hud: (h) => log.push(`hud:${[...h].join()}`),
    goals: (s, c) => { slots = s; current = c; },
    dispose: () => log.push("disposed"),
  };
  const cam = { x: 10, y: 10, zoom: 1, follow: true };
  const host: StoryHost = {
    cam,
    entityAt: (id) => (id === "core" ? { x: 100, y: 100 } : null),
    film: vi.fn(() => Promise.resolve()),
    retry: vi.fn(),
    goalSettled: vi.fn(),
  };
  const d = new StoryDirector(storyOf(level), level, view, host, replay);
  return {
    d, log, cam, host,
    tap: () => { vi.setSystemTime(Date.now() + 1000); tap?.(); },
    earlyTap: () => { tap?.(); },
    hasTap: () => !!tap,
    retry: () => retry?.(), other: () => other?.(),
    slots: () => slots, current: () => current,
  };
}
const cue = (on: StoryLevel["cues"][number]["on"], ...actions: StoryAction[]) => ({ on, do: actions });
const levelOf = (...cues: StoryLevel["cues"]): StoryLevel => ({ goals: [], cues });

describe("story director cues", () => {
  it("fires on start, sim event with match, and only once", () => {
    const h = harness(levelOf(
      cue({ start: true }, { line: "hello", who: "kiln", seconds: 1 }),
      cue({ event: "joined", match: { role: "role.hauler" } }, { line: "pip", who: "pip", seconds: 1 }),
    ));
    h.d.update(16, state());
    expect(h.log).toContain("line:KILN:hello:kiln");
    h.d.update(1100, state());
    h.d.onEvent({ t: "joined", capture: 0, resident: 0, role: "role.other" } as SimEvent, state());
    expect(h.log.some((l) => l.startsWith("line:PIP"))).toBe(false);
    h.d.onEvent({ t: "joined", capture: 0, resident: 0, role: "role.hauler" } as SimEvent, state());
    expect(h.log.filter((l) => l.startsWith("line:PIP"))).toHaveLength(1);
    h.d.update(1100, state());
    h.d.onEvent({ t: "joined", capture: 1, resident: 1, role: "role.hauler" } as SimEvent, state());
    expect(h.log.filter((l) => l.startsWith("line:PIP"))).toHaveLength(1);
  });

  it("fires within a radius of an entity, and by sim ticks after another cue", () => {
    const h = harness(levelOf(
      { id: "a", on: { near: { entity: "core" }, r: 10 }, do: [{ hide: ["credits"] }] },
      cue({ after: "a", ticks: 30 }, { show: ["credits"] }),
    ));
    h.d.afterTick(state({ tick: 5, player: { pos: { x: 0, y: 0 } } } as Partial<State>));
    expect(h.log.join()).not.toContain("hud:credits");
    const near = { player: { pos: { x: 100_000, y: 100_000 } } } as Partial<State>;
    h.d.afterTick(state({ tick: 10, ...near }));
    expect(h.log.at(-1)).toBe("hud:credits");
    h.d.afterTick(state({ tick: 39, ...near }));
    expect(h.log.at(-1)).toBe("hud:credits");
    h.d.afterTick(state({ tick: 40, ...near }));
    expect(h.log.at(-1)).toBe("hud:");
  });

  it("hides HUD parts from the first frame", () => {
    expect(harness({ goals: [], cues: [], hide: ["credits", "fuel"] }).log).toEqual(["hud:credits,fuel"]);
  });
});

describe("story director freezing", () => {
  it("crew introductions queue: one per tap, frozen throughout, and a tap resumes play", () => {
    vi.useFakeTimers();
    const crew = (r: string, n: string) => cue({ event: "joined", match: { role: r } }, { crew: n, who: n });
    const h = harness(levelOf(crew("a", "rhee"), crew("b", "tam")));
    expect(h.d.frozen).toBe(false);
    h.d.onEvent({ t: "joined", capture: 0, resident: 0, role: "a" } as SimEvent, state());
    h.d.onEvent({ t: "joined", capture: 1, resident: 1, role: "b" } as SimEvent, state());
    expect(h.d.frozen).toBe(true);
    expect(h.log.filter((l) => l.startsWith("line:"))).toEqual(["line:rhee:rhee"]);
    h.tap();
    expect(h.d.frozen).toBe(true);
    expect(h.log.filter((l) => l.startsWith("line:"))).toEqual(["line:rhee:rhee", "line:tam:tam"]);
    h.tap();
    expect(h.d.frozen).toBe(false);
    expect(h.hasTap()).toBe(false);
    vi.useRealTimers();
  });

  it("ignores a tap in the first moment, so a walking finger cannot skip a line", () => {
    vi.useFakeTimers();
    const h = harness(levelOf(cue({ start: true }, { line: "x", tap: true })));
    h.d.update(16, state());
    expect(h.hasTap()).toBe(true);
    h.earlyTap();
    expect(h.d.frozen).toBe(true);
    h.tap();
    expect(h.d.frozen).toBe(false);
    vi.useRealTimers();
  });

  it("a forgotten freeze is released when the queue runs dry", () => {
    const h = harness(levelOf(cue({ start: true }, { freeze: true }, { line: "x", seconds: 1 })));
    h.d.update(16, state());
    expect(h.d.frozen).toBe(true);
    h.d.update(1100, state());
    expect(h.d.frozen).toBe(false);
  });

  it("cards freeze for their time and a tap ends them early", () => {
    vi.useFakeTimers();
    const h = harness(levelOf(cue({ start: true }, { card: "Bay 5", seconds: 2 }, { day: "DAY 4,023" })));
    h.d.update(16, state());
    expect(h.d.frozen).toBe(true);
    expect(h.log).toContain("card:Bay 5");
    h.d.update(2100, state());
    expect(h.log).toContain("day:DAY 4,023");
    h.tap();
    expect(h.d.frozen).toBe(false);
    vi.useRealTimers();
  });

  it("a film holds play until it ends", async () => {
    const h = harness(levelOf(cue({ start: true }, { film: "crash_open" })));
    h.d.update(16, state());
    expect(h.host.film).toHaveBeenCalledWith("crash_open");
    expect(h.d.frozen).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.d.frozen).toBe(false);
  });

  it("a camera beat pans with follow off, then hands back; a nudge doesn't freeze", () => {
    const h = harness(levelOf(cue({ start: true }, { camera: { to: { at: [20, 30] }, pan: 1, hold: 1, back: 1 } }, { camera: { to: { at: [20, 10] }, share: 0.5, pan: 0.5, hold: 0, back: 0.5, freeze: false } })));
    h.d.update(1, state());
    expect(h.cam.follow).toBe(false);
    expect(h.d.frozen).toBe(true);
    h.d.update(1000, state());
    expect(h.cam.x).toBeCloseTo(20);
    expect(h.cam.y).toBeCloseTo(30);
    h.d.update(1100, state());
    expect(h.cam.follow).toBe(true);
    h.d.update(1000, state()); // the second beat starts from wherever follow has the camera
    expect(h.cam.follow).toBe(false);
    expect(h.d.frozen).toBe(false);
  });

  it("requestCamera takes a beat from outside the data, and not on a replay", () => {
    const a = harness(levelOf());
    a.d.requestCamera({ to: { entity: "core" } });
    expect(a.cam.follow).toBe(false);
    const b = harness(levelOf(), true);
    b.d.requestCamera({ to: { entity: "core" } });
    expect(b.cam.follow).toBe(true);
  });
});

describe("story director replays", () => {
  it("drops beats and films, keeps lines and never freezes", () => {
    const h = harness(levelOf(cue({ start: true },
      { camera: { to: { at: [1, 1] } } }, { film: "f" }, { card: "c" }, { freeze: true }, { tap: true },
      { line: "kept", tap: true, seconds: 1 }, { crew: "hi", who: "pip" },
    )), true);
    h.d.update(16, state());
    expect(h.d.frozen).toBe(false);
    expect(h.host.film).not.toHaveBeenCalled();
    expect(h.cam.follow).toBe(true);
    expect(h.log).toContain("line::kept");
    h.d.update(1100, state());
    expect(h.d.frozen).toBe(false);
    expect(h.log).toContain("line:PIP:hi");
  });
});

describe("story director goals", () => {
  const goals = { goals: [{ id: "a" }, { id: "b", tryAgain: true }, { id: "c" }], cues: [] };
  const toks = (a: StoryToken["state"], b: StoryToken["state"], c: StoryToken["state"]): StoryToken[] =>
    [{ id: "a", state: a, label: "A" }, { id: "b", state: b, label: "B" }, { id: "c", state: c, label: "C" }];

  it("shows one at a time with all slots, a goal met early completing on its turn", () => {
    const h = harness(goals);
    h.d.syncGoals(toks("open", "done", "open"));
    expect(h.slots()).toEqual(["empty", "empty", "empty"]);
    expect(h.current()).toBe("A");
    h.d.update(16, state());
    expect(h.host.goalSettled).not.toHaveBeenCalled();
    h.d.syncGoals(toks("done", "done", "open"));
    h.d.update(16, state());
    expect(h.host.goalSettled).toHaveBeenCalledWith("A", true);
    expect(h.slots()).toEqual(["earned", "empty", "empty"]);
    expect(h.current()).toBe("B");
    h.d.update(800, state());
    expect(h.slots()).toEqual(["earned", "earned", "empty"]);
    expect(h.current()).toBe("C");
  });

  it("cracks a missed slot and moves on", () => {
    const h = harness(goals);
    h.d.syncGoals(toks("failed", "open", "open"));
    h.d.update(16, state());
    expect(h.slots()[0]).toBe("cracked");
    expect(h.current()).toBe("B");
    expect(h.host.goalSettled).toHaveBeenCalledWith("A", false);
    expect(h.log.some((l) => l.startsWith("prompt"))).toBe(false);
  });

  it("a hold goal waits for its action, its slot still showing", () => {
    const h = harness({ goals: [{ id: "a", hold: true }], cues: [cue({ event: "core_lit" }, { goal: "a" })] });
    h.d.syncGoals([{ id: "a", state: "open", label: "A" }]);
    expect(h.current()).toBeNull();
    expect(h.slots()).toEqual(["empty"]);
    expect(h.d.visibleTokens([{ id: "a", state: "open", label: "A" }])).toEqual([]);
    h.d.onEvent({ t: "core_lit", at: { x: 0, y: 0 } } as SimEvent, state());
    h.d.syncGoals([{ id: "a", state: "open", label: "A" }]);
    expect(h.current()).toBe("A");
  });

  it("the Try again prompt rises for a flagged goal only, freezes, and can be declined or taken", () => {
    const h = harness(goals);
    const miss = (id: string): SimEvent => ({ t: "objective", id, kind: "k", done: false, failed: true }) as SimEvent;
    h.d.onEvent(miss("a"), state());
    expect(h.d.frozen).toBe(false);
    h.d.onEvent(miss("b"), state());
    expect(h.d.frozen).toBe(true);
    expect(h.log).toContain("prompt:Missed:Keep");
    h.other();
    expect(h.d.frozen).toBe(false);
    h.d.onEvent(miss("b"), state());
    expect(h.log.filter((l) => l.startsWith("prompt:"))).toHaveLength(1);
    const j = harness(goals);
    j.d.onEvent(miss("b"), state());
    j.retry();
    expect(j.host.retry).toHaveBeenCalled();
  });

  it("a loss waits on last words and the prompt before the result screen", () => {
    const h = harness({ goals: [{ id: "b", tryAgain: true }], cues: [cue({ event: "level_end", match: { won: false } }, { line: "Not yet...", seconds: 1 })] });
    const over = state({ over: true, objectives: [{ id: "b", failed: true }] } as unknown as Partial<State>);
    h.d.onEvent({ t: "level_end", won: false, reason: "r" } as SimEvent, over);
    const show = vi.fn();
    expect(h.d.holdResult(show)).toBe(true);
    expect(h.log.some((l) => l.startsWith("prompt"))).toBe(false);
    h.d.update(1100, over);
    expect(h.log).toContain("prompt:Missed:Results");
    expect(show).not.toHaveBeenCalled();
    h.other();
    expect(show).toHaveBeenCalledOnce();
  });

  it("no hold when nothing is queued, so results come as usual", () => {
    expect(harness(goals).d.holdResult(() => {})).toBe(false);
  });
});

describe("story director and the sim", () => {
  it("calmUntilLit quiets alarms only until the core is first lit", () => {
    const h = harness({ goals: [], cues: [], calmUntilLit: true });
    expect(h.d.calm(state())).toBe(true);
    expect(h.d.calm(state({ stats: { litTick: 12 } } as unknown as Partial<State>))).toBe(false);
    expect(harness(levelOf()).d.calm(state())).toBe(false);
  });

  it("reading events and state leaves the sim's state untouched", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = new URL("../../../levels/golden/", import.meta.url);
    const file = readdirSync(dir).find((f) => f.endsWith(".json"))!;
    const a = createSim(JSON.parse(readFileSync(new URL(file, dir), "utf8")));
    const b = createSim(JSON.parse(readFileSync(new URL(file, dir), "utf8")));
    const h = harness({ goals: [{ id: "x" }], cues: [cue({ start: true }, { line: "hi" }, { freeze: true })] });
    for (let i = 0; i < 120; i++) {
      for (const e of a.step({ dx: 1, dy: 0 })) h.d.onEvent(e, a.state);
      h.d.afterTick(a.state);
      h.d.update(33, a.state);
      h.d.syncGoals([]);
      b.step({ dx: 1, dy: 0 });
    }
    expect(a.hash()).toBe(b.hash());
  });
});

describe("lineSeconds", () => {
  it("gives short lines two seconds and long ones time to read", () => {
    expect(lineSeconds("Boss?")).toBe(2);
    expect(lineSeconds("one two three four five six seven eight nine ten")).toBeCloseTo(3.5);
  });
});
