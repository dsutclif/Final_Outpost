// The pad ring fills in whole steps so every ring art is cached by a small key; the ground ring and the pin share them.
export const PAD_FILL_STEPS = 24;

/** Whole fill step (0..24) for a payment fraction. */
export const padFillStep = (fraction: number): number => Math.round(Math.max(0, Math.min(1, fraction)) * PAD_FILL_STEPS);

/** Cache key of the pin's fill arc: at most 24 arts per colour, never part of the pin art's own key. */
export const padPinFillKey = (step: number, color: string, locked: boolean): string => `pinfill|${step}|${color}|${locked}`;
