import { FP } from "@fo/sim";
import { alpha, mix, type Skin } from "@fo/skins";
import type { ZoneView } from "../view.js";
import type { DC } from "./dc.js";
import { ellipse, fillRR, hash01, label, line, poly, type G } from "./prim.js";
import { register } from "./registry.js";

// Ground and map zones. The ground is static, so the renderer caches it per resize.

export function drawGround(g: G, skin: Skin, W: number, H: number): void {
  const p = skin.palette;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, mix(p.ground, p.groundDark, 0.35));
  grad.addColorStop(0.5, p.ground);
  grad.addColorStop(1, mix(p.ground, p.groundAlt, 0.6));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // dust patches
  for (let i = 0; i < 46; i++) {
    const x = hash01(i * 3 + 1) * W, y = hash01(i * 3 + 2) * H, r = 18 + hash01(i * 3 + 3) * 34;
    ellipse(g, x, y, r, r * 0.42, alpha(p.groundAlt, 0.55));
  }
  // cracked plates
  for (let i = 0; i < 22; i++) {
    let x = hash01(i * 7 + 11) * W, y = hash01(i * 7 + 12) * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (hash01(i * 7 + 13 + k) - 0.5) * 34;
      y += (hash01(i * 7 + 17 + k) - 0.3) * 18;
      g.lineTo(x, y);
    }
    g.strokeStyle = alpha(p.groundDark, 0.75);
    g.lineWidth = 1.5;
    g.stroke();
  }
  // pebbles with a lit edge
  for (let i = 0; i < 120; i++) {
    const x = hash01(i * 5 + 101) * W, y = hash01(i * 5 + 102) * H, r = 1.5 + hash01(i * 5 + 103) * 3.5;
    ellipse(g, x, y + 1, r, r * 0.7, alpha(p.groundDark, 0.9));
    ellipse(g, x - 0.5, y, r * 0.8, r * 0.55, alpha(mix(p.groundAlt, "#ffffff", 0.2), 0.9));
  }
}

register("zone.blocked", (dc, z: ZoneView) => {
  if (z.cleared) return;
  const g = dc.g;
  const x = z.rect.x / FP, y = z.rect.y / FP, w = z.rect.w / FP, h = z.rect.h / FP;
  fillRR(g, x, y, w, h, 14, mix(dc.pal.groundDark, "#000000", 0.15), alpha("#21181a", 0.5), 2);
  // boulders along the slide
  const n = Math.max(3, Math.floor(w / 34));
  for (let i = 0; i < n; i++) {
    const bx = x + 14 + (i / n) * (w - 20) + hash01(i + 7) * 10;
    const by = y + h * (0.35 + hash01(i + 31) * 0.3);
    const r = 10 + hash01(i + 53) * 10;
    poly(g, [bx - r, by + r * 0.5, bx - r * 0.6, by - r * 0.6, bx + r * 0.4, by - r, bx + r, by - r * 0.1, bx + r * 0.7, by + r * 0.6], mix(dc.pal.groundAlt, "#ffffff", 0.08), "rgba(33,24,26,.45)", 1.5);
  }
  label(g, dc.name("zone.blocked").toUpperCase(), x + w / 2, y + h / 2, 11, "#ffffff");
});

register("zone.waiting", (dc, z: ZoneView) => {
  const g = dc.g;
  const x = z.rect.x / FP, y = z.rect.y / FP, w = z.rect.w / FP, h = z.rect.h / FP;
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.fillStyle = alpha(dc.pal.accent, 0.18);
  g.fill();
  g.setLineDash([5, 5]);
  g.strokeStyle = dc.pal.accent;
  g.lineWidth = 2;
  g.stroke();
  g.setLineDash([]);
  label(g, dc.name("zone.waiting").toUpperCase(), x + w / 2, y + h + 10, 9, "#ffffff");
});

register("zone.prey", (dc, z: ZoneView) => {
  const g = dc.g;
  const x = z.rect.x / FP, y = z.rect.y / FP, w = z.rect.w / FP, h = z.rect.h / FP;
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.fillStyle = alpha(dc.pal.groundAlt, 0.45);
  g.fill();
  label(g, dc.name("zone.prey").toUpperCase(), x + w / 2, y - 10, 10, alpha("#ffffff", 0.85));
});

register("zone.*", (dc, z: ZoneView) => {
  const x = z.rect.x / FP, y = z.rect.y / FP, w = z.rect.w / FP, h = z.rect.h / FP;
  line(dc.g, x, y, x + w, y + h, alpha("#ffffff", 0.3), 1);
  label(dc.g, dc.name(z.type), x + w / 2, y + h / 2, 9, "#ffffff");
});
