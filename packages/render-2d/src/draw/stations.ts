import { alpha, mix } from "@fo/skins";
import { TPS } from "@fo/sim";
import type { ConverterView, SalesView, V } from "../view.js";
import { spriteKey, type DC } from "./dc.js";
import { drawCoinPile, drawItem } from "./items.js";
import { TAU, bar, circle, clamp01, ellipse, fillRR, label, line, poly, rr, shadow } from "./prim.js";
import { register } from "./registry.js";

// Core, sales point, gather nodes, converters and the depot. Visual states come from
// state values only: glow by fuel, shelf stock, node depletion, converter progress.

const OUT = "rgba(33,24,26,.5)";

// ---------- core ----------

/** Warm light on the ground, radius = the simulated safe radius. Drawn on the ground layer. */
register("sink.core.safe", (dc) => {
  const g = dc.g, c = dc.w(dc.world.core.pos), R = dc.safeR;
  if (R <= 0) return;
  const fuelK = dc.fuelCap > 0 ? clamp01(dc.world.core.fuel / dc.fuelCap) : 0;
  const lit = dc.world.core.fuel > 0;
  const flick = lit ? 0.9 + 0.1 * Math.sin(dc.t * 7) * (fuelK < 0.25 ? 2 : 0.5) : 0.5;
  const grad = g.createRadialGradient(c.x, c.y, 8, c.x, c.y, R);
  grad.addColorStop(0, alpha(dc.pal.accent, (lit ? 0.5 : 0.18) * flick));
  grad.addColorStop(0.7, alpha(dc.pal.accent, (lit ? 0.2 : 0.06) * flick));
  grad.addColorStop(1, alpha(dc.pal.accent, 0));
  g.fillStyle = grad;
  g.beginPath(); g.arc(c.x, c.y, R, 0, TAU); g.fill();
  g.beginPath(); g.arc(c.x, c.y, R, 0, TAU);
  g.setLineDash([5, 8]); g.lineDashOffset = -dc.t * 8;
  g.strokeStyle = alpha(lit ? dc.pal.accent : dc.pal.danger, 0.65); g.lineWidth = 2.5; g.stroke();
  g.setLineDash([]); g.lineDashOffset = 0;
});

register("sink.core", (dc) => {
  const g = dc.g, core = dc.world.core, c = dc.w(core.pos);
  const fk = dc.fuelCap > 0 ? clamp01(core.fuel / dc.fuelCap) : 0;
  const lit = core.fuel > 0;
  const big = 1 + (core.level - 1) * 0.12;
  shadow(g, c.x, c.y + 24, 34, 0.28);
  // hex base plate
  const hex: number[] = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; hex.push(c.x + Math.cos(a) * 32 * big, c.y + 10 + Math.sin(a) * 18 * big); }
  poly(g, hex, dc.pal.structureDark, OUT, 2);
  // housing
  fillRR(g, c.x - 22 * big, c.y - 26 * big, 44 * big, 42 * big, 12, dc.pal.structure, OUT, 2);
  fillRR(g, c.x - 22 * big, c.y - 2, 44 * big, 6, 3, "#2bb3a3");
  // window into the plasma chamber
  fillRR(g, c.x - 14 * big, c.y - 20 * big, 28 * big, 22 * big, 9, "#2a1d22");
  if (lit) {
    const fl = 0.85 + 0.15 * Math.sin(dc.t * 11) + 0.05 * Math.sin(dc.t * 23);
    const r = (6 + 7 * fk) * big * fl;
    const glow = g.createRadialGradient(c.x, c.y - 9 * big, 1, c.x, c.y - 9 * big, r * 2.4);
    glow.addColorStop(0, "rgba(255,250,220,1)");
    glow.addColorStop(0.35, alpha(dc.pal.accent, 0.95));
    glow.addColorStop(1, alpha(dc.pal.accent, 0));
    g.fillStyle = glow;
    g.beginPath(); g.arc(c.x, c.y - 9 * big, r * 2.4, 0, TAU); g.fill();
    circle(g, c.x, c.y - 9 * big, r * 0.6, "#fff6d8");
    // vent flames above the housing grow with fuel
    for (let k = -1; k <= 1; k++) {
      const h = (6 + 12 * fk) * (0.8 + 0.2 * Math.sin(dc.t * 9 + k * 2));
      poly(g, [c.x + k * 10 - 4, c.y - 26 * big, c.x + k * 10, c.y - 26 * big - h, c.x + k * 10 + 4, c.y - 26 * big], alpha(dc.pal.accent, 0.85));
    }
  } else {
    circle(g, c.x, c.y - 9 * big, 5, "#4a3a3e");
    if (Math.sin(dc.t * 13) > 0.92) circle(g, c.x + 3, c.y - 12 * big, 2, dc.pal.accent);
  }
  // fuel gauge
  bar(g, c.x - 30, c.y + 30, 60, 8, fk, fk < 0.3 ? dc.pal.danger : dc.pal.accent, "rgba(33,24,26,.35)");
  label(g, `Lv${core.level}`, c.x, c.y - 38 * big - 6, 10, "#ffffff");
});

