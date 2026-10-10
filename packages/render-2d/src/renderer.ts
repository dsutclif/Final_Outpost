import { content as defaultContent, type Content, type Manifest } from "@fo/content";
import { FP, TPS, compile, safeRadius, type Compiled, type SimEvent, type State } from "@fo/sim";
import { alpha, floaterText, hintText, nameOf, uiText, type Skin } from "@fo/skins";
import { LEAD_WEIGHT, type Camera, type Renderer } from "./contract.js";
import type { DC, PadInfo } from "./draw/dc.js";
import { padLabel } from "./draw/pads.js";
import { drawEntity } from "./draw/registry.js";
import { structuresFromBuiltPads } from "./draw/structures.js";
import { lifelineK } from "./draw/units.js";
import { drawGround } from "./draw/world.js";
import { drawCoach, drawPointer, iconFor, type CoachMark, type PointerIcon } from "./draw/overlay.js";
import { Fx } from "./fx.js";
import { Interp } from "./interp.js";
import type { V, WorldView } from "./view.js";
// Group files register their draw routines on import.
import "./draw/stations.js";
import "./draw/pads.js";
import "./draw/units.js";
import "./draw/structures.js";
import "./draw/defense.js";
import "./draw/world.js";

export type { CoachMark } from "./draw/overlay.js";

/**
 * Logical stage width in world units; the canvas scales this to the device width. 440 of the
 * 480-unit map, so pads on the map edges sit fully on screen once the camera clamps (the
 * playtest found edge pads half off-screen at 400), and the camera leans toward Camera.lead.
 */
export const STAGE_W = 440;

export type Quality = "low" | "medium" | "high";
const DPR_CAP: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
const DENSITY: Record<Quality, number> = { low: 0.4, medium: 0.75, high: 1 };

export interface Renderer2DOptions {
  /** Clock in milliseconds; injectable for tests. */
  now?: () => number;
  /** Device pixel ratio source; injectable for tests. */
  dpr?: () => number;
  content?: Content;
  quality?: Quality;
}

interface Job { layer: number; y: number; type: string; e: unknown }

// Storm streaks: fixed seeds so the overlay allocates nothing per frame.
const STREAKS = Array.from({ length: 90 }, (_, i) => ({ sx: (i * 97.3) % 1, sy: (i * 53.71) % 1, sp: 0.8 + ((i * 7) % 5) * 0.12, len: 8 + (i % 4) * 6 }));

/** Canvas 2D renderer (Contract 2). Draws from state every frame; events add juice only. */
export class Renderer2D implements Renderer {
  private mount: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private groundCache: HTMLCanvasElement | null = null;
  private frost: HTMLCanvasElement | null = null;
  private hintEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private manifest!: Manifest;
  private skin!: Skin;
  private cp: Compiled | null = null;
  private readonly content: Content;
  private pads = new Map<string, PadInfo>();
  private interp = new Interp();
  private fx = new Fx();
  private world: WorldView | null = null;
  private cssW = 400;
  private cssH = 700;
  private dpr = 1;
  private scale = 1;
  private viewW = STAGE_W;
  private viewH = 700;
  private camReady = false;
  private t0 = 0;
  private last = 0;
  private t = 0;
  private moving = 0;
  private sway = { x: 0, y: 0 };
  private swayV = { x: 0, y: 0 };
  private hintUntil = 0;
  private hintTop = false;
  private bannerText = "";
  private bannerKind = "";
  private bannerUntil = 0;
  private baseFlash = 0;
  private coach: CoachMark | null = null;
  private quality: Quality;
  private changes = new Map<string, { v: string; t: number }>();
  private readonly nowFn: () => number;
  private readonly dprFn: () => number;
  private lastCam = { x: 0, y: 0, zoom: 1 };
  private wasOutside = false;
  /** Screen point (canvas CSS px) where coins fly to; the client points it at the currency chip. */
  hudAnchor: () => V = () => ({ x: 36, y: -14 });

