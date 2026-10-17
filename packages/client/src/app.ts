import { CONTENT_VERSION, type Manifest } from "@fo/content";
import { ENGINE_VERSION, FP, IMPLEMENTED_MODULES, METER_MAX, createSim, starsOf, type Sim, type SimEvent } from "@fo/sim";
import { VIEW_W, createCamera, worldToScreenPlane, type Camera } from "@fo/render-3d";
import { getSkin, levelTitle, nameOf, purposeOf, uiText, type Skin } from "@fo/skins";
import { Coach, toWorld } from "./coach.js";
import { isNew, nearbyPassive, touchedBy } from "./discovery.js";
import { Haptics, Synth } from "./feedback.js";
import { Guide, type GuideTarget } from "./guide.js";
import { iconSvg, introObjectives, liveObjectives } from "./objectives.js";
import { HudView, hudModel } from "./hud.js";
import { InputController } from "./input.js";
import { offlineReady, prefetchLevels, type LevelMeta, type LevelSource } from "./levels.js";
import { FixedStepper } from "./loop.js";
import { TIME_TARGET_STEPS, applyTimeTarget, normalizeTimeTargetPct } from "./timetarget.js";
import { webPlatform, type Platform } from "./platform.js";
import { progressReport, reportProgress } from "./supply.js";
import { chapters, isUnlocked, nextLevel, starText } from "./progress.js";
import { PROBE_SEC, autoTier, createRenderer, thumbnails, warm3D, webglAvailable, type GameRenderer, type Tier } from "./render.js";
import { DEFAULT_PROGRESS, type Progress, type SaveStore, type Settings } from "./save.js";
import type { TelemetryQueue } from "./telemetry.js";
import { formatTicks, levelText } from "./text.js";
import { TitleBackdrop } from "./title.js";

// App shell: screens (title, level select, intro, play, result, settings), the game loop
// and the glue between sim, renderer, input, saves, telemetry and feedback.

type Screen = "title" | "levels" | "intro" | "playing" | "result" | "settings" | "error" | "unsupported";

interface Session {
  meta: LevelMeta;
  manifest: Manifest;
  sim: Sim;
  renderer: GameRenderer;
  cam: Camera;
  stepper: FixedStepper;
  coach: Coach;
  ended: boolean;
  /** Currency gained over the attempt (collected from the register and picked up). */
  earned: number;
  lastCurrency: number;
  wavesCleared: number;
  /** Lowest lifeline over the attempt (the star margin on levels with no timer or Colony HP). */
  lifeMin: number;
  /** Seconds played this attempt (drives the "auto" quality probe). */
  played: number;
  /** Guide arrows (levels 1-5, or Settings): loaded lazily, null when off. */
  guide: Guide | null;
  guideOn: boolean;
  guideTarget: GuideTarget | null;
  /**
   * Level-start overview (playtest): the camera shows the whole base and the sim waits until the
   * player touches the screen, then it zooms in on the hero. 1 = fully out, easing to 0; null = off.
   */
  overview: { k: number; go: boolean; x: number; y: number; zoom: number } | null;
}

/** The first levels of the progression always show guide arrows. */
const GUIDE_LEVELS = 5;

export interface AppDeps {
  source: LevelSource;
  store: SaveStore;
  telemetry: TelemetryQueue;
  /** Apply a waiting service-worker update; returns false if none is waiting. */
  applyUpdate?: () => boolean;
  platform?: Platform;
  /** The app was just updated (set by main.ts from a flag written before the reload). */
  justUpdated?: boolean;
}

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

const COUNTS_AS_POP = new Set(["ok", "injured", "healing"]);
/** How long the tap-to-inspect card stays up (ms). */
const INSPECT_MS = 2200;
/** Seconds the overview takes to zoom in on the hero once the player touches the screen. */
const OVERVIEW_ZOOM_S = 0.8;
/** Pads closer than this pull the camera toward them (world units). */
const LEAD_RANGE = 150;


// Level family glyphs for the level grid: shape tells the family apart, colour comes from CSS.
const FAMILY_ICONS: Record<string, string> = {
  // a flame: keep the reactor hot
  shelter: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.9 2.4-5 .1 1.6.8 2.7 1.9 3.3C11 9 11.2 6 12 3z"/>',
  // a lifebuoy: bring people home
  rescue: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M6.3 6.3l3.2 3.2M17.7 6.3l-3.2 3.2M6.3 17.7l3.2-3.2M17.7 17.7l-3.2-3.2"/>',
  // a sprout: grow and trade
  harvest: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z"/><path d="M12 14.5c0-3-2.4-5-5.5-5 0 3 2.4 5 5.5 5z"/>',
  // a gear: build supply chains
  industrialize: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="6"/>',
  // a shield: hold the walls
  defend: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 7v10"/>',
};

function familyIcon(family: string, label: string): string {
  const g = FAMILY_ICONS[family];
  if (!g) return "";
  return `<span class="fam fam-${esc(family)}" title="${esc(label)}" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true">${g}</svg></span>`;
}

export class App {
  private skin: Skin = getSkin(null);
  private settings!: Settings;
  private progress!: Progress;
  private levels: LevelMeta[] = [];
  private screen: Screen = "title";
  private session: Session | null = null;
  private readonly input: InputController;
  private readonly haptics: Haptics;
  private readonly synth = new Synth();
  private readonly hud: HudView;
  private readonly platform: Platform;
  private title: TitleBackdrop | null = null;
  private last = 0;
  private hidden = false;
  private hudKey = "";
  private fps = 60;
  private hashCache = { tick: -1, hash: "" };
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private ftoastTimer: ReturnType<typeof setTimeout> | null = null;
  private inspectTimer: ReturnType<typeof setTimeout> | null = null;
  private settingsTab: "settings" | "guide" = "settings";
  private thumbs = new Map<string, string>();
  private beatAt = 0;
  private resetArmed = false;
  private settingsFrom: Screen = "title";
  private offline = -1;
  updateReady = false;

  private readonly el: {
    app: HTMLElement; hud: HTMLElement; lvlName: HTMLElement; goal: HTMLElement; chips: HTMLElement; menuBtn: HTMLButtonElement; retryBtn: HTMLButtonElement; gearBtn: HTMLButtonElement;
    stage: HTMLElement; world: HTMLElement; debug: HTMLElement; ov: Record<string, HTMLElement>; rotate: HTMLElement; loading: HTMLElement; toast: HTMLElement;
    ftoast: HTMLElement; tapstart: HTMLElement; inspect: HTMLElement; objectives: HTMLElement;
  };

