import { mix } from "@fo/skins";
import { spriteKey, type DC } from "./dc.js";
import { TAU, circle, ellipse, fillRR, poly, rr, type G } from "./prim.js";

// Resource items: chunky icons about 22 x 12 world units, drawn by sprite key so each
// skin can pick a different look for the same canonical resource.

const OUT = "rgba(33,24,26,.45)";

type ItemFn = (g: G, x: number, y: number, c: string) => void;

const ITEMS: Record<string, ItemFn> = {
  "item.ore": (g, x, y, c) => {
    poly(g, [x - 10, y + 4, x - 7, y - 5, x + 1, y - 7, x + 9, y - 3, x + 10, y + 5, x + 1, y + 7], c, OUT, 1.5);
    poly(g, [x - 7, y - 5, x + 1, y - 7, x + 1, y, x - 4, y + 1], mix(c, "#ffffff", 0.45));
  },
  "item.alloy": (g, x, y, c) => {
    poly(g, [x - 11, y + 5, x - 7, y - 4, x + 7, y - 4, x + 11, y + 5], c, OUT, 1.5);
    poly(g, [x - 7, y - 4, x + 7, y - 4, x + 5, y - 1, x - 5, y - 1], "#ffffff");
  },
  "item.fuel_cell": (g, x, y, c) => {
    fillRR(g, x - 11, y - 5, 20, 10, 3, c, OUT, 1.5);
    fillRR(g, x + 9, y - 2.5, 3, 5, 1, mix(c, "#000000", 0.35));
    fillRR(g, x - 8, y - 3, 6, 6, 1.5, mix(c, "#ffffff", 0.55));
  },
  "item.greens": (g, x, y, c) => {
    const d = mix(c, "#0b3d12", 0.35);
    circle(g, x - 5, y + 1, 6, d, OUT, 1.5);
    circle(g, x + 5, y + 1, 6, d, OUT, 1.5);
    circle(g, x, y - 3, 7, c, OUT, 1.5);
    circle(g, x - 2, y - 5, 2, mix(c, "#ffffff", 0.6));
  },
  "item.protein": (g, x, y, c) => {
    ellipse(g, x, y, 10, 6.5, c);
    g.strokeStyle = OUT; g.lineWidth = 1.5; g.stroke();
    ellipse(g, x - 2, y - 2, 5, 2.2, mix(c, "#ffffff", 0.5));
  },
  "item.meal": (g, x, y, c) => {
    ellipse(g, x, y + 3, 12, 4.5, "#ffffff");
    g.strokeStyle = OUT; g.lineWidth = 1.5; g.stroke();
    ellipse(g, x, y - 1, 8.5, 5, mix(c, "#c26a2e", 0.55));
    ellipse(g, x - 2, y - 3, 3, 1.6, c);
  },
  "item.scrap": (g, x, y, c) => {
    poly(g, [x - 10, y - 4, x + 6, y - 6, x + 10, y + 3, x - 6, y + 6], c, OUT, 1.5);
    circle(g, x - 4, y, 1.8, mix(c, "#000000", 0.45));
    circle(g, x + 4, y - 1, 1.8, mix(c, "#000000", 0.45));
  },
  "item.coin": (g, x, y, c) => {
    circle(g, x, y, 6.5, c, mix(c, "#7a4d00", 0.55), 1.5);
    circle(g, x, y, 3.8, mix(c, "#ffffff", 0.35));
  },
  // Frozen-camp looks, kept for a skin that maps onto them later.
  "item.log": (g, x, y, c) => {
    rr(g, x - 11, y - 4, 22, 8, 4); g.fillStyle = c; g.fill();
    circle(g, x + 9, y, 3.5, mix(c, "#ffffff", 0.4));
  },
  "item.fish": (g, x, y, c) => {
    ellipse(g, x, y, 10, 5, c);
    poly(g, [x - 8, y, x - 15, y - 5, x - 15, y + 5], c);
    circle(g, x + 5, y - 1, 1.4, "#1f2a33");
  },
};

/** Fallback by resource category so unknown sprite keys still read as their kind. */
function genericItem(g: G, x: number, y: number, c: string): void {
  circle(g, x, y, 7, c, OUT, 1.5);
  circle(g, x - 2, y - 2, 2.2, mix(c, "#ffffff", 0.6));
}

export function drawItem(dc: DC, res: string, x: number, y: number, s = 1): void {
  const g = dc.g;
  const c = dc.pal.res[res] ?? dc.pal.interactive;
  const fn = ITEMS[spriteKey(dc, res)] ?? genericItem;
  if (s !== 1) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    fn(g, 0, 0, c);
    g.restore();
  } else fn(g, x, y, c);
}

/** A loose heap of coins, the currency pile at the register. */
export function drawCoinPile(dc: DC, x: number, y: number, n: number): void {
  const k = Math.min(10, n);
  for (let i = 0; i < k; i++) {
    const a = (i * 2.4) % TAU;
    drawItem(dc, "res.currency", x + Math.cos(a) * (i % 3) * 4, y - i * 2.6, 1.05);
  }
}
