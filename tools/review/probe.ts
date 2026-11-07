/// <reference lib="dom" />
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { parseArgs, type Args, analyzeCaption, analyzeSample, continuityHits, deltaE, deuteranopia, errorHits, fingerprintOf, frameHits, frameStats, meanLuminance, parseColour, toCandidate, Tracker, type Candidate, type Finding, type Hit, type Limits } from "./probe-core.js";
import type { FilmEnd, FrameRec, ReviewApi, Sample, StorySnapshot } from "./probe-types.js";

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
  const bin = createRequire(join(client, "package.json")).resolve("vite/bin/vite.js");
  const port = await freePort(5197);
  const child: ChildProcess = spawn(process.execPath, [bin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: client, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout?.on("data", (d) => { log += String(d); });
  child.stderr?.on("data", (d) => { log += String(d); });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => child.kill() }; } catch { /* not up yet */ }
    if (child.exitCode !== null) throw new Error(`vite exited: ${log.slice(-400)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`vite did not come up on ${url}: ${log.slice(-400)}`);
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
const safe = (s: string): string => s.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 40);

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
  private flagged = 0;
  constructor(private readonly page: Page, private readonly dir: string, private readonly rel: string, private readonly cap: number) {}

  /** A picture at CSS pixel size; returns its path relative to the output folder, or null once the flagged cap is reached. */
  async take(name: string, force = false): Promise<string | null> {
    if (!force && this.flagged >= this.cap) return null;
    if (!force) this.flagged++;
    const file = `${safe(name)}.png`;
    mkdirSync(join(this.dir, "shots"), { recursive: true });
    await this.page.screenshot({ path: join(this.dir, "shots", file), scale: "css" });
    const rel = `${this.rel}/shots/${file}`;
    this.list.push(rel);
    return rel;
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
  const evidence = new Map<string, string>();
  const checkpoints = [...L.shots.checkpointSeconds];
  let last: string | null = null;
  const every = L.sampleEveryTicks;
  let tick = 0;
  let outcome: LevelResult["outcome"] = null;
  const warm = L.warmupSeconds * TPS;

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
        const shot = await shots.take(`t${pad4(s.tick / TPS)}-${f.check}-${f.subject}`);
        if (shot) evidence.set(f.fingerprint, shot);
      }
    }
    const secs = s.tick / TPS;
    if (checkpoints.length && secs >= checkpoints[0]!) { last = await shots.take(`t${pad4(checkpoints.shift()!)}`, true); }
    if (st.over || secs >= a.seconds) break;
  }
  await page.evaluate(() => window.R.visibility(true));
  result.simSeconds = Math.round((tick / TPS) * 10) / 10;
  result.outcome = outcome;
  last = last ?? (await shots.take("tend", true));

  // frame cost and errors close the level
  const { frames } = await page.evaluate(() => window.R.frames());
  result.frames = frameStats(frames, L);
  const inPage = await page.evaluate(() => window.R.errors());
  result.errors = [...new Set([...inPage, ...run.errors])].slice(0, 40);
  const end = (tick * 1000) / TPS + 1;
  for (const h of [...frameHits(frames, L, a.throttle), ...errorHits(result.errors)]) tracker.observe(end, [h]);
  evidence.set("*", last ?? "");
  result.findings = tracker.findings().map((f) => ({ ...f, evidence: [evidence.get(f.fingerprint) ?? evidence.get("*") ?? ""].filter(Boolean) }));
  result.shots = shots.list;
  result.wallSeconds = Math.round((Date.now() - t0) / 100) / 10;
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

async function playStory(run: Run, levelId: string, a: Args, L: Limits, outDir: string, rel: string, result: LevelResult): Promise<void> {
  const { page } = run;
  const t0 = Date.now();
  const dir = join(outDir, "probe", levelId);
  const shots = new Shots(page, dir, rel, L.shots.perStoryLevel);
  const tracker = new Tracker(levelId);
  const evidence = new Map<string, string>();
  const lines: { n: number; text: string; speaker: string | null; shot: string | null }[] = [];
  const extras: Record<string, unknown> = { lines, films: [] as unknown[] };

  // films first: what a live scene holds on its last frame, to set against the level's first
  const films = await page.evaluate((id) => window.R.films(id), levelId);
  const filmEnds: FilmEnd[] = [];
  const videos: string[] = [];
  for (const f of films) {
    const end = await page.evaluate((id) => window.R.filmEnd(id), f);
    if (end) filmEnds.push(end); else videos.push(f);
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
      (extras["filmEnds"] as unknown[]).push({ film: fe.film, objects: fe.objects.length, lights: fe.lights, light: filmLight });
      for (const hit of continuityHits(levelId, fe.film, filmLight, levelLight, fe.objects.map((o) => o.name), start, L)) {
        const fp = fingerprintOf(hit.cat, levelId, hit.subject, hit.check);
        tracker.observe(0, [hit]);
        evidence.set(fp, `${rel}/shots/film-${safe(fe.film)}-end.png`);
      }
    }
  }

  await page.evaluate(() => window.R.drive("good"));
  // The story runs on a made-up clock (R.ff) so minutes of it do not wait on a slow GPU; each caption stops it, gets a
  // few drawn frames to settle over its speaker, is pictured and judged, then a tap sends the story on.
  const limit = Math.max(a.seconds, 180);
  let lineNo = 0, seq = 0, frozenFor = 0, lastTick = -1, nextSample = 5, lastCard = "";
  const cards: { n: number; text: string; shot: string | null }[] = [];
  extras["cards"] = cards;
  for (let guard = 0; guard < 600 && Date.now() - t0 < Math.min(a.wall, 600) * 1000; guard++) {
    const r = await page.evaluate(([sec, seen]) => window.R.ff(sec, seen), [5, seq] as const);
    result.simSeconds = Math.round((r.tick / TPS) * 10) / 10;
    if (r.over) { result.outcome = { over: true, won: null, reason: "level ended" }; break; }
    if (r.tick / TPS >= limit) break;
    if (r.seq !== seq) {
      seq = r.seq;
      await page.evaluate(() => window.R.settle(3));
      await page.waitForTimeout(450); // the bubble's own fade-in; a slow software-GL compositor stretches it, so wait for it to finish
      await page.waitForFunction(() => { const e = document.querySelector<HTMLElement>(".sdlg-bubble:not([hidden]), .sdlg-strip:not([hidden]), .sdlg-term:not([hidden])"); return !e || Number.parseFloat(getComputedStyle(e).opacity) >= 0.95; }, null, { timeout: 6000 }).catch(() => undefined);
      const s: Sample | null = await page.evaluate(() => window.R.snap());
      if (!s?.caption) { await page.waitForTimeout(200); continue; }
      lineNo++;
      result.samples++;
      const shot = await shots.take(`line${String(lineNo).padStart(2, "0")}`, true);
      lines.push({ n: lineNo, text: s.caption.text, speaker: s.caption.speaker, shot });
      for (const hit of analyzeCaption(s.caption, s, L)) {
        const [f] = tracker.observe(Date.now(), [{ ...hit, subject: `${hit.subject}.line` }]);
        if (f && shot) evidence.set(f.fingerprint, shot);
      }
      if (await page.locator(".story-tap:visible, .sdlg-tap:visible").count()) await page.mouse.click(187, 420).catch(() => undefined);
      await page.waitForTimeout(150);
      frozenFor = 0;
      continue;
    }
    // a card, goal card or prompt that waits for a tap: pictured once, then tapped
    if (await page.locator(".story-tap:visible").count()) {
      const card: string = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".story-card, .story-goalcard, .story-prompt")).filter((e) => !e.hidden).map((e) => (e.textContent ?? "").trim()).join(" | "));
      if (card && card !== lastCard) { lastCard = card; cards.push({ n: cards.length + 1, text: card.slice(0, 120), shot: await shots.take(`card${String(cards.length + 1).padStart(2, "0")}`, true) }); }
      await page.mouse.click(187, 420).catch(() => undefined);
      await page.waitForTimeout(150);
      frozenFor = 0;
      continue;
    }
    frozenFor = r.tick === lastTick ? frozenFor + 1 : 0;
    lastTick = r.tick;
    if (frozenFor >= 6) break; // nothing moves: the story waits on something the bot cannot give
    // the rest of the screen is held to the same rules every few seconds of the story
    if (r.tick / TPS >= nextSample) {
      nextSample = r.tick / TPS + 5;
      await page.evaluate(() => window.R.settle(4));
      const s: Sample | null = await page.evaluate(() => window.R.snap());
      if (s && s.screen === "playing") {
        result.samples++;
        if (s.tick >= L.warmupSeconds * TPS) for (const f of tracker.observe((s.tick * 1000) / TPS, analyzeSample(s, L, true).filter((x) => !x.check.startsWith("caption")))) {
          const shot = await shots.take(`t${pad4(s.tick / TPS)}-${f.check}-${f.subject}`);
          if (shot) evidence.set(f.fingerprint, shot);
        }
      }
    }
  }
  const { frames } = await page.evaluate(() => window.R.frames());
  result.frames = frameStats(frames, L);
  result.errors = [...new Set([...(await page.evaluate(() => window.R.errors())), ...run.errors])].slice(0, 40);
  tracker.observe(Date.now() + 1, errorHits(result.errors));
  result.findings = tracker.findings().map((f) => ({ ...f, track: "story" as const, evidence: [evidence.get(f.fingerprint) ?? startShot ?? ""].filter(Boolean) }));
  result.shots = shots.list;
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
    const jobs: { id: string; story: boolean }[] = [...a.levels.map((id) => ({ id, story: false })), ...a.story.map((id) => ({ id, story: true }))];
    for (const [idx, job] of jobs.entries()) {
      const rel = `probe/${job.id}`;
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
      mkdirSync(join(a.out, "probe", job.id), { recursive: true });
      writeFileSync(join(a.out, "probe", job.id, "summary.json"), JSON.stringify(res, null, 2));
      results.push(res);
      for (const f of res.findings) candidates.push(toCandidate(f, job.id, f.evidence));
      console.log(`${job.id}: ${res.ok ? "ok" : "FAILED"}, ${res.simSeconds}s played in ${res.wallSeconds}s, ${res.findings.length} findings, ${res.shots.length} shots`);
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
