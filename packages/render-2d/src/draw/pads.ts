import { alpha } from "@fo/skins";
import type { PadView } from "../view.js";
import { drawPerson, roleLook } from "./characters.js";
import type { DC, PadInfo } from "./dc.js";
import { drawItem } from "./items.js";
import { FONT, circle, fillRR, label, line, poly, popScale, rr, type G } from "./prim.js";
import { register } from "./registry.js";

// Build and hire pads: a dashed plot that fills like a progress bar as payment pours in.
// Each pad says what it does (icon + name), what it costs (one row per resource, counting
// down) and, when locked, why. Hire pads show the role's portrait and its route.

function textW(g: G, s: string, size: number): number {
  g.font = `800 ${size}px ${FONT}`;
  return g.measureText?.(s)?.width ?? s.length * size * 0.55;
}

function lockReason(dc: DC, info: PadInfo): string {
  if (info.kind === "hire") return dc.ui("noIdle");
  if (info.requiresCoreLevel !== undefined && dc.world.core.level < info.requiresCoreLevel) return dc.ui("needsCoreLevel", { n: info.requiresCoreLevel });
  if (info.requiresLabel) return dc.ui("needsPad", { name: info.requiresLabel });
  return dc.ui("locked");
}

/** Small glyph for what a build pad makes. */
function buildGlyph(dc: DC, info: PadInfo, x: number, y: number, col: string): void {
  const g = dc.g;
  const w = info.what;
  if (w === "node.enable") {
    fillRR(g, x - 5, y - 1, 10, 8, 2, col);
    g.beginPath(); g.arc(x + 3, y - 2, 3.5, Math.PI, Math.PI * 1.9); g.strokeStyle = col; g.lineWidth = 2; g.stroke();
  } else if (w === "sink.core.level") {
    poly(g, [x - 5, y + 6, x - 4, y, x - 1, y + 2, x, y - 7, x + 2, y, x + 5, y - 2, x + 5, y + 6], col);
  } else if (w === "zone.clear") {
    line(g, x - 5, y + 6, x + 4, y - 5, col, 2.2);
    g.beginPath(); g.moveTo(x - 1, y - 7); g.quadraticCurveTo(x + 5, y - 7, x + 7, y - 1); g.strokeStyle = col; g.lineWidth = 2.4; g.stroke();
  } else if (w.startsWith("conv.")) {
    circle(g, x, y, 6, col);
    circle(g, x, y, 2.4, "rgba(33,24,26,.6)");
  } else if (/\.t\d$/.test(w) || w.includes("reinforced")) {
    poly(g, [x, y - 7, x + 6, y, x + 2.5, y, x + 2.5, y + 6, x - 2.5, y + 6, x - 2.5, y, x - 6, y], col);
  } else {
    poly(g, [x - 7, y - 1, x, y - 7, x + 7, y - 1], col);
    g.fillStyle = col; g.fillRect(x - 5, y - 1, 10, 7);
  }
}

/**
 * The payment boundary (the sim's pad range): fades in, dashed, over the last 40 units of
 * approach; inside, a white arc winds up over the sim's dwell time, then the ring spins while
 * paying, so a walk across a pad never spends without the player seeing it coming.
 */
/**
 * Wind-up toward payment, 0..1, from the sim's pad dwell (state.player.padDwell ticks on the
 * pad named in player state, over the compiled pads.dwellTicks); null before the sim has it.
 */
export function dwellK(dc: DC, padId: string): number | null {
  const pl = dc.world.player as unknown as Record<string, unknown>;
  const ticks = pl["padDwell"];
  const need = (dc.cp?.pads as unknown as Record<string, unknown> | undefined)?.["dwellTicks"];
  if (typeof ticks !== "number" || typeof need !== "number") return null;
  const on = pl["padId"] ?? pl["dwellPad"] ?? pl["pad"];
  if (on !== undefined && on !== null && on !== padId) return 0;
  return need <= 0 ? 1 : Math.max(0, Math.min(1, ticks / need));
}

