import { alpha } from "@fo/skins";
import type { V } from "../view.js";
import { drawPerson } from "./characters.js";
import type { DC } from "./dc.js";
import { drawItem } from "./items.js";
import { FONT, TAU, circle, fillRR, label, poly } from "./prim.js";

// Screen overlays: off-screen pointers with an icon of what waits there, and coach marks
// (a bouncing arrow on the target plus a speech bubble in the skin's words).

export type PointerIcon = "hostile" | "pod" | "person" | "core" | "coin" | "goal";
type IconFn = (dc: DC, x: number, y: number) => void;

const ICONS: Record<PointerIcon, IconFn> = {
  hostile: (dc, x, y) => {
    circle(dc.g, x, y + 1, 6.5, "#4a2c3c");
    circle(dc.g, x - 2.4, y, 1.6, "#ff5a3c");
    circle(dc.g, x + 2.4, y, 1.6, "#ff5a3c");
  },
  pod: (dc, x, y) => {
    fillRR(dc.g, x - 5, y - 7, 10, 14, 5, alpha(dc.pal.glass, 0.9), "#ffffff", 1.5);
    circle(dc.g, x, y - 2, 2.6, "#a9cfe6");
  },
  person: (dc, x, y) => drawPerson(dc, x, y + 4, { body: dc.pal.role["role.idle"] ?? "#b8c3cc", scale: 0.5 }),
  core: (dc, x, y) => {
    poly(dc.g, [x - 5, y + 5, x - 4, y - 1, x - 1, y + 1, x, y - 7, x + 2, y - 1, x + 5, y - 3, x + 5, y + 5], dc.pal.accent);
    circle(dc.g, x, y + 2, 2.5, "#fff3a0");
  },
  coin: (dc, x, y) => drawItem(dc, "res.currency", x, y, 0.9),
  goal: (dc, x, y) => {
    dc.g.fillStyle = "#ffffff"; dc.g.fillRect(x - 4, y - 7, 1.8, 14);
    poly(dc.g, [x - 2.5, y - 7, x + 6, y - 4, x - 2.5, y - 1], dc.pal.accent);
  },
};

export function iconFor(k: PointerIcon): IconFn { return ICONS[k]; }

/** An arrow at the screen edge pointing at something off-screen, with its icon in a bubble. */
export function drawPointer(dc: DC, x: number, y: number, ang: number, color: string, icon: IconFn, t: number): void {
  const g = dc.g;
  const bob = Math.sin(t * 6) * 2;
  const bx = x - Math.cos(ang) * bob, by = y - Math.sin(ang) * bob;
  g.save(); g.translate(bx, by); g.rotate(ang);
  poly(g, [21, 0, 10, -8, 10, 8], color, "#ffffff", 2);
  g.restore();
  circle(g, bx, by, 13, "#ffffff");
  circle(g, bx, by, 11, color);
  circle(g, bx, by, 9, "rgba(255,255,255,.92)");
  icon(dc, bx, by);
}

export interface CoachMark {
  key: string;
  /** Target in world units. */
  at: V;
  text: string;
  /** Renderer clock when the mark appeared (set by the renderer). */
  since?: number;
}

interface View { x0: number; y0: number; x1: number; y1: number }

/**
 * World pass draws the ground ring and arrow on the target when it is on screen; screen pass
 * draws the bubble (placed so it never covers the hero) or an edge pointer when off screen.
 */
export function drawCoach(dc: DC, c: CoachMark, hero: V, v: View, screen: boolean, k = 1, sw = 0, sh = 0): void {
  const g = dc.g, t = dc.t;
  const age = t - (c.since ?? t);
  const appear = Math.min(1, age / 0.25);
  const onScreen = c.at.x > v.x0 + 8 && c.at.x < v.x1 - 8 && c.at.y > v.y0 + 30 && c.at.y < v.y1 - 8;
  const col = dc.pal.interactive;
  if (!screen) {
    if (!onScreen) return;
    const pulse = (t * 1.2) % 1;
    g.beginPath(); g.ellipse(c.at.x, c.at.y + 6, 18 + pulse * 16, (18 + pulse * 16) * 0.45, 0, 0, TAU);
    g.strokeStyle = alpha(col, (1 - pulse) * 0.9 * appear); g.lineWidth = 3; g.stroke();
    const ay = c.at.y - 40 - Math.abs(Math.sin(t * 5)) * 8;
    g.save(); g.translate(c.at.x, ay); g.scale(appear, appear);
    poly(g, [-9, -12, 9, -12, 9, -2, 15, -2, 0, 12, -15, -2, -9, -2], col, "#ffffff", 2.5);
    g.restore();
    return;
  }
  const toS = (p: V): V => ({ x: (p.x - v.x0) * k, y: (p.y - v.y0) * k });
  g.font = `800 14px ${FONT}`;
  const tw = Math.min(sw - 40, (g.measureText?.(c.text)?.width ?? c.text.length * 7) + 22);
  const bh = 28;
  let ax: number, ay: number;
  if (onScreen) {
    const p = toS(c.at);
    ax = p.x; ay = p.y - 58 * k;
  } else {
    const p = toS(c.at), cx = sw / 2, cy = sh / 2, dx = p.x - cx, dy = p.y - cy;
    const s = Math.min(dx ? (sw / 2 - 30) / Math.abs(dx) : Infinity, dy ? (sh / 2 - 30) / Math.abs(dy) : Infinity);
    const ex = cx + dx * s, ey = cy + dy * s;
    drawPointer(dc, ex, ey, Math.atan2(dy, dx), col, (d, x, y) => label(d.g, "!", x, y, 13, d.pal.ink, null), t);
    ax = ex - Math.sign(dx) * Math.min(Math.abs(dx * s), tw / 2 + 14) * (Math.abs(dx) > Math.abs(dy) ? 1 : 0);
    ay = ey + (dy > 0 ? -34 : 34) * (Math.abs(dy) >= Math.abs(dx) ? 1 : 0);
  }
  let bx = Math.max(8, Math.min(sw - tw - 8, ax - tw / 2));
  // stay clear of the hint pill along the bottom edge
  let by = Math.max(8, Math.min(sh - bh - 64, ay - bh));
  // keep the hero visible: move the bubble below the target if it would cover them
  const hs = toS(hero);
  if (hs.x > bx - 14 && hs.x < bx + tw + 14 && hs.y > by - 10 && hs.y < by + bh + 46) {
    by = onScreen ? Math.min(sh - bh - 64, toS(c.at).y + 26) : Math.max(8, by - 70);
    bx = Math.max(8, Math.min(sw - tw - 8, bx));
  }
  g.globalAlpha = appear;
  fillRR(g, bx, by + 3, tw, bh, 14, "rgba(0,0,0,.22)");
  fillRR(g, bx, by, tw, bh, 14, "#ffffff", col, 2.5);
  label(g, c.text, bx + tw / 2, by + bh / 2 + 1, 14, dc.pal.ink, null);
  g.globalAlpha = 1;
}
