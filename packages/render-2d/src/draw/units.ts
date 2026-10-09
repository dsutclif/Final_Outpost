import { alpha, mix } from "@fo/skins";
import type { CaptureView, CustomerView, DropView, PreyView, ResidentView, V } from "../view.js";
import { drawPerson, roleLook } from "./characters.js";
import type { DC } from "./dc.js";
import { drawItem } from "./items.js";
import { bar, circle, ellipse, fillRR, label, line, poly, rr, shadow } from "./prim.js";
import { register } from "./registry.js";

// Everything that walks: the player, residents, customers, prey; plus recruit containers,
// ground drops and the lasso rope. Positions arrive interpolated through dc.pos().

const OUT = "rgba(33,24,26,.5)";
const PLAYER_BODY = "#fbfbfb";

// ---------- player ----------

register("unit.player", (dc, e: { pos: V; key: string }) => {
  const g = dc.g, pl = dc.world.player;
  const p = dc.pos("player", pl.pos);
  // findability ring under the hero
  g.beginPath(); g.ellipse(p.x, p.y + 13, 17, 6.5, 0, 0, Math.PI * 2);
  g.strokeStyle = alpha(dc.pal.interactive, 0.9); g.lineWidth = 2.5; g.stroke();
  const bob = dc.t * 12 * dc.moving;
  drawPerson(dc, p.x, p.y, { body: PLAYER_BODY, helmet: "#ffffff", visor: "#ffb347", face: pl.face, bob, backpack: true, scale: 1.08 });
  // orange suit stripe makes the hero pop from colonists
  fillRR(g, p.x - 10, p.y - 1 + Math.sin(bob) * 1.5, 20, 3.5, 1.5, dc.pal.accent);
  drawBackStack(dc, p, pl.stack);
  void e;
});

/** Carried items stacked in one column per type behind the hero, wobbling as they walk. */
function drawBackStack(dc: DC, p: V, stack: readonly string[]): void {
  const counts = new Map<string, number>();
  for (const r of stack) counts.set(r, (counts.get(r) ?? 0) + 1);
  const order = Object.keys(dc.content.resources).filter((r) => counts.has(r));
  for (const r of counts.keys()) if (!order.includes(r)) order.push(r);
  order.forEach((res, ci) => {
    const n = Math.max(0, (counts.get(res) ?? 0) - dc.inFlight(res));
    const cx = p.x + (ci - (order.length - 1) / 2) * 24;
    for (let k = 0; k < n; k++) {
      const wob = Math.sin(dc.t * 9 - k * 0.55) * k * (0.25 + 0.6 * dc.moving);
      drawItem(dc, res, cx + wob, p.y - 30 - k * 7);
    }
    const cap = dc.content.resources[res]?.cap ?? null;
    if (cap !== null && (counts.get(res) ?? 0) >= cap) label(dc.g, dc.ui("max"), cx, p.y - 40 - n * 7, 9, dc.pal.danger, "#ffffff");
  });
}

// ---------- residents ----------

const IN_POD = new Set(["frozen", "towed"]);

register("unit.resident", (dc, r: ResidentView) => {
  const g = dc.g;
  const p = dc.pos(`r:${r.id}`, r.pos);
  const look = roleLook(dc, r.role);
  const v = dc.vel(`r:${r.id}`);
  const face = v.x < -0.05 ? -1 : 1;
  const status = r.status ?? "ok";
  if (IN_POD.has(status)) {
    if (dc.world.captures) return; // the capture draws the pod and the colonist inside it
    drawPod(dc, p, status === "towed" ? "towed" : "idle", 0, `r:${r.id}`);
    return;
  }
  if (status === "injured" || status === "healing") {
    drawPerson(dc, p.x, p.y, { body: look.body, hat: look.hat, lying: true });
    const heal = status === "healing";
    circle(g, p.x, p.y - 16, 7, heal ? dc.pal.ok : dc.pal.danger, "#ffffff", 1.5);
    label(g, heal ? "+" : "!", p.x, p.y - 16, 10, "#ffffff", null);
    return;
  }
  // lifeline low: residents shiver and frost over (the skin's distress look)
  const lifeK = lifelineK(dc);
  const cold = lifeK < 0.5 ? (0.5 - lifeK) * 2 : 0;
  const shiver = cold > 0 ? Math.sin(dc.t * 40 + Number(r.id)) * 1.2 * cold : 0;
  const moving = Math.abs(v.x) + Math.abs(v.y) > 0.2;
  const bob = moving ? dc.t * 10 + Number(r.id) : 0;
  const body = cold > 0 ? mix(look.body, "#bfe6ff", cold * 0.6) : look.body;
  const tint = status === "waiting" || status === "arriving" ? mix(look.body, "#9a9a9a", 0.5) : body;
  drawPerson(dc, p.x + shiver, p.y, { body: tint, hat: look.hat, ...(look.tool ? { tool: look.tool } : {}), face, bob });
  if (status === "waiting") label(g, dc.ui("needsHousing"), p.x, p.y - 32, 8, "#ffffff", dc.pal.danger);
  else if (status === "arriving") label(g, "!", p.x, p.y - 32, 16, dc.pal.accent);
  else if (status === "releasing") for (let d = 0; d < 3; d++) circle(g, p.x - 8 + d * 8, p.y + 14 + ((dc.t * 8 + d) % 4), 1.8, dc.pal.glass);
  if (r.carry && (r.n ?? 0) > 0) for (let k = 0; k < (r.n ?? 0); k++) drawItem(dc, r.carry, p.x, p.y - 28 - k * 7, 0.9);
});

