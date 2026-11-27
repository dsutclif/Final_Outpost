import { content } from "@fo/content";
import { Brain, PROFILES, planBot } from "@fo/bots";
import { seedRng, TPS, type Input, type Sim } from "@fo/sim";

// Test-build controls for checking defend levels on the phone (outpost-ops#248): a game speed (1x/2x/4x)
// and "start at wave N", which plays the build-up with the reference bot until wave N starts and then
// hands the commander back to the player. Test builds only: the dev server and Vercel preview deploys.
// A release build (Vercel production) never shows either control.

/** Speeds the speed button cycles through. */
export const GAME_SPEEDS = [1, 2, 4] as const;

export function nextSpeed(s: number): number {
  const i = GAME_SPEEDS.indexOf(s as (typeof GAME_SPEEDS)[number]);
  return GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length]!;
}

/** True on the dev server and on non-production deploys (Vercel preview / development). */
export function testBuildOn(b: { dev: boolean; env: string | undefined }): boolean {
  return b.dev || (!!b.env && b.env !== "production");
}

/** This build's answer (vite.config.ts stamps __DEPLOY_ENV__ from VERCEL_ENV; undefined in tests). */
export const TEST_BUILD: boolean = testBuildOn({
  dev: !!import.meta.env?.DEV,
  env: typeof __DEPLOY_ENV__ === "string" ? __DEPLOY_ENV__ : undefined,
});

/** `?wave=N` in the page address: open every defend level at wave N. Null when absent or not a whole number from 1. */
export function startWaveParam(search: string): number | null {
  const v = new URLSearchParams(search).get("wave");
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 ? n : null;
}

/** The longest build-up the skip will play for (sim seconds), so a level the bot cannot get through never hangs. */
export const SKIP_LIMIT_S = 60 * 60;

/**
 * Play the level with the reference ("good") bot until wave `want` has started (asks past the last wave
 * go to the last), one `step` per tick, and stop on that tick. `step` runs the sim and whatever the caller
 * hangs on a tick (the app's event handling). Stops early if the level ends or after `maxTicks`.
 */
export function runToWave(sim: Sim, want: number, step: (input: Input) => void, maxTicks: number = SKIP_LIMIT_S * TPS): { reached: boolean; ticks: number; wave: number } {
  const cp = sim.compiled, st = sim.state;
  const wave = Math.min(want, cp.waves.length);
  if (wave < 1) return { reached: false, ticks: st.tick, wave: 0 };
  const brain = new Brain(cp, planBot(cp.manifest, content), PROFILES["good"]!, seedRng(1));
  for (let i = 0; i < maxTicks && st.waves.idx < wave && !st.over; i++) step(brain.tick(st));
  return { reached: st.waves.idx >= wave, ticks: st.tick, wave };
}
