import { CONTENT_VERSION, type Manifest } from "@fo/content";
import { ENGINE_VERSION, IMPLEMENTED_MODULES, createSim, type Sim, type SimEvent } from "@fo/sim";
import { Renderer2D, createCamera, type Camera } from "@fo/render-2d";
import { getSkin, nameOf, uiText, type Skin } from "@fo/skins";
import { Haptics, Synth } from "./feedback.js";
import { chipsHtml, hudModel } from "./hud.js";
import { InputController } from "./input.js";
import type { LevelMeta, LevelSource } from "./levels.js";
import { FixedStepper } from "./loop.js";
import type { Progress, SaveStore, Settings } from "./save.js";
import type { TelemetryQueue } from "./telemetry.js";
import { formatTicks, levelText } from "./text.js";

// App shell: screens (title, level select, intro, play, result, settings), the game loop
// and the glue between sim, renderer, input, saves, telemetry and feedback.

type Screen = "title" | "levels" | "intro" | "playing" | "result" | "settings" | "error";

interface Session {
  meta: LevelMeta;
  manifest: Manifest;
  sim: Sim;
  renderer: Renderer2D;
  cam: Camera;
  stepper: FixedStepper;
  ended: boolean;
}

export interface AppDeps {
  source: LevelSource;
  store: SaveStore;
  telemetry: TelemetryQueue;
  /** Apply a waiting service-worker update; returns false if none is waiting. */
  applyUpdate?: () => boolean;
}

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

export class App {
  private skin: Skin = getSkin(null);
  private settings!: Settings;
  private progress!: Progress;
  private levels: LevelMeta[] = [];
  private screen: Screen = "title";
  private session: Session | null = null;
  private readonly input: InputController;
  private readonly haptics = new Haptics();
  private readonly synth = new Synth();
  private last = 0;
  private hidden = false;
  private hudKey = "";
  private fps = 60;
  private hashCache = { tick: -1, hash: "" };
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  updateReady = false;

  private readonly el: {
    app: HTMLElement; hud: HTMLElement; lvlName: HTMLElement; goal: HTMLElement; chips: HTMLElement; menuBtn: HTMLButtonElement;
    stage: HTMLElement; world: HTMLElement; debug: HTMLElement; ov: Record<string, HTMLElement>; rotate: HTMLElement;
  };

  constructor(root: HTMLElement, private readonly deps: AppDeps) {
    root.innerHTML = TEMPLATE;
    const ov: Record<string, HTMLElement> = {};
    for (const k of ["title", "levels", "intro", "result", "settings", "error"]) ov[k] = $(root, `#ov-${k}`);
    this.el = {
      app: $(root, ".app"), hud: $(root, ".hud"), lvlName: $(root, "#lvlName"), goal: $(root, "#goalTxt"), chips: $(root, "#chips"),
      menuBtn: $<HTMLButtonElement>(root, "#menuBtn"), stage: $(root, "#stage"), world: $(root, "#world"), debug: $(root, "#debug"), ov,
      rotate: $(root, ".rotate"),
    };
    this.input = new InputController(this.el.stage);
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
  }

  // ------------------------------------------------------------------ chrome

  private bindChrome(): void {
    const doc = this.el.app.ownerDocument;
    doc.addEventListener("pointerdown", () => this.synth.unlock(), { once: false, passive: true });
    doc.addEventListener("visibilitychange", () => {
      this.hidden = doc.visibilityState === "hidden";
      if (this.hidden) { this.input.release(); this.synth.suspend(); }
      else { this.last = performance.now(); this.session?.stepper.reset(); this.synth.resume(); }
    });
    this.el.menuBtn.addEventListener("click", () => this.quitToLevels());
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
    const meta = this.el.app.ownerDocument.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", this.skin.themeColor);
    this.el.menuBtn.textContent = uiText(this.skin, "levels");
    $(this.el.rotate, "p").textContent = uiText(this.skin, "rotate");
  }

  private applySettings(): void {
    this.haptics.enabled = this.settings.haptics;
    this.synth.enabled = this.settings.sound;
    this.el.debug.hidden = !this.settings.debug || !this.session;
  }

  private toggleDebug(): void {
    this.settings.debug = !this.settings.debug;
    this.applySettings();
    void this.deps.store.setSettings(this.settings);
  }

  // ------------------------------------------------------------------ screens

