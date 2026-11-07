import { content } from "@fo/content";
import { Brain, PROFILES, planBot } from "@fo/bots";
import { FP, seedRng, type Input, type SimEvent, type State } from "@fo/sim";
import type { App } from "../app.js";
import { STORY_CINEMATICS } from "../cinematics.js";
import type { Box, CaptionSample, DomItem, FilmEnd, FrameRec, LabelSample, ReviewApi, Sample, StorySnapshot, ThingSample } from "../../../../tools/review/probe-types.js";

// Dev-only review probes (window.R), loaded by main.ts in dev builds next to dev/playtest.ts. Read-only
// measurements of the running game for tools/review/probe.ts: the boxes of everything on screen, where
// each model and character is and how high it stands, what the story caption sits over, a frame-time log
// with the sim events that came before each frame, and the errors. Nothing here changes the game's rules
// or its picture; the one thing it does is let a bot play the level in real time (R.drive).

const EV_KEEP = 8;
const FRAME_CAP = 40_000;
const STATE_ROUND = 10;


declare global { interface Window { R?: ReviewApi; __live?: { at?: number; wire?: boolean }; __liveStaged?: unknown } }

const r1 = (n: number): number => Math.round(n * STATE_ROUND) / STATE_ROUND;
const box = (b: { left: number; top: number; right: number; bottom: number }): Box => ({ x0: b.left, y0: b.top, x1: b.right, y1: b.bottom });

const STATE_CLASSES = new Set(["on", "off", "in", "out", "free", "below", "day", "fly", "armed", "story-hide", "show", "open", "done", "missed", "earned", "empty", "cracked", "go", "small", "wide-btn"]);
const INTERACTIVE = "button, a[href], input, select, textarea, [role=button], [data-a], [data-k]";

/** A stable name for an element: its id, or tag.class under the nearest parent that has one. */
function selOf(el: Element): string {
  const own = (e: Element): string => {
    if (e.id) return `#${e.id}`;
    const cls = [...e.classList].filter((c) => !STATE_CLASSES.has(c) && !/\d/.test(c)).slice(0, 2);
    return cls.length ? `${e.tagName.toLowerCase()}.${cls.join(".")}` : e.tagName.toLowerCase();
  };
  const me = own(el);
  if (me.startsWith("#")) return me;
  for (let p = el.parentElement; p && !p.classList.contains("app"); p = p.parentElement) {
    const o = own(p);
    if (o.startsWith("#") || o.includes(".")) return `${o}>${me}`;
  }
  return me;
}

const regionOf = (el: Element): DomItem["region"] =>
  el.closest(".story-layer, .sdlg-bubble, .sdlg-strip, .sdlg-term") ? "story"
  : el.closest(".toast, .ftoast") ? "toast"
  : el.closest(".overlay") ? "overlay"
  : el.closest(".fhud") ? "hud"
  : el.closest("#world") ? "world"
  : "other";

const rgba = (c: string): [number, number, number, number] | null => {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return null;
  const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
};

/** The nearest ancestor background that is solid enough to read against; null when the element sits over the world. */
function backdrop(el: Element): string | null {
  for (let p: Element | null = el; p && !p.classList.contains("app"); p = p.parentElement) {
    const c = getComputedStyle(p).backgroundColor, a = rgba(c);
    if (a && a[3] >= 0.55) return c;
    if (p.id === "world" || p.id === "stage") return null;
  }
  return null;
}

/** Union of an element's own text boxes (a block element's own box is often far wider than its words). */
function textBox(el: Element, doc: Document): Box | null {
  let b: Box | null = null;
  const range = doc.createRange();
  for (const n of el.childNodes) {
    if (n.nodeType !== 3 || !n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      b = b ? { x0: Math.min(b.x0, r.left), y0: Math.min(b.y0, r.top), x1: Math.max(b.x1, r.right), y1: Math.max(b.y1, r.bottom) } : box(r);
    }
  }
  return b;
}

