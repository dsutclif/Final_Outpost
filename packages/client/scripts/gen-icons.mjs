// Generates the app icons (no external assets): a reactor core glowing on Mars ground.
// Writes public/icons/icon-192.png, icon-512.png, maskable-512.png and icon.svg.
// PNGs are rasterised per pixel with signed distances and encoded with node:zlib.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const SKY = hex("#e8a87a"), GROUND = hex("#8a4d2e"), DEEP = hex("#5e3020");
const SHELL = hex("#f3ece1"), TEAL = hex("#2bb3a3"), GLOW = hex("#ff9b3d"), CORE = hex("#fff6d8"), CYAN = hex("#4fd1ff");

function pixel(u, v, pad) {
  // u, v in [0,1]; pad shrinks the art for maskable safe zones
  const x = (u - 0.5) / (1 - pad), y = (v - 0.5) / (1 - pad);
  let c = v < 0.45 ? mix(SKY, GROUND, v / 0.45) : mix(GROUND, DEEP, (v - 0.45) / 0.55);
  const r = Math.hypot(x, y + 0.02);
  // warm glow
  c = mix(c, GLOW, 0.75 * (1 - smooth(0.05, 0.48, r)));
  // interactive ring
  const ring = Math.abs(r - 0.40);
  c = mix(c, CYAN, 1 - smooth(0.012, 0.022, ring));
  // housing
  c = mix(c, SHELL, 1 - smooth(0.285, 0.295, r));
  c = mix(c, TEAL, (1 - smooth(0.285, 0.295, r)) * (1 - smooth(0.02, 0.03, Math.abs(y - 0.13))));
  // plasma
  c = mix(c, GLOW, 1 - smooth(0.185, 0.195, r));
  c = mix(c, CORE, 1 - smooth(0.07, 0.11, r));
  return c;
}

function png(size, pad) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const ss = 2; // 2x2 supersampling
  for (let j = 0; j < size; j++) {
    raw[j * (size * 4 + 1)] = 0;
    for (let i = 0; i < size; i++) {
      let acc = [0, 0, 0];
      for (let a = 0; a < ss; a++) for (let b = 0; b < ss; b++) {
        const p = pixel((i + (a + 0.5) / ss) / size, (j + (b + 0.5) / ss) / size, pad);
        acc = acc.map((v, k) => v + p[k]);
      }
      const o = j * (size * 4 + 1) + 1 + i * 4;
      raw[o] = Math.round(acc[0] / (ss * ss));
      raw[o + 1] = Math.round(acc[1] / (ss * ss));
      raw[o + 2] = Math.round(acc[2] / (ss * ss));
      raw[o + 3] = 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(join(out, "icon-192.png"), png(192, 0.04));
writeFileSync(join(out, "icon-512.png"), png(512, 0.04));
writeFileSync(join(out, "maskable-512.png"), png(512, 0.22));
writeFileSync(join(out, "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8a87a"/><stop offset=".45" stop-color="#8a4d2e"/><stop offset="1" stop-color="#5e3020"/></linearGradient>
<radialGradient id="w"><stop offset="0" stop-color="#ff9b3d" stop-opacity=".8"/><stop offset="1" stop-color="#ff9b3d" stop-opacity="0"/></radialGradient></defs>
<rect width="100" height="100" rx="22" fill="url(#g)"/><circle cx="50" cy="48" r="46" fill="url(#w)"/>
<circle cx="50" cy="48" r="38" fill="none" stroke="#4fd1ff" stroke-width="3"/>
<circle cx="50" cy="48" r="28" fill="#f3ece1"/><rect x="22" y="58" width="56" height="5" fill="#2bb3a3"/>
<circle cx="50" cy="48" r="18" fill="#ff9b3d"/><circle cx="50" cy="48" r="8" fill="#fff6d8"/></svg>`);
console.log(`icons written to ${out}`);
