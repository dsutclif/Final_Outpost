import { content as defaultContent, type Content, type Manifest } from "@fo/content";
import { FP, TPS, compile, safeRadius, type Compiled, type SimEvent, type State } from "@fo/sim";
import { alpha, floaterText, hintText, nameOf, uiText, type Skin } from "@fo/skins";
import type { Camera, Renderer } from "./contract.js";
import type { DC, PadInfo } from "./draw/dc.js";
import { padLabel } from "./draw/pads.js";
import { circle, type G } from "./draw/prim.js";
import { drawEntity } from "./draw/registry.js";
import { structuresFromBuiltPads } from "./draw/structures.js";
import { lifelineK } from "./draw/units.js";
import { drawGround } from "./draw/world.js";
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

/** Logical stage width in world units; the canvas scales this to the device width. */
export const STAGE_W = 400;
const MAX_DPR = 2;

export interface Renderer2DOptions {
  /** Clock in milliseconds; injectable for tests. */
  now?: () => number;
  /** Device pixel ratio source; injectable for tests. */
  dpr?: () => number;
  content?: Content;
}

interface Job { layer: number; y: number; type: string; e: unknown }

/** Canvas 2D renderer (Contract 2). Draws from state every frame; events add juice only. */
export class Renderer2D implements Renderer {
  private mount: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private g: G | null = null;
  private groundCache: HTMLCanvasElement | null = null;
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
  private hintUntil = 0;
  private bannerText = "";
  private bannerUntil = 0;
  private changes = new Map<string, { v: string; t: number }>();
  private readonly nowFn: () => number;
  private readonly dprFn: () => number;
  /** Screen point (canvas CSS px) where coins fly to; the client points it at the currency chip. */
  hudAnchor: () => V = () => ({ x: 36, y: -14 });

