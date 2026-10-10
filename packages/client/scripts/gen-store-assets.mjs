// Store assets drawn procedurally from the launch skin (no external files): a 1024 x 1024 app
// icon (reactor core glowing inside a Mars greenhouse dome) and a 2732 x 2732 splash (the same
// art centred on the skin's UI background, the size Capacitor's iOS/Android splash expects).
// Colours are read from packages/skins/src/mars_greenhouse.ts as text (this is a plain .mjs).
// Writes packages/client/store/icon-1024.png and splash-2732.png.
//   node packages/client/scripts/gen-store-assets.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "store");
mkdirSync(out, { recursive: true });
const src = readFileSync(join(here, "..", "..", "skins", "src", "mars_greenhouse.ts"), "utf8");
const tok = (k, fb) => new RegExp(`\\b${k}:\\s*"(#[0-9a-fA-F]{6})"`).exec(src)?.[1] ?? fb;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => { const k = Math.min(1, Math.max(0, t)); return a.map((v, i) => v + (b[i] - v) * k); };
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const C = {
  sky: hex(tok("sky", "#f6caa0")), fog: hex(tok("fog", "#d9a47c")), ground: hex(tok("ground", "#8a4d2e")), groundDark: hex(tok("groundDark", "#723d24")),
  structure: hex(tok("structure", "#f3ece1")), structureDark: hex(tok("structureDark", "#c9bfb0")), accent: hex(tok("accent", "#ff9b3d")),
  interactive: hex(tok("interactive", "#4fd1ff")), glass: hex(tok("glass", "#9cf0d2")), bg: hex(tok("bg", "#3a2219")),
};
const WHITE = [255, 248, 230], DEEP = mix(C.groundDark, [0, 0, 0], 0.35);

/** The icon art in a unit square: x, y in [-0.5, 0.5], y down. */
function art(x, y) {
  const horizon = 0.12;
  // sky: haze to warm fog at the horizon, with a low sun
  let c = y < horizon ? mix(mix(C.sky, C.accent, 0.12), C.fog, smooth(-0.5, horizon, y)) : mix(C.ground, DEEP, smooth(horizon, 0.5, y));
  const sun = Math.hypot(x - 0.3, y + 0.22);
  if (y < horizon) c = mix(c, WHITE, 0.85 * (1 - smooth(0.04, 0.06, sun)) + 0.25 * (1 - smooth(0.06, 0.2, sun)));
  // far dunes along the horizon
  const dune = horizon - 0.035 - 0.02 * Math.sin(x * 9 + 1.3) - 0.012 * Math.sin(x * 23);
  if (y > dune && y < horizon + 0.01) c = mix(C.fog, C.ground, 0.55);
  // reactor glow pooled on the ground
  const gx = x / 0.46, gy = (y - 0.2) / 0.15, g = Math.hypot(gx, gy);
  if (y > horizon) c = mix(c, C.accent, 0.55 * (1 - smooth(0.2, 1.0, g)));
  // interactive ring on the ground (the heat radius)
  const ring = Math.abs(Math.hypot(x / 0.42, (y - 0.2) / 0.13) - 1);
  if (y > horizon - 0.02) c = mix(c, C.interactive, (1 - smooth(0.018, 0.04, ring)) * 0.95);
  // the dome: a half ellipse sitting on the ground line at y = 0.2
  const dx = x / 0.33, dy = (y - 0.2) / 0.36, d = Math.hypot(dx, dy);
  if (y <= 0.2 && d < 1.02) {
    const edge = 1 - smooth(0.985, 1.0, d);
    const lit = 1 - smooth(0.0, 0.9, Math.hypot(x + 0.08, y + 0.02) / 0.35);
    let dome = mix(mix(C.glass, C.groundDark, 0.45), C.glass, 0.35 + 0.4 * lit);
    // ribs: meridians and two latitude bands
    const ang = Math.atan2(-dy, dx);
    const rib = Math.min(...[0.6, 1.05, 1.57, 2.09, 2.54].map((a) => Math.abs(ang - a))) * d;
    const lat = Math.min(Math.abs(d - 0.55), Math.abs(d - 0.82));
    const frame = Math.max(1 - smooth(0.018, 0.03, rib), 1 - smooth(0.012, 0.022, lat), smooth(0.93, 0.97, d));
    dome = mix(dome, C.structure, frame * 0.95);
    // glass highlight
    const hl = Math.hypot((x + 0.14) / 0.07, (y + 0.02) / 0.12);
    dome = mix(dome, WHITE, 0.45 * (1 - smooth(0.6, 1, hl)) * (1 - frame));
    c = mix(c, dome, edge);
  }
  // reactor core inside the dome: plasma glow, housing, white-hot centre
  const r = Math.hypot(x, (y - 0.08) * 1.05);
  c = mix(c, C.accent, 0.85 * (1 - smooth(0.05, 0.27, r)));
  const house = Math.max(Math.abs(x) / 0.075, Math.abs(y - 0.15) / 0.05);
  c = mix(c, C.structure, 1 - smooth(0.96, 1.0, house));
  c = mix(c, mix(C.structureDark, C.groundDark, 0.3), (1 - smooth(0.96, 1.0, house)) * smooth(0.12, 0.2, y));
  c = mix(c, C.accent, 1 - smooth(0.075, 0.083, r));
  c = mix(c, WHITE, 1 - smooth(0.02, 0.05, r));
  // base plinth of the dome
  if (Math.abs(x) < 0.35 && y > 0.19 && y < 0.225) c = mix(c, mix(C.structureDark, C.groundDark, 0.25), 1 - smooth(0.33, 0.35, Math.abs(x)));
  return c;
}

/** Icon: the art fills the square (iOS masks the corners itself). */
const icon = (u, v) => art(u - 0.5, v - 0.5);

/** Splash: the art in a rounded tile at the centre of the UI background, with a warm halo. */
function splash(u, v) {
  const x = u - 0.5, y = v - 0.5, s = 0.3;
  const tile = Math.max(Math.abs(x), Math.abs(y)) / s;
  const corner = Math.hypot(Math.max(0, Math.abs(x) - s * 0.78), Math.max(0, Math.abs(y) - s * 0.78)) / (s * 0.22);
  let c = mix(C.bg, C.accent, 0.18 * (1 - smooth(0.0, 0.5, Math.hypot(x, y))));
  const inside = tile < 1 && corner < 1 ? 1 - smooth(0.97, 1, Math.max(corner, 0)) : 0;
  if (inside > 0) c = mix(c, art(x / (2 * s), y / (2 * s)), inside);
  return c;
}

function png(size, fn, ss) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let j = 0; j < size; j++) {
    raw[j * (size * 3 + 1)] = 0;
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let a = 0; a < ss; a++) for (let k = 0; k < ss; k++) {
        const p = fn((i + (a + 0.5) / ss) / size, (j + (k + 0.5) / ss) / size);
        r += p[0]; g += p[1]; b += p[2];
      }
      const o = j * (size * 3 + 1) + 1 + i * 3, n = ss * ss;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  // 8-bit RGB, no alpha: App Store icons must be opaque
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(join(out, "icon-1024.png"), png(1024, icon, 3));
writeFileSync(join(out, "splash-2732.png"), png(2732, splash, 1));
console.log(`store assets written to ${out}`);