  constructor(root: HTMLElement, private readonly deps: AppDeps) {
    root.innerHTML = TEMPLATE;
    const ov: Record<string, HTMLElement> = {};
    for (const k of ["title", "levels", "intro", "result", "settings", "error", "unsupported"]) ov[k] = $(root, `#ov-${k}`);
    this.el = {
      app: $(root, ".app"), hud: $(root, ".hud"), lvlName: $(root, "#lvlName"), goal: $(root, "#goalTxt"), chips: $(root, "#chips"),
      menuBtn: $<HTMLButtonElement>(root, "#menuBtn"), retryBtn: $<HTMLButtonElement>(root, "#retryBtn"), gearBtn: $<HTMLButtonElement>(root, "#gearBtn"), stage: $(root, "#stage"), world: $(root, "#world"),
      debug: $(root, "#debug"), ov, rotate: $(root, ".rotate"), loading: $(root, "#loading"), toast: $(root, "#toast"),
      ftoast: $(root, "#ftoast"), tapstart: $(root, "#tapstart"), inspect: $(root, "#inspect"), objectives: $(root, "#objectives"),
    };
    this.platform = deps.platform ?? webPlatform();
    this.haptics = new Haptics((ms) => this.platform.haptic(ms));
    this.input = new InputController(this.el.stage);
    this.input.onTap = (x, y) => this.inspectAt(x, y);
    // the first touch on the level-start overview starts play
    this.el.stage.addEventListener("pointerdown", () => { const o = this.session?.overview; if (o && !o.go && this.screen === "playing") { o.go = true; this.el.tapstart.hidden = true; } }, { passive: true });
    this.hud = new HudView(this.el.chips);
    this.bindChrome();
  }

  async start(): Promise<void> {
    this.settings = await this.deps.store.getSettings();
    this.progress = await this.deps.store.getProgress();
    this.skin = getSkin(this.settings.skin);
    this.applySettings();
    this.applyTheme();
    try { this.levels = await this.deps.source.list(); } catch { this.levels = []; }
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    if (!webglAvailable(this.el.app.ownerDocument)) { this.show("unsupported"); return; }
    this.show("title");
    if (this.deps.justUpdated) this.continueToast();
    warm3D();
    void this.prefetch();
  }

  // ------------------------------------------------------------------ chrome

