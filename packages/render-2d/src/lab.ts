import { content as defaultContent, type Content, type Manifest } from "@fo/content";
import { FP } from "@fo/sim";
import { nameOf, uiText, type Skin } from "@fo/skins";
import { drawPerson, roleLook } from "./draw/characters.js";
import type { DC, PadInfo } from "./draw/dc.js";
import { drawItem } from "./draw/items.js";
import { fillRR, label } from "./draw/prim.js";
import { drawEntity, hasDraw } from "./draw/registry.js";
import type { WorldView } from "./view.js";
// Group files register their draw routines on import.
import "./draw/stations.js";
import "./draw/pads.js";
import "./draw/units.js";
import "./draw/structures.js";
import "./draw/defense.js";
import "./draw/world.js";

// Asset lab support: draw any canonical id, in a named visual state, centred in a cell.
// The client's #lab route lays these out per skin; tests use labVariants() to check that
// every drawable id has a real routine.

const O = { x: 0, y: 0 };
const v = (x: number, y: number) => ({ x: x * FP, y: y * FP });

function blankWorld(): WorldView {
  return {
    tick: 0, currency: 20,
    player: { pos: v(0, 400), face: 1, stack: [], tow: [] },
    core: { pos: v(0, 400), fuel: 12, level: 1, lifeline: 1_000_000 },
    nodes: [], sales: null, residents: [], pads: [], built: [], structures: [], barriers: [], zones: [], preyZones: [],
    captures: [], prey: [], hostiles: [], drops: [], converters: [], depot: null,
    meters: { lifeline: 1_000_000, baseHealth: 10, baseHealthMax: 10 }, waves: { idx: 0, pending: [], active: false },
    hazard: { phase: "none", until: 0 }, lasso: { trail: [], towing: [], engaged: false }, gateQueue: [],
    over: false, won: null, reason: null,
  };
}

function labDC(g: CanvasRenderingContext2D, skin: Skin, content: Content, manifest: Manifest, world: WorldView, pads: Map<string, PadInfo>, t: number): DC {
  return {
    g, skin, pal: skin.palette, content, manifest, cp: null, world, t,
    pos: (_k, p) => ({ x: p.x / FP, y: p.y / FP }),
    w: (p) => ({ x: p.x / FP, y: p.y / FP }),
    name: (id) => nameOf(skin, id),
    ui: (k, vars) => uiText(skin, k, vars),
    flash: () => 0, popAge: () => Infinity, inFlight: () => 0,
    safeR: 60, fuelCap: 20, pads, registerStaffed: false, px: 1, moving: 0,
    since: () => 1, vel: () => ({ x: 0, y: 0 }), knock: () => null, sway: { x: 0, y: 0 }, outside: false, quality: "high",
  };
}

/** Visual states the lab shows per id category. */
export function labVariants(id: string): string[] {
  const cat = id.split(".")[0];
  if (id === "sink.core") return ["full", "low", "out"];
  if (cat === "node") return id === "node.prey" ? ["alive"] : ["full", "empty", "locked"];
  if (cat === "conv") return ["working", "idle"];
  if (cat === "capture") return ["idle", "towed", "releasing"];
  if (cat === "struct" && !id.includes(".t2") && !id.includes("reinforced") && id !== "struct.barrier" && id !== "struct.gate") return ["ok", "damaged"];
  if (id === "struct.barrier" || id === "barrier.line") return ["unbuilt", "built", "cracked"];
  if (id === "struct.gate") return ["arrivals", "line"];
  if (cat === "pad") return ["open", "half", "locked"];
  if (cat === "hostile") return ["walk", "hurt"];
  if (id === "unit.resident") return ["ok", "injured", "waiting"];
  return ["default"];
}

/** True when the lab has a real picture for this id (not a text chip). */
export function labDrawable(id: string): boolean {
  const cat = id.split(".")[0] ?? "";
  if (["res", "role", "node", "conv", "capture", "struct", "hostile", "pad", "zone"].includes(cat)) return true;
  return ["sink.core", "sink.sales_point", "sink.sales_point.register", "unit.player", "unit.resident", "unit.prey", "unit.customer", "unit.customer_impatient", "unit.customer_premium", "barrier.line", "store.depot", "sink.depot"].includes(id);
}

export interface LabCellOpts { skin: Skin; manifest: Manifest; content?: Content; t?: number }

