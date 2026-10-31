import type { StoryCameraBeat } from "@fo/skins";

/** The part of the session camera a beat drives; the renderer treats `follow: false` as hands off. */
export interface BeatCamera { x: number; y: number; zoom: number; follow: boolean }

const smooth = (k: number): number => k * k * (3 - 2 * k);

/**
 * Plays one beat on the session camera: pan, hold, then back with `follow` on so the renderer's own
 * follow easing carries it home. No renderer change needed.
 */
export class CameraBeatPlayer {
  private t = 0;
  private readonly x0: number;
  private readonly y0: number;
  private readonly z0: number;
  private readonly tx: number;
  private readonly ty: number;
  private readonly z1: number;
  private readonly pan: number;
  private readonly hold: number;
  private readonly back: number;

  constructor(private readonly cam: BeatCamera, beat: StoryCameraBeat, to: { x: number; y: number }) {
    this.x0 = cam.x; this.y0 = cam.y; this.z0 = cam.zoom;
    const share = beat.share ?? 1;
    this.tx = cam.x + (to.x - cam.x) * share;
    this.ty = cam.y + (to.y - cam.y) * share;
    this.z1 = beat.zoom ?? cam.zoom;
    this.pan = Math.max(0.001, beat.pan ?? 0.8);
    this.hold = beat.hold ?? 1;
    this.back = Math.max(0.001, beat.back ?? 0.8);
    cam.follow = false;
  }

  /** Advance by `dt` seconds; true once the beat is over and the camera is following again. */
  step(dt: number): boolean {
    this.t += dt;
    const c = this.cam;
    if (this.t < this.pan + this.hold) {
      const e = smooth(Math.min(1, this.t / this.pan));
      c.x = this.x0 + (this.tx - this.x0) * e;
      c.y = this.y0 + (this.ty - this.y0) * e;
      c.zoom = this.z0 + (this.z1 - this.z0) * e;
      return false;
    }
    c.follow = true;
    const k = Math.min(1, (this.t - this.pan - this.hold) / this.back);
    c.zoom = this.z1 + (this.z0 - this.z1) * smooth(k);
    return k >= 1;
  }

  /** Give the camera back now. */
  stop(): void { this.cam.follow = true; this.cam.zoom = this.z0; }
}
