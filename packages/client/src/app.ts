import { CONTENT_VERSION, type Manifest } from "@fo/content";
import { ENGINE_VERSION, FP, IMPLEMENTED_MODULES, METER_MAX, createSim, type Sim, type SimEvent } from "@fo/sim";
import { createCamera, type Camera } from "@fo/render-2d";
import { getSkin, levelTitle, nameOf, uiText, type Skin } from "@fo/skins";
import { Coach, toWorld } from "./coach.js";
import { Haptics, Synth } from "./feedback.js";
import { HudView, hudModel } from "./hud.js";
import { InputController } from "./input.js";
import { offlineReady, prefetchLevels, upcoming, type LevelMeta, type LevelSource } from "./levels.js";
import { FixedStepper } from "./loop.js";
import { webPlatform, type Platform } from "./platform.js";
import { chapters, isUnlocked, nextLevel, starText, starsFor, winMargin } from "./progress.js";
import { autoTier, benchmark3D, createRenderer, pickRenderer, warm3D, type GameRenderer, type RendererKind, type Tier } from "./render.js";
import { DEFAULT_PROGRESS, type Progress, type SaveStore, type Settings } from "./save.js";
import type { TelemetryQueue } from "./telemetry.js";
import { formatTicks, levelText } from "./text.js";
import { TitleBackdrop } from "./title.js";

// App shell: screens (title, level select, intro, play, result, settings), the game loop
// and the glue between sim, renderer, input, saves, telemetry and feedback.

