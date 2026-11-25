import { PLOT, viewWidth } from "@fo/content";
import { Brain, PROFILES, planBot } from "@fo/bots";
import { createSim, FP, seedRng, TPS, type SimEvent, type State } from "@fo/sim";
import { marsGreenhouse, type SkinStory, type StoryAction, type StoryCue, type StoryLevel } from "@fo/skins";
import { Interp } from "@fo/render-3d/interp";
import { FACE_TOLERANCE, angleDiff, turnToward, yawTo } from "@fo/render-3d/facing";
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
// Check (h), facing (Doug 2026-11-25: "all conversations should have the two speakers facing each other"): the trace keeps each cast
// figure's drawn facing the way the renderer does (the way they last walked; a staged speaker stands turned to the commander; while a line
// is up the talker and listener turn toward each other, render-3d facing.ts), and FACE_CHECK_S after a line shows both must be within
// 30 degrees of pointing at each other. Lines with no listener (spirit voices, a building or a fixed spot speaking) are exempt.
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
const SPEAKER_INSET = 0.06; // a trader speaker's feet point must sit this far inside the frame (the body is drawn above it)
const VEHICLE_HALF_W = 0.2; // a parked story vehicle is about 0.4 of the phone width wide: its centre keeps this far from the side edges
const VEHICLE_HALF_LEN = 30; // world units: a parked story vehicle is about 60 long, so its body must clear a building by this much
const MAX_SECONDS = 1500;
/** Facing is checked this long after a line shows: the turn (render-3d facing.ts) is done by then. */
const FACE_CHECK_S = 1;

export interface TraceRow { tick: number; t: number; cue: string; what: string; detail: string }
export interface TraceFailure { check: "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h"; tick: number; t: number; cue: string; message: string }
export interface StoryTrace { level: string; seed: number; won: boolean | null; rows: TraceRow[]; failures: TraceFailure[] }

export interface TraceOpts {
  seed?: number;
  /** Replace the level's story data (a test feeds an old version). */
  level?: StoryLevel;

