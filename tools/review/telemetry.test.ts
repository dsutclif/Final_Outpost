import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLimits } from "./lib.js";
import { aggregate, readBatches, telemetryCandidates, type RawEvent } from "./telemetry-core.js";

const L = loadLimits();
const T0 = Date.parse("2026-11-05T12:00:00Z");

let n = 0;
/** One event with the fields every event carries; `n` keeps timestamps distinct. */
function ev(kind: RawEvent["kind"], install: string, over: Record<string, unknown> = {}, np: "new" | "returning" | null = null): RawEvent {
  return { v: 2, kind, ts: T0 + ++n * 1000, install, session: `${install}-s1`, build: "b1", engine: "0.19.0", content: "0.18.0", np, ...over } as RawEvent;
}

function writeBatch(dir: string, day: string, name: string, events: unknown[]): void {
  mkdirSync(join(dir, "telemetry", day), { recursive: true });
  writeFileSync(join(dir, "telemetry", day, name), JSON.stringify({ v: 2, received: `${day}T10:00:00.000Z`, events }));
}

/** A pull folder: ten installs play s1-L001 (mostly 👎, reasons "too hard") and s1-L002 (mostly 👍), plus a perf problem on L001. */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "telemetry-"));
  const events: RawEvent[] = [];
  for (let i = 0; i < 10; i++) {
    const id = `install-${i}xxxx`;
    const np = i < 3 ? "new" : "returning";
    events.push(ev("new_player", id, { answer: np }, np));
    events.push(ev("session", id, { coldStartMs: 2000 + i * 100, tier: "mid", probeFps: 60, vw: 390, vh: 844, dpr: 3, standalone: i % 2 === 0, online: true, platform: i < 8 ? "ios" : "android", browser: "safari" }, np));
    for (const [lvl, thumb] of [["s1-L001", i < 7 ? "down" : "up"], ["s1-L002", i < 1 ? "down" : "up"]] as const) {
      events.push(ev("level_start", id, { levelId: lvl, attempt: 1 }, np));
      events.push(ev("level_end", id, { levelId: lvl, attempt: 1, outcome: i % 3 === 0 ? "lose" : "win", reason: "goal", ticks: 3000, quits: 0, stars: 2 }, np));
      events.push(ev("play_shape", id, { levelId: lvl, attempt: 1, outcome: "win", durS: 100, stillS: 20 + i, longestStillS: 4, distU: 800, acts: { gathered: 10, deposited: 12 }, firstRewardS: 6, rewardGapMaxS: lvl === "s1-L001" ? 45 : 12, sameRunMax: 7 }, np));
      events.push(ev("perf", id, { levelId: lvl, attempt: 1, outcome: "win", frames: 3000, medMs: 17, p95Ms: lvl === "s1-L001" ? 70 + i : 25, longFrames: 9, worstMs: 120, worstAfter: "wave_started" }, np));
      events.push(ev("rating", id, { levelId: lvl, attempt: 1, outcome: "win", thumb, chips: thumb === "down" && lvl === "s1-L001" ? ["too_hard"] : [] }, np));
    }
  }
  // a player who switches thumb: only the latest rating counts
  events.push(ev("rating", "install-0xxxx", { levelId: "s1-L002", attempt: 1, outcome: "win", thumb: "up", chips: [] }, "returning"));
  events.push(ev("error", "install-1xxxx", { msg: "TypeError: x is undefined", screen: "level" }, "returning"));
  events.push(ev("film", "install-1xxxx", { film: "crash_open", watchedS: 40, result: "ended", skipped: false }, "returning"));
  events.push(ev("film", "install-2xxxx", { film: "crash_open", watchedS: 6, result: "skipped", skipped: true }, "returning"));
  events.push(ev("lifecycle", "install-1xxxx", { what: "hidden", screen: "level" }, "returning"));
  const half = Math.floor(events.length / 2);
  writeBatch(dir, "2026-11-05", "1-aaaa.json", events.slice(0, half));
  writeBatch(dir, "2026-11-05", "2-bbbb.json", events.slice(half - 3)); // the retry that arrived twice overlaps three events
  mkdirSync(join(dir, "telemetry", "2026-11-06"), { recursive: true });
  writeFileSync(join(dir, "telemetry", "2026-11-06", "3-cccc.json"), "{ not json");
  writeFileSync(join(dir, "telemetry", "2026-11-06", "4-dddd.json"), JSON.stringify({ v: 1, events: [] }));
  return dir;
}