// ---------- sales point ----------

register("sink.sales_point", (dc, s: SalesView) => {
  const g = dc.g, p = dc.w(s.pos);
  const accent = "#2bb3a3";
  shadow(g, p.x, p.y + 26, 46, 0.25);
  fillRR(g, p.x - 42, p.y - 24, 84, 50, 8, dc.pal.structure, OUT, 2);
  // awning
  fillRR(g, p.x - 48, p.y - 40, 96, 17, 7, accent, OUT, 2);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? "#ffffff" : accent;
    g.fillRect(p.x - 46 + i * 15.3, p.y - 24, 15.3, 6);
  }
  // one shelf row per sold type
  const cap = dc.content.sinks["sink.sales_point"]?.kind === "sales_point" ? (dc.content.sinks["sink.sales_point"] as { shelfCap: number }).shelfCap : 8;
  s.sells.forEach((res, r) => {
    const n = s.shelf[res] ?? 0;
    const y = p.y - 8 + r * (s.sells.length > 1 ? 15 : 10);
    for (let k = 0; k < n; k++) drawItem(dc, res, p.x - 30 + (k % 4) * 13 + (k >= 4 ? 5 : 0), y + (k >= 4 ? 5 : 0), 0.9);
    if (n >= cap) label(g, dc.ui("full"), p.x + 32, y, 8, "#ffffff");
  });
  if (dc.skin.labelAll) label(g, dc.name("sink.sales_point"), p.x, p.y + 34, 9, "#ffffff");
});

register("sink.sales_point.register", (dc, s: SalesView) => {
  const g = dc.g, r = dc.w(s.register), pile = dc.w(s.pile);
  const col = dc.registerStaffed ? dc.pal.ok : dc.pal.danger;
  rr(g, r.x - 20, r.y - 16, 40, 32, 9);
  g.fillStyle = alpha(col, 0.16); g.fill();
  g.setLineDash([5, 4]); g.strokeStyle = col; g.lineWidth = 2.5; g.stroke(); g.setLineDash([]);
  // till on a stand
  fillRR(g, r.x - 8, r.y - 26, 16, 10, 3, dc.pal.structure, OUT, 1.5);
  fillRR(g, r.x - 5, r.y - 24, 10, 4, 1.5, dc.pal.interactive);
  label(g, dc.ui("register"), r.x, r.y + 25, 9, "#ffffff");
  if (s.pileN > 0) {
    drawCoinPile(dc, pile.x, pile.y, s.pileN);
    label(g, String(s.pileN), pile.x, pile.y + 16, 12, dc.pal.res["res.currency"] ?? "#ffcb3d");
  }
});

// ---------- gather nodes ----------

function nodeMax(dc: DC, type: string): number | null {
  return dc.content.nodes[type]?.stock ?? null;
}

function regrowK(dc: DC, n: { type: string; regrowAcc?: number }): number {
  const ticks = dc.cp?.nodes[n.type]?.regrowTicks;
  return ticks ? clamp01((n.regrowAcc ?? 0) / ticks) : 0;
}

