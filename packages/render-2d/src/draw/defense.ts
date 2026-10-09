import { alpha, mix } from "@fo/skins";
import type { BarrierView, HostileView, SectionView } from "../view.js";
import { drawPerson } from "./characters.js";
import type { DC } from "./dc.js";
import { drawItem } from "./items.js";
import { bar, circle, ellipse, fillRR, label, line, shadow } from "./prim.js";
import { register } from "./registry.js";

// Barrier lines (unbuilt dashed demarcation, built wall sections, gates) and hostiles.

const OUT = "rgba(33,24,26,.55)";

function drawSection(dc: DC, s: SectionView, res: string | undefined, cost: number | undefined, i: number, id: string | number): void {
  const g = dc.g, a = dc.w(s.a), b = dc.w(s.b);
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  if (!s.built) {
    // demarcation: where a wall can go; walking it while carrying the resource builds it
    line(g, a.x, a.y, b.x, b.y, alpha(dc.pal.interactive, 0.75), 3, [7, 7]);
    if (res && cost && i % 2 === 0) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      fillRR(g, mx - 16, my - 9, 32, 18, 9, "rgba(33,24,26,.55)");
      drawItem(dc, res, mx - 6, my, 0.7);
      label(g, String(cost), mx + 8, my, 10, "#ffffff", null);
    }
    return;
  }
  g.save();
  g.translate(a.x, a.y);
  g.rotate(ang);
  g.scale(1, popGrow(dc.popAge(`bar:${id}:${i}`)));
  if (s.gate) {
    // airlock: two posts and a light strip; it stays passable
    fillRR(g, -2, -12, 10, 24, 3, dc.pal.structure, OUT, 2);
    fillRR(g, len - 8, -12, 10, 24, 3, dc.pal.structure, OUT, 2);
    fillRR(g, 8, -3, len - 16, 6, 3, alpha(dc.pal.interactive, 0.35 + 0.25 * Math.sin(dc.t * 4)));
  } else {
    fillRR(g, 0, -9, len, 18, 4, dc.pal.structure, OUT, 2);
    fillRR(g, 0, -2, len, 4, 2, "#2bb3a3");
    for (let x = 12; x < len - 4; x += 16) line(g, x, -9, x, 9, alpha("#21181a", 0.25), 1.5);
    const hpK = s.hpMax ? (s.hp ?? s.hpMax) / s.hpMax : 1;
    if (hpK < 0.6) { // crack decal on damaged sections
      line(g, len * 0.3, -9, len * 0.38, 0, "#21181a", 1.5);
      line(g, len * 0.38, 0, len * 0.33, 9, "#21181a", 1.5);
    }
  }
  g.restore();
  if (!s.gate && s.hpMax && (s.hp ?? s.hpMax) < s.hpMax) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    bar(g, mx - 16, my + 13, 32, 4, (s.hp ?? 0) / s.hpMax, (s.hp ?? 0) / s.hpMax < 0.35 ? dc.pal.danger : dc.pal.ok, "rgba(33,24,26,.4)");
  }
}

/** Wall sections rise out of the ground with a little overshoot. */
function popGrow(age: number): number {
  if (age >= 0.35) return 1;
  const t = age / 0.35;
  return Math.max(0.05, t < 0.7 ? (t / 0.7) * 1.25 : 1.25 - 0.25 * ((t - 0.7) / 0.3));
}

register("barrier", (dc, b: BarrierView) => {
  b.sections.forEach((s, i) => drawSection(dc, s, b.res, b.costPerSection, i, b.id));
  if (dc.skin.labelAll) { const a = dc.w(b.a); label(dc.g, dc.name("struct.barrier"), a.x + 20, a.y - 16, 8, "#ffffff"); }
});

// ---------- hostiles ----------

function hpBar(dc: DC, h: HostileView, x: number, y: number): void {
  const reg = (dc.content as unknown as Record<string, Record<string, { hp?: number }> | undefined>)["hostiles"];
  const max = h.hpMax ?? reg?.[h.type]?.hp;
  if (h.hp !== undefined && max && h.hp < max) bar(dc.g, x - 12, y, 24, 4, h.hp / max, dc.pal.danger, "rgba(33,24,26,.4)");
}

register("hostile.creature", (dc, h: HostileView) => {
  const g = dc.g;
  const p = dc.pos(`h:${h.id}`, h.pos);
  const fl = dc.flash(`h:${h.id}`);
  const body = fl > 0 ? mix("#4a2c3c", "#ffffff", fl) : "#4a2c3c";
  const rim = "#f3c7a8";
  shadow(g, p.x, p.y + 10, 16, 0.3);
  // six legs scuttling in alternating sets
  for (let k = 0; k < 3; k++) {
    const ph = Math.sin(dc.t * 16 + k * 2.1) * 3;
    const yy = p.y - 4 + k * 5;
    line(g, p.x - 8, yy, p.x - 17, yy + 4 + ph, rim, 2.2);
    line(g, p.x + 8, yy, p.x + 17, yy + 4 - ph, rim, 2.2);
  }
  ellipse(g, p.x, p.y, 13, 9, body);
  g.strokeStyle = rim; g.lineWidth = 2; g.stroke();
  ellipse(g, p.x, p.y - 9, 7, 5, body);
  g.strokeStyle = rim; g.stroke();
  circle(g, p.x - 3, p.y - 10, 1.8, "#ff5a3c");
  circle(g, p.x + 3, p.y - 10, 1.8, "#ff5a3c");
  ellipse(g, p.x - 4, p.y - 2, 4, 2, "rgba(255,255,255,.2)");
  hpBar(dc, h, p.x, p.y - 22);
  if (dc.skin.labelAll) label(g, dc.name(h.type), p.x, p.y + 20, 8, "#ffffff");
});

register("hostile.raider_humanoid", (dc, h: HostileView) => {
  const p = dc.pos(`h:${h.id}`, h.pos);
  const fl = dc.flash(`h:${h.id}`);
  const v = dc.vel(`h:${h.id}`);
  drawPerson(dc, p.x, p.y, { body: "#3b3540", helmet: "#5a4e57", visor: "#ff3b2f", hat: "hat.hood", tool: "tool.club", face: v.x < 0 ? -1 : 1, bob: dc.t * 12, flash: fl });
  hpBar(dc, h, p.x, p.y - 30);
  if (dc.skin.labelAll) label(dc.g, dc.name(h.type), p.x, p.y + 22, 8, "#ffffff");
});

register("hostile.*", (dc, h: HostileView) => {
  const p = dc.pos(`h:${h.id}`, h.pos);
  const fl = dc.flash(`h:${h.id}`);
  shadow(dc.g, p.x, p.y + 10, 13, 0.3);
  circle(dc.g, p.x, p.y, 12, fl > 0 ? "#ffffff" : "#4a2c3c", dc.pal.danger, 2.5);
  label(dc.g, "!", p.x, p.y, 12, dc.pal.danger, null);
  hpBar(dc, h, p.x, p.y - 20);
  label(dc.g, dc.name(h.type), p.x, p.y + 20, 8, "#ffffff");
});
