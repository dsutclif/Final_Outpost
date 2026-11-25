/// <reference lib="dom" />
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { parseArgs, type Args, cropRegion, plain, analyzeCaption, analyzeLineHold, analyzeLineGoals, analyzeLineOrder, analyzeLineSight, analyzeSpeakerSeen, analyzeCues, gatesFor, type StoryGate, analyzeSample, continuityHits, deltaE, deuteranopia, errorHits, fingerprintOf, frameHits, frameStats, meanLuminance, parseColour, toCandidate, Tracker, type Candidate, type Finding, type Hit, type Limits } from "./probe-core.js";
import type { Box, CueSample, FilmEnd, FrameRec, ReviewApi, Sample, StorySnapshot } from "./probe-types.js";

// pnpm review:probe -- --out <dir> --levels <id,...> [--story <id,...>] [--base <url>] [--throttle 4]
//
// Plays levels in a real browser at phone size (375x812, device pixel ratio 2) and measures what the screen
// shows: HUD and label boxes, where models stand, how the story caption sits against its speaker, frame cost.
// The page side is packages/client/src/dev/review.ts (window.R); the judging is probe-core.ts with the
// limits in probe-limits.json. Writes <out>/probe/<levelId>/summary.json, shots/*.png and <out>/candidates-probe.json
// (docs/review/CONTRACT.md sections 3 and 4). Starts its own vite server on a free port from 5197 unless --base.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const TPS = 30;

// ------------------------------------------------------------------ the dev server

async function freePort(from: number): Promise<number> {
  for (let p = from; p < from + 200; p++) {
    const ok = await new Promise<boolean>((res) => {
      const s = createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error(`no free port from ${from}`);
}

async function startVite(): Promise<{ url: string; stop: () => void }> {
  const client = join(root, "packages/client");
  // vite's `exports` blocks vite/bin/vite.js, so use the JS API (the package root is exported).
  const viteEntry = createRequire(join(client, "package.json")).resolve("vite");
  const vite = (await import(pathToFileURL(viteEntry).href)) as { createServer(c: object): Promise<{ listen(): Promise<unknown>; close(): Promise<void> }> };
  const port = await freePort(5200);
  const server = await vite.createServer({ root: client, configFile: join(client, "vite.config.ts"), server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "warn" });
  await server.listen();
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { void server.close(); } }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  await server.close();
  throw new Error(`vite did not come up on ${url}`);
}

// ------------------------------------------------------------------ the browser

const GL_ARGS = ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

interface Run {
  page: Page;
  ctx: BrowserContext;
  cdp: CDPSession;
  errors: string[];
  notch: boolean;
}

async function open(browser: Browser, base: string, a: Args): Promise<Run> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(page);
  if (a.throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: a.throttle });
  // a notch and a home bar, as an iPhone has them; older Chromium builds lack the override and run without
  let notch = false;
  if (a.notch) {
    try { await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: { top: 59, bottom: 34, left: 0, right: 0 } } as never); notch = true; } catch { notch = false; }
  }
  await page.goto(base, { waitUntil: "load" });
  await ready(page);
  return { page, ctx, cdp, errors, notch };
}

/** Answer the New player prompt (Skip) if it is up, then wait for the probes to load. */
async function ready(page: Page, ms = 60_000): Promise<void> {
  const skip = page.locator("button[data-a=skip]");
  await Promise.race([skip.waitFor({ timeout: ms }).catch(() => undefined), page.waitForFunction(() => !!window.R, null, { timeout: ms })]);
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForFunction(() => !!window.R, null, { timeout: ms });
}

declare global { interface Window { R: ReviewApi; __fo?: { debugScreen: string } } }

// ------------------------------------------------------------------ shots and results

const pad4 = (n: number): string => String(Math.max(0, Math.round(n))).padStart(4, "0");
/** A file name for a picture; a long name keeps a short hash of the whole, so two findings whose names only differ late never share a file. */
const safe = (s: string): string => { const c = s.replace(/[^a-zA-Z0-9._-]+/g, "-"); return c.length <= 40 ? c : `${c.slice(0, 32)}-${createHash("md5").update(s).digest("hex").slice(0, 6)}`; };

interface LevelResult {
  levelId: string;
  track: "main" | "story";
  ok: boolean;
  error?: string;
  simSeconds: number;
  wallSeconds: number;
  samples: number;
  notch: boolean;
  throttle: number;
  outcome: { over: boolean; won: boolean | null; reason: string | null } | null;
  frames: ReturnType<typeof frameStats>;
  errors: string[];
  shots: string[];
  findings: (Finding & { evidence: string[] })[];
  extras: Record<string, unknown>;
}

class Shots {
  readonly list: string[] = [];
  /** Pictures the browser would not give (software rendering can sit on "waiting for fonts" past any timeout): a data-health note, never a failed level. */
  readonly failed: string[] = [];
  /** Fingerprints whose problem was off screen when found: no picture, and the card says why. */
  readonly offScreen = new Set<string>();
  private flagged = 0;
  private broken = 0;
  constructor(private readonly page: Page, private readonly dir: string, private readonly rel: string, private readonly cap: number) {}

  /** A picture at CSS pixel size; returns its path relative to the output folder, or null once the flagged cap is reached. */
  async take(name: string, force = false): Promise<string | null> {
    if (!force && this.flagged >= this.cap) return null;
    // after two timeouts in a row the page cannot paint at all; stop paying 15 s for each further picture
    if (this.broken >= 2) { this.failed.push(name); return null; }
    if (!force) this.flagged++;
    const file = `${safe(name)}.png`;
    mkdirSync(join(this.dir, "shots"), { recursive: true });
    try {
      await this.page.screenshot({ path: join(this.dir, "shots", file), scale: "css", timeout: 15_000 });
      this.broken = 0;
    } catch (e) {
      this.broken++;
      this.failed.push(`${name}: ${String((e as Error).message).slice(0, 120)}`);
      return null;
    }
    const rel = `${this.rel}/shots/${file}`;
    if (!this.list.includes(rel)) this.list.push(rel);
    return rel;
  }

