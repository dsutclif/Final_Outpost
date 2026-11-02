import { FP, TPS, type SimEvent, type State } from "@fo/sim";
import type { SkinStory, StoryAction, StoryCameraBeat, StoryCue, StoryGhost, StoryGoal, StoryHudPart, StoryLevel, StoryPlace, StoryTrigger } from "@fo/skins";
import { CameraBeatPlayer, type BeatCamera } from "./camera.js";

// Plays a level's story cues on top of the sim. It reads state and events and never writes to either:
// a freeze is only the frame loop not stepping, so bots, replays and stars are unaffected.

/** A goal as the HUD knows it (goalhud GoalToken); only these fields matter here. */
export interface StoryToken { id: string; state: "open" | "done" | "failed"; label: string }

export type StarSlot = "empty" | "earned" | "cracked";

export interface DialogueLine { name: string; text: string; portrait?: string | undefined; tag?: string | undefined; tap: boolean; style?: string | undefined }

/** The DOM side; view.ts implements it, tests fake it. */
export interface StoryView {
  line(l: DialogueLine): void;
  clearLine(): void;
  /** A tap on a line that is still typing out: show it whole and return true; false when nothing was typing. */
  finishLine?(): boolean;
  card(c: { text: string; sub?: string | undefined; day: boolean }): void;
  clearCard(): void;
  /** Where a tap anywhere goes, or null when nothing waits on one. */
  onTap(fn: (() => void) | null): void;
  prompt(p: { text: string; retry: string; other: string }, retry: () => void, other: () => void): void;
  clearPrompt(): void;
  hud(hidden: ReadonlySet<StoryHudPart>): void;
  goals(slots: readonly StarSlot[], current: string | null): void;
  /** Per frame, seconds on any clock: keeps a live portrait moving. */
  frame?(t: number): void;
  dispose(): void;
}

/** What the director needs from the client; app.ts supplies it. */
export interface StoryHost {
  /** The session camera. */
  cam: BeatCamera;
  /** Where an entity is, world units; null if the manifest has no such entity. */
  entityAt(id: string): { x: number; y: number } | null;
  /** Play a film or live scene; resolves when it ends. Unknown ids resolve at once. */
  film(id: string): Promise<void>;
  /** Restart the level. */
  retry(): void;
  /** A goal's turn came and it is settled: chime and toast. */
  goalSettled(label: string, done: boolean): void;
}

/** What the renderer's wiring reads each frame; the director only ever replaces these values. */
export interface StoryWorld {
  /** `atTick`: the sim tick it was asked for, so the change runs on sim time and a freeze holds it. */
  light: { preset: string; seconds: number; atTick?: number } | null;
  ghosts: readonly (StoryGhost & { pos: { x: number; y: number } })[];
  dots: { pts: readonly { x: number; y: number }[]; period?: number | undefined } | null;
  ridge: { side: "left" | "right" | "top" | "bottom"; period: number; k: number } | null;
  /** `seq` counts requests, so the same request twice still reads as new. */
  flash: { n: number; seq: number } | null;
  spirit: { state: "bloom" | "pulse" | "idle" | "fading" | "off"; seq: number } | null;
  glow: { x: number; y: number; size?: number; strength?: number } | null;
  /** The cloud floats beside the hero (see StoryAction spiritFollow); null: over the reactor. */
  follow: { right: number; up: number; lag?: number; delay?: number; height?: number; size?: number } | null;
  guideOff: boolean;
  /** A line by a spirit speaker is on screen. */
  speaking: boolean;
}

const isBeat = (a: StoryAction): boolean => "camera" in a || "film" in a || "card" in a || "day" in a || "freeze" in a || ("tap" in a && !("line" in a));
const isWorld = (a: StoryAction): boolean => "light" in a || "dots" in a || "dotsOff" in a || "ridge" in a || "ridgeFlash" in a || "spirit" in a || "spiritFollow" in a || "edgeGlow" in a || "guide" in a || "goal" in a || "ghost" in a || "ghostOff" in a;
const CARD_SECONDS = 3;
const GOAL_GAP_S = 0.7;
const TAP_GUARD_MS = 250;

/** Long enough to read: about 0.35 s a word, 2 s at least. */
export const lineSeconds = (text: string): number => Math.max(2, text.trim().split(/\s+/).length * 0.35);

