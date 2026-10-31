import type { State } from "@fo/sim";
import { FP, TPS } from "@fo/sim";
import type { StoryPresentation } from "@fo/render-3d";
import type { SkinStory } from "@fo/skins";
import type { StoryDirector, StoryWorld } from "./director.js";

// Carries director.world to the renderer's story() each frame. The director only replaces values, so a
// change is spotted by identity. A level that never asks for a thing leaves the renderer's default alone.

const PULSE_S = 0.8;

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
  private readonly glowEl: HTMLElement;
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
    this.glowEl = shell.ownerDocument.createElement("div");
    this.glowEl.className = "story-glow";
    this.glowEl.hidden = true;
    this.glowEl.style.setProperty("--story-glow", glowColor);
    this.ridgeEl = shell.ownerDocument.createElement("div");
    this.ridgeEl.className = "story-ridge";
    this.ridgeEl.hidden = true;
    this.ridgeEl.style.setProperty("--story-ridge", ridgeColor);
    (shell.querySelector(".story-layer") ?? shell).prepend(this.glowEl, this.ridgeEl);
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
    this.spirit(w, fuelK, now);
    this.glow(w, st, now, viewW, viewH);
    this.director.view.frame?.(now);
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
    const el = this.glowEl;
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
    el.style.opacity = String(shown * (0.5 + 0.4 * beat));
  }

  dispose(): void { this.glowEl.remove(); this.ridgeEl.remove(); }
}