  constructor(opts: Renderer2DOptions = {}) {
    this.nowFn = opts.now ?? (() => (globalThis.performance?.now?.() ?? Date.now()));
    this.dprFn = opts.dpr ?? (() => (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
    this.content = opts.content ?? defaultContent;
    this.quality = opts.quality ?? "high";
    this.fx.density = DENSITY[this.quality];
  }

  set onCoinLanded(fn: (() => void) | null) { this.fx.onCoinLanded = fn; }

  /** Change the quality tier (canvas resolution and particle density). */
  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.fx.density = DENSITY[q];
    this.resize(this.cssW, this.cssH);
  }

  /** Jump the camera onto the hero on the next sync (after a teleport or a scripted run). */
  snapCamera(): void { this.camReady = false; }

  /** Contextual coach mark (world units), or null to hide it. Purely visual; never blocks input. */
  setCoach(c: CoachMark | null): void {
    if (c && this.coach && c.key === this.coach.key) { this.coach.at = c.at; this.coach.text = c.text; return; }
    this.coach = c ? { ...c, since: this.t } : null;
  }

  init(manifest: Manifest, skin: Skin, mount: HTMLElement): void {
    this.dispose();
    this.manifest = manifest;
    this.skin = skin;
    this.mount = mount;
    try { this.cp = compile(manifest, this.content); } catch { this.cp = null; }
    this.buildPadInfo();
    const doc = mount.ownerDocument;
    injectStyle(doc);
    const canvas = doc.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    mount.appendChild(canvas);
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.hintEl = doc.createElement("div");
    this.hintEl.className = this.hintCls = "fo-hint";
    this.shownBanner = "";
    this.shownKind = "";
    mount.appendChild(this.hintEl);
    this.bannerEl = doc.createElement("div");
    this.bannerEl.className = "fo-banner";
    this.bannerEl.style.display = "none";
    mount.appendChild(this.bannerEl);
    this.interp.reset();
    this.fx.clear();
    this.coach = null;
    this.camReady = false;
    this.t0 = this.nowFn();
    this.last = this.t0;
    const r = mount.getBoundingClientRect?.();
    this.resize(r?.width || mount.clientWidth || 400, r?.height || mount.clientHeight || 700);
  }

  private buildPadInfo(): void {
    this.pads.clear();
    const byId = new Map<string, { type: string }>();
    for (const e of this.manifest.entities) if (e.id !== undefined) byId.set(e.id, e);
    const lbl = { name: (id: string) => nameOf(this.skin, id), ui: (k: string, v?: Record<string, string | number>) => uiText(this.skin, k, v) };
    let coreLevel = 1;
    for (const e of this.manifest.entities) if (e.type === "sink.core") coreLevel = (e as { params?: { level?: number } }).params?.level ?? 1;
    for (const e of this.manifest.entities) {
      if (e.type !== "pad.hire" && e.type !== "pad.build") continue;
      const kind = e.type === "pad.hire" ? "hire" : "build";
      const what = e.type === "pad.hire" ? e.role.role : e.build;
      const targetType = e.type === "pad.build" && e.target ? byId.get(e.target)?.type : undefined;
      if (what === "sink.core.level") coreLevel++;
      const info: PadInfo = {
        id: e.id,
        kind,
        cost: { ...e.cost },
        label: padLabel(lbl, kind, what, targetType, coreLevel),
        big: e.type === "pad.build" ? e.big : false,
        what,
      };
      if (e.type === "pad.hire") {
        if (e.role.from) info.from = e.role.from;
        if (e.role.to) info.to = e.role.to;
      }
      if (e.requires?.pad !== undefined) info.requiresPad = e.requires.pad;
      if (e.requires?.coreLevel !== undefined) info.requiresCoreLevel = e.requires.coreLevel;
      if (this.manifest.goal.type === "build" && this.manifest.goal.target === e.id) info.goal = true;
      this.pads.set(e.id, info);
    }
    for (const info of this.pads.values()) if (info.requiresPad) info.requiresLabel = this.pads.get(info.requiresPad)?.label ?? info.requiresPad;
  }

  resize(w: number, h: number): void {
    this.cssW = Math.max(1, w);
    this.cssH = Math.max(1, h);
    this.dpr = Math.min(DPR_CAP[this.quality], Math.max(1, this.dprFn() || 1));
    if (this.canvas) {
      this.canvas.width = Math.max(1, Math.round(this.cssW * this.dpr));
      this.canvas.height = Math.max(1, Math.round(this.cssH * this.dpr));
    }
    this.scale = this.cssW / STAGE_W;
    this.viewW = STAGE_W;
    this.viewH = this.cssH / this.scale;
    this.buildGroundCache();
    this.buildFrost();
  }

  private makeCanvas(w: number, h: number): HTMLCanvasElement | null {
    if (!this.mount) return null;
    try {
      const c = this.mount.ownerDocument.createElement("canvas");
      c.width = Math.max(1, Math.round(w));
      c.height = Math.max(1, Math.round(h));
      return c;
    } catch { return null; }
  }

  private buildGroundCache(): void {
    if (!this.mount || !this.skin) return;
    const W = this.manifest.map.w, H = this.manifest.map.h;
    const k = this.scale * this.dpr;
    const c = this.makeCanvas(W * k, H * k);
    const g = c?.getContext("2d");
    if (!c || !g) { this.groundCache = null; return; }
    g.setTransform(k, 0, 0, k, 0, 0);
    drawGround(g, this.skin, W, H);
    this.groundCache = c;
  }

  /** Edge vignette drawn once per size; frames only change its alpha (no per-frame gradients). */
  private buildFrost(): void {
    const w = this.cssW, h = this.cssH;
    const c = this.makeCanvas(w / 2, h / 2);
    const g = c?.getContext("2d");
    if (!c || !g) { this.frost = null; return; }
    const grad = g.createRadialGradient(w / 4, h / 4, Math.min(w, h) * 0.16, w / 4, h / 4, Math.max(w, h) * 0.38);
    grad.addColorStop(0, "rgba(170,220,255,0)");
    grad.addColorStop(0.6, "rgba(170,220,255,0.35)");
    grad.addColorStop(1, "rgba(200,235,255,1)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w / 2, h / 2);
    this.frost = c;
  }

  dispose(): void {
    this.canvas?.remove();
    this.hintEl?.remove();
    this.bannerEl?.remove();
    this.canvas = null;
    this.g = null;
    this.hintEl = null;
    this.bannerEl = null;
    this.groundCache = null;
    this.frost = null;
    this.mount = null;
    this.world = null;
  }

  // ---------------------------------------------------------------- frame

  sync(state: State, alphaIn: number, cam: Camera): void {
    const g = this.g;
    if (!g || !this.canvas) return;
    const now = this.nowFn();
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t = (now - this.t0) / 1000;
    const a = Math.max(0, Math.min(1, alphaIn));
    const w = state as unknown as WorldView;
    this.world = w;
    this.interp.update(w);
    this.fx.now = this.t;
    this.fx.update(dt);
    this.baseFlash = Math.max(0, this.baseFlash - dt * 3);

    const pl = this.interp.pos("player", w.player.pos, a);
    const v = this.interp.vel("player");
    const sp = Math.min(1, Math.hypot(v.x, v.y) / 4);
    this.moving += (sp - this.moving) * Math.min(1, dt * 10);
    this.stepSway(v, dt);
    this.followCamera(cam, pl, dt);
    const z = cam.zoom || 1;
    this.lastCam = { x: cam.x, y: cam.y, zoom: z };

    const dc = this.makeDC(g, w, a, pl);
    const W = this.manifest.map.w, H = this.manifest.map.h;
    const k = this.scale * this.dpr * z;
    const vw = this.viewW / z, vh = this.viewH / z;
    const shake = this.fx.shake;
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    const ox = cam.x - vw / 2 + sx, oy = cam.y - vh / 2 + sy;
    this.fx.viewX0 = ox;
    this.fx.viewX1 = ox + vw;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.skin.palette.ui.bg;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(k, 0, 0, k, -ox * k, -oy * k);
    if (this.groundCache) g.drawImage(this.groundCache, 0, 0, W, H);
    else drawGround(g, this.skin, W, H);

    for (const job of this.collectJobs(dc)) drawEntity(dc, job.type, job.e as { pos?: V });
    drawEntity(dc, "fx.lasso", {});
    this.fx.drawWorld(dc, pl);
    const coachOn = this.coach && !w.over ? this.coach : null;
    if (coachOn) drawCoach(dc, coachOn, pl, { x0: ox, y0: oy, x1: ox + vw, y1: oy + vh }, false);

    // screen space
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOverlays(dc, ox, oy, k / this.dpr, pl);
    if (coachOn) drawCoach(dc, coachOn, pl, { x0: ox, y0: oy, x1: ox + vw, y1: oy + vh }, true, k / this.dpr, this.cssW, this.cssH);
    this.fx.drawScreen(dc);
    this.updateDom(w, (pl.y - oy) * (k / this.dpr));
  }

  /** The back stack lags behind the hero's motion: a damped spring driven by velocity. */
  private stepSway(v: V, dt: number): void {
    const kSpring = 70, damp = 9;
    const tx = -v.x * 1.6, ty = -Math.abs(v.y) * 0.4;
    this.swayV.x += ((tx - this.sway.x) * kSpring - this.swayV.x * damp) * dt;
    this.swayV.y += ((ty - this.sway.y) * kSpring - this.swayV.y * damp) * dt;
    this.sway.x = Math.max(-9, Math.min(9, this.sway.x + this.swayV.x * dt));
    this.sway.y = Math.max(-5, Math.min(5, this.sway.y + this.swayV.y * dt));
  }

  private followCamera(cam: Camera, target: V, dt: number): void {
    const W = this.manifest.map.w, H = this.manifest.map.h;
    const z = cam.zoom || 1;
    const vw = this.viewW / z, vh = this.viewH / z;
    if (cam.follow) {
      // Aim a little above the hero so the back stack and what lies ahead stay in view, and
      // lean toward the lead point (nearest pad or coach target) when the client gives one.
      const lead = cam.lead;
      const tx = target.x + (lead ? (lead.x - target.x) * LEAD_WEIGHT : 0);
      const ty = target.y - vh * 0.04 + (lead ? (lead.y - target.y) * LEAD_WEIGHT : 0);
      if (!this.camReady) { cam.x = tx; cam.y = ty; this.camReady = true; }
      const e = 1 - Math.exp(-dt * 6);
      cam.x += (tx - cam.x) * e;
      cam.y += (ty - cam.y) * e;
    }
    cam.x = vw >= W ? W / 2 : Math.max(vw / 2, Math.min(W - vw / 2, cam.x));
    cam.y = vh >= H ? H / 2 : Math.max(vh / 2, Math.min(H - vh / 2, cam.y));
  }

  private makeDC(g: CanvasRenderingContext2D, w: WorldView, a: number, pl: V): DC {
    const skin = this.skin;
    const cp = this.cp;
    let safeR = 0;
    let fuelCap = 20;
    if (cp) {
      try { safeR = safeRadius(w as unknown as State, cp) / FP; } catch { safeR = 0; }
      const lv = cp.core.levels[Math.min(Math.max(1, w.core.level), cp.core.levels.length) - 1];
      if (lv) fuelCap = lv.fuelCap;
    }
    const c = w.core.pos;
    const outside = safeR > 0 && (pl.x - c.x / FP) ** 2 + (pl.y - c.y / FP) ** 2 > safeR * safeR;
    if (outside && !this.wasOutside && lifelineK({ world: w } as DC) < 0.999) this.fx.floater(pl.x, pl.y - 52, floaterText(skin, "outside_safe"), "#bfe6ff", 12);
    this.wasOutside = outside;
    return {
      g, skin, pal: skin.palette, content: this.content, manifest: this.manifest, cp, world: w, t: this.t,
      pos: (key, fpPos) => this.interp.pos(key, fpPos, a),
      w: (p) => ({ x: p.x / FP, y: p.y / FP }),
      name: (id) => nameOf(skin, id),
      ui: (key, vars) => uiText(skin, key, vars),
      flash: (key) => this.fx.flashK(key),
      popAge: (key) => this.fx.popAge(key),
      inFlight: (res) => this.fx.inFlightToPlayer(res),
      safeR, fuelCap,
      pads: this.pads,
      registerStaffed: this.registerStaffed(w),
      px: this.scale,
      moving: this.moving,
      since: (key, value) => {
        const ch = this.changes.get(key);
        if (!ch || ch.v !== value) { this.changes.set(key, { v: value, t: this.t }); return 0; }
        return this.t - ch.t;
      },
      vel: (key) => this.interp.vel(key),
      knock: (key) => this.fx.knockOff(key),
      sway: this.sway,
      outside,
      quality: this.quality,
    };
  }

  private registerStaffed(w: WorldView): boolean {
    const s = w.sales;
    if (!s) return false;
    const range = this.cp?.sales.registerRange ?? 30 * FP;
    const near = (p: V, r: number): boolean => (p.x - s.register.x) ** 2 + (p.y - s.register.y) ** 2 < r * r;
    if (near(w.player.pos, range)) return true;
    return (w.residents ?? []).some((r) => r.role === "role.cashier" && (r.status ?? "ok") === "ok" && near(r.pos, 10 * FP));
  }

  private converterManned(w: WorldView, cv: NonNullable<WorldView["converters"]>[number]): boolean {
    const def = this.content.converters[cv.type];
    const op = cv.operatorPos ?? (def ? { x: cv.pos.x + def.operatorOffset[0] * FP, y: cv.pos.y + def.operatorOffset[1] * FP } : null);
    if (!op) return false;
    const r = this.cp?.convParams.playerOperateRange ?? (def?.range ?? 30) * FP;
    const near = (p: V, rr: number): boolean => (p.x - op.x) ** 2 + (p.y - op.y) ** 2 < rr * rr;
    if (near(w.player.pos, r)) return true;
    return (w.residents ?? []).some((x) => x.role === def?.role && (x.status ?? "ok") === "ok" && near(x.pos, this.cp?.convParams.operatorRange ?? 12 * FP));
  }

  private padVisible(w: WorldView, p: NonNullable<WorldView["pads"]>[number], done: Set<string>): boolean {
    if (p.visible !== undefined) return p.visible;
    const req = this.pads.get(p.id)?.requiresPad;
    return req === undefined || done.has(req);
  }

  private padLocked(w: WorldView, p: NonNullable<WorldView["pads"]>[number]): boolean {
    if (p.locked !== undefined) return p.locked;
    const lv = this.pads.get(p.id)?.requiresCoreLevel;
    return lv !== undefined && w.core.level < lv;
  }

  private jobs: Job[] = [];

  /** Everything to draw this frame, ordered by layer then by ground y (painter's order). */
  private collectJobs(dc: DC): Job[] {
    const w = dc.world;
    const jobs = this.jobs;
    jobs.length = 0;
    const y = (p: V | undefined): number => (p ? p.y / FP : 0);
    // layer 0: ground decals
    for (const z of w.preyZones ?? []) jobs.push({ layer: 0, y: z.rect.y / FP, type: "zone.prey", e: { ...z, type: "zone.prey" } });
    for (const z of w.zones ?? []) jobs.push({ layer: 0, y: z.rect.y / FP, type: z.type, e: z });
    jobs.push({ layer: 0, y: 0, type: "sink.core.safe", e: w.core });
    if (w.sales) jobs.push({ layer: 0, y: y(w.sales.register), type: "sink.sales_point.register", e: w.sales });
    for (const cv of w.converters ?? []) jobs.push({ layer: 0, y: y(cv.pos), type: "conv.spot", e: { ...cv, manned: this.converterManned(w, cv) } });
    for (const b of w.barriers ?? []) jobs.push({ layer: 0, y: y(b.a), type: "barrier", e: b });
    // layer 1: pads and drops
    const done = new Set<string>(w.built ?? []);
    for (const p of w.pads ?? []) if (p.done) done.add(p.id);
    for (const p of w.pads ?? []) {
      if (p.done || !this.padVisible(w, p, done)) continue;
      jobs.push({ layer: 1, y: y(p.pos), type: p.type, e: { ...p, locked: this.padLocked(w, p) } });
    }
    for (const d of w.drops ?? []) jobs.push({ layer: 1, y: y(d.pos), type: "drop", e: d });
    // layer 2: things that stand up, y-sorted
    jobs.push({ layer: 2, y: y(w.core.pos), type: "sink.core", e: w.core });
    if (w.sales) jobs.push({ layer: 2, y: y(w.sales.pos), type: "sink.sales_point", e: w.sales });
    for (const n of w.nodes) jobs.push({ layer: 2, y: y(n.pos), type: n.type, e: n });
    const structs = w.structures ?? structuresFromBuiltPads(dc);
    for (const s of structs) jobs.push({ layer: 2, y: y(s.pos), type: s.type, e: s });
    for (const cv of w.converters ?? []) jobs.push({ layer: 2, y: y(cv.pos), type: cv.type, e: { ...cv, manned: this.converterManned(w, cv) } });
    if (w.depot) jobs.push({ layer: 2, y: y(w.depot.pos), type: "struct.depot", e: w.depot });
    for (const c of w.captures ?? []) jobs.push({ layer: 2, y: dc.pos(`c:${c.id}`, c.pos).y, type: c.type, e: c });
    for (const p of w.prey ?? []) if (p.alive) jobs.push({ layer: 2, y: dc.pos(`p:${p.id}`, p.pos).y, type: "unit.prey", e: p });
    for (const h of w.hostiles ?? []) jobs.push({ layer: 2, y: dc.pos(`h:${h.id}`, h.pos).y, type: h.type, e: h });
    for (const r of w.residents ?? []) jobs.push({ layer: 2, y: dc.pos(`r:${r.id}`, r.pos).y, type: "unit.resident", e: r });
    w.sales?.queue.forEach((q, i) => jobs.push({ layer: 2, y: dc.pos(`q:${i}`, q.pos).y, type: "unit.customer", e: { ...q, key: `q:${i}`, idx: i, queued: true } }));
    w.sales?.leaving.forEach((q, i) => jobs.push({ layer: 2, y: dc.pos(`l:${i}`, q.pos).y, type: "unit.customer", e: { ...q, key: `l:${i}`, idx: i + 7, queued: false } }));
    jobs.push({ layer: 2, y: dc.pos("player", w.player.pos).y, type: "unit.player", e: { pos: w.player.pos, key: "player" } });
    jobs.sort((p, q) => p.layer - q.layer || p.y - q.y);
    return jobs;
  }

  // ---------------------------------------------------------------- overlays

  private nextWave(w: WorldView): { n: number; s: number } | null {
    const cp = this.cp;
    if (!cp || !w.waves) return null;
    const wave = cp.waves[w.waves.idx];
    if (!wave) return null;
    return { n: w.waves.idx + 1, s: Math.max(0, (wave.tick - w.tick) / TPS) };
  }

  private drawOverlays(dc: DC, ox: number, oy: number, k: number, pl: V): void {
    const g = dc.g, w = dc.world, pal = dc.pal;
    const sw = this.cssW, sh = this.cssH;
    const t = this.t;
    // hazard: ochre tint, blowing streaks and drifting dust clouds
    const phase = w.hazard?.phase ?? "none";
    if (phase === "active" || phase === "warning") {
      const strong = phase === "active";
      g.fillStyle = strong ? "rgba(214,140,70,.30)" : `rgba(214,140,70,${0.06 + 0.04 * Math.sin(t * 3)})`;
      g.fillRect(0, 0, sw, sh);
      if (strong) {
        const n = Math.round(STREAKS.length * this.fx.density);
        g.strokeStyle = "rgba(255,222,170,.75)";
        g.lineWidth = 1.6;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const s = STREAKS[i]!;
          const px = ((s.sx * (sw + 80) + t * 260 * s.sp) % (sw + 80)) - 40;
          const py = (s.sy * sh + t * 40 * s.sp + Math.sin(t * 2 + i) * 6) % sh;
          g.moveTo(px, py);
          g.lineTo(px - s.len, py - s.len * 0.25);
        }
        g.stroke();
        g.fillStyle = "rgba(196,120,64,.16)";
        for (let i = 0; i < 5; i++) {
          const cx = ((i * 131 + t * 90) % (sw + 240)) - 120, cy = (i * 173) % sh;
          g.beginPath(); g.ellipse(cx, cy, 120, 50, 0, 0, Math.PI * 2); g.fill();
        }
      }
    }
    // distress: the lifeline drains -> frost creeps in with a heartbeat; stepping outside the heat frosts lightly
    const lifeK = lifelineK(dc);
    let frost = 0;
    if (w.core.fuel <= 0 || lifeK < 0.6) {
      const ph = t % 1.1;
      const beat = Math.exp(-((ph / 0.07) ** 2)) + 0.6 * Math.exp(-(((ph - 0.24) / 0.07) ** 2));
      frost = Math.min(1, (1 - lifeK) * 1.3) * (0.6 + 0.4 * beat);
    }
    if (dc.outside) frost = Math.max(frost, 0.28 + 0.06 * Math.sin(t * 2.5));
    if (frost > 0.01 && this.frost) {
      g.globalAlpha = Math.min(1, frost);
      g.drawImage(this.frost, 0, 0, sw, sh);
      g.globalAlpha = 1;
    }
    // base hit: red edge flash
    if (this.baseFlash > 0) {
      g.strokeStyle = alpha(pal.danger, Math.min(0.8, this.baseFlash));
      g.lineWidth = 18;
      g.strokeRect(0, 0, sw, sh);
    }
    // off-screen pointers: things that need the player
    const toS = (p: V): V => ({ x: (p.x - ox) * k, y: (p.y - oy) * k });
    const pointers: { p: V; c: string; icon: PointerIcon }[] = [];
    let hostileShown = 0;
    const hs = w.hostiles ?? [];
    for (const h of hs) {
      if (hostileShown >= 3) break;
      const q = toS(dc.pos(`h:${h.id}`, h.pos));
      if (q.x > 0 && q.x < sw && q.y > 0 && q.y < sh) continue;
      pointers.push({ p: q, c: pal.danger, icon: "hostile" });
      hostileShown++;
    }
    const nw = this.nextWave(w);
    if (nw && nw.s <= 6 && hostileShown === 0) pointers.push({ p: { x: sw / 2, y: -100 }, c: pal.danger, icon: "hostile" });
    let pods = 0;
    for (const c of w.captures ?? []) if (c.state === "idle" && pods < 3) { pointers.push({ p: toS(dc.pos(`c:${c.id}`, c.pos)), c: pal.interactive, icon: "pod" }); pods++; }
    if (w.residents?.some((r) => r.status === "arriving") && this.cp?.gate) pointers.push({ p: toS(dc.w(this.cp.gate.pos)), c: pal.ok, icon: "person" });
    if (w.core.fuel <= 3) pointers.push({ p: toS(dc.w(w.core.pos)), c: pal.accent, icon: "core" });
    if ((w.sales?.pileN ?? 0) >= 10) pointers.push({ p: toS(dc.w(w.sales!.pile)), c: pal.res["res.currency"] ?? pal.accent, icon: "coin" });
    for (const p of w.pads ?? []) {
      const info = this.pads.get(p.id);
      if (!info?.goal || p.done || p.visible === false) continue;
      pointers.push({ p: toS(dc.w(p.pos)), c: pal.accent, icon: "goal" });
    }
    const margin = 26;
    for (const ptr of pointers) {
      const { x, y } = ptr.p;
      if (x > 0 && x < sw && y > 0 && y < sh) continue;
      const cx = sw / 2, cy = sh / 2;
      // clamp along the ray from the centre so pointers sit where the thing is
      const dx = x - cx, dy = y - cy;
      const s = Math.min(dx ? (sw / 2 - margin) / Math.abs(dx) : Infinity, dy ? (sh / 2 - margin) / Math.abs(dy) : Infinity);
      const ex = cx + dx * s, ey = cy + dy * s;
      drawPointer(dc, ex, ey, Math.atan2(dy, dx), ptr.c, iconFor(ptr.icon), t);
    }
    void pl;
  }

  private hintCls = "";
  private shownKind = "";
  private shownBanner = "";

  private updateDom(w: WorldView, heroY: number): void {
    if (this.hintEl) {
      // hints never cover the hero: flip to the top when the hero walks low on screen
      const top = heroY > this.cssH - 110;
      const cls = `fo-hint${top ? " top" : ""}${this.t < this.hintUntil ? " on" : ""}`;
      if (cls !== this.hintCls) { this.hintCls = cls; this.hintEl.className = cls; }
    }
    if (!this.bannerEl) return;
    let text = "", kind = "";
    const hz = w.hazard;
    const name = this.skin.hazardName;
    const nw = this.nextWave(w);
    if (hz && hz.phase === "warning") { text = floaterText(this.skin, "hazard_warning", { name, s: Math.max(0, Math.ceil(((hz.until ?? w.tick) - w.tick) / TPS)) }); kind = "hazard"; }
    else if (hz && hz.phase === "active") { text = floaterText(this.skin, "hazard_active", { name, s: Math.max(0, Math.ceil(((hz.until ?? w.tick) - w.tick) / TPS)) }); kind = "hazard"; }
    else if (this.t < this.bannerUntil) { text = this.bannerText; kind = this.bannerKind; }
    else if (nw && nw.s <= 10 && !w.over) { text = floaterText(this.skin, "wave_soon", { n: nw.n, s: Math.ceil(nw.s) }); kind = "danger"; }
    if (text !== this.shownBanner) {
      this.shownBanner = text;
      this.bannerEl.textContent = text;
      this.bannerEl.style.display = text ? "block" : "none";
    }
    if (text && kind !== this.shownKind) {
      this.shownKind = kind;
      const pal = this.skin.palette;
      this.bannerEl.style.background = kind === "ok" ? pal.ok : kind === "hazard" ? "#c9773d" : kind === "danger" ? pal.danger : pal.accent;
      this.bannerEl.style.color = kind === "ok" ? pal.ink : "#ffffff";
    }
  }

  private showHint(text: string): void {
    if (!this.hintEl) return;
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintUntil = this.t + 1.8;
  }

  private banner(text: string, kind: string, sec = 2.5): void {
    this.bannerText = text;
    this.bannerKind = kind;
    this.bannerUntil = this.t + sec;
  }

  // ---------------------------------------------------------------- events

  /** Where an event happened, in world units: its `at`, else the entity it names, else the player. */
  private posOf(e: Record<string, unknown>): V {
    const at = e["at"] as V | undefined;
    if (at && typeof at.x === "number") return { x: at.x / FP, y: at.y / FP };
    const w = this.world;
    if (!w) return { x: 0, y: 0 };
    const wu = (p: V): V => ({ x: p.x / FP, y: p.y / FP });
    const find = <T extends { id: unknown; pos: V }>(list: T[] | undefined, id: unknown): V | null => {
      const hit = id === undefined ? undefined : list?.find((x) => x.id === id);
      return hit ? wu(hit.pos) : null;
    };
    const byPad = find(w.pads, e["pad"]);
    if (byPad) return byPad;
    const byCap = find(w.captures, e["capture"]);
    if (byCap) return byCap;
    const byRes = find(w.residents, e["resident"]);
    if (byRes) return byRes;
    const byConv = find(w.converters, e["conv"]) ?? (typeof e["conv"] === "string" ? (() => { const c = w.converters?.find((x) => x.type === e["conv"]); return c ? wu(c.pos) : null; })() : null);
    if (byConv) return byConv;
    if (e["line"] !== undefined && e["section"] !== undefined) {
      const s = w.barriers?.find((b) => b.id === e["line"])?.sections[Number(e["section"])];
      if (s) return { x: (s.a.x + s.b.x) / 2 / FP, y: (s.a.y + s.b.y) / 2 / FP };
    }
    if (e["zone"] !== undefined) {
      const z = w.zones?.find((x) => x.id === e["zone"]);
      if (z) return { x: (z.rect.x + z.rect.w / 2) / FP, y: (z.rect.y + z.rect.h / 2) / FP };
    }
    if (String(e["t"]).startsWith("core_")) return wu(w.core.pos);
    return wu(w.player.pos);
  }

  /** Resident position for events a worker caused (`by` is a resident id), else null. */
  private workerPos(e: Record<string, unknown>): V | null {
    const by = e["by"];
    if (typeof by !== "number" || !this.world) return null;
    const r = this.world.residents?.find((x) => x.id === by);
    return r ? { x: r.pos.x / FP, y: r.pos.y / FP - 28 } : null;
  }

  private playerPos(): V {
    const w = this.world;
    return w ? { x: w.player.pos.x / FP, y: w.player.pos.y / FP } : { x: 0, y: 0 };
  }

  private nearest<T extends { pos: V }>(list: readonly T[] | undefined, at: V, pred: (x: T) => boolean): T | null {
    let best: T | null = null, bd = Infinity;
    for (const s of list ?? []) {
      if (!pred(s)) continue;
      const d = (s.pos.x / FP - at.x) ** 2 + (s.pos.y / FP - at.y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** World point (world units) to mount CSS px with the last camera; same signature as the 3D renderer's. */
  worldToScreen(p: V, _height = 0): V { return this.toScreen(p); }

  /** World point to canvas CSS px, using the last camera. */
  private toScreen(p: V): V {
    const c = this.lastCam, s = this.scale * c.zoom;
    return { x: (p.x - (c.x - this.viewW / c.zoom / 2)) * s, y: (p.y - (c.y - this.viewH / c.zoom / 2)) * s };
  }

  onEvent(ev: SimEvent): void {
    if (!this.g) return;
    const e = ev as unknown as Record<string, unknown> & { t: string };
    const skin = this.skin, pal = skin.palette, fx = this.fx;
    const gold = pal.res["res.currency"] ?? "#ffcb3d";
    const at = this.posOf(e);
    const name = (id: unknown): string => (typeof id === "string" ? nameOf(skin, id) : "");
    const ft = (key: string, vars?: Record<string, string | number>): string => floaterText(skin, key, vars);
    switch (e.t) {
      case "gathered":
      case "picked": {
        const wp = this.workerPos(e);
        fx.arc(String(e["res"]), at, wp, wp ? 0.4 : 0.32);
        if (e.t === "gathered") fx.dust(at.x, at.y + 8, alpha(pal.groundAlt, 0.8), 5);
        else if (!wp) fx.ring(at.x, at.y + 4, pal.interactive, 22, 0.3);
        break;
      }
      case "deposited": {
        const from = this.workerPos(e) ?? (() => { const p = this.playerPos(); return { x: p.x, y: p.y - 34 }; })();
        fx.arc(String(e["res"]), from, at, 0.26);
        if (e["to"] === "sink.core" && e["by"] === undefined) fx.burst(at.x, at.y - 20, [pal.accent, "#fff3a0"], 5, 60, -60, 3, 0.45);
        break;
      }
      case "pad_paid":
      case "barrier_progress": {
        const p = this.playerPos();
        const res = e.t === "barrier_progress" ? this.world?.barriers?.find((b) => b.id === e["line"])?.res ?? "res.material_basic" : String(e["res"] ?? "res.currency");
        fx.arc(res, { x: p.x, y: p.y - 30 }, at, 0.22);
        break;
      }
      case "drop":
        fx.burst(at.x, at.y, ["#ffffff", pal.res[String(e["res"])] ?? pal.interactive], 6, 60, 120, 2.5, 0.4);
        break;
      case "sold": {
        fx.floater(at.x, at.y - 30, ft("sold"), "#ffffff", 14);
        fx.floater(at.x - 30, at.y - 14, `+${Number(e["pay"] ?? 0)}`, gold, 16);
        fx.burst(at.x, at.y - 10, [gold, "#fff3a0"], e["premium"] ? 14 : 7, 70, 200, 3);
        const pile = this.world?.sales?.pile;
        if (pile) fx.arc("res.currency", { x: at.x, y: at.y - 10 }, { x: pile.x / FP, y: pile.y / FP }, 0.35);
        break;
      }
      case "customer_left":
        if (e["angry"]) fx.floater(at.x, at.y - 30, ft("too_slow"), pal.danger, 14);
        break;
      case "collected": {
        const n = Number(e["n"] ?? 1);
        const p = this.playerPos();
        fx.floater(p.x, p.y - 50, ft("collected", { n }), gold, 17);
        fx.coinsToHud(this.toScreen(at), this.hudAnchor(), Math.min(12, Math.max(3, Math.ceil(n / 2))));
        break;
      }
      case "core_fuel_out":
        fx.floater(at.x, at.y - 50, ft("fuel_out"), pal.danger, 15);
        fx.shake = Math.max(fx.shake, 4);
        break;
      case "core_fuel_restored":
        fx.ring(at.x, at.y + 10, pal.accent, 60);
        break;
      case "hint":
        this.showHint(hintText(skin, String(e["key"])));
        break;
      case "level_end":
        if (e["won"]) {
          const p = this.playerPos();
          fx.burst(p.x, p.y - 20, [pal.accent, pal.interactive, gold, pal.ok, "#ffffff"], 50, 220, 260, 4, 1.4);
          fx.confettiShower(this.cssW, [pal.accent, pal.interactive, gold, pal.ok, "#ffffff", pal.res["res.food_raw_2"] ?? "#ffa3b4"]);
          fx.floater(p.x, p.y - 60, ft("win"), "#ffffff", 20);
        } else fx.shake = Math.max(fx.shake, 8);
        break;
      case "built":
      case "hired":
      case "unlocked": {
        for (const k of ["pad", "id", "struct"]) {
          const id = e[k];
          if (id !== undefined) { fx.pop(`pad:${String(id)}`); fx.pop(`struct:${String(id)}`); }
        }
        fx.dust(at.x, at.y + 16, alpha("#f3e2c8", 0.9), 14);
        fx.ring(at.x, at.y + 10, pal.interactive, 70, 0.6);
        fx.burst(at.x, at.y - 10, [pal.accent, gold, "#ffffff"], 18, 140, 260, 3.5);
        fx.shake = Math.max(fx.shake, 2.5);
        if (e["build"] === "sink.core.level") break; // core_upgraded names it
        const padId = typeof e["pad"] === "string" ? (e["pad"] as string) : typeof e["id"] === "string" ? (e["id"] as string) : "";
        const label = this.pads.get(padId)?.label ?? name(e["type"] ?? e["role"]);
        const key = e.t === "hired" ? "hired" : e.t === "unlocked" ? "unlocked" : "built";
        fx.floater(at.x, at.y - 36, ft(key, { name: label }), "#ffffff", 15);
        break;
      }
      case "captured": {
        const p = this.playerPos();
        fx.floater(p.x, p.y - 50, ft("captured"), pal.interactive, 16);
        fx.ring(at.x, at.y + 12, pal.interactive, 44, 0.45);
        break;
      }
      case "released":
        fx.floater(at.x, at.y - 36, ft("released"), pal.accent, 14);
        fx.burst(at.x, at.y - 10, [pal.glass, "#ffffff"], 14, 90, 140, 3);
        fx.ring(at.x, at.y + 10, pal.glass, 40, 0.5);
        break;
      case "recruit_arrived":
        fx.floater(at.x, at.y - 34, ft("recruit_arrived"), pal.ok, 14);
        fx.ring(at.x, at.y + 10, pal.ok, 34, 0.5);
        break;
      case "moved_in":
        fx.floater(at.x, at.y - 34, ft("moved_in"), pal.ok, 14);
        break;
      case "injured":
        fx.floater(at.x, at.y - 34, ft("injured"), pal.danger, 14);
        fx.burst(at.x, at.y - 10, [pal.danger, "#ffffff"], 6, 70, 120, 2.5, 0.4);
        break;
      case "healed":
        fx.floater(at.x, at.y - 34, ft("healed"), pal.ok, 14);
        break;
      case "hit": {
        const target = String(e["target"]);
        const by = e["by"];
        if (target === "hostile" || target === "prey") {
          const key = `${target === "hostile" ? "h" : "p"}:${String(e["id"])}`;
          fx.flash(key);
          let src = this.playerPos();
          if (by === "structure") {
            const tur = this.nearest(this.world?.structures, at, (s) => s.type === "struct.ranged_defense");
            if (tur) {
              src = { x: tur.pos.x / FP, y: tur.pos.y / FP - 6 };
              fx.flash(`s:${String(tur.id)}`, 0.12);
              fx.tracer(src, { x: at.x, y: at.y - 6 }, "#fff3a0");
            }
          } else if (by === "resident") {
            const r = this.nearest(this.world?.residents, at, (x) => x.status === "ok" && x.role !== "idle");
            if (r) src = { x: r.pos.x / FP, y: r.pos.y / FP };
          }
          fx.knock(key, at.x - src.x, at.y - src.y);
          fx.burst(at.x, at.y - 6, ["#ffffff", "#fff3a0"], 6, 90, 0, 2.5, 0.25);
        } else if (target === "base") {
          fx.shake = Math.max(fx.shake, 9);
          this.baseFlash = 0.8;
          fx.burst(at.x, at.y - 16, [pal.danger, "#ffffff"], 8, 120, 160, 3, 0.4);
        } else if (target === "barrier") {
          fx.shake = Math.max(fx.shake, 2);
          fx.burst(at.x, at.y + 10, [pal.structure, pal.structureDark], 5, 80, 200, 3, 0.4);
        }
        break;
      }
      case "died":
        fx.dust(at.x, at.y, alpha("#d8c0a0", 0.9), 10);
        fx.burst(at.x, at.y - 6, [pal.danger, "#ffffff"], 10, 110, 160, 3, 0.5);
        break;
      case "wave_started": {
        const n = Number(e["idx"] ?? 1);
        this.banner(ft("wave_started", { n }), "danger");
        fx.shake = Math.max(fx.shake, 6);
        break;
      }
      case "wave_cleared":
        this.banner(ft("wave_cleared"), "ok", 2);
        break;
      case "barrier_built": {
        const b = e["line"], s = e["section"];
        if (b !== undefined && s !== undefined) fx.pop(`bar:${String(b)}:${String(s)}`);
        fx.dust(at.x, at.y, alpha("#f3e2c8", 0.9), 10);
        fx.floater(at.x, at.y - 24, ft("barrier_built"), "#ffffff", 14);
        fx.shake = Math.max(fx.shake, 2);
        break;
      }
      case "barrier_broken":
        fx.shake = Math.max(fx.shake, 7);
        fx.burst(at.x, at.y, [pal.structure, pal.structureDark], 16, 140, 300, 4);
        fx.floater(at.x, at.y - 24, ft("barrier_broken"), pal.danger, 15);
        break;
      case "hazard_warning":
        fx.shake = Math.max(fx.shake, 3);
        break;
      case "hazard_start":
        fx.shake = Math.max(fx.shake, 5);
        break;
      case "core_upgraded": {
        const c = this.world ? { x: this.world.core.pos.x / FP, y: this.world.core.pos.y / FP } : at;
        fx.ring(c.x, c.y + 10, pal.accent, 120, 0.8);
        fx.burst(c.x, c.y - 20, [pal.accent, "#fff3a0"], 26, 160, 200, 4);
        fx.floater(c.x, c.y - 60, ft("core_upgraded", { n: Number(e["level"] ?? this.world?.core.level ?? 2) }), "#ffffff", 17);
        break;
      }
      case "zone_cleared":
        fx.dust(at.x, at.y, alpha("#d8c0a0", 0.9), 24);
        fx.floater(at.x, at.y, ft("zone_cleared"), "#ffffff", 16);
        fx.shake = Math.max(fx.shake, 4);
        break;
      case "converted":
        fx.burst(at.x, at.y - 14, [pal.accent, "#ffffff"], 5, 50, -40, 2.5, 0.5);
        break;
      default:
        break;
    }
  }
}

const STYLE = `
.fo-hint{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translate(-50%,8px) scale(.96);background:rgba(33,24,26,.86);color:#fff;font:800 14px/1.2 "Baloo 2","Nunito",ui-rounded,system-ui,sans-serif;padding:8px 16px;border-radius:999px;pointer-events:none;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .2s,transform .2s;z-index:2;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.fo-hint.on{opacity:1;transform:translate(-50%,0) scale(1)}
.fo-hint.top{bottom:auto;top:58px}
.fo-banner{position:absolute;left:50%;top:10px;transform:translateX(-50%);color:#fff;font:800 17px/1.15 "Baloo 2","Nunito",ui-rounded,system-ui,sans-serif;padding:8px 18px;border-radius:999px;pointer-events:none;white-space:nowrap;z-index:2;box-shadow:0 4px 0 rgba(0,0,0,.18),0 8px 18px rgba(0,0,0,.25);text-shadow:0 1px 0 rgba(0,0,0,.25);animation:fo-banner-in .35s cubic-bezier(.2,1.6,.4,1)}
@keyframes fo-banner-in{from{transform:translateX(-50%) scale(.6);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
`;

function injectStyle(doc: Document): void {
  if (typeof doc.getElementById !== "function" || doc.getElementById("fo-r2d-style")) return;
  const el = doc.createElement("style");
  el.id = "fo-r2d-style";
  el.textContent = STYLE;
  doc.head?.appendChild(el);
}

export const createRenderer2D = (opts?: Renderer2DOptions): Renderer2D => new Renderer2D(opts);
