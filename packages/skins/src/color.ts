// WCAG relative luminance and contrast, used by the readability tests and the debug overlay.

export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a hex colour: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Minimum contrast between the ground and anything the player must find (ART-DIRECTION.md). */
export const MIN_INTERACTIVE_CONTRAST = 3;

/** Mix two hex colours; t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a), cb = parseHex(b);
  const out = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Hex colour with alpha as an rgba() string. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}