type Screen = "title" | "levels" | "intro" | "playing" | "result" | "settings" | "error";

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
  /** Lowest lifeline over the attempt (the star margin on levels with no timer or hull). */
  lifeMin: number;
}

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
/** Levels to keep cached ahead of the player. */
const PREFETCH_AHEAD = 30;
/** Pads closer than this pull the camera toward them (world units). */
const LEAD_RANGE = 150;

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
  private beatAt = 0;
  private resetArmed = false;
  private settingsFrom: Screen = "title";
  private bench: Promise<void> | null = null;
  private swapping: Promise<void> | null = null;
  private offline = -1;
  updateReady = false;

  private readonly el: {
    app: HTMLElement; hud: HTMLElement; lvlName: HTMLElement; goal: HTMLElement; chips: HTMLElement; menuBtn: HTMLButtonElement; gearBtn: HTMLButtonElement;
    stage: HTMLElement; world: HTMLElement; debug: HTMLElement; ov: Record<string, HTMLElement>; rotate: HTMLElement; loading: HTMLElement; toast: HTMLElement;
  };

  constructor(root: HTMLElement, private readonly deps: AppDeps) {
    root.innerHTML = TEMPLATE;
    const ov: Record<string, HTMLElement> = {};
    for (const k of ["title", "levels", "intro", "result", "settings", "error"]) ov[k] = $(root, `#ov-${k}`);
    this.el = {
      app: $(root, ".app"), hud: $(root, ".hud"), lvlName: $(root, "#lvlName"), goal: $(root, "#goalTxt"), chips: $(root, "#chips"),
      menuBtn: $<HTMLButtonElement>(root, "#menuBtn"), gearBtn: $<HTMLButtonElement>(root, "#gearBtn"), stage: $(root, "#stage"), world: $(root, "#world"),
      debug: $(root, "#debug"), ov, rotate: $(root, ".rotate"), loading: $(root, "#loading"), toast: $(root, "#toast"),
    };
    this.platform = deps.platform ?? webPlatform();
    this.haptics = new Haptics((ms) => this.platform.haptic(ms));
    this.input = new InputController(this.el.stage);
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
    this.show("title");
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    if (this.deps.justUpdated) this.continueToast();
    if (!this.settings.rendererChosen) this.bench = this.runBenchmark();
    else if (this.settings.renderer === "3d") warm3D();
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
    this.el.gearBtn.addEventListener("click", () => { if (this.screen === "playing") this.show("settings"); });
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
    this.el.gearBtn.setAttribute("aria-label", uiText(this.skin, "settings"));
    $(this.el.rotate, "p").textContent = uiText(this.skin, "rotate");
    this.title?.setSkin(this.skin);
  }

  private applySettings(): void {
    this.haptics.enabled = this.settings.haptics;
    this.synth.enabled = this.settings.sound;
    this.el.debug.hidden = !this.settings.debug || !this.session;
    this.session?.renderer.setQuality(this.qualityTier());
  }

  /** Quality tier for the renderer; "auto" uses the 3D benchmark result, else the core count. */
  private qualityTier(): Tier {
    const q = this.settings.quality;
    if (q !== "auto") return q;
    const cores = (navigator as { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
    return autoTier(this.settings.renderer === "3d" ? this.settings.benchFps : null, cores);
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

  // ------------------------------------------------------------------ renderer choice

  /**
   * First launch: play the first level hidden behind the title in 3D for ~3 s and keep 3D when
   * it holds 40 fps (render.ts benchmark3D). No WebGL, a failed load or a slow device keep 2D.
   * A backgrounded page leaves the choice open until it is shown again.
   */
  private async runBenchmark(): Promise<void> {
    const first = this.levels[0];
    if (!first) return;
    await new Promise((r) => setTimeout(r, 350));
    let manifest: Manifest;
    try { manifest = await this.deps.source.load(first.id); } catch { return; }
    // only on the title (a level running in the same stage would skew the result)
    if (this.screen !== "title" && this.session) return;
    const res = await benchmark3D(manifest, this.skin, this.el.world);
    if (res.reason === "hidden") {
      // backgrounded: try again the next time the page is shown
      const doc = this.el.app.ownerDocument;
      const again = (): void => {
        if (doc.visibilityState !== "visible") return;
        doc.removeEventListener("visibilitychange", again);
        if (!this.settings.rendererChosen && !this.session) this.bench = this.runBenchmark();
      };
      doc.addEventListener("visibilitychange", again);
      return;
    }
    this.settings.renderer = pickRenderer(res);
    this.settings.benchFps = res.fps;
    this.settings.rendererChosen = true;
    void this.deps.store.setSettings(this.settings);
    if (this.screen === "settings") this.renderSettings();
  }

  /** A renderer of the chosen kind; falls back to 2D (and remembers it) when 3D cannot start. */
  private async makeRenderer(kind: RendererKind): Promise<GameRenderer> {
    if (kind === "2d") return createRenderer("2d", this.qualityTier());
    this.el.loading.textContent = uiText(this.skin, "rendererLoading");
    this.el.loading.hidden = false;
    try {
      return await createRenderer("3d", this.qualityTier());
    } catch {
      this.settings.renderer = "2d";
      this.settings.rendererChosen = true;
      void this.deps.store.setSettings(this.settings);
      this.toast(`<span>${esc(uiText(this.skin, "rendererFallback"))}</span>`, {}, 4000);
      return createRenderer("2d", this.qualityTier());
    } finally {
      this.el.loading.hidden = true;
    }
  }

  private attachRenderer(s: Session, r: GameRenderer): void {
    r.init(s.sim.compiled.manifest, this.skin, this.el.world);
    r.hudAnchor = () => this.coinTarget();
    r.onCoinLanded = () => this.hud.pulse("currency");
    r.setQuality(this.qualityTier());
    s.renderer = r;
    this.resize();
    r.snapCamera();
    this.updateCoach(s);
    r.sync(s.sim.state, 0, s.cam);
  }

  /** Switch 2D/3D live: the level keeps running state, only the view is rebuilt. */
  private async setRendererKind(kind: RendererKind): Promise<void> {
    this.settings.renderer = kind;
    this.settings.rendererChosen = true;
    void this.deps.store.setSettings(this.settings);
    const s = this.session;
    if (!s || s.renderer.kind === kind) return;
    const job = (async () => {
      const r = await this.makeRenderer(kind);
      if (this.session !== s) { r.dispose(); return; }
      s.renderer.dispose();
      this.attachRenderer(s, r);
    })();
    this.swapping = job;
    await job;
    if (this.swapping === job) this.swapping = null;
    if (this.screen === "settings") this.renderSettings();
  }

  // ------------------------------------------------------------------ offline levels

  /** When online, cache the next levels after the player's current one; refresh the count. */
  private async prefetch(): Promise<void> {
    const cur = nextLevel(this.levels, this.progress);
    if (typeof navigator === "undefined" || navigator.onLine !== false) await prefetchLevels(upcoming(this.levels, cur ? cur.index - 1 : -1, PREFETCH_AHEAD));
    this.offline = await offlineReady(this.levels);
    if (this.screen === "levels" || this.screen === "settings") this.paintOffline();
  }

  private offlineLine(): string {
    if (this.offline < 0) return "";
    const s = this.skin;
    const n = this.offline;
    return n > 0 ? uiText(s, "offlineReady", { n }) : uiText(s, "offlineNone");
  }

  private paintOffline(): void {
    for (const el of this.el.app.querySelectorAll<HTMLElement>("[data-offline]")) el.textContent = this.offlineLine();
  }

  // ------------------------------------------------------------------ screens

  private show(screen: Screen): void {
    const prev = this.screen;
    this.screen = screen;
    for (const [k, el] of Object.entries(this.el.ov)) el.hidden = k !== screen;
    this.input.enabled = screen === "playing";
    if (screen !== "playing") this.input.release();
    this.el.debug.hidden = !this.settings.debug || !this.session;
    this.el.app.classList.toggle("nohud", !this.session || screen === "title" || screen === "levels" || (screen === "settings" && prev !== "playing"));
    if ((screen === "title" || screen === "levels") && this.updateReady && this.deps.applyUpdate?.()) return;
    if (screen === "title") this.renderTitle();
    else this.title?.stop();
    if (screen === "levels") this.renderLevels();
    if (screen === "settings") { this.settingsFrom = prev === "settings" ? this.settingsFrom : prev; this.renderSettings(); warm3D(); }
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
      const stars = this.progress.stars[l.id] ?? 0;
      const sub = cleared
        ? `<span class="stars" aria-label="${esc(uiText(s, "stars", { n: stars || 1 }))}">${starText(stars || 1)}</span>${best !== undefined ? `<span class="t">${esc(formatTicks(best))}</span>` : ""}`
        : open ? esc(uiText(s, "notPlayed")) : `<span class="lock" aria-hidden="true"></span>${esc(uiText(s, "locked"))}`;
      return `<button class="lvtile${cleared ? " cleared" : ""}${open ? "" : " locked"}${l.id === next ? " next" : ""}" data-id="${esc(l.id)}" ${open ? "" : "disabled"}>
        <span class="num">${l.index + 1}</span>
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

  private renderSettings(): void {
    const ov = this.el.ov["settings"]!, s = this.skin, st = this.settings;
    this.resetArmed = false;
    const toggle = (k: "haptics" | "sound", label: string): string =>
      `<label class="set"><span>${esc(label)}</span><input type="checkbox" data-k="${k}" ${st[k] ? "checked" : ""}></label>`;
    const dev = import.meta.env.DEV;
    const kind = this.session?.renderer.kind ?? st.renderer;
    const busy = this.swapping !== null;
    ov.innerHTML = `<div class="card">
      <div class="card-head"><h2>${esc(uiText(s, "settings"))}</h2><button data-a="back" class="small">${esc(uiText(s, "back"))}</button></div>
      <label class="set"><span>${esc(uiText(s, "settingsRenderer"))}</span>
        <span class="seg" role="radiogroup">${(["2d", "3d"] as const).map((k) => `<button role="radio" aria-checked="${kind === k}" class="${kind === k ? "on" : ""}" data-r="${k}" ${busy ? "disabled" : ""}>${esc(uiText(s, `renderer${k}`))}</button>`).join("")}</span></label>
      ${busy ? `<p class="note">${esc(uiText(s, "rendererLoading"))}</p>` : ""}
      ${toggle("haptics", uiText(s, "settingsHaptics"))}
      ${toggle("sound", uiText(s, "settingsSound"))}
      <label class="set"><span>${esc(uiText(s, "settingsQuality"))}</span>
        <select data-k="quality">${(["auto", "low", "medium", "high"] as const).map((q) => `<option value="${q}" ${st.quality === q ? "selected" : ""}>${esc(uiText(s, `quality_${q}`))}</option>`).join("")}</select></label>
      <p class="note offline" data-offline>${esc(this.offlineLine())}</p>
      ${this.session && !this.session.ended ? "" : `<button data-a="export" class="wide-btn">${esc(uiText(s, "exportTelemetry"))}</button>
      <button data-a="reset" class="wide-btn danger">${esc(uiText(s, "resetProgress"))}</button>`}
      ${dev ? `<a class="wide-btn linkbtn" href="#lab">${esc(uiText(s, "lab"))}</a>` : ""}
      <p class="note">v${ENGINE_VERSION} · content ${CONTENT_VERSION}${this.deps.store.persistent ? " · storage persistent" : ""}${st.benchFps !== null ? ` · 3D bench ${st.benchFps} fps` : ""}</p>
    </div>`;
    const resetBtn = ov.querySelector<HTMLButtonElement>('[data-a="reset"]');
    this.wire(ov, {
      back: () => {
        const live = this.session && !this.session.ended;
        this.show(live ? (this.settingsFrom === "playing" ? "playing" : "intro") : "title");
      },
      export: () => { void this.deps.telemetry.exportFile(); },
      reset: () => {
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
    for (const b of ov.querySelectorAll<HTMLButtonElement>("[data-r]")) {
      b.addEventListener("click", (e) => { e.preventDefault(); void this.setRendererKind(b.dataset["r"] as RendererKind); });
    }
    for (const inp of ov.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-k]")) {
      inp.addEventListener("change", () => {
        const k = inp.dataset["k"] as keyof Settings;
        const val = inp instanceof HTMLInputElement && inp.type === "checkbox" ? inp.checked : inp.value;
        (this.settings as unknown as Record<string, unknown>)[k] = val;
        this.applySettings();
        void this.deps.store.setSettings(this.settings);
        if (k === "haptics" && val) this.haptics.play({ t: "built" } as SimEvent);
        if (k === "sound" && val) { this.synth.unlock(); this.synth.play("coin"); }
      });
    }
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
      sim = createSim(manifest);
    } catch (err) {
      this.showError(meta, err);
      return;
    }
    // the first-launch benchmark decides the renderer; wait for it (at most ~3 s)
    if (this.bench) { this.el.loading.textContent = uiText(this.skin, "rendererLoading"); this.el.loading.hidden = false; await this.bench; this.el.loading.hidden = true; this.bench = null; }
    const renderer = await this.makeRenderer(this.settings.renderer);
    const coach = new Coach(sim.compiled.manifest.modules, this.progress.coach, undefined, !!sim.compiled.gate);
    this.session = {
      meta, manifest: sim.compiled.manifest, sim, renderer, cam: createCamera(), stepper: new FixedStepper(), coach, ended: false,
      earned: 0, lastCurrency: sim.state.currency, wavesCleared: 0, lifeMin: sim.state.meters.lifeline,
    };
    this.attachRenderer(this.session, renderer);
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
    const stars = this.progress.stars[meta.id];
    ov.innerHTML = `<div class="card intro">
      <div class="lbl">${esc(uiText(s, "levelWord"))} ${meta.index + 1} / ${this.levels.length}${best !== undefined ? ` · ${esc(uiText(s, "best"))} ${formatTicks(best)}` : ""}${stars ? ` · <span class="stars">${starText(stars)}</span>` : ""}</div>
      <h2>${esc(t.title)}</h2>
      <p class="goal-line"><span class="goal-ic"></span><b>${esc(uiText(s, "goal"))}:</b> ${esc(t.goal)}</p>
      <p class="lead">${esc(uiText(s, "introLead"))}</p>
      <ul>${t.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${meta.index === 0 ? `<p class="how">${esc(uiText(s, "howTo"))}</p>` : ""}
      <button class="go big" data-a="start">${esc(uiText(s, "start"))}</button>
      <div class="row"><button data-a="levels" class="small">${esc(uiText(s, "levels"))}</button><button data-a="settings" class="small">${esc(uiText(s, "settings"))}</button></div>
    </div>`;
    this.wire(ov, {
      start: () => this.show("playing"),
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
      void this.deps.store.setProgress(this.progress);
      void this.deps.telemetry.record(this.attempt(s, "quit", "quit", quits - 1));
    }
    this.endSession();
    this.show("levels");
  }

  private endSession(): void {
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
    if (won) {
      this.progress.cleared[id] = true;
      if (prevBest === undefined || ticks < prevBest) this.progress.best[id] = ticks;
      stars = starsFor(winMargin(s.sim.state, s.sim.compiled, s.lifeMin));
      this.progress.stars[id] = Math.max(this.progress.stars[id] ?? 0, stars);
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
    const starRow = won ? `<div class="starrow" aria-label="${esc(uiText(sk, "stars", { n: stars }))}">${[1, 2, 3].map((i) => `<span class="star${i <= stars ? " on" : ""}" style="animation-delay:${0.2 + i * 0.18}s">★</span>`).join("")}</div>` : "";
    ov.innerHTML = `<div class="card center result ${won ? "won" : "lost"}">
      ${won ? starRow : `<div class="badge">!</div>`}
      <h2>${esc(uiText(sk, won ? "win" : "lose"))}</h2>
      <p>${esc(text)}</p>
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

  /** Dev hook: switch renderer (awaits the 3D chunk). */
  async debugRenderer(kind: RendererKind): Promise<string> {
    await this.setRendererKind(kind);
    return this.session?.renderer.kind ?? this.settings.renderer;
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
    const playing = this.screen === "playing" && !this.hidden && !s.ended;
    if (playing) {
      const n = s.stepper.advance(dt);
      for (let i = 0; i < n && !s.ended; i++) this.stepOnce(s, this.input.read());
      this.updateCoach(s);
      this.heartbeat(s, now);
    }
    if (this.hidden) return;
    s.cam.lead = this.leadPoint(s);
    s.renderer.sync(s.sim.state, playing ? s.stepper.alpha : 0, s.cam);
    this.updateHud(s);
    this.hud.tick(Math.min(0.1, dt / 1000));
    if (this.settings.debug) this.updateDebug(s);
  };

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

  private updateCoach(s: Session): void {
    const mark = s.coach.update(s.sim.state, s.sim.compiled);
    if (!mark) { s.renderer.setCoach(null); return; }
    s.renderer.setCoach({ key: mark.id, at: toWorld(mark.at), text: this.skin.text.coach?.[mark.id] ?? mark.id });
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
    if (e.t === "wave_cleared") s.wavesCleared++;
    if (e.t === "level_end") this.finish(e.won, e.reason);
  }

  private updateHud(s: Session): void {
    const model = hudModel(s.sim.state, s.manifest, s.sim.compiled, this.skin);
    const key = model.goal + JSON.stringify(model.chips);
    if (key === this.hudKey) return;
    this.hudKey = key;
    if (this.el.goal.textContent !== model.goal) this.el.goal.textContent = model.goal;
    this.hud.render(model);
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
    this.el.debug.innerHTML = `${Math.round(this.fps)} fps${rfps !== null ? ` (3D ${rfps})` : ""} · ${s.renderer.kind} · tick ${st.tick} · drop ${s.stepper.dropped}<br>hash ${this.hashCache.hash}<br>${esc(s.meta.id)} · ${mods}`;
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const TEMPLATE = `
<div class="app nohud">
  <header class="hud">
    <div class="hrow">
      <div class="goal"><div class="lbl" id="lvlName"></div><div class="txt" id="goalTxt"></div></div>
      <button class="gearBtn" id="gearBtn" aria-label="Settings"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg></button>
      <button class="menuBtn" id="menuBtn" aria-label="Levels">Levels</button>
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
    <div class="loading" id="loading" hidden></div>
    <div class="toast" id="toast" hidden></div>
    <div class="debug" id="debug" hidden></div>
  </main>
  <div class="rotate"><div class="phone"></div><p>Rotate your phone</p></div>
</div>`;
