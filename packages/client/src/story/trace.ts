import { viewWidth } from "@fo/content";
import { Brain, PROFILES, planBot } from "@fo/bots";
import { createSim, FP, seedRng, TPS, type SimEvent, type State } from "@fo/sim";
import { marsGreenhouse, type SkinStory, type StoryAction, type StoryCue, type StoryLevel } from "@fo/skins";
import { Interp } from "@fo/render-3d/interp";
import { createCamera, DEFAULT_FOV, DEFAULT_PITCH, DEFAULT_YAW, followStep, onScreen, projectPoint, type FrameOpts } from "@fo/render-3d/camframe";
import { StoryDirector, type DialogueLine, type StoryHost, type StoryView } from "./director.js";
import { Guide } from "../guide.js";

// Story sequence trace (r4, Doug 2026-11-24): plays a story level headless, the good bot at the controls, through the
// REAL StoryDirector and the REAL sim, with a fake StoryView, a phone-portrait camera framed by the renderer's own math
// (render-3d camframe.ts) and the renderer's own Interp for staged walkers. Lines are tapped after TAP_S seconds.
//
//   pnpm story:trace <levelId> [--seed n]     (tools/story-trace.ts) writes docs/story-trace/<levelId>.txt
//   traceStory(levelId, manifest) -> { rows, failures }   (client/test/story-trace.test.ts checks (a)-(f) for Levels 1-5)
// Not imported by the app, so it is never bundled.
//
// Frame loop mirrors app.ts frame(): director.update, then (not frozen) fixed-step the sim, events to the director,
// afterTick, stop stepping when a cue froze play; then the renderer's camera follow. 60 frames a second.

export const PHONE = { cssW: 390, cssH: 845 } as const; // 9:19.5 portrait
const FRAME_S = 1 / 60;
/** A line is tapped this long after it shows. */
export const TAP_S = 2;
/** A film (or a kneel or fall) runs this long. */
const FILM_S = 6;
/** After level_end the app waits this long, then asks holdResult (app.ts finish). */
const RESULT_WAIT_S = 1.5;
/** A frozen stretch longer than this with nothing to read is a failure (c). */
export const MAX_DEAD_FREEZE_S = 4;
const IN_FRAME_MARGIN = 0.04; // app.ts inFrame for the director
const MAX_SECONDS = 1500;

export interface TraceRow { tick: number; t: number; cue: string; what: string; detail: string }
export interface TraceFailure { check: "a" | "b" | "c" | "d" | "e" | "f"; tick: number; t: number; cue: string; message: string }
export interface StoryTrace { level: string; seed: number; won: boolean | null; rows: TraceRow[]; failures: TraceFailure[] }

export interface TraceOpts {
  seed?: number;
  /** Replace the level's story data (a test feeds an old version). */
  level?: StoryLevel;

  skinStory?: SkinStory;
}

const r1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

