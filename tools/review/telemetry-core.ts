import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { candidate, mean, median, percentile, round, type Candidate, type Limits } from "./lib.js";

// The pure part of pnpm review:telemetry (the command is telemetry.ts): read the Blob batch files the
// endpoint stored (CONTRACT §1: {"v":2,"received":…,"events":[…]}), aggregate them per level and
// overall, and turn what the data says into candidate findings (categories 6, 9, 10, 12, 18).

export const KINDS = ["new_player", "session", "level_start", "level_end", "rating", "play_shape", "perf", "film", "lifecycle", "error"] as const;
export type Kind = (typeof KINDS)[number];

export interface RawEvent {
  v: 2;
  kind: Kind;
  ts: number;
  install: string;
  session: string;
  build?: string;
  engine?: string;
  content?: string;
  np?: "new" | "returning" | null;
  [field: string]: unknown;
}

export interface ReadResult {
  events: RawEvent[];
  files: number;
  badFiles: string[];
  badEvents: number;
  duplicates: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".json")) yield p;
  }
}

/** A well-formed event, or null. The endpoint already refuses the rest; this guards against hand-copied files. */
export function checkEvent(e: unknown): RawEvent | null {
  if (!isObj(e) || e["v"] !== 2 || !(KINDS as readonly string[]).includes(e["kind"] as string)) return null;
  if (num(e["ts"]) === undefined || str(e["install"]) === undefined || str(e["session"]) === undefined) return null;
  return e as RawEvent;
}

/**
 * Every `*.json` batch under `dir` (day folders included). Files that are not batches are listed, not
 * fatal. An event that arrives twice (a retried POST stored twice) counts once. `sinceMs` drops older events.
 */
export function readBatches(dir: string, sinceMs = 0): ReadResult {
  const res: ReadResult = { events: [], files: 0, badFiles: [], badEvents: 0, duplicates: 0 };
  const seen = new Set<string>();
  for (const file of walk(dir)) {
    res.files++;
    let body: unknown;
    try { body = JSON.parse(readFileSync(file, "utf8")); } catch { res.badFiles.push(file); continue; }
    if (!isObj(body) || body["v"] !== 2 || !Array.isArray(body["events"])) { res.badFiles.push(file); continue; }
    for (const raw of body["events"] as unknown[]) {
      const e = checkEvent(raw);
      if (!e) { res.badEvents++; continue; }
      if (e.ts < sinceMs) continue;
      const key = JSON.stringify(e);
      if (seen.has(key)) { res.duplicates++; continue; }
      seen.add(key);
      res.events.push(e);
    }
  }
  res.events.sort((a, b) => a.ts - b.ts);
  return res;
}

// ---------- aggregation ----------

export type NpGroup = "new" | "returning" | "unknown";
const npOf = (e: RawEvent): NpGroup => (e.np === "new" || e.np === "returning" ? e.np : "unknown");

export interface LevelAgg {
  starts: number;
  /** Attempts that ended (level_end), any outcome. */
  plays: number;
  outcomes: Record<string, number>;
  installs: number;
  /** Mean stars over won attempts (null when none won). */
  starsMean: number | null;
  ratings: { up: number; down: number; total: number; downShare: number | null; chips: Record<string, number>; chipsOnDown: Record<string, number> };
  byNp: Record<NpGroup, { plays: number; up: number; down: number }>;
  shape: { plays: number; median: Record<string, number>; stillShare: number; acts: Record<string, number> } | null;
  perf: { samples: number; medMs: number; p95Ms: number; p95MaxMs: number; longFrames: number; worstMsMax: number; worstAfter: string } | null;
}