  /**
   * A picture of one problem: the element's box outlined and labelled in the page, the full frame taken, a close-up crop
   * with some context cut from the same frame, the outline removed again. Returns [crop, full] (paths relative to the
   * output folder) and the box; null once the flagged cap is reached or the browser would not paint.
   */
  async takeMarked(name: string, box: Box, label: string): Promise<Evidence | null> {
    if (this.flagged >= this.cap) return null;
    if (this.broken >= 2) { this.failed.push(name); return null; }
    this.flagged++;
    const base = safe(name);
    const view = this.page.viewportSize() ?? { width: 375, height: 812 };
    mkdirSync(join(this.dir, "shots"), { recursive: true });
    try {
      await this.page.evaluate(({ b, text }) => {
        const o = document.createElement("div");
        o.id = "probe-mark";
        const w = Math.max(6, b.x1 - b.x0), h = Math.max(6, b.y1 - b.y0);
        o.style.cssText = `position:fixed;left:${b.x0}px;top:${b.y0}px;width:${w}px;height:${h}px;box-sizing:border-box;border:3px solid #ff00dd;box-shadow:0 0 0 1px #fff,inset 0 0 0 1px #fff;pointer-events:none;z-index:2147483647`;
        const t = document.createElement("span");
        t.textContent = text;
        t.style.cssText = `position:absolute;left:-3px;${b.y0 < 22 ? "top:100%" : "bottom:100%"};background:#ff00dd;color:#fff;font:700 11px/14px system-ui,sans-serif;padding:0 4px;white-space:nowrap`;
        o.append(t);
        document.body.append(o);
      }, { b: box, text: label });
      let buf: Buffer;
      try {
        buf = await this.page.screenshot({ scale: "device", timeout: 15_000 });
        this.broken = 0;
      } catch (e) {
        this.broken++;
        this.failed.push(`${name}: ${String((e as Error).message).slice(0, 120)}`);
        return null;
      }
      const sharp = (await import("sharp")).default;
      const meta = await sharp(buf).metadata();
      const k = (meta.width ?? view.width) / view.width;
      const r = cropRegion(box, { w: view.width, h: view.height });
      await sharp(buf).resize(view.width, view.height).png().toFile(join(this.dir, "shots", `${base}.png`));
      await sharp(buf).extract({ left: Math.round(r.x0 * k), top: Math.round(r.y0 * k), width: Math.max(1, Math.round((r.x1 - r.x0) * k)), height: Math.max(1, Math.round((r.y1 - r.y0) * k)) }).png().toFile(join(this.dir, "shots", `${base}-crop.png`));
    } finally {
      await this.page.evaluate(() => document.getElementById("probe-mark")?.remove()).catch(() => undefined);
    }
    const paths = [`${this.rel}/shots/${base}-crop.png`, `${this.rel}/shots/${base}.png`];
    for (const x of paths) if (!this.list.includes(x)) this.list.push(x);
    return { paths, box };
  }

  /** The finding's own picture: marked when the check knows where the problem is, a plain full frame otherwise. */
  async evidenceFor(f: Finding, name: string): Promise<Evidence | null> {
    // a problem that sits off screen cannot be shown: no picture beats one that shows something else
    if (f.box && !onScreen(f.box, this.page.viewportSize() ?? { width: 375, height: 812 })) { this.offScreen.add(f.fingerprint); return null; }
    if (f.box) { const m = await this.takeMarked(name, f.box, f.check); if (m) return m; }
    const p = await this.take(name);
    return p ? { paths: [p] } : null;
  }
}

/** At least half of the box is inside the screen. */
function onScreen(b: Box, v: { width: number; height: number }): boolean {
  const a = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
  return Math.max(0, Math.min(b.x1, v.width) - Math.max(b.x0, 0)) * Math.max(0, Math.min(b.y1, v.height) - Math.max(b.y0, 0)) / a >= 0.5;
}

/** A finding's pictures: [close-up crop, full frame] or [full frame], and the outlined box when there is one. */
interface Evidence { paths: string[]; box?: Box }

/** Console and page errors have no clock of their own: watch for new ones after every step and picture the moment each first shows. */
async function watchErrors(run: Run, levelId: string, shots: Shots, evidence: Map<string, Evidence>, seen: Set<string>): Promise<void> {
  const errs = [...(await run.page.evaluate(() => window.R.errors()).catch(() => [] as string[])), ...run.errors];
  for (const hit of errorHits(errs)) {
    const fp = fingerprintOf(hit.cat, levelId, hit.subject, hit.check);
    if (seen.has(fp) || seen.size >= 6) continue;
    seen.add(fp);
    const p = await shots.take(`err-${hit.subject}`, true);
    if (p) evidence.set(fp, { paths: [p] });
  }
}

// ------------------------------------------------------------------ a level on the bot

