import { alpha, mix } from "@fo/skins";
import type { BarrierView, HostileView, SectionView } from "../view.js";
import { drawPerson } from "./characters.js";
import type { DC } from "./dc.js";
import { drawItem } from "./items.js";
import { bar, circle, ellipse, fillRR, label, line, poly, rr, shadow } from "./prim.js";
import { register } from "./registry.js";

// Barrier lines (unbuilt dashed demarcation, built wall sections, gates) and hostiles.

const OUT = "rgba(33,24,26,.55)";

function carrying(dc: DC, res: string | undefined): boolean {
  if (!res) return false;
  if (res === "res.currency") return dc.world.currency > 0;
  return dc.world.player.stack.includes(res);
}

function drawSection(dc: DC, s: SectionView & { paid?: number }, res: string | undefined, cost: number | undefined, i: number, id: string | number): void {
  const g = dc.g, a = dc.w(s.a), b = dc.w(s.b);
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  if (!s.built) {
    // demarcation: where a wall can go; walking it while carrying the resource builds it
    const pl = dc.w(dc.world.player.pos);
    const ux = dx / len, uy = dy / len;
    const along = (pl.x - a.x) * ux + (pl.y - a.y) * uy;
    const off = Math.abs((pl.x - a.x) * -uy + (pl.y - a.y) * ux);
    const near = along > -10 && along < len + 10 && off < 40;
    const live = near && carrying(dc, res);
    const col = dc.pal.interactive;
    const k = cost ? Math.min(1, (s.paid ?? 0) / cost) : 0;
    g.save();
    g.translate(a.x, a.y);
    g.rotate(ang);
    // ghost of the wall to come, then the paid part rising in solid
    fillRR(g, 0, -8, len, 16, 4, alpha(col, live ? 0.22 + 0.1 * Math.sin(dc.t * 8) : 0.1));
    if (k > 0) fillRR(g, 0, -8, len * k, 16, 4, alpha(dc.pal.structure, 0.85), OUT, 1.5);
    g.setLineDash([9, 7]);
    g.lineDashOffset = live ? -dc.t * 40 : -dc.t * 6;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(len, -8); g.moveTo(0, 8); g.lineTo(len, 8);
    g.strokeStyle = alpha(col, live ? 1 : 0.8); g.lineWidth = live ? 3 : 2.5; g.stroke();
    g.setLineDash([]); g.lineDashOffset = 0;
    // walk chevrons along the line
    for (let x = 22; x < len - 14; x += 34) {
      if (Math.abs(x - len / 2) < 26) continue;
      const ph = (x / 34 + dc.t * 1.5) % 2 < 1 ? 0.9 : 0.5;
      poly(g, [x - 4, -4, x + 2, 0, x - 4, 4, x - 2, 0], alpha("#ffffff", ph * (live ? 1 : 0.7)));
    }
    if (s.gate) {
      // airlock posts in outline: this gap stays walkable once built
      g.setLineDash([4, 4]);
      rr(g, -2, -13, 10, 26, 3); g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.stroke();
      rr(g, len - 8, -13, 10, 26, 3); g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    if (res && cost) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const left = Math.max(0, cost - (s.paid ?? 0));
      const cw = 46;
      fillRR(g, mx - cw / 2, my - 11, cw, 22, 11, live ? col : "rgba(33,24,26,.78)", "#ffffff", 2);
      drawItem(dc, res, mx - 10, my, 0.8);
      label(g, String(left), mx + 9, my + 0.5, 12, live ? dc.pal.ink : "#ffffff", null);
      if (s.gate) label(g, dc.ui("gate"), mx, my - 20, 8.5, "#ffffff");
    }
    return;
  }
  const kn = dc.knock(`bar:${id}:${i}`);
  g.save();
  g.translate(a.x + (kn?.x ?? 0), a.y + (kn?.y ?? 0));
  g.rotate(ang);
  g.scale(1, popGrow(dc.popAge(`bar:${id}:${i}`)));
  const hpK = s.hpMax ? (s.hp ?? s.hpMax) / s.hpMax : 1;
  if (s.gate) {
    // airlock: two posts, door leaves swung open and a lit floor strip: passable
    fillRR(g, -2, -13, 11, 26, 3, dc.pal.structure, OUT, 2);
    fillRR(g, len - 9, -13, 11, 26, 3, dc.pal.structure, OUT, 2);
    circle(g, 3.5, -8, 2.2, dc.pal.ok);
    circle(g, len - 3.5, -8, 2.2, dc.pal.ok);
    const leaf = Math.min(len * 0.22, 26);
    poly(g, [9, -3, 9 + leaf * 0.5, -3 - leaf * 0.8, 9 + leaf * 0.5 + 3, -leaf * 0.8, 12, 0], dc.pal.structureDark, OUT, 1.5);
    poly(g, [len - 9, -3, len - 9 - leaf * 0.5, -3 - leaf * 0.8, len - 12 - leaf * 0.5, -leaf * 0.8, len - 12, 0], dc.pal.structureDark, OUT, 1.5);
    fillRR(g, 12, -2.5, len - 24, 5, 2.5, alpha(dc.pal.ok, 0.35 + 0.25 * Math.sin(dc.t * 4)));
    for (let x = len / 2 - 12; x <= len / 2 + 12; x += 12) {
      poly(g, [x - 4, -1, x, -6, x + 4, -1], alpha("#ffffff", 0.85));
      poly(g, [x - 4, 1, x, 6, x + 4, 1], alpha("#ffffff", 0.85));
    }
    if (hpK < 0.5) line(g, 1, -10, 6, 4, "#21181a", 1.5);
  } else {
    fillRR(g, 0, -9, len, 18, 4, dc.pal.structure, OUT, 2);
    fillRR(g, 0, -2, len, 4, 2, "#2bb3a3");
    for (let x = 12; x < len - 4; x += 16) line(g, x, -9, x, 9, alpha("#21181a", 0.25), 1.5);
    // crack decals deepen as the section loses hp
    if (hpK < 0.75) { line(g, len * 0.3, -9, len * 0.36, -1, "#21181a", 1.6); line(g, len * 0.36, -1, len * 0.32, 9, "#21181a", 1.6); }
    if (hpK < 0.5) { line(g, len * 0.68, -9, len * 0.62, 0, "#21181a", 1.6); line(g, len * 0.62, 0, len * 0.7, 9, "#21181a", 1.6); line(g, len * 0.62, 0, len * 0.55, 3, "#21181a", 1.2); }
    if (hpK < 0.3) {
      line(g, len * 0.12, -9, len * 0.18, 9, "#21181a", 1.6);
      for (let x = len * 0.2; x < len; x += len * 0.27) poly(g, [x, 9, x + 4, 13, x + 9, 10], dc.pal.structureDark);
    }
  }
  g.restore();
  if (s.hpMax && (s.hp ?? s.hpMax) < s.hpMax) {
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

/** Interpolated hostile position plus any knockback from a recent hit. */
function hostilePos(dc: DC, h: HostileView): { x: number; y: number } {
  const p = dc.pos(`h:${h.id}`, h.pos);
  const kn = dc.knock(`h:${h.id}`);
  return kn ? { x: p.x + kn.x, y: p.y + kn.y } : p;
}

register("hostile.creature", (dc, h: HostileView) => {
  const g = dc.g;
  const p = hostilePos(dc, h);
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
  const p = hostilePos(dc, h);
  const fl = dc.flash(`h:${h.id}`);
  const v = dc.vel(`h:${h.id}`);
  drawPerson(dc, p.x, p.y, { body: "#3b3540", helmet: "#5a4e57", visor: "#ff3b2f", hat: "hat.hood", tool: "tool.club", face: v.x < 0 ? -1 : 1, bob: dc.t * 12, flash: fl });
  hpBar(dc, h, p.x, p.y - 30);
  if (dc.skin.labelAll) label(dc.g, dc.name(h.type), p.x, p.y + 22, 8, "#ffffff");
});

register("hostile.*", (dc, h: HostileView) => {
  const p = hostilePos(dc, h);
  const fl = dc.flash(`h:${h.id}`);
  shadow(dc.g, p.x, p.y + 10, 13, 0.3);
  circle(dc.g, p.x, p.y, 12, fl > 0 ? "#ffffff" : "#4a2c3c", dc.pal.danger, 2.5);
  label(dc.g, "!", p.x, p.y, 12, dc.pal.danger, null);
  hpBar(dc, h, p.x, p.y - 20);
  label(dc.g, dc.name(h.type), p.x, p.y + 20, 8, "#ffffff");
});
