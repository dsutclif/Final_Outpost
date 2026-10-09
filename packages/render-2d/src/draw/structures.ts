import { alpha, mix } from "@fo/skins";
import type { StructureView } from "../view.js";
import type { DC } from "./dc.js";
import { bar, circle, fillRR, label, line, poly, popScale, shadow } from "./prim.js";
import { register } from "./registry.js";

// Buildings placed by build pads. Each pops in with squash-and-stretch on its build event.

const OUT = "rgba(33,24,26,.5)";
const TEAL = "#2bb3a3";

/** Translate/scale for the pop, run fn in local coordinates, then draw the hp bar. */
function withPop(dc: DC, s: StructureView, fn: (x: number, y: number) => void, hpY = 34): void {
  const g = dc.g, p = dc.w(s.pos);
  const [sx, sy] = popScale(dc.popAge(`struct:${s.id}`));
  g.save();
  g.translate(p.x, p.y + 20);
  g.scale(sx, sy);
  g.translate(0, -20);
  fn(0, 0);
  g.restore();
  if (s.hp !== undefined && s.hpMax && s.hp < s.hpMax) bar(g, p.x - 22, p.y + hpY, 44, 5, s.hp / s.hpMax, s.hp / s.hpMax < 0.35 ? dc.pal.danger : dc.pal.ok, "rgba(33,24,26,.4)");
  if (dc.skin.labelAll) label(g, dc.name(s.type), p.x, p.y + hpY + 10, 8, "#ffffff");
}

register("struct.landmark", (dc, s: StructureView) => withPop(dc, s, (x, y) => {
  const g = dc.g;
  shadow(g, x, y + 30, 62, 0.28);
  fillRR(g, x - 52, y - 6, 104, 38, 9, dc.pal.structure, OUT, 2);
  fillRR(g, x - 52, y + 10, 104, 6, 3, TEAL);
  // main dome
  g.beginPath(); g.arc(x, y - 6, 40, Math.PI, 0); g.closePath();
  g.fillStyle = alpha(dc.pal.glass, 0.55); g.fill(); g.strokeStyle = "#ffffff"; g.lineWidth = 3; g.stroke();
  for (let k = -1; k <= 1; k++) line(g, x + k * 18, y - 6, x + k * 8, y - 42, "rgba(255,255,255,.55)", 1.5);
  g.beginPath(); g.arc(x, y - 6, 40, Math.PI * 1.12, Math.PI * 1.4); g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3.5; g.stroke();
  // side pods
  g.beginPath(); g.arc(x - 44, y + 4, 14, Math.PI, 0); g.closePath(); g.fillStyle = dc.pal.structure; g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.arc(x + 44, y + 4, 14, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
  // antenna and beacon
  line(g, x + 26, y - 30, x + 34, y - 62, "#e3eaf2", 2.5);
  circle(g, x + 34, y - 63, 3.5, Math.sin(dc.t * 4) > 0 ? dc.pal.danger : "#7a2a20");
  // flag
  line(g, x - 30, y - 30, x - 30, y - 64, "#e3eaf2", 2.5);
  poly(g, [x - 30, y - 64, x - 12 + Math.sin(dc.t * 5) * 2, y - 58, x - 30, y - 52], dc.pal.accent);
  fillRR(g, x - 14, y + 12, 28, 20, 6, mix(dc.pal.structureDark, "#000000", 0.25));
  label(g, dc.name("struct.landmark").toUpperCase(), x, y + 44, 12, "#ffffff");
}, 52));

register("struct.housing", (dc, s: StructureView) => withPop(dc, s, (x, y) => {
  const g = dc.g;
  shadow(g, x, y + 20, 32, 0.25);
  fillRR(g, x - 30, y + 4, 60, 16, 6, dc.pal.structureDark, OUT, 2);
  g.beginPath(); g.arc(x, y + 6, 28, Math.PI, 0); g.closePath();
  g.fillStyle = dc.pal.structure; g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
  fillRR(g, x - 30, y + 2, 60, 5, 2.5, TEAL);
  circle(g, x + 12, y - 8, 6, alpha(dc.pal.glass, 0.9), OUT, 1.5);
  fillRR(g, x - 18, y - 6, 14, 22, 6, mix(dc.pal.structureDark, "#000000", 0.25));
  circle(g, x + 12, y - 8, 2, "rgba(255,240,200,.95)");
}, 26));

register("struct.medical", (dc, s: StructureView) => withPop(dc, s, (x, y) => {
  const g = dc.g;
  shadow(g, x, y + 22, 34, 0.25);
  fillRR(g, x - 32, y - 18, 64, 40, 8, "#ffffff", OUT, 2);
  g.beginPath(); g.arc(x, y - 18, 16, Math.PI, 0); g.closePath(); g.fillStyle = alpha(dc.pal.glass, 0.7); g.fill(); g.strokeStyle = OUT; g.stroke();
  g.fillStyle = "#ff3b3b";
  g.fillRect(x - 4, y - 10, 8, 26);
  g.fillRect(x - 13, y - 1, 26, 8);
}, 28));

register("struct.ranged_defense", (dc, s: StructureView) => withPop(dc, s, (x, y) => {
  const g = dc.g;
  const p = dc.w(s.pos);
  // aim at the nearest hostile, idle sweep otherwise
  let ang = Math.sin(dc.t * 0.8 + Number(s.id || 0)) * 0.8 - Math.PI / 2;
  let best = Infinity;
  for (const h of dc.world.hostiles ?? []) {
    const q = dc.w(h.pos), d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < best) { best = d; ang = Math.atan2(q.y - p.y, q.x - p.x); }
  }
  shadow(g, x, y + 18, 24, 0.28);
  fillRR(g, x - 18, y - 4, 36, 22, 6, dc.pal.structureDark, OUT, 2);
  circle(g, x, y - 6, 13, dc.pal.structure, OUT, 2);
  g.save(); g.translate(x, y - 6); g.rotate(ang);
  fillRR(g, 4, -3.5, 20, 7, 3, "#3b3f46");
  if (dc.flash(`s:${s.id}`) > 0) circle(g, 27, 0, 6 * dc.flash(`s:${s.id}`), "#fff3a0");
  g.restore();
  circle(g, x, y - 6, 5, dc.pal.interactive);
  const lv = s.level ?? 1;
  for (let k = 0; k < lv; k++) circle(g, x - (lv - 1) * 4 + k * 8, y + 12, 2.5, dc.pal.accent);
}, 24));