function payRing(dc: DC, p: { x: number; y: number }, pl: { x: number; y: number }, rangeFp: number | undefined, col: string, wind: number | null = null): void {
  if (!rangeFp) return;
  const r = dc.w({ x: rangeFp, y: 0 }).x, near = 40;
  const d = Math.hypot(pl.x - p.x, pl.y - p.y);
  if (d > r + near) return;
  const g = dc.g, inside = d <= r;
  g.save();
  g.globalAlpha = inside ? 1 : Math.max(0.25, 1 - (d - r) / near);
  g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.lineWidth = 2.5; g.strokeStyle = col;
  if (!inside) g.setLineDash([7, 6]);
  g.stroke();
  g.setLineDash([]);
  if (inside && wind !== null && wind < 1) {
    // winding up: a white arc fills clockwise; payment starts when it closes
    g.lineWidth = 5; g.lineCap = "round"; g.strokeStyle = "#ffffff";
    g.beginPath(); g.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * wind); g.stroke();
  } else if (inside) {
    g.lineWidth = 4; g.lineCap = "round"; g.strokeStyle = "#ffffff";
    const a0 = dc.t * 2.4;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(p.x, p.y, r, a0 + (i * 2 * Math.PI) / 3, a0 + (i * 2 * Math.PI) / 3 + 0.6); g.stroke(); }
  }
  g.restore();
}

function drawPad(dc: DC, pad: PadView & { locked: boolean }): void {
  const info = dc.pads.get(pad.id);
  if (!info) return;
  const g = dc.g, p = dc.w(pad.pos);
  const big = info.big || !!info.goal;
  const costs = Object.entries(info.cost);
  const reason = pad.locked ? lockReason(dc, info) : "";
  const nameSize = big ? 14 : 11.5;
  const hasRoute = info.kind === "hire" && (info.from || info.to);
  const contentW = Math.max(textW(g, info.label, nameSize) + 22, pad.locked ? textW(g, reason, 9.5) + 26 : costs.length * 46, hasRoute ? 62 : 0);
  const w = Math.max(big ? 108 : 78, contentW + 12), h = big ? 64 : hasRoute && !pad.locked ? 62 : 54;
  const total = costs.reduce((a, [, n]) => a + n, 0) || 1;
  const paid = costs.reduce((a, [r, n]) => a + Math.min(n, pad.paid[r] ?? 0), 0);
  const k = paid / total;
  const col = pad.locked ? "#c9bfb0" : big ? dc.pal.accent : dc.pal.interactive;
  const pl = dc.w(dc.world.player.pos);
  const onIt = !pad.locked && Math.abs(pl.x - p.x) < w / 2 + 6 && Math.abs(pl.y - p.y) < h / 2 + 6;
  const pulse = onIt ? 1 + 0.04 * Math.sin(dc.t * 12) : 1;
  const [sx, sy] = popScale(dc.popAge(`pad:${pad.id}`));
  const fresh = dc.since(`padpaid:${pad.id}`, String(paid));
  if (!pad.locked) payRing(dc, p, pl, info.big ? dc.cp?.pads.bigRange : dc.cp?.pads.range, col, dwellK(dc, pad.id));

  g.save();
  g.translate(p.x, p.y);
  g.scale(sx * pulse, sy * pulse);
  // plate with a soft drop so the pad reads as a raised slab on the dust
  rr(g, -w / 2, -h / 2 + 3, w, h, 12);
  g.fillStyle = "rgba(33,24,26,.18)"; g.fill();
  rr(g, -w / 2, -h / 2, w, h, 12);
  g.fillStyle = pad.locked ? "rgba(33,24,26,.42)" : alpha("#21181a", 0.5);
  g.fill();
  // fill pours in: a liquid surface that sloshes right after each payment
  if (k > 0) {
    g.save();
    rr(g, -w / 2, -h / 2, w, h, 12);
    g.clip();
    const top = h / 2 - h * k;
    const slosh = Math.max(0, 1 - fresh * 2.5) * 3 + 1;
    g.beginPath();
    g.moveTo(-w / 2, h / 2);
    for (let x = -w / 2; x <= w / 2 + 0.1; x += w / 8) g.lineTo(x, top + Math.sin(x * 0.12 + dc.t * 6) * slosh);
    g.lineTo(w / 2, h / 2);
    g.closePath();
    g.fillStyle = alpha(col, 0.62);
    g.fill();
    g.restore();
  }
  rr(g, -w / 2, -h / 2, w, h, 12);
  g.setLineDash(pad.locked ? [4, 5] : [8, 5]);
  g.lineDashOffset = onIt ? -dc.t * 30 : 0;
  g.lineWidth = 3;
  g.strokeStyle = col;
  g.stroke();
  g.setLineDash([]);
  g.lineDashOffset = 0;

  // title row: glyph + name
  const ty = -h / 2 + (big ? 15 : 13);
  const nameW = textW(g, info.label, nameSize);
  if (info.kind === "build") buildGlyph(dc, info, -nameW / 2 - 7, ty, pad.locked ? "#e8dfd2" : "#ffffff");
  label(g, info.label, info.kind === "build" ? 5 : 0, ty, nameSize, "#ffffff");
  if (pad.locked) {
    // padlock + reason
    const ry = big ? 12 : 10;
    const rw = textW(g, reason, 9.5);
    const lx = -rw / 2 - 8;
    fillRR(g, lx - 4, ry - 1, 8, 7, 1.5, "#f3ece1");
    g.beginPath(); g.arc(lx, ry - 1.5, 2.8, Math.PI, 0); g.strokeStyle = "#f3ece1"; g.lineWidth = 1.8; g.stroke();
    label(g, reason, 5, ry + 2, 9.5, "#f3ece1");
  } else {
    if (hasRoute) {
      // where the worker takes from and delivers to
      const ry = -2;
      const fromRes = info.from ? resOf(dc, info.from) : null;
      const toIcon = info.to ? info.to : null;
      if (fromRes) drawItem(dc, fromRes, -16, ry, 0.7);
      poly(g, [-4, ry - 3, 3, ry, -4, ry + 3], "#ffffff");
      if (toIcon) destGlyph(dc, toIcon, 16, ry);
    }
    const cy = big ? 13 : hasRoute ? 18 : 10;
    costs.forEach(([res, n], i) => {
      const left = Math.max(0, n - (pad.paid[res] ?? 0));
      const cx = -(costs.length - 1) * 23 + i * 46 - 8;
      drawItem(dc, res, cx, cy, 0.95);
      label(g, String(left), cx + 10, cy, 14, left === 0 ? dc.pal.ok : "#ffffff", undefined, "left");
    });
  }
  if (info.goal) {
    // the goal pad wears a flag so it reads as "this wins the level"
    line(g, w / 2 - 12, -h / 2 - 2, w / 2 - 12, -h / 2 - 26, "#ffffff", 2.5);
    poly(g, [w / 2 - 12, -h / 2 - 26, w / 2 + 6 + Math.sin(dc.t * 5) * 2, -h / 2 - 21, w / 2 - 12, -h / 2 - 15], dc.pal.accent, "#ffffff", 1.5);
  }
  // hire pads carry a portrait of the role, so the silhouette tells what you buy
  if (info.kind === "hire") {
    circle(g, w / 2 - 6, -h / 2 + 4, 14, "rgba(255,255,255,.95)", col, 2.5);
    const look = roleLook(dc, info.what);
    drawPerson(dc, w / 2 - 6, -h / 2 + 10, { body: look.body, hat: look.hat, ...(look.tool ? { tool: look.tool } : {}), scale: 0.58, visor: "#2a4f6e" });
  }
  g.restore();
}