type Active =
  | { k: "timed"; left: number; end: () => void; freezes: boolean }
  | { k: "wait"; freezes: boolean }
  | { k: "camera"; beat: CameraBeatPlayer; freezes: boolean };

export class StoryDirector {
  /** Lighting and ghosts, for the renderer's wiring to read. */
  world: StoryWorld;
  private tick = 0;
  private seq = 0;
  private nudge: CameraBeatPlayer | null = null;
  private started = false;
  private disposed = false;
  private readonly fired = new Set<StoryCue>();
  private readonly firedAt = new Map<string, number>();
  private readonly queue: StoryAction[] = [];
  private active: Active | null = null;
  private explicitFreeze = false;
  private readonly hidden: Set<StoryHudPart>;
  private held: (() => void) | null = null;
  private promptOpen = false;
  private over = false;
  // goals
  private turn = 0;
  private gap = 0;
  private readonly released = new Set<string>();
  private readonly settled: StarSlot[];
  private readonly asked = new Set<string>();
  private tokens: readonly StoryToken[] = [];
  private objectives: State["objectives"] = [];
  private paintKey = "";
  // the opening framing that matches a film's last frame, eased to the play zoom
  private zoomOpen: { from: number; seconds: number; hold: number; t: number; at: { x: number; y: number } | null; easing: number | null } | null = null;

  constructor(
    private readonly story: SkinStory,
    readonly level: StoryLevel,
    readonly view: StoryView,
    private readonly host: StoryHost,
    /** Played this level before: drop beats, keep lines. */
    private readonly replay: boolean,
    /** This run started at the level's `retryFrom`, so the cues of the walk there do not fire. */
    private readonly fromRetrySpot = false,
  ) {
    this.world = { light: null, ghosts: [], dots: null, ridge: null, flash: null, spirit: null, glow: null, follow: null, guideOff: !!level.noGuide, speaking: false };
    this.hidden = new Set(level.hide ?? []);
    this.settled = level.goals.map(() => "empty");
    if (level.openZoom && !replay && !fromRetrySpot) {
      this.zoomOpen = { from: level.openZoom.from, seconds: level.openZoom.seconds, hold: level.openZoom.hold ?? 8, t: 0, at: null, easing: null };
      host.cam.zoom = level.openZoom.from;
    }
    view.hud(this.hidden);
  }

  /** True while the sim must not step. */
  get frozen(): boolean {
    return this.promptOpen || this.explicitFreeze || !!this.active?.freezes;
  }

  /** A line, card, film or camera beat is on: coach hints and marks stay quiet so they never talk over the story. */
  get busy(): boolean {
    return this.frozen || !!this.active || this.queue.length > 0 || !!this.nudge;
  }

  /** The director runs the goals display, so app.ts leaves star toasts to it. */
  get ownsGoals(): boolean { return this.level.goals.length > 0; }

  /** A goal's own wording, where the level gives one, without the time left. */
  goalLabel(id: string): string | undefined {
    return this.level.goals.find((g) => g.id === id)?.label?.replace(/[:\s]*\{left\}/, "");
  }

  /** Entities the renderer keeps solid. */
  get solid(): readonly string[] { return this.level.solid ?? []; }

  /** Whether the goal cards and overview still play. */
  get keepsIntro(): boolean { return !!this.level.intro; }

  /** Cold core, not yet lit, on a level that asked for quiet. */
  calm(st: State): boolean {
    return !!this.level.calmUntilLit && st.stats.litTick === undefined;
  }

  /** The tokens alerts may look at: goals not yet shown must not raise alarms. */
  visibleTokens<T extends StoryToken>(tokens: readonly T[]): readonly T[] {
    if (!this.ownsGoals) return tokens;
    const cur = this.currentGoal();
    return tokens.filter((t) => t.id === cur?.id);
  }

  /** Ask for a camera beat from outside the cue data (renderer wiring, live scenes). Skipped on replays. */
  requestCamera(beat: StoryCameraBeat): void {
    if (this.replay) return;
    this.queue.push({ camera: beat });
    this.pump();
  }