async function playLevel(run: Run, levelId: string, a: Args, L: Limits, outDir: string, rel: string, result: LevelResult): Promise<void> {
  const { page } = run;
  const t0 = Date.now();
  const dir = join(outDir, "probe", levelId);
  const shots = new Shots(page, dir, rel, L.shots.perLevel);
  if (!(await page.evaluate((id) => window.R.play(id), levelId))) throw new Error(`no such level: ${levelId}`);
  await page.evaluate(() => window.R.drive("good"));
  // the game's own frame loop sits out while the runner steps the sim by hand: ticks come only from the runner, so samples are exact
  await page.evaluate(() => window.R.visibility(false));
  const tracker = new Tracker(levelId);
  const evidence = new Map<string, Evidence>();
  const checkpoints = [...L.shots.checkpointSeconds];
  let last: string | null = null;
  const every = L.sampleEveryTicks;
  let tick = 0;
  let outcome: LevelResult["outcome"] = null;
  const warm = L.warmupSeconds * TPS;
  let frameSeen = 0, frameShots = 0;
  const cpus: number[] = [];
  const worstByCause = new Map<string, number>();
  const errSeen = new Set<string>();

  for (let n = 0; Date.now() - t0 < a.wall * 1000; n++) {
    // let the GPU finish the last picture, so a frame's cost is not time spent waiting behind it
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const st = await page.evaluate((k) => window.R.stepBot(k), every);
    if (!st) throw new Error("the bot lost the level");
    tick = st.tick;
    outcome = { over: st.over, won: st.won, reason: st.reason };
    const s: Sample | null = await page.evaluate(() => window.R.snap());
    if (!s) break;
    result.samples++;
    if (s.tick >= warm) {
      const hits = analyzeSample(s, L, false);
      for (const f of tracker.observe((s.tick * 1000) / TPS, hits)) {
        const ev = await shots.evidenceFor(f, `t${pad4(s.tick / TPS)}-${f.check}-${f.subject}`);
        if (ev) evidence.set(f.fingerprint, ev);
      }
    }
    // a stutter has a moment: when a frame is the longest yet for its cause, picture it now
    const fl = await page.evaluate((from) => window.R.frames(from), frameSeen);
    for (const fr of fl.frames) {
      frameSeen++;
      cpus.push(fr.cpu);
      if (frameSeen <= L.frame.warmupFrames || fr.cpu <= L.frame.longMs) continue;
      const med = [...cpus].sort((x, y) => x - y)[Math.floor(cpus.length / 2)] ?? 0;
      if (fr.cpu <= L.frame.hitchRatio * med) continue;
      const cause = fr.ev.length ? fr.ev[fr.ev.length - 1]! : fr.last || "none";
      if (fr.cpu <= (worstByCause.get(cause) ?? 0) * 1.2 || frameShots >= 12) continue;
      worstByCause.set(cause, fr.cpu);
      frameShots++;
      const p = await shots.take(`frame-${cause}`, true);
      if (p) evidence.set(fingerprintOf(12, levelId, plain(`frame.${cause}`), "longframe"), { paths: [p] });
    }
    await watchErrors(run, levelId, shots, evidence, errSeen);
    const secs = s.tick / TPS;
    if (checkpoints.length && secs >= checkpoints[0]!) { last = await shots.take(`t${pad4(checkpoints.shift()!)}`, true); }
    if (st.over || secs >= a.seconds) break;
  }
  await page.evaluate(() => window.R.visibility(true));
  result.simSeconds = Math.round((tick / TPS) * 10) / 10;
  result.outcome = outcome;
  last = last ?? (await shots.take("tend", true));
  void last;

  // frame cost and errors close the level
  const { frames } = await page.evaluate(() => window.R.frames());
  result.frames = frameStats(frames, L);
  const inPage = await page.evaluate(() => window.R.errors());
  result.errors = [...new Set([...inPage, ...run.errors])].slice(0, 40);
  const end = (tick * 1000) / TPS + 1;
  // A finding's picture is the one taken at its own moment (first confirmed; for a stutter or console error, when it
  // happened) or none: the card then says "no single moment". Never an unrelated checkpoint or end frame.
  for (const h of [...frameHits(frames, L, a.throttle), ...errorHits(result.errors)]) tracker.observe(end, [h]);
  result.findings = withEvidence(tracker.findings(), evidence, shots);
  result.shots = shots.list;
  if (shots.failed.length) result.extras["screenshotsFailed"] = shots.failed;
  result.wallSeconds = Math.round((Date.now() - t0) / 100) / 10;
}

/** Attach each finding's own pictures (and the outlined box); no picture, no box. */
function withEvidence(list: Finding[], evidence: Map<string, Evidence>, shots: Shots, extra: Partial<Finding> = {}): LevelResult["findings"] {
  return list.map((f) => {
    const ev = evidence.get(f.fingerprint);
    const { box: _drop, ...rest } = f;
    void _drop;
    const off = !ev && shots.offScreen.has(f.fingerprint) ? { detail: `${f.detail}. It was off screen when the check found it, so there is no picture of it.` } : {};
    return { ...rest, ...extra, ...off, ...(ev?.box ? { box: ev.box } : {}), evidence: ev?.paths ?? [] };
  });
}

// ------------------------------------------------------------------ interruption and colour-blind passes

