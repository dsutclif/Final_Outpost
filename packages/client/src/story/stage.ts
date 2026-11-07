import type { State } from "@fo/sim";
import { FP, TPS } from "@fo/sim";
import type { StoryPresentation, TallySlots } from "@fo/render-3d";
import type { SkinStory } from "@fo/skins";
import type { StoryDirector, StoryWorld } from "./director.js";

// Carries director.world to the renderer's story() each frame. The director only replaces values, so a
// change is spotted by identity. A level that never asks for a thing leaves the renderer's default alone.

const PULSE_S = 0.8;
// the tally floats above the hero's head and any carried stack (world units; the hero is drawn at charScale),
// its slots sized to read at the play zoom
const TALLY_Y = 48;
const TALLY_PER_ITEM = 8;
const TALLY_SCALE = 1.8;
// a speaker's head over their feet on screen, at the play zoom
const HEAD_PX = 72;

export class StoryStage {
  private seen: Partial<StoryWorld> = {};
  private lightFrom = 0;
  private lightNow = 0;
  private lightSet = false;
  private spiritOn = false;
  private spiritShown = "";
  private pulseUntil = 0;
  private flashSeq = 0;
  private spiritSeq = 0;
  private followFrom = 0;
  private readonly podFull = new Map<number, number>();
  private podShown = new Set<number>();
  private tallyOn = false;
  private readonly glowEl: HTMLElement;
  private readonly arrowEl: HTMLElement;
  private readonly ridgeEl: HTMLElement;

  constructor(
    private readonly story: SkinStory,
    private readonly director: StoryDirector,
    private readonly present: StoryPresentation,
    private readonly toScreen: (p: { x: number; y: number }) => { x: number; y: number },
    shell: HTMLElement,
    glowColor: string,
    ridgeColor: string,
  ) {
    present.solid(director.solid);
    this.glowEl = shell.ownerDocument.createElement("div");
    this.glowEl.className = "story-glow";
    this.glowEl.hidden = true;
    this.glowEl.style.setProperty("--story-glow", glowColor);
    this.ridgeEl = shell.ownerDocument.createElement("div");
    this.ridgeEl.className = "story-ridge";
    this.ridgeEl.hidden = true;
    this.ridgeEl.style.setProperty("--story-ridge", ridgeColor);
    this.arrowEl = shell.ownerDocument.createElement("div");
    this.arrowEl.className = "story-arrow";
    this.arrowEl.hidden = true;
    (shell.querySelector(".story-layer") ?? shell).prepend(this.glowEl, this.ridgeEl, this.arrowEl);
  }