  /** Call for every sim event, before the client acts on level_end. */
  onEvent(e: SimEvent, st: State): void {
    if (e.t === "objective") this.onObjective(e.id, e.done, e.failed, st);
    for (const c of this.level.cues) {
      if (!this.armed(c)) continue;
      const on = c.on;
      if ("event" in on) { if (on.event === e.t && matches(on.match, e)) this.fire(c, st); }
      else if ("goal" in on && e.t === "objective" && on.goal === e.id && (on.is === "done" ? e.done : e.failed)) this.fire(c, st);
    }
    if (e.t === "level_end") {
      this.over = true;
      const missed = this.level.goals.some((g) => g.tryAgain && st.objectives.find((o) => o.id === g.id)?.failed);
      if (!e.won && missed && !this.queue.some((a) => "tryAgain" in a) && !this.promptOpen) this.queue.push({ tryAgain: true });
    }
    this.pump();
  }

  /** Call after each sim step. */
  afterTick(st: State): void {
    const p = st.player.pos;
    this.tick = st.tick;
    for (const c of this.level.cues) {
      if (this.armed(c) && (this.timeReached(c.on, st) || this.playerNear(c.on, p.x / FP, p.y / FP))) this.fire(c, st);
    }
    this.pump();
  }

  /** Call each frame while the level is on screen, frozen or not. */
  update(dtMs: number, st: State): void {
    if (this.disposed) return;
    const dt = dtMs / 1000;
    this.tick = st.tick;
    this.objectives = st.objectives;
    if (this.nudge?.step(dt)) this.nudge = null;
    this.stepOpenZoom(dt, st);
    if (!this.started) {
      this.started = true;
      for (const c of this.level.cues) if ("start" in c.on && this.armed(c)) this.fire(c, st);
    }
    const a = this.active;
    if (a?.k === "timed") {
      a.left -= dt;
      if (a.left <= 0) { this.active = null; this.view.onTap(null); a.end(); }
    } else if (a?.k === "camera" && a.beat.step(dt)) this.active = null;
    this.pump();
    this.gap = Math.max(0, this.gap - dt);
    this.advanceGoals();
  }

  /** Hold the film's framing until the hero walks (or the hold runs out), then ease out to the play zoom. */
  private stepOpenZoom(dt: number, st: State): void {
    const z = this.zoomOpen;
    if (!z || this.active?.k === "camera" || this.nudge) return;
    const p = { x: st.player.pos.x / FP, y: st.player.pos.y / FP };
    z.at ??= p;
    if (z.easing === null) {
      if (!this.frozen) z.t += dt;
      if ((p.x - z.at.x) ** 2 + (p.y - z.at.y) ** 2 > 36 || z.t >= z.hold) z.easing = 0;
      else { this.host.cam.zoom = z.from; return; }
    }
    z.easing = Math.min(1, z.easing + dt / Math.max(0.01, z.seconds));
    const e = z.easing * z.easing * (3 - 2 * z.easing);
    this.host.cam.zoom = z.from + (1 - z.from) * e;
    if (z.easing >= 1) this.zoomOpen = null;
  }

  /** The HUD's tokens for this frame. */
  syncGoals(tokens: readonly StoryToken[]): void {
    this.tokens = tokens;
    if (!this.ownsGoals) return;
    if (this.over) {
      this.level.goals.forEach((g, i) => {
        const t = tokens.find((x) => x.id === g.id);
        if (t && t.state !== "open") this.settled[i] = t.state === "done" ? "earned" : "cracked";
      });
    }
    const cur = this.currentGoal();
    const label = this.over || !cur ? null : this.goalText(cur, tokens);
    const key = `${this.settled.join()}|${label}`;
    if (key !== this.paintKey) { this.paintKey = key; this.view.goals(this.settled, label); }
  }