function drawGuardPost(dc: DC, s: StructureView): void { withPop(dc, s, (x, y) => {
  const g = dc.g;
  shadow(g, x, y + 22, 34, 0.25);
  fillRR(g, x - 32, y - 20, 64, 42, 6, mix(dc.pal.structureDark, "#3b3f46", 0.5), OUT, 2);
  line(g, x + 22, y - 20, x + 22, y - 46, "#e3eaf2", 2.5);
  poly(g, [x + 22, y - 46, x + 40, y - 40, x + 22, y - 34], dc.pal.danger);
  // practice target
  circle(g, x - 14, y - 2, 9, "#ffffff", OUT, 1.5);
  circle(g, x - 14, y - 2, 5, dc.pal.danger);
  circle(g, x - 14, y - 2, 2, "#ffffff");
}, 28); }
register("struct.training", drawGuardPost);
register("struct.barracks", drawGuardPost);

/** Generic building for any struct.* without its own routine. */
register("struct.*", (dc, s: StructureView) => withPop(dc, s, (x, y) => {
  const g = dc.g;
  shadow(g, x, y + 22, 34, 0.25);
  fillRR(g, x - 30, y - 16, 60, 38, 6, dc.pal.structure, OUT, 2);
  poly(g, [x - 36, y - 12, x, y - 34, x + 36, y - 12], dc.pal.structureDark, OUT, 2);
  label(g, dc.name(s.type), x, y + 2, 9, dc.pal.ink, null);
}, 28));

/** Before the sim tracks structures, completed struct.* build pads stand in for them. */
export function structuresFromBuiltPads(dc: DC): StructureView[] {
  const done = new Set<string>(dc.world.built ?? []);
  for (const p of dc.world.pads ?? []) if (p.done) done.add(p.id);
  const out: StructureView[] = [];
  for (const id of done) {
    const info = dc.pads.get(id);
    if (!info || info.kind !== "build" || !info.what.startsWith("struct.")) continue;
    const pad = (dc.world.pads ?? []).find((p) => p.id === id);
    if (!pad) continue;
    out.push({ id, type: info.what, pos: pad.pos });
  }
  return out;
}