  /** `now` seconds on any steady clock; `fuelK` the reactor's fill, 0..1. */
  frame(st: State, fuelK: number, now: number, viewW: number, viewH: number): void {
    const w = this.director.world, p = this.present, seen = this.seen;
    if (w.light && w.light !== seen.light) {
      this.lightFrom = this.lightNow;
      seen.light = w.light;
    }
    if (w.light) {
      const to = this.story.lights?.[w.light.preset] ?? 0, ticks = w.light.seconds * TPS;
      const k = ticks > 0 ? Math.min(1, (st.tick - (w.light.atTick ?? 0)) / ticks) : 1;
      this.lightNow = this.lightFrom + (to - this.lightFrom) * Math.max(0, k);
      p.lighting(this.lightNow, !this.lightSet);
      this.lightSet = true;
    }
    if (w.dots !== (seen.dots ?? null)) {
      seen.dots = w.dots;
      if (w.dots) p.dots(w.dots.pts.map((q) => ({ x: q.x, z: q.y })), w.dots.period === undefined ? { together: true } : { period: w.dots.period, together: true });
      else p.dots(null);
    }
    if (w.ridge !== (seen.ridge ?? null)) {
      seen.ridge = w.ridge;
      p.ridgeSlow(w.ridge ? w.ridge.side : null, w.ridge?.period ?? 4, w.ridge?.k ?? 0);
    }
    if (w.flash && w.flash.seq !== this.flashSeq) {
      this.flashSeq = w.flash.seq;
      p.ridgeFlash(w.flash.n);
    }
    if (w.ghosts !== seen.ghosts) {
      seen.ghosts = w.ghosts;
      p.ghosts(w.ghosts.map((g) => ({ id: g.id, x: g.pos.x, z: g.pos.y, build: g.build, price: g.price })));
    }
    const rg = p.ridgeGlow;
    this.ridgeEl.hidden = !rg || rg.k < 0.01;
    if (rg) { this.ridgeEl.dataset["side"] = rg.side; this.ridgeEl.style.opacity = String(rg.k); }
    if (w.follow !== (seen.follow ?? null)) { seen.follow = w.follow; this.followFrom = now; }
    const f = w.follow;
    p.spirit.follow(f && now - this.followFrom >= (f.delay ?? 0) ? { right: f.right, up: f.up, lag: f.lag ?? 0.9, height: f.height ?? 40, size: f.size ?? 1, ...(f.glow !== undefined ? { glow: f.glow } : {}) } : null);
    this.spirit(w, fuelK, now);
    this.glow(w, st, now, viewW, viewH);
    for (const [id, model] of Object.entries(this.director.level.customerModels ?? {})) p.customerModel(Number(id), model);
    if (this.director.level.podLights) this.pods(st);
    if (this.director.level.tally) this.tally(st);
    if (w.actors !== seen.actors) {
      seen.actors = w.actors;
      for (const a of w.actors) {
        const key = this.director.castKey(a.who, st);
        if (key) p.actor(key, a.to ? { x: a.to.x, z: a.to.y } : null);
      }
    }
    this.speaker(w, st, viewW, viewH);
    this.director.view.frame?.(now);
  }

  /** Keep the line's bubble over the speaker's head: where the renderer draws them, else where the sim has them. */
  private speaker(w: StoryWorld, st: State, vw: number, vh: number): void {
    const view = this.director.view;
    if (!view.anchor) return;
    if (!w.talker) { view.anchor(null, vw, vh); return; }
    const key = this.director.castKey(w.talker, st);
    const drawn = key ? this.present.actorAt(key) : null;
    const at = drawn ? { x: drawn.x, y: drawn.z } : this.director.castAt(w.talker, st);
    if (!at) { view.anchor(null, vw, vh); return; }
    const q = this.toScreen(at);
    view.anchor({ x: q.x, y: q.y - HEAD_PX }, vw, vh);
  }

  private spirit(w: StoryWorld, fuelK: number, now: number): void {
    const sp = this.present.spirit;
    if (w.spirit && w.spirit.seq !== this.spiritSeq) {
      this.spiritSeq = w.spirit.seq;
      const s = w.spirit.state;
      if (s === "bloom") { sp.bloom(); this.spiritOn = true; this.spiritShown = "idle"; }
      else if (s === "pulse") this.pulseUntil = now + PULSE_S;
      else { this.spiritOn = s === "idle"; sp.setState(s); this.spiritShown = s; }
    }
    if (!this.spiritOn) return;
    sp.setStrength(fuelK);
    const want = now < this.pulseUntil ? "pulse" : w.speaking ? "speaking" : "idle";
    if (want !== this.spiritShown) { sp.setState(want); this.spiritShown = want; }
  }