export async function traceStory(levelId: string, manifestIn: unknown, opts: TraceOpts = {}): Promise<StoryTrace> {
  const seed = opts.seed ?? 1;
    const manifest = manifestIn as { family?: string; map: { w: number; h: number }; entities: { id?: string; type: string; at?: number[]; rect?: number[] }[] };
  const baseStory = opts.skinStory ?? marsGreenhouse.story!;
  const level = opts.level ?? baseStory.levels[levelId];
  if (!level) throw new Error(`no story level ${levelId}`);
  const story: SkinStory = { ...baseStory, levels: { ...baseStory.levels, [levelId]: level } };

  const rows: TraceRow[] = [];
  const failures: TraceFailure[] = [];
  let clock = 0; // real seconds
  const sim = createSim({ ...(manifest as object), seed } as never);
  const st: State = sim.state, cp = sim.compiled;
  const plan = planBot(manifest);
  const brain = new Brain(cp, plan, PROFILES["good"]!, seedRng(seed));
  const guide = await Guide.create(manifest as never, cp);
  const interp = new Interp();
  const cam = createCamera();
  const fo: FrameOpts = { viewW: viewWidth(manifest.family), ...PHONE, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, fov: DEFAULT_FOV };
  let camFirst = true;

  // ---- which cue an action came from
  const cueName = new Map<StoryCue, string>();
  level.cues.forEach((c, i) => cueName.set(c, c.id ?? `#${i}`));
  const actionCue = new WeakMap<object, string>();
  let curCue = "-";
  const firedCues = new Set<StoryCue>(), firedIds = new Set<string>();
  const staged = new Map<string, string>();
  const row = (what: string, detail = "", cue = curCue): void => { rows.push({ tick: st.tick, t: clock, cue, what, detail }); };
  const fail = (check: TraceFailure["check"], message: string, cue = curCue): void => { failures.push({ check, tick: st.tick, t: clock, cue, message }); row(`FAIL(${check})`, message, cue); };

  // ---- fake view
  let tapFn: (() => void) | null = null;
  let lineAt = -1, line: DialogueLine | null = null, cardOn = false, goalCardOn = false;
  const view: StoryView = {
    line: (l) => { line = l; lineAt = clock; onLine(l); },
    clearLine: () => { line = null; },
    finishLine: () => false,
    card: (c) => { cardOn = true; row("card", c.text); },
    clearCard: () => { cardOn = false; },
    goalCard: (text) => { goalCardOn = true; lineAt = clock; row("goal_card", text); },
    clearGoalCard: () => { goalCardOn = false; },
    onTap: (fn) => { tapFn = fn; },
    prompt: (p, _retry, other) => { row("prompt", p.text); pendingPrompt = other; },
    clearPrompt: () => {},
    hud: () => {}, goals: () => {}, dispose: () => {},
  };
  let pendingPrompt: (() => void) | null = null;

  // ---- fake host
  const films: { end: number; done: () => void }[] = [];
  const later = (what: string, detail: string): Promise<void> => new Promise((r) => { row(what, detail); films.push({ end: clock + FILM_S, done: r }); });
  const host: StoryHost = {
    cam,
    entityAt: (eid) => {
      const ents = manifest.entities;
      const e = ents.find((x) => x.id === eid);
      if (e?.type.startsWith("capture.")) {
        const c = st.captures.find((x) => x.id === ents.filter((y) => y.type.startsWith("capture.")).indexOf(e));
        if (c) return { x: c.pos.x / FP, y: c.pos.y / FP };
      }
      if (e?.at) return { x: e.at[0]!, y: e.at[1]! };
      return e?.rect ? { x: e.rect[0]! + e.rect[2]! / 2, y: e.rect[1]! + e.rect[3]! / 2 } : null;
    },
    film: (f) => later("film", f),
    fall: (o) => later("fall", o.kind),
    kneel: () => later("kneel", ""),
    inset: (f) => row("inset", f),
    inFrame: (p) => onScreen(projectPoint(p, 0, cam, fo, cam.zoom), fo, IN_FRAME_MARGIN),
    drawnAt: (k) => { const p = interp.pos(k, { x: Number.NaN, y: Number.NaN }, 1); return Number.isFinite(p.x) ? p : null; },
    entryFrom: (to, from) => {
      const far = Math.hypot(from.x - to.x, from.y - to.y);
      if (far < 1) return null;
      const at = (d: number) => ({ x: to.x + ((from.x - to.x) * d) / far, y: to.y + ((from.y - to.y) * d) / far });
      let lo = 0, hi = far;
      for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (onScreen(projectPoint(at(mid), 0, cam, fo, cam.zoom), fo, 0.06)) lo = mid; else hi = mid; }
      return at(Math.min(far, hi));
    },
    retry: () => row("retry"),
    goalSettled: (label, done) => row("goal", `${done ? "done" : "missed"}: ${label}`),
    now: () => clock * 1000,
    aspect: () => PHONE.cssW / PHONE.cssH,
    note: (n) => {
      if ("fired" in n) {
        const name = cueName.get(n.fired) ?? "?";
        firedCues.add(n.fired);
        if (n.fired.id) firedIds.add(n.fired.id);
        for (const a of n.fired.do) actionCue.set(a, name);
        row("cue", triggerText(n.fired), name);
      } else {
        curCue = actionCue.get(n.start) ?? ("stage" in n.start ? curCue : "-");
        const d = describe(n.start);
        if (d) row(d.what, d.detail);
      }
    },
  };

  // the camera is placed before play starts (the app draws the intro frames first)
  interp.update(st);
  followStep(cam, interp.pos("player", st.player.pos, 0), FRAME_S, fo, cam.zoom, manifest.map, true);
  camFirst = false;
  const director = new StoryDirector(story, level, view, host, false);

  // ---- speaker placement, for (a) and the row detail
  const speakerAt = (who: string): { x: number; y: number } | null => {
    const key = director.castKey(who, st);
    if (key) { const p = interp.pos(key, { x: Number.NaN, y: Number.NaN }, 1); if (Number.isFinite(p.x)) return p; }
    const cust = director.customerOf(who);
    const v = cust !== null ? vehicles.find((x) => x.rider === cust && x.u < 1.6) : undefined;
    if (v) return v.at;
    return director.castAt(who, st);
  };
  const worldSpeaker = (who: string | undefined): boolean => {
    if (!who || who === "commander") return false;
    if (story.speakers[who]?.spirit) return false;
    return !!level.cast?.[who];
  };
  function onLine(l: DialogueLine): void {
    const who = l.who;
    const at = who ? speakerAt(who) : null;
    let place = "";
    if (at) {
      const q = projectPoint(at, 0, cam, fo, cam.zoom);
      const inF = onScreen(q, fo, 0);
      const dist = Math.hypot(at.x - cam.x, at.y - cam.y);
      place = ` [at ${Math.round(at.x)},${Math.round(at.y)} ${Math.round(dist)} from centre, ${inF ? "in frame" : "OFF SCREEN"}; cmdr ${Math.round(st.player.pos.x / FP)},${Math.round(st.player.pos.y / FP)}]`;
      if (worldSpeaker(who) && !inF) fail("a", `${who} speaks off screen (${Math.round(at.x)},${Math.round(at.y)}; camera ${Math.round(cam.x)},${Math.round(cam.y)}): "${l.text.slice(0, 50)}"`);
    } else if (worldSpeaker(who)) fail("a", `${who} speaks but has no place on the map: "${l.text.slice(0, 50)}"`);
    row("line", `${who ?? l.name}: ${l.text.slice(0, 70)}${place}`);
    lineSnap = null; // taken after this frame is drawn (checkStill)
  }

  // ---- story vehicles (renderer storyprop clock: the drive pauses while the scene holds them)
  const vehicles: { id: string; seq: number; path: readonly { x: number; y: number }[]; seconds: number; t: number; u: number; at: { x: number; y: number }; rider?: number }[] = [];
  const stepVehicles = (dt: number, hold: boolean): void => {
    const w = director.world.vehicles;
    for (let i = vehicles.length - 1; i >= 0; i--) if (!w.some((v) => v.id === vehicles[i]!.id)) vehicles.splice(i, 1);
    for (const v of w) {
      let r = vehicles.find((x) => x.id === v.id);
      if (!r || r.seq !== v.seq) {
        if (r) vehicles.splice(vehicles.indexOf(r), 1);
        r = { id: v.id, seq: v.seq, path: v.path, seconds: v.seconds, t: 0, u: 0, at: { ...v.path[0]! }, ...(v.rider !== undefined ? { rider: v.rider } : {}) };
        vehicles.push(r);
        row("vehicle", `${v.id} drives ${v.path.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" > ")} in ${v.seconds}s`);
      }
      if (!hold) r.t += dt;
      r.u = r.t / Math.max(0.1, r.seconds);
      r.at = alongPath(r.path, Math.min(1, ease(r.u) ** 0.6));
    }
  };

  // ---- movement under a line (b)
  type Snap = Map<string, { x: number; y: number }>;
  let lineSnap: Snap | null = null;
  const snapshot = (): Snap => {
    const m: Snap = new Map();
    m.set("commander", { x: st.player.pos.x, y: st.player.pos.y });
    for (const r of st.residents) m.set(`resident ${r.id}`, { x: r.pos.x, y: r.pos.y });
    for (const h of st.hostiles) m.set(`hostile ${h.id}`, { x: h.pos.x, y: h.pos.y });
    for (const c of st.sales ? [...st.sales.queue, ...st.sales.leaving] : []) m.set(`trader ${c.id}`, { x: c.pos.x, y: c.pos.y });
    for (const a of director.world.actors) { const k = director.castKey(a.who, st); const p = k ? interp.pos(k, { x: Number.NaN, y: Number.NaN }, 1) : null; if (p && Number.isFinite(p.x)) m.set(`${a.who} (staged)`, { x: p.x * FP, y: p.y * FP }); }
    for (const v of vehicles) m.set(`vehicle ${v.id}`, { x: v.at.x * FP, y: v.at.y * FP });
    return m;
  };
  const movedUnderLine = new Set<string>();
  const checkStill = (): void => {
    if (!line) return;
    if (!lineSnap) { lineSnap = snapshot(); return; }
    const now = snapshot();
    for (const [k, p] of now) {
      const q = lineSnap.get(k);
      if (q && (Math.abs(q.x - p.x) > 1 || Math.abs(q.y - p.y) > 1) && !movedUnderLine.has(`${lineAt}|${k}`)) {
        movedUnderLine.add(`${lineAt}|${k}`);
        fail("b", `${k} moved during the line "${line.text.slice(0, 40)}"`);
      }
    }
    // the walk cycle: the renderer poses gait from interp.vel; under a scene every key must read still
    for (const k of ["player", ...st.residents.map((r) => `r:${r.id}`)]) {
      const v = interp.vel(k);
      if ((v.x || v.y) && !movedUnderLine.has(`${lineAt}|gait ${k}`)) { movedUnderLine.add(`${lineAt}|gait ${k}`); fail("b", `${k} walks in place (gait) during the line "${line.text.slice(0, 40)}"`); }
    }
  };

  // ---- guide arrows (d)
  let arrowKey = "";
  const arrowNow = (): { at: { x: number; y: number }; from: string } | null => {
    const w = director.world;
    if (w.guideOff) return null;
    if (w.guideTo) return { at: w.guideTo, from: "story" };
    const g = guide?.update(st, marsGreenhouse);
    return g ? { at: g.at, from: `guide ${g.kind}` } : null;
  };
  const staleArrowSeen = new Set<string>();
  const checkArrow = (scene: boolean): void => {
    const a = scene ? null : arrowNow();
    const key = a ? `${a.from}@${Math.round(a.at.x)},${Math.round(a.at.y)}` : "off";
    if (key !== arrowKey) { arrowKey = key; row("arrow", key); }
    if (!a) return;
    const near = (p: { x: number; y: number }, r = 14): boolean => (p.x / FP - a.at.x) ** 2 + (p.y / FP - a.at.y) ** 2 <= r * r;
    const pad = st.pads.find((p) => near(p.pos));
    const cap = st.captures.find((c) => near(c.pos));
    let bad = "";
    // a finished pad that also holds a live resource node (the grow dome IS the greens field) is a real target, not a stale one
    if (pad?.done && !st.pads.some((p) => !p.done && near(p.pos)) && !st.nodes.some((n) => near(n.pos))) bad = `a pad already done (${pad.id})`;
    else if (pad && !pad.visible) bad = `a hidden pad (${pad.id})`;
    else if (cap?.state === "hidden") bad = `a capture not yet revealed (${cap.id})`;
    if (bad && !staleArrowSeen.has(key)) { staleArrowSeen.add(key); fail("d", `arrow (${a.from}) points at ${bad}`); }
  };

  // ---- frozen stretches (c)
  let deadSince = -1, deadWhy = "";
  const checkFreeze = (): void => {
    const sc = director.scene;
    const reading = sc.on && (sc.why === "line" || sc.why === "film" || sc.why === "card" || sc.why === "goal" || sc.why === "prompt");
    if (sc.on && !reading) {
      if (deadSince < 0) { deadSince = clock; deadWhy = sc.why ?? ""; }
    } else if (deadSince >= 0) {
      const len = clock - deadSince;
      if (len > MAX_DEAD_FREEZE_S) fail("c", `play held ${r1(len)} s with nothing on screen to read (${deadWhy})`);
      if (len > 0.05) row("held", `${r1(len)} s (${deadWhy})`);
      deadSince = -1;
    }
  };

  // ---- the loop
  const stepper = { acc: 0 };
  let ended = false, won: boolean | null = null, endAt = -1, resultShown = false, resultAsked = false;
  const onEvent = (e: SimEvent): void => {
    director.onEvent(e, st);
    if (e.t === "objective") row("objective", `${e.id} ${e.done ? "done" : e.failed ? "failed" : ""}`);
    if (e.t === "level_end") {
      ended = true; won = e.won; endAt = clock;
      row("level_end", `${e.won ? "won" : "lost"} (${e.reason})`);
      const pending = level.cues.filter((c) => !c.repeat && !firedCues.has(c) && "after" in c.on && c.on.after !== undefined && firedIds.has(c.on.after) && !(c.unless !== undefined && firedIds.has(c.unless)));
      for (const c of pending) fail("e", `level ended with cue ${cueName.get(c)} still waiting on ${triggerText(c)}: it can never fire now`, cueName.get(c));
    }
  };
  try {
    while (clock < MAX_SECONDS) {
      clock += FRAME_S;
      for (const f of films.filter((x) => clock >= x.end)) { films.splice(films.indexOf(f), 1); f.done(); }
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      const pp = pendingPrompt as (() => void) | null;
      if (pp) { const p = pp; pendingPrompt = null; row("tap", "prompt: keep playing / see results"); p(); }
      const tf = tapFn as (() => void) | null;
      if (tf && (line || goalCardOn) && clock - lineAt >= TAP_S) tf();
      if (!resultShown) director.update(FRAME_S * 1000, st);
      const playing = !ended && !director.frozen;
      if (playing) {
        stepper.acc += FRAME_S;
        let n = Math.floor(stepper.acc * TPS + 1e-9);
        stepper.acc -= n / TPS;
        for (; n > 0 && !ended; n--) {
          const ev = sim.step(brain.tick(st));
          for (const e of ev) onEvent(e);
          director.afterTick(st);
          if (director.frozen) { stepper.acc = 0; break; }
        }
      }
      // the renderer's frame: staged walkers, scene hold, vehicles, camera
      const sc = director.scene;
      syncActors();
      interp.update(st);
      const movers = new Set(sc.movers.flatMap((w) => { const k = director.castKey(w, st); return k ? [k] : []; }));
      interp.stepStaged(FRAME_S, sc.on, movers);
      stepVehicles(FRAME_S, sc.on && !sc.vehicles);
      cam.lead = leadPoint(st);
      const hero = interp.pos("player", st.player.pos, 0);
      followStep(cam, hero, FRAME_S, fo, cam.zoom, manifest.map, camFirst && cam.follow);
      if (cam.follow) camFirst = false;
      checkStill();
      checkFreeze();
      if (!ended) checkArrow(sc.on);
      if (ended && !resultAsked && clock - endAt >= RESULT_WAIT_S) {
        resultAsked = true;
        const show = (): void => { resultShown = true; row("result", director.pendingStory ? "shown while story still pending" : "shown"); if (director.pendingStory) fail("e", "result card shown while the story queue still has items"); };
        if (!director.holdResult(show)) show();
        else row("result_held", "the result waits for the story queue");
      }
      if (resultShown) break;
    }
    if (!resultShown) fail("e", ended ? "result card never shown (story queue never emptied)" : `level did not end in ${MAX_SECONDS} s`);
  } catch (err) {
    fail("f", `threw: ${err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : String(err)}`);
  }
  return { level: levelId, seed, won, rows, failures };

  function syncActors(): void {
    for (const a of director.world.actors) {
      const k = director.castKey(a.who, st);
      if (!k) continue;
      const sig = `${a.to?.x},${a.to?.y},${a.from?.x},${a.face}`;
      if (staged.get(k) === sig) continue;
      staged.set(k, sig);
      interp.stage(k, a.to, { ...(a.from ? { from: a.from } : {}), ...(a.face ? { face: true } : {}) });
    }
  }
}