function scanDom(root: Element): DomItem[] {
  const doc = root.ownerDocument;
  const out: DomItem[] = [];
  const walk = (el: Element, parentOp: number, up: number): void => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || (el as HTMLElement).hidden) return;
    const op = parentOp * Number.parseFloat(cs.opacity);
    if (!(op >= 0.05)) return;
    const tag = el.tagName.toLowerCase();
    let here = up;
    if (tag !== "canvas" && tag !== "video" && tag !== "script" && tag !== "style") {
      // cursor:pointer is inherited, so only the outermost element of a pointer run counts as a target
      const tap = el.matches(INTERACTIVE) || (cs.cursor === "pointer" && cs.pointerEvents !== "none" && (!el.parentElement || getComputedStyle(el.parentElement).cursor !== "pointer"));
      const icon = tag === "svg" || tag === "img";
      const own = textBox(el, doc);
      let b: Box | null = null;
      let text = "";
      if (tap) { b = box(el.getBoundingClientRect()); text = (el.textContent ?? "").trim() || el.getAttribute("aria-label") || ""; }
      else if (own) { b = own; text = (el.textContent ?? "").trim(); }
      else if (icon && !el.closest(INTERACTIVE)) { b = box(el.getBoundingClientRect()); text = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? ""; }
      if (b && b.x1 - b.x0 >= 2 && b.y1 - b.y0 >= 2 && (tap || own || icon)) {
        here = out.length;
        out.push({
          parent: up, sel: selOf(el), text: text.replace(/\s+/g, " ").slice(0, 60), box: b, region: regionOf(el), tap,
          fontPx: Number.parseFloat(cs.fontSize) || 0, color: cs.color, bg: backdrop(el),
          outlined: cs.textShadow !== "none" || cs.webkitTextStrokeWidth !== "0px", opacity: Math.round(op * 100) / 100,
        });
      }
    }
    if (el.tagName.toLowerCase() === "svg") return; // an icon is one item, not its paths
    for (const c of el.children) walk(c, op, here);
  };
  walk(root, 1, -1);
  return out;
}

/** CSS safe-area insets (a notch's reserve), read through a probe element so env() resolves. */
function safeInsets(doc: Document): Sample["safe"] {
  const el = doc.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  doc.body.append(el);
  const cs = getComputedStyle(el);
  const out = { top: Number.parseFloat(cs.paddingTop) || 0, right: Number.parseFloat(cs.paddingRight) || 0, bottom: Number.parseFloat(cs.paddingBottom) || 0, left: Number.parseFloat(cs.paddingLeft) || 0 };
  el.remove();
  return out;
}

const CAPTION_SEL = ".sdlg-bubble, .sdlg-strip, .sdlg-term";
const PERSON_H = 50.4;