/** The app goes to the background and comes back, then the page reloads; both mid-level. */
async function interruption(run: Run, levelId: string, L: Limits, shots: Shots, base: string): Promise<{ hits: Hit[]; info: Record<string, unknown> }> {
  const { page } = run;
  const hits: Hit[] = [];
  const info: Record<string, unknown> = {};
  await page.evaluate((id) => window.R.play(id), levelId);
  await page.evaluate(() => window.R.drive("good"));
  await page.evaluate(() => window.R.stepBot(60));
  await page.waitForTimeout(1500);
  // measured in one call with the hide itself, so no frame can slip in between
  const { before, framesBefore } = await page.evaluate(() => { const b = window.R.snap()!, n = window.R.frames().total; window.R.visibility(false); return { before: b, framesBefore: n }; });
  await page.waitForTimeout(2500);
  const hidden = (await page.evaluate(() => window.R.snap()))!;
  const drift = hidden.tick - before.tick;
  info["tickDriftWhileHidden"] = drift;
  if (drift > L.resume.tickDriftWhileHidden) hits.push(h("hidden-sim-runs", 13, 3, "app.hidden", "The sim keeps running while the app is in the background", `${drift} ticks passed in 2.5 s while the page was hidden (limit ${L.resume.tickDriftWhileHidden}); a phone would drain the battery and the player would come back to a different game`, "ticks", drift, L.resume.tickDriftWhileHidden));
  await page.evaluate(() => window.R.visibility(true));
  await page.waitForTimeout(2500);
  const { frames } = await page.evaluate((from) => window.R.frames(from), framesBefore);
  const after = frames.filter((f) => f.t > 0).slice(0);
  const cpu = Math.max(0, ...after.slice(0, 6).map((f: FrameRec) => f.cpu));
  info["resumeFirstFramesCpuMs"] = cpu;
  if (cpu > L.resume.spikeMs) hits.push(h("resume-spike", 13, 2, "app.resume", "A long frame when the app comes back from the background", `${Math.round(cpu)} ms of JavaScript in the first frames after resume (limit ${L.resume.spikeMs} ms)`, "frameMs", cpu, L.resume.spikeMs));
  const resumed = (await page.evaluate(() => window.R.snap()))!;
  info["resumedTick"] = resumed.tick;
  if (resumed.screen !== before.screen) hits.push(h("resume-screen", 13, 3, "app.resume.screen", "The screen changed while the app was in the background", `Before: ${before.screen}, after resume: ${resumed.screen}`, "changed", 1, 0));
  await shots.take("resume", true);
  // reload
  const t = Date.now();
  await page.reload({ waitUntil: "load" });
  await ready(page);
  const ms = Date.now() - t;
  info["reloadReadyMs"] = ms;
  if (ms > L.resume.reloadReadyMs) hits.push(h("reload-slow", 13, 2, "app.reload", "Reloading takes a long time to reach a usable screen", `${ms} ms from reload to the app answering (limit ${L.resume.reloadReadyMs} ms)`, "ms", ms, L.resume.reloadReadyMs));
  const screen = await page.evaluate(() => window.__fo?.debugScreen ?? "?");
  info["screenAfterReload"] = screen;
  await shots.take("reload", true);
  void base;
  return { hits, info };
}

function h(check: string, cat: number, severity: 1 | 2 | 3 | 4, subject: string, title: string, detail: string, metric: string, value: number, limit: number): Hit {
  return { check, cat, severity, subject, title, detail, metric: { name: metric, value, limit }, seconds: 0, track: "main" };
}

/** The picture through a deuteranopia filter, and the palette pairs that stop being tellable apart. */
async function colourBlind(run: Run, L: Limits, shots: Shots): Promise<{ hits: Hit[]; info: Record<string, unknown> }> {
  const { page } = run;
  const hits: Hit[] = [];
  await page.evaluate(() => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("id", "cvd-defs");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.innerHTML = '<filter id="cvd" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="0.29275 0.70725 0 0 0  0.29275 0.70725 0 0 0  -0.02234 0.02234 1 0 0  0 0 0 1 0"/></filter>';
    document.body.append(svg);
    document.documentElement.style.filter = "url(#cvd)";
  });
  await page.waitForTimeout(600);
  await shots.take("cvd-deuteranopia", true);
  await page.evaluate(() => { document.documentElement.style.filter = ""; document.getElementById("cvd-defs")?.remove(); });
  const palette = await page.evaluate(() => window.R.palette());
  const colour = (k: string): [number, number, number] | null => { const v = palette[k]; const c = typeof v === "string" ? parseColour(v.startsWith("#") ? hex(v) : v) : null; return c ? [c[0], c[1], c[2]] : null; };
  const pairs: [string, string][] = [["ok", "danger"], ["interactive", "danger"], ["ok", "interactive"]];
  const info: Record<string, number> = {};
  for (const [x, y] of pairs) {
    const a = colour(x), b = colour(y);
    if (!a || !b) continue;
    const d = deltaE(deuteranopia(a), deuteranopia(b));
    info[`${x}+${y}`] = Math.round(d * 10) / 10;
    if (d < L.colourBlind.minDeltaE) hits.push(h("cvd-confusable", 14, 1, `palette.${x}+${y}`, `${x} and ${y} look alike with deuteranopia`, `The palette's ${x} and ${y} are ${d.toFixed(1)} apart in colour after a deuteranopia simulation (limit ${L.colourBlind.minDeltaE}). Fine where a shape or icon also tells them apart; a problem where colour alone does (health bars, goal states).`, "deltaE", d, L.colourBlind.minDeltaE));
  }
  return { hits, info };
}

function hex(v: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m) return v;
  const s = m[1]!.length === 3 ? m[1]!.split("").map((c) => c + c).join("") : m[1]!;
  return `rgb(${parseInt(s.slice(0, 2), 16)}, ${parseInt(s.slice(2, 4), 16)}, ${parseInt(s.slice(4, 6), 16)})`;
}

// ------------------------------------------------------------------ a story level

async function lum(png: Buffer): Promise<number> {
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return meanLuminance(data, 8);
}

/**
 * Scripted plays that take a path the bot's normal play cannot (`<level>+<variant>` in --story). Each adds the lines only that path says.
 *  - lose: the commander stands still and never feeds the reactor, so the first fill goal fails and the run is lost (level 1:
 *    "Barely in time", "The reactor's out."). The bot plays as normal until KILN gives the fill job, then stops.
 *  - stall: once KILN has sent the commander to the wreck (the hands-off run is under way) a job is stopped by the probe, so
 *    the run drops to nothing (level 4: "Something stopped. Go back and look.").
 */
const VARIANTS: Record<string, string[]> = { "story-L001": ["lose"], "story-L004": ["stall"] };