const LEAD_RANGE = 150; // app.ts leadPoint
function leadPoint(st: State): { x: number; y: number } | null {
  const p = st.player.pos;
  let best: { x: number; y: number } | null = null, bd = (LEAD_RANGE * FP) ** 2;
  for (const pad of st.pads) {
    if (pad.done || !pad.visible) continue;
    const d = (pad.pos.x - p.x) ** 2 + (pad.pos.y - p.y) ** 2;
    if (d < bd) { bd = d; best = { x: pad.pos.x / FP, y: pad.pos.y / FP }; }
  }
  return best;
}

const ease = (u: number): number => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
function alongPath(path: readonly { x: number; y: number }[], f: number): { x: number; y: number } {
  if (path.length < 2) return { ...path[0]! };
  const seg: number[] = [];
  let len = 0;
  for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y); seg.push(d); len += d; }
  let s = f * len;
  for (let i = 0; i < seg.length; i++) {
    if (s <= seg[i]! || i === seg.length - 1) { const k = seg[i]! > 0 ? Math.min(1, s / seg[i]!) : 1; return { x: path[i]!.x + (path[i + 1]!.x - path[i]!.x) * k, y: path[i]!.y + (path[i + 1]!.y - path[i]!.y) * k }; }
    s -= seg[i]!;
  }
  return { ...path[path.length - 1]! };
}

