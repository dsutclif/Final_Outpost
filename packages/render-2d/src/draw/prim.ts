// Canvas primitives shared by every draw routine. World units in, no fixed point here.

export type G = CanvasRenderingContext2D;

export const FONT = '"Baloo 2", "Nunito", "Arial Rounded MT Bold", ui-rounded, system-ui, sans-serif';
export const TAU = Math.PI * 2;

export function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function fillRR(g: G, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, lw = 2): void {
  rr(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

export function circle(g: G, x: number, y: number, r: number, fill: string, stroke?: string, lw = 2): void {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, TAU);
  g.fillStyle = fill;
  g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

export function ellipse(g: G, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  g.beginPath();
  g.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

/** Soft blob shadow under everything that stands on the ground. */
export function shadow(g: G, x: number, y: number, w: number, a = 0.22): void {
  ellipse(g, x, y, w, w * 0.36, `rgba(20,8,4,${a})`);
}

export function poly(g: G, pts: readonly number[], fill: string, stroke?: string, lw = 2): void {
  g.beginPath();
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

export function line(g: G, x1: number, y1: number, x2: number, y2: number, color: string, lw = 2, dash?: number[]): void {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = "round";
  if (dash) g.setLineDash(dash);
  g.stroke();
  if (dash) g.setLineDash([]);
}

/** Heavy rounded world text with an outline, the ad look. */
export function label(g: G, s: string, x: number, y: number, size: number, fill: string, outline: string | null = "rgba(33,24,26,.85)", align: CanvasTextAlign = "center"): void {
  g.font = `800 ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  if (outline) {
    g.lineJoin = "round";
    g.lineWidth = Math.max(2, size * 0.28);
    g.strokeStyle = outline;
    g.strokeText(s, x, y);
  }
  g.fillStyle = fill;
  g.fillText(s, x, y);
}

/** A thin progress bar with a track. */
export function bar(g: G, x: number, y: number, w: number, h: number, k: number, fill: string, track = "rgba(255,255,255,.55)"): void {
  fillRR(g, x, y, w, h, h / 2, track);
  const kk = clamp01(k);
  if (kk > 0) fillRR(g, x, y, Math.max(h, w * kk), h, h / 2, fill);
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Squash-and-stretch pop for a build: 0 -> 1.15 -> 1 over about 400 ms. Returns [sx, sy]. */
export function popScale(ageSec: number): [number, number] {
  if (ageSec >= 0.45) return [1, 1];
  const t = clamp01(ageSec / 0.45);
  const s = t < 0.6 ? easeOutBack(t / 0.6) * 1.15 : 1.15 - 0.15 * ((t - 0.6) / 0.4);
  const wob = Math.sin(t * Math.PI * 3) * 0.12 * (1 - t);
  return [Math.max(0.01, s * (1 + wob)), Math.max(0.01, s * (1 - wob))];
}

/** Deterministic hash noise for scatter, so the ground never shimmers between frames. */
export function hash01(n: number): number {
  let x = Math.imul(n | 0, 374761393);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}
