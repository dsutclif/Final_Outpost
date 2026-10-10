import type { SimEvent } from "@fo/sim";
import type { Skin } from "@fo/skins";

// Haptics (navigator.vibrate, or the native haptics plugin via platform.ts) and a tiny WebAudio synth: short procedural blips per event,
// no audio files. Both sit behind settings and never throw.

/** Vibration length per event, in ms. Only events the player caused buzz. */
export function hapticMs(e: SimEvent): number {
  const x = e as unknown as Record<string, unknown> & { t: string };
  switch (x.t) {
    case "gathered":
    case "deposited":
      return x["by"] === undefined ? 4 : 0;
    case "sold": return 12;
    case "built":
    case "hired":
    case "unlocked": return 30;
    case "captured": return 25;
    case "hit": return x["target"] === "base" ? 35 : x["by"] === "player" ? 6 : 0;
    case "wave_started": return 40;
    case "barrier_built": return 20;
    case "barrier_broken": return 50;
    case "core_upgraded": return 40;
    case "released":
    case "recruit_arrived": return 18;
    case "level_end": return 60;
    default: return 0;
  }
}

const vibrate = (ms: number | number[]): void => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

export class Haptics {
  enabled = true;
  private last = 0;
  /** Where buzzes go: navigator.vibrate on the web, platform.haptic natively. */
  constructor(public sink: (ms: number | number[]) => void = vibrate) {}
  /** A vibration pattern (ms on/off), for the heartbeat. */
  pulse(pattern: number[]): void {
    if (!this.enabled) return;
    this.sink(pattern);
  }
  play(e: SimEvent): void {
    if (!this.enabled) return;
    const ms = hapticMs(e);
    if (!ms) return;
    const now = performance.now();
    if (now - this.last < 35 && ms < 20) return;
    this.last = now;
    this.sink(ms);
  }
}

type Note = [freq: number, start: number, dur: number];
interface Patch { wave: OscillatorType; notes: Note[]; gain: number; slide?: number; noise?: boolean }

const PATCHES: Record<string, Patch> = {
  tick: { wave: "square", notes: [[1320, 0, 0.03]], gain: 0.05 },
  tock: { wave: "triangle", notes: [[620, 0, 0.05]], gain: 0.09 },
  coin: { wave: "sine", notes: [[988, 0, 0.06], [1319, 0.06, 0.12]], gain: 0.12 },
  coins: { wave: "sine", notes: [[1047, 0, 0.05], [1319, 0.05, 0.05], [1568, 0.1, 0.1]], gain: 0.1 },
  build: { wave: "triangle", notes: [[330, 0, 0.18]], gain: 0.16, slide: 990 },
  rope: { wave: "sawtooth", notes: [[220, 0, 0.12]], gain: 0.06, slide: 440 },
  hit: { wave: "square", notes: [[180, 0, 0.06]], gain: 0.08, noise: true },
  alarm: { wave: "square", notes: [[620, 0, 0.14], [460, 0.16, 0.14], [620, 0.32, 0.14]], gain: 0.07 },
  fanfare: { wave: "triangle", notes: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.3]], gain: 0.14 },
  fail: { wave: "triangle", notes: [[392, 0, 0.18], [330, 0.18, 0.18], [262, 0.36, 0.35]], gain: 0.12 },
  soft: { wave: "sine", notes: [[660, 0, 0.05]], gain: 0.05 },
  beat: { wave: "sine", notes: [[70, 0, 0.09], [62, 0.22, 0.09]], gain: 0.22, slide: 40 },
  wall: { wave: "triangle", notes: [[260, 0, 0.08], [390, 0.06, 0.1]], gain: 0.1 },
  pop: { wave: "sine", notes: [[520, 0, 0.05], [780, 0.04, 0.07]], gain: 0.1 },
  boom: { wave: "sawtooth", notes: [[110, 0, 0.18]], gain: 0.12, slide: 50, noise: true },
  storm: { wave: "sawtooth", notes: [[140, 0, 0.5]], gain: 0.05, slide: 90, noise: true },
};

export class Synth {
  enabled = true;
  private ctx: AudioContext | null = null;
  private lastAt = new Map<string, number>();

  /** Browsers only start audio after a gesture; call this from one. */
  unlock(): void {
    if (this.ctx || typeof window === "undefined") return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try { this.ctx = new Ctor(); } catch { this.ctx = null; }
  }

  suspend(): void { void this.ctx?.suspend().catch(() => undefined); }
  resume(): void { void this.ctx?.resume().catch(() => undefined); }

  playEvent(e: SimEvent, skin: Skin): void {
    const x = e as unknown as Record<string, unknown> & { t: string };
    if ((x.t === "gathered" || x.t === "deposited") && x["by"] !== undefined) return;
    const key = x.t === "level_end" ? (x["won"] ? "level_end_win" : "level_end_lose") : x.t;
    const patch = skin.audio[key];
    if (patch) this.play(patch);
  }

  play(name: string): void {
    const ctx = this.ctx;
    const p = PATCHES[name];
    if (!this.enabled || !ctx || !p || ctx.state === "closed") return;
    const now = ctx.currentTime;
    const prev = this.lastAt.get(name) ?? -1;
    if (now - prev < 0.045) return; // a burst of the same event plays once
    this.lastAt.set(name, now);
    try {
      for (const [f, start, dur] of p.notes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = p.wave;
        osc.frequency.setValueAtTime(f, now + start);
        if (p.slide) osc.frequency.exponentialRampToValueAtTime(p.slide, now + start + dur);
        if (p.noise) osc.detune.setValueAtTime(Math.random() * 1200 - 600, now + start);
        g.gain.setValueAtTime(0.0001, now + start);
        g.gain.exponentialRampToValueAtTime(p.gain, now + start + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      }
    } catch { /* audio graph failures are never fatal */ }
  }
}