function triggerText(c: StoryCue): string {
  const o = c.on as Record<string, unknown>;
  const parts = Object.entries(o).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parts.join(" ");
}

function describe(a: StoryAction | { goalCard: string; id: string }): { what: string; detail: string } | null {
  const r = a as Record<string, unknown>;
  if ("line" in r || "crew" in r || "goalCard" in r || "card" in r || "film" in r || "fall" in r || "kneel" in r || "vehicle" in r || "inset" in r) return null; // logged where they show
  const k = Object.keys(r)[0]!;
  if (k === "stage") return { what: "stage", detail: String(r["stage"]) };
  if (k === "walk") return { what: "walk", detail: `${String(r["walk"])} -> ${JSON.stringify(r["to"] ?? null)}` };
  if (k === "camera") return { what: "camera", detail: JSON.stringify(r["camera"]) };
  if (k === "guide") return { what: "guide_cue", detail: `${String(r["guide"])} ${JSON.stringify(r["to"] ?? "")}` };
  if (k === "wait" || k === "freeze" || k === "goal" || k === "tap") return { what: k, detail: String(r[k]) };
  return { what: k, detail: "" };
}

export function traceText(t: StoryTrace): string {
  const head = [
    `# story trace ${t.level} seed ${t.seed} (good bot, phone ${PHONE.cssW}x${PHONE.cssH}, lines tapped after ${TAP_S} s)`,
    `# outcome: ${t.won === null ? "did not end" : t.won ? "won" : "lost"}; failures: ${t.failures.length}`,
    ...t.failures.map((f) => `#   (${f.check}) tick ${f.tick} t ${r1(f.t)} cue ${f.cue}: ${f.message}`),
    `# tick   seconds  cue              what        detail`,
  ];
  const body = t.rows.map((r) => `${String(r.tick).padStart(6)} ${r1(r.t).padStart(8)}  ${r.cue.padEnd(16).slice(0, 16)} ${r.what.padEnd(11)} ${r.detail}`);
  return [...head, ...body].join("\n") + "\n";
}