  private show(screen: Screen): void {
    this.screen = screen;
    for (const [k, el] of Object.entries(this.el.ov)) el.hidden = k !== screen;
    this.input.enabled = screen === "playing";
    if (screen !== "playing") this.input.release();
    this.el.debug.hidden = !this.settings.debug || !this.session;
    this.el.app.classList.toggle("nohud", !this.session || screen === "title" || screen === "levels" || screen === "settings");
    if ((screen === "title" || screen === "levels") && this.updateReady && this.deps.applyUpdate?.()) return;
    if (screen === "title") this.renderTitle();
    if (screen === "levels") this.renderLevels();
    if (screen === "settings") this.renderSettings();
  }

  private renderTitle(): void {
    const ov = this.el.ov["title"]!, s = this.skin;
    ov.innerHTML = `
      <div class="title-wrap">
        <div class="wordmark" aria-label="${esc(uiText(s, "wordmark"))}">
          <span class="wm-top">${esc(uiText(s, "wordmark").split(" ")[0] ?? "")}</span>
          <span class="wm-bot">${esc(uiText(s, "wordmark").split(" ").slice(1).join(" "))}</span>
        </div>
        <div class="skin-name">${esc(s.name)}</div>
        <p class="tagline">${esc(s.tagline)}</p>
        <div class="stack">
          <button class="go big" data-a="play">${esc(uiText(s, "play"))}</button>
          <div class="row"><button data-a="levels">${esc(uiText(s, "levels"))}</button><button data-a="settings">${esc(uiText(s, "settings"))}</button></div>
        </div>
        ${this.updateReady ? `<p class="note">${esc(uiText(s, "updateReady"))}</p>` : ""}
      </div>`;
    this.wire(ov, {
      play: () => { const m = this.nextLevel(); if (m) void this.openLevel(m); else this.show("levels"); },
      levels: () => this.show("levels"),
      settings: () => this.show("settings"),
    });
  }

  /** The saved current level, else the first one not cleared, else the first. */
  private nextLevel(): LevelMeta | undefined {
    const cur = this.levels.find((l) => l.id === this.progress.current && !this.progress.cleared[l.id]);
    return cur ?? this.levels.find((l) => !this.progress.cleared[l.id]) ?? this.levels[0];
  }

  private unlocked(meta: LevelMeta): boolean {
    if (meta.index === 0 || this.settings.debug) return true;
    const prev = this.levels[meta.index - 1];
    return !prev || !!this.progress.cleared[prev.id];
  }

  private renderLevels(): void {
    const ov = this.el.ov["levels"]!, s = this.skin;
    const tiles = this.levels.map((l) => {
      const cleared = !!this.progress.cleared[l.id];
      const open = this.unlocked(l);
      const best = this.progress.best[l.id];
      const t = levelText(this.stubManifest(l), s, l.index);
      // without skin text the title is just "Level N"; show the goal kind instead
      const own = !!l.text[s.id]?.title;
      const name = own ? t.title : nameOf(s, `goal.${l.goalType}`);
      return `<button class="lvtile${cleared ? " cleared" : ""}${open ? "" : " locked"}${l.id === this.nextLevel()?.id ? " next" : ""}" data-id="${esc(l.id)}" ${open ? "" : "disabled"}>
        <span class="num">${l.index + 1}</span>
        <span class="name">${esc(name)}</span>
        <span class="sub">${cleared ? `${esc(uiText(s, "cleared"))}${best ? ` · ${formatTicks(best)}` : ""}` : open ? "" : esc(uiText(s, "locked"))}</span>
      </button>`;
    }).join("");
    ov.innerHTML = `<div class="card wide">
      <div class="card-head"><h2>${esc(uiText(s, "levels"))}</h2><button data-a="back" class="small">${esc(uiText(s, "back"))}</button></div>
      <div class="lvgrid">${tiles || `<p>No levels found.</p>`}</div>
    </div>`;
    this.wire(ov, { back: () => this.show("title") });
    for (const b of ov.querySelectorAll<HTMLButtonElement>(".lvtile")) {
      b.addEventListener("click", () => { const m = this.levels.find((l) => l.id === b.dataset["id"]); if (m) void this.openLevel(m); });
    }
  }

