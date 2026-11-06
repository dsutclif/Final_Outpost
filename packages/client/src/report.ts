import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION, type SimEvent, type State } from "@fo/sim";
import { createShape, shapeResult, shapeTick, type ShapeAcc } from "@fo/bots";
import type { NewPlayer, TelemetryEvent, TelemetryKind } from "./save.js";

// Builds play-data events (docs/review/CONTRACT.md §1) from what the app sees: one attempt at a time,
// with its play shape (still time, walking, repeats, reward gaps; the same measure the review bots
// use) and its frame times. Nothing here reads anything personal.

export interface ReportSink { record(e: TelemetryEvent): Promise<void> }

/** Frames longer than this count as long (a visible hitch). */
export const LONG_FRAME_MS = 50;
/** Error events per app launch, so a loop of failures cannot flood the queue. */
const MAX_ERRORS = 20;
/** Frame samples kept per attempt (about 20 minutes at 60 fps). */
const MAX_FRAMES = 72_000;

export interface AttemptEnd { outcome: "win" | "lose" | "quit" | "skip"; reason: string; ticks: number; quits: number; stars: number }

export class Reporter {
  readonly session = randomId();
  private cur: { levelId: string; attempt: number; shape: ShapeAcc; frames: number[]; worstMs: number; worstAfter: string; lastEvent: string } | null = null;
  /** The attempt the result card is showing, for its rating. */
  private ended: { levelId: string; attempt: number; outcome: string } | null = null;
  private errors = 0;

  constructor(private readonly sink: ReportSink, private readonly ids: () => { install: string; np: NewPlayer | null }, private readonly build: string) {}

  emit(kind: TelemetryKind, fields: Record<string, unknown> = {}): void {
    const { install, np } = this.ids();
    void this.sink.record({
      ...fields, v: 2, kind, ts: Date.now(), install, session: this.session, build: this.build,
      engine: ENGINE_VERSION, content: CONTENT_VERSION, np: np === "skip" ? null : np,
    });
  }

  levelStart(levelId: string, attempt: number): void {
    this.cur = { levelId, attempt, shape: createShape(), frames: [], worstMs: 0, worstAfter: "", lastEvent: "" };
    this.ended = null;
    this.emit("level_start", { levelId, attempt });
  }

  tick(state: State, events: readonly SimEvent[]): void {
    const c = this.cur;
    if (!c) return;
    shapeTick(c.shape, state, events);
    const last = events[events.length - 1];
    if (last) c.lastEvent = last.t;
  }

  /** One rendered frame while the level is being played. */
  frame(ms: number): void {
    const c = this.cur;
    if (!c || !(ms > 0) || c.frames.length >= MAX_FRAMES) return;
    c.frames.push(ms);
    if (ms > c.worstMs) { c.worstMs = ms; c.worstAfter = c.lastEvent; }
  }

  levelEnd(end: AttemptEnd): void {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    const base = { levelId: c.levelId, attempt: c.attempt, outcome: end.outcome };
    this.emit("level_end", { ...base, reason: end.reason, ticks: end.ticks, quits: end.quits, stars: end.stars });
    this.emit("play_shape", { ...base, ...shapeResult(c.shape) });
    if (c.frames.length) this.emit("perf", { ...base, ...frameStats(c.frames), worstAfter: c.worstAfter });
    this.ended = base;
  }

  /** The player left the attempt some other way (a new level, the title): it counts as a quit. */
  abandon(ticks: number): void {
    if (this.cur) this.levelEnd({ outcome: "quit", reason: "left", ticks, quits: 0, stars: 0 });
  }

  rate(thumb: "up" | "down", chips: readonly string[]): void {
    if (this.ended) this.emit("rating", { ...this.ended, thumb, chips: [...chips] });
  }

  error(msg: string, screen: string): void {
    if (++this.errors > MAX_ERRORS) return;
    this.emit("error", { msg: msg.slice(0, 200), screen });
  }
}

export function frameStats(frames: readonly number[]): { frames: number; medMs: number; p95Ms: number; longFrames: number; worstMs: number } {
  const s = [...frames].sort((a, b) => a - b);
  const at = (q: number): number => Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]! * 10) / 10;
  return { frames: s.length, medMs: at(0.5), p95Ms: at(0.95), longFrames: s.filter((m) => m > LONG_FRAME_MS).length, worstMs: Math.round(s[s.length - 1]! * 10) / 10 };
}

/** Coarse device facts for the session event: no user-agent string leaves the device. */
export function deviceFacts(nav: Navigator, win: Window): { platform: string; browser: string; vw: number; vh: number; dpr: number; standalone: boolean; online: boolean } {
  const ua = nav.userAgent;
  const platform = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) ? "ios" : /Android/.test(ua) ? "android" : /Windows|Macintosh|Linux|CrOS/.test(ua) ? "desktop" : "other";
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua) ? "chrome" : /FxiOS|Firefox\//.test(ua) ? "firefox" : /Safari\//.test(ua) ? "safari" : "other";
  const standalone = win.matchMedia?.("(display-mode: standalone)").matches || (nav as Navigator & { standalone?: boolean }).standalone === true;
  return { platform, browser, vw: win.innerWidth, vh: win.innerHeight, dpr: Math.round(win.devicePixelRatio * 100) / 100, standalone: !!standalone, online: nav.onLine };
}

export function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
