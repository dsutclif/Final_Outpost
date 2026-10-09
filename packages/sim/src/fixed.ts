// Fixed-point arithmetic. Every position, distance and speed inside the sim is an
// integer in milli-units (1 world unit = 1000). JS integers are exact below 2^53,
// so as long as intermediate products stay under that (they do: the map is under
// 1e6 milli-units a side) every device computes the same result.

export const FP = 1000;
export const TPS = 30;

/** Lifeline meter range. Stored in parts per million so per-tick drains stay integers. */
export const METER_MAX = 1_000_000;

export interface Vec {
  x: number;
  y: number;
}

/** World units (decimal) to fixed point. Only for content and manifest loading. */
export const fp = (units: number): number => Math.round(units * FP);
/** Seconds (decimal) to whole ticks, never below one tick. */
export const ticks = (seconds: number): number => Math.max(1, Math.round(seconds * TPS));
/** Units per second to fixed-point units per tick. */
export const perTick = (unitsPerSec: number): number => Math.round((unitsPerSec * FP) / TPS);
/** A decimal ratio (0.4, 2.6) to a fixed-point ratio. */
export const ratio = (r: number): number => Math.round(r * FP);

/** Exact floor(a*b/c) for integers, with the float rounding corrected. */
export function mulDiv(a: number, b: number, c: number): number {
  const p = a * b;
  let q = Math.trunc(p / c);
  let r = p - q * c;
  // Correct toward floor so the result does not depend on float rounding of p/c.
  if (c > 0) {
    while (r < 0) { q--; r += c; }
    while (r >= c) { q++; r -= c; }
  } else {
    while (r > 0) { q--; r += c; }
    while (r <= c) { q++; r -= c; }
  }
  return q;
}

/** Exact integer square root (floor). Math.sqrt is correctly rounded, the loops make it exact. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

export const dist = (a: Vec, b: Vec): number => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return isqrt(dx * dx + dy * dy);
};

/** Strictly closer than r, without a square root. */
export const within = (a: Vec, b: Vec, r: number): boolean => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy < r * r;
};

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

/** Normalise a direction so its magnitude is at most FP. Zero stays zero. */
export function clampDir(dx: number, dy: number): Vec {
  dx = Math.trunc(dx); dy = Math.trunc(dy);
  const m = isqrt(dx * dx + dy * dy);
  if (m <= FP) return { x: dx, y: dy };
  return { x: mulDiv(dx, FP, m), y: mulDiv(dy, FP, m) };
}

/** Move a toward target by at most step; returns true when arrived (within arrive). */
export function moveToward(a: Vec, target: Vec, step: number, arrive: number): boolean {
  const dx = target.x - a.x, dy = target.y - a.y;
  const d = isqrt(dx * dx + dy * dy);
  if (d < arrive) return true;
  const s = d < step ? d : step;
  a.x += mulDiv(dx, s, d);
  a.y += mulDiv(dy, s, d);
  return false;
}
