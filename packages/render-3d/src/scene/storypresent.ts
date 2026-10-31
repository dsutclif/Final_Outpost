import type { CameraBeat, RidgeSide, StoryPresentation, TallySlots } from "../contract.js";
import type { CoreSpirit } from "./corespirit.js";
import type { StoryLights } from "./storylights.js";

// The story director's face of the renderer: world-unit calls in, StoryLights and CoreSpirit calls
// out, with the pulse cap applied. Plan C ranks: 1 goal light, 2 pods, 3 lamps and windows, 4 ground
// dots, 5 cloud; at most two of them pulse at once, the lowest ranks win. The ridge always shows.
// Holds state and does no drawing of its own, so it runs in tests without a GL context.

const MAX_PULSES = 2;

export class StoryPresent implements StoryPresentation {
  private dotPts: readonly { x: number; z: number }[] | null = null;
  private dotOpts: { period?: number; lit?: boolean } = {};
  private readonly podDim = new Map<string, number>();
  private readonly lamps = new Map<string, { goal: boolean; k: number }>();
  private ridgeSide: RidgeSide | null = null;
  private ridgeK = 0;
  private target: number | null = null;
  private cur = 0;
  private snapNow = false;
  private beatReq: (CameraBeat & { until: number }) | null = null;
  private spiritState = "off";
  private now = 0;
  /** Ranks (1-5) allowed to pulse this frame; set by frame(). */
  allowed = new Set<number>([1, 2, 3, 4, 5]);

  constructor(private readonly lights: StoryLights, private readonly cloud: CoreSpirit) {}

  readonly spirit: StoryPresentation["spirit"] = {
    setState: (s) => { this.spiritState = s; this.cloud.setState(s); },
    setStrength: (k) => this.cloud.setStrength(k),
    bloom: () => { this.spiritState = "idle"; this.cloud.bloom(); },
  };

  dots(pts: readonly { x: number; z: number }[] | null, opts: { period?: number; lit?: boolean } = {}): void {
    this.dotPts = pts && pts.length ? pts : null;
    this.dotOpts = opts;
    if (!this.dotPts) this.lights.groundDots([], 0);
  }
  pod(id: string, x: number, z: number, kind: "old" | "crew", dim: number): void {
    if (dim < 0) this.podDim.delete(id); else this.podDim.set(id, dim);
    this.lights.pod(id, x, z, kind, dim);
  }
  light(id: string, x: number, y: number, z: number, kind: "lamp" | "goal", intensity: number, goalColor?: string): void {
    this.lights.light(id, x, y, z, kind, intensity, goalColor);
    this.lamps.set(id, { goal: kind === "goal", k: this.lamps.get(id)?.k ?? 1 });
  }
  lightLevel(id: string, k: number): void {
    const l = this.lamps.get(id);
    if (l) l.k = Math.max(0, Math.min(1, k));
  }
  flashLight(id: string, len = 1.2): void { this.lights.flashLight(id, this.now, len); }
  removeLight(id: string): void { this.lights.removeLight(id); this.lamps.delete(id); }
  tally(x: number, y: number, z: number, slots: TallySlots | null): void { this.lights.tally(x, y, z, slots); }
  ridge(side: RidgeSide | null, k = 1): void { this.ridgeSide = side; this.ridgeK = side ? k : 0; }
  lighting(progress: number | null, snap = false): void { this.target = progress === null ? null : Math.max(0, Math.min(1, progress)); this.snapNow = snap; }
  beat(b: Omit<CameraBeat, "seconds"> & { seconds?: number } | null): void {
    this.beatReq = b ? { ...b, seconds: b.seconds ?? 2, until: this.now + (b.seconds ?? 2) } : null;
  }

  /** The beat in force at time t (renderer clock), or null once it has run its seconds. */
  activeBeat(t: number): CameraBeat | null {
    if (this.beatReq && t >= this.beatReq.until) this.beatReq = null;
    return this.beatReq;
  }
  get beating(): boolean { return this.beatReq !== null; }
  /** Lighting progress wanted (null: story lighting off), eased toward by frame(). */
  get lightingNow(): number | null { return this.target === null ? null : this.cur; }
  /** The spirit's cloud is hidden this frame by the pulse cap. */
  get cloudSuppressed(): boolean { return !this.allowed.has(5) && (this.spiritState === "speaking" || this.spiritState === "pulse"); }

  /** Per frame: t seconds on the renderer clock, dt seconds since the last frame, and the camera view on the ground. */
  frame(t: number, dt: number, cx: number, cz: number, halfW: number, halfH: number): void {
    this.now = t;
    if (this.target !== null) this.cur = this.snapNow ? this.target : this.cur + (this.target - this.cur) * Math.min(1, dt * 1.5);
    this.snapNow = false;
    this.lights.setProgress(this.cur);
    // who wants to pulse: the lowest two ranks win, the rest are held still
    const want = new Set<number>();
    for (const l of this.lamps.values()) if (l.k > 0) want.add(l.goal ? 1 : 3);
    for (const d of this.podDim.values()) if (d > 0) want.add(2);
    if (this.dotPts && this.dotOpts.lit !== false) want.add(4);
    if (this.spiritState === "speaking" || this.spiritState === "pulse") want.add(5);
    const order = [...want].sort((a, b) => a - b).slice(0, MAX_PULSES);
    this.allowed = new Set(order);
    for (const r of [1, 2, 3, 4, 5]) if (!want.has(r)) this.allowed.add(r);
    for (const [id, l] of this.lamps) this.lights.lightLevel(id, this.allowed.has(l.goal ? 1 : 3) ? l.k : 0);
    if (this.dotPts) this.lights.groundDots(this.dotPts, t, { ...this.dotOpts, lit: this.dotOpts.lit !== false && this.allowed.has(4) });
    this.lights.update(t);
    this.lights.ridgePulse(this.ridgeSide ?? "right", this.ridgeSide ? this.ridgeK : 0, cx, cz, halfW, halfH);
  }
}