export interface Overall {
  events: number;
  byKind: Record<string, number>;
  files: number;
  badFiles: number;
  badEvents: number;
  duplicates: number;
  window: { from: string; to: string } | null;
  installs: number;
  sessions: number;
  devices: { platform: Record<string, number>; browser: Record<string, number>; tier: Record<string, number>; standalone: Record<string, number>; online: Record<string, number> };
  newPlayer: { installs: Record<NpGroup, number>; answers: Record<string, number> };
  coldStartMs: { n: number; median: number; p95: number };
  probeFps: { n: number; median: number };
  levelEnds: number;
  ratings: { total: number; up: number; down: number; perLevelEnd: number };
  perf: { samples: number; p95Ms: number; byPlatform: Record<string, { samples: number; p95Ms: number }> };
  errors: { total: number; byScreen: Record<string, { n: number; sample: string }> };
  lifecycle: Record<string, number>;
  films: Record<string, { plays: number; ended: number; skipped: number; failed: number; watchedSMedian: number }>;
}

export interface TelemetryAgg { v: 1; generated: string; levels: Record<string, LevelAgg>; overall: Overall }

const bump = (m: Record<string, number>, k: string, by = 1): void => { m[k] = (m[k] ?? 0) + by; };
const group = <T>(xs: readonly T[], key: (x: T) => string | undefined): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const x of xs) { const k = key(x); if (k === undefined) continue; const a = m.get(k) ?? []; a.push(x); m.set(k, a); }
  return m;
};
const nums = (es: readonly RawEvent[], f: string): number[] => es.map((e) => num(e[f])).filter((x): x is number => x !== undefined);
const sortKeys = <T>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** The latest rating per install + session + level + attempt (a player may change it). */
export function latestRatings(events: readonly RawEvent[]): RawEvent[] {
  const m = new Map<string, RawEvent>();
  for (const e of events) {
    if (e.kind !== "rating" || str(e["levelId"]) === undefined) continue;
    const k = `${e.install}|${e.session}|${String(e["levelId"])}|${String(e["attempt"])}`;
    const prev = m.get(k);
    if (!prev || e.ts >= prev.ts) m.set(k, e);
  }
  return [...m.values()];
}

const SHAPE_FIELDS = ["durS", "stillS", "longestStillS", "distU", "firstRewardS", "rewardGapMaxS", "sameRunMax"] as const;

