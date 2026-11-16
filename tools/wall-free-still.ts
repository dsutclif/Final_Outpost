import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { content } from "../packages/content/src/index.js";

// Top-down still of a wall-free defend manifest (outpost-ops#208): pnpm vite-node tools/wall-free-still.ts -- <manifest.json> <out.png>
// Heat circles at the three core levels, the ring sockets (tower square, its pad ring), the road pairs, other pads, nodes and lanes.

const [src, out] = process.argv.slice(2).filter((a) => a !== "--") as [string, string];
const m = JSON.parse(readFileSync(resolve(src), "utf8")) as { map: { w: number; h: number }; entities: Record<string, any>[]; waves: { side?: string | string[] }[] };
const E = m.entities, core = E.find((e) => e.type === "sink.core")!.at as [number, number];
const R = (content.sinks["sink.core"] as unknown as { levels: { safeRadius: number }[] }).levels.map((l) => l.safeRadius);
const view = 420, x0 = core[0] - view, y0 = core[1] - view, S = 1.1, size = Math.round(view * 2 * S);
const X = (x: number) => ((x - x0) * S).toFixed(1), Y = (y: number) => ((y - y0) * S).toFixed(1);
const parts: string[] = [`<rect width="${size}" height="${size}" fill="#1d2430"/>`];
const dash = ["#ffb347", "#ffd27d", "#fff0b8"];
R.forEach((r, i) => parts.push(`<circle cx="${X(core[0])}" cy="${Y(core[1])}" r="${r * S}" fill="none" stroke="${dash[i]}" stroke-width="2" stroke-dasharray="${i === 0 ? "" : "8 6"}"/>`,
  `<text x="${X(core[0] + r * 0.72)}" y="${Y(core[1] - r * 0.72)}" fill="${dash[i]}" font-size="14" font-family="sans-serif">core L${i + 1} (${r})</text>`));
const band = (f: number) => parts.push(`<circle cx="${X(core[0])}" cy="${Y(core[1])}" r="${R[1]! * f * S}" fill="none" stroke="#6fd0ff" stroke-width="1" stroke-opacity="0.5"/>`);
band(0.7); band(0.9);
for (const e of E) {
  if (e.type === "node.fuel_scrap") parts.push(`<circle cx="${X(e.at[0])}" cy="${Y(e.at[1])}" r="4" fill="#7a8a5a"/>`);
  else if (e.type === "node.salvage_pile") parts.push(`<rect x="${X(e.at[0] - 12)}" y="${Y(e.at[1] - 12)}" width="${24 * S}" height="${24 * S}" fill="#8c6b4a"/>`);
  else if (e.type === "struct.barracks") parts.push(`<rect x="${X(e.at[0] - 20)}" y="${Y(e.at[1] - 20)}" width="${40 * S}" height="${40 * S}" fill="#a35a5a"/>`);
  else if (e.type === "sink.core") parts.push(`<circle cx="${X(e.at[0])}" cy="${Y(e.at[1])}" r="${14 * S}" fill="#ff8a3d"/>`);
  else if (e.type === "pad.build" && e.build === "struct.ranged_defense") {
    const ring = String(e.id).startsWith("tower_r"), c = ring ? "#4fc3ff" : "#ff9f43", open = !e.requires?.wave;
    parts.push(`<rect x="${X(e.site[0] - 19)}" y="${Y(e.site[1] - 45)}" width="${38 * S}" height="${80 * S}" fill="${c}" fill-opacity="${open ? 0.9 : 0.45}"/>`,
      `<circle cx="${X(e.at[0])}" cy="${Y(e.at[1])}" r="${25 * S}" fill="none" stroke="${c}" stroke-width="2"/>`);
  } else if (e.type === "pad.build" || e.type === "pad.hire") {
    if (!/_up/.test(String(e.id))) parts.push(`<circle cx="${X(e.at[0])}" cy="${Y(e.at[1])}" r="${25 * S}" fill="none" stroke="#c9d1d9" stroke-width="1.5"/>`);
  }
}
parts.push(`<text x="10" y="22" fill="#fff" font-size="16" font-family="sans-serif">wall-free defend, top-down. blue = ring sockets (solid: stand from start), orange = road pair, pale-blue circles = 0.7 and 0.9 of core L2 heat radius, dashed = heat circles</text>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${parts.join("")}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(resolve(out));
console.log("wrote", resolve(out));