/** Draw one id in one state, centred in a w x h cell (CSS px, the caller sets the dpr transform). */
export function drawLabCell(g: CanvasRenderingContext2D, id: string, variant: string, w: number, h: number, o: LabCellOpts): void {
  const content = o.content ?? defaultContent;
  const world = blankWorld();
  const pads = new Map<string, PadInfo>();
  const dc = labDC(g, o.skin, content, o.manifest, world, pads, o.t ?? 0.5);
  const cat = id.split(".")[0] ?? "";
  g.save();
  g.translate(w / 2, h * 0.62);
  const big = ["struct.landmark", "sink.sales_point", "struct.depot", "store.depot", "sink.depot", "zone.blocked", "zone.terrain", "zone.waiting", "zone.prey", "struct.barrier", "barrier.line", "struct.gate"].includes(id) || cat === "pad";
  const k = Math.min(w, h) / (big ? 150 : 84);
  g.scale(k, k);
  const e = (extra: Record<string, unknown>) => ({ id: "lab", type: id, pos: O, ...extra });
  if (cat === "res") drawItem(dc, id, 0, -10, 2);
  else if (cat === "role") {
    const look = roleLook(dc, id);
    drawPerson(dc, 0, 0, { body: look.body, hat: look.hat, ...(look.tool ? { tool: look.tool } : {}), scale: 1.6 });
  } else if (id === "unit.player") {
    drawEntity(dc, "unit.player", { pos: O });
  } else if (id === "unit.resident") {
    world.residents = [{ id: 1, pos: O, role: "idle", status: variant === "default" ? "ok" : variant }];
    drawEntity(dc, "unit.resident", world.residents[0]!);
  } else if (id.startsWith("unit.customer")) {
    drawEntity(dc, "unit.customer", { kind: id, res: Object.keys(content.resources)[3] ?? "res.food_raw_1", want: 2, patience: 100, patienceMax: 300, pos: O, key: "lab", idx: 0, queued: true });
  } else if (id === "unit.prey" || id === "node.prey") {
    drawEntity(dc, "unit.prey", { id: 1, pos: O, alive: true });
  } else if (cat === "node") {
    drawEntity(dc, id, e({ stock: variant === "empty" ? 0 : null, enabled: variant !== "locked", regrowAcc: 0 }));
  } else if (cat === "conv") {
    const def = content.converters[id];
    const working = variant === "working";
    if (working) world.player.pos = v(def?.operatorOffset[0] ?? 0, def?.operatorOffset[1] ?? 48);
    drawEntity(dc, "conv.spot", e({ inQ: [], out: 0, acc: 0, operatorPos: v(def?.operatorOffset[0] ?? 0, (def?.operatorOffset[1] ?? 48) * 0.6), pickupPos: v(def?.pickupOffset[0] ?? 54, 0), manned: working }));
    drawEntity(dc, id, e({ inQ: working ? (def?.inputs ?? []).slice(0, 2) : [], out: working ? 2 : 0, acc: working ? 20 : 0, operatorPos: v(0, 30), pickupPos: v(40, 0), manned: working }));
  } else if (id === "sink.core") {
    world.core.fuel = variant === "full" ? 20 : variant === "low" ? 3 : 0;
    world.core.pos = O;
    drawEntity(dc, "sink.core.safe", world.core);
    drawEntity(dc, "sink.core", world.core);
  } else if (id === "sink.sales_point" || id === "sink.sales_point.register" || id === "sink.sales_point.pile") {
    const sells = Object.keys(content.resources).filter((r) => r.startsWith("res.food")).slice(0, 2);
    const sales = { pos: O, register: v(0, 40), pile: v(-40, 40), pileN: 6, shelf: Object.fromEntries(sells.map((r) => [r, 3])), sells, queue: [], leaving: [] };
    if (id === "sink.sales_point") drawEntity(dc, "sink.sales_point", sales);
    else { g.translate(0, -40); drawEntity(dc, "sink.sales_point.register", sales); }
  } else if (id === "store.depot" || id === "sink.depot" || id === "struct.depot") {
    drawEntity(dc, "struct.depot", { pos: O, stock: { "res.material_basic": 4, "res.food_raw_1": 2 } });
  } else if (id === "struct.barrier" || id === "barrier.line" || (id === "struct.gate" && variant === "line")) {
    const gate = id === "struct.gate";
    const built = variant !== "unbuilt";
    world.player.pos = v(0, 300);
    drawEntity(dc, "barrier", { id: "lab", a: v(-60, 0), b: v(60, 0), res: "res.currency", costPerSection: 8, sections: [{ a: v(-60, 0), b: v(60, 0), built, hp: variant === "cracked" ? 3 : 14, hpMax: 14, gate, paid: built ? 8 : 3 }] });
  } else if (cat === "struct") {
    const base = id.replace(/\.t2$/, "").replace(/\.reinforced$/, "");
    const type = base === "struct.barrier" ? "struct.housing" : base;
    world.gateQueue = id === "struct.gate" ? [1, 2] : [];
    drawEntity(dc, type, { id: "lab", type, pos: O, level: id.endsWith(".t2") ? 2 : 1, ...(variant === "damaged" ? { hp: 3, hpMax: 10 } : {}) });
  } else if (cat === "capture") {
    drawEntity(dc, id, e({ id: 1, state: variant }));
  } else if (cat === "hostile") {
    drawEntity(dc, id, e({ id: 1, hp: variant === "hurt" ? 1 : undefined }));
  } else if (cat === "pad") {
    const kind = id === "pad.hire" ? "hire" : "build";
    pads.set("lab", { id: "lab", kind, cost: { "res.currency": 12 }, label: kind === "hire" ? nameOf(o.skin, "role.supplier") : nameOf(o.skin, "struct.housing"), big: false, what: kind === "hire" ? "role.supplier" : "struct.housing", ...(kind === "hire" ? { from: "node.material_source", to: "sink.core" } : { requiresCoreLevel: 2 }) });
    drawEntity(dc, id, { id: "lab", type: id, pos: O, done: false, paid: { "res.currency": variant === "half" ? 6 : 0 }, visible: true, locked: variant === "locked" });
  } else if (cat === "zone") {
    const r = { x: -70 * FP, y: -24 * FP, w: 140 * FP, h: 48 * FP };
    drawEntity(dc, id, { id: "lab", type: id, rect: r, cleared: false });
  } else {
    fillRR(g, -38, -16, 76, 32, 10, "rgba(255,255,255,.14)", "rgba(255,255,255,.35)", 1.5);
    label(g, nameOf(o.skin, id), 0, 0, 10, "#ffffff");
  }
  g.restore();
}

/** Ids the lab cannot picture and that fall back to the labelled crate (should be empty for drawable ids). */
export function missingDraws(types: readonly string[]): string[] {
  return types.filter((t) => !hasDraw(t));
}