  constructor(opts: Renderer2DOptions = {}) {
    this.nowFn = opts.now ?? (() => (globalThis.performance?.now?.() ?? Date.now()));
    this.dprFn = opts.dpr ?? (() => (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
    this.content = opts.content ?? defaultContent;
  }

  set onCoinLanded(fn: (() => void) | null) { this.fx.onCoinLanded = fn; }

  init(manifest: Manifest, skin: Skin, mount: HTMLElement): void {
    this.dispose();
    this.manifest = manifest;
    this.skin = skin;
    this.mount = mount;
    try { this.cp = compile(manifest, this.content); } catch { this.cp = null; }
    this.buildPadInfo();
    const doc = mount.ownerDocument;
    const canvas = doc.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    mount.appendChild(canvas);
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.hintEl = doc.createElement("div");
    this.hintEl.className = "fo-hint";
    this.hintEl.style.cssText = "position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:rgba(33,24,26,.82);color:#fff;font:800 14px/1.2 system-ui,sans-serif;padding:7px 14px;border-radius:999px;pointer-events:none;white-space:nowrap;opacity:0;transition:opacity .25s;z-index:2";
    mount.appendChild(this.hintEl);
    this.bannerEl = doc.createElement("div");
    this.bannerEl.className = "fo-banner";
    this.bannerEl.style.cssText = `position:absolute;left:50%;top:10px;transform:translateX(-50%);background:${skin.palette.danger};color:#fff;font:800 16px/1.2 system-ui,sans-serif;padding:7px 16px;border-radius:999px;pointer-events:none;white-space:nowrap;z-index:2;display:none;box-shadow:0 4px 14px rgba(0,0,0,.25)`;
    mount.appendChild(this.bannerEl);
    this.interp.reset();
    this.fx.clear();
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
    for (const e of this.manifest.entities) {
      if (e.type !== "pad.hire" && e.type !== "pad.build") continue;
      const kind = e.type === "pad.hire" ? "hire" : "build";
      const what = e.type === "pad.hire" ? e.role.role : e.build;
      const targetType = e.type === "pad.build" && e.target ? byId.get(e.target)?.type : undefined;
      const info: PadInfo = {
        id: e.id,
        kind,
        cost: { ...e.cost },
        label: padLabel(lbl, kind, what, targetType),
        big: e.type === "pad.build" ? e.big : false,
        what,
      };
      if (e.requires?.pad !== undefined) info.requiresPad = e.requires.pad;
      if (e.requires?.coreLevel !== undefined) info.requiresCoreLevel = e.requires.coreLevel;
      this.pads.set(e.id, info);
    }
  }

  resize(w: number, h: number): void {
    this.cssW = Math.max(1, w);
    this.cssH = Math.max(1, h);
    this.dpr = Math.min(MAX_DPR, Math.max(1, this.dprFn() || 1));
    if (this.canvas) {
      this.canvas.width = Math.max(1, Math.round(this.cssW * this.dpr));
      this.canvas.height = Math.max(1, Math.round(this.cssH * this.dpr));
    }
    this.scale = this.cssW / STAGE_W;
    this.viewW = STAGE_W;
    this.viewH = this.cssH / this.scale;
    this.buildGroundCache();
  }

  private buildGroundCache(): void {
    if (!this.mount || !this.skin) return;
    const W = this.manifest.map.w, H = this.manifest.map.h;
    const k = this.scale * this.dpr;
    try {
      const c = this.mount.ownerDocument.createElement("canvas");
      c.width = Math.max(1, Math.round(W * k));
      c.height = Math.max(1, Math.round(H * k));
      const g = c.getContext("2d");
      if (!g) { this.groundCache = null; return; }
      g.setTransform(k, 0, 0, k, 0, 0);
      drawGround(g, this.skin, W, H);
      this.groundCache = c;
    } catch {
      this.groundCache = null;
    }
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

    const pl = this.interp.pos("player", w.player.pos, a);
    const v = this.interp.vel("player");
    const sp = Math.min(1, Math.hypot(v.x, v.y) / 4);
    this.moving += (sp - this.moving) * Math.min(1, dt * 10);
    this.followCamera(cam, pl, dt);
    this.lastCam = { x: cam.x, y: cam.y };

    const dc = this.makeDC(g, w, a);
    const W = this.manifest.map.w, H = this.manifest.map.h;
    const k = this.scale * this.dpr * (cam.zoom || 1);
    const vw = this.viewW / (cam.zoom || 1), vh = this.viewH / (cam.zoom || 1);
    const shake = this.fx.shake;
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    const ox = cam.x - vw / 2 + sx, oy = cam.y - vh / 2 + sy;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.skin.palette.ui.bg;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(k, 0, 0, k, -ox * k, -oy * k);
    if (this.groundCache) g.drawImage(this.groundCache, 0, 0, W, H);
    else drawGround(g, this.skin, W, H);

    for (const job of this.collectJobs(dc)) drawEntity(dc, job.type, job.e as { pos?: V });
    drawEntity(dc, "fx.lasso", {});
    this.fx.drawWorld(dc, pl);

    // screen space
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOverlays(dc, ox, oy, k / this.dpr);
    this.fx.drawScreen(dc);
    this.updateDom(w);
  }

  private followCamera(cam: Camera, target: V, dt: number): void {
    const W = this.manifest.map.w, H = this.manifest.map.h;
    const z = cam.zoom || 1;
    const vw = this.viewW / z, vh = this.viewH / z;
    if (cam.follow) {
      // Aim a little above the hero so the back stack and what lies ahead stay in view.
      const tx = target.x, ty = target.y - vh * 0.04;
      if (!this.camReady) { cam.x = tx; cam.y = ty; this.camReady = true; }
      const e = 1 - Math.exp(-dt * 6);
      cam.x += (tx - cam.x) * e;
      cam.y += (ty - cam.y) * e;
    }
    cam.x = vw >= W ? W / 2 : Math.max(vw / 2, Math.min(W - vw / 2, cam.x));
    cam.y = vh >= H ? H / 2 : Math.max(vh / 2, Math.min(H - vh / 2, cam.y));
  }

  private makeDC(g: G, w: WorldView, a: number): DC {
    const skin = this.skin;
    const cp = this.cp;
    let safeR = 0;
    let fuelCap = 20;
    if (cp) {
      try { safeR = safeRadius(w as unknown as State, cp) / FP; } catch { safeR = 0; }
      const lv = cp.core.levels[Math.min(Math.max(1, w.core.level), cp.core.levels.length) - 1];
      if (lv) fuelCap = lv.fuelCap;
    }
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
        const c = this.changes.get(key);
        if (!c || c.v !== value) { this.changes.set(key, { v: value, t: this.t }); return 0; }
        return this.t - c.t;
      },
      vel: (key) => this.interp.vel(key),
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
    const r = (def?.range ?? 30) * FP;
    const near = (p: V, rr: number): boolean => (p.x - op.x) ** 2 + (p.y - op.y) ** 2 < rr * rr;
    if (near(w.player.pos, r)) return true;
    return (w.residents ?? []).some((x) => x.role === def?.role && (x.status ?? "ok") === "ok" && near(x.pos, 12 * FP));
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

  /** Everything to draw this frame, ordered by layer then by ground y (painter's order). */
  private collectJobs(dc: DC): Job[] {
    const w = dc.world;
    const jobs: Job[] = [];
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

  private drawOverlays(dc: DC, ox: number, oy: number, k: number): void {
    const g = dc.g, w = dc.world, pal = dc.pal;
    const sw = this.cssW, sh = this.cssH;
    // hazard: tint and blowing dust
    if (w.hazard?.phase === "active") {
      g.fillStyle = "rgba(214,140,70,.28)";
      g.fillRect(0, 0, sw, sh);
      g.fillStyle = "rgba(255,214,160,.7)";
      for (let i = 0; i < 70; i++) {
        const px = ((i * 97.3 + this.t * (220 + (i % 5) * 40)) % (sw + 40)) - 20;
        const py = (i * 53.7 + Math.sin(this.t * 2 + i) * 10) % sh;
        g.fillRect(px, py, 10 + (i % 3) * 5, 1.5);
      }
    }
    // distress: the lifeline is draining, the screen frosts at the edges
    const lifeK = lifelineK(dc);
    if (w.core.fuel <= 0 || lifeK < 0.6) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
      const strength = Math.min(1, (1 - lifeK) * 1.4) * (0.55 + 0.25 * pulse);
      const grad = g.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.35, sw / 2, sh / 2, Math.max(sw, sh) * 0.75);
      grad.addColorStop(0, "rgba(160,215,255,0)");
      grad.addColorStop(1, `rgba(160,215,255,${strength})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, sw, sh);
    }
    // off-screen pointers: things that need the player
    const targets: { p: V; c: string }[] = [];
    for (const h of w.hostiles ?? []) targets.push({ p: dc.pos(`h:${h.id}`, h.pos), c: pal.danger });
    for (const c of w.captures ?? []) if (c.state === "idle") targets.push({ p: dc.pos(`c:${c.id}`, c.pos), c: pal.interactive });
    for (const r of w.residents ?? []) if (r.status === "arriving") targets.push({ p: dc.pos(`r:${r.id}`, r.pos), c: pal.accent });
    if (w.core.fuel <= 3) targets.push({ p: dc.w(w.core.pos), c: pal.accent });
    for (const t of targets) {
      const x = (t.p.x - ox) * k, y = (t.p.y - oy) * k;
      if (x > 0 && x < sw && y > 0 && y < sh) continue;
      const ex = Math.max(18, Math.min(sw - 18, x)), ey = Math.max(18, Math.min(sh - 18, y));
      const ang = Math.atan2(y - ey, x - ex);
      g.save(); g.translate(ex, ey); g.rotate(ang);
      g.beginPath(); g.moveTo(14, 0); g.lineTo(2, -8); g.lineTo(2, 8); g.closePath();
      g.fillStyle = t.c; g.fill();
      g.restore();
      circle(g, ex, ey, 9, t.c, "#ffffff", 2.5);
    }
  }

  private updateDom(w: WorldView): void {
    if (this.hintEl) this.hintEl.style.opacity = this.t < this.hintUntil ? "1" : "0";
    if (!this.bannerEl) return;
    let text = "";
    const hz = w.hazard;
    const name = this.skin.hazardName;
    if (hz && hz.phase === "warning") text = floaterText(this.skin, "hazard_warning", { name, s: Math.max(0, Math.ceil(((hz.until ?? w.tick) - w.tick) / TPS)) });
    else if (hz && hz.phase === "active") text = floaterText(this.skin, "hazard_active", { name, s: Math.max(0, Math.ceil(((hz.until ?? w.tick) - w.tick) / TPS)) });
    else if (this.t < this.bannerUntil) text = this.bannerText;
    if (text) {
      if (this.bannerEl.textContent !== text) this.bannerEl.textContent = text;
      this.bannerEl.style.display = "block";
    } else this.bannerEl.style.display = "none";
  }

  private showHint(text: string): void {
    if (!this.hintEl) return;
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintUntil = this.t + 1.6;
  }

  private banner(text: string, sec = 2.5): void {
    this.bannerText = text;
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
    const byConv = find(w.converters, e["conv"]);
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

  private flashNearestTurret(at: V): void {
    let best: string | number | null = null, bd = Infinity;
    for (const s of this.world?.structures ?? []) {
      if (s.type !== "struct.ranged_defense") continue;
      const d = (s.pos.x / FP - at.x) ** 2 + (s.pos.y / FP - at.y) ** 2;
      if (d < bd) { bd = d; best = s.id; }
    }
    if (best !== null) this.fx.flash(`s:${String(best)}`, 0.1);
  }

  /** World point to canvas CSS px, using the last camera. */
  private toScreen(p: V, cam: { x: number; y: number }): V {
    return { x: (p.x - (cam.x - this.viewW / 2)) * this.scale, y: (p.y - (cam.y - this.viewH / 2)) * this.scale };
  }

  private lastCam = { x: 0, y: 0 };

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
        break;
      }
      case "deposited": {
        const from = this.workerPos(e) ?? (() => { const p = this.playerPos(); return { x: p.x, y: p.y - 34 }; })();
        fx.arc(String(e["res"]), from, at, 0.26);
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
      case "sold":
        fx.floater(at.x, at.y - 30, ft("sold"), "#ffffff", 14);
        fx.floater(at.x - 30, at.y - 14, `+${Number(e["pay"] ?? 0)}`, gold, 16);
        fx.burst(at.x, at.y - 10, [gold, "#fff3a0"], e["premium"] ? 14 : 7, 70, 200, 3);
        break;
      case "customer_left":
        if (e["angry"]) fx.floater(at.x, at.y - 30, ft("too_slow"), pal.danger, 14);
        break;
      case "collected": {
        const n = Number(e["n"] ?? 1);
        const p = this.playerPos();
        fx.floater(p.x, p.y - 50, ft("collected", { n }), gold, 17);
        const from = this.toScreen(at, this.lastCam);
        fx.coinsToHud(from, this.hudAnchor(), Math.min(12, Math.max(3, n)));
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
          fx.burst(p.x, p.y - 20, [pal.accent, pal.interactive, gold, pal.ok, "#ffffff"], 70, 220, 260, 4, 1.6);
          fx.floater(p.x, p.y - 60, ft("win"), "#ffffff", 20);
        }
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
        const padId = typeof e["pad"] === "string" ? (e["pad"] as string) : typeof e["id"] === "string" ? (e["id"] as string) : "";
        const label = this.pads.get(padId)?.label ?? name(e["type"] ?? e["role"]);
        const key = e.t === "hired" ? "hired" : e.t === "unlocked" ? "unlocked" : "built";
        fx.floater(at.x, at.y - 36, ft(key, { name: label }), "#ffffff", 15);
        break;
      }
      case "captured": {
        const n = Array.isArray(e["ids"]) ? (e["ids"] as unknown[]).length : Number(e["n"] ?? 1);
        const p = this.playerPos();
        fx.floater(p.x, p.y - 50, n > 1 ? ft("captured_n", { n }) : ft("captured"), pal.interactive, 16);
        break;
      }
      case "released":
        fx.floater(at.x, at.y - 36, ft("released"), pal.accent, 14);
        fx.burst(at.x, at.y - 10, [pal.glass, "#ffffff"], 12, 80, 120, 3);
        break;
      case "recruit_arrived":
        fx.floater(at.x, at.y - 34, ft("recruit_arrived"), pal.ok, 14);
        break;
      case "moved_in":
        fx.floater(at.x, at.y - 34, ft("moved_in"), pal.ok, 14);
        break;
      case "injured":
        fx.floater(at.x, at.y - 34, ft("injured"), pal.danger, 14);
        break;
      case "healed":
        fx.floater(at.x, at.y - 34, ft("healed"), pal.ok, 14);
        break;
      case "hit": {
        const target = String(e["target"]);
        if (target === "hostile") fx.flash(`h:${String(e["id"])}`);
        else if (target === "prey") fx.flash(`p:${String(e["id"])}`);
        else if (target === "base") fx.shake = Math.max(fx.shake, 5);
        if (e["by"] === "structure") this.flashNearestTurret(at);
        fx.burst(at.x, at.y - 6, ["#ffffff", "#fff3a0"], 6, 90, 0, 2.5, 0.25);
        break;
      }
      case "shot":
        if (e["by"] !== undefined) fx.flash(`s:${String(e["by"])}`, 0.1);
        break;
      case "died":
        fx.dust(at.x, at.y, alpha("#d8c0a0", 0.9), 10);
        fx.burst(at.x, at.y - 6, [pal.danger, "#ffffff"], 8, 100, 160, 3, 0.5);
        break;
      case "wave_started": {
        const n = Number(e["idx"] ?? 0) + 1;
        this.banner(ft("wave_started", { n }));
        fx.shake = Math.max(fx.shake, 6);
        break;
      }
      case "wave_cleared":
        this.banner(ft("wave_cleared"), 2);
        break;
      case "barrier_built": {
        const b = e["line"] ?? e["barrier"] ?? e["id"], s = e["section"];
        if (b !== undefined && s !== undefined) fx.pop(`bar:${String(b)}:${String(s)}`);
        fx.dust(at.x, at.y, alpha("#f3e2c8", 0.9), 8);
        break;
      }
      case "barrier_broken":
        fx.shake = Math.max(fx.shake, 7);
        fx.burst(at.x, at.y, [pal.structure, pal.structureDark], 16, 140, 300, 4);
        fx.floater(at.x, at.y - 24, ft("barrier_broken"), pal.danger, 15);
        break;
      case "hazard_warning":
      case "hazard_start":
        fx.shake = Math.max(fx.shake, 3);
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
        break;
      case "converted":
        fx.burst(at.x, at.y - 14, [pal.accent, "#ffffff"], 5, 50, -40, 2.5, 0.5);
        break;
      default:
        break;
    }
  }
}

export const createRenderer2D = (opts?: Renderer2DOptions): Renderer2D => new Renderer2D(opts);