export function lifelineK(dc: DC): number {
  const v = dc.world.meters?.lifeline ?? dc.world.core.lifeline;
  return Math.max(0, Math.min(1, v / 1_000_000));
}

// ---------- customers ----------

const TRADER_SUITS = ["#a7b0ba", "#9fb5a8", "#b5a79f", "#a59fb5"];

register("unit.customer", (dc, e: CustomerView & { key: string; idx: number; queued: boolean }) => {
  const g = dc.g;
  const p = dc.pos(e.key, e.pos);
  const vip = e.kind === "unit.customer_premium";
  const hurried = e.kind === "unit.customer_impatient";
  const body = vip ? "#ffcb3d" : TRADER_SUITS[e.idx % TRADER_SUITS.length]!;
  const walking = !e.queued;
  drawPerson(dc, p.x, p.y, { body, hat: vip ? "hat.crown" : "hat.none", face: walking ? 1 : -1, bob: walking ? dc.t * 10 : dc.t * 2, visor: vip ? "#7a4d00" : "#3b4a5a" });
  if (!e.queued) {
    if (e.angry) label(g, "!", p.x, p.y - 30, 14, dc.pal.danger);
    return;
  }
  // order bubble above the head (centred, so it never leaves the screen at the queue edge)
  fillRR(g, p.x - 20, p.y - 54, 40, 22, 9, "#ffffff", OUT, 1.5);
  poly(g, [p.x - 5, p.y - 33, p.x + 5, p.y - 33, p.x, p.y - 27], "#ffffff");
  drawItem(dc, e.res, p.x - 7, p.y - 43, 0.85);
  label(g, String(e.want), p.x + 12, p.y - 43, 12, dc.pal.ink, null);
  if (hurried) { // a clock badge marks the short fuse
    circle(g, p.x - 24, p.y - 50, 6.5, "#ffffff", dc.pal.danger, 2);
    line(g, p.x - 24, p.y - 50, p.x - 24, p.y - 54, dc.pal.danger, 1.5);
    line(g, p.x - 24, p.y - 50, p.x - 21.5, p.y - 50, dc.pal.danger, 1.5);
  }
  const k = e.patienceMax > 0 ? e.patience / e.patienceMax : 1;
  if (hurried || vip || e.patience < 12 * 30) bar(g, p.x - 13, p.y + 17, 26, 4.5, k, k < 0.35 ? dc.pal.danger : "#ffcb3d", "rgba(33,24,26,.4)");
});

// ---------- prey ----------

register("unit.prey", (dc, e: PreyView) => {
  if (!e.alive) return;
  const g = dc.g;
  const p = dc.pos(`p:${e.id}`, e.pos);
  const fl = dc.flash(`p:${e.id}`);
  const hop = Math.abs(Math.sin(dc.t * 5 + Number(e.id) * 1.7)) * 6;
  const col = fl > 0 ? "#ffffff" : "#d8b48a";
  shadow(g, p.x, p.y + 10, 12 - hop * 0.6);
  ellipse(g, p.x - 6, p.y + 6 - hop * 0.3, 5, 3, mix(col, "#000000", 0.3));
  ellipse(g, p.x + 6, p.y + 6 - hop * 0.3, 5, 3, mix(col, "#000000", 0.3));
  circle(g, p.x, p.y - hop, 11, col, OUT, 1.5);
  ellipse(g, p.x - 5, p.y - 12 - hop, 3, 7, col, -0.3);
  ellipse(g, p.x + 5, p.y - 12 - hop, 3, 7, col, 0.3);
  circle(g, p.x - 3.5, p.y - 2 - hop, 1.8, "#21181a");
  circle(g, p.x + 3.5, p.y - 2 - hop, 1.8, "#21181a");
  ellipse(g, p.x, p.y + 3 - hop, 4, 2.4, "#f3ece1");
});