  /** Level metadata is enough for titles; goals need the manifest, loaded on open. */
  private stubManifest(l: LevelMeta): Manifest {
    return { text: l.text, goal: { type: "currency", n: 1 }, entities: [] } as unknown as Manifest;
  }

  private renderSettings(): void {
    const ov = this.el.ov["settings"]!, s = this.skin, st = this.settings;
    const toggle = (k: "haptics" | "sound", label: string): string =>
      `<label class="set"><span>${esc(label)}</span><input type="checkbox" data-k="${k}" ${st[k] ? "checked" : ""}></label>`;
    ov.innerHTML = `<div class="card">
      <div class="card-head"><h2>${esc(uiText(s, "settings"))}</h2><button data-a="back" class="small">${esc(uiText(s, "back"))}</button></div>
      <label class="set"><span>${esc(uiText(s, "settingsRenderer"))}</span>
        <select data-k="renderer"><option value="2d" ${st.renderer === "2d" ? "selected" : ""}>2D</option><option value="3d" disabled>3D (coming)</option></select></label>
      ${toggle("haptics", uiText(s, "settingsHaptics"))}
      ${toggle("sound", uiText(s, "settingsSound"))}
      <label class="set"><span>${esc(uiText(s, "settingsQuality"))}</span>
        <select data-k="quality">${["auto", "low", "medium", "high"].map((q) => `<option value="${q}" ${st.quality === q ? "selected" : ""}>${q}</option>`).join("")}</select></label>
      <button data-a="export" class="wide-btn">${esc(uiText(s, "exportTelemetry"))}</button>
      <p class="note">v${ENGINE_VERSION} · content ${CONTENT_VERSION}${this.deps.store.persistent ? " · storage persistent" : ""}</p>
    </div>`;
    this.wire(ov, {
      back: () => this.show(this.session && !this.session.ended ? "intro" : "title"),
      export: () => { void this.deps.telemetry.exportFile(); },
    });
    for (const inp of ov.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-k]")) {
      inp.addEventListener("change", () => {
        const k = inp.dataset["k"] as keyof Settings;
        const val = inp instanceof HTMLInputElement && inp.type === "checkbox" ? inp.checked : inp.value;
        (this.settings as unknown as Record<string, unknown>)[k] = val;
        this.applySettings();
        void this.deps.store.setSettings(this.settings);
        if (k === "haptics" && val) this.haptics.play({ t: "built" } as SimEvent);
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
    const renderer = new Renderer2D();
    renderer.init(sim.compiled.manifest, this.skin, this.el.world);
    renderer.hudAnchor = () => this.coinTarget();
    renderer.onCoinLanded = () => this.pulseCurrency();
    this.session = { meta, manifest: sim.compiled.manifest, sim, renderer, cam: createCamera(), stepper: new FixedStepper(), ended: false };
    this.resize();
    this.progress.current = meta.id;
    void this.deps.store.setProgress(this.progress);
    const t = levelText(this.session.manifest, this.skin, meta.index);
    this.el.lvlName.textContent = `${uiText(this.skin, "levelWord")} ${meta.index + 1} · ${t.title}`;
    this.hudKey = "";
    this.renderIntro(t);
    this.show("intro");
  }

  private renderIntro(t: { title: string; goal: string; tips: string[] }): void {
    const ov = this.el.ov["intro"]!, s = this.skin, meta = this.session!.meta;
    ov.innerHTML = `<div class="card">
      <div class="lbl">${esc(uiText(s, "levelWord"))} ${meta.index + 1} / ${this.levels.length}</div>
      <h2>${esc(t.title)}</h2>
      <p class="goal-line"><b>${esc(uiText(s, "goal"))}:</b> ${esc(t.goal)}</p>
      <p class="lead">${esc(uiText(s, "introLead"))}</p>
      <ul>${t.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="how">${esc(uiText(s, "howTo"))}</p>
      <button class="go big" data-a="start">${esc(uiText(s, "start"))}</button>
      <div class="row"><button data-a="levels" class="small">${esc(uiText(s, "levels"))}</button><button data-a="settings" class="small">${esc(uiText(s, "settings"))}</button></div>
    </div>`;
    this.wire(ov, {
      start: () => { this.session!.stepper.reset(); this.last = performance.now(); this.show("playing"); },
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
    const id = s.meta.id, ticks = s.sim.state.tick;
    if (won) {
      this.progress.cleared[id] = true;
      const best = this.progress.best[id];
      if (best === undefined || ticks < best) this.progress.best[id] = ticks;
      const next = this.levels[s.meta.index + 1];
      if (next) this.progress.current = next.id;
    }
    void this.deps.store.setProgress(this.progress);
    void this.deps.telemetry.record(this.attempt(s, won ? "win" : "lose", reason, this.progress.quits[id] ?? 0));
    // let the confetti land before the card covers the stage
    this.resultTimer = setTimeout(() => { this.renderResult(won, reason, ticks); this.show("result"); }, won ? 1300 : 900);
  }

  private renderResult(won: boolean, reason: string, ticks: number): void {
    const ov = this.el.ov["result"]!, sk = this.skin, s = this.session!;
    const next = this.levels[s.meta.index + 1];
    const text = sk.text.reasons[won ? "goal" : reason] ?? sk.text.reasons["meter.lifeline"] ?? reason;
    const best = this.progress.best[s.meta.id];
    ov.innerHTML = `<div class="card center ${won ? "won" : "lost"}">
      <h2>${esc(uiText(sk, won ? "win" : "lose"))}</h2>
      <p>${esc(text)}</p>
      <p class="stat">${formatTicks(ticks)}${won && best !== undefined ? ` · ${esc(uiText(sk, "best"))} ${formatTicks(best)}` : ""}</p>
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
    for (let i = 0; i < ticks && !s.ended; i++) for (const e of s.sim.step(input)) this.handleEvent(s, e);
    s.renderer.sync(s.sim.state, 0, s.cam);
    this.updateHud(s);
    return s.sim.state.tick;
  }

  // ------------------------------------------------------------------ loop

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
      for (let i = 0; i < n && !s.ended; i++) {
        const events = s.sim.step(this.input.read());
        for (const e of events) this.handleEvent(s, e);
      }
    }
    s.renderer.sync(s.sim.state, playing ? s.stepper.alpha : 0, s.cam);
    this.updateHud(s);
    if (this.settings.debug) this.updateDebug(s);
  };

  private handleEvent(s: Session, e: SimEvent): void {
    s.renderer.onEvent(e);
    this.haptics.play(e);
    this.synth.playEvent(e, this.skin);
    if (e.t === "level_end") this.finish(e.won, e.reason);
  }

  private updateHud(s: Session): void {
    const model = hudModel(s.sim.state, s.manifest, s.sim.compiled, this.skin);
    const key = model.goal + JSON.stringify(model.chips);
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.el.goal.textContent = model.goal;
    this.el.chips.innerHTML = chipsHtml(model);
  }

  private coinTarget(): { x: number; y: number } {
    const chip = this.el.chips.querySelector('[data-k="currency"]');
    const st = this.el.stage.getBoundingClientRect();
    if (!chip) return { x: 30, y: -20 };
    const r = chip.getBoundingClientRect();
    return { x: r.left + 14 - st.left, y: r.top + r.height / 2 - st.top };
  }

  private pulseCurrency(): void {
    const chip = this.el.chips.querySelector<HTMLElement>('[data-k="currency"]');
    if (!chip) return;
    chip.classList.remove("pulse");
    void chip.offsetWidth;
    chip.classList.add("pulse");
  }

  private updateDebug(s: Session): void {
    const st = s.sim.state;
    if (st.tick - this.hashCache.tick >= 30 || st.tick < this.hashCache.tick) this.hashCache = { tick: st.tick, hash: s.sim.hash().slice(0, 12) };
    const mods = s.manifest.modules.map((m) => `<span class="${IMPLEMENTED_MODULES.has(m) ? "on" : "off"}">${esc(nameOf(this.skin, `module.${m}`))}</span>`).join(" ");
    this.el.debug.innerHTML = `${Math.round(this.fps)} fps · tick ${st.tick} · drop ${s.stepper.dropped}<br>hash ${this.hashCache.hash}<br>${esc(s.meta.id)} · ${mods}`;
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const TEMPLATE = `
<div class="app nohud">
  <header class="hud">
    <div class="hrow">
      <div class="goal"><div class="lbl" id="lvlName"></div><div class="txt" id="goalTxt"></div></div>
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
    <div class="debug" id="debug" hidden></div>
  </main>
  <div class="rotate"><div class="phone"></div><p>Rotate your phone</p></div>
</div>`;