  private bindChrome(): void {
    const doc = this.el.app.ownerDocument;
    doc.addEventListener("pointerdown", () => this.synth.unlock(), { once: false, passive: true });
    // visibility on the web, the App plugin's pause/resume natively
    this.platform.onPause(() => this.setHidden(true));
    this.platform.onResume(() => this.setHidden(false));
    if (this.platform.native) doc.addEventListener("visibilitychange", () => this.setHidden(doc.visibilityState === "hidden"));
    this.el.menuBtn.addEventListener("click", () => this.quitToLevels());
    // in-play Retry: the same restart as the result card Retry
    this.el.retryBtn.addEventListener("click", () => { const m = this.session?.meta; if (m && this.screen !== "settings") void this.openLevel(m); });
    // the in-level gear opens Settings over any level screen and pauses play; Back resumes
    this.el.gearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.screen === "settings") this.leaveSettings();
      else if (this.session) this.show("settings");
    });
    doc.addEventListener("keydown", (e) => {
      if (e.key === "`") this.toggleDebug();
      if (e.key === "Escape" && this.screen === "playing") this.quitToLevels();
    });
    // long-press the level name to toggle the debug overlay (no keyboard on phones)
    let lp: ReturnType<typeof setTimeout> | null = null;
    const title = this.el.lvlName.parentElement!;
    title.addEventListener("pointerdown", () => { lp = setTimeout(() => this.toggleDebug(), 600); });
    for (const t of ["pointerup", "pointerleave", "pointercancel"]) title.addEventListener(t, () => { if (lp) clearTimeout(lp); lp = null; });
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.el.stage);
    window.addEventListener("online", () => void this.prefetch());
  }

  /** Background/foreground: pause the loop, input and audio (the sim never runs hidden). */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) { this.input.release(); this.synth.suspend(); this.title?.stop(); }
    else { this.last = performance.now(); this.session?.stepper.reset(); this.synth.resume(); if (this.screen === "title") this.title?.start(); }
  }

  private resize(): void {
    const r = this.el.stage.getBoundingClientRect();
    this.session?.renderer.resize(r.width, r.height);
  }

  private applyTheme(): void {
    const p = this.skin.palette, st = this.el.app.ownerDocument.documentElement.style;
    st.setProperty("--bg", p.ui.bg);
    st.setProperty("--panel", p.ui.panel);
    st.setProperty("--panel-alt", p.ui.panelAlt);
    st.setProperty("--ink", p.ui.ink);
    st.setProperty("--muted", p.ui.muted);
    st.setProperty("--go", p.ui.go);
    st.setProperty("--go-shade", p.ui.goShade);
    st.setProperty("--bad", p.ui.bad);
    st.setProperty("--overlay", p.ui.overlay);
    st.setProperty("--accent", p.accent);
    st.setProperty("--interactive", p.interactive);
    st.setProperty("--ground", p.ground);
    st.setProperty("--gold", p.res["res.currency"] ?? "#ffcb3d");
    const meta = this.el.app.ownerDocument.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", this.skin.themeColor);
    this.platform.statusBar(true, p.ui.bg);
    this.el.menuBtn.textContent = uiText(this.skin, "levels");
    this.el.retryBtn.textContent = uiText(this.skin, "retry");
    this.el.gearBtn.setAttribute("aria-label", uiText(this.skin, "settings"));
    $(this.el.rotate, "p").textContent = uiText(this.skin, "rotate");
    this.title?.setSkin(this.skin);
  }

  private applySettings(): void {
    this.haptics.enabled = this.settings.haptics;
    this.synth.enabled = this.settings.sound;
    this.el.debug.hidden = !this.settings.debug || !this.session;
    this.session?.renderer.setQuality(this.qualityTier());
    if (this.session) this.startGuide(this.session);
  }

  /** Quality tier for the renderer; "auto" uses the in-play frame-rate probe, else the core count. */
  private qualityTier(): Tier {
    const q = this.settings.quality;
    if (q !== "auto") return q;
    const cores = (navigator as { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
    return autoTier(this.settings.probeFps, cores);
  }

  /**
   * "Auto" quality: the first PROBE_SEC seconds of real play on the core-count tier measure the
   * renderer's own fps once; the result picks the tier from then on (Settings can override).
   */
  private probe(s: Session, dt: number): void {
    if (this.settings.quality !== "auto" || this.settings.probeFps !== null) return;
    s.played += dt / 1000;
    if (s.played < PROBE_SEC) return;
    this.settings.probeFps = Math.max(1, Math.round(s.renderer.fps()));
    void this.deps.store.setSettings(this.settings);
    this.applySettings();
  }

  private toggleDebug(): void {
    this.settings.debug = !this.settings.debug;
    this.applySettings();
    void this.deps.store.setSettings(this.settings);
  }

  private saveProgressSoon(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; void this.deps.store.setProgress(this.progress); }, 800);
  }

  private toast(html: string, actions: Record<string, () => void> = {}, ms = 6000): void {
    const t = this.el.toast;
    t.innerHTML = html;
    t.hidden = false;
    this.wire(t, Object.fromEntries(Object.entries(actions).map(([k, fn]) => [k, () => { t.hidden = true; fn(); }])));
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  /** After a service-worker update: offer to jump back into the next level. */
  private continueToast(): void {
    const next = nextLevel(this.levels, this.progress);
    const s = this.skin;
    this.toast(`<span>${esc(uiText(s, "updated"))}</span>${next ? `<button class="go small" data-a="go">${esc(uiText(s, "continueLevel", { n: next.index + 1 }))}</button>` : ""}<button class="small" data-a="x">${esc(uiText(s, "dismiss"))}</button>`, {
      go: () => { if (next) void this.openLevel(next); },
      x: () => undefined,
    }, 9000);
  }

  // ------------------------------------------------------------------ renderer

  /** The 3D renderer, or null (and the unsupported screen) when it cannot start. */
  private async makeRenderer(): Promise<GameRenderer | null> {
    this.el.loading.textContent = uiText(this.skin, "rendererLoading");
    this.el.loading.hidden = false;
    try {
      return await createRenderer(this.qualityTier());
    } catch {
      this.show("unsupported");
      return null;
    } finally {
      this.el.loading.hidden = true;
    }
  }

  private attachRenderer(s: Session, r: GameRenderer): void {
    try {
      r.init(s.sim.compiled.manifest, this.skin, this.el.world);
    } catch {
      // a context that fails at init (lost GPU, blocklisted driver) is an unsupported device
      try { r.dispose(); } catch { /* ignore */ }
      this.session = null;
      this.show("unsupported");
      return;
    }
    r.hudAnchor = () => this.coinTarget();
    r.onCoinLanded = () => this.hud.pulse("currency");
    r.setQuality(this.qualityTier());
    r.setDiscovery((id) => isNew(this.progress.discovered)(id));
    s.renderer = r;
    this.resize();
    r.snapCamera();
    this.updateCoach(s);
    r.sync(s.sim.state, 0, s.cam);
  }

  // ------------------------------------------------------------------ discovery

  /** Mark types as used; the first touch of a labelled type gets a small toast. */
  private discover(ids: readonly string[]): void {
    let fresh: string | null = null;
    for (const id of ids) {
      if (this.progress.discovered[id]) continue;
      this.progress.discovered[id] = true;
      if (!fresh && isNew({})(id)) fresh = id;
      this.saveProgressSoon();
    }
    if (fresh) this.firstTouch(fresh);
  }

  private firstTouch(id: string): void {
    const s = this.skin, t = this.el.ftoast;
    const purpose = purposeOf(s, id);
    t.innerHTML = `<b>${esc(uiText(s, "newType", { name: nameOf(s, id) }))}</b>${purpose ? `<span>${esc(purpose)}</span>` : ""}`;
    t.hidden = false;
    t.classList.remove("in");
    void t.offsetWidth;
    t.classList.add("in");
    if (this.ftoastTimer) clearTimeout(this.ftoastTimer);
    this.ftoastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /** Tap to inspect: name and purpose of what is under the finger, for a couple of seconds. */
  private inspectAt(x: number, y: number): void {
    const s = this.session;
    if (!s || this.screen !== "playing") return;
    const hit = s.renderer.inspect(x, y);
    const card = this.el.inspect;
    if (!hit) { card.hidden = true; return; }
    const { name, purpose } = hit;
    card.innerHTML = `<b>${esc(name)}</b>${purpose ? `<span>${esc(purpose)}</span>` : ""}`;
    card.hidden = false;
    const r = this.el.stage.getBoundingClientRect();
    const w = Math.min(250, r.width - 24);
    card.style.width = `${w}px`;
    card.style.left = `${Math.max(12, Math.min(r.width - w - 12, x - w / 2))}px`;
    card.style.top = `${y > r.height * 0.45 ? Math.max(8, y - 96) : y + 28}px`;
    card.classList.remove("in");
    void card.offsetWidth;
    card.classList.add("in");
    if (this.inspectTimer) clearTimeout(this.inspectTimer);
    this.inspectTimer = setTimeout(() => { card.hidden = true; }, INSPECT_MS);
  }

  // ------------------------------------------------------------------ offline levels

  /** When online, cache every level of every pack (the whole set is well under 1 MB); refresh the count. */
  private async prefetch(): Promise<void> {
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      await prefetchLevels(this.levels);
      void this.reportSupply();
    }
    this.offline = await offlineReady(this.levels);
    if (this.screen === "levels" || this.screen === "settings") this.paintOffline();
  }

  /** Attempts to first clear: every finished attempt counts until the level is cleared. */
  private countTry(id: string): void {
    if (!this.progress.cleared[id]) this.progress.tries[id] = (this.progress.tries[id] ?? 0) + 1;
  }

  /** Ask for the next level batch when the published levels run low (shipped builds only). */
  private async reportSupply(): Promise<void> {
    const url = import.meta.env.VITE_PROGRESS_URL ?? (import.meta.env.PROD ? "/api/progress" : "off");
    if (url === "off" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return;
    const published = this.levels.filter((l) => l.url).length;
    const report = progressReport(this.levels, this.progress.cleared, (id) => this.starCount(id), this.progress.tries);
    await reportProgress(url, report, published, { engine: ENGINE_VERSION, content: CONTENT_VERSION });
  }

  private offlineLine(): string {
    if (this.offline < 0) return "";
    const s = this.skin, n = this.offline, total = this.levels.length;
    if (n <= 0) return uiText(s, "offlineNone");
    return n >= total ? uiText(s, "offlineAll", { n }) : uiText(s, "offlineSome", { n, total });
  }

  private paintOffline(): void {
    for (const el of this.el.app.querySelectorAll<HTMLElement>("[data-offline]")) el.textContent = this.offlineLine();
  }

  // ------------------------------------------------------------------ screens

  /** A new build is waiting: apply it now when no level is in progress, else at the next menu. */
  offerUpdate(): void {
    this.updateReady = true;
    if ((this.screen === "title" || this.screen === "levels") && !this.session) this.deps.applyUpdate?.();
  }

  private show(screen: Screen): void {
    const prev = this.screen;
    this.screen = screen;
    for (const [k, el] of Object.entries(this.el.ov)) el.hidden = k !== screen;
    this.input.enabled = screen === "playing";
    if (screen !== "playing") this.input.release();
    this.el.debug.hidden = !this.settings.debug || !this.session;
    this.el.app.classList.toggle("nohud", !this.session || screen === "title" || screen === "levels" || screen === "unsupported");
    if (screen !== "playing") this.el.inspect.hidden = true;
    if ((screen === "title" || screen === "levels") && this.updateReady && this.deps.applyUpdate?.()) return;
    if (screen === "title") this.renderTitle();
    else this.title?.stop();
    if (screen === "levels") this.renderLevels();
    if (screen === "settings") { this.settingsFrom = prev === "settings" ? this.settingsFrom : prev; this.renderSettings(); }
    if (screen === "unsupported") this.renderUnsupported();
    if (screen === "playing") { this.session?.stepper.reset(); this.last = performance.now(); }
  }

  private renderTitle(): void {
    const ov = this.el.ov["title"]!, s = this.skin;
    const words = uiText(s, "wordmark").split(" ");
    const cleared = this.levels.filter((l) => this.progress.cleared[l.id]).length;
    const next = nextLevel(this.levels, this.progress);
    ov.innerHTML = `
      <div class="title-wrap">
        <div class="wordmark" aria-label="${esc(uiText(s, "wordmark"))}">
          <span class="wm-top">${esc(words[0] ?? "")}</span>
          <span class="wm-bot">${esc(words.slice(1).join(" "))}</span>
        </div>
        <div class="skin-name">${esc(s.name)}</div>
        <p class="tagline">${esc(s.tagline)}</p>
        <div class="stack">
          <button class="go big play" data-a="play"><span>${esc(uiText(s, "play"))}</span>${next ? `<small>${esc(uiText(s, "levelWord"))} ${next.index + 1}</small>` : ""}</button>
          <div class="row"><button data-a="levels">${esc(uiText(s, "levels"))}${this.levels.length ? ` <small class="count">${cleared}/${this.levels.length}</small>` : ""}</button><button data-a="settings">${esc(uiText(s, "settings"))}</button></div>
        </div>
        ${this.updateReady ? `<p class="note">${esc(uiText(s, "updateReady"))}</p>` : ""}
      </div>`;
    if (!this.title) this.title = new TitleBackdrop(ov, this.skin);
    else this.title.attach();
    this.title.start();
    this.wire(ov, {
      play: () => { const m = nextLevel(this.levels, this.progress); if (m) void this.openLevel(m); else this.show("levels"); },
      levels: () => this.show("levels"),
      settings: () => this.show("settings"),
    });
  }

  private titleOf(l: LevelMeta): { name: string; own: boolean } {
    const s = this.skin;
    const own = levelTitle(s, { id: l.id, goal: l.goalType, modules: l.modules, text: l.text });
    return own ? { name: own, own: true } : { name: l.title || nameOf(s, `goal.${l.goalType}`), own: !!l.title };
  }

  private renderLevels(): void {
    const ov = this.el.ov["levels"]!, s = this.skin;
    const next = nextLevel(this.levels, this.progress)?.id;
    const tile = (l: LevelMeta): string => {
      const cleared = !!this.progress.cleared[l.id];
      const open = isUnlocked(this.levels, l, this.progress, this.settings.debug);
      const best = this.progress.best[l.id];
      const stars = this.starCount(l.id);
      const sub = cleared
        ? `<span class="stars" aria-label="${esc(uiText(s, "stars", { n: stars || 1 }))}">${starText(stars || 1)}</span>${best !== undefined ? `<span class="t">${esc(formatTicks(best))}</span>` : ""}`
        : open ? esc(uiText(s, "notPlayed")) : `<span class="lock" aria-hidden="true"></span>${esc(uiText(s, "locked"))}`;
      return `<button class="lvtile${cleared ? " cleared" : ""}${open ? "" : " locked"}${l.id === next ? " next" : ""}" data-id="${esc(l.id)}" ${open ? "" : "disabled"}>
        <span class="num">${l.index + 1}</span>${l.family ? `<span class="fams">${[l.family, l.secondary].filter((f): f is string => !!f).map((f) => familyIcon(f, uiText(s, `family_${f}`))).join("")}</span>` : ""}
        <span class="name">${esc(this.titleOf(l).name)}</span>
        <span class="sub">${sub}</span>
      </button>`;
    };
    const body = chapters(this.levels, 10).map((c) => `<h3 class="chapter">${esc(uiText(s, "chapter", { n: c.n }))}</h3><div class="lvgrid">${c.levels.map(tile).join("")}</div>`).join("");
    ov.innerHTML = `<div class="card wide levels-card">
      <div class="card-head"><h2>${esc(uiText(s, "levels"))}</h2><button data-a="back" class="small">${esc(uiText(s, "back"))}</button></div>
      <p class="note offline" data-offline>${esc(this.offlineLine())}</p>
      <div class="lvscroll">${body || `<p>No levels found.</p>`}</div>
    </div>`;
    this.wire(ov, { back: () => this.show("title") });
    for (const b of ov.querySelectorAll<HTMLButtonElement>(".lvtile")) {
      b.addEventListener("click", () => { const m = this.levels.find((l) => l.id === b.dataset["id"]); if (m) void this.openLevel(m); });
    }
    ov.querySelector<HTMLElement>(".lvtile.next")?.scrollIntoView?.({ block: "center" });
  }

  /** Stars earned on a level: the best-ever set of objectives, or a legacy count. */
  private starCount(id: string): number {
    return Math.min(3, Math.max(this.progress.starSet[id]?.length ?? 0, this.progress.stars[id] ?? 0));
  }

  /** Leave Settings for where it was opened from: back into the paused level, else the title. */
  private leaveSettings(): void {
    const s = this.session, from = this.settingsFrom;
    if (s && !s.ended) this.show(from === "intro" ? "intro" : "playing");
    else if (s && from === "result") this.show("result");
    else this.show("title");
  }

  private renderSettings(): void {
    const ov = this.el.ov["settings"]!, s = this.skin;
    this.resetArmed = false;
    const paused = !!this.session && !this.session.ended && this.settingsFrom === "playing";
    const tab = this.settingsTab;
    const tabs = `<div class="tabs" role="tablist">${(["settings", "guide"] as const).map((k) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? "on" : ""}" data-tab="${k}">${esc(uiText(s, k === "settings" ? "tabSettings" : "tabGuide"))}</button>`).join("")}</div>`;
    const head = `<div class="card-head"><h2>${esc(uiText(s, paused ? "paused" : "settings"))}</h2><button data-a="back" class="small${paused ? " go" : ""}">${esc(uiText(s, paused ? "resume" : "back"))}</button></div>`;
    ov.innerHTML = `<div class="card settings-card">${head}${tabs}<div class="tabbody">${tab === "guide" ? this.guideHtml() : this.settingsHtml()}</div></div>`;
    this.wire(ov, {
      back: () => this.leaveSettings(),
      export: () => { void this.deps.telemetry.exportFile(); },
      reset: () => {
        const resetBtn = ov.querySelector<HTMLButtonElement>('[data-a="reset"]');
        if (!resetBtn) return;
        if (!this.resetArmed) { this.resetArmed = true; resetBtn.textContent = uiText(s, "resetConfirm"); resetBtn.classList.add("armed"); return; }
        this.progress = structuredClone(DEFAULT_PROGRESS);
        void this.deps.store.setProgress(this.progress);
        this.resetArmed = false;
        resetBtn.textContent = uiText(s, "resetDone");
        resetBtn.classList.remove("armed");
        resetBtn.disabled = true;
      },
    });
    for (const b of ov.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
      b.addEventListener("click", () => { this.settingsTab = b.dataset["tab"] as "settings" | "guide"; this.renderSettings(); });
    }
    for (const inp of ov.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-k]")) {
      inp.addEventListener("change", () => {
        const k = inp.dataset["k"] as keyof Settings;
        const val = inp instanceof HTMLInputElement && inp.type === "checkbox" ? inp.checked : inp.value;
        (this.settings as unknown as Record<string, unknown>)[k] = k === "timeTargetPct" ? normalizeTimeTargetPct(val) : val;
        this.applySettings();
        void this.deps.store.setSettings(this.settings);
        if (k === "haptics" && val) this.haptics.play({ t: "built" } as SimEvent);
        if (k === "sound" && val) { this.synth.unlock(); this.synth.play("coin"); }
      });
    }
    if (tab === "guide") void this.paintThumbs(ov);
  }

  private settingsHtml(): string {
    const s = this.skin, st = this.settings;
    const toggle = (k: "haptics" | "sound" | "guide", label: string): string =>
      `<label class="set"><span>${esc(label)}</span><input type="checkbox" data-k="${k}" ${st[k] ? "checked" : ""}></label>`;
    return `${toggle("haptics", uiText(s, "settingsHaptics"))}
      ${toggle("sound", uiText(s, "settingsSound"))}
      ${toggle("guide", uiText(s, "settingsGuide"))}
      <label class="set"><span>${esc(uiText(s, "settingsTimeTarget"))}</span>
        <select data-k="timeTargetPct">${TIME_TARGET_STEPS.map((p) => `<option value="${p}" ${st.timeTargetPct === p ? "selected" : ""}>${p}%</option>`).join("")}</select></label>
      <label class="set"><span>${esc(uiText(s, "settingsQuality"))}</span>
        <select data-k="quality">${(["auto", "low", "medium", "high"] as const).map((q) => `<option value="${q}" ${st.quality === q ? "selected" : ""}>${esc(uiText(s, `quality_${q}`))}</option>`).join("")}</select></label>
      <p class="note offline" data-offline>${esc(this.offlineLine())}</p>
      ${this.session && !this.session.ended ? "" : `<button data-a="export" class="wide-btn">${esc(uiText(s, "exportTelemetry"))}</button>
      <button data-a="reset" class="wide-btn danger">${esc(uiText(s, "resetProgress"))}</button>`}
      <p class="note">v${ENGINE_VERSION} · content ${CONTENT_VERSION}${this.deps.store.persistent ? " · storage persistent" : ""}${st.probeFps !== null ? ` · ${st.probeFps} fps probe` : ""}</p>`;
  }

  /** Field guide: every discovered type with its icon, name and purpose. */
  private guideHtml(): string {
    const s = this.skin;
    const ids = Object.keys(this.progress.discovered)
      .filter((id) => s.names[id] && purposeOf(s, id))
      .sort((a, b) => guideOrder(a) - guideOrder(b) || nameOf(s, a).localeCompare(nameOf(s, b)));
    if (!ids.length) return `<p class="guide-empty">${esc(uiText(s, "guideEmpty"))}</p>`;
    return `<p class="note">${esc(uiText(s, "guideCount", { n: ids.length }))}</p><ul class="guide">${ids.map((id) => {
      const th = this.thumbs.get(id);
      return `<li data-id="${esc(id)}"><span class="gicon" style="--c:${guideColor(s, id)}">${th ? `<img src="${th}" alt="">` : `<i>${esc(nameOf(s, id).charAt(0))}</i>`}</span><span class="gtext"><b>${esc(nameOf(s, id))}</b><small>${esc(purposeOf(s, id))}</small></span></li>`;
    }).join("")}</ul>`;
  }

  /** Small 3D renders for the field guide, made once per type and swapped in when ready. */
  private async paintThumbs(ov: HTMLElement): Promise<void> {
    const want = Object.keys(this.progress.discovered).filter((id) => !this.thumbs.has(id));
    if (want.length) {
      const got = await thumbnails(want, this.skin, 96);
      for (const id of want) this.thumbs.set(id, got.get(id) ?? "");
    }
    for (const li of ov.querySelectorAll<HTMLElement>(".guide li[data-id]")) {
      const url = this.thumbs.get(li.dataset["id"]!);
      const icon = li.querySelector(".gicon");
      if (url && icon && !icon.querySelector("img")) icon.innerHTML = `<img src="${url}" alt="">`;
    }
  }

  /** No WebGL: a friendly card in the skin's look instead of the game. */
  private renderUnsupported(): void {
    const ov = this.el.ov["unsupported"]!, s = this.skin;
    const words = uiText(s, "wordmark").split(" ");
    ov.innerHTML = `<div class="title-wrap">
        <div class="wordmark" aria-label="${esc(uiText(s, "wordmark"))}">
          <span class="wm-top">${esc(words[0] ?? "")}</span>
          <span class="wm-bot">${esc(words.slice(1).join(" "))}</span>
        </div>
        <div class="card center unsupported"><h2>${esc(uiText(s, "unsupportedTitle"))}</h2><p>${esc(uiText(s, "unsupportedBody"))}</p></div>
      </div>`;
    new TitleBackdrop(ov, this.skin).start();
  }

  private wire(root: HTMLElement, actions: Record<string, () => void>): void {
    for (const b of root.querySelectorAll<HTMLElement>("[data-a]")) {
      const fn = actions[b.dataset["a"]!];
      if (fn) b.addEventListener("click", fn);
    }
  }

  // ------------------------------------------------------------------ levels

  /** Modules seen in levels before this one, so intro tips cover only what is new. */
  private seenBefore(meta: LevelMeta): Set<string> {
    const seen = new Set<string>();
    for (const l of this.levels) if (l.index < meta.index) for (const m of l.modules) seen.add(m);
    return seen;
  }

  private async openLevel(meta: LevelMeta): Promise<void> {
    this.endSession();
    let manifest: Manifest, sim: Sim;
    try {
      manifest = await this.deps.source.load(meta.id);
      manifest = applyTimeTarget(manifest, this.settings.timeTargetPct);
      sim = createSim(manifest);
    } catch (err) {
      this.showError(meta, err);
      return;
    }
    const renderer = await this.makeRenderer();
    if (!renderer) return;
    const coach = new Coach(sim.compiled.manifest.modules, this.progress.coach, undefined, !!sim.compiled.gate);
    this.session = {
      meta, manifest: sim.compiled.manifest, sim, renderer, cam: createCamera(), stepper: new FixedStepper(), coach, ended: false,
      earned: 0, lastCurrency: sim.state.currency, wavesCleared: 0, lifeMin: sim.state.meters.lifeline, played: 0,
      guide: null, guideOn: false, guideTarget: null, overview: null,
    };
    this.attachRenderer(this.session, renderer);
    if (!this.session) return;
    this.startGuide(this.session);
    this.progress.current = meta.id;
    void this.deps.store.setProgress(this.progress);
    const t = levelText(this.session.manifest, this.skin, meta.index, this.seenBefore(meta));
    const named = !!levelTitle(this.skin, this.session.manifest);
    this.el.lvlName.textContent = named ? `${uiText(this.skin, "levelWord")} ${meta.index + 1} · ${t.title}` : t.title;
    this.hudKey = "";
    this.hud.reset(sim.state.currency);
    this.renderIntro(t);
    this.show("intro");
    void this.prefetch();
  }

  private renderIntro(t: { title: string; goal: string; tips: string[] }): void {
    const ov = this.el.ov["intro"]!, s = this.skin, meta = this.session!.meta;
    const best = this.progress.best[meta.id];
    const stars = this.starCount(meta.id);
    const objs = introObjectives(this.session!.manifest, s);
    ov.innerHTML = `<div class="card intro">
      <div class="lbl">${esc(uiText(s, "levelWord"))} ${meta.index + 1} / ${this.levels.length}${best !== undefined ? ` · ${esc(uiText(s, "best"))} ${formatTicks(best)}` : ""}${stars ? ` · <span class="stars">${starText(stars)}</span>` : ""}</div>
      <h2>${esc(t.title)}</h2>
      <p class="goal-line"><span class="goal-ic"></span><b>${esc(uiText(s, "goal"))}:</b> ${esc(t.goal)}</p>
      ${objs.length ? `<p class="objhead">${esc(uiText(s, "starsTitle"))}</p><ul class="objlist">${objs.map((o) => `<li>${iconSvg(o.icon)}<span class="otxt">${esc(o.label)}</span><span class="ost">\u2605</span></li>`).join("")}</ul>` : ""}
      <p class="lead">${esc(uiText(s, "introLead"))}</p>
      <ul>${t.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${meta.index === 0 ? `<p class="how">${esc(uiText(s, "howTo"))}</p>` : ""}
      <button class="go big" data-a="start">${esc(uiText(s, "start"))}</button>
      <div class="row"><button data-a="levels" class="small">${esc(uiText(s, "levels"))}</button><button data-a="settings" class="small">${esc(uiText(s, "settings"))}</button></div>
    </div>`;
    this.wire(ov, {
      start: () => { if (this.session) this.startOverview(this.session); this.show("playing"); },
      levels: () => { this.endSession(); this.show("levels"); },
      settings: () => this.show("settings"),
    });
  }

  private showError(meta: LevelMeta, err: unknown): void {
    const ov = this.el.ov["error"]!;
    const msg = err instanceof Error ? err.message : String(err);
    ov.innerHTML = `<div class="card"><h2>Level ${meta.index + 1} can't load</h2>
      <p>${esc(msg)}</p><p class="note">Engine ${ENGINE_VERSION}, content ${CONTENT_VERSION}; level pinned to ${esc(meta.engineVersion)} / ${esc(meta.contentVersion)}.</p>
      <button data-a="back">${esc(uiText(this.skin, "levels"))}</button></div>`;
    this.wire(ov, { back: () => this.show("levels") });
    this.show("error");
  }

  private quitToLevels(): void {
    const s = this.session;
    if (s && !s.ended && this.screen === "playing") {
      const quits = (this.progress.quits[s.meta.id] ?? 0) + 1;
      this.progress.quits[s.meta.id] = quits;
      this.countTry(s.meta.id);
      void this.deps.store.setProgress(this.progress);
      void this.deps.telemetry.record(this.attempt(s, "quit", "quit", quits - 1));
    }
    this.endSession();
    this.show("levels");
  }

  private endSession(): void {
    this.el.tapstart.hidden = true;
    if (this.resultTimer) { clearTimeout(this.resultTimer); this.resultTimer = null; }
    this.session?.renderer.dispose();
    this.session = null;
  }

  private attempt(s: Session, outcome: "win" | "lose" | "quit", reason: string, quits: number) {
    return {
      levelId: s.meta.id, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION,
      outcome, reason, ticks: s.sim.state.tick, quits, ts: Date.now(),
    };
  }

  private finish(won: boolean, reason: string): void {
    const s = this.session;
    if (!s || s.ended) return;
    s.ended = true;
    s.renderer.setCoach(null);
    const id = s.meta.id, ticks = s.sim.state.tick;
    const prevBest = this.progress.best[id];
    let stars = 0;
    this.countTry(id);
    if (won) {
      this.progress.cleared[id] = true;
      if (prevBest === undefined || ticks < prevBest) this.progress.best[id] = ticks;
      // stars are the sim's objectives done at level end; the saved set is the best-ever union
      stars = starsOf(s.sim.state);
      const set = new Set(this.progress.starSet[id] ?? []);
      for (const o of s.sim.state.objectives) if (o.done) set.add(o.id);
      this.progress.starSet[id] = [...set];
      this.progress.stars[id] = Math.max(this.progress.stars[id] ?? 0, set.size);
      const next = this.levels[s.meta.index + 1];
      if (next) this.progress.current = next.id;
    }
    void this.deps.store.setProgress(this.progress);
    void this.deps.telemetry.record(this.attempt(s, won ? "win" : "lose", reason, this.progress.quits[id] ?? 0));
    // let the confetti land before the card covers the stage
    const newBest = won && prevBest !== undefined && ticks < prevBest;
    this.resultTimer = setTimeout(() => { this.renderResult(won, reason, ticks, newBest, stars); this.show("result"); }, won ? 1500 : 1000);
    if (won) void this.prefetch();
  }

  private renderResult(won: boolean, reason: string, ticks: number, newBest: boolean, stars: number): void {
    const ov = this.el.ov["result"]!, sk = this.skin, s = this.session!;
    const st = s.sim.state;
    const next = this.levels[s.meta.index + 1];
    const text = sk.text.reasons[won ? "goal" : reason] ?? sk.text.reasons["meter.lifeline"] ?? reason;
    const tip = won ? "" : sk.text.loseTips?.[reason] ?? "";
    const best = this.progress.best[s.meta.id];
    const pop = st.residents.filter((r) => COUNTS_AS_POP.has(r.status)).length;
    const stats: [string, string][] = [[uiText(sk, "statTime"), formatTicks(ticks)], [uiText(sk, "statEarned"), String(s.earned)], [uiText(sk, "statColonists"), String(pop)]];
    if (st.stats.sold > 0) stats.push([uiText(sk, "statSold"), String(st.stats.sold)]);
    if (s.sim.compiled.waves.length) stats.push([uiText(sk, "statRaids"), `${s.wavesCleared}/${s.sim.compiled.waves.length}`]);
    const rows = liveObjectives(st, s.manifest, sk);
    const objList = won && rows.length ? `<ul class="objlist">${rows.map((o) => `<li class="${o.done ? "on" : "missed"}">${iconSvg(o.icon)}<span class="otxt">${esc(o.label)}</span><span class="omark">${o.done ? "\u2713" : esc(uiText(sk, "starMissed"))}</span><span class="ost">\u2605</span></li>`).join("")}</ul>` : "";
    const starRow = won ? `<div class="starrow" aria-label="${esc(uiText(sk, "stars", { n: stars }))}">${[1, 2, 3].map((i) => `<span class="star${i <= stars ? " on" : ""}" style="animation-delay:${0.2 + i * 0.18}s">★</span>`).join("")}</div>` : "";
    ov.innerHTML = `<div class="card center result ${won ? "won" : "lost"}">
      ${won ? starRow : `<div class="badge">!</div>`}
      <h2>${esc(uiText(sk, won ? "win" : "lose"))}</h2>
      <p>${esc(text)}</p>
      ${objList}
      <div class="stats">${stats.map(([k, v], i) => `<div class="stat-cell" style="animation-delay:${0.15 + i * 0.08}s"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>
      ${won && best !== undefined ? `<p class="bestline">${newBest ? `<span class="newbest">${esc(uiText(sk, "newBest"))}</span> ` : ""}${esc(uiText(sk, "best"))} ${formatTicks(best)}</p>` : ""}
      ${tip ? `<p class="tip"><b>${esc(uiText(sk, "tipLabel"))}:</b> ${esc(tip)}</p>` : ""}
      <div class="row">
        <button data-a="levels">${esc(uiText(sk, "levels"))}</button>
        <button data-a="retry" class="${won && next ? "" : "go"}">${esc(uiText(sk, "retry"))}</button>
        ${won && next ? `<button data-a="next" class="go">${esc(uiText(sk, "next"))}</button>` : ""}
      </div>
    </div>`;
    this.wire(ov, {
      levels: () => { this.endSession(); this.show("levels"); },
      retry: () => void this.openLevel(s.meta),
      next: () => { if (next) void this.openLevel(next); },
    });
  }

  /** Dev hook: step the running level by hand (hidden panes and tests get no rAF). */
  debugAdvance(ticks: number, input = { dx: 0, dy: 0 }): number {
    const s = this.session;
    if (!s || this.screen !== "playing") return -1;
    for (let i = 0; i < ticks && !s.ended; i++) this.stepOnce(s, input);
    this.renderNow(s);
    return s.sim.state.tick;
  }

  /** Dev hook: run a scripted policy one tick at a time, rendering once at the end. */
  debugRun(policy: (state: Sim["state"]) => { dx: number; dy: number } | null, maxTicks = 30 * 60): number {
    const s = this.session;
    if (!s || this.screen !== "playing") return -1;
    for (let i = 0; i < maxTicks && !s.ended; i++) {
      const input = policy(s.sim.state);
      if (!input) break;
      this.stepOnce(s, input);
    }
    this.renderNow(s);
    return s.sim.state.tick;
  }

  private renderNow(s: Session): void {
    this.updateCoach(s);
    s.cam.lead = this.leadPoint(s);
    s.renderer.snapCamera();
    s.renderer.sync(s.sim.state, 0, s.cam);
    this.updateHud(s);
  }

  /** Dev hook: open a level by id and start playing it at once. */
  async debugPlay(id: string): Promise<boolean> {
    const m = this.levels.find((l) => l.id === id);
    if (!m) return false;
    await this.openLevel(m);
    if (!this.session) return false;
    this.show("playing");
    return true;
  }

  /** Dev hook: the running sim (read-only use). */
  get debugSim(): Sim | null { return this.session?.sim ?? null; }

  /** Dev hook: the running renderer's projection, for checking overlays. */
  debugProject(x: number, y: number): { x: number; y: number } | null { return this.session?.renderer.worldToScreen({ x, y }) ?? null; }

  // ------------------------------------------------------------------ loop

  private stepOnce(s: Session, input: { dx: number; dy: number }): void {
    for (const e of s.sim.step(input)) this.handleEvent(s, e);
    const cur = s.sim.state.currency;
    if (cur > s.lastCurrency) s.earned += cur - s.lastCurrency;
    s.lastCurrency = cur;
    const life = s.sim.state.meters.lifeline;
    if (life < s.lifeMin) s.lifeMin = life;
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = now - this.last;
    this.last = now;
    if (dt > 0) this.fps += (1000 / dt - this.fps) * 0.05;
    const s = this.session;
    if (!s) return;
    const waiting = this.stepOverview(s, dt / 1000);
    const playing = this.screen === "playing" && !this.hidden && !s.ended && !waiting;
    if (playing) {
      const n = s.stepper.advance(dt);
      for (let i = 0; i < n && !s.ended; i++) this.stepOnce(s, this.input.read());
      this.updateCoach(s);
      this.heartbeat(s, now);
      this.probe(s, dt);
      if (s.sim.state.tick % 15 === 0) this.discover(nearbyPassive(s.sim.state));
    }
    if (this.hidden) return;
    s.cam.lead = this.leadPoint(s);
    s.renderer.sync(s.sim.state, playing ? s.stepper.alpha : 0, s.cam);
    this.updateHud(s);
    this.hud.tick(Math.min(0.1, dt / 1000));
    if (this.settings.debug) this.updateDebug(s);
  };

  /** Frame the whole base: the bounding box of everything placed, as the turned camera sees it, fit to the stage. */
  private startOverview(s: Session): void {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
    const add = (p: readonly number[]) => {
      x0 = Math.min(x0, p[0]!); y0 = Math.min(y0, p[1]!); x1 = Math.max(x1, p[0]!); y1 = Math.max(y1, p[1]!);
      const q = worldToScreenPlane(p[0]!, p[1]!);
      sx0 = Math.min(sx0, q.x); sy0 = Math.min(sy0, q.y); sx1 = Math.max(sx1, q.x); sy1 = Math.max(sy1, q.y);
    };
    add(s.manifest.start);
    for (const e of s.manifest.entities as unknown as { at?: number[]; points?: number[][]; rect?: number[] }[]) {
      if (e.at) add(e.at);
      for (const q of e.points ?? []) add(q);
      if (e.rect) { add(e.rect); add([e.rect[0]! + e.rect[2]!, e.rect[1]! + e.rect[3]!]); }
    }
    const pad = 50, r = this.el.stage.getBoundingClientRect();
    const bw = sx1 - sx0 + 2 * pad, bh = sy1 - sy0 + 2 * pad;
    const aspect = r.width > 0 ? r.height / r.width : 2;
    const zoom = Math.min(1, VIEW_W / bw, (VIEW_W * aspect) / bh);
    if (zoom >= 0.95) return;
    s.overview = { k: 1, go: false, x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom };
    s.cam.follow = false;
    this.el.tapstart.textContent = uiText(this.skin, "tapToStart");
    this.el.tapstart.hidden = false;
  }

  /** Drive the overview camera; true while play has not started. */
  private stepOverview(s: Session, dt: number): boolean {
    const o = s.overview;
    if (!o) return false;
    if (o.go) o.k = Math.max(0, o.k - dt / OVERVIEW_ZOOM_S);
    const e = o.k * o.k * (3 - 2 * o.k);
    const p = s.sim.state.player.pos;
    s.cam.zoom = 1 + (o.zoom - 1) * e;
    s.cam.x = p.x / FP + (o.x - p.x / FP) * e;
    s.cam.y = p.y / FP + (o.y - p.y / FP) * e;
    if (o.k <= 0) { s.overview = null; s.cam.zoom = 1; s.cam.follow = true; }
    return !o.go;
  }

  /**
   * Where the camera leans: the nearest open pad within reach, so pads on the map edge come
   * fully on screen as the hero walks toward them (both renderers weigh it the same).
   */
  private leadPoint(s: Session): { x: number; y: number } | null {
    const st = s.sim.state, p = st.player.pos;
    let best: { x: number; y: number } | null = null, bd = (LEAD_RANGE * FP) ** 2;
    for (const pad of st.pads) {
      if (pad.done || !pad.visible) continue;
      const d = (pad.pos.x - p.x) ** 2 + (pad.pos.y - p.y) ** 2;
      if (d < bd) { bd = d; best = { x: pad.pos.x / FP, y: pad.pos.y / FP }; }
    }
    return best;
  }

  /** Load the guide (and with it the bot controller chunk) only where arrows will show. */
  private startGuide(s: Session): void {
    s.guideOn = s.meta.index < GUIDE_LEVELS || this.settings.guide;
    if (!s.guideOn || s.guide) return;
    void Guide.create(s.manifest, s.sim.compiled).then((g) => { if (this.session === s) s.guide = g; });
  }

  private updateCoach(s: Session): void {
    const mark = s.coach.update(s.sim.state, s.sim.compiled);
    s.guideTarget = s.guideOn && s.guide && !s.ended ? s.guide.update(s.sim.state, this.skin) : null;
    s.renderer.setGuide(s.guideTarget);
    if (!mark) { s.renderer.setCoach(null); return; }
    const at = toWorld(mark.at), g = s.guideTarget;
    // the guide arrow already points here: its line speaks for the coach mark
    if (g && (g.at.x - at.x) ** 2 + (g.at.y - at.y) ** 2 < 50 * 50) { s.renderer.setCoach(null); return; }
    s.renderer.setCoach({ key: mark.id, at, text: this.skin.text.coach?.[mark.id] ?? mark.id });
  }

  /** Low lifeline: a soft double-thump in sound and haptics, in time with the vignette. */
  private heartbeat(s: Session, now: number): void {
    const st = s.sim.state;
    const k = st.meters.lifeline / METER_MAX;
    if (k >= 0.35 && st.core.fuel > 0) return;
    if (now < this.beatAt) return;
    this.beatAt = now + 1100;
    this.synth.play("beat");
    this.haptics.pulse([18, 90, 12]);
  }

  private handleEvent(s: Session, e: SimEvent): void {
    s.renderer.onEvent(e);
    this.haptics.play(e);
    this.synth.playEvent(e, this.skin);
    if (s.coach.onEvent(e, s.sim.compiled).length) this.saveProgressSoon();
    const touched = touchedBy(e, s.sim.state);
    if (touched.length) this.discover(touched);
    if (e.t === "hit" && e.target === "base") this.hud.hit("baseHealth");
    if (e.t === "wave_cleared") s.wavesCleared++;
    if (e.t === "objective") this.objectiveEvent(s, e);
    if (e.t === "level_end") this.finish(e.won, e.reason);
  }

  /** A star objective became done or failed: flash its chip and chime (the level-end settle stays quiet). */
  private objectiveEvent(s: Session, e: { id: string; done: boolean; failed: boolean }): void {
    if (s.sim.state.over) return;
    this.hudKey = ""; // repaint the strip now
    const idx = s.sim.state.objectives.findIndex((o) => o.id === e.id);
    this.synth.play(e.done ? "star" : "miss");
    setTimeout(() => {
      const el = this.el.objectives.querySelector<HTMLElement>(`[data-id="${CSS.escape(e.id)}"]`);
      el?.classList.remove("flash"); void el?.offsetWidth; el?.classList.add("flash");
    }, 0);
    if (idx > 0) {
      const v = liveObjectives(s.sim.state, s.manifest, this.skin)[idx];
      if (v) this.starToast(e.done ? uiText(this.skin, "starEarned") : uiText(this.skin, "starMissed"), v.label);
    }
  }

  private starToast(title: string, line: string): void {
    const t = this.el.ftoast;
    t.innerHTML = `<b>${esc(title)}</b><span>${esc(line)}</span>`;
    t.hidden = false;
    t.classList.remove("in");
    void t.offsetWidth;
    t.classList.add("in");
    if (this.ftoastTimer) clearTimeout(this.ftoastTimer);
    this.ftoastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  private updateHud(s: Session): void {
    const model = hudModel(s.sim.state, s.manifest, s.sim.compiled, this.skin);
    const key = model.goal + JSON.stringify(model.chips) + JSON.stringify(model.objectives);
    if (key === this.hudKey) return;
    this.hudKey = key;
    if (this.el.goal.textContent !== model.goal) this.el.goal.textContent = model.goal;
    this.hud.render(model);
    // objective strip under the goal line: only when the sim reports objectives
    const ob = this.el.objectives;
    ob.hidden = model.objectives.length === 0;
    ob.innerHTML = model.objectives.map((o) => `<span class="obj${o.done ? " done" : ""}${o.failed ? " failed" : ""}" data-id="${esc(o.id)}">${esc(o.label)}${o.counter ? `<span class="cnt">${esc(o.counter)}</span>` : ""}</span>`).join("");
  }

  /** Where coins fly: the currency chip, in stage px (both renderers use this). */
  private coinTarget(): { x: number; y: number } {
    const chip = this.hud.anchor("currency");
    const st = this.el.stage.getBoundingClientRect();
    if (!chip) return { x: 30, y: -20 };
    const r = chip.getBoundingClientRect();
    return { x: r.left + 14 - st.left, y: r.top + r.height / 2 - st.top };
  }

  private updateDebug(s: Session): void {
    const st = s.sim.state;
    if (st.tick - this.hashCache.tick >= 30 || st.tick < this.hashCache.tick) this.hashCache = { tick: st.tick, hash: s.sim.hash().slice(0, 12) };
    const mods = s.manifest.modules.map((m) => `<span class="${IMPLEMENTED_MODULES.has(m) ? "on" : "off"}">${esc(nameOf(this.skin, `module.${m}`))}</span>`).join(" ");
    const rfps = s.renderer.fps();
    this.el.debug.innerHTML = `${Math.round(this.fps)} fps (3D ${rfps}) · ${this.qualityTier()} · tick ${st.tick} · drop ${s.stepper.dropped}<br>hash ${this.hashCache.hash}<br>${esc(s.meta.id)} · ${mods}`;
  }
}

/** Field guide order: resources, sources, sinks and converters, buildings, people, threats. */
const GUIDE_ORDER = ["res", "node", "sink", "conv", "pad", "struct", "store", "barrier", "zone", "capture", "role", "unit", "hostile"];
const guideOrder = (id: string): number => { const i = GUIDE_ORDER.indexOf(id.split(".")[0]!); return i < 0 ? 99 : i; };
const guideColor = (s: Skin, id: string): string => s.palette.res[id] ?? s.palette.role[id] ?? (id.startsWith("hostile.") ? s.palette.danger : id.startsWith("struct.") || id.startsWith("sink.") ? s.palette.accent : s.palette.interactive);

const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const TEMPLATE = `
<div class="app nohud">
  <header class="hud">
    <div class="hrow">
      <div class="goal"><div class="lbl" id="lvlName"></div><div class="txt" id="goalTxt"></div><div class="objectives" id="objectives" hidden></div></div>
      <button class="gearBtn" id="gearBtn" aria-label="Settings"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg></button>
      <button class="menuBtn" id="menuBtn" aria-label="Levels">Levels</button>
      <button class="menuBtn" id="retryBtn" aria-label="Retry">Retry</button>
    </div>
    <div class="chips" id="chips"></div>
  </header>
  <main class="stage" id="stage">
    <div class="world" id="world"></div>
    <div class="overlay" id="ov-title" hidden></div>
    <div class="overlay" id="ov-levels" hidden></div>
    <div class="overlay" id="ov-intro" hidden></div>
    <div class="overlay" id="ov-result" hidden></div>
    <div class="overlay" id="ov-settings" hidden></div>
    <div class="overlay" id="ov-error" hidden></div>
    <div class="overlay" id="ov-unsupported" hidden></div>
    <div class="tapstart" id="tapstart" hidden></div>
    <div class="ftoast" id="ftoast" hidden></div>
    <div class="inspect" id="inspect" hidden></div>
    <div class="loading" id="loading" hidden></div>
    <div class="toast" id="toast" hidden></div>
    <div class="debug" id="debug" hidden></div>
  </main>
  <div class="rotate"><div class="phone"></div><p>Rotate your phone</p></div>
</div>`;