type NodeV = { id: string | null; type: string; pos: V; stock: number | null; regrowAcc?: number; enabled: boolean };

function lockBadge(dc: DC, x: number, y: number): void {
  const g = dc.g;
  circle(g, x, y, 9, "rgba(33,24,26,.75)");
  fillRR(g, x - 4.5, y - 1, 9, 7, 2, "#ffffff");
  g.beginPath(); g.arc(x, y - 1.5, 3.2, Math.PI, 0); g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.stroke();
}

function drawOrePile(dc: DC, n: NodeV): void {
  const g = dc.g, p = dc.w(n.pos);
  const max = nodeMax(dc, n.type) ?? 4;
  const k = n.stock === null ? max : n.stock;
  const col = dc.pal.res[dc.content.nodes[n.type]?.yields ?? ""] ?? dc.pal.structure;
  shadow(g, p.x, p.y + 12, 22, 0.2);
  ellipse(g, p.x, p.y + 8, 22, 9, mix(dc.pal.groundDark, "#000000", 0.1));
  const spots = [[-9, 0, 11], [9, 1, 10], [0, -8, 12], [-2, 6, 8], [12, -7, 7], [-13, -6, 7]] as const;
  const shown = Math.ceil((k / max) * spots.length);
  for (let i = 0; i < shown; i++) {
    const [dx, dy, r] = spots[i]!;
    poly(g, [p.x + dx - r, p.y + dy + r * 0.4, p.x + dx - r * 0.6, p.y + dy - r * 0.7, p.x + dx + r * 0.3, p.y + dy - r, p.x + dx + r, p.y + dy - r * 0.2, p.x + dx + r * 0.8, p.y + dy + r * 0.5], col, OUT, 1.5);
    poly(g, [p.x + dx - r * 0.6, p.y + dy - r * 0.7, p.x + dx + r * 0.3, p.y + dy - r, p.x + dx + r * 0.1, p.y + dy - r * 0.2], mix(col, "#ffffff", 0.5));
  }
  if (k <= 0) {
    const rk = regrowK(dc, n);
    g.beginPath(); g.arc(p.x, p.y, 10, -Math.PI / 2, -Math.PI / 2 + rk * TAU);
    g.strokeStyle = alpha(dc.pal.interactive, 0.9); g.lineWidth = 3; g.stroke();
  }
}

function drawGrowDome(dc: DC, n: NodeV): void {
  const g = dc.g, p = dc.w(n.pos);
  const on = n.enabled;
  const green = dc.pal.res[dc.content.nodes[n.type]?.yields ?? ""] ?? "#72e46e";
  shadow(g, p.x, p.y + 16, 34, 0.22);
  fillRR(g, p.x - 32, p.y + 4, 64, 12, 5, on ? dc.pal.structure : mix(dc.pal.structure, dc.pal.ground, 0.5), OUT, 2);
  // plants under the glass
  if (on) for (let i = 0; i < 5; i++) {
    const px = p.x - 20 + i * 10, sway = Math.sin(dc.t * 2 + i) * 1.5;
    circle(g, px + sway, p.y - 2 - (i % 2) * 5, 6, mix(green, "#0b3d12", 0.25 + (i % 2) * 0.15));
    circle(g, px + sway - 1, p.y - 4 - (i % 2) * 5, 2, mix(green, "#ffffff", 0.5));
  }
  // dome glass
  g.beginPath(); g.arc(p.x, p.y + 4, 30, Math.PI, 0); g.closePath();
  g.fillStyle = alpha(dc.pal.glass, on ? 0.35 : 0.15); g.fill();
  g.strokeStyle = on ? "#ffffff" : alpha("#ffffff", 0.5); g.lineWidth = 2.5; g.stroke();
  g.beginPath(); g.arc(p.x, p.y + 4, 30, Math.PI * 1.15, Math.PI * 1.45);
  g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 3; g.stroke();
  line(g, p.x, p.y - 26, p.x, p.y + 4, alpha("#ffffff", 0.45), 1.5);
  if (!on) {
    g.beginPath(); g.arc(p.x, p.y + 4, 34, Math.PI, 0); g.setLineDash([5, 5]); g.strokeStyle = alpha(dc.pal.interactive, 0.8); g.lineWidth = 2; g.stroke(); g.setLineDash([]);
    lockBadge(dc, p.x, p.y - 8);
  }
}

