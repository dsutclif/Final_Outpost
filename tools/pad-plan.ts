// Before/after top-down plan of a pad repair, as SVG: footprints (grey), pads (green in view all their life, red hidden
// some time while live), the shadow each tall thing casts (light), and arrows for moved pads and pushed buildings.
//   pnpm vite-node tools/pad-plan.ts -- <before.json> <after.json> <out.svg> [title]
import { readFileSync, writeFileSync } from "node:fs";
import genData from "../packages/generator/data/generator.json";
import { lifetimeVisibility, padTimeline, type Manifest } from "../packages/generator/src/padRepair.js";
import { SIGHT } from "../packages/generator/src/viewVisibility.js";

const [bf, af, out, title] = process.argv.slice(2).filter((a) => a !== "--");
const FP = (genData as unknown as { footprints: Record<string, [number, number, number, number]> }).footprints;
const panel = (m: Manifest, ox: number, label: string): string => {
  const win = padTimeline(m), v = new Map(lifetimeVisibility(m, win).map((p) => [p.id, p]));
  const s: string[] = [`<text x="${ox + 8}" y="18" font-size="16" font-family="sans-serif">${label}</text>`];
  for (const e of m.entities) {
    if (e.type.startsWith("pad.") || !e.at) continue;
    const f = FP[e.type];
    if (!f) continue;
    const [x, y] = e.at;
    s.push(`<rect x="${ox + x + f[0]}" y="${y + f[1]}" width="${f[2] - f[0]}" height="${f[3] - f[1]}" fill="#bbb" stroke="#666" opacity="0.7"/><text x="${ox + x - 20}" y="${y}" font-size="10" font-family="sans-serif">${String(e.id ?? e.type.split(".").pop())}</text>`);
  }
  for (const e of m.entities) {
    if (!e.type.startsWith("pad.") || !e.at) continue;
    const p = v.get(String(e.id)), bad = !!p && p.hidden > 0;
    s.push(`<circle cx="${ox + e.at[0]}" cy="${e.at[1]}" r="11" fill="${bad ? "#e33" : "#2a2"}" opacity="0.8"><title>${String(e.id)} hidden ${p?.hidden ?? 0} by ${p?.by ?? "-"}</title></circle>`);
    if (bad) s.push(`<text x="${ox + e.at[0] + 12}" y="${e.at[1] + 4}" font-size="10" fill="#c00" font-family="sans-serif">${String(e.id)}</text>`);
  }
  return s.join("");
};
const b = JSON.parse(readFileSync(bf!, "utf8")) as Manifest, a = JSON.parse(readFileSync(af!, "utf8")) as Manifest;
const W = b.map.w, H = b.map.h;
const arrows: string[] = [];
for (const e of a.entities) {
  const o = b.entities.find((x) => (x.id ?? null) === (e.id ?? null) && x.type === e.type && (e.id || (x.at && e.at && Math.hypot(x.at[0] - e.at[0], x.at[1] - e.at[1]) < 70)));
  if (o?.at && e.at && (o.at[0] !== e.at[0] || o.at[1] !== e.at[1])) arrows.push(`<line x1="${W + 20 + o.at[0]}" y1="${o.at[1]}" x2="${W + 20 + e.at[0]}" y2="${e.at[1]}" stroke="#06c" stroke-width="2" marker-end="url(#h)"/><circle cx="${W + 20 + o.at[0]}" cy="${o.at[1]}" r="6" fill="none" stroke="#06c" stroke-dasharray="3 2"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${2 * W + 20} ${H}" width="${2 * W + 20}" height="${H}"><defs><marker id="h" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#06c"/></marker></defs>` +
  `<rect width="100%" height="100%" fill="#f6f3ea"/><line x1="${W + 10}" y1="0" x2="${W + 10}" y2="${H}" stroke="#999"/>` +
  `<text x="8" y="${H - 8}" font-size="11" font-family="sans-serif">${title ?? b.id}. Camera looks from the bottom-right (sight ${SIGHT.ux.toFixed(2)},${SIGHT.uz.toFixed(2)}): a tall thing hides the ground up-left of it. Red pad: hidden at some point while it can be bought.</text>` +
  panel(b, 0, "Before") + panel(a, W + 20, "After") + arrows.join("") + `</svg>`;
writeFileSync(out!, svg);
