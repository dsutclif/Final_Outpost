// scratch, not committed: render wavefront layouts as SVG
import { writeFileSync, readFileSync } from "node:fs";
import { convert } from "./wavefront-check.js";
import { placeWavefront } from "../packages/generator/src/wavefront.js";
const out = process.env.SVG_OUT!;
const levels = (process.env.SVG_LEVELS ?? "s1-L012,s1-L023,s1-L010,s1-L014,s1-L020").split(",");
const root = new URL("../levels/packs/", import.meta.url);
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(root);
const files = readdirSync(dir, { recursive: true }) as string[];
const cards: string[] = [];
for (const entry of levels) {
  const [L, seedS] = entry.split(":") as [string, string?]; const seed = Number(seedS ?? 1), num = Number(L.replace(/^s1-L0*/, ""));
  const f = files.find((x) => x.split(String.fromCharCode(92)).join("/").endsWith(L + ".json"))!;
  const m = JSON.parse(readFileSync(dir + f, "utf8"));
  const c = convert(m); const inp = c.input;
  const fam = m.meta?.family ?? JSON.stringify(m).match(/"family":"([^"]+)"/)?.[1];
  let r = placeWavefront(inp, { seed, siteChecks: true, repair: "always", trace: true } as never);
  const shift = (r.trace as { t: string; d?: number[] }[]).find((t) => t.t === "shift")?.d as [number, number] | undefined;
  const noWall = r.rejected ? placeWavefront((({ walls: _w, ...rest }) => rest)(inp), { seed, siteChecks: true, repair: "always" } as never) : r;
  const show = noWall;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const shapes: string[] = [];
  for (const b of inp.buildings) { const p = show.positions[b.id]; if (!p) continue; const fp = b.footprint;
    const a = [p[0] + fp[0], p[1] + fp[1], p[0] + fp[2], p[1] + fp[3]];
    if (b.kind !== "zone.blocked") { x0 = Math.min(x0, a[0]!); y0 = Math.min(y0, a[1]!); x1 = Math.max(x1, a[2]!); y1 = Math.max(y1, a[3]!); }
    const col = b.kind === "sink.core" ? "#3b6ea5" : b.kind.startsWith("node.salvage") ? "#8a6d3b" : b.kind === "zone.blocked" ? "#555" : "#4a4f57";
    shapes.push(`<rect x="${a[0]}" y="${a[1]}" width="${a[2]! - a[0]!}" height="${a[3]! - a[1]!}" fill="${col}" stroke="#aaa" stroke-width="1.5"/><text x="${p[0]}" y="${p[1]}" font-size="13" fill="#fff" text-anchor="middle">${b.id.slice(0, 12)}</text>`); }
  for (const [id, p] of Object.entries(show.padAt)) shapes.push(`<rect x="${p[0] - 10}" y="${p[1] - 10}" width="20" height="20" fill="#2fa36b"/>`);
  if (show.walls) shapes.push(`<polygon points="${show.walls.points.map((q) => q.join(",")).join(" ")}" fill="none" stroke="#d9a400" stroke-width="5"/>`);
  for (const k of Object.values(show.rock)) {
    shapes.push(`<rect x="${k.rect[0]}" y="${k.rect[1]}" width="${k.rect[2] - k.rect[0]}" height="${k.rect[3] - k.rect[1]}" fill="#6b3f3f" stroke="#c66" stroke-width="2"/>`);
    for (const q of k.rest ?? []) shapes.push(`<rect x="${q[0]}" y="${q[1]}" width="${q[2] - q[0]}" height="${q[3] - q[1]}" fill="#4a3434" stroke="#c66" stroke-width="2" stroke-dasharray="8 6"/>`);
    for (const q of k.pads) shapes.push(`<rect x="${q[0] - 25}" y="${q[1] - 25}" width="50" height="50" fill="none" stroke="#2fa36b" stroke-width="2"/>`);
  }
  for (const s of Object.values(show.scrap)) shapes.push(`<circle cx="${s.at[0]}" cy="${s.at[1]}" r="12" fill="#b0773a"/>`);
  const W = inp.map.w, H = inp.map.h, dims = inp.walls?.dims;
  if (dims && r.rejected) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; shapes.push(`<rect x="${cx - dims[0] / 2}" y="${cy - dims[1] / 2}" width="${dims[0]}" height="${dims[1]}" fill="none" stroke="#e5484d" stroke-width="5" stroke-dasharray="14 8"/>`); }
  const notes = [shift ? `ring re-anchored ${shift[0] > 0 ? shift[0] + " east" : ""}${shift[1] ? " " + shift[1] + " south" : ""}` : "", r.stats.scrapPacked ? "scrap repacked from the north-west" : ""].filter(Boolean).join(" · ");
  const info = `<b>Level ${num}</b>, seed ${seed}${notes ? " · <b>" + notes + "</b>" : ""} · ${fam} · map ${W}×${H} · settlement ${Math.round(x1 - x0)}×${Math.round(y1 - y0)} · shipped ring ${dims ? dims.map(Math.round).join("×") : "none"} · ${r.rejected ? "REJECTED: " + r.rejected.id : "fits"} · buildings ${inp.buildings.length}, pads ${Object.keys(show.padAt).length}`;
  console.log(info);
  cards.push(`<figure><svg viewBox="-60 -60 ${W + 120} ${H + 120}" width="300"><rect x="0" y="0" width="${W}" height="${H}" fill="#1b1d21" stroke="#777" stroke-dasharray="10 6" stroke-width="3"/>${shapes.join("")}</svg><figcaption>${info}</figcaption></figure>`);
}
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Wavefront layouts</title><style>body{background:#111;color:#ddd;font:13px system-ui;margin:16px}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:300px}figcaption{margin-top:6px}</style><h1>Wavefront layouts</h1><p>North-west is top-left. Grey = buildings, blue = Core, brown = salvage, green = pads, yellow = wall ring, red dashed = the shipped level ring size (not used by the fit); brown block = gate rockfall with its clear-pad row; dashed dark-red band = the rest of the rock pile, which disappears when the gate rockfall is cleared. The first five cards are the same levels as before. The last four used to be rejected: the wall ring ran off the west edge (Levels 12 and 30), or a scrap heap found no site (Levels 165 and 60).</p><main>${cards.join("")}</main>`);