function drawFuelCache(dc: DC, n: NodeV): void {
  const g = dc.g, p = dc.w(n.pos);
  const col = dc.pal.res[dc.content.nodes[n.type]?.yields ?? ""] ?? "#c9f24e";
  shadow(g, p.x, p.y + 14, 26, 0.22);
  fillRR(g, p.x - 24, p.y - 10, 48, 24, 5, mix(dc.pal.structureDark, "#000000", 0.2), OUT, 2);
  for (let i = 0; i < 4; i++) {
    const glow = 0.6 + 0.4 * Math.sin(dc.t * 3 + i);
    fillRR(g, p.x - 19 + i * 10, p.y - 18, 8, 22, 3, mix(col, "#ffffff", 0.2 * glow), OUT, 1.2);
    fillRR(g, p.x - 17 + i * 10, p.y - 21, 4, 3, 1, "#3b3f46");
  }
}

const NODE_LOOKS: Record<string, (dc: DC, n: NodeV) => void> = {
  "node.ore_pile": drawOrePile,
  "node.grow_dome": drawGrowDome,
  "node.fuel_cache": drawFuelCache,
};

const NODE_DEFAULT_LOOK: Record<string, (dc: DC, n: NodeV) => void> = {
  "node.material_source": drawOrePile,
  "node.food_source": drawGrowDome,
  "node.fuel_deposit": drawFuelCache,
};

register("node.*", (dc, n: NodeV) => {
  const look = NODE_LOOKS[spriteKey(dc, n.type)] ?? NODE_DEFAULT_LOOK[n.type] ?? drawOrePile;
  look(dc, n);
  if (dc.skin.labelAll) { const p = dc.w(n.pos); label(dc.g, dc.name(n.type), p.x, p.y + 24, 8, "#ffffff"); }
});

// ---------- converters ----------

/** The operator spot and output pile sit on the ground layer. */
register("conv.spot", (dc, cv: ConverterView & { manned: boolean }) => {
  const g = dc.g;
  const def = dc.content.converters[cv.type];
  const op = cv.operatorPos ? dc.w(cv.operatorPos) : def ? { x: dc.w(cv.pos).x + def.operatorOffset[0], y: dc.w(cv.pos).y + def.operatorOffset[1] } : null;
  if (op) {
    const col = cv.manned ? dc.pal.ok : dc.pal.danger;
    rr(g, op.x - 18, op.y - 14, 36, 28, 8);
    g.fillStyle = alpha(col, 0.15); g.fill();
    g.setLineDash([4, 4]); g.strokeStyle = col; g.lineWidth = 2.5; g.stroke(); g.setLineDash([]);
    label(g, dc.ui("operator"), op.x, op.y + 22, 8, "#ffffff");
  }
});

