/** What a machine shows about its trays: pure, so a test can drive it without a renderer. */
export interface ConverterCue {
  /** Output tray full: the machine has stopped. */
  outputFull: boolean;
  /** Input tray full: this machine is the one holding the chain back. */
  inputFull: boolean;
  /** Red status light and its upgrade pad pulses. */
  red: boolean;
  /** The floating warning: "?" when unmanned (staffing is the first fix), else "!" when red. */
  warn: "!" | "?" | null;
}

export function converterCue(c: { out: number; outCap: number; inQ: number; inCap: number; manned: boolean }): ConverterCue {
  const outputFull = c.out >= c.outCap;
  const inputFull = c.inQ >= c.inCap;
  const red = outputFull || inputFull;
  const warn = !c.manned ? "?" : red ? "!" : null;
  return { outputFull, inputFull, red, warn };
}

/** Scale of an upgrade pad's ground decal while its machine's input is backed up; 1 when it is not. */
export function padPulse(active: boolean, t: number): number {
  return active ? 1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 5)) : 1;
}