  skinStory?: SkinStory;
  /** Model the renderer's conversation facing (default true). False plays the old renderer, where a speaker only faces the way they last walked: a test uses it to show check (h) catches that. */
  faceTalk?: boolean;
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
    inFrame: (p, margin) => onScreen(projectPoint(p, 0, cam, fo, cam.zoom), fo, margin ?? IN_FRAME_MARGIN),
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
        if ("camera" in n.start) { const to = n.start.camera.to; beatTo = "entity" in to ? host.entityAt(to.entity) : "at" in to ? { x: to.at[0], y: to.at[1] } : null; beatAt = clock; }
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
      // a trader (Sela) must stand well inside the frame, not just have her feet point on it (half a figure cut at the edge fails)
      const inF = onScreen(q, fo, director.customerOf(who ?? "") !== null ? -SPEAKER_INSET : 0);
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
        vehicleAt.set(`${v.id}#${v.seq}`, clock);
        row("vehicle", `${v.id} drives ${v.path.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" > ")} in ${v.seconds}s`);
      }
      if (!hold) r.t += dt;
      r.u = r.t / Math.max(0.1, r.seconds);
      r.at = alongPath(r.path, Math.min(1, ease(r.u) ** 0.6));
    }
  };

  // ---- a parked story vehicle must be fully in frame (a)
  // The camera beat leaves the camera somewhere between the commander and the beat's target, and where the commander stands when it
  // fires is up to the player, so the vehicle must also be in frame for a camera centred on the target (the commander at the kiosk door).
  let beatTo: { x: number; y: number } | null = null, beatAt = -99;
  const vehicleAt = new Map<string, number>();
  const vehicleChecked = new Set<string>();
  const checkVehicles = (): void => {
    for (const v of vehicles) {
      const key = `${v.id}#${v.seq}`;
      if (v.u < 1 || vehicleChecked.has(key)) continue;
      vehicleChecked.add(key);
      const q = projectPoint(v.at, 0, cam, fo, cam.zoom);
      const inside = (p: { x: number; y: number }): boolean => p.x >= fo.cssW * VEHICLE_HALF_W && p.x <= fo.cssW * (1 - VEHICLE_HALF_W) && p.y >= 0 && p.y <= fo.cssH;
      const bt = beatTo && Math.abs((vehicleAt.get(key) ?? -99) - beatAt) < 0.1 ? beatTo : null; // only a beat fired in the same frame (the same cue)
      const q2 = bt ? projectPoint(v.at, 0, { ...cam, x: bt.x, y: bt.y }, fo, cam.zoom) : q;
      const ok = inside(q) && inside(q2);
      row("vehicle_parked", `${v.id} at ${Math.round(v.at.x)},${Math.round(v.at.y)} screen ${Math.round(q.x)},${Math.round(q.y)}${bt ? ` (camera on the beat target: ${Math.round(q2.x)},${Math.round(q2.y)})` : ""} of ${fo.cssW}x${fo.cssH}${ok ? "" : " NOT FULLY IN FRAME"}`);
      if (!ok) fail("a", `${v.id} parks at ${Math.round(v.at.x)},${Math.round(v.at.y)} partly out of frame (screen ${Math.round(q.x)},${Math.round(q.y)}, on the beat target ${Math.round(q2.x)},${Math.round(q2.y)}, of ${fo.cssW}x${fo.cssH}; camera ${Math.round(cam.x)},${Math.round(cam.y)})`);
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
    if (!lineSnap) { lineSnap = snapshot(); checkInside(); return; }
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

  // ---- nobody stands inside a built building while a line is up (g)
  // A building draws see-through around anyone inside its box (the hero fades it), so the players could not see what they built
  // (Doug 2026-11-24, Level 3's hub). The speaker, the commander and every story vehicle, as DRAWN, must be outside every built
  // structure's body box (content plot.json bodies, relative to the structure).
  const checkInside = (): void => {
    if (!line) return;
    const bodies = PLOT?.generator.bodies ?? {};
    const boxes = st.structures.flatMap((s) => { const b = bodies[s.type]; return b ? [{ id: s.type, x0: s.pos.x / FP + b[0], y0: s.pos.y / FP + b[1], x1: s.pos.x / FP + b[2], y1: s.pos.y / FP + b[3] }] : []; });
    if (!boxes.length) return;
    const who: [string, { x: number; y: number } | null, number][] = [["commander", interp.pos("player", st.player.pos, 1), 0]];
    if (line.who && line.who !== "commander" && worldSpeaker(line.who)) who.push([line.who, speakerAt(line.who), 0]);
    for (const v of vehicles) who.push([`vehicle ${v.id}`, v.at, VEHICLE_HALF_LEN]);
    for (const [name, p, m] of who) {
      const b = p && boxes.find((x) => p.x > x.x0 - m && p.x < x.x1 + m && p.y > x.y0 - m && p.y < x.y1 + m);
      if (p && b) fail("g", `${name} stands inside a built ${b.id} (at ${Math.round(p.x)},${Math.round(p.y)}; its body x ${Math.round(b.x0)}-${Math.round(b.x1)}, y ${Math.round(b.y0)}-${Math.round(b.y1)}) while a line is up: "${line.text.slice(0, 40)}"`);
    }
  };

  // ---- facing (h)
  const faceTalk = opts.faceTalk !== false;
  const figureCast = (who: string): boolean => { const c = who === "commander" ? { player: true } : level.cast?.[who]; return !!c && ("player" in c || "capture" in c || "person" in c || "boss" in c || "customer" in c); };
  const figures = (): string[] => ["commander", ...Object.keys(level.cast ?? {}).filter(figureCast)];
  const figurePos = (who: string): { x: number; y: number } | null => who === "commander" ? interp.pos("player", st.player.pos, 1) : speakerAt(who);
  const yaws = new Map<string, number>();
  const lastAt = new Map<string, { x: number; y: number }>();
  const faceChecked = new Set<string>();
  /** The renderer's frame, in the trace: walkers face their way, a staged speaker stands turned to the commander, a line turns its two speakers to each other. */
  const stepFacing = (): void => {
    const w = director.world;
    for (const who of figures()) {
      const at = figurePos(who);
      if (!at) continue;
      const prev = lastAt.get(who);
      lastAt.set(who, { ...at });
      let yaw = yaws.get(who) ?? 0;
      if (prev && Math.hypot(at.x - prev.x, at.y - prev.y) > 0.01) yaw = Math.atan2(at.x - prev.x, at.y - prev.y);
      else {
        const key = who === "commander" ? "player" : director.castKey(who, st);
        const me = interp.pos("player", st.player.pos, 1);
        if (key && who !== "commander" && interp.facesPlayer(key)) yaw = yawTo(at, me);
      }
      yaws.set(who, yaw);
    }
    if (!faceTalk || !line || !w.talker || !w.listener) return;
    for (const [who, other] of [[w.talker, w.listener], [w.listener, w.talker]] as const) {
      const a = figurePos(who), b = figurePos(other);
      if (a && b) yaws.set(who, turnToward(yaws.get(who) ?? 0, yawTo(a, b), FRAME_S));
    }
  };
  const checkFacing = (): void => {
    const w = director.world;
    if (!line || !w.talker || !w.listener || clock - lineAt < FACE_CHECK_S) return;
    const key = `${lineAt}`;
    if (faceChecked.has(key)) return;
    faceChecked.add(key);
    const a = figurePos(w.talker), b = figurePos(w.listener);
    if (!a || !b) return;
    const bad: string[] = [];
    for (const [who, p, q] of [[w.talker, a, b], [w.listener, b, a]] as const) {
      const off = Math.abs(angleDiff(yaws.get(who) ?? 0, yawTo(p, q)));
      if (off > FACE_TOLERANCE) bad.push(`${who} faces ${Math.round((yaws.get(who) ?? 0) * 180 / Math.PI)} deg, ${Math.round(off * 180 / Math.PI)} off the ${who === w.talker ? w.listener : w.talker}`);
    }
    if (bad.length) fail("h", `speakers do not face each other: ${bad.join("; ")} during "${line.text.slice(0, 40)}"`);
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
      const hero = interp.isStaged("player") ? { x: st.player.pos.x / FP, y: st.player.pos.y / FP } : interp.pos("player", st.player.pos, 0);
      followStep(cam, hero, FRAME_S, fo, cam.zoom, manifest.map, camFirst && cam.follow);
      if (cam.follow) camFirst = false;
      checkVehicles();
      stepFacing();
      checkStill();
      checkFacing();
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