async function playStory(run: Run, jobId: string, a: Args, L: Limits, outDir: string, rel: string, result: LevelResult): Promise<void> {
  const { page } = run;
  const t0 = Date.now();
  const [levelId = jobId, variant = ""] = jobId.split("+");
  const dir = join(outDir, "probe", safe(jobId));
  const shots = new Shots(page, dir, rel, L.shots.perStoryLevel);
  const tracker = new Tracker(levelId);
  const evidence = new Map<string, Evidence>();
  const lines: { ms?: Record<string, number>; n: number; text: string; speaker: string | null; shot: string | null; heldTicks: number; gates: string[] }[] = [];
  const extras: Record<string, unknown> = { lines, films: [] as unknown[] };

  // films first: what a live scene holds on its last frame, to set against the level's first
  const films = await page.evaluate((id) => window.R.films(id), levelId);
  const filmEnds: FilmEnd[] = [];
  const videos: string[] = [];
  const atStart = new Set(films.filter((f) => f.atStart).map((f) => f.id));
  for (const f of films) {
    const end = await page.evaluate((id) => window.R.filmEnd(id), f.id);
    if (end) filmEnds.push(end); else videos.push(f.id);
  }
  extras["films"] = films;
  extras["videoFilmsNotMeasured"] = videos;

  if (!(await page.evaluate((id) => window.R.play(id), levelId))) throw new Error(`no such level: ${levelId}`);
  await page.waitForTimeout(800);
  const start: StorySnapshot | null = await page.evaluate(() => window.R.state());
  extras["levelStart"] = start;
  const startShot = await shots.take("level-start", true);
  const levelLight = startShot ? await lum(readFileSync(join(outDir, startShot))) : null;
  if (start) {
    for (const fe of filmEnds) {
      const filmLight = fe.png ? await lum(Buffer.from(fe.png.split(",")[1] ?? "", "base64")) : null;
      if (fe.png) { mkdirSync(join(dir, "shots"), { recursive: true }); writeFileSync(join(dir, "shots", `film-${safe(fe.film)}-end.png`), Buffer.from(fe.png.split(",")[1] ?? "", "base64")); shots.list.push(`${rel}/shots/film-${safe(fe.film)}-end.png`); }
      (extras["filmEnds"] as unknown[] | undefined) ??= [];
      (extras["filmEnds"] as unknown[]).push({ film: fe.film, atStart: atStart.has(fe.film), objects: fe.objects.length, lights: fe.lights, light: filmLight });
      // only a film that plays before the first frame has a level-start state to be set against
      if (atStart.has(fe.film)) for (const hit of continuityHits(levelId, fe.film, filmLight, levelLight, fe.objects.map((o) => o.name), start, L)) {
        const fp = fingerprintOf(hit.cat, levelId, hit.subject, hit.check);
        tracker.observe(0, [hit]);
        evidence.set(fp, { paths: [`${rel}/shots/film-${safe(fe.film)}-end.png`] });
      }
    }
  }

  if (variant) { extras["variant"] = variant; if (variant !== "lose" && variant !== "stall") throw new Error(`no such variant: ${variant}`); }
  await page.evaluate(() => window.R.drive("good"));
  // The story runs on a made-up clock (R.ff) so minutes of it do not wait on a slow GPU; each caption stops it, gets a
  // few drawn frames to settle over its speaker, is pictured and judged, then a tap sends the story on.
  const limit = Math.max(a.seconds, a.storySeconds);
  const wallCap = Math.max(a.wall, a.storyWall);
  let allGates: Record<string, StoryGate[]> = {};
  try { allGates = JSON.parse(readFileSync(join(dirname(a.limits), "story-gates.json"), "utf8")) as Record<string, StoryGate[]>; } catch { /* no gates file: no gates */ }
  const gates = (Array.isArray(allGates[levelId]) ? allGates[levelId]! : []).filter((g) => g && typeof g.line === "string");
  const gateSeen = new Set<StoryGate>();
  const errSeen = new Set<string>();
  let camBusy = false, camN = 0;
  const camCues: { n: number; shot: string | null; frames: number; moved: boolean }[] = [];
  extras["cameraCues"] = camCues;
  const cueAudit = { guideMissing: 0, glowMissing: 0, arrowMissing: 0 };
  extras["cueAudit"] = cueAudit;
  let stallArmed = false;
  const prompts: { text: string; line: number }[] = [];
  extras["prompts"] = prompts;
  let lineNo = 0, seq = 0, frozenFor = 0, lastTick = -1, nextSample = 5, lastCard = "";
  const cards: { n: number; text: string; shot: string | null }[] = [];
  const filmShots: (string | null)[] = [];
  extras["cards"] = cards;
  extras["filmShots"] = filmShots;
  for (let guard = 0; guard < 900 && Date.now() - t0 < wallCap * 1000; guard++) {
    // a film or live scene over the level (the director's `film` cue): pictured once, then skipped with a tap
    if (await page.locator(".cine:visible").count()) {
      await page.waitForTimeout(2500);
      if (filmShots.length < 6) filmShots.push(await shots.take(`film${String(filmShots.length + 1).padStart(2, "0")}`, true));
      // the picture can take seconds and a live scene ends by itself: tap only while it is still up, or the tap lands on the line that follows it and skips that line unseen (the round-3b out-of-order findings on levels 3 and 4)
      if (await page.locator(".cine:visible").count()) await page.mouse.click(187, 406).catch(() => undefined);
      await page.waitForTimeout(800);
      continue;
    }
    // a "try again / keep playing" prompt (a failed retry goal, a lost run): the probe plays on, as a player who did not retry would, so the lines after it can be reached
    const keep = page.locator(".story-other:visible");
    if (await keep.count()) {
      const text: string = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".story-prompt")).filter((e) => !e.hidden).map((e) => (e.textContent ?? "").trim()).join(" | "));
      prompts.push({ text: text.slice(0, 120), line: lineNo });
      await keep.first().click({ timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      frozenFor = 0;
      continue;
    }
    // stall variant: the run of the hands-off goal has started, so stop a job once and let the director see it drop
    if (stallArmed && (await page.evaluate(() => window.R.progress("auto") ?? 0)) > 2 && (await page.evaluate(() => window.R.breakHold("auto")))) { stallArmed = false; extras["variantAt"] = { line: lineNo }; }
    const r = await page.evaluate(([sec, seen, cam]) => window.R.ff(sec, seen, cam), [stallArmed ? 1 : 5, seq, !camBusy] as const);
    // a camera beat has started: a frame every half second until it ends, joined into one strip so its timing can be judged
    const cu0: CueSample | null = await page.evaluate(() => window.R.cues());
    if (!cu0?.camera) camBusy = false;
    else if (!camBusy && camN < 24 && !process.env["FO_PROBE_NOCAM"]) {
      camBusy = true; camN++;
      const sharp = (await import("sharp")).default;
      const bufs: Buffer[] = [];
      for (let i = 0; i < 10; i++) {
        const b = await page.screenshot({ scale: "css", type: "jpeg", quality: 50, timeout: 8_000 }).catch(() => null);
        if (!b) { shots.failed.push(`cam${String(camN).padStart(2, "0")}: screenshot timed out`); break; }
        bufs.push(b);
        await page.evaluate(() => window.R.settle(15));
        if (!(await page.evaluate(() => window.R.cues()))?.camera) break;
      }
      const good = bufs.filter((b) => b.length);
      let strip: string | null = null;
      if (good.length) {
        const w = 188, hh = 406;
        const tiles = await Promise.all(good.map(async (b) => sharp(b).resize(w, hh, { fit: "fill" }).png().toBuffer()));
        mkdirSync(join(dir, "shots"), { recursive: true });
        const file = `cam${String(camN).padStart(2, "0")}-strip.png`;
        await sharp({ create: { width: w * tiles.length, height: hh, channels: 3, background: "#000" } }).composite(tiles.map((input, i) => ({ input, left: i * w, top: 0 }))).png().toFile(join(dir, "shots", file));
        strip = `${rel}/shots/${file}`;
        shots.list.push(strip);
      }
      const moved = good.some((b, i) => i > 0 && !b.equals(good[0]!));
      camCues.push({ n: camN, shot: strip, frames: good.length, moved });
      if (good.length > 1 && !moved) {
        const [f] = tracker.observe(Date.now(), [{ check: "camera-cue-empty", cat: 5, severity: 2, subject: "story.camera", title: "A camera move shows nothing moving", detail: `Camera beat ${camN}: ${good.length} frames over about ${good.length * 0.5} s are identical, so the move is empty or pans to where the view already is.`, metric: { name: "framesChanged", value: 0, limit: 1 }, seconds: 0, track: "story" }]);
        if (f && strip) evidence.set(f.fingerprint, { paths: [strip] });
      }
      continue;
    }
    result.simSeconds = Math.round((r.tick / TPS) * 10) / 10;
    // the level ending does not end the story: the director may still hold lines, a film and a card (level 5: the helmet is picked up
    // before the retreat lines, then the kneel, the film, "Vale?"), so keep reading until it goes quiet
    if (r.over) result.outcome = { over: true, won: null, reason: "level ended" };
    if (r.tick / TPS >= limit) break;
    if (r.seq !== seq) {
      seq = r.seq;
      const tm: Record<string, number> = {}; let tk = Date.now(); const lap = (k: string): void => { const n = Date.now(); tm[k] = n - tk; tk = n; };
      await page.evaluate(() => window.R.settle(3)); lap("settle");
      await page.waitForTimeout(450); // the bubble's own fade-in; a slow software-GL compositor stretches it, so wait for it to finish
      await page.waitForFunction(() => { const e = document.querySelector<HTMLElement>(".sdlg-bubble:not([hidden]), .sdlg-strip:not([hidden]), .sdlg-term:not([hidden])"); return !e || Number.parseFloat(getComputedStyle(e).opacity) >= 0.95; }, null, { timeout: 6000 }).catch(() => undefined);
      lap("fade");
      let s: Sample | null = await page.evaluate(() => window.R.snap()); lap("snap");
      // a line whose bubble is not up yet (a slow compositor, a bubble opening after a camera move) gets a few more frames before it is given up on
      // (a goal card that opens the line comes first and is tapped away, as the next pass would do)
      for (let tries = 0; !s?.caption && tries < 6; tries++) {
        if (await page.locator(".story-goalcard:visible").count()) { await page.mouse.click(187, 420).catch(() => undefined); await page.waitForTimeout(400); }
        await page.evaluate(() => window.R.settle(6)); await page.waitForTimeout(500); s = await page.evaluate(() => window.R.snap());
      }
      if (!s?.caption) {
        (extras["captionMisses"] as unknown[] | undefined) ??= [];
        (extras["captionMisses"] as unknown[]).push({ seq, tick: r.tick, dom: await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[class*=sdlg], [class*=story]")).filter((e) => e.offsetParent !== null).map((e) => `${e.className.toString()}: ${(e.textContent ?? "").trim().slice(0, 50)}`).slice(0, 8)) });
        await page.waitForTimeout(200); continue;
      }
      lineNo++;
      result.samples++;
      // a picture costs 10 to 15 s on the software renderer, so a line is pictured only when something is found on it (or with --line-shots)
      let shot = null as string | null;
      lap("shot");
      const matched = gatesFor(s.caption.text, gates);
      matched.forEach((g) => gateSeen.add(g));
      const shown = lines.map((l) => l.text);
      const entry = { ms: tm, n: lineNo, text: s.caption.text, speaker: s.caption.speaker, shot, heldTicks: 0, gates: matched.map((g) => g.why ?? g.line) };
      lines.push(entry);
      if (variant === "lose" && /won't last the night/.test(s.caption.text)) { await page.evaluate(() => window.R.drive("")); extras["variantAt"] = { line: lineNo, tick: r.tick }; }
      if (variant === "stall" && /Head east to the wreck/.test(s.caption.text)) stallArmed = true;
      const cues: CueSample | null = await page.evaluate(() => window.R.cues());
      const cueHits = cues ? analyzeCues(cues) : [];
      for (const ch of cueHits) { if (ch.check === "guide-arrow-missing") cueAudit.guideMissing++; else if (ch.check === "edge-glow-missing") cueAudit.glowMissing++; else cueAudit.arrowMissing++; }
      const lineHits = [...analyzeCaption(s.caption, s, L), ...analyzeSpeakerSeen(s.caption, s, L), ...cueHits, ...analyzeLineSight(s.caption, s, gates, L), ...analyzeLineOrder(s.caption, shown, gates), ...analyzeLineGoals(s.caption, s, gates)];
      if (a.lineShots || lineHits.length) { shot = await shots.take(`line${String(lineNo).padStart(2, "0")}`, true); entry.shot = shot; }
      for (const hit of lineHits) {
        const [f] = tracker.observe(Date.now(), [{ ...hit, subject: `${hit.subject}.line` }]);
        const ev = f ? await shots.evidenceFor(f, `line${String(lineNo).padStart(2, "0")}-${f.check}`) : null;
        if (f && ev) evidence.set(f.fingerprint, ev);
        else if (f && shot) evidence.set(f.fingerprint, { paths: [shot] });
      }
      lap("analyse");
      // the hold test: with no tap, play must not run on while the line is up
      const held = await page.evaluate(([sec, sq]) => window.R.ff(sec, sq), [L.story.holdSeconds, seq] as const);
      entry.heldTicks = held.tick - r.tick; lap("hold");
      const stillUp = held.seq === seq;
      for (const hit of analyzeLineHold(s.caption, r.tick, held.tick, stillUp, matched.length > 0, L)) {
        const [f] = tracker.observe(Date.now(), [{ ...hit, subject: `${hit.subject}.line` }]);
        if (f && shot) evidence.set(f.fingerprint, { paths: [shot] });
      }
      // another line replaced this one: seq is left alone so the next ff returns it at once and it is judged on the next pass
      if (!stillUp) continue;
      if (await page.locator(".story-tap:visible, .sdlg-tap:visible").count()) await page.mouse.click(187, 420).catch(() => undefined);
      await page.waitForTimeout(150);
      frozenFor = 0;
      continue;
    }
    // a card, goal card or prompt that waits for a tap: pictured once, then tapped
    if (await page.locator(".story-tap:visible").count()) {
      const card: string = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".story-card, .story-goalcard, .story-prompt")).filter((e) => !e.hidden).map((e) => (e.textContent ?? "").trim()).join(" | "));
      // no card text: a line may have come up since the last step (the director runs on the real clock between our steps, as when a film ends), and a tap here would skip it unseen; go round so it is read first
      if (!card && (await page.evaluate(([sq]) => window.R.ff(0, sq), [seq] as const)).seq !== seq) continue;
      if (card && card !== lastCard) { lastCard = card; cards.push({ n: cards.length + 1, text: card.slice(0, 120), shot: await shots.take(`card${String(cards.length + 1).padStart(2, "0")}`, true) }); }
      await page.mouse.click(187, 420).catch(() => undefined);
      await page.waitForTimeout(150);
      frozenFor = 0;
      continue;
    }
    frozenFor = r.tick === lastTick ? frozenFor + 1 : 0;
    lastTick = r.tick;
    // the fall, kneel and dawn run on the wall clock, which R.ff cannot step: give them real time before giving up
    if (frozenFor >= 1) await page.waitForTimeout(1000);
    // a film, stage or camera hold runs on the wall clock and a software renderer can take minutes over one, so it gets more patience than a stuck level
    const held = frozenFor >= 20 ? await page.evaluate(() => window.R.scene()) : null;
    if (frozenFor >= (r.over ? (held?.on && held.why !== "line" && held.why !== "prompt" ? 400 : 20) : held?.on && held.why !== "line" && held.why !== "prompt" ? 400 : 120)) { extras["frozenShot"] = await shots.take("frozen", true); extras["stoppedFrozen"] = { tick: r.tick, seq: r.seq, over: r.over, dom: await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[class]")).filter((e) => e.offsetParent !== null && /cine|story|sdlg|result|card/.test(e.className.toString())).map((e) => e.className.toString()).slice(0, 12)), text: await page.evaluate(() => (document.querySelector<HTMLElement>(".app")?.innerText ?? "").replace(/s+/g, " ").slice(0, 300)), lines: lineNo, scene: await page.evaluate(() => window.R.scene()), state: await page.evaluate(() => { const s = window.R.state(); return s ? { tick: s.tick, hp: s.player.hp, hostiles: s.hostiles } : null; }) }; break; } // nothing moves: the story waits on something the bot cannot give
    // the rest of the screen is held to the same rules every few seconds of the story
    if (r.tick / TPS >= nextSample) {
      nextSample = r.tick / TPS + 5;
      await page.evaluate(() => window.R.settle(4));
      const s: Sample | null = await page.evaluate(() => window.R.snap());
      if (s && s.screen === "playing") {
        result.samples++;
        if (s.tick >= L.warmupSeconds * TPS) for (const f of tracker.observe((s.tick * 1000) / TPS, analyzeSample(s, L, true).filter((x) => !x.check.startsWith("caption")))) {
          const ev = await shots.evidenceFor(f, `t${pad4(s.tick / TPS)}-${f.check}-${f.subject}`);
          if (ev) evidence.set(f.fingerprint, ev);
        }
      }
    }
    await watchErrors(run, levelId, shots, evidence, errSeen);
  }
  extras["gatesNotReached"] = gates.filter((g) => !gateSeen.has(g)).map((g) => g.line);
  extras["gatesReached"] = gates.filter((g) => gateSeen.has(g)).map((g) => g.line);
  const { frames } = await page.evaluate(() => window.R.frames());
  result.frames = frameStats(frames, L);
  result.errors = [...new Set([...(await page.evaluate(() => window.R.errors())), ...run.errors])].slice(0, 40);
  tracker.observe(Date.now() + 1, errorHits(result.errors));
  // no fallback to the level-start picture: a finding gets the picture of its own moment, or none
  result.findings = withEvidence(tracker.findings(), evidence, shots, { track: "story" });
  result.shots = shots.list;
  if (shots.failed.length) extras["screenshotsFailed"] = shots.failed;
  result.extras = extras;
  result.wallSeconds = Math.round((Date.now() - t0) / 100) / 10;
}

// ------------------------------------------------------------------ main

async function main(argv: readonly string[]): Promise<number> {
  const a = parseArgs(argv);
  const L = JSON.parse(readFileSync(a.limits, "utf8")) as Limits;
  mkdirSync(a.out, { recursive: true });
  const server = a.base ? null : await startVite();
  const base = a.base ?? server!.url;
  const gpu = process.env["PROBE_GPU"] === "1";
  const browser = await chromium.launch({ args: gpu ? [] : GL_ARGS });
  const results: LevelResult[] = [];
  const candidates: Candidate[] = [];
  let failed = 0;
  try {
    // a level with scripted variants gets them after its normal play, unless --no-variants or the list names its own
    const storyIds = a.story.flatMap((id) => [id, ...(a.variants && !id.includes("+") && !a.story.some((x) => x.startsWith(`${id}+`)) ? (VARIANTS[id] ?? []).map((v) => `${id}+${v}`) : [])]);
    const jobs: { id: string; story: boolean }[] = [...a.levels.map((id) => ({ id, story: false })), ...storyIds.map((id) => ({ id, story: true }))];
    for (const [idx, job] of jobs.entries()) {
      const rel = `probe/${safe(job.id)}`;
      const res: LevelResult = { levelId: job.id, track: job.story ? "story" : "main", ok: false, simSeconds: 0, wallSeconds: 0, samples: 0, notch: false, throttle: a.throttle, outcome: null, frames: { frames: 0, medMs: 0, p95Ms: 0, worstMs: 0, longFrames: 0 }, errors: [], shots: [], findings: [], extras: {} };
      let run: Run | null = null;
      try {
        run = await open(browser, base, a);
        res.notch = run.notch;
        if (job.story) await playStory(run, job.id, a, L, a.out, rel, res);
        else await playLevel(run, job.id, a, L, a.out, rel, res);
        // interruption and colour-blind passes run once, on the first main level
        if (!job.story && idx === 0) {
          const dir = join(a.out, "probe", job.id);
          const shots = new Shots(run.page, dir, rel, 99);
          const tr = new Tracker(job.id);
          if (a.colourBlind) { const cb = await colourBlind(run, L, shots); res.extras["colourBlind"] = cb.info; for (const hit of cb.hits) tr.observe(0, [hit]); }
          if (a.interrupt) { const it = await interruption(run, job.id, L, shots, base); res.extras["interruption"] = it.info; for (const hit of it.hits) tr.observe(0, [hit]); }
          const extra = tr.findings().map((f) => ({ ...f, evidence: shots.list.slice(-1) }));
          res.findings.push(...extra);
          res.shots.push(...shots.list);
        }
        res.ok = true;
      } catch (e) {
        failed++;
        res.error = e instanceof Error ? e.message : String(e);
        console.error(`probe ${job.id}: ${res.error}`);
      } finally {
        await run?.ctx.close().catch(() => undefined);
      }
      mkdirSync(join(a.out, "probe", safe(job.id)), { recursive: true });
      writeFileSync(join(a.out, "probe", safe(job.id), "summary.json"), JSON.stringify(res, null, 2));
      results.push(res);
      for (const f of res.findings) candidates.push(toCandidate(f, job.id, f.evidence, f.box));
      console.log(`${job.id}: ${res.ok ? "ok" : "FAILED"}, ${res.simSeconds}s played in ${res.wallSeconds}s, ${res.findings.length} findings, ${res.shots.length} shots`);
    }
    // a line only a variant reaches counts as reached for its level: the level's summary says which variant got it there
    for (const base of results) {
      const vs = results.filter((r) => r.ok && r.levelId.startsWith(`${base.levelId}+`));
      const left = base.extras["gatesNotReached"];
      if (!vs.length || !Array.isArray(left)) continue;
      const via: Record<string, string> = {};
      for (const v of vs) for (const l of (v.extras["gatesReached"] as string[] | undefined) ?? []) via[l] ??= String(v.extras["variant"]);
      base.extras["gatesNotReached"] = left.filter((l) => !via[l as string]);
      base.extras["gatesReachedByVariant"] = Object.fromEntries(Object.entries(via).filter(([l]) => left.includes(l)));
      writeFileSync(join(a.out, "probe", safe(base.levelId), "summary.json"), JSON.stringify(base, null, 2));
    }
  } finally {
    await browser.close().catch(() => undefined);
    if (!a.keepServer) server?.stop();
  }
  writeFileSync(join(a.out, "candidates-probe.json"), JSON.stringify(candidates, null, 2));
  console.log(`wrote ${candidates.length} candidates to ${join(a.out, "candidates-probe.json")}`);
  return failed > 0 ? 1 : 0;
}

main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
