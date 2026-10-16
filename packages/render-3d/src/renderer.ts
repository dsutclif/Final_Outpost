import { content as defaultContent, type Content, type Manifest } from "@fo/content";
import { FP, TPS, compile, safeRadius, type Compiled, type CustomerState, type SimEvent, type State } from "@fo/sim";
import { floaterText, hintText, mix, nameOf, purposeOf, uiText, workerName, workerPurpose, type Skin, type WorkerVars } from "@fo/skins";
import {
  Box3,
  BufferAttribute,
  Color,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoToneMapping,
  Object3D,
  PCFShadowMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Sprite,
  type Light,
  SRGBColorSpace,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Camera as ThreeCamera,
  type ColorSpace,
  type ShadowMapType,
  type ToneMapping,
} from "three";
import { lookFor, type Anim, type Look } from "./assets/characters.js";
import { getAnchor, type BuildCtx, type Model } from "./assets/common.js";
import { createBuildCtx, disposeBuildCtx } from "./assets/context.js";
import { buildModel, hasModel } from "./assets/registry.js";
import { buildCrateGeo } from "./assets/props.js";
import { buildRubble, buildWallPanel, buildBarrierDash } from "./assets/scatter.js";
import { LEAD_WEIGHT, type Camera, type CoachMark, type GuideMark, type RenderStats, type Renderer } from "./contract.js";
import { GeoBuilder } from "./geom.js";
import { Interp, type V } from "./interp.js";
import { DomCoach, DomPointers, injectStyle, type PointerTarget } from "./scene/dom.js";
import { Environment } from "./scene/environment.js";
import { Fx } from "./scene/fx.js";
import { GroundMarks } from "./scene/groundmarks.js";
import { Batch, Blobs, Crowd } from "./scene/instancing.js";
import { Items } from "./scene/items.js";
import { Labels, drawIcon, roundRect, FONT, type CanvasMaker, type LabelArt } from "./scene/labels.js";
import { padLockReason } from "./padlock.js";
import { resToken, type Tokens } from "./tokens.js";
import { ART_M, FOLLOW_RATE, FOV_DEG, ITEM_K, PITCH_DEG, TIERS, VIEW_MARGIN, VIEW_W, type QualityTier } from "./units.js";

/** Shelf items keep their pre-R3 size so they still fit the kiosk crates. */
const SHELF_K = 1.05 / ITEM_K;

/** The subset of WebGLRenderer the 3D renderer uses; tests inject a fake (no WebGL in Node). */
export interface GLLike {
  domElement: HTMLCanvasElement;
  info: { render: { calls: number; triangles: number } };
  shadowMap: { enabled: boolean; type: ShadowMapType };
  outputColorSpace: ColorSpace;
  toneMapping: ToneMapping;
  setPixelRatio(r: number): void;
  setSize(w: number, h: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: ThreeCamera): void;
  dispose(): void;
}

export interface Renderer3DOptions {
  now?: () => number;
  dpr?: () => number;
  content?: Content;
  quality?: QualityTier;
  /** WebGL factory; defaults to three's WebGLRenderer on the given canvas. */
  createGL?: (canvas: HTMLCanvasElement) => GLLike;
}

interface PadInfo { id: string; kind: "hire" | "build"; cost: Record<string, number>; label: string; big: boolean; what: string; worker?: { vars: WorkerVars; res?: string }; requiresPad?: string; requiresCoreLevel?: number; goal?: boolean }

/** Pad label art: canvas height with one and two rows of cost pills, pills per row, world height of one row. */
const PAD_ART_H = 132, PAD_ART_H2 = 208, PAD_PER_ROW = 3, PAD_LABEL_H = 30, PAD_LOCK_H = 36;
/** Back-stack columns per row behind the hero before a second row starts. */
const BACK_PER_ROW = 3;

/** A placed model and its per-entity animation state. */
interface Placed { key: string; model: Model; born: number; seen: boolean; data: Record<string, unknown>; sprites: Sprite[]; extra: Object3D[] }

const PITCH = (PITCH_DEG * Math.PI) / 180;
const SAFE_RING_K = 1;
const v3 = (x = 0, y = 0, z = 0): Vector3 => new Vector3(x, y, z);
const tmpM = new Matrix4(), tmpV = new Vector3(), tmpV2 = new Vector3();
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const tmpBox = new Box3();
/** Discovery labels shown at once (nearest first) and how far from the hero they reach (world units). */
const MAX_DISCOVERY = 6;
const DISCOVERY_RANGE = 260;
/** Tap-to-inspect: characters within this many CSS px of the tap win over buildings. */
const PICK_PX = 28;

/** Where a type's discovery label would go this frame: the instance nearest the hero. */
interface Candidate { x: number; z: number; h: number; d2: number }

