import { FP, createSim } from "@fo/sim";
import { marsGreenhouse } from "@fo/skins";
import { describe, expect, it } from "vitest";
import level1 from "../../../levels/golden/proto-L001.json";
import { Reporter, deviceFacts, frameStats } from "../src/report.js";
import { MemoryStore, TELEMETRY_KINDS, type TelemetryEvent } from "../src/save.js";
import { TelemetryQueue } from "../src/telemetry.js";

const sink = () => { const rows: TelemetryEvent[] = []; return { rows, record: async (e: TelemetryEvent) => { rows.push(e); } }; };

describe("play data", () => {
  it("reports an attempt: start, end, play shape, perf, then its rating", () => {
    const out = sink();
    const r = new Reporter(out, () => ({ install: "inst", np: "new" }), "abc1234");
    r.levelStart("s1-L001", 2);
    const sim = createSim({ ...(level1 as object), seed: 1 });
    for (let t = 0; t < 90; t++) { r.tick(sim.state, sim.step({ dx: FP, dy: 0 })); r.frame(t === 40 ? 120 : 16.7); }
    r.levelEnd({ outcome: "lose", reason: "meter.lifeline", ticks: 90, quits: 0, stars: 0 });
    r.rate("down", ["boring"]);
    expect(out.rows.map((e) => e.kind)).toEqual(["level_start", "level_end", "play_shape", "perf", "rating"]);
    for (const e of out.rows) {
      expect(e).toMatchObject({ v: 2, install: "inst", np: "new", build: "abc1234", session: r.session });
      expect(TELEMETRY_KINDS).toContain(e.kind);
    }
    expect(out.rows[2]).toMatchObject({ levelId: "s1-L001", attempt: 2, durS: 3 });
    expect(out.rows[3]).toMatchObject({ frames: 90, longFrames: 1, worstMs: 120 });
    expect(out.rows[4]).toMatchObject({ levelId: "s1-L001", attempt: 2, outcome: "lose", thumb: "down", chips: ["boring"] });
  });

  it("counts leaving mid-level as a quit, once", () => {
    const out = sink();
    const r = new Reporter(out, () => ({ install: "i", np: "skip" }), "b");
    r.levelStart("a", 1);
    r.abandon(30);
    r.abandon(30);
    expect(out.rows.filter((e) => e.kind === "level_end")).toHaveLength(1);
    expect(out.rows[1]).toMatchObject({ outcome: "quit", reason: "left", np: null });
  });

  it("does not rate when no attempt has ended", () => {
    const out = sink();
    new Reporter(out, () => ({ install: "i", np: null }), "b").rate("up", []);
    expect(out.rows).toHaveLength(0);
  });

  it("summarises frame times", () => {
    expect(frameStats([10, 20, 30, 40, 200])).toEqual({ frames: 5, medMs: 30, p95Ms: 200, longFrames: 1, worstMs: 200 });
  });

  it("reduces the device to coarse facts", () => {
    const nav = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", maxTouchPoints: 5, onLine: true } as Navigator;
    const win = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, matchMedia: () => ({ matches: true }) } as unknown as Window;
    expect(deviceFacts(nav, win)).toEqual({ platform: "ios", browser: "safari", vw: 390, vh: 844, dpr: 3, standalone: true, online: true });
  });

  it("posts v2 batches, drops pre-v2 rows unsent, and retries after an error", async () => {
    const store = new MemoryStore();
    await store.appendTelemetry({ levelId: "old" } as unknown as TelemetryEvent);
    const ev = (n: number): TelemetryEvent => ({ v: 2, kind: "level_start", ts: n, install: "i", session: "s", build: "b", engine: "e", content: "c", np: null, levelId: `L${n}`, attempt: 1 });
    for (let i = 0; i < 150; i++) await store.appendTelemetry(ev(i));
    const bodies: { v: number; events: TelemetryEvent[] }[] = [];
    let fail = true;
    const q = new TelemetryQueue(store, undefined, async (_u, init) => {
      if (fail) { fail = false; return new Response("", { status: 503 }); }
      bodies.push(JSON.parse(String(init!.body)));
      return new Response("{}", { status: 200 });
    });
    (q as unknown as { url: string }).url = "/api/telemetry";
    expect(await q.flush()).toBe(false);
    expect(await q.flush()).toBe(true);
    expect(bodies.map((b) => b.events.length)).toEqual([100, 50]);
    expect(bodies[0]!.v).toBe(2);
    expect(bodies[0]!.events[0]).not.toHaveProperty("sent");
    expect((await store.allTelemetry()).every((r) => r.sent)).toBe(true);
    (q as unknown as { timer: ReturnType<typeof setTimeout> | null }).timer && clearTimeout((q as unknown as { timer: ReturnType<typeof setTimeout> }).timer);
  });

  it("has skin text for every prompt and chip", () => {
    const ui = marsGreenhouse.text.ui;
    for (const k of ["newPlayerTitle", "newPlayerYes", "newPlayerNo", "newPlayerSkip", "rateQuestion", "rateUp", "rateDown", "playDataNote", "resetPlayDataId", "settingsNewPlayer"]) expect(ui[k], k).toBeTruthy();
    for (const c of ["too_hard", "too_easy", "boring", "confusing", "looked_wrong", "laggy"]) expect(ui[`chip_${c}`], c).toBeTruthy();
  });
});