// ---------- recruit containers ----------

function drawPod(dc: DC, p: V, state: string, openK: number, key: string): void {
  const g = dc.g;
  const help = state === "idle";
  shadow(g, p.x, p.y + 18, 22, 0.25);
  // colonist inside, tinted by the frost
  drawPerson(dc, p.x, p.y + 2, { body: "#a9cfe6", helmet: "#d6ecf8", visor: "#5d7f99", scale: 0.85 });
  const bw = 34, bh = 46;
  rr(g, p.x - bw / 2, p.y + 18 - bh, bw, bh, 15);
  g.fillStyle = alpha(dc.pal.glass, 0.42 - openK * 0.3); g.fill();
  g.strokeStyle = "#ffffff"; g.lineWidth = 2.5; g.stroke();
  fillRR(g, p.x - bw / 2 - 2, p.y + 12, bw + 4, 8, 4, dc.pal.structureDark, OUT, 1.5);
  // lid slides up as the pod opens
  if (openK > 0) fillRR(g, p.x - bw / 2, p.y + 18 - bh - 10 * openK, bw, 8, 4, dc.pal.structure, OUT, 1.5);
  line(g, p.x - bw / 2 + 6, p.y - 18, p.x - bw / 2 + 11, p.y - 24, "rgba(255,255,255,.9)", 2.5);
  if (help) label(g, dc.ui("help"), p.x, p.y - 36 + Math.sin(dc.t * 4) * 2, 10, dc.pal.interactive);
  if (state === "releasing") for (let k = 0; k < 3; k++) {
    const ph = (dc.t * 0.9 + k / 3) % 1;
    circle(g, p.x - 8 + k * 8, p.y - 26 - ph * 16, 3 + ph * 3, `rgba(255,255,255,${0.6 * (1 - ph)})`);
  }
  void key;
}

register("capture.*", (dc, c: CaptureView) => {
  const p = dc.pos(`c:${c.id}`, c.pos);
  const openK = c.state === "releasing" ? Math.min(1, dc.since(`cs:${c.id}`, c.state) / 1.6) : 0;
  drawPod(dc, p, c.state, openK, `c:${c.id}`);
});

// ---------- drops ----------

register("drop", (dc, d: DropView) => {
  const p = dc.w(d.pos);
  const bob = Math.sin(dc.t * 4 + Number(d.id)) * 2;
  dc.g.beginPath(); dc.g.ellipse(p.x, p.y + 6, 11, 4, 0, 0, Math.PI * 2);
  dc.g.fillStyle = alpha(dc.pal.interactive, 0.35 + 0.15 * Math.sin(dc.t * 6)); dc.g.fill();
  drawItem(dc, d.res, p.x, p.y - 2 + bob);
});

// ---------- lasso ----------

register("fx.lasso", (dc) => {
  const g = dc.g, w = dc.world;
  const pl = dc.pos("player", w.player.pos);
  const trail = w.lasso?.trail ?? [];
  if (trail.length > 1) {
    g.beginPath();
    const t0 = dc.w(trail[0]!);
    g.moveTo(t0.x, t0.y);
    for (const v of trail) { const q = dc.w(v); g.lineTo(q.x, q.y); }
    g.lineTo(pl.x, pl.y);
    g.setLineDash([7, 5]); g.strokeStyle = alpha(dc.pal.interactive, 0.9); g.lineWidth = 3; g.stroke(); g.setLineDash([]);
    circle(g, t0.x, t0.y, 5, dc.pal.interactive, "#ffffff", 1.5);
  }
  const tow = w.lasso?.towing ?? w.player.tow ?? [];
  if (tow.length && w.captures) {
    // the rope sags: a quadratic through a point below the midpoint
    for (const id of tow) {
      const c = w.captures.find((x) => x.id === id);
      if (!c) continue;
      const q = dc.pos(`c:${c.id}`, c.pos);
      const mx = (pl.x + q.x) / 2, my = (pl.y + q.y) / 2 + 12 + Math.sin(dc.t * 5) * 3;
      g.beginPath(); g.moveTo(pl.x, pl.y); g.quadraticCurveTo(mx, my, q.x, q.y - 10);
      g.strokeStyle = "#e9d8b8"; g.lineWidth = 2.5; g.stroke();
    }
  }
});