register("conv.*", (dc, cv: ConverterView & { manned: boolean }) => {
  const g = dc.g, p = dc.w(cv.pos);
  const def = dc.content.converters[cv.type];
  const working = cv.manned && cv.inQ.length > 0;
  const key = spriteKey(dc, cv.type);
  shadow(g, p.x, p.y + 20, 30, 0.25);
  if (key === "conv.smelter" || cv.type === "conv.material_processor") {
    fillRR(g, p.x - 25, p.y - 19, 50, 38, 7, dc.pal.structure, OUT, 2);
    circle(g, p.x, p.y, 12, "#3b3f46", OUT, 1.5);
    g.save(); g.translate(p.x, p.y); g.rotate(dc.t * (working ? 6 : 0.4));
    for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.fillStyle = "#c9d3da"; g.fillRect(9, -2.5, 6, 5); }
    g.restore();
    circle(g, p.x, p.y, 5, working ? dc.pal.accent : "#6e6e6e");
  } else {
    fillRR(g, p.x - 25, p.y - 17, 50, 34, 8, mix(dc.pal.structureDark, "#000000", 0.35), OUT, 2);
    for (let k = 0; k < 3; k++) fillRR(g, p.x - 19 + k * 13, p.y - 11, 9, 22, 2, "#2a1d22");
    if (working) {
      const r = 6 + Math.sin(dc.t * 12) * 2;
      circle(g, p.x, p.y, r + 3, alpha(dc.pal.accent, 0.4));
      circle(g, p.x, p.y, r, dc.pal.accent);
    }
    fillRR(g, p.x + 14, p.y - 30, 7, 14, 2, dc.pal.structureDark);
    if (working) for (let k = 0; k < 3; k++) {
      const ph = (dc.t * 0.8 + k / 3) % 1;
      circle(g, p.x + 17 + ph * 4, p.y - 32 - ph * 18, 3 + ph * 4, `rgba(255,255,255,${0.5 * (1 - ph)})`);
    }
  }
  // input stock on the left, progress on top
  cv.inQ.slice(0, 8).forEach((res, k) => drawItem(dc, res, p.x - 42, p.y + 12 - k * 5, 0.9));
  if (cv.inQ.length) label(g, dc.ui("in"), p.x - 42, p.y + 25, 8, "#ffffff");
  if (def && cv.acc > 0) {
    const rateTicks = Math.max(1, Math.round(def.rate * TPS));
    bar(g, p.x - 20, p.y - 28, 40, 5, cv.acc / rateTicks, dc.pal.ok, "rgba(33,24,26,.35)");
  }
  if (!cv.manned && cv.inQ.length) {
    circle(g, p.x + 22, p.y - 22, 8, dc.pal.danger, "#ffffff", 2);
    label(g, "!", p.x + 22, p.y - 22, 11, "#ffffff", null);
  }
  // output pile at the pickup anchor
  if (def) {
    const pk = cv.pickupPos ? dc.w(cv.pickupPos) : { x: p.x + def.pickupOffset[0], y: p.y + def.pickupOffset[1] };
    for (let k = 0; k < Math.min(cv.out, 8); k++) drawItem(dc, def.output, pk.x, pk.y + 10 - k * 5, 0.95);
    if (cv.out > 0) label(g, dc.ui("out"), pk.x, pk.y + 24, 8, "#ffffff");
  }
  if (dc.skin.labelAll) label(g, dc.name(cv.type), p.x, p.y + 32, 8, "#ffffff");
});

// ---------- depot ----------

register("struct.depot", (dc, d: { pos: V; stock?: Record<string, number> }) => {
  const g = dc.g, p = dc.w(d.pos);
  shadow(g, p.x, p.y + 28, 50, 0.25);
  fillRR(g, p.x - 46, p.y - 22, 92, 50, 6, dc.pal.structure, OUT, 2);
  poly(g, [p.x - 52, p.y - 18, p.x, p.y - 44, p.x + 52, p.y - 18], dc.pal.structureDark, OUT, 2);
  fillRR(g, p.x - 16, p.y + 2, 32, 26, 3, mix(dc.pal.structureDark, "#000000", 0.25));
  for (let k = 0; k < 4; k++) line(g, p.x - 16, p.y + 7 + k * 5, p.x + 16, p.y + 7 + k * 5, "rgba(255,255,255,.25)", 1.5);
  const entries = Object.entries(d.stock ?? {}).filter(([, n]) => n > 0).slice(0, 4);
  entries.forEach(([res, n], i) => {
    const x = p.x - 36 + i * 24;
    drawItem(dc, res, x, p.y - 8, 0.8);
    label(g, String(n), x, p.y + 4, 9, "#ffffff");
  });
  if (dc.skin.labelAll) label(g, dc.name("struct.depot"), p.x, p.y + 36, 8, "#ffffff");
});