  /**
   * The result screen waits for the queue (a last line, a card, the prompt). True: held, and `show`
   * runs when the queue is done. False: nothing to wait for.
   */
  holdResult(show: () => void): boolean {
    if (!this.active && !this.queue.length && !this.promptOpen) return false;
    this.held = show;
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.active?.k === "camera") this.active.beat.stop();
    this.nudge?.stop();
    this.active = null;
    this.queue.length = 0;
    this.view.onTap(null);
    this.view.dispose();
  }

  // ------------------------------------------------------------------ cues

  private armed(c: StoryCue): boolean { return (!!c.repeat || !this.fired.has(c)) && !(c.walk && this.fromRetrySpot); }

  private fire(c: StoryCue, st: State): void {
    this.fired.add(c);
    if (c.id) this.firedAt.set(c.id, st.tick);
    // light and world changes happen on their cue; only lines, beats and cards wait their turn
    for (const a of c.do) {
      if (isWorld(a)) this.start(a);
      else if (!this.replay || !isBeat(a)) this.queue.push(a);
    }
    this.pump();
  }

  private timeReached(on: StoryTrigger, st: State): boolean {
    if (!("ticks" in on)) return false;
    const base = on.after === undefined ? 0 : this.firedAt.get(on.after);
    return base !== undefined && st.tick - base >= on.ticks;
  }

  private playerNear(on: StoryTrigger, x: number, y: number): boolean {
    if (!("near" in on)) return false;
    const p = this.place(on.near);
    return !!p && (p.x - x) ** 2 + (p.y - y) ** 2 <= on.r * on.r;
  }

  private place(p: StoryPlace): { x: number; y: number } | null {
    return "at" in p ? { x: p.at[0], y: p.at[1] } : this.host.entityAt(p.entity);
  }

  // ------------------------------------------------------------------ the action queue

  private pump(): void {
    if (this.disposed) return;
    while (!this.active && !this.promptOpen && this.queue.length) this.start(this.queue.shift()!);
    if (this.active || this.promptOpen) return;
    this.explicitFreeze = false; // a forgotten { freeze: true } must not hang the level
    if (this.held) { const h = this.held; this.held = null; h(); }
  }

  private start(a: StoryAction): void {
    if ("line" in a) {
      const sp = a.who !== undefined ? this.story.speakers[a.who] : undefined;
      // every line pauses play until a tap (a line still typing completes first)
      this.view.line({ name: sp?.name ?? a.who ?? "", text: a.line, portrait: sp?.portrait, tap: true, style: sp?.dialogue });
      this.world = { ...this.world, speaking: !!sp?.spirit };
      this.waitTap(() => { this.view.clearLine(); this.world = { ...this.world, speaking: false }; });
    } else if ("crew" in a) {
      this.view.line({ name: this.story.speakers[a.who]?.name ?? a.who, text: a.crew, tag: a.tag, tap: true });
      this.waitTap(() => this.view.clearLine());
    } else if ("camera" in a) {
      const to = this.place(a.camera.to);
      // a nudge during play runs beside the lines; a beat that pauses play holds the queue
      if (to && a.camera.freeze === false) { this.nudge?.stop(); this.nudge = new CameraBeatPlayer(this.host.cam, a.camera, to); }
      else if (to) this.active = { k: "camera", beat: new CameraBeatPlayer(this.host.cam, a.camera, to), freezes: true };
    } else if ("freeze" in a) {
      this.explicitFreeze = a.freeze;
    } else if ("tap" in a) {
      this.waitTap(() => {});
    } else if ("light" in a) {
      this.world = { ...this.world, light: { preset: a.light, seconds: a.seconds ?? 0, atTick: this.tick } };
    } else if ("film" in a) {
      const waiting: Active = { k: "wait", freezes: true };
      this.active = waiting;
      void this.host.film(a.film).then(() => { if (this.active === waiting) { this.active = null; this.pump(); } });
    } else if ("goal" in a) {
      this.released.add(a.goal);
    } else if ("hide" in a) {
      for (const p of a.hide) this.hidden.add(p);
      this.view.hud(this.hidden);
    } else if ("show" in a) {
      for (const p of a.show) this.hidden.delete(p);
      this.view.hud(this.hidden);
    } else if ("card" in a) {
      this.showCard(a.card, a.sub, false, a.seconds);
    } else if ("day" in a) {
      this.showCard(a.day, a.sub, true, a.seconds);
    } else if ("ghost" in a) {
      const pos = this.place(a.ghost.at);
      if (pos) this.world = { ...this.world, ghosts: [...this.world.ghosts.filter((g) => g.id !== a.ghost.id), { ...a.ghost, pos }] };
    } else if ("ghostOff" in a) {
      this.world = { ...this.world, ghosts: this.world.ghosts.filter((g) => g.id !== a.ghostOff) };
    } else if ("tryAgain" in a) {
      this.openPrompt(a.text);
    } else if ("dots" in a) {
      const pts = a.dots.flatMap((p) => { const q = this.place(p); return q ? [q] : []; });
      this.world = { ...this.world, dots: { pts, period: a.period } };
    } else if ("dotsOff" in a) {
      this.world = { ...this.world, dots: null };
    } else if ("ridge" in a) {
      this.world = { ...this.world, ridge: { side: a.ridge, period: a.period ?? 4, k: a.k ?? 0.6 } };
    } else if ("ridgeFlash" in a) {
      this.world = { ...this.world, flash: { n: a.ridgeFlash, seq: ++this.seq } };
    } else if ("spirit" in a) {
      this.world = { ...this.world, spirit: { state: a.spirit, seq: ++this.seq } };
    } else if ("spiritFollow" in a) {
      this.world = { ...this.world, follow: a.spiritFollow || null };
    } else if ("edgeGlow" in a) {
      const g = a.edgeGlow ? this.place(a.edgeGlow) : null;
      this.world = { ...this.world, glow: g && a.edgeGlow ? { ...g, ...(a.edgeGlow.size !== undefined ? { size: a.edgeGlow.size } : {}), ...(a.edgeGlow.strength !== undefined ? { strength: a.edgeGlow.strength } : {}) } : null };
    } else if ("guide" in a) {
      this.world = { ...this.world, guideOff: !a.guide };
    }
  }

  private timed(seconds: number, end: () => void): void {
    this.active = { k: "timed", left: seconds, end, freezes: false };
  }

  private showCard(text: string, sub: string | undefined, day: boolean, seconds: number | undefined): void {
    this.view.card({ text, sub, day });
    const end = (): void => this.view.clearCard();
    const card: Active = { k: "timed", left: seconds ?? CARD_SECONDS, end, freezes: true };
    this.active = card;
    this.view.onTap(() => {
      if (this.active !== card) return;
      this.view.onTap(null);
      this.active = null;
      end();
      this.pump();
    });
  }

  private waitTap(end: () => void): void {
    const since = Date.now();
    this.active = { k: "wait", freezes: true };
    this.view.onTap(() => {
      if (Date.now() - since < TAP_GUARD_MS) return; // the finger that was already walking
      if (this.view.finishLine?.()) return; // a line still typing completes first
      this.view.onTap(null);
      this.active = null;
      end();
      this.pump();
    });
  }

  private openPrompt(text: string | undefined): void {
    const ui = this.story.ui;
    this.promptOpen = true;
    this.view.prompt(
      { text: text ?? ui.missed, retry: ui.tryAgain, other: this.over ? ui.seeResults : ui.keepPlaying },
      () => this.host.retry(),
      () => { this.promptOpen = false; this.view.clearPrompt(); this.pump(); },
    );
  }

  // ------------------------------------------------------------------ goals

  private onObjective(id: string, done: boolean, failed: boolean, st: State): void {
    // the level-end settle is handled on level_end, where the outcome is known
    if (done || !failed || st.over || this.asked.has(id)) return;
    if (!this.level.goals.find((g) => g.id === id)?.tryAgain) return;
    this.asked.add(id);
    this.queue.push({ tryAgain: true });
  }

  private goalText(g: StoryGoal, tokens: readonly StoryToken[]): string | null {
    if (!g.label) return tokens.find((t) => t.id === g.id)?.label ?? null;
    const o = this.objectives.find((x) => x.id === g.id);
    const left = Math.ceil(Math.max(0, (o?.target ?? 0) - (o?.progress ?? 0)) / TPS);
    return g.label.replace("{left}", `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
  }

  private currentGoal(): StoryGoal | null {
    const g = this.level.goals[this.turn];
    return g && (!g.hold || this.released.has(g.id)) ? g : null;
  }

  /**
   * The goal on show settles when the sim says so; after a short gap the next one appears. It does not wait
   * for a line: lines pause play, so the star lands at the moment (ignition) and the line follows.
   */
  private advanceGoals(): void {
    if (this.over || this.promptOpen || this.gap > 0) return;
    const g = this.currentGoal();
    const t = g && this.tokens.find((x) => x.id === g.id);
    if (!t || t.state === "open") return;
    this.settled[this.turn] = t.state === "done" ? "earned" : "cracked";
    this.turn++;
    this.gap = GOAL_GAP_S;
    this.host.goalSettled(this.goalLabel(t.id) ?? t.label, t.state === "done");
    this.syncGoals(this.tokens);
  }
}

function matches(match: Readonly<Record<string, string | number | boolean>> | undefined, e: SimEvent): boolean {
  const r = e as unknown as Record<string, unknown>;
  return Object.entries(match ?? {}).every(([k, v]) => r[k] === v);
}
