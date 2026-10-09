import { alpha } from "@fo/skins";
import type { PadView } from "../view.js";
import { drawPerson, roleLook } from "./characters.js";
import type { DC } from "./dc.js";
import { drawItem } from "./items.js";
import { circle, label, popScale, rr } from "./prim.js";
import { register } from "./registry.js";

// Build and hire pads: a dashed plot that fills like a progress bar as payment pours in,
// with a cost row per resource and a lock state for core-level gates.

function drawPad(dc: DC, pad: PadView & { locked: boolean }): void {
  const info = dc.pads.get(pad.id);
  if (!info) return;
  const g = dc.g, p = dc.w(pad.pos);
  const big = info.big;
  const w = Math.max(big ? 104 : 74, info.label.length * 6.8 + 18), h = big ? 62 : 52;
  const costs = Object.entries(info.cost);
  const total = costs.reduce((a, [, n]) => a + n, 0) || 1;
  const paid = costs.reduce((a, [r, n]) => a + Math.min(n, pad.paid[r] ?? 0), 0);
  const k = paid / total;
  const col = pad.locked ? "#c9bfb0" : big ? dc.pal.accent : dc.pal.interactive;
  const pl = dc.w(dc.world.player.pos);
  const onIt = !pad.locked && Math.abs(pl.x - p.x) < w / 2 && Math.abs(pl.y - p.y) < h / 2;
  const pulse = onIt ? 1 + 0.04 * Math.sin(dc.t * 12) : 1;
  const [sx, sy] = popScale(dc.popAge(`pad:${pad.id}`));

  g.save();
  g.translate(p.x, p.y);
  g.scale(sx * pulse, sy * pulse);
  rr(g, -w / 2, -h / 2, w, h, 11);
  g.fillStyle = alpha(pad.locked ? "#21181a" : col, pad.locked ? 0.18 : 0.22);
  g.fill();
  // fill rises with payment
  g.save();
  rr(g, -w / 2, -h / 2, w, h, 11);
  g.clip();
  g.fillStyle = alpha(col, 0.55);
  g.fillRect(-w / 2, h / 2 - h * k, w, h * k);
  g.restore();
  rr(g, -w / 2, -h / 2, w, h, 11);
  g.setLineDash([7, 5]);
  g.lineDashOffset = onIt ? -dc.t * 30 : 0;
  g.lineWidth = 3;
  g.strokeStyle = col;
  g.stroke();
  g.setLineDash([]);
  g.lineDashOffset = 0;

  label(g, info.label, 0, -h / 2 + (big ? 16 : 14), big ? 14 : 11.5, "#ffffff");
  if (pad.locked) {
    const need = info.requiresCoreLevel ?? 2;
    label(g, dc.ui("needsCoreLevel", { n: need }), 0, 9, 10, "#f3ece1");
  } else {
    const cy = big ? 12 : 10;
    costs.forEach(([res, n], i) => {
      const left = Math.max(0, n - (pad.paid[res] ?? 0));
      const cx = -(costs.length - 1) * 23 + i * 46 - 8;
      drawItem(dc, res, cx, cy, 0.9);
      label(g, String(left), cx + 10, cy, 13, "#ffffff", undefined, "left");
    });
  }
  // hire pads carry a portrait of the role, so the silhouette tells what you buy
  if (info.kind === "hire") {
    circle(g, w / 2 - 6, -h / 2 + 4, 13, "rgba(255,255,255,.92)", col, 2);
    const look = roleLook(dc, info.what);
    drawPerson(dc, w / 2 - 6, -h / 2 + 10, { body: look.body, hat: look.hat, scale: 0.55, visor: "#2a4f6e" });
  }
  g.restore();
}

register("pad.hire", drawPad);
register("pad.build", drawPad);
register("pad.*", drawPad);

/** Pad label from the manifest: the role for hires, the build target for builds. */
export function padLabel(dc: Pick<DC, "name" | "ui">, kind: "hire" | "build", what: string, targetType?: string, level?: number): string {
  if (kind === "hire") return dc.name(what);
  if (what.startsWith("struct.")) return dc.name(what);
  if (what === "node.enable") return dc.ui("unlock", { name: targetType ? dc.name(targetType) : "" }).trim();
  if (what === "sink.core.level") return dc.ui("coreLevel", { n: level ?? 2 });
  if (what === "zone.clear") return dc.ui("clear", { name: dc.name("zone.blocked") });
  return dc.name(what);
}