export function installReview(app: App): void {
  const doc = document;
  let t0 = performance.now();
  const frames: FrameRec[] = [];
  let lastEv = "", recent: string[] = [], hookedSim: object | null = null, hookedRen: object | null = null, hookedDir: object | null = null, lineSeq = 0, skipSync = false, stepMs = 0, prevSync = performance.now();
  const errors: string[] = [];

  // errors: uncaught, unhandled rejections and console.error, with the level they came in
  const note = (m: string): void => { if (errors.length < 200) errors.push(`${app.debugView?.levelId ?? "-"}: ${m.slice(0, 200)}`); };
  window.addEventListener("error", (e) => note(e.message || String(e.error)));
  window.addEventListener("unhandledrejection", (e) => note(e.reason instanceof Error ? e.reason.message : String(e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => { note(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ")); ce(...a); };

  // The frame log. step() and the renderer's sync() are wrapped once per level and pass everything through:
  // a frame's CPU cost is the slowest single sim tick since the last draw (a real frame holds about one) plus the
  // draw's own JavaScript (the GPU's share is not in it, and the software GL a headless run uses would drown it),
  // and the events of those steps are what it is blamed on.
  const hook = (): void => {
    const sim = app.debugSim;
    if (sim && sim !== hookedSim) {
      hookedSim = sim;
      const step = sim.step.bind(sim);
      (sim as { step: (i: Input) => SimEvent[] }).step = (i) => {
        const t = performance.now();
        const ev = step(i);
        stepMs = Math.max(stepMs, performance.now() - t);
        for (const e of ev) { lastEv = e.t; if (recent[recent.length - 1] !== e.t) { recent.push(e.t); if (recent.length > EV_KEEP) recent.shift(); } }
        return ev;
      };
    }
    // each line the story director shows is counted, so a typed-out line is one line, not one per letter
    const dir = app.debugView?.director;
    if (dir && dir !== hookedDir) {
      hookedDir = dir;
      const line = dir.view.line.bind(dir.view);
      dir.view.line = (l) => { lineSeq++; line(l); };
    }
    const ren = app.debugView?.renderer;
    if (ren && ren !== hookedRen) {
      hookedRen = ren;
      const sync = ren.sync.bind(ren);
      ren.sync = (st, a, cam) => {
        if (skipSync) return; // fast-forward: the sim and the story run, nothing is drawn
        const t = performance.now();
        sync(st, a, cam);
        const now = performance.now();
        if (frames.length >= FRAME_CAP) frames.splice(0, FRAME_CAP / 4);
        frames.push({ t: Math.round(now), dt: Math.round((now - prevSync) * 10) / 10, cpu: Math.round((stepMs + now - t) * 10) / 10, step: Math.round(stepMs * 10) / 10, tick: st.tick, ev: recent, last: lastEv });
        recent = []; stepMs = 0; prevSync = now;
      };
    }
  };
  const attach = (): void => { requestAnimationFrame(attach); hook(); };
  requestAnimationFrame(attach);

  let driver: { brain: Brain; sim: object } | null = null;
  const inputOf = (app as unknown as { input: { read: () => Input } }).input;
  const realRead = inputOf.read.bind(inputOf);
  inputOf.read = (): Input => {
    const sim = app.debugSim;
    if (!driver || !sim) return realRead();
    if (driver.sim !== sim) { driver = null; return realRead(); }
    return driver.brain.tick(sim.state);
  };

  /** Pods in tow or opening bob above the ground on purpose (renderer syncCaptures): their base is allowed that high. */
  const deliberateLift = (key: string, ruleY: number, st: State): number => {
    const m = /^cap:(d+)$/.exec(key);
    const c = m ? st.captures.find((x) => x.id === Number(m[1])) : undefined;
    return c && (c.state === "towed" || c.state === "releasing") ? Math.max(ruleY, 5) : ruleY;
  };

  const mountOffset = (): { x: number; y: number } => {
    const r = doc.getElementById("world")?.getBoundingClientRect();
    return { x: r?.left ?? 0, y: r?.top ?? 0 };
  };

  const snap = (): Sample | null => {
    const v = app.debugView, sim = app.debugSim;
    if (!v || !sim) return null;
    const o = mountOffset();
    const sc = v.renderer.debugScene();
    const shift = (b: { x0: number; y0: number; x1: number; y1: number }): Box => ({ x0: b.x0 + o.x, y0: b.y0 + o.y, x1: b.x1 + o.x, y1: b.y1 + o.y });
    const things: ThingSample[] = (sc?.things ?? []).map((t) => ({
      key: t.key, id: t.id, kind: t.kind, box: shift(t.screen), depth: t.depth, head: t.head ? { x: t.head.x + o.x, y: t.head.y + o.y } : null, feet: t.feet ? { x: t.feet.x + o.x, y: t.feet.y + o.y } : null,
      baseY: t.min[1], ruleY: deliberateLift(t.key, t.ruleY, sim.state), topY: t.max[1], foot: { x0: t.min[0], z0: t.min[2], x1: t.max[0], z1: t.max[2] }, age: t.age,
    }));
    const labels: LabelSample[] = (sc?.labels ?? []).map((l) => ({ key: l.key, box: shift(l.screen), depth: l.depth, world: { x: l.world.x, y: l.world.y, z: l.world.z } }));
    return {
      t: Math.round(performance.now() - t0), tick: sim.state.tick, levelId: v.levelId, screen: v.screen,
      viewport: { w: window.innerWidth, h: window.innerHeight }, safe: safeInsets(doc),
      dom: scanDom(doc.querySelector(".app") ?? doc.body), things, labels, caption: caption(v, sim.state, things, o), lighting: sc?.lighting ?? null,
      cam: sc ? { x: sc.camera.x, z: sc.camera.z, fx: sc.forward.x, fz: sc.forward.z } : { x: 0, z: 0, fx: -0.7071, fz: -0.7071 },
    };
  };

  /** The line on screen and who says it: the bubble's box, the speaker's box and head point. */
  const caption = (v: NonNullable<typeof app.debugView>, st: State, things: ThingSample[], o: { x: number; y: number }): CaptionSample | null => {
    const el = [...doc.querySelectorAll<HTMLElement>(CAPTION_SEL)].find((e) => !e.hidden && getComputedStyle(e).display !== "none");
    if (!el) return null;
    const style = el.classList.contains("sdlg-bubble") ? "bubble" : el.classList.contains("sdlg-strip") ? "strip" : el.classList.contains("sdlg-term") ? "terminal" : "other";
    const talker = v.director?.world.talker ?? null;
    let head: { x: number; y: number } | null = null, feet: { x: number; y: number } | null = null;
    if (talker && v.director) {
      const key = v.director.castKey(talker, st);
      const speaker = key ? things.find((t) => t.key === key) ?? null : null;
      head = speaker?.head ?? null;
      feet = speaker?.feet ?? null;
      if (!head || !feet) {
        // not drawn by the renderer's characters (a crowd figure, or off the map): where the sim has them, at a person's height
        const at = v.director.castAt(talker, st);
        if (at) { const h = v.renderer.worldToScreen(at, PERSON_H), f = v.renderer.worldToScreen(at, 0); head = { x: h.x + o.x, y: h.y + o.y }; feet = { x: f.x + o.x, y: f.y + o.y }; }
      }
    }
    // the speaker as a tight box from head to feet (a thing's own box is the projection of its 3D bounds, wider than the figure)
    const tall = head && feet ? Math.max(1, feet.y - head.y) : 0;
    const speakerBox = head && feet ? { x0: head.x - tall * 0.2, x1: head.x + tall * 0.2, y0: head.y, y1: feet.y } : null;
    return { sel: selOf(el), style, box: box(el.getBoundingClientRect()), text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120), speaker: talker, speakerBox, head };
  };

  const state = (): StorySnapshot | null => {
    const v = app.debugView, sim = app.debugSim;
    if (!v || !sim) return null;
    const st = sim.state;
    const sc = v.renderer.debugScene();
    return {
      levelId: v.levelId, tick: st.tick,
      player: { x: r1(st.player.pos.x / FP), y: r1(st.player.pos.y / FP), carry: [...st.player.stack], hp: st.player.hp, tow: st.player.tow.length },
      residents: st.residents.map((r) => ({ id: r.id, role: r.role, status: r.status, x: r1(r.pos.x / FP), y: r1(r.pos.y / FP), carry: r.carry })),
      traders: st.sales ? [...st.sales.queue, ...st.sales.leaving].map((c) => ({ id: c.id, kind: c.kind, x: r1(c.pos.x / FP), y: r1(c.pos.y / FP) })) : [],
      captures: st.captures.map((c) => ({ id: c.id, type: c.type, state: c.state, x: r1(c.pos.x / FP), y: r1(c.pos.y / FP) })),
      hostiles: st.hostiles.length, built: [...st.built], core: { fuel: st.core.fuel, level: st.core.level, lit: st.stats.litTick !== undefined },
      lighting: sc?.lighting ?? null, cast: [],
    };
  };

  const filmEnd = async (film: string): Promise<FilmEnd | null> => {
    // a live scene held on a far-off second poses its last frame; its staging and canvas can be read for a moment
    window.__live = { at: 1e4 };
    let out: FilmEnd | null = null;
    const seen = new MutationObserver(() => {
      const staged = window.__liveStaged as { scene?: { traverse(f: (o: unknown) => void): void } } | undefined;
      const canvas = doc.querySelector<HTMLCanvasElement>(".cine.live canvas");
      if (!staged?.scene || !canvas || out) return;
      const objects: FilmEnd["objects"] = [], lights: FilmEnd["lights"] = [];
      staged.scene.traverse((o) => {
        const n = o as { name?: string; isLight?: boolean; type?: string; intensity?: number; color?: { getHexString(): string }; getWorldPosition(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } };
        if (n.isLight) lights.push({ kind: String(n.type), intensity: Math.round((n.intensity ?? 0) * 100) / 100, color: n.color?.getHexString() ?? "" });
        else if (n.name) { const p = n.getWorldPosition({ x: 0, y: 0, z: 0 }); objects.push({ name: n.name, x: r1(p.x), y: r1(p.y), z: r1(p.z) }); }
      });
      let png = "";
      try { png = canvas.toDataURL("image/png"); } catch { /* the canvas cannot be read */ }
      out = { film, objects, lights, png };
    });
    seen.observe(doc.body, { childList: true, subtree: true });
    try {
      await app.debugCinematic(film as Parameters<App["debugCinematic"]>[0]);
    } finally { seen.disconnect(); delete window.__live; }
    return out;
  };

  const api: ReviewApi = {
    version: 1,
    async play(id) {
      driver = null;
      frames.length = 0; recent = []; lastEv = ""; hookedSim = null; hookedRen = null; hookedDir = null; lineSeq = 0; stepMs = 0;
      const ok = await app.debugPlay(id);
      t0 = performance.now();
      prevSync = t0;
      hook();
      return ok;
    },
    snap,
    drive(profile, seed = 1) {
      const sim = app.debugSim;
      if (!profile || !sim) { driver = null; return !profile; }
      const prof = PROFILES[profile];
      if (!prof) return false;
      const cp = sim.compiled;
      driver = { brain: new Brain(cp, planBot(cp.manifest, content), prof, seedRng(seed)), sim };
      return true;
    },
    stepBot(ticks) {
      const d = driver, sim = app.debugSim;
      if (!d || !sim || d.sim !== sim) return null;
      hook();
      const tick = app.debugRun((st) => d.brain.tick(st), ticks);
      const st = sim.state;
      return { tick, over: st.over, won: st.won, reason: st.reason };
    },
    ff(seconds, seenSeq) {
      // Runs the game's own frame function on a made-up clock, 1/30 s a frame, without drawing, so a story that
      // needs minutes of play does not wait on a slow GPU. Stops at the first caption that is not `seen`.
      const a = app as unknown as { frame: (now: number) => void; last: number };
      const v0 = app.debugView;
      if (!v0) return { tick: -1, seq: lineSeq, over: true };
      hook();
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (() => 0) as typeof raf;
      skipSync = true;
      let now = performance.now();
      a.last = now;
      try {
        for (let i = 0; i < seconds * 30 && !app.debugView?.ended && lineSeq === seenSeq; i++) { now += 1000 / 30; a.frame(now); }
      } finally {
        window.requestAnimationFrame = raf;
        skipSync = false;
        a.last = performance.now();
      }
      const st = app.debugSim?.state;
      return { tick: st?.tick ?? -1, seq: lineSeq, over: !!app.debugView?.ended || !!st?.over };
    },
    settle(frames) {
      // a few drawn frames on the made-up clock, so a caption finds its place over its speaker
      const a = app as unknown as { frame: (now: number) => void; last: number };
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (() => 0) as typeof raf;
      let now = performance.now();
      a.last = now;
      try { for (let i = 0; i < frames; i++) { now += 1000 / 30; a.frame(now); } } finally { window.requestAnimationFrame = raf; a.last = performance.now(); }
      app.debugView?.director?.view.finishLine?.(); // a typed-out line shows whole
    },
    frames: (from = 0) => ({ total: frames.length, frames: frames.slice(from) }),
    errors: () => errors.slice(),
    state,
    filmEnd,
    visibility(visible) {
      Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => (visible ? "visible" : "hidden") });
      Object.defineProperty(doc, "hidden", { configurable: true, get: () => !visible });
      doc.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event(visible ? "pageshow" : "pagehide"));
    },
    levelMs: () => Math.round(performance.now() - t0),
    palette: () => ({ ...(app as unknown as { skin: { palette: Record<string, unknown> } }).skin.palette }),
    films(levelId) {
      const skin = (app as unknown as { skin: { story?: { levels?: Record<string, unknown> } } }).skin;
      const ids = new Set<string>();
      const before = STORY_CINEMATICS[levelId]?.before;
      if (before) ids.add(before);
      for (const m of JSON.stringify(skin.story?.levels?.[levelId] ?? {}).matchAll(/"film":"([a-z_]+)"/g)) ids.add(m[1]!);
      return [...ids];
    },
  };
  window.R = api;
}