describe("reading batch files", () => {
  it("reads day folders, drops duplicates and events that are not events, and lists unreadable files", () => {
    const dir = fixture();
    writeBatch(dir, "2026-11-06", "5-eeee.json", [{ v: 2, kind: "mystery", ts: 1, install: "x", session: "y" }, "nope", ev("lifecycle", "install-9xxxx", { what: "visible", screen: "title" })]);
    const r = readBatches(dir);
    expect(r.files).toBe(5);
    expect(r.badFiles).toHaveLength(2);
    expect(r.badEvents).toBe(2);
    expect(r.duplicates).toBe(3);
    const ts = r.events.map((e) => e.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it("drops events before --since", () => {
    const dir = fixture();
    expect(readBatches(dir, T0 + 1e9).events).toHaveLength(0);
  });
});

describe("aggregate", () => {
  const agg = aggregate(readBatches(fixture()), "2026-11-06T02:00:00.000Z");

  it("counts plays, outcomes and installs per level", () => {
    const l = agg.levels["s1-L001"]!;
    expect(l.starts).toBe(10);
    expect(l.plays).toBe(10);
    expect(l.outcomes).toEqual({ lose: 4, win: 6 });
    expect(l.installs).toBe(10);
    expect(l.starsMean).toBe(2);
  });

  it("keeps the latest rating per player, level and attempt, with chips and new against returning", () => {
    const l1 = agg.levels["s1-L001"]!;
    expect(l1.ratings).toMatchObject({ up: 3, down: 7, total: 10, downShare: 0.7, chipsOnDown: { too_hard: 7 } });
    expect(l1.byNp.new).toEqual({ plays: 3, up: 0, down: 3 });
    expect(l1.byNp.returning).toEqual({ plays: 7, up: 3, down: 4 });
    const l2 = agg.levels["s1-L002"]!;
    expect(l2.ratings).toMatchObject({ up: 10, down: 0, downShare: 0 }); // install-0 switched to 👍
  });

  it("takes medians of play shape and frame times, and overall installs, sessions and devices", () => {
    const l1 = agg.levels["s1-L001"]!;
    expect(l1.shape!.plays).toBe(10);
    expect(l1.shape!.median["rewardGapMaxS"]).toBe(45);
    expect(l1.shape!.median["stillS"]).toBe(24.5);
    expect(l1.shape!.acts).toEqual({ deposited: 12, gathered: 10 });
    expect(l1.perf).toMatchObject({ samples: 10, medMs: 17, p95Ms: 74.5, p95MaxMs: 79, worstMsMax: 120, worstAfter: "wave_started" });
    expect(agg.levels["s1-L002"]!.perf!.p95Ms).toBe(25);
    const o = agg.overall;
    expect(o.installs).toBe(10);
    expect(o.sessions).toBe(10);
    expect(o.devices.platform).toEqual({ android: 2, ios: 8 });
    expect(o.devices.standalone).toEqual({ no: 5, yes: 5 });
    expect(o.newPlayer.installs).toEqual({ new: 3, returning: 7, unknown: 0 });
    expect(o.coldStartMs.n).toBe(10);
    expect(o.coldStartMs.median).toBe(2450);
    expect(o.ratings).toMatchObject({ total: 20, up: 13, down: 7 });
    expect(o.perf.byPlatform["ios"]!.samples).toBe(16);
    expect(o.errors.byScreen["level"]).toMatchObject({ n: 1, sample: "TypeError: x is undefined" });
    expect(o.films["crash_open"]).toMatchObject({ plays: 2, ended: 1, skipped: 1, watchedSMedian: 23 });
    expect(o.lifecycle).toEqual({ hidden: 1 });
    expect(o.window!.from < o.window!.to).toBe(true);
    expect(agg.generated).toBe("2026-11-06T02:00:00.000Z");
  });
});

describe("data candidates", () => {
  const agg = aggregate(readBatches(fixture()));
  const c = telemetryCandidates(agg, L);
  const fps = c.map((x) => x.fingerprint);

  it("flags a level with at least 5 ratings and 40% 👎, filed by its main reason", () => {
    expect(fps).toContain("cat10|s1-L001|rating|too_hard");
    expect(fps.some((f) => f.includes("s1-L002|rating"))).toBe(false);
    const x = c.find((y) => y.fingerprint === "cat10|s1-L001|rating|too_hard")!;
    expect(x).toMatchObject({ via: "data", category: 10, pillar: 3, levelId: "s1-L001", metric: { name: "downShare", value: 0.7, limit: 0.4 } });
  });

  it("does not flag a level with fewer than 5 ratings", () => {
    const small = structuredClone(agg);
    small.levels["s1-L001"]!.ratings = { up: 0, down: 4, total: 4, downShare: 1, chips: {}, chipsOnDown: {} };
    expect(telemetryCandidates(small, L).some((y) => y.fingerprint.includes("|rating|"))).toBe(false);
  });

  it("flags frame time over 50 ms at the 95th percentile, errors, and shape limits shared with the bots", () => {
    expect(fps).toContain("cat12|s1-L001|frame_time|p95");
    expect(fps.some((f) => f.includes("s1-L002|frame_time"))).toBe(false);
    expect(fps).toContain("cat12|*|error:level|uncaught");
    expect(fps).toContain("cat9|s1-L001|reward_gap|drought"); // same fingerprint the bots use: one issue, two sources
    expect(fps).not.toContain("cat9|s1-L002|reward_gap|drought");
  });

  it("raises data-health findings when ratings are few", () => {
    const sparse = structuredClone(agg);
    sparse.overall.ratings = { total: 4, up: 3, down: 1, perLevelEnd: 0.1 };
    expect(telemetryCandidates(sparse, L).map((x) => x.fingerprint)).toContain("cat18|*|data|few_ratings");
    const h = telemetryCandidates(sparse, L).find((x) => x.fingerprint === "cat18|*|data|few_ratings")!;
    expect(h).toMatchObject({ category: 18, pillar: null, via: "data" });
  });

  it("raises data-health findings for a low rating rate, missing frame times and too few new players", () => {
    const o = structuredClone(agg);
    o.overall.levelEnds = 200;
    o.overall.ratings = { total: 20, up: 15, down: 5, perLevelEnd: 0.1 - 0.001 };
    o.overall.byKind = { ...o.overall.byKind, perf: 10, play_shape: 200 };
    o.overall.newPlayer.installs = { new: 0, returning: 9, unknown: 1 };
    const f = telemetryCandidates(o, L).map((x) => x.fingerprint);
    expect(f).toContain("cat18|*|data|low_rating_rate");
    expect(f).toContain("cat18|*|data|missing_perf");
    expect(f).not.toContain("cat18|*|data|missing_play_shape");
    expect(f).toContain("cat18|*|data|few_new_players");
  });

  it("says so when no play data arrived, and when files could not be read", () => {
    const empty = aggregate({ events: [], files: 0, badFiles: [], badEvents: 0, duplicates: 0 });
    expect(telemetryCandidates(empty, L).map((x) => x.fingerprint)).toEqual(["cat18|*|data|no_events"]);
    expect(Object.keys(empty.levels)).toEqual([]);
    expect(empty.overall.window).toBeNull();
    const bad = aggregate({ events: readBatches(fixture()).events, files: 5, badFiles: ["a", "b"], badEvents: 0, duplicates: 0 });
    expect(telemetryCandidates(bad, L).map((x) => x.fingerprint)).toContain("cat18|*|data|unreadable_batches");
  });

  it("keeps numbers out of every fingerprint but the level id", () => {
    for (const f of fps) {
      const [, , subject, check] = f.split("|");
      expect(`${subject}|${check}`).not.toMatch(/(?<![A-Za-z_\d])\d/);
    }
  });
});