/** three.js renderer (Contract 2). State drives every visual; events add juice only. */
export class Renderer3D implements Renderer {
  private mount: HTMLElement | null = null;
  private gl: GLLike | null = null;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV_DEG, 0.5, 10, 6000);
  private manifest!: Manifest;
  private skin!: Skin;
  private tokens!: Tokens;
  private cp: Compiled | null = null;
  private readonly content: Content;
  private bctx: BuildCtx | null = null;
  private env: Environment | null = null;
  private labels: Labels = new Labels(null, "#000");
  private fx: Fx | null = null;
  private crowd: Crowd | null = null;
  private blobs: Blobs | null = null;
  private items: Items | null = null;
  private walls: { wall: Batch; cracked: Batch; reinforced: Batch; dash: Batch; rubble: Batch; crate: Batch } | null = null;
  private isNew: ((id: string) => boolean) | null = null;
  private cands = new Map<string, Candidate>();
  private discSprites = new Map<string, Sprite>();
  private tagSprites: Sprite[] = [];
  private tagUsed = 0;
  private raycaster = new Raycaster();
  private geos: BufferGeometry[] = [];
  private dynamic = new Group();
  private placed = new Map<string, Placed>();
  private pads = new Map<string, PadInfo>();
  /** Placed key (or r:<resident id>) of the last pick() hit, for inspect(). */
  private lastPick: string | null = null;
  private interp = new Interp();
  private world: State | null = null;
  private yaw = new Map<string, number>();
  private phase = new Map<string, number>();
  private cheerUntil = new Map<string, number>();
  private quality: QualityTier;
  private cssW = 400;
  private cssH = 700;
  private frames = 0;
  private frameNo = 0;
  private lastDpr = 0;
  private fpsT = 0;
  private fps = 0;
  private t0 = 0;
  private last = 0;
  private t = 0;
  private moving = 0;
  private camReady = false;
  private look = v3();
  private safeR = 0;
  private fuelK = 1;
  private lifeK = 1;
  private synced = false;
  private stockMax = new Map<string, number>();
  private hintEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private vignetteEl: HTMLElement | null = null;
  private pointers: DomPointers | null = null;
  private coachDom: DomCoach | null = null;
  private coach: (CoachMark & { since: number }) | null = null;
  private guideMark: GuideMark | null = null;
  private marks: GroundMarks | null = null;
  private guideSprite: Sprite | null = null;
  private lowFuelSaid = false;
  private hintUntil = 0;
  private hintCls = "";
  private bannerText = "";
  private bannerKind = "";
  private bannerUntil = 0;
  private shownBanner = "";
  private shownKind = "";
  private lasso: { trail: Mesh; rope: Mesh; ropePts: Vector3[]; ropePrev: Vector3[] } | null = null;
  private scaffoldGeo: BufferGeometry | null = null;
  private padPlane: PlaneGeometry | null = null;
  private readonly nowFn: () => number;
  private readonly dprFn: () => number;
  private readonly createGL: (canvas: HTMLCanvasElement) => GLLike;
  /** Screen point (CSS px in the mount) the coins fly to; the client points it at the currency chip. */
  hudAnchor: () => V = () => ({ x: 36, y: -14 });

  constructor(opts: Renderer3DOptions = {}) {
    this.nowFn = opts.now ?? (() => (globalThis.performance?.now?.() ?? Date.now()));
    this.dprFn = opts.dpr ?? (() => (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
    this.content = opts.content ?? defaultContent;
    this.quality = opts.quality ?? "medium";
    this.createGL = opts.createGL ?? ((canvas) => new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }) as unknown as GLLike);
  }

  get onCoinLanded(): (() => void) | null {
    return this.coinCb;
  }

  set onCoinLanded(fn: (() => void) | null) {
    if (this.fx) this.fx.onCoinLanded = fn;
    this.coinCb = fn;
  }
  private coinCb: (() => void) | null = null;

  // ---------------------------------------------------------------- lifecycle

  init(manifest: Manifest, skin: Skin, mount: HTMLElement): void {
    this.dispose();
    this.manifest = manifest;
    this.skin = skin;
    this.mount = mount;
    try { this.cp = compile(manifest, this.content); } catch { this.cp = null; }
    this.bctx = createBuildCtx(skin);
    this.tokens = this.bctx.t;
    this.buildPadInfo();

    const doc = mount.ownerDocument;
    const canvas = doc.createElement("canvas") as HTMLCanvasElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    mount.appendChild(canvas);
    this.gl = this.createGL(canvas);
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping;

    const make: CanvasMaker | null = typeof doc.createElement === "function"
      ? (w, h) => {
        try {
          const c = doc.createElement("canvas") as HTMLCanvasElement;
          c.width = w; c.height = h;
          return typeof c.getContext === "function" && c.getContext("2d") ? c : null;
        } catch { return null; }
      }
      : null;
    this.labels = new Labels(make, this.tokens.ink);

    this.scene = new Scene();
    this.scene.add(this.dynamic = new Group());
    const mats = this.bctx.mats;
    this.env = new Environment(this.scene, manifest.map.w, manifest.map.h, this.tokens, mats, manifest.seed ?? 1);
    this.fx = new Fx(mats.particle, this.scene, this.labels);
    this.fx.onCoinLanded = this.coinCb;
    this.crowd = new Crowd(this.bctx.parts, mats.std, this.scene);
    this.blobs = new Blobs(mats.blob, this.scene);
    this.items = new Items(this.tokens, mats.std, this.scene);
    const geoOf = (m: Model): BufferGeometry => {
      let g: BufferGeometry | null = null;
      m.root.traverse((o) => { if (!g && (o as Mesh).isMesh) g = (o as Mesh).geometry; });
      return g ?? new PlaneGeometry(1, 1);
    };
    const wallG = geoOf(buildWallPanel(this.bctx)), crackG = geoOf(buildWallPanel(this.bctx, true)), reinfG = geoOf(buildWallPanel(this.bctx, false, true));
    const dashG = geoOf(buildBarrierDash(this.bctx)), rubbleG = geoOf(buildRubble(this.bctx));
    const crateG = buildCrateGeo(this.tokens);
    this.geos.push(wallG, crackG, reinfG, dashG, rubbleG, crateG);
    this.walls = {
      wall: new Batch(wallG, mats.std, this.scene, 16, "walls"),
      cracked: new Batch(crackG, mats.std, this.scene, 8, "wallsCracked"),
      reinforced: new Batch(reinfG, mats.std, this.scene, 8, "wallsReinforced"),
      dash: new Batch(dashG, mats.std, this.scene, 64, "barrierDashes"),
      rubble: new Batch(rubbleG, mats.std, this.scene, 16, "rubble"),
      crate: new Batch(crateG, mats.std, this.scene, 4, "shelfCrates"),
    };
    this.scaffoldGeo = this.buildScaffold();
    this.padPlane = new PlaneGeometry(1, 1);
    this.padPlane.rotateX(-Math.PI / 2);
    this.buildLasso();
    this.marks = new GroundMarks(this.scene, { interactive: this.tokens.interactive, accent: this.tokens.accent, frost: this.tokens.frost, ink: this.tokens.ink, hero: this.tokens.ok });
    this.guideSprite = null;
    this.guideMark = null;
    this.lowFuelSaid = false;
    this.buildDom(doc, mount);

    this.interp.reset();
    this.camReady = false;
    this.synced = false;
    this.t0 = this.nowFn();
    this.last = this.t0;
    this.setQuality(this.quality);
    const r = mount.getBoundingClientRect?.();
    this.resize(r?.width || mount.clientWidth || 400, r?.height || mount.clientHeight || 700);
  }

  resize(w: number, h: number): void {
    this.cssW = Math.max(1, w);
    this.cssH = Math.max(1, h);
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
    if (this.gl) {
      this.gl.setPixelRatio(Math.min(TIERS[this.quality].maxPixelRatio, Math.max(1, this.dprFn() || 1)));
      this.gl.setSize(this.cssW, this.cssH, false);
    }
  }

  setQuality(tier: QualityTier): void {
    this.quality = tier;
    const s = TIERS[tier];
    if (this.gl) {
      this.gl.shadowMap.enabled = s.shadows;
      this.gl.shadowMap.type = s.softShadows ? PCFSoftShadowMap : PCFShadowMap;
      this.gl.setPixelRatio(Math.min(s.maxPixelRatio, Math.max(1, this.dprFn() || 1)));
    }
    this.env?.applyTier(s);
    if (this.fx) this.fx.particleScale = s.particleScale;
    for (const p of this.placed.values()) this.applyShadows(p.model.root);
    // shadow on/off changes shader variants
    this.scene.traverse((o) => {
      const m = (o as Mesh).material as { needsUpdate?: boolean } | { needsUpdate?: boolean }[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; });
      else if (m) m.needsUpdate = true;
    });
  }

  getQuality(): QualityTier {
    return this.quality;
  }

  private applyShadows(root: Object3D): void {
    const on = TIERS[this.quality].shadows;
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const body = m.name === "body" || m.name === "frame" || m.name === "headBody";
      m.castShadow = on && body;
      m.receiveShadow = false;
    });
  }

  dispose(): void {
    for (const p of this.placed.values()) this.removePlaced(p);
    this.placed.clear();
    this.env?.dispose();
    this.fx?.dispose();
    this.crowd?.dispose();
    this.blobs?.dispose();
    this.items?.dispose();
    if (this.walls) for (const b of Object.values(this.walls)) b.dispose();
    for (const g of this.geos) g.dispose();
    this.geos = [];
    this.scaffoldGeo?.dispose();
    this.padPlane?.dispose();
    if (this.lasso) {
      this.lasso.trail.geometry.dispose();
      (this.lasso.trail.material as MeshBasicMaterial).dispose();
      this.lasso.rope.geometry.dispose();
      (this.lasso.rope.material as MeshBasicMaterial).dispose();
    }
    for (const sp of this.discSprites.values()) this.dynamic.remove(sp);
    for (const sp of this.tagSprites) this.dynamic.remove(sp);
    this.discSprites.clear();
    this.tagSprites = [];
    this.cands.clear();
    this.labels.dispose();
    if (this.bctx) disposeBuildCtx(this.bctx);
    this.gl?.domElement.remove?.();
    this.gl?.dispose();
    this.hintEl?.remove();
    this.bannerEl?.remove();
    this.vignetteEl?.remove();
    this.pointers?.dispose();
    this.coachDom?.dispose();
    this.marks?.dispose();
    this.marks = null;
    this.guideSprite = null;
    this.guideMark = null;
    this.pointers = null;
    this.coachDom = null;
    this.coach = null;
    this.env = null; this.fx = null; this.crowd = null; this.blobs = null; this.items = null; this.walls = null;
    this.lasso = null; this.bctx = null; this.gl = null; this.mount = null; this.world = null;
    this.hintEl = null; this.bannerEl = null; this.vignetteEl = null;
    this.scene = new Scene();
  }

  private buildPadInfo(): void {
    this.pads.clear();
    const byId = new Map<string, { type: string }>();
    for (const e of this.manifest.entities) if (e.id !== undefined) byId.set(e.id, e);
    const name = (id: string): string => nameOf(this.skin, id);
    for (const e of this.manifest.entities) {
      if (e.type !== "pad.hire" && e.type !== "pad.build") continue;
      const kind = e.type === "pad.hire" ? "hire" : "build";
      const what = e.type === "pad.hire" ? e.role.role : e.build;
      const targetType = e.type === "pad.build" && e.target ? byId.get(e.target)?.type : undefined;
      let label = name(what);
      let worker: PadInfo["worker"];
      if (e.type === "pad.hire") {
        worker = this.workerOf(e.role.from, e.role.to);
        label = workerName(this.skin, what, worker.vars);
      }
      if (kind === "build" && what === "node.enable") label = uiText(this.skin, "unlock", { name: targetType ? name(targetType) : "" }).trim();
      else if (kind === "build" && what === "sink.core.level") label = uiText(this.skin, "coreLevel", { n: 2 });
      else if (kind === "build" && what === "zone.clear") label = uiText(this.skin, "clear", { name: name("zone.blocked") });
      const info: PadInfo = { id: e.id, kind, cost: { ...e.cost }, label, big: e.type === "pad.build" ? e.big : false, what };
      if (worker) info.worker = worker;
      if (this.manifest.goal.type === "build" && this.manifest.goal.target === e.id) info.goal = true;
      if (e.requires?.pad !== undefined) info.requiresPad = e.requires.pad;
      if (e.requires?.coreLevel !== undefined) info.requiresCoreLevel = e.requires.coreLevel;
      this.pads.set(e.id, info);
    }
  }

  /** What a worker gathers or moves, and the machine, place or destination it serves, as display names. */
  private workerOf(from: string | null | undefined, to: string | null | undefined): { vars: WorkerVars; res?: string } {
    const c = this.content;
    const name = (id: string): string => nameOf(this.skin, id === "store.depot" ? "struct.depot" : id);
    const drops = from ? (c.animals[from] as { drops?: Record<string, number> } | undefined)?.drops : undefined;
    const res = from
      ? (c.nodes[from] as { yields?: string } | undefined)?.yields ?? (c.converters[from] as { output?: string } | undefined)?.output ?? (drops ? Object.keys(drops)[0] : undefined)
      : undefined;
    const vars: WorkerVars = {};
    if (res) vars.res = nameOf(this.skin, res);
    if (to?.startsWith("conv.")) vars.machine = name(to);
    if (to) { vars.dest = name(to); vars.place = name(to); } else vars.place = name("sink.sales_point");
    return res ? { vars, res } : { vars };
  }

  private buildDom(doc: Document, mount: HTMLElement): void {
    const t = this.tokens;
    const el = (cls: string, css: string): HTMLElement => {
      const e = doc.createElement("div");
      e.className = cls;
      e.style.cssText = css;
      mount.appendChild(e);
      return e;
    };
    injectStyle(doc);
    this.vignetteEl = el("fo-vignette", "position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s;z-index:1");
    // same classes and CSS as the 2D renderer, so hints and banners look identical
    this.hintEl = el("fo-hint", "");
    this.hintCls = "fo-hint";
    this.bannerEl = el("fo-banner", "display:none");
    this.shownBanner = "";
    this.shownKind = "";
    void t;
    this.pointers = new DomPointers(doc, mount, this.skin.palette, 12);
    this.coachDom = new DomCoach(doc, mount, this.skin.palette, this.pointers);
  }

  /** Guide arrow target (world units) and its instruction, or null. Purely visual; never blocks input. */
  setGuide(g: GuideMark | null): void {
    if (g && this.guideMark && g.key === this.guideMark.key) { this.guideMark.at = g.at; this.guideMark.text = g.text; return; }
    this.guideMark = g ? { ...g } : null;
  }

  /** Contextual coach mark (world units), or null to hide it. Purely visual; never blocks input. */
  setCoach(c: CoachMark | null): void {
    if (c && this.coach && c.key === this.coach.key) { this.coach.at = c.at; this.coach.text = c.text; return; }
    this.coach = c ? { ...c, since: this.t } : null;
  }

  /** Jump the camera onto the hero on the next sync (after a teleport or a scripted run). */
  snapCamera(): void { this.camReady = false; }

  /** World point (world units on the ground, optional height) to mount CSS px, last camera. */
  worldToScreen(p: V, height = 0): V {
    return this.toScreen(v3(p.x, height, p.y));
  }

  private buildScaffold(): BufferGeometry {
    const t = this.tokens;
    const b = new GeoBuilder();
    for (const x of [-0.75, 0.75]) for (const z of [-0.75, 0.75]) b.box(0.06, 1, 0.06, t.metal, { at: [x, 0.5, z] });
    for (const y of [0.33, 0.66, 0.98]) {
      b.box(1.56, 0.05, 0.05, t.accent, { at: [0, y, 0.75] }).box(1.56, 0.05, 0.05, t.metal, { at: [0, y, -0.75] })
        .box(0.05, 0.05, 1.56, t.metal, { at: [0.75, y, 0] }).box(0.05, 0.05, 1.56, t.metal, { at: [-0.75, y, 0] });
    }
    b.box(0.04, 1.3, 0.04, t.metal, { at: [0, 0.5, 0.76], rot: [0, 0, 0.85] });
    return b.build();
  }

  private buildLasso(): void {
    const t = this.tokens;
    const mk = (c: string, opacity: number): Mesh => {
      const m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: new Color(c), transparent: true, opacity, depthWrite: false, toneMapped: false, side: 2 }));
      m.frustumCulled = false;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.lasso = { trail: mk(t.interactive, 0.75), rope: mk(mix(t.accent, t.ink, 0.25), 1), ropePts: [], ropePrev: [] };
  }

  // ---------------------------------------------------------------- frame

  sync(state: State, alphaIn: number, cam: Camera): void {
    if (!this.gl || !this.bctx || !this.env || !this.fx || !this.crowd || !this.items || !this.blobs) return;
    const now = this.nowFn();
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t = (now - this.t0) / 1000;
    this.frames++;
    this.frameNo++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; }
    const a = clamp01(alphaIn);
    if (this.dprFn() !== this.lastDpr) { this.lastDpr = this.dprFn(); this.resize(this.cssW, this.cssH); }
    this.world = state;
    this.interp.update(state);
    this.fx.now = this.t;
    this.fx.update(dt);

    // derived values the visuals read
    this.safeR = 0;
    let fuelCap = 20;
    if (this.cp) {
      try { this.safeR = safeRadius(state, this.cp) / FP; } catch { this.safeR = 0; }
      const lv = this.cp.core.levels[Math.min(Math.max(1, state.core.level), this.cp.core.levels.length) - 1];
      if (lv) fuelCap = lv.fuelCap;
    }
    this.fuelK = clamp01(state.core.fuel / Math.max(1, fuelCap));
    this.lifeK = clamp01((state.meters?.lifeline ?? state.core.lifeline) / 1_000_000);

    const pl = this.interp.pos("player", state.player.pos, a);
    const pv = this.interp.vel("player");
    const sp = Math.min(1, Math.hypot(pv.x, pv.y) / 3);
    this.moving += (sp - this.moving) * Math.min(1, dt * 10);
    this.followCamera(cam, pl, dt);

    for (const p of this.placed.values()) p.seen = false;
    this.cands.clear();
    this.tagUsed = 0;
    this.items.begin();
    this.crowd.begin();
    this.blobs.begin();
    for (const b of Object.values(this.walls!)) b.begin();

    this.syncCore(state);
    this.syncSales(state, a);
    this.syncNodes(state);
    this.syncStructures(state);
    this.syncConverters(state);
    this.syncDepot(state);
    this.syncPads(state);
    this.syncBarriers(state);
    this.syncZones(state);
    this.syncCaptures(state, a);
    this.syncDrops(state);
    this.syncCharacters(state, a, pl, dt);
    this.syncLasso(state, a, pl, dt);
    this.syncMarks(state, pl);

    for (const [k, p] of this.placed) if (!p.seen) { this.removePlaced(p); this.placed.delete(k); }
    this.drawDiscovery(pl);
    for (let i = this.tagUsed; i < this.tagSprites.length; i++) this.tagSprites[i]!.visible = false;

    this.fx.draw(this.items);
    this.items.end();
    this.crowd.end();
    this.blobs.end();
    for (const b of Object.values(this.walls!)) b.end();

    const coreW = this.wv(state.core.pos);
    this.env.update(dt, this.t, this.look, coreW, this.safeR * SAFE_RING_K, this.fuelK, state.hazard?.phase ?? "none");
    this.updateDom(state);
    this.synced = true;
    this.gl.render(this.scene, this.camera);
  }

  /** Fixed point to a ground point in world units. */
  private wv(p: V, y = 0): Vector3 {
    return v3(p.x / FP, y, p.y / FP);
  }

  private followCamera(cam: Camera, target: V, dt: number): void {
    const W = this.manifest.map.w, H = this.manifest.map.h;
    const z = cam.zoom || 1;
    // the same clamp as the 2D renderer, on the 2D-equivalent view rect
    const vw = VIEW_W / z, vh = (VIEW_W * this.cssH) / this.cssW / z;
    if (cam.follow) {
      const lead = cam.lead;
      const lx = lead ? (lead.x - target.x) * LEAD_WEIGHT : 0, ly = lead ? (lead.y - target.y) * LEAD_WEIGHT : 0;
      const tx = target.x + lx, ty = target.y + ly - vh * 0.05;
      if (!this.camReady) { cam.x = tx; cam.y = ty; this.camReady = true; }
      const e = 1 - Math.exp(-dt * FOLLOW_RATE);
      cam.x += (tx - cam.x) * e;
      cam.y += (ty - cam.y) * e;
    }
    cam.x = vw >= W + VIEW_MARGIN * 2 ? W / 2 : Math.max(vw / 2 - VIEW_MARGIN, Math.min(W - vw / 2 + VIEW_MARGIN, cam.x));
    cam.y = vh >= H + VIEW_MARGIN * 2 ? H / 2 : Math.max(vh / 2 - VIEW_MARGIN, Math.min(H - vh / 2 + VIEW_MARGIN, cam.y));

    const shake = this.fx?.shake ?? 0;
    this.look.set(cam.x + (shake ? (Math.random() - 0.5) * shake : 0), 0, cam.y + (shake ? (Math.random() - 0.5) * shake : 0));
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const d = vw / 2 / Math.tan(hfov / 2);
    this.camera.position.set(this.look.x, Math.sin(PITCH) * d, this.look.z + Math.cos(PITCH) * d);
    this.camera.near = Math.max(10, d * 0.2);
    this.camera.far = d * 6;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- placement

  private place(key: string, id: string, at: Vector3, level = 1, build?: (ctx: BuildCtx) => Model): Placed {
    let p = this.placed.get(key);
    if (!p) {
      const ctx = { ...this.bctx!, level };
      const model = build ? build(ctx) : buildModel(id, ctx);
      model.root.updateMatrixWorld(true);
      tmpBox.setFromObject(model.root);
      const h = tmpBox.isEmpty() ? 1 : Math.max(0.2, tmpBox.max.y);
      model.root.scale.setScalar(ART_M);
      this.applyShadows(model.root);
      this.dynamic.add(model.root);
      p = { key, model, born: this.synced ? this.t : -Infinity, seen: true, data: { id, h: h * ART_M }, sprites: [], extra: [] };
      this.placed.set(key, p);
    }
    p.seen = true;
    p.model.root.position.copy(at);
    this.popScale(p, ART_M);
    return p;
  }

  /** Squash-and-stretch pop for anything that appeared after the level loaded (0 -> 1.15 -> 1, 400 ms). */
  private popScale(p: Placed, base: number, sx = 1, sz = 1): void {
    const age = this.t - p.born;
    const r = p.model.root;
    if (age >= 0.45 || !Number.isFinite(age)) { r.scale.set(base * sx, base, base * sz); return; }
    const k = age / 0.45;
    const up = k < 0.55 ? (k / 0.55) * 1.15 : 1.15 - ((k - 0.55) / 0.45) * 0.15;
    const squash = Math.sin(k * Math.PI * 2) * 0.12 * (1 - k);
    r.scale.set(base * sx * up * (1 + squash), base * up * (1 - squash), base * sz * up * (1 + squash));
  }

  private sprite(p: Placed, i: number): Sprite {
    let s = p.sprites[i];
    if (!s) {
      s = new Sprite();
      s.renderOrder = 10;
      this.dynamic.add(s);
      p.sprites[i] = s;
    }
    return s;
  }

  private removePlaced(p: Placed): void {
    this.dynamic.remove(p.model.root);
    p.model.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mat = m.material as MeshBasicMaterial;
      // shared skin materials stay; per-model clones (status lights, lamps) go
      if (mat && !this.bctx?.mats.all().includes(mat) && !mat.map) mat.dispose();
    });
    for (const s of p.sprites) this.dynamic.remove(s);
    for (const o of p.extra) {
      if (!o) continue;
      this.dynamic.remove(o);
      const ghost = o.userData["ghost"] as MeshLambertMaterial | undefined;
      if (ghost) {
        o.traverse((c) => { if ((c as Mesh).isMesh) (c as Mesh).geometry.dispose(); });
        ghost.dispose();
        continue;
      }
      const m = o as Mesh;
      if (m.isMesh && m.geometry !== this.scaffoldGeo && m.geometry !== this.padPlane) m.geometry.dispose();
    }
  }

  private anchorWorld(p: Placed, name: Parameters<typeof getAnchor>[1], out = v3()): Vector3 {
    const a = getAnchor(p.model.root, name);
    p.model.root.updateMatrixWorld();
    return a ? a.getWorldPosition(out) : out.copy(p.model.root.position);
  }

  // ---------------------------------------------------------------- entities

  private syncCore(s: State): void {
    const p = this.place(`core:${s.core.level}`, "sink.core", this.wv(s.core.pos), s.core.level);
    this.candidate("sink.core", p);
    const { orb, flame, spin } = p.model.parts;
    const k = this.fuelK;
    const out = s.core.fuel <= 0;
    const flicker = k < 0.25 ? 0.8 + 0.2 * Math.sin(this.t * 25) : 1;
    if (orb) orb.scale.setScalar((out ? 0.35 : 0.55 + 0.5 * k) * flicker);
    if (flame) {
      flame.visible = !out && TIERS[this.quality].halos;
      const pulse = 1 + Math.sin(this.t * 6) * 0.06;
      flame.scale.set((0.5 + 0.6 * k) * pulse, (0.5 + 0.8 * k) * pulse * flicker, (0.5 + 0.6 * k) * pulse);
    }
    if (spin) spin.rotation.y += (0.4 + 2 * k) * 0.016;
  }

  private syncSales(s: State, a: number): void {
    const sales = s.sales;
    if (!sales) return;
    const kiosk = this.place("sales", "sink.sales_point", this.wv(sales.pos));
    this.candidate("sink.sales_point", kiosk);
    // the clerk pad: whoever stands on it (hero or clerk) rings up the queue; no register object
    const reg = this.place("register", "sink.sales_point.register", this.wv(sales.register));
    this.candidate("sink.sales_point.register", reg, ART_M * 0.55);
    this.shelfCrates(sales, kiosk);
    // the currency pile by the clerk pad
    const items = this.items!;
    const pile = this.wv(sales.pile);
    const coin = "res.currency";
    const pn = Math.min(30, sales.pileN);
    for (let i = 0; i < pn; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      items.add(coin, pile.x + (col - 1) * 8 + (row % 2) * 2, row * items.height(coin), pile.z + ((col * 7) % 3) * 2, row * 0.7);
    }
    if (pn > 0) this.candidatePt("sink.sales_point.pile", pile.x, pile.z, ART_M * 1.1);
    // customers: queue faces the kiosk, leaving ones walk off
    sales.queue.forEach((c, i) => this.customer(`q:${i}`, c, a, true, kiosk, sales.serving));
    sales.leaving.forEach((c, i) => this.customer(`l:${i}`, c, a, false, kiosk));
  }

  /**
   * One open crate per sellable good on the kiosk's counter ledge, with the units it holds
   * visible inside (up to two layers of four) and a count chip above it that reads at phone size.
   */
  private shelfCrates(sales: NonNullable<State["sales"]>, kiosk: Placed): void {
    const items = this.items!, crates = this.walls!.crate;
    const dep = this.anchorWorld(kiosk, "deposit", tmpV2).clone();
    const n = Math.max(1, sales.sells.length);
    const cap = (this.cp?.sales as { shelfCap?: number } | undefined)?.shelfCap ?? 10;
    const pitch = Math.min(0.85, 2.1 / n) * ART_M;
    // few goods get bigger crates (and bigger items) so a lone shelf still reads at phone size
    const ck = Math.min(1.45, pitch / (0.56 * ART_M));
    sales.sells.forEach((res, i) => {
      const x = dep.x + (i - (n - 1) / 2) * pitch;
      tmpM.makeScale(ART_M * ck, ART_M, ART_M * ck).setPosition(x, dep.y, dep.z);
      crates.push(tmpM);
      const have = sales.shelf[res] ?? 0;
      const shown = Math.min(8, have);
      const ih = items.height(res) * 0.75 * SHELF_K;
      for (let j = 0; j < shown; j++) {
        const layer = Math.floor(j / 4), c = j % 2, r = Math.floor((j % 4) / 2);
        items.add(res, x + (c - 0.5) * 0.2 * ART_M * ck, dep.y + 0.05 * ART_M + layer * ih, dep.z + (r - 0.5) * 0.15 * ART_M, 0.4 * c + r, 0.78 * ck * SHELF_K);
      }
      const chip = this.sprite(kiosk, i);
      const full = have >= cap;
      chip.visible = this.labels.apply(chip, `shelf|${res}|${have}|${full}`, () => this.shelfChipArt(res, have, full), 15);
      chip.position.set(x, dep.y + 0.78 * ART_M, dep.z + 0.12 * ART_M);
    });
    for (let i = sales.sells.length; i < kiosk.sprites.length; i++) kiosk.sprites[i]!.visible = false;
  }

  /** Count chip: resource icon and number; green when a shelf is full (good), red "n!" when a stock is over (blocked). */
  private shelfChipArt(res: string, n: number, full: boolean, over = false): LabelArt {
    const t = this.tokens, ui = this.skin.palette.ui;
    const num = over ? `${n}!` : `${n}`;
    const w = this.labels.textWidth(num, 40) + 78;
    const bg = over ? t.danger : full ? t.ok : t.ink, fg = full && !over ? t.ink : ui.panel;
    return {
      w, h: 64,
      draw: (g, W) => {
        roundRect(g, 3, 3, W - 6, 58, 29);
        g.fillStyle = bg; g.globalAlpha = full || over ? 1 : 0.85; g.fill(); g.globalAlpha = 1;
        g.lineWidth = 4; g.strokeStyle = full && !over ? t.ink : ui.panel; g.stroke();
        drawIcon(g, 32, 32, 18, resToken(t, res), t.ink);
        g.font = `800 40px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = fg; g.fillText(num, 32 + (W - 32) / 2 - 2, 35);
      },
    };
  }

  private customer(key: string, c: CustomerState, a: number, queued: boolean, kiosk: Placed, serving?: { customer: number; ticks: number; of: number }): void {
    const pos = this.interp.pos(key, c.pos, a);
    const look = lookFor(c.kind, this.tokens, this.skin.models);
    const vel = this.interp.vel(key);
    const moving = Math.hypot(vel.x, vel.y) > 0.05;
    const yaw = moving ? Math.atan2(vel.x, vel.y) : queued ? Math.atan2(kiosk.model.root.position.x - pos.x, kiosk.model.root.position.z - pos.y) : this.yaw.get(key) ?? 0;
    this.yaw.set(key, yaw);
    const anim = this.anim(key, moving ? 0.8 : 0, false);
    if (c.angry) anim.hit = 0.25 + 0.25 * Math.sin(this.t * 12);
    this.addCharacter(look, anim, pos, yaw, null);
    this.candidatePt(c.kind, pos.x, pos.y, ART_M * look.scale * 1.9);
    if (queued) {
      // order bubble with the patience arc
      const pk = Math.round(clamp01(c.patience / Math.max(1, c.patienceMax)) * 10);
      const sp = this.bubbleSprite(key);
      const sv = serving && serving.customer === c.id ? Math.round(clamp01(serving.ticks / Math.max(1, serving.of)) * 8) : -1;
      const ok = this.labels.apply(sp, `ord|${c.res}|${c.want}|${pk}|${sv}`, () => this.orderArt(c.res, c.want, pk / 10, sv < 0 ? null : sv / 8), 16);
      sp.visible = ok;
      sp.position.set(pos.x, ART_M * look.scale * 1.55, pos.y);
    }
  }

  private bubbles = new Map<string, { s: Sprite; seen: number }>();
  private bubbleSprite(key: string): Sprite {
    let b = this.bubbles.get(key);
    if (!b) {
      const s = new Sprite();
      s.renderOrder = 12;
      this.dynamic.add(s);
      b = { s, seen: 0 };
      this.bubbles.set(key, b);
    }
    b.seen = this.frameNo;
    return b.s;
  }

  private syncNodes(s: State): void {
    s.nodes.forEach((n, i) => {
      const key = `n:${i}`;
      const p = this.place(key, n.type, this.wv(n.pos));
      if (n.enabled) this.candidate(n.type, p);
      const body = p.model.parts["body"] as Mesh | undefined;
      const steps = body?.userData["steps"] as number[] | undefined;
      if (body && steps) {
        const def = this.content.nodes[n.type] as { stock?: number | null } | undefined;
        const max = Math.max(this.stockMax.get(key) ?? 0, def?.stock ?? 0, n.stock ?? 0);
        this.stockMax.set(key, max);
        const frac = n.stock === null || max === 0 ? 1 : n.stock / max;
        const idx = Math.ceil(frac * (steps.length - 1));
        body.geometry.setDrawRange(0, steps[Math.max(0, Math.min(steps.length - 1, idx))]!);
      }
      const lamp = p.model.parts["lamp"] as Mesh | undefined;
      if (lamp) {
        const mat = lamp.material as MeshBasicMaterial;
        mat.color.set(n.enabled ? this.tokens.plasmaHot : mix(this.tokens.groundDark, this.tokens.ink, 0.3));
      }
      const glass = p.model.parts["glass"];
      if (glass) glass.visible = true;
      // a locked node shows a padlock-style label until its unlock pad completes
      const sp = this.sprite(p, 0);
      if (!n.enabled) {
        const txt = uiText(this.skin, "locked");
        sp.visible = this.labels.apply(sp, `lock|${txt}`, () => this.labels.text(txt, this.skin.palette.ui.panel, 34), 9);
        sp.position.set(p.model.root.position.x, ART_M * 2.2, p.model.root.position.z); // above the unlock pad's label
      } else sp.visible = false;
    });
  }

  private syncStructures(s: State): void {
    for (const st of s.structures) {
      const key = `s:${st.id}:${st.type}:${st.level}`;
      const p = this.place(key, st.type, this.wv(st.pos), st.level);
      this.candidate(st.type, p);
      if (st.type === "struct.ranged_defense") this.aimTurret(p, st, s);
      const lights = p.model.parts["lights"];
      if (lights) lights.visible = this.fuelK > 0 || Math.sin(this.t * 9) > 0;
      const beacon = p.model.parts["beacon"];
      if (beacon) beacon.scale.setScalar(0.8 + 0.3 * Math.sin(this.t * 3));
      if (st.type === "struct.gate") this.gateDoors(p, this.wv(st.pos));
    }
  }

  private aimTurret(p: Placed, st: State["structures"][number], s: State): void {
    const head = p.model.parts["head"];
    if (!head) return;
    const tiers = (this.content.structures["struct.ranged_defense"] as { tiers?: { range: number }[] } | undefined)?.tiers ?? [];
    const range = tiers[Math.min(tiers.length - 1, Math.max(0, st.level - 1))]?.range ?? 115;
    let best: V | null = null, bd = range * range;
    for (const h of s.hostiles) {
      const hp = this.interp.pos(`h:${h.id}`, h.pos, 1);
      const d = (hp.x - st.pos.x / FP) ** 2 + (hp.y - st.pos.y / FP) ** 2;
      if (d < bd) { bd = d; best = hp; }
    }
    const want = best ? Math.atan2(best.x - st.pos.x / FP, best.y - st.pos.y / FP) : head.rotation.y + 0.004;
    let dy = want - head.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    head.rotation.y += dy * 0.2;
    const muzzle = p.model.parts["muzzle"];
    const fk = this.fx!.flashK(`s:${st.id}`);
    if (muzzle) {
      muzzle.visible = fk > 0;
      muzzle.scale.setScalar(0.7 + fk);
    }
    head.position.z = -fk * 0.08;
  }

  private gateDoors(p: Placed, at: Vector3): void {
    const doors = p.model.parts["doors"];
    if (!doors) return;
    const w = this.world!;
    let near = Math.hypot(w.player.pos.x / FP - at.x, w.player.pos.y / FP - at.z) < 46;
    if (!near) for (const r of w.residents) if (Math.hypot(r.pos.x / FP - at.x, r.pos.y / FP - at.z) < 40) { near = true; break; }
    const open = (p.data["open"] as number | undefined) ?? 0;
    const k = open + ((near ? 1 : 0) - open) * 0.15;
    p.data["open"] = k;
    doors.children.forEach((d, i) => { d.position.x = (i === 0 ? -1 : 1) * (0.5 + k * 0.85); });
  }

  private syncConverters(s: State): void {
    const items = this.items!;
    for (const cv of s.converters) {
      const p = this.place(`cv:${cv.id}`, cv.type, this.wv(cv.pos));
      this.candidate(cv.type, p);
      const popAge = this.fx!.popAge(`cv:${cv.id}`);
      p.model.root.scale.setScalar(ART_M * (popAge < 0.5 ? 1 + 0.25 * Math.sin((popAge / 0.5) * Math.PI) : 1));
      const def = this.content.converters[cv.type] as { outCap?: number; range?: number; role?: string; output?: string } | undefined;
      const manned = this.converterManned(s, cv, def);
      const blocked = cv.out >= (def?.outCap ?? 99);
      const working = manned && cv.inQ.length > 0 && !blocked;
      const spin = p.model.parts["spin"];
      if (spin) spin.rotation.z += working ? 0.18 : 0.004;
      const status = p.model.parts["status"] as Mesh | undefined;
      if (status) (status.material as MeshBasicMaterial).color.set(blocked ? this.tokens.danger : working ? this.tokens.ok : this.tokens.accent);
      const melt = p.model.parts["melt"];
      if (melt) melt.visible = working || Math.sin(this.t * 2) > 0.3;
      if (working && Math.random() < 0.12) {
        const r = p.model.root;
        this.fx!.puff(v3(r.position.x + 0.55 * ART_M, 2.0 * ART_M, r.position.z - 0.4 * ART_M), mix(this.tokens.structure, this.tokens.sky, 0.5));
      }
      // input queue on the hopper, output stacked on the pickup tray
      const dep = this.anchorWorld(p, "deposit", tmpV);
      cv.inQ.slice(0, 6).forEach((res, i) => items.add(res, dep.x + ((i % 3) - 1) * 6, dep.y - 4 + Math.floor(i / 3) * 6, dep.z + ((i * 5) % 3) - 1, i));
      const pick = this.anchorWorld(p, "pickup", tmpV2);
      const outRes = def?.output ?? "res.food_prepared";
      for (let i = 0; i < Math.min(12, cv.out); i++) {
        const col = i % 2, row = Math.floor(i / 2);
        items.add(outRes, pick.x + (col - 0.5) * 11, pick.y + row * items.height(outRes), pick.z, 0.2 * col);
      }
      // output count on the tray; red with "!" once it is full and the machine has stopped
      const chip = this.sprite(p, 1);
      if (cv.out > 0) {
        chip.visible = this.labels.apply(chip, `shelf|${outRes}|${cv.out}|over:${blocked}`, () => this.shelfChipArt(outRes, cv.out, false, blocked), 13);
        chip.position.set(pick.x, pick.y + Math.ceil(Math.min(12, cv.out) / 2) * items.height(outRes) + 10, pick.z);
      } else chip.visible = false;
      const warn = this.sprite(p, 0);
      if (blocked || !manned) {
        const txt = blocked ? "!" : "?";
        warn.visible = this.labels.apply(warn, `warn|${txt}`, () => this.warnArt(txt, blocked ? this.tokens.danger : this.tokens.interactive), 12);
        warn.position.set(p.model.root.position.x, ART_M * 2.5 + Math.sin(this.t * 4) * 1.5, p.model.root.position.z);
      } else warn.visible = false;
    }
  }

  private converterManned(s: State, cv: State["converters"][number], def: { range?: number; role?: string } | undefined): boolean {
    const op = cv.operatorPos;
    const r = (def?.range ?? 30) * FP;
    const near = (p: V, rr: number): boolean => (p.x - op.x) ** 2 + (p.y - op.y) ** 2 < rr * rr;
    if (near(s.player.pos, r)) return true;
    return s.residents.some((x) => x.role === def?.role && x.status === "ok" && near(x.pos, 12 * FP));
  }

  private syncDepot(s: State): void {
    const d = s.depot;
    if (!d) return;
    // the depot is also a structure (struct.depot), drawn cut away: its stock stands inside in
    // one column per resource with a count chip, so the inventory reads without tapping
    const st = s.structures.find((x) => x.type === "struct.depot");
    const p = st ? this.placed.get(`s:${st.id}:${st.type}:${st.level}`) : undefined;
    const at = this.wv(d.pos);
    const items = this.items!;
    const stock = Object.entries(d.stock).filter(([, n]) => n > 0);
    const cols = Math.max(1, stock.length), pitch = Math.min(0.5, 2.0 / cols) * ART_M;
    stock.forEach(([res, n], i) => {
      const x = at.x + (i - (cols - 1) / 2) * pitch, z = at.z - 0.15 * ART_M;
      for (let j = 0; j < Math.min(10, n); j++) items.add(res, x, 0.16 * ART_M + j * items.height(res), z, 0.3 * (j % 2));
      if (!p) return;
      const chip = this.sprite(p, i);
      chip.visible = this.labels.apply(chip, `shelf|${res}|${n}|false`, () => this.shelfChipArt(res, n, false), 13);
      chip.position.set(x, 0.16 * ART_M + Math.min(10, n) * items.height(res) + 9, z);
    });
    if (p) for (let i = stock.length; i < p.sprites.length; i++) p.sprites[i]!.visible = false;
  }

  private syncPads(s: State): void {
    const done = new Set<string>(s.built);
    for (const p of s.pads) if (p.done) done.add(p.id);
    const pl = s.player.pos;
    const ghosts = new Set(s.pads
      .filter((pad) => !pad.done && pad.visible && this.ghostable(this.pads.get(pad.id)))
      .sort((a, b) => ((a.pos.x - pl.x) ** 2 + (a.pos.y - pl.y) ** 2) - ((b.pos.x - pl.x) ** 2 + (b.pos.y - pl.y) ** 2) || (a.id < b.id ? -1 : 1))
      .slice(0, TIERS[this.quality].ghosts)
      .map((pad) => pad.id));
    for (const pad of s.pads) {
      if (pad.done || !pad.visible) continue;
      const info = this.pads.get(pad.id);
      const big = info?.big ?? false;
      const at = this.wv(pad.pos);
      const p = this.place(`pad:${pad.id}`, pad.type, at, 1);
      if (big && p.data["big"] === undefined) { p.data["big"] = true; }
      const sc = big ? 1.4 : 1;
      this.popScale(p, ART_M, sc, sc);
      const cost = info?.cost ?? {};
      const total = Object.values(cost).reduce((x, y) => x + y, 0) || 1;
      const paid = Object.entries(cost).reduce((x, [r, c]) => x + Math.min(c, pad.paid[r] ?? 0), 0);
      const fill = paid / total;
      const fb = Math.round(fill * 24);
      // ground decal: dashed outline, fill ring
      let decal = p.extra[0] as Mesh | undefined;
      if (!decal) {
        decal = new Mesh(this.padPlane!, new MeshBasicMaterial({ visible: false }));
        decal.renderOrder = 1;
        this.dynamic.add(decal);
        p.extra[0] = decal;
      }
      const wk = info?.kind === "hire" ? info : undefined;
      const dm = this.labels.meshMaterial(`pd|${fb}|${pad.locked}|${big}|${wk?.what ?? ""}|${wk?.worker?.res ?? ""}`, () => this.padDecalArt(fb / 24, pad.locked, big, wk?.what, wk?.worker?.res));
      if (dm) { decal.material = dm; decal.visible = true; } else decal.visible = false;
      decal.position.set(at.x, 2.4, at.z);
      decal.scale.setScalar(1.75 * ART_M * sc * Math.min(1, p.model.root.scale.y / ART_M));
      // floating name plus every cost resource with what is still owed (icon + number each)
      const sp = this.sprite(p, 0);
      const owed = Object.entries(cost).map(([res, n]) => ({ res, left: Math.max(0, n - (pad.paid[res] ?? 0)) }));
      if (!owed.length) owed.push({ res: "res.currency", left: 0 });
      const label = info?.label ?? nameOf(this.skin, pad.type);
      const lockTxt = padLockReason(this.skin, info, pad.locked, s.core.level);
      const rows = owed.length > PAD_PER_ROW ? 2 : 1;
      const artH = (rows === 2 ? PAD_ART_H2 : PAD_ART_H) + (lockTxt ? PAD_LOCK_H : 0);
      sp.visible = this.labels.apply(sp, `pl|${label}|${owed.map((o) => `${o.res}:${o.left}`).join(",")}|${pad.locked}|${lockTxt}`, () => this.padLabelArt(label, owed, pad.locked, lockTxt), PAD_LABEL_H * (artH / PAD_ART_H));
      // a pad that places a new model shows its blueprint at full size, so a name never floats over nothing
      const ghostH = ghosts.has(pad.id) ? this.syncGhost(p, info!.what, at, fill) : this.hideGhost(p);
      const lift = Math.max(1.25, ghostH + 0.3);
      sp.position.set(at.x, ART_M * (lift + (rows - 1) * 0.35 + Math.sin(this.t * 2.2 + at.x) * 0.04), at.z);
      this.candidate(pad.type, p, ART_M * (lift + 1.35 + (rows - 1) * 0.6));
      // scaffold rises with the payment for upgrades that have no blueprint of their own
      let scaf = p.extra[1] as Mesh | undefined;
      const builds = info?.kind === "build" && (info.what.startsWith("struct.") || info.what.startsWith("conv.") || info.what === "sink.core.level");
      if (builds && paid > 0 && !ghostH) {
        if (!scaf) {
          scaf = new Mesh(this.scaffoldGeo!, this.bctx!.mats.std);
          this.dynamic.add(scaf);
          p.extra[1] = scaf;
        }
        scaf.visible = true;
        scaf.position.set(at.x, 0, at.z);
        scaf.scale.set(ART_M * sc, ART_M * (0.25 + fill * 1.6), ART_M * sc);
      } else if (scaf) scaf.visible = false;
      this.padRing(p, s, pad, big, at);
    }
  }

  /**
   * Translucent blueprint of what a build pad places (structures and converters; upgrades have
   * none), firming up as it is paid. Returns its height in art metres, 0 when there is none.
   */
  private ghostable(info: PadInfo | undefined): boolean {
    return info?.kind === "build" && hasModel(info.what) && !this.content.upgrades[info.what];
  }

  private hideGhost(p: Placed): number {
    const g = p.extra[3];
    if (g) g.visible = false;
    return 0;
  }

  private syncGhost(p: Placed, what: string, at: Vector3, fill: number): number {
    let g = p.extra[3] as Group | undefined;
    if (!g) {
      const mat = new MeshLambertMaterial({ color: new Color(this.tokens.interactive), emissive: new Color(this.tokens.interactive), emissiveIntensity: 0.55, transparent: true, depthWrite: false });
      const m = buildModel(what, { ...this.bctx!, level: 1 });
      const drop: Object3D[] = [];
      m.root.traverse((o) => {
        const me = o as Mesh;
        if (me.isMesh) { me.material = mat; me.castShadow = false; me.receiveShadow = false; me.renderOrder = 3; }
        else if ((o as Light).isLight || (o as Sprite).isSprite) drop.push(o);
      });
      for (const o of drop) o.removeFromParent();
      m.root.updateMatrixWorld(true);
      tmpBox.setFromObject(m.root);
      g = m.root;
      g.userData["ghost"] = mat;
      g.userData["h"] = tmpBox.isEmpty() ? 1 : Math.max(0.3, tmpBox.max.y);
      g.scale.setScalar(ART_M);
      this.dynamic.add(g);
      p.extra[3] = g;
    }
    g.visible = true;
    g.position.set(at.x, 0, at.z);
    (g.userData["ghost"] as MeshLambertMaterial).opacity = 0.5 + 0.3 * fill + 0.06 * Math.sin(this.t * 3 + at.x);
    return g.userData["h"] as number;
  }

  /**
   * The payment ring: where standing starts spending. It appears as the hero approaches
   * (dashed, fading in over the last 40 units); inside, a white arc winds up over the sim's
   * pad dwell, then the ring spins while paying.
   */
  private padRing(p: Placed, s: State, pad: State["pads"][number], big: boolean, at: Vector3): void {
    const rFp = big ? this.cp?.pads.bigRange : this.cp?.pads.range;
    let ring = p.extra[2] as Mesh | undefined;
    if (!rFp || pad.locked) { if (ring) ring.visible = false; return; }
    const r = rFp / FP;
    const d = Math.hypot(s.player.pos.x / FP - at.x, s.player.pos.y / FP - at.z);
    const near = 40;
    if (d > r + near) { if (ring) ring.visible = false; return; }
    if (!ring) {
      ring = new Mesh(this.padPlane!, new MeshBasicMaterial({ visible: false }));
      ring.renderOrder = 2;
      this.dynamic.add(ring);
      p.extra[2] = ring;
    }
    const inside = d <= r;
    const k = inside ? 4 : Math.max(1, Math.min(3, Math.round((1 - (d - r) / near) * 3)));
    const wind = inside ? this.dwellK(s, pad.id) : null;
    const wq = wind === null || wind >= 1 ? -1 : Math.round(wind * 16);
    const m = this.labels.meshMaterial(`pr|${inside}|${k}|${big}|${wq}`, () => this.padRingArt(inside, k / 4, big, wq < 0 ? null : wq / 16));
    if (!m) { ring.visible = false; return; }
    ring.material = m;
    ring.visible = true;
    ring.position.set(at.x, 2.8, at.z);
    ring.scale.setScalar(r * 2 * (256 / 236));
    ring.rotation.y = inside && wq < 0 ? -this.t * 2.4 : 0;
  }

  /**
   * Wind-up toward payment, 0..1, from the sim's pad dwell (state.player.padDwell ticks on the
   * pad named in player state, over the compiled pads.dwellTicks); null before the sim has it.
   */
  private dwellK(s: State, padId: string): number | null {
    const pl = s.player as unknown as Record<string, unknown>;
    const ticks = pl["padDwell"];
    const need = (this.cp?.pads as unknown as Record<string, unknown> | undefined)?.["dwellTicks"];
    if (typeof ticks !== "number" || typeof need !== "number") return null;
    const on = pl["padId"] ?? pl["dwellPad"] ?? pl["pad"];
    if (on !== undefined && on !== null && on !== padId) return 0;
    return need <= 0 ? 1 : Math.max(0, Math.min(1, ticks / need));
  }

  private padRingArt(inside: boolean, a: number, big: boolean, wind: number | null = null): LabelArt {
    const t = this.tokens;
    const col = big ? t.accent : t.interactive;
    return {
      w: 256, h: 256,
      draw: (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.globalAlpha = a;
        g.beginPath(); g.arc(w / 2, h / 2, 118, 0, Math.PI * 2);
        g.lineWidth = 7; g.strokeStyle = col;
        if (!inside) g.setLineDash([16, 12]);
        g.stroke();
        g.setLineDash([]);
        if (inside && wind !== null) {
          // winding up: a white arc fills clockwise; payment starts when it closes
          g.lineWidth = 14; g.lineCap = "round"; g.strokeStyle = "#ffffff";
          g.beginPath(); g.arc(w / 2, h / 2, 118, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * wind); g.stroke();
        } else if (inside) {
          g.lineWidth = 12; g.lineCap = "round"; g.strokeStyle = "#ffffff";
          for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(w / 2, h / 2, 118, (i * 2 * Math.PI) / 3, (i * 2 * Math.PI) / 3 + 0.6); g.stroke(); }
        }
        g.globalAlpha = 1;
      },
    };
  }

  private syncBarriers(s: State): void {
    const W = this.walls!;
    const reinforced = (s.params["barrier.hpMax"] ?? 0) > ((this.content.structures["struct.barrier"] as { hp?: number } | undefined)?.hp ?? 14);
    for (const b of s.barriers) {
      b.sections.forEach((sec, i) => {
        const a = this.wv(sec.a), c = this.wv(sec.b);
        const mid = v3((a.x + c.x) / 2, 0, (a.z + c.z) / 2);
        const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz);
        const ang = Math.atan2(-dz, dx);
        if (sec.gate) {
          const p = this.place(`gate:${b.id}:${i}`, "struct.gate", mid);
          p.model.root.rotation.y = ang;
          this.popScale(p, ART_M, sec.built ? len / (2.6 * ART_M) : 0.0001, 1);
          if (!sec.built) p.model.root.visible = false; else p.model.root.visible = true;
          if (sec.built) this.gateDoors(p, mid);
          const lamp = p.model.parts["lamp"] as Mesh | undefined;
          if (lamp) (lamp.material as MeshBasicMaterial).color.set(sec.hp < sec.hpMax * 0.5 ? this.tokens.danger : this.tokens.ok);
        }
        if (sec.built) this.wallHp(b.id, i, sec, mid, s);
        else this.hideWallHp(b.id, i);
        if (sec.built && !sec.gate) {
          const low = sec.hp < sec.hpMax * 0.5;
          const pop = this.fx!.popAge(`bar:${b.id}:${i}`);
          const k = pop < 0.45 ? Math.min(1.12, (pop / 0.3) * 1.12) - Math.max(0, pop - 0.3) * 0.8 : 1;
          tmpM.makeRotationY(ang).scale(tmpV.set(len, ART_M * Math.max(0.05, k), ART_M)).setPosition(mid);
          (low ? W.cracked : reinforced ? W.reinforced : W.wall).push(tmpM);
        } else if (!sec.built) {
          // dashed marker plus a floating cost
          const nd = Math.max(1, Math.floor(len / 14));
          for (let j = 0; j < nd; j++) {
            const f = (j + 0.5) / nd;
            tmpM.makeRotationY(ang).scale(tmpV.setScalar(ART_M)).setPosition(a.x + dx * f, 0, a.z + dz * f);
            W.dash.push(tmpM);
          }
          const key = `barl:${b.id}:${i}`;
          const holder = this.place(key, "barrier.line", mid, 1, () => ({ root: new Group(), cls: "decal", parts: {} }));
          const left = Math.max(0, b.costPerSection - sec.paid);
          this.candidatePt("barrier.line", mid.x, mid.z, ART_M * 1.6);
          const sp = this.sprite(holder, 0);
          sp.visible = this.labels.apply(sp, `bl|${b.res}|${left}`, () => this.costArt(b.res, left), 11);
          sp.position.set(mid.x, ART_M * (0.7 + Math.sin(this.t * 2 + i) * 0.04), mid.z);
        }
      });
    }
  }

  /** HP pips over a wall section when it is damaged or the hero is close (readable at a glance). */
  private wallHp(line: string | number, i: number, sec: State["barriers"][number]["sections"][number], mid: Vector3, s: State): void {
    const near = Math.hypot(s.player.pos.x / FP - mid.x, s.player.pos.y / FP - mid.z) < 70;
    const key = `hp:${line}:${i}`;
    if (!(sec.hp < sec.hpMax || near) || sec.hpMax <= 0) { this.hideWallHp(line, i); return; }
    const holder = this.place(key, "barrier.hp", mid, 1, () => ({ root: new Group(), cls: "decal", parts: {} }));
    const sp = this.sprite(holder, 0);
    const pips = Math.min(8, sec.hpMax);
    const on = Math.max(0, Math.ceil((sec.hp / sec.hpMax) * pips));
    sp.visible = this.labels.apply(sp, `hp|${on}|${pips}`, () => this.hpArt(on, pips), 7);
    sp.position.set(mid.x, ART_M * 1.25, mid.z);
  }

  private hideWallHp(line: string | number, i: number): void {
    const p = this.placed.get(`hp:${line}:${i}`);
    if (p) p.seen = false;
  }

  private hpArt(on: number, pips: number): LabelArt {
    const t = this.tokens;
    const pw = 22, gap = 5, w = pips * (pw + gap) + gap + 8, h = 30;
    const col = on / pips > 0.5 ? t.ok : on / pips > 0.25 ? t.accent : t.danger;
    return {
      w, h,
      draw: (g) => {
        roundRect(g, 2, 2, w - 4, h - 4, 10);
        g.fillStyle = t.ink; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
        for (let k = 0; k < pips; k++) {
          roundRect(g, 4 + gap + k * (pw + gap), 8, pw, h - 16, 4);
          g.fillStyle = k < on ? col : "rgba(255,255,255,0.18)";
          g.fill();
        }
      },
    };
  }

  private syncZones(s: State): void {
    const W = this.walls!;
    for (const z of s.zones) {
      const x = z.rect.x / FP, y = z.rect.y / FP, w = z.rect.w / FP, h = z.rect.h / FP;
      if (z.type === "zone.blocked") {
        const age = this.fx!.popAge(`zone:${z.id}`);
        if (z.cleared && age > 0.6) continue;
        const k = z.cleared ? Math.max(0, 1 - age / 0.6) : 1;
        if (!z.cleared) this.candidatePt("zone.blocked", x + w / 2, y + h / 2, ART_M * 1.8);
        // tile rubble across the rect, instanced
        const tile = ART_M * 1.3;
        const nx = Math.max(1, Math.round(w / tile)), ny = Math.max(1, Math.round(h / tile));
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          tmpM.makeRotationY((i * 7 + j * 3) % 6).scale(tmpV.set((w / nx) * 1.15, ART_M * 1.25 * k, (h / ny) * 1.15)).setPosition(x + (i + 0.5) * (w / nx), 0, y + (j + 0.5) * (h / ny));
          W.rubble.push(tmpM);
        }
      } else if (z.type === "zone.waiting") {
        const p = this.place(`z:${z.id}`, "zone.waiting", v3(x + w / 2, 0, y + h / 2));
        p.model.root.scale.set(w, ART_M, h);
      }
    }
    // prey zones have no outline: a few burrows mark the patch the critters roam
    for (const pz of s.preyZones) {
      const x = pz.rect.x / FP, y = pz.rect.y / FP, w = pz.rect.w / FP, h = pz.rect.h / FP;
      const n = Math.max(2, Math.min(3, Math.round((w * h) / (ART_M * ART_M * 40))));
      for (let k = 0; k < n; k++) {
        const fx = 0.2 + 0.6 * (((k + 1) * 0.618 + pz.id.length * 0.13) % 1), fz = 0.25 + 0.5 * ((k * 0.382 + 0.31) % 1);
        this.place(`pz:${pz.id}:${k}`, "zone.prey", v3(x + w * fx, 0, y + h * fz));
      }
    }
  }

  private syncCaptures(s: State, a: number): void {
    for (const c of s.captures) {
      const key = `c:${c.id}`;
      const pos = this.interp.pos(key, c.pos, a);
      const p = this.place(`cap:${c.id}`, c.type, v3(pos.x, 0, pos.y));
      if (c.state === "idle") this.candidate(c.type, p);
      const lid = p.model.parts["lid"];
      const rt = (this.content.lassoables[c.type] as { releaseTime?: number } | undefined)?.releaseTime ?? 1.6;
      if (c.state === "releasing") {
        const k = clamp01(1 - c.timer / Math.max(1, rt * TPS));
        if (lid) lid.rotation.x = -k * 1.9;
        p.model.root.position.y = Math.sin(this.t * 30) * 0.6 * (1 - k);
      } else if (lid) lid.rotation.x = 0;
      if (c.state === "towed") {
        const v = this.interp.vel(key);
        p.model.root.rotation.y = Math.atan2(v.x, v.y) || p.model.root.rotation.y;
        p.model.root.rotation.z = Math.sin(this.t * 6 + c.id) * 0.08;
        p.model.root.position.y = 2 + Math.abs(Math.sin(this.t * 8 + c.id)) * 2;
      }
      this.blobs!.add(pos.x, pos.y, 18);
      // idle pods beckon with a pulsing ring of light
      if (c.state === "idle") {
        const sp = this.sprite(p, 0);
        sp.visible = this.labels.apply(sp, `cap|${c.type}`, () => this.warnArt("+", this.tokens.interactive), 10);
        sp.position.set(pos.x, ART_M * (1.15 + Math.sin(this.t * 3 + c.id) * 0.06), pos.y);
      } else if (p.sprites[0]) p.sprites[0].visible = false;
    }
  }

  private syncDrops(s: State): void {
    for (const d of s.drops) {
      const at = this.wv(d.pos);
      const bounce = Math.abs(Math.sin(this.t * 5 + d.id)) * 7;
      this.items!.add(d.res, at.x, bounce, at.z, this.t * 2 + d.id);
      this.blobs!.add(at.x, at.z, 6);
    }
  }

  // ---------------------------------------------------------------- characters

  private anim(key: string, speed: number, carry: boolean): Anim {
    const ph = (this.phase.get(key) ?? (key.length * 1.7)) + speed * 0.22;
    this.phase.set(key, ph);
    return { t: this.t, phase: ph, speed, carry, hit: 0, knock: 0, cheer: (this.cheerUntil.get(key) ?? 0) > this.t ? 1 : 0, distress: 0, down: 0 };
  }

  private addCharacter(look: Look, anim: Anim, pos: V, yaw: number, frost: string | null, lift = 0): Matrix4 {
    const s = ART_M * look.scale;
    tmpM.makeRotationY(yaw).scale(tmpV.setScalar(s)).setPosition(pos.x, lift, pos.y);
    this.crowd!.add(look, anim, tmpM, frost);
    this.blobs!.add(pos.x, pos.y, look.kind === "creature" ? 16 : 10 * look.scale);
    return tmpM;
  }

  private faceFrom(key: string, v: V, fallback?: number): number {
    const prev = this.yaw.get(key) ?? fallback ?? 0;
    if (Math.hypot(v.x, v.y) < 0.05) return prev;
    const want = Math.atan2(v.x, v.y);
    let d = want - prev;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const y = prev + d * 0.35;
    this.yaw.set(key, y);
    return y;
  }

  private distressFor(p: V): number {
    if (this.safeR <= 0) return 0;
    const w = this.world!;
    const out = Math.hypot(p.x - w.core.pos.x / FP, p.y - w.core.pos.y / FP) > this.safeR;
    const low = this.lifeK < 0.4 ? (0.4 - this.lifeK) / 0.4 : 0;
    return Math.max(out && this.lifeK < 0.85 ? 0.6 : 0, low, w.core.fuel <= 0 ? 0.8 : 0);
  }

  private syncCharacters(s: State, a: number, pl: V, dt: number): void {
    const t = this.tokens;
    const items = this.items!;
    // player with the back stack
    const look = lookFor("unit.player", t, this.skin.models);
    const v = this.interp.vel("player");
    const yaw = this.faceFrom("player", v, 0);
    const anim = this.anim("player", this.moving, s.player.stack.length > 0);
    anim.distress = this.distressFor(pl);
    anim.hit = this.fx!.flashK("player") * 0.6;
    this.addCharacter(look, anim, pl, yaw, t.frost);
    this.backStack(s.player.stack, pl, yaw, look.scale, this.moving, v, true);

    for (const r of s.residents) {
      if (r.status === "towed" || r.status === "releasing") continue;
      const key = `r:${r.id}`;
      const pos = this.interp.pos(key, r.pos, a);
      const rv = this.interp.vel(key);
      const sp = Math.min(1, Math.hypot(rv.x, rv.y) / 2.4);
      const id = r.role === "idle" ? "role.idle" : r.role;
      const rl = lookFor(id, t, this.skin.models);
      const ry = this.faceFrom(key, rv);
      const an = this.anim(key, sp, !!r.carry);
      const dead = (r.status as string) === "dead" || r.status === "frozen";
      an.distress = dead ? 1 : this.distressFor(pos);
      if (dead) { an.ice = 1; an.speed = 0; }
      if (r.status === "injured") { an.speed *= 0.6; an.hit = 0.2 + 0.2 * Math.sin(this.t * 6); }
      if (r.status === "healing") an.down = 1;
      this.addCharacter(rl, an, pos, ry, t.frost);
      if (r.carry && r.n > 0) this.backStack(new Array<string>(Math.min(6, r.n)).fill(r.carry), pos, ry, rl.scale, sp, rv, false);
      // frost meter over a colonist while the reactor is out (resident.frost, 0..1000)
      const frost = r.frost;
      if (typeof frost === "number" && frost > 0 && !dead) this.barTag(pos.x, ART_M * rl.scale * 1.45, pos.y, frost / 1000, t.frost, 7);
    }

    for (const h of s.hostiles) {
      const key = `h:${h.id}`;
      const pos = this.interp.pos(key, h.pos, a);
      const hv = this.interp.vel(key);
      const hl = lookFor(h.type, t, this.skin.models);
      const hy = this.faceFrom(key, hv, 0);
      const an = this.anim(key, Math.min(1, Math.hypot(hv.x, hv.y) / 1.2 + (h.target !== "core" ? 0.5 : 0)), false);
      const fk = this.fx!.flashK(key);
      an.hit = fk;
      an.knock = fk * 0.5;
      // knockback: shoved away from where it faces
      const kb = fk * 7;
      this.addCharacter(hl, an, { x: pos.x - Math.sin(hy) * kb, y: pos.y - Math.cos(hy) * kb }, hy, null);
      this.candidatePt(h.type, pos.x, pos.y, ART_M * hl.scale * 1.8);
      // health bar over bosses (content `boss` flag) and wounded attackers
      const hpMax = h.hpMax;
      const boss = !!this.cp?.hostiles[h.type]?.boss;
      if (hpMax > 0 && (boss || h.hp < hpMax)) this.barTag(pos.x, ART_M * hl.scale * (boss ? 1.9 : 1.5), pos.y, h.hp / hpMax, t.danger, boss ? 12 : 6);
    }

    for (const p of s.prey) {
      if (!p.alive) continue;
      const key = `p:${p.id}`;
      const pos = this.interp.pos(key, p.pos, a);
      const pv = this.interp.vel(key);
      const look2 = lookFor("unit.prey", t, this.skin.models);
      const py = this.faceFrom(key, pv, 0);
      const an = this.anim(key, Math.min(1, Math.hypot(pv.x, pv.y) / 0.8), false);
      an.hit = this.fx!.flashK(key);
      an.knock = an.hit * 0.6;
      this.addCharacter(look2, an, pos, py, null);
      this.candidatePt("unit.prey", pos.x, pos.y, ART_M * look2.scale * 1.6);
    }
    // order bubbles of customers that left the queue
    for (const [k, b] of this.bubbles) if (b.seen !== this.frameNo) { this.dynamic.remove(b.s); this.bubbles.delete(k); }
    void items; void dt;
  }

  /**
   * Items on a character's back. The hero's pack is one column per resource, side by side in a
   * fixed (content) order, each up to its carry cap, with a MAX tag over any full column; a worker
   * carries one column. Columns wobble with speed; items still flying in are held back.
   */
  private backStack(stack: readonly string[], pos: V, yaw: number, scale: number, moving: number, vel: V, player: boolean): void {
    const items = this.items!;
    const counts = new Map<string, number>();
    for (const r of stack) counts.set(r, (counts.get(r) ?? 0) + 1);
    const order = Object.keys(this.content.resources);
    const cols = [...counts.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const s = ART_M * scale;
    const k = scale > 1 ? 1 : 0.9;
    const lean = Math.min(1, Math.hypot(vel.x, vel.y) / 3);
    const colW = 0.42 * ART_M * k * (ITEM_K / 1.05);
    cols.forEach((res, ci) => {
      const row = Math.floor(ci / BACK_PER_ROW), inRow = Math.min(BACK_PER_ROW, cols.length - row * BACK_PER_ROW);
      const across = ((ci % BACK_PER_ROW) - (inRow - 1) / 2) * colW;
      const back = 0.27 * s * (ITEM_K / 1.05) + row * 0.34 * ART_M * (ITEM_K / 1.05);
      const bx = pos.x - fx * back + rx * across, bz = pos.y - fz * back + rz * across;
      const total = counts.get(res)!;
      const n = Math.max(0, total - (player ? this.fx!.inFlightToPlayer(res) : 0));
      const h = items.height(res) * k;
      let y = 0.72 * s, wx = 0, wz = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.sin(this.t * 9 - i * 0.55 - ci * 0.7) * i * 0.3 * (0.3 + moving);
        const lb = -lean * i * 0.5;
        wx = rx * w + fx * lb; wz = rz * w + fz * lb;
        items.add(res, bx + wx, y, bz + wz, yaw + i * 0.2, k);
        y += h;
      }
      const cap = this.cp?.resources[res]?.cap;
      // neighbouring tags stagger up so two full columns never print over each other
      if (player && typeof cap === "number" && total >= cap) this.maxTag(bx + wx, y + 6 + (ci % 2) * 16, bz + wz);
    });
  }

  // ---------------------------------------------------------------- guide arrow and frost ring

  private syncMarks(s: State, pl: V): void {
    const m = this.marks;
    if (!m) return;
    const g = this.guideMark && !s.over ? this.guideMark : null;
    m.guide(pl.x, pl.y, g?.at.x ?? 0, g?.at.y ?? 0, this.t, !!g, ART_M * 1.9);
    m.hero(pl.x, pl.y, this.t, !s.over);
    if (g) {
      let sp = this.guideSprite;
      if (!sp) { sp = new Sprite(); sp.renderOrder = 15; this.dynamic.add(sp); this.guideSprite = sp; }
      const hh = 20;
      sp.visible = this.labels.apply(sp, `guide|${g!.text}`, () => this.guideArt(g!.text), hh);
      // the line rides the marker; with the target off screen it rides the ground arrow instead
      const scr = this.toScreen(v3(g.at.x, ART_M * 2.2, g.at.y));
      const off = scr.x < 70 || scr.x > this.cssW - 70 || scr.y < 40 || scr.y > this.cssH - 40;
      const dx = g.at.x - pl.x, dz = g.at.y - pl.y, d = Math.hypot(dx, dz) || 1;
      if (off && d > 46) sp.position.set(pl.x + (dx / d) * 34, ART_M * 1.5 + Math.abs(Math.sin(this.t * 4.2)) * 4, pl.y + (dz / d) * 34);
      else sp.position.set(g.at.x, ART_M * 1.9 + 38 + Math.abs(Math.sin(this.t * 4.2)) * 9, g.at.y);
    } else if (this.guideSprite) this.guideSprite.visible = false;
    // the frost ring drains with the reactor-out countdown, around the reactor
    const fz = s.freeze;
    const on = !!fz?.active && fz.ticksTotal > 0 && !s.over;
    const r = Math.max(30, Math.min(54, (this.safeR || 120) * 0.34));
    const c = this.wv(s.core.pos);
    m.frost(c.x, c.z, r, on ? fz.ticksLeft / fz.ticksTotal : 0, this.t, on);
    // one soft warning as the reactor runs low (re-armed once it is refuelled)
    if (this.fuelK < 0.2 && s.core.fuel > 0 && !this.lowFuelSaid) {
      this.lowFuelSaid = true;
      this.fx?.floater(floaterText(this.skin, "reactor_low"), this.tokens.danger, c.clone().setY(ART_M * 2.6), 44, 13);
    } else if (this.fuelK > 0.4) this.lowFuelSaid = false;
  }

  private guideArt(text: string): LabelArt {
    const t = this.tokens, ui = this.skin.palette.ui;
    const np = 34;
    const w = this.labels.textWidth(text, np) + 56;
    return {
      w, h: 64,
      draw: (g, W) => {
        roundRect(g, 3, 6, W - 6, 52, 26);
        g.fillStyle = ui.panel; g.globalAlpha = 0.96; g.fill(); g.globalAlpha = 1;
        g.lineWidth = 5; g.strokeStyle = t.interactive; g.stroke();
        g.font = `800 ${np}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = ui.ink; g.fillText(text, W / 2, 33);
      },
    };
  }

  // ---------------------------------------------------------------- lasso

  private syncLasso(s: State, a: number, pl: V, dt: number): void {
    const L = this.lasso!;
    // trail ribbon on the ground
    const trail = s.lasso?.trail ?? [];
    if (s.lasso?.engaged && trail.length > 1) {
      const pts = trail.map((p) => v3(p.x / FP, 2.5, p.y / FP));
      pts.push(v3(pl.x, 2.5, pl.y));
      this.ribbon(L.trail, pts, 3.2, false);
      L.trail.visible = true;
    } else L.trail.visible = false;
    // tow rope: verlet rope from the player's hand through each towed pod, sagging
    const tow = s.player.tow;
    if (tow.length > 0) {
      const anchors: Vector3[] = [v3(pl.x, ART_M * 0.45, pl.y)];
      for (const id of tow) {
        const c = s.captures.find((x) => x.id === id);
        if (c) { const p = this.interp.pos(`c:${c.id}`, c.pos, a); anchors.push(v3(p.x, ART_M * 0.5, p.y)); }
      }
      const SEG = 8;
      const n = (anchors.length - 1) * SEG + 1;
      if (L.ropePts.length !== n) {
        L.ropePts = [];
        for (let i = 0; i < n; i++) {
          const seg = Math.min(anchors.length - 2, Math.floor(i / SEG)), f = (i - seg * SEG) / SEG;
          L.ropePts.push(anchors[seg]!.clone().lerp(anchors[seg + 1]!, f));
        }
        L.ropePrev = L.ropePts.map((p) => p.clone());
      }
      const g = -420 * dt * dt;
      for (let i = 0; i < n; i++) {
        const p = L.ropePts[i]!, q = L.ropePrev[i]!;
        const vx = (p.x - q.x) * 0.92, vy = (p.y - q.y) * 0.92, vz = (p.z - q.z) * 0.92;
        q.copy(p);
        p.x += vx; p.y += vy + g; p.z += vz;
        if (p.y < 1) p.y = 1;
      }
      for (let it = 0; it < 6; it++) {
        for (let k = 0; k < anchors.length; k++) L.ropePts[k * SEG]!.copy(anchors[k]!);
        for (let i = 0; i < n - 1; i++) {
          const seg = Math.floor(i / SEG);
          const rest = (anchors[seg]!.distanceTo(anchors[seg + 1]!) * 1.12) / SEG;
          const p = L.ropePts[i]!, q = L.ropePts[i + 1]!;
          tmpV.subVectors(q, p);
          const d = tmpV.length() || 1e-6;
          const diff = (d - rest) / d * 0.5;
          if (i % SEG !== 0) p.addScaledVector(tmpV, diff);
          if ((i + 1) % SEG !== 0) q.addScaledVector(tmpV, -diff);
        }
      }
      this.ribbon(L.rope, L.ropePts, 2.2, true);
      L.rope.visible = true;
    } else { L.rope.visible = false; L.ropePts = []; }
  }

  /** Rebuild a strip mesh along points; `upright` faces the camera (rope), else lies flat (trail). */
  private ribbon(mesh: Mesh, pts: Vector3[], width: number, upright: boolean): void {
    const n = pts.length;
    const pos = new Float32Array(n * 2 * 3);
    const idx: number[] = [];
    const view = tmpV2.subVectors(this.camera.position, this.look).normalize();
    for (let i = 0; i < n; i++) {
      const p = pts[i]!, q = pts[Math.min(n - 1, i + 1)]!, o = pts[Math.max(0, i - 1)]!;
      tmpV.subVectors(q, o);
      if (upright) tmpV.cross(view); else tmpV.set(-tmpV.z, 0, tmpV.x);
      tmpV.normalize().multiplyScalar(width / 2);
      pos.set([p.x + tmpV.x, p.y + tmpV.y, p.z + tmpV.z, p.x - tmpV.x, p.y - tmpV.y, p.z - tmpV.z], i * 6);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = mesh.geometry;
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g.setIndex(idx);
    g.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- label art

  private orderArt(res: string, want: number, k: number, serve: number | null = null): LabelArt {
    const t = this.tokens, ui = this.skin.palette.ui;
    return {
      w: 150, h: 120,
      draw: (g) => {
        roundRect(g, 8, 8, 134, 84, 38);
        g.fillStyle = ui.panel; g.fill();
        g.lineWidth = 6; g.strokeStyle = t.ink; g.stroke();
        g.beginPath(); g.moveTo(66, 90); g.lineTo(75, 112); g.lineTo(86, 90); g.closePath();
        g.fillStyle = ui.panel; g.fill();
        drawIcon(g, 48, 50, 22, resToken(t, res), t.ink);
        g.font = `800 38px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = t.ink; g.fillText(`${want}`, 102, 52);
        // patience arc
        g.beginPath(); g.arc(48, 50, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        g.lineWidth = 6; g.strokeStyle = k > 0.35 ? t.ok : t.danger; g.stroke();
        // serve progress: a bar along the bubble's lower edge while the customer is being served
        if (serve !== null) {
          roundRect(g, 24, 68, 102, 14, 7); g.fillStyle = ui.panel; g.fill(); g.lineWidth = 3; g.strokeStyle = t.ink; g.stroke();
          if (serve > 0) { roundRect(g, 24, 68, Math.max(14, 102 * serve), 14, 7); g.fillStyle = t.ok; g.fill(); }
        }
      },
    };
  }

  private padDecalArt(fill: number, locked: boolean, big: boolean, role?: string, res?: string): LabelArt {
    const t = this.tokens;
    const col = big ? t.accent : t.interactive;
    return {
      w: 256, h: 256,
      draw: (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.setLineDash([22, 14]);
        roundRect(g, 14, 14, w - 28, h - 28, 44);
        g.lineWidth = 9; g.strokeStyle = locked ? mix(t.structureDark, t.ink, 0.3) : col; g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(w / 2, h / 2, 82, 0, Math.PI * 2);
        g.lineWidth = 18; g.strokeStyle = "rgba(0,0,0,0.28)"; g.stroke();
        if (fill > 0) {
          g.beginPath(); g.arc(w / 2, h / 2, 82, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
          g.lineWidth = 18; g.lineCap = "round"; g.strokeStyle = col; g.stroke();
        }
        // a hire pad shows who you get: the worker in their role colour, badged with what they handle
        if (role) {
          const body = this.skin.palette.role[role] ?? t.structure;
          g.globalAlpha = locked ? 0.5 : 1;
          g.lineWidth = 7; g.strokeStyle = t.ink; g.fillStyle = body;
          g.beginPath(); g.arc(w / 2, h / 2 - 22, 21, 0, Math.PI * 2); g.fill(); g.stroke();
          g.beginPath(); g.moveTo(w / 2 - 38, h / 2 + 44); g.quadraticCurveTo(w / 2 - 38, h / 2 + 4, w / 2, h / 2 + 4); g.quadraticCurveTo(w / 2 + 38, h / 2 + 4, w / 2 + 38, h / 2 + 44); g.closePath(); g.fill(); g.stroke();
          if (res) drawIcon(g, w / 2 + 40, h / 2 + 34, 22, resToken(t, res), t.ink);
          g.globalAlpha = 1;
        }
      },
    };
  }

  /**
   * Pad label: the name on top, then one pill per cost resource (icon + what is left), up to
   * PAD_PER_ROW per row and a second row beyond that. A paid-up resource shows a dimmed 0.
   */
  private padLabelArt(label: string, owed: readonly { res: string; left: number }[], locked: boolean, lockTxt: string): LabelArt {
    const t = this.tokens, ui = this.skin.palette.ui;
    const big = 44, small = 38, gap = 10;
    // A locked pad keeps its own name as the title; the reason sits under it, smaller.
    const top = label, lockPx = 28, extra = lockTxt ? PAD_LOCK_H : 0;
    const wTop = Math.max(this.labels.textWidth(top, small), lockTxt ? this.labels.textWidth(lockTxt, lockPx) : 0) + 30;
    const cell = owed.map((o) => this.labels.textWidth(`${o.left}`, big) + 64);
    const rowsOf = owed.length > PAD_PER_ROW ? [owed.slice(0, Math.ceil(owed.length / 2)), owed.slice(Math.ceil(owed.length / 2))] : [owed.slice()];
    let k = 0;
    const rowCells = rowsOf.map((r) => r.map(() => cell[k++]!));
    const rowW = rowCells.map((r) => r.reduce((a, b) => a + b, 0) + gap * (r.length - 1) + 24);
    const w = Math.max(wTop, ...rowW) + 20;
    const h = (rowsOf.length === 2 ? PAD_ART_H2 : PAD_ART_H) + extra;
    return {
      w, h,
      draw: (g, W) => {
        g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
        g.font = `800 ${small}px ${FONT}`;
        g.lineWidth = 8; g.strokeStyle = t.ink; g.strokeText(top, W / 2, 24);
        g.fillStyle = locked ? ui.muted : ui.panel; g.fillText(top, W / 2, 24);
        if (lockTxt) {
          g.font = `800 ${lockPx}px ${FONT}`;
          g.lineWidth = 7; g.strokeStyle = t.ink; g.strokeText(lockTxt, W / 2, 56);
          g.fillStyle = ui.panel; g.fillText(lockTxt, W / 2, 56);
        }
        rowsOf.forEach((row, ri) => {
          const y = 48 + extra + ri * 76;
          const x0 = (W - rowW[ri]!) / 2;
          roundRect(g, x0, y, rowW[ri]!, 68, 34);
          g.fillStyle = locked ? mix(t.structureDark, t.ink, 0.4) : t.ink; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
          let x = x0 + 12;
          row.forEach((o, i) => {
            const cw = rowCells[ri]![i]!;
            g.globalAlpha = o.left === 0 && owed.length > 1 ? 0.45 : 1;
            drawIcon(g, x + 24, y + 34, 20, resToken(t, o.res), t.ink);
            g.font = `800 ${big}px ${FONT}`;
            g.fillStyle = ui.panel; g.fillText(`${o.left}`, x + 48 + (cw - 48) / 2 - 4, y + 37);
            g.globalAlpha = 1;
            x += cw + gap;
          });
        });
      },
    };
  }

  private costArt(res: string, left: number): LabelArt {
    const t = this.tokens, ui = this.skin.palette.ui;
    const num = `${left}`;
    const w = this.labels.textWidth(num, 40) + 86;
    return {
      w, h: 70,
      draw: (g, W) => {
        roundRect(g, 3, 3, W - 6, 64, 32);
        g.fillStyle = t.ink; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
        drawIcon(g, 36, 35, 20, resToken(t, res), t.ink);
        g.font = `800 40px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = ui.panel; g.fillText(num, 36 + (W - 36) / 2, 38);
      },
    };
  }

  private warnArt(txt: string, color: string): LabelArt {
    const t = this.tokens, ui = this.skin.palette.ui;
    return {
      w: 72, h: 72,
      draw: (g) => {
        g.beginPath(); g.arc(36, 36, 30, 0, Math.PI * 2);
        g.fillStyle = color; g.fill();
        g.lineWidth = 6; g.strokeStyle = t.ink; g.stroke();
        g.font = `800 44px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = ui.panel; g.fillText(txt, 36, 39);
      },
    };
  }

  // ---------------------------------------------------------------- DOM overlays

  private nextWave(w: State): { n: number; s: number } | null {
    const cp = this.cp;
    if (!cp || !w.waves) return null;
    const wave = cp.waves[w.waves.idx];
    if (!wave) return null;
    return { n: w.waves.idx + 1, s: Math.max(0, (wave.tick - w.tick) / TPS) };
  }

  private updateDom(w: State): void {
    const pl = this.interp.pos("player", w.player.pos, 1);
    const hero = this.toScreen(v3(pl.x, ART_M * 0.5, pl.y));
    if (this.hintEl) {
      // hints never cover the hero: flip to the top when the hero walks low on screen
      const cls = `fo-hint${hero.y > this.cssH - 110 ? " top" : ""}${this.t < this.hintUntil ? " on" : ""}`;
      if (cls !== this.hintCls) { this.hintCls = cls; this.hintEl.className = cls; }
    }
    if (this.vignetteEl) {
      const k = w.core.fuel <= 0 || this.lifeK < 0.6 ? Math.min(1, (1 - this.lifeK) * 1.4) * (0.6 + 0.25 * Math.sin(this.t * 4)) : 0;
      this.vignetteEl.style.opacity = k.toFixed(2);
      if (k > 0 && !this.vignetteEl.style.background) this.vignetteEl.style.background = `radial-gradient(ellipse at center, transparent 45%, ${this.tokens.frost} 130%)`;
    }
    this.updatePointers(w);
    this.updateCoach(w, hero);
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
      this.bannerEl.style.background = kind === "ok" ? pal.ok : kind === "hazard" ? mix(this.tokens.storm, this.tokens.accent, 0.3) : kind === "danger" ? pal.danger : pal.accent;
      this.bannerEl.style.color = kind === "ok" ? pal.ink : "#ffffff";
    }
  }

  private updateCoach(w: State, hero: V): void {
    const dom = this.coachDom;
    if (!dom) return;
    const c = this.coach && !w.over ? this.coach : null;
    if (!c) { dom.update(null, this.cssW, this.cssH, this.t, () => 0); return; }
    const ground = this.toScreen(v3(c.at.x, 0, c.at.y));
    const side = this.toScreen(v3(c.at.x + 18, 0, c.at.y));
    const above = this.toScreen(v3(c.at.x, ART_M * 1.5, c.at.y));
    dom.update({ text: c.text, age: this.t - c.since, ground, above, hero, ringScale: Math.max(0.4, Math.hypot(side.x - ground.x, side.y - ground.y) / 22) },
      this.cssW, this.cssH, this.t, (txt) => this.labels.textWidth(txt, 14));
  }

  /** Off-screen pointers, the same set as the 2D renderer: hostiles, pods, arrivals, core, credits, goal. */
  private updatePointers(w: State): void {
    if (!this.pointers) return;
    const t = this.tokens, pal = this.skin.palette;
    const targets: PointerTarget[] = [];
    const at = (p: V, h = 10): V => this.toScreen(this.wv(p, h));
    // one big threat pointer per direction (eight sectors around the screen centre), with a count,
    // aimed at the nearest off-screen attacker that way
    const cx = this.cssW / 2, cy = this.cssH / 2;
    const sectors = new Map<number, { p: V; d2: number; n: number }>();
    for (const h of w.hostiles) {
      const q = this.interp.pos(`h:${h.id}`, h.pos, 1);
      const sp = this.toScreen(v3(q.x, 10, q.y));
      if (sp.x > 0 && sp.x < this.cssW && sp.y > 0 && sp.y < this.cssH) continue;
      const k = ((Math.round(Math.atan2(sp.y - cy, sp.x - cx) / (Math.PI / 4)) % 8) + 8) % 8;
      const d2 = (sp.x - cx) ** 2 + (sp.y - cy) ** 2;
      const sec = sectors.get(k);
      if (!sec) sectors.set(k, { p: sp, d2, n: 1 });
      else { sec.n++; if (d2 < sec.d2) { sec.p = sp; sec.d2 = d2; } }
    }
    for (const sec of sectors.values()) targets.push({ p: sec.p, color: t.danger, icon: "hostile", big: true, n: sec.n });
    // a wave about to land: point at each side it comes from
    const nw = this.nextWave(w);
    const wave = this.cp?.waves[w.waves?.idx ?? -1];
    if (nw && wave && nw.s <= 6 && sectors.size === 0) {
      const pl = w.player.pos, W = this.manifest.map.w, H = this.manifest.map.h;
      const edge = { n: { x: pl.x / FP, y: -40 }, s: { x: pl.x / FP, y: H + 40 }, e: { x: W + 40, y: pl.y / FP }, w: { x: -40, y: pl.y / FP } };
      const counts = new Map<string, number>();
      wave.types.forEach((_, i) => { const sd = wave.sides[i % wave.sides.length]!; counts.set(sd, (counts.get(sd) ?? 0) + 1); });
      for (const [sd, n] of counts) {
        const e = edge[sd as keyof typeof edge];
        targets.push({ p: this.toScreen(v3(e.x, 10, e.y)), color: t.danger, icon: "hostile", big: true, n });
      }
    }
    let pods = 0;
    for (const c of w.captures) if (c.state === "idle" && pods < 3) { targets.push({ p: at(c.pos), color: t.interactive, icon: "pod" }); pods++; }
    if (w.residents.some((r) => r.status === "arriving") && this.cp?.gate) targets.push({ p: at(this.cp.gate.pos), color: t.ok, icon: "person" });
    if (w.core.fuel <= 3) targets.push({ p: at(w.core.pos, 20), color: t.accent, icon: "core" });
    if ((w.sales?.pileN ?? 0) >= 10) targets.push({ p: at(w.sales!.pile), color: pal.res["res.currency"] ?? t.accent, icon: "coin" });
    for (const p of w.pads) {
      if (!this.pads.get(p.id)?.goal || p.done || !p.visible) continue;
      targets.push({ p: at(p.pos), color: t.accent, icon: "goal" });
    }
    this.pointers.update(targets, this.cssW, this.cssH, this.t);
  }

  /** World point to mount CSS px. */
  toScreen(p: Vector3): V {
    tmpV.copy(p).project(this.camera);
    const behind = tmpV.z > 1;
    return { x: (tmpV.x * 0.5 + 0.5) * this.cssW * (behind ? -1 : 1), y: (-tmpV.y * 0.5 + 0.5) * this.cssH };
  }

  /** Mount CSS px to a world point a fraction of the way from the camera (HUD fly targets). */
  private fromScreen(x: number, y: number, depth = 0.3): Vector3 {
    const ndc = v3((x / this.cssW) * 2 - 1, -(y / this.cssH) * 2 + 1, 0.5).unproject(this.camera);
    return ndc.sub(this.camera.position).normalize().multiplyScalar(this.camera.position.distanceTo(this.look) * depth).add(this.camera.position);
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

  private posOf(e: Record<string, unknown>): Vector3 {
    const at = e["at"] as V | undefined;
    if (at && typeof at.x === "number") return this.wv(at);
    const w = this.world;
    if (!w) return v3();
    const find = <T extends { id: unknown; pos: V }>(list: readonly T[] | undefined, id: unknown): Vector3 | null => {
      const hit = id === undefined ? undefined : list?.find((x) => x.id === id);
      return hit ? this.wv(hit.pos) : null;
    };
    const hit = find(w.pads, e["pad"]) ?? find(w.captures, e["capture"]) ?? find(w.residents, e["resident"]) ?? find(w.converters, e["conv"]);
    if (hit) return hit;
    if (e["line"] !== undefined && e["section"] !== undefined) {
      const s = w.barriers.find((b) => b.id === e["line"])?.sections[Number(e["section"])];
      if (s) return v3((s.a.x + s.b.x) / 2 / FP, 0, (s.a.y + s.b.y) / 2 / FP);
    }
    if (e["zone"] !== undefined) {
      const z = w.zones.find((x) => x.id === e["zone"]);
      if (z) return v3((z.rect.x + z.rect.w / 2) / FP, 0, (z.rect.y + z.rect.h / 2) / FP);
    }
    if (String(e["t"]).startsWith("core_")) return this.wv(w.core.pos);
    return this.wv(w.player.pos);
  }

  private playerBack(): Vector3 {
    const w = this.world;
    if (!w) return v3();
    const p = this.interp.pos("player", w.player.pos, 1);
    const yaw = this.yaw.get("player") ?? 0;
    const top = w.player.stack.reduce((h, r) => h + (this.items?.height(r) ?? 8), ART_M * 0.75);
    return v3(p.x - Math.sin(yaw) * 8, top, p.y - Math.cos(yaw) * 8);
  }

  private workerBack(e: Record<string, unknown>): Vector3 | null {
    const by = e["by"];
    if (typeof by !== "number" || !this.world) return null;
    const r = this.world.residents.find((x) => x.id === by);
    if (!r) return null;
    const p = this.interp.pos(`r:${r.id}`, r.pos, 1);
    return v3(p.x, ART_M * 0.8, p.y);
  }

  private cheerNear(at: Vector3, r: number): void {
    const w = this.world;
    if (!w) return;
    const until = this.t + 1.1;
    for (const res of w.residents) if (Math.hypot(res.pos.x / FP - at.x, res.pos.y / FP - at.z) < r) this.cheerUntil.set(`r:${res.id}`, until);
    if (Math.hypot(w.player.pos.x / FP - at.x, w.player.pos.y / FP - at.z) < r) this.cheerUntil.set("player", until);
  }

  private flashNearestTurret(at: Vector3): void {
    let best: string | null = null, bd = Infinity;
    for (const s of this.world?.structures ?? []) {
      if (s.type !== "struct.ranged_defense") continue;
      const d = (s.pos.x / FP - at.x) ** 2 + (s.pos.y / FP - at.z) ** 2;
      if (d < bd) { bd = d; best = s.id; }
    }
    if (best !== null) this.fx?.flash(`s:${best}`, 0.12);
  }

  onEvent(ev: SimEvent): void {
    const fx = this.fx;
    if (!fx || !this.gl) return;
    const e = ev as unknown as Record<string, unknown> & { t: string };
    const skin = this.skin, t = this.tokens;
    const gold = resToken(t, "res.currency");
    const at = this.posOf(e);
    const ft = (key: string, vars?: Record<string, string | number>): string => floaterText(skin, key, vars);
    const white = skin.palette.ui.panel;
    const up = (p: Vector3, h: number): Vector3 => p.clone().setY(p.y + h);
    switch (e.t) {
      case "gathered":
      case "picked": {
        const wb = this.workerBack(e);
        const res = String(e["res"]);
        const from = up(at, ART_M * 0.6);
        if (wb) fx.arc(res, from, wb, 0.4);
        else fx.arc(res, from, () => this.playerBack(), 0.34, true);
        if (e.t === "gathered") fx.dustRing(at, t.groundAlt, 6, 40, 4);
        break;
      }
      case "deposited": {
        const from = this.workerBack(e) ?? this.playerBack();
        const target = this.depositTarget(String(e["to"]), at);
        fx.arc(String(e["res"]), from, target, 0.28);
        break;
      }
      case "pad_paid":
      case "barrier_progress": {
        const res = e.t === "barrier_progress" ? this.world?.barriers.find((b) => b.id === e["line"])?.res ?? "res.currency" : String(e["res"] ?? "res.currency");
        fx.arc(res, this.playerBack(), up(at, 4), 0.22);
        break;
      }
      case "drop":
        fx.burst(up(at, 6), [white, resToken(t, String(e["res"]))], 6, 60, 160, 3, 0.4);
        break;
      case "sold": {
        const pay = Number(e["pay"] ?? 0);
        fx.floater(ft("sold"), white, up(at, ART_M * 1.6), 40, 11);
        fx.floater(`+${pay}`, gold, up(at, ART_M * 1.1), 48, 14);
        fx.burst(up(at, ART_M), [gold, mix(gold, t.structure, 0.5)], e["premium"] ? 14 : 7, 70, 200, 4);
        const pile = this.world?.sales ? this.wv(this.world.sales.pile) : at;
        fx.coins(up(at, ART_M), () => pile, Math.min(5, Math.max(1, pay)), "res.currency");
        break;
      }
      case "customer_left":
        if (e["angry"]) fx.floater(ft("too_slow"), t.danger, up(at, ART_M * 1.5), 40, 11);
        break;
      case "collected": {
        const n = Number(e["n"] ?? 1);
        fx.floater(ft("collected", { n }), gold, up(this.playerBack(), 20), 46, 14);
        fx.coins(up(at, 6), () => { const h = this.hudAnchor(); return this.fromScreen(h.x, h.y); }, Math.min(12, Math.max(3, n)), "res.currency");
        break;
      }
      case "core_fuel_out":
        fx.floater(ft("fuel_out"), t.danger, up(at, ART_M * 2.2), 44, 13);
        fx.shake = Math.max(fx.shake, 4);
        break;
      case "core_fuel_restored":
        fx.dustRing(at, t.accent, 18, 90, 6);
        break;
      case "hint":
        this.showHint(e["key"] === "need_resource" ? this.needText() ?? hintText(skin, "need_resource") : hintText(skin, String(e["key"])));
        break;
      case "level_end":
        if (e["won"]) {
          const p = this.playerBack();
          fx.confetti(up(p, 30), [t.accent, t.interactive, gold, t.ok, white], 140);
          fx.floater(ft("win"), white, up(p, 40), 56, 18);
          this.cheerNear(p, 9999);
        }
        break;
      case "built":
      case "hired":
      case "unlocked": {
        const padId = typeof e["pad"] === "string" ? (e["pad"] as string) : "";
        fx.pop(`pad:${padId}`);
        fx.dustRing(at, mix(t.structure, t.groundAlt, 0.3), 22, 110, 8);
        fx.burst(up(at, 20), [t.accent, gold, white], 18, 140, 260, 5);
        const label = this.pads.get(padId)?.label ?? nameOf(skin, String(e["build"] ?? e["role"] ?? ""));
        const key = e.t === "hired" ? "hired" : e.t === "unlocked" ? "unlocked" : "built";
        fx.floater(ft(key, { name: label }), white, up(at, ART_M * 2.3), 42, 12);
        this.cheerNear(at, 140);
        break;
      }
      case "captured":
        fx.floater(ft("captured"), t.interactive, up(this.playerBack(), 22), 44, 13);
        break;
      case "released":
        fx.floater(ft("released"), t.accent, up(at, ART_M * 1.6), 42, 12);
        fx.burst(up(at, 12), [t.glass, white], 14, 80, 160, 4);
        this.cheerUntil.set(`r:${String(e["resident"])}`, this.t + 1.4);
        break;
      case "recruit_arrived":
        fx.floater(ft("recruit_arrived"), t.ok, up(at, ART_M * 1.5), 40, 11);
        break;
      case "moved_in":
        fx.floater(ft("moved_in"), t.ok, up(at, ART_M * 1.5), 40, 11);
        break;
      case "injured":
        fx.floater(ft("injured"), t.danger, up(at, ART_M * 1.5), 40, 11);
        break;
      case "healed":
        fx.floater(ft("healed"), t.ok, up(at, ART_M * 1.5), 40, 11);
        break;
      case "hit": {
        const target = String(e["target"]);
        if (target === "hostile") fx.flash(`h:${String(e["id"])}`);
        else if (target === "prey") fx.flash(`p:${String(e["id"])}`);
        else if (target === "base") { fx.shake = Math.max(fx.shake, 5); fx.flash("player", 0.12); }
        if (e["by"] === "structure") this.flashNearestTurret(at);
        fx.burst(up(at, 10), [white, mix(t.accent, t.structure, 0.5)], 6, 90, 120, 3, 0.25);
        break;
      }
      case "died":
        fx.dustRing(at, mix(t.groundAlt, t.structure, 0.3), 12, 70, 6);
        fx.burst(up(at, 8), [t.danger, white], 8, 100, 200, 4, 0.5);
        break;
      case "wave_started": {
        const n = Number(e["idx"] ?? 0) + 1;
        this.banner(ft("wave_started", { n }), "danger");
        fx.shake = Math.max(fx.shake, 6);
        break;
      }
      case "wave_cleared":
        this.banner(ft("wave_cleared"), "ok", 2);
        this.cheerNear(this.playerBack(), 9999);
        break;
      case "barrier_built": {
        fx.pop(`bar:${String(e["line"])}:${String(e["section"])}`);
        fx.dustRing(at, mix(t.structure, t.groundAlt, 0.3), 12, 80, 6);
        break;
      }
      case "barrier_broken":
        fx.shake = Math.max(fx.shake, 7);
        fx.burst(up(at, 12), [t.structure, t.structureDark], 18, 140, 260, 6);
        fx.floater(ft("barrier_broken"), t.danger, up(at, ART_M * 1.4), 42, 12);
        break;
      case "hazard_warning":
      case "hazard_start":
        fx.shake = Math.max(fx.shake, 3);
        break;
      case "core_upgraded": {
        const c = this.world ? this.wv(this.world.core.pos) : at;
        fx.dustRing(c, t.accent, 30, 160, 8);
        fx.burst(up(c, ART_M * 1.2), [t.accent, mix(t.accent, t.structure, 0.6)], 26, 160, 260, 5);
        fx.floater(ft("core_upgraded", { n: Number(e["level"] ?? this.world?.core.level ?? 2) }), white, up(c, ART_M * 2.6), 46, 14);
        break;
      }
      case "zone_cleared":
        fx.pop(`zone:${String(e["zone"])}`);
        fx.dustRing(at, mix(t.groundAlt, t.structure, 0.3), 28, 140, 9);
        fx.floater(ft("zone_cleared"), white, up(at, ART_M * 1.2), 44, 13);
        break;
      case "converted":
        fx.burst(up(at, ART_M * 1.2), [t.accent, white], 5, 50, 120, 3, 0.5);
        break;
      case "froze": {
        // a colonist is lost to the cold: frost burst and a shudder
        fx.burst(up(at, ART_M * 0.9), [t.frost, white, t.glass], 26, 120, 220, 4, 0.8);
        fx.dustRing(at, t.frost, 20, 90, 6);
        fx.floater(ft("froze"), t.frost, up(at, ART_M * 1.9), 44, 13);
        fx.shake = Math.max(fx.shake, 4);
        this.banner(ft("froze"), "hazard", 2.2);
        break;
      }
      case "pod_lost":
        fx.burst(up(at, ART_M * 0.8), [t.frost, white], 18, 110, 200, 4, 0.7);
        fx.floater(ft("pod_lost"), t.danger, up(at, ART_M * 1.8), 44, 13);
        break;
      case "tow_dropped": {
        // the line snaps: sparks at the pod and a short message at the hero
        fx.burst(up(at, ART_M * 0.6), [t.accent, white, mix(t.accent, t.ink, 0.4)], 14, 150, 160, 3, 0.4);
        fx.dustRing(at, mix(t.groundAlt, t.structure, 0.3), 10, 70, 5);
        fx.floater(ft(e["reason"] === "slack" ? "tow_slack" : "tow_dropped"), t.danger, up(this.playerBack(), 26), 44, 13);
        fx.shake = Math.max(fx.shake, 3);
        break;
      }
      case "crate_delivered": {
        const bundle = (e["bundle"] ?? {}) as Record<string, number>;
        const keys = Object.keys(bundle);
        fx.burst(up(at, ART_M), [gold, t.accent, white, ...keys.map((k) => resToken(t, k))], 24, 140, 260, 5);
        fx.dustRing(at, t.accent, 18, 110, 7);
        fx.floater(ft("crate_delivered"), white, up(at, ART_M * 2), 44, 13);
        for (const k of keys.slice(0, 3)) fx.arc(k, up(at, ART_M), () => this.playerBack(), 0.5, true);
        break;
      }
      case "converter_upgraded": {
        const cv = this.world?.converters.find((c) => c.id === e["conv"]);
        const p = cv ? this.wv(cv.pos) : at;
        if (cv) fx.pop(`cv:${cv.id}`);
        fx.dustRing(p, t.accent, 22, 120, 7);
        fx.burst(up(p, ART_M * 1.1), [t.accent, white, gold], 20, 120, 240, 4, 0.7);
        fx.floater(ft("converter_upgraded"), white, up(p, ART_M * 2.2), 44, 13);
        break;
      }
      case "boss_spawned":
        // a banner, plus the off-screen pointer in updatePointers keeps it findable
        this.banner(ft("boss_spawned"), "danger", 3.4);
        fx.shake = Math.max(fx.shake, 8);
        fx.burst(up(at, ART_M), [t.danger, white], 16, 120, 220, 5, 0.6);
        break;
      default:
        break;
    }
  }

  private depositTarget(to: string, at: Vector3): Vector3 {
    const w = this.world;
    if (to === "sink.core" && w) {
      const p = this.placed.get(`core:${w.core.level}`);
      if (p) return this.anchorWorld(p, "deposit");
    }
    if (to === "sink.sales_point") {
      const p = this.placed.get("sales");
      if (p) return this.anchorWorld(p, "deposit");
    }
    if (to.startsWith("conv.") && w) {
      let best: Placed | null = null, bd = Infinity;
      for (const cv of w.converters) {
        if (cv.type !== to) continue;
        const d = (cv.pos.x / FP - at.x) ** 2 + (cv.pos.y / FP - at.z) ** 2;
        const p = this.placed.get(`cv:${cv.id}`);
        if (p && d < bd) { bd = d; best = p; }
      }
      if (best) return this.anchorWorld(best, "deposit");
    }
    return at.clone().setY(ART_M * 0.6);
  }

  // ---------------------------------------------------------------- discovery, inspect, tags

  /** Which types still show a discovery label (name + purpose); null hides them all. */
  setDiscovery(isNew: ((id: string) => boolean) | null): void {
    this.isNew = isNew;
  }

  /** Offer a placed model as its type's label spot; the instance nearest the hero wins. */
  private candidate(id: string, p: Placed, h?: number): void {
    const r = p.model.root.position;
    this.candidatePt(id, r.x, r.z, h ?? ((p.data["h"] as number | undefined) ?? ART_M) + 12);
  }

  private candidatePt(id: string, x: number, z: number, h: number): void {
    if (!this.isNew || !this.world) return;
    const pl = this.world.player.pos;
    const d2 = (x - pl.x / FP) ** 2 + (z - pl.y / FP) ** 2;
    if (d2 > DISCOVERY_RANGE * DISCOVERY_RANGE) return;
    const c = this.cands.get(id);
    if (c ? c.d2 <= d2 : !this.isNew(id)) return;
    this.cands.set(id, { x, z, h, d2 });
  }

  /** Name and one-line purpose over the nearest instance of each type the player has not used yet. */
  private drawDiscovery(_pl: V): void {
    const shown = new Set<string>();
    if (this.isNew && this.world && !this.world.over) {
      const list = [...this.cands.entries()].sort((a, b) => a[1].d2 - b[1].d2).slice(0, MAX_DISCOVERY);
      const coach = this.coach;
      for (const [id, c] of list) {
        // the coach mark already speaks for what it points at
        if (coach && (coach.at.x - c.x) ** 2 + (coach.at.y - c.z) ** 2 < 45 * 45) continue;
        const name = nameOf(this.skin, id), purpose = purposeOf(this.skin, id);
        let sp = this.discSprites.get(id);
        if (!sp) { sp = new Sprite(); sp.renderOrder = 13; this.dynamic.add(sp); this.discSprites.set(id, sp); }
        const hh = purpose ? 33 : 18;
        sp.visible = this.labels.apply(sp, `disc|${name}|${purpose}`, () => this.discoveryArt(name, purpose), hh);
        sp.position.set(c.x, c.h + hh / 2 + Math.sin(this.t * 2 + c.x) * 1.2, c.z);
        this.keepOnScreen(sp);
        shown.add(id);
      }
    }
    for (const [id, sp] of this.discSprites) if (!shown.has(id)) sp.visible = false;
  }

  /** Slide a label sideways (via its sprite anchor) so it never runs off the left or right screen edge. */
  private keepOnScreen(sp: Sprite): void {
    const a = this.toScreen(sp.position);
    const b = this.toScreen(v3(sp.position.x + 10, sp.position.y, sp.position.z));
    const wPx = sp.scale.x * Math.abs(b.x - a.x) / 10;
    if (!(wPx > 0)) return;
    const margin = 6;
    const left = Math.min(Math.max(a.x - wPx / 2, margin), this.cssW - margin - wPx);
    sp.center.set(Math.min(1, Math.max(0, (a.x - left) / wPx)), sp.center.y);
  }

  private discoveryArt(name: string, purpose: string): LabelArt {
    const t = this.tokens, ui = this.skin.palette.ui;
    const np = 40, pp = 28;
    const wN = this.labels.textWidth(name, np) + 40;
    const wP = purpose ? this.labels.textWidth(purpose, pp) + 44 : 0;
    const w = Math.max(wN, wP) + 8;
    const h = purpose ? 110 : 60;
    return {
      w, h,
      draw: (g, W) => {
        g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
        g.font = `800 ${np}px ${FONT}`;
        g.lineWidth = 9; g.strokeStyle = t.ink; g.strokeText(name, W / 2, 28);
        g.fillStyle = t.interactive; g.fillText(name, W / 2, 28);
        if (!purpose) return;
        roundRect(g, (W - wP) / 2, 58, wP, 48, 24);
        g.fillStyle = ui.panel; g.globalAlpha = 0.95; g.fill(); g.globalAlpha = 1;
        g.lineWidth = 4; g.strokeStyle = t.interactive; g.stroke();
        g.font = `800 ${pp}px ${FONT}`;
        g.fillStyle = ui.ink; g.fillText(purpose, W / 2, 83);
      },
    };
  }

  /**
   * Canonical id of what is under a mount CSS px point: characters by screen distance first
   * (they stand in front of buildings), then the first placed model a ray from the camera hits,
   * then the nearest small model on screen. Null when nothing is there.
   */
  pick(x: number, y: number): string | null {
    const w = this.world;
    if (!w || !this.gl) return null;
    const hit = { id: null as string | null, key: null as string | null, d: PICK_PX * PICK_PX };
    const test = (id: string, px: number, pz: number, h: number, key: string | null = null): void => {
      const sp = this.toScreen(v3(px, h, pz));
      const d = (sp.x - x) ** 2 + (sp.y - y) ** 2;
      if (d < hit.d) { hit.d = d; hit.id = id; hit.key = key; }
    };
    this.lastPick = null;
    const mid = ART_M * 0.5;
    const pl = this.interp.pos("player", w.player.pos, 1);
    test("unit.player", pl.x, pl.y, mid);
    for (const r of w.residents) {
      if (r.status === "towed" || r.status === "releasing") continue;
      const p = this.interp.pos(`r:${r.id}`, r.pos, 1);
      test(r.role === "idle" ? "role.idle" : r.role, p.x, p.y, mid, `r:${r.id}`);
    }
    for (const h of w.hostiles) { const p = this.interp.pos(`h:${h.id}`, h.pos, 1); test(h.type, p.x, p.y, mid); }
    for (const p of w.prey) if (p.alive) { const q = this.interp.pos(`p:${p.id}`, p.pos, 1); test("unit.prey", q.x, q.y, mid * 0.6); }
    w.sales?.queue.forEach((c, i) => { const q = this.interp.pos(`q:${i}`, c.pos, 1); test(c.kind, q.x, q.y, mid); });
    if (hit.id) { this.lastPick = hit.key; return hit.id; }
    const roots = new Map<Object3D, string>();
    const keys = new Map<Object3D, string>();
    for (const p of this.placed.values()) {
      const id = p.data["id"];
      if (typeof id === "string" && this.skin.names[id] && p.model.root.visible) { roots.set(p.model.root, id); keys.set(p.model.root, p.key); }
    }
    this.raycaster.setFromCamera(new Vector2((x / this.cssW) * 2 - 1, -(y / this.cssH) * 2 + 1), this.camera);
    for (const h of this.raycaster.intersectObjects([...roots.keys()], true)) {
      for (let o: Object3D | null = h.object; o; o = o.parent) { const id = roots.get(o); if (id) { this.lastPick = keys.get(o) ?? null; return id; } }
    }
    hit.d = (PICK_PX * 1.4) ** 2;
    for (const [root, id] of roots) test(id, root.position.x, root.position.z, 4, keys.get(root) ?? null);
    this.lastPick = hit.key;
    return hit.id;
  }

  /**
   * pick() plus the display text for an inspect card: hire pads and hired colonists are named
   * for what they work ("Ore collector", "Galley operator"); everything else by its type.
   */
  inspect(x: number, y: number): { id: string; name: string; purpose: string } | null {
    const id = this.pick(x, y);
    if (!id) return null;
    const key = this.lastPick ?? "";
    const plain = { id, name: nameOf(this.skin, id), purpose: purposeOf(this.skin, id) };
    if (key.startsWith("pad:")) {
      const info = this.pads.get(key.slice(4));
      if (info?.kind === "hire" && info.worker) return { id, name: info.label, purpose: workerPurpose(this.skin, info.what, info.worker.vars) };
      if (info) return { id, name: info.label, purpose: plain.purpose };
    }
    if (key.startsWith("r:")) {
      const r = this.world?.residents.find((x) => `r:${x.id}` === key);
      if (r && r.role !== "idle") {
        const w = this.workerOf(r.assign.from, r.assign.to);
        return { id, name: workerName(this.skin, r.role, w.vars), purpose: workerPurpose(this.skin, r.role, w.vars) };
      }
    }
    return plain;
  }

  /** "Bring 3 Ore, 2 Alloy": what the pad under the hero still lacks that the hero isn't carrying. */
  private needText(): string | null {
    const w = this.world;
    const padId = w?.player.padId;
    if (!w || !padId) return null;
    const pad = w.pads.find((p) => p.id === padId), info = this.pads.get(padId);
    if (!pad || !info) return null;
    const owed = Object.entries(info.cost)
      .map(([res, n]) => [res, n - (pad.paid[res] ?? 0)] as const)
      .filter(([res, left]) => left > 0 && this.cp?.resources[res]?.cap !== null);
    const missing = owed.filter(([res]) => !w.player.stack.includes(res));
    const list = (missing.length ? missing : owed).map(([res, left]) => `${left} ${nameOf(this.skin, res)}`).join(", ");
    return list ? uiText(this.skin, "needResource", { list }) : null;
  }

  private nextTag(): Sprite {
    let sp = this.tagSprites[this.tagUsed];
    if (!sp) { sp = new Sprite(); sp.renderOrder = 14; this.dynamic.add(sp); this.tagSprites.push(sp); }
    this.tagUsed++;
    return sp;
  }

  /** "MAX" over a full column of the hero's pack. */
  private maxTag(x: number, y: number, z: number): void {
    const sp = this.nextTag();
    const txt = uiText(this.skin, "max");
    sp.visible = this.labels.apply(sp, `max|${txt}`, () => this.maxArt(txt), 8);
    sp.position.set(x, y + 4.5, z);
  }

  private maxArt(txt: string): LabelArt {
    const t = this.tokens;
    const w = this.labels.textWidth(txt, 34) + 34;
    return {
      w, h: 52,
      draw: (g, W) => {
        roundRect(g, 3, 3, W - 6, 46, 16);
        g.fillStyle = t.danger; g.fill();
        g.lineWidth = 5; g.strokeStyle = t.ink; g.stroke();
        g.font = `800 34px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = "#ffffff"; g.fillText(txt, W / 2, 28);
      },
    };
  }

  /** A small meter over a character (frost on colonists, health on attackers and bosses). */
  private barTag(x: number, y: number, z: number, k: number, color: string, height: number): void {
    const sp = this.nextTag();
    const q = Math.round(clamp01(k) * 20);
    sp.visible = this.labels.apply(sp, `bar|${color}|${q}`, () => this.barArt(q / 20, color), height);
    sp.position.set(x, y + height / 2, z);
  }

  private barArt(k: number, color: string): LabelArt {
    const t = this.tokens;
    return {
      w: 150, h: 30,
      draw: (g, W, H) => {
        roundRect(g, 2, 2, W - 4, H - 4, 12);
        g.fillStyle = t.ink; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
        if (k > 0) { roundRect(g, 6, 6, Math.max(12, (W - 12) * k), H - 12, 8); g.fillStyle = color; g.fill(); }
      },
    };
  }

  // ---------------------------------------------------------------- stats

  /** Draw calls, triangles and fps for the debug overlay and the perf tests. */
  stats(): RenderStats {
    const est = this.estimate();
    const info = this.gl?.info.render;
    return {
      drawCalls: info && info.calls > 0 ? info.calls : est.calls,
      triangles: info && info.triangles > 0 ? info.triangles : est.triangles,
      fps: Math.round(this.fps),
      estDrawCalls: est.calls,
      estTriangles: est.triangles,
      quality: this.quality,
    };
  }

  /** Visible draw calls and triangles from the scene graph (frustum-tested, no shadow pass). */
  estimate(): { calls: number; triangles: number } {
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    let calls = 0, triangles = 0;
    const sphere = new Sphere();
    const walk = (o: Object3D): void => {
      if (!o.visible) return;
      const m = o as Mesh & { isInstancedMesh?: boolean; count?: number; isSprite?: boolean };
      if (m.isSprite) {
        if ((m.material as { map?: unknown }).map) { calls++; triangles += 2; }
      } else if (m.isMesh && m.geometry) {
        const mat = m.material as { visible?: boolean };
        if (mat.visible !== false) {
          const g = m.geometry;
          let tri = g.index ? g.index.count / 3 : (g.getAttribute("position")?.count ?? 0) / 3;
          if (g.drawRange.count !== Infinity) tri = Math.min(tri, g.drawRange.count / 3);
          if (m.isInstancedMesh) {
            if ((m.count ?? 0) > 0) { calls++; triangles += tri * (m.count ?? 0); }
          } else {
            if (!g.boundingSphere) g.computeBoundingSphere();
            sphere.copy(g.boundingSphere!).applyMatrix4(m.matrixWorld);
            if (!m.frustumCulled || frustum.intersectsSphere(sphere)) { calls++; triangles += tri; }
          }
        }
      }
      for (const c of o.children) walk(c);
    };
    this.scene.updateMatrixWorld();
    walk(this.scene);
    return { calls, triangles: Math.round(triangles) };
  }

  /** The three scene and camera, for the dev harness and asset lab. */
  get three(): { scene: Scene; camera: PerspectiveCamera } {
    return { scene: this.scene, camera: this.camera };
  }
}

export const createRenderer3D = (opts?: Renderer3DOptions): Renderer3D => new Renderer3D(opts);

export { renderThumbnails } from "./thumbs.js";