  private glow(w: StoryWorld, st: State, now: number, vw: number, vh: number): void {
    const el = this.glowEl, arrow = this.arrowEl;
    arrow.hidden = true;
    if (!w.glow || vw <= 0) { el.hidden = true; return; }
    const q = this.toScreen(w.glow);
    const over = Math.max(-q.x, q.x - vw, -q.y, q.y - vh);
    // fully there while the place is off screen by a margin, gone once it is well in view
    const shown = Math.max(0, Math.min(1, (over + vw * 0.12) / (vw * 0.12)));
    if (shown <= 0) { el.hidden = true; return; }
    const hero = this.toScreen({ x: st.player.pos.x / FP, y: st.player.pos.y / FP });
    const dx = q.x - hero.x, dy = q.y - hero.y;
    const k = Math.min(dx > 0 ? (vw - hero.x) / dx : dx < 0 ? -hero.x / dx : Infinity, dy > 0 ? (vh - hero.y) / dy : dy < 0 ? -hero.y / dy : Infinity, 1);
    const period = w.dots?.period ?? 4;
    const beat = Math.max(0, Math.cos((now / period) * Math.PI * 2)) ** 3;
    el.hidden = false;
    el.style.left = `${hero.x + dx * k}px`;
    el.style.top = `${hero.y + dy * k}px`;
    const size = w.glow.size ?? 36;
    el.style.width = el.style.height = `${size}vmin`;
    el.style.margin = `${-size / 2}vmin 0 0 ${-size / 2}vmin`;
    el.style.opacity = String(shown * (w.glow.strength ?? 0.4) * (0.55 + 0.45 * beat));
    if (w.glow.arrow) {
      // the pointer sits a little inside the screen edge on the same ray, so the whole triangle shows
      const m = 34, ka = Math.min(dx > 0 ? (vw - m - hero.x) / dx : dx < 0 ? (m - hero.x) / dx : Infinity, dy > 0 ? (vh - m - hero.y) / dy : dy < 0 ? (m - hero.y) / dy : Infinity, 1);
      arrow.hidden = false;
      arrow.style.left = `${hero.x + dx * ka}px`;
      arrow.style.top = `${hero.y + dy * ka}px`;
      arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      arrow.style.opacity = String(Math.min(1, shown * 1.2) * (0.75 + 0.25 * beat));
    }
  }

  /**
   * Glow and beam per pod still waiting out on the sand, dimmed by the freeze timer against its first value.
   * A pod in tow drops its light (it would stand over the hero) and gets it back if the line drops it.
   */
  private pods(st: State): void {
    const lit = new Set<number>();
    for (const c of st.captures) {
      if (c.state === "hidden" || c.state === "releasing" || !c.type.startsWith("capture.recruit")) continue;
      const full = Math.max(this.podFull.get(c.id) ?? 0, c.freezeTicks);
      this.podFull.set(c.id, full);
      if (c.state === "towed") continue;
      lit.add(c.id);
      // a pod that never freezes stays at full glow; a freezing one keeps a floor so it never vanishes before it is lost
      const dim = full > 0 ? 0.25 + 0.75 * (c.freezeTicks / full) : 1;
      this.present.pod(`pod${c.id}`, c.pos.x / FP, c.pos.y / FP, c.decoy ? "old" : "crew", dim, this.director.level.podLights !== "glow");
    }
    for (const id of this.podShown) if (!lit.has(id)) this.present.pod(`pod${id}`, 0, 0, "crew", -1);
    this.podShown = lit;
  }

  /** Filled slots for the pods in tow, empty for the rest of the tow limit; off when no pod is left to tow. */
  private tally(st: State): void {
    const left = st.captures.some((c) => c.state === "idle" || c.state === "towed");
    if (!left) { if (this.tallyOn) { this.present.tally(0, 0, 0, null); this.tallyOn = false; } return; }
    const n = st.player.tow.length;
    const slots = [0, 1, 2].map((i) => (i < n ? "done" : "empty")) as unknown as TallySlots;
    this.present.tally(st.player.pos.x / FP, TALLY_Y + TALLY_PER_ITEM * st.player.stack.length, st.player.pos.y / FP, slots, TALLY_SCALE);
    this.tallyOn = true;
  }

  dispose(): void { this.glowEl.remove(); this.ridgeEl.remove(); }
}
