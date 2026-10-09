import { TPS } from "@fo/sim";

/** Milliseconds per sim tick at 30 ticks per second. */
export const TICK_MS = 1000 / TPS;

/**
 * Fixed-step accumulator. Each frame hands it the elapsed wall time and gets back how many
 * sim ticks to run, plus the render alpha between the last two ticks. It never runs more
 * than `maxCatchUp` ticks in one frame: anything beyond that is dropped, so a slow phone
 * or a long frame slows the game down instead of spiralling.
 */
export class FixedStepper {
  private acc = 0;
  /** Ticks dropped since the last reset (shown in the debug overlay). */
  dropped = 0;

  constructor(readonly tickMs: number = TICK_MS, readonly maxCatchUp: number = 5) {}

  advance(dtMs: number): number {
    if (!(dtMs > 0) || !Number.isFinite(dtMs)) return 0;
    this.acc += dtMs;
    let n = Math.floor(this.acc / this.tickMs);
    if (n > this.maxCatchUp) {
      this.dropped += n - this.maxCatchUp;
      n = this.maxCatchUp;
      // keep only the fractional part so alpha stays meaningful
      this.acc = this.acc % this.tickMs;
      return n;
    }
    this.acc -= n * this.tickMs;
    return n;
  }

  /** Fraction of a tick accumulated, in [0, 1). */
  get alpha(): number {
    return Math.min(0.999, Math.max(0, this.acc / this.tickMs));
  }

  reset(): void {
    this.acc = 0;
    this.dropped = 0;
  }
}