/** Resource a source id yields: a node's yield, a prey drop, a converter's output. */
function resOf(dc: DC, src: string): string | null {
  const node = dc.content.nodes[src];
  if (node) return node.yields;
  const conv = dc.content.converters[src];
  if (conv) return conv.output;
  const animal = dc.content.animals[src];
  if (animal) return Object.keys(animal.drops)[0] ?? null;
  return null;
}

/** Tiny picture of a destination: reactor flame, kiosk awning, converter gear, depot box. */
function destGlyph(dc: DC, to: string, x: number, y: number): void {
  const g = dc.g;
  if (to === "sink.core") {
    poly(g, [x - 5, y + 5, x - 4, y - 1, x - 1, y + 1, x, y - 7, x + 2, y - 1, x + 5, y - 3, x + 5, y + 5], dc.pal.accent);
    circle(g, x, y + 2, 2.3, "#fff3a0");
  } else if (to === "sink.sales_point") {
    fillRR(g, x - 7, y - 6, 14, 5, 2, "#2bb3a3");
    fillRR(g, x - 6, y - 1, 12, 7, 1.5, "#ffffff");
  } else if (to.startsWith("conv.")) {
    circle(g, x, y, 6, "#c9d3da");
    circle(g, x, y, 2.4, "#3b3f46");
  } else {
    fillRR(g, x - 6, y - 5, 12, 10, 2, "#c9bfb0");
  }
}

register("pad.hire", drawPad);
register("pad.build", drawPad);
register("pad.*", drawPad);

/** Pad label from the manifest: the role for hires, the build target for builds. */
export function padLabel(dc: Pick<DC, "name" | "ui">, kind: "hire" | "build", what: string, targetType?: string, level?: number): string {
  if (kind === "hire") return dc.name(what);
  if (what.startsWith("struct.") || what.startsWith("conv.")) return dc.name(what);
  if (what === "node.enable") return dc.ui("unlock", { name: targetType ? dc.name(targetType) : "" }).trim();
  if (what === "sink.core.level") return dc.ui("coreLevel", { n: level ?? 2 });
  if (what === "zone.clear") return dc.ui("clear", { name: dc.name(targetType ?? "zone.blocked") });
  return dc.name(what);
}