export function aggregate(read: ReadResult, generated = new Date().toISOString()): TelemetryAgg {
  const ev = read.events;
  const ofKind = (k: Kind): RawEvent[] => ev.filter((e) => e.kind === k);
  const sessions = ofKind("session"), starts = ofKind("level_start"), ends = ofKind("level_end"), shapes = ofKind("play_shape"), perfs = ofKind("perf");
  const ratings = latestRatings(ev);
  const levelIds = new Set<string>();
  for (const e of [...starts, ...ends, ...ratings, ...shapes, ...perfs]) { const id = str(e["levelId"]); if (id) levelIds.add(id); }

  const levels: Record<string, LevelAgg> = {};
  for (const id of [...levelIds].sort()) {
    const mine = (es: RawEvent[]): RawEvent[] => es.filter((e) => e["levelId"] === id);
    const lEnds = mine(ends), lRat = mine(ratings), lShape = mine(shapes), lPerf = mine(perfs);
    const outcomes: Record<string, number> = {};
    for (const e of lEnds) bump(outcomes, str(e["outcome"]) ?? "unknown");
    const wins = lEnds.filter((e) => e["outcome"] === "win");
    const chips: Record<string, number> = {}, chipsOnDown: Record<string, number> = {};
    let up = 0, down = 0;
    const byNp: LevelAgg["byNp"] = { new: { plays: 0, up: 0, down: 0 }, returning: { plays: 0, up: 0, down: 0 }, unknown: { plays: 0, up: 0, down: 0 } };
    for (const e of lEnds) byNp[npOf(e)].plays++;
    for (const r of lRat) {
      const thumb = r["thumb"];
      if (thumb === "up") { up++; byNp[npOf(r)].up++; } else if (thumb === "down") { down++; byNp[npOf(r)].down++; } else continue;
      for (const c of Array.isArray(r["chips"]) ? (r["chips"] as unknown[]) : []) if (typeof c === "string") { bump(chips, c); if (thumb === "down") bump(chipsOnDown, c); }
    }
    let shape: LevelAgg["shape"] = null;
    if (lShape.length > 0) {
      const med: Record<string, number> = {};
      for (const f of SHAPE_FIELDS) med[f] = round(median(nums(lShape, f)), 1);
      const actKeys = [...new Set(lShape.flatMap((e) => (isObj(e["acts"]) ? Object.keys(e["acts"]) : [])))].sort();
      const acts: Record<string, number> = {};
      for (const k of actKeys) acts[k] = round(median(lShape.map((e) => (isObj(e["acts"]) ? num(e["acts"][k]) ?? 0 : 0))), 1);
      const share = lShape.map((e) => (num(e["durS"]) ?? 0) > 0 ? (num(e["stillS"]) ?? 0) / (num(e["durS"]) as number) : 0);
      shape = { plays: lShape.length, median: med, stillShare: round(median(share), 3), acts };
    }
    let perf: LevelAgg["perf"] = null;
    if (lPerf.length > 0) {
      const after = new Map<string, number>();
      for (const e of lPerf) { const a = str(e["worstAfter"]); if (a) after.set(a, (after.get(a) ?? 0) + 1); }
      const top = [...after.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      perf = {
        samples: lPerf.length, medMs: round(median(nums(lPerf, "medMs")), 1), p95Ms: round(median(nums(lPerf, "p95Ms")), 1),
        p95MaxMs: round(Math.max(0, ...nums(lPerf, "p95Ms")), 1), longFrames: round(median(nums(lPerf, "longFrames")), 1),
        worstMsMax: round(Math.max(0, ...nums(lPerf, "worstMs")), 1), worstAfter: top ? top[0] : "",
      };
    }
    const installs = new Set([...mine(starts), ...lEnds].map((e) => e.install));
    levels[id] = {
      starts: mine(starts).length, plays: lEnds.length, outcomes: sortKeys(outcomes), installs: installs.size,
      starsMean: wins.length > 0 ? round(mean(nums(wins, "stars")), 2) : null,
      ratings: { up, down, total: up + down, downShare: up + down > 0 ? round(down / (up + down), 3) : null, chips: sortKeys(chips), chipsOnDown: sortKeys(chipsOnDown) },
      byNp, shape, perf,
    };
  }

  // devices: one entry per session event (the last word per install+session)
  const sessKey = new Map<string, RawEvent>();
  for (const e of sessions) sessKey.set(`${e.install}|${e.session}`, e);
  const dev = { platform: {} as Record<string, number>, browser: {} as Record<string, number>, tier: {} as Record<string, number>, standalone: {} as Record<string, number>, online: {} as Record<string, number> };
  for (const e of sessKey.values()) {
    bump(dev.platform, str(e["platform"]) ?? "unknown");
    bump(dev.browser, str(e["browser"]) ?? "unknown");
    bump(dev.tier, String(e["tier"] ?? "unknown"));
    bump(dev.standalone, e["standalone"] === true ? "yes" : "no");
    bump(dev.online, e["online"] === false ? "offline" : "online");
  }

  // New player: per install, the latest answer; else the np its events carry
  const installIds = new Set(ev.map((e) => e.install));
  const answers: Record<string, number> = {};
  const answerOf = new Map<string, string>();
  for (const e of ofKind("new_player")) { const a = str(e["answer"]); if (a) { answerOf.set(e.install, a); } }
  for (const a of answerOf.values()) bump(answers, a);
  const npInstalls: Record<NpGroup, number> = { new: 0, returning: 0, unknown: 0 };
  for (const id of installIds) {
    const a = answerOf.get(id);
    if (a === "new" || a === "returning") { npInstalls[a]++; continue; }
    const seenNp = ev.find((e) => e.install === id && (e.np === "new" || e.np === "returning"))?.np;
    npInstalls[seenNp === "new" || seenNp === "returning" ? seenNp : "unknown"]++;
  }

  // frame times by platform: perf events carry no device, so join through the session
  const platformOf = (e: RawEvent): string => str(sessKey.get(`${e.install}|${e.session}`)?.["platform"]) ?? "unknown";
  const perfBy = group(perfs, platformOf);
  const byPlatform: Overall["perf"]["byPlatform"] = {};
  for (const [p, es] of [...perfBy.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) byPlatform[p] = { samples: es.length, p95Ms: round(median(nums(es, "p95Ms")), 1) };

  const errs = ofKind("error");
  const byScreen: Overall["errors"]["byScreen"] = {};
  for (const e of errs) {
    const k = str(e["screen"]) ?? "unknown";
    const cur = byScreen[k] ?? { n: 0, sample: String(e["msg"] ?? "").slice(0, 200) };
    cur.n++;
    byScreen[k] = cur;
  }

  const life: Record<string, number> = {};
  for (const e of ofKind("lifecycle")) bump(life, str(e["what"]) ?? "unknown");

  const films: Overall["films"] = {};
  for (const [f, es] of [...group(ofKind("film"), (e) => str(e["film"])).entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    films[f] = {
      plays: es.length, ended: es.filter((e) => e["result"] === "ended").length, skipped: es.filter((e) => e["result"] === "skipped").length,
      failed: es.filter((e) => e["result"] === "failed").length, watchedSMedian: round(median(nums(es, "watchedS")), 1),
    };
  }

  const byKind: Record<string, number> = {};
  for (const e of ev) bump(byKind, e.kind);
  const cold = nums([...sessKey.values()], "coldStartMs");
  const fps = nums([...sessKey.values()], "probeFps");
  const ups = ratings.filter((r) => r["thumb"] === "up").length, downs = ratings.filter((r) => r["thumb"] === "down").length;
  const overall: Overall = {
    events: ev.length, byKind: sortKeys(byKind), files: read.files, badFiles: read.badFiles.length, badEvents: read.badEvents, duplicates: read.duplicates,
    window: ev.length > 0 ? { from: new Date(ev[0]!.ts).toISOString(), to: new Date(ev[ev.length - 1]!.ts).toISOString() } : null,
    installs: installIds.size,
    sessions: new Set(ev.map((e) => `${e.install}|${e.session}`)).size,
    devices: { platform: sortKeys(dev.platform), browser: sortKeys(dev.browser), tier: sortKeys(dev.tier), standalone: sortKeys(dev.standalone), online: sortKeys(dev.online) },
    newPlayer: { installs: npInstalls, answers: sortKeys(answers) },
    coldStartMs: { n: cold.length, median: round(median(cold), 0), p95: round(percentile(cold, 0.95), 0) },
    probeFps: { n: fps.length, median: round(median(fps), 1) },
    levelEnds: ends.length,
    ratings: { total: ups + downs, up: ups, down: downs, perLevelEnd: ends.length > 0 ? round((ups + downs) / ends.length, 3) : 0 },
    perf: { samples: perfs.length, p95Ms: round(median(nums(perfs, "p95Ms")), 1), byPlatform },
    errors: { total: errs.length, byScreen: sortKeys(byScreen) },
    lifecycle: sortKeys(life),
    films,
  };
  return { v: 1, generated, levels, overall };
}

// ---------- candidates ----------

/** The category each 👎 follow-up chip points at. */
export const CHIP_CATEGORY: Readonly<Record<string, number>> = { too_hard: 10, too_easy: 10, boring: 9, confusing: 6, looked_wrong: 2, laggy: 12 };

const fmt = (x: number, d = 1): string => String(round(x, d));
const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function telemetryCandidates(agg: TelemetryAgg, L: Limits): Candidate[] {
  const out: Candidate[] = [];
  const T = L.telemetry;
  const add = (c: Omit<Parameters<typeof candidate>[0], "via">): void => { out.push(candidate({ via: "data", ...c })); };

  for (const [id, a] of Object.entries(agg.levels)) {
    const r = a.ratings;
    if (r.total >= T.ratings.minRatings && r.downShare !== null && r.downShare >= T.ratings.downShare) {
      // The follow-up chip most players gave on a 👎 decides what kind of finding this is.
      const top = Object.entries(r.chipsOnDown).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
      const dominant = top && top[1] >= 2 && top[1] >= 0.3 * r.down ? top[0] : null;
      const category = dominant ? CHIP_CATEGORY[dominant] ?? 9 : 9;
      const chipText = Object.entries(r.chipsOnDown).map(([c, n]) => `${c} ${n}`).join(", ") || "no reasons given";
      const np = (["new", "returning"] as const).map((g) => `${g} ${a.byNp[g].up}👍/${a.byNp[g].down}👎`).join(", ");
      add({ category, severity: T.ratings.severity, levelId: id, subject: "rating", check: dominant ?? "disliked",
        title: `${id}: ${pct(r.downShare)} of ${r.total} ratings are 👎${dominant ? ` (${dominant.replace(/_/g, " ")})` : ""}`,
        detail: `${r.up} 👍 and ${r.down} 👎 over ${a.plays} plays; reasons on the 👎: ${chipText}; by player: ${np}.`,
        metric: { name: "downShare", value: r.downShare, limit: T.ratings.downShare } });
    }
    if (a.perf && a.perf.samples >= T.perf.minSamples && a.perf.p95Ms > T.perf.p95Ms) {
      add({ category: 12, severity: T.perf.severity, levelId: id, subject: "frame_time", check: "p95",
        title: `${id}: 95th-percentile frame time ${fmt(a.perf.p95Ms, 0)} ms on players' devices`,
        detail: `Median of ${a.perf.samples} attempts: p95 ${a.perf.p95Ms} ms, median frame ${a.perf.medMs} ms, ${a.perf.longFrames} frames over 50 ms; worst ${a.perf.worstMsMax} ms${a.perf.worstAfter ? `, usually after "${a.perf.worstAfter}"` : ""}.`,
        metric: { name: "p95Ms", value: a.perf.p95Ms, limit: T.perf.p95Ms } });
    }
    if (a.shape && a.shape.plays >= T.realShape.minPlays) {
      const m = a.shape.median;
      if ((m["rewardGapMaxS"] ?? 0) > L.rewardDrought.gapS) {
        add({ category: L.rewardDrought.category, severity: T.realShape.severity, levelId: id, subject: "reward_gap", check: "drought",
          title: `${id}: players go ${fmt(m["rewardGapMaxS"] ?? 0, 0)} s without a reward`,
          detail: `Median longest gap between rewards over ${a.shape.plays} attempts is ${m["rewardGapMaxS"]} s (limit ${L.rewardDrought.gapS} s).`,
          metric: { name: "rewardGapMaxS", value: m["rewardGapMaxS"] ?? 0, limit: L.rewardDrought.gapS } });
      }
      if ((m["longestStillS"] ?? 0) > L.standingStill.realLongestStillS && a.shape.stillShare > L.standingStill.realStillShare) {
        add({ category: L.standingStill.category, severity: T.realShape.severity, levelId: id, subject: "standing_still", check: "still",
          title: `${id}: players stand still ${pct(a.shape.stillShare)} of the time`,
          detail: `Over ${a.shape.plays} attempts the median player stood still ${pct(a.shape.stillShare)} of the level, longest stretch ${m["longestStillS"]} s (limits ${pct(L.standingStill.realStillShare)}, ${L.standingStill.realLongestStillS} s).`,
          metric: { name: "stillShare", value: a.shape.stillShare, limit: L.standingStill.realStillShare } });
      }
      if ((m["sameRunMax"] ?? 0) > L.repetition.deliveries) {
        add({ category: L.repetition.category, severity: T.realShape.severity, levelId: id, subject: "repetition", check: "same_deliveries",
          title: `${id}: ${fmt(m["sameRunMax"] ?? 0, 0)} identical deliveries in a row`,
          detail: `Median longest run of the same delivery over ${a.shape.plays} attempts is ${m["sameRunMax"]} (limit ${L.repetition.deliveries}).`,
          metric: { name: "sameRunMax", value: m["sameRunMax"] ?? 0, limit: L.repetition.deliveries } });
      }
    }
  }

  const o = agg.overall;
  if (o.coldStartMs.n >= T.coldStart.minSessions && o.coldStartMs.median > T.coldStart.medianMs) {
    add({ category: 12, severity: T.coldStart.severity, levelId: "*", subject: "cold_start", check: "slow",
      title: `Cold start takes ${fmt(o.coldStartMs.median / 1000)} s to first input (median)`,
      detail: `Over ${o.coldStartMs.n} sessions: median ${o.coldStartMs.median} ms, 95th percentile ${o.coldStartMs.p95} ms (limit ${T.coldStart.medianMs} ms).`,
      metric: { name: "coldStartMs", value: o.coldStartMs.median, limit: T.coldStart.medianMs } });
  }
  for (const [screen, e] of Object.entries(o.errors.byScreen)) {
    add({ category: 12, severity: T.errors.severity, levelId: "*", subject: `error:${screen}`, check: "uncaught",
      title: `Uncaught errors on the "${screen}" screen`,
      detail: `${e.n} error events; for example: ${e.sample}`,
      metric: { name: "errors", value: e.n, limit: 0 } });
  }

  // data health (category 18)
  const H = T.health;
  const health = (check: string, title: string, detail: string, metric: { name: string; value: number; limit: number }, severity: 1 | 2 | 3 | 4 = 1): void =>
    add({ category: 18, severity, levelId: "*", subject: "data", check, title, detail, metric });
  if (o.events === 0) {
    health("no_events", "No play data arrived", `${o.files} batch files read, ${o.badFiles} unreadable.`, { name: "events", value: 0, limit: 1 }, 2);
  } else {
    if (o.badFiles > 0) health("unreadable_batches", `${o.badFiles} stored batches could not be read`, `${o.badFiles} of ${o.files} batch files were not {"v":2,"events":[…]}.`, { name: "badFiles", value: o.badFiles, limit: 0 }, 2);
    if (o.ratings.total < H.minRatingsTotal) {
      health("few_ratings", `Only ${o.ratings.total} ratings so far`, `${o.ratings.total} ratings from ${o.installs} installs and ${o.levelEnds} finished attempts (at least ${H.minRatingsTotal} wanted).`, { name: "ratings", value: o.ratings.total, limit: H.minRatingsTotal });
    } else if (o.levelEnds >= H.minLevelEnds && o.ratings.perLevelEnd < H.ratingRateMin) {
      health("low_rating_rate", `Only ${pct(o.ratings.perLevelEnd)} of finished attempts get a rating`, `${o.ratings.total} ratings over ${o.levelEnds} level ends (at least ${pct(H.ratingRateMin)} wanted).`, { name: "ratingRate", value: o.ratings.perLevelEnd, limit: H.ratingRateMin });
    }
    if (o.installs >= H.minInstalls) {
      const answered = o.newPlayer.installs.new + o.newPlayer.installs.returning;
      const share = answered > 0 ? o.newPlayer.installs.new / answered : 0;
      if (share < H.newPlayerShareMin) health("few_new_players", `New players are ${pct(share)} of installs that answered`, `${o.newPlayer.installs.new} new against ${o.newPlayer.installs.returning} returning installs (at least ${pct(H.newPlayerShareMin)} wanted).`, { name: "newPlayerShare", value: share, limit: H.newPlayerShareMin });
      const unanswered = o.newPlayer.installs.unknown / o.installs;
      if (unanswered > H.unansweredShareMax) health("new_player_unanswered", `${pct(unanswered)} of installs never answered New player?`, `${o.newPlayer.installs.unknown} of ${o.installs} installs have no answer.`, { name: "unansweredShare", value: unanswered, limit: H.unansweredShareMax });
    }
    if (o.levelEnds >= H.minLevelEnds) {
      for (const [kind, label] of [["perf", "frame times"], ["play_shape", "play shape"]] as const) {
        const cover = (o.byKind[kind] ?? 0) / o.levelEnds;
        if (cover < H.perfCoverageMin) health(`missing_${kind}`, `Only ${pct(cover)} of finished attempts report ${label}`, `${o.byKind[kind] ?? 0} ${kind} events for ${o.levelEnds} level ends (at least ${pct(H.perfCoverageMin)} wanted).`, { name: `${kind}Coverage`, value: cover, limit: H.perfCoverageMin });
      }
    }
  }
  return out;
}
