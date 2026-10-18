import { content as defaultContent, type Content } from "@fo/content";
import { Group } from "three";
import { GeoBuilder } from "../geom.js";
import type { AnchorName } from "../ids.js";
import { ART_M } from "../units.js";
import { buildConverter, buildCore, buildGate, buildGuardPost, buildHabPod, buildKiosk, buildLandmark, buildMedBay, buildTurret, buildWarehouse } from "./buildings.js";
import { buildCharacterModel, lookFor } from "./characters.js";
import { anchor, mesh, model, type BuildCtx, type Model } from "./common.js";
import { applyMeshy } from "./meshy.js";
import { buildBelt, buildClerkPad, buildItem, buildPile } from "./props.js";
import {
  buildBarrierDash, buildBurrow, buildFuelCache, buildGrowDome, buildOrePile, buildPadPlate, buildRubble, buildTerrain,
  buildScrapPile, buildStasisPod, buildSupplyCrate, buildStormPreset, buildWaitingMarker, buildWallPanel,
} from "./scatter.js";

// Model registry keyed by canonical id, mirroring the 2D renderer's draw registry: adding a
// model for a new id is one register() call. Lookup: exact id, then "category.*", then the
// labelled fallback crate (which only the debug skin may rely on; a test enforces that).

export type ModelBuilder = (ctx: BuildCtx) => Model;

interface Entry { build: ModelBuilder; anchors: readonly AnchorName[] }

const MODELS = new Map<string, Entry>();

export function registerModel(id: string, build: ModelBuilder, anchors: readonly AnchorName[] = []): void {
  MODELS.set(id, { build, anchors });
}

export function hasModel(id: string): boolean {
  return MODELS.has(id) || MODELS.has(`${id.split(".")[0]}.*`);
}

export function registeredModels(): string[] {
  return [...MODELS.keys()].sort();
}

/** Anchors a model for this id must expose on top of its class anchors. */
export function requiredAnchors(id: string): readonly AnchorName[] {
  return (MODELS.get(id) ?? MODELS.get(`${id.split(".")[0]}.*`))?.anchors ?? [];
}

/** Build the model for an id; unknown ids get the fallback crate (flagged in userData). */
export function buildModel(id: string, ctx: BuildCtx): Model {
  const e = MODELS.get(id) ?? MODELS.get(`${id.split(".")[0]}.*`);
  const m = e ? e.build(ctx) : fallback(ctx);
  if (e) applyMeshy(m, id, ctx.level);
  m.root.name = id;
  m.root.userData["id"] = id;
  if (!e) m.root.userData["fallback"] = true;
  return m;
}

function fallback(ctx: BuildCtx): Model {
  const m = model("prop");
  m.root.add(mesh(new GeoBuilder().rbox(0.8, 0.8, 0.8, 0.12, ctx.t.structure, { at: [0, 0.4, 0] }, 1).build(), ctx.mats.std, "fallback"));
  anchor(m.root, "interact", 0, 0, 0.6);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

// ------------------------------------------------------------------ registrations

const content: Content = defaultContent;
const m2 = (v: readonly number[] | undefined, dflt: [number, number]): [number, number] => (v && v.length >= 2 ? [v[0]! / ART_M, v[1]! / ART_M] : dflt);

const character = (id: string): ModelBuilder => (ctx) => {
  const look = lookFor(id, ctx.t, ctx.models);
  const m = model("character", new Group());
  m.root.add(buildCharacterModel(look, ctx.parts, ctx.mats));
  return m;
};

for (const res of Object.keys(content.resources)) registerModel(res, (ctx) => buildItem(res, ctx));
registerModel("res.*", (ctx) => buildItem("res.unknown", ctx));

registerModel("node.material_source", (ctx) => buildOrePile(ctx), ["pickup", "interact"]);
registerModel("node.food_source", (ctx) => buildGrowDome(ctx), ["pickup", "interact"]);
registerModel("node.fuel_deposit", (ctx) => buildFuelCache(ctx), ["pickup", "interact"]);
registerModel("node.fuel_scrap", (ctx) => buildScrapPile(ctx), ["pickup", "interact"]);
registerModel("node.prey", character("node.prey"));
registerModel("unit.prey", character("unit.prey"));
registerModel("node.prey_dangerous", character("node.prey_dangerous"));
registerModel("unit.prey_dangerous", character("unit.prey_dangerous"));

const sales = content.sinks["sink.sales_point"] as { queueOffset?: number[] } | undefined;
registerModel("sink.core", (ctx) => buildCore(ctx), ["deposit", "safe", "interact", "pad"]);
registerModel("sink.sales_point", (ctx) => buildKiosk(ctx, m2(sales?.queueOffset, [2.7, 0])), ["deposit", "queue", "interact", "pad"]);
registerModel("sink.sales_point.register", (ctx) => buildClerkPad(ctx));
registerModel("sink.sales_point.pile", (ctx) => buildPile(ctx));

for (const id of Object.keys(content.converters)) {
  const def = content.converters[id] as { pickupOffset?: number[]; operatorOffset?: number[] };
  registerModel(id, (ctx) => buildConverter(id, ctx, m2(def.pickupOffset, [1.93, 0]), m2(def.operatorOffset, [0, 1.7])), ["deposit", "pickup", "interact", "pad"]);
}

const people = ["unit.player", "unit.resident", "unit.customer", "unit.customer_impatient", "unit.customer_premium", "unit.customer_bulk", "hostile.raider_humanoid", "hostile.creature", "hostile.swarmling", "hostile.boss", "role.idle", ...Object.keys(content.roles), ...Object.keys(content.customers), ...Object.keys(content.hostiles), "role.medic"];
for (const id of new Set(people)) {
  registerModel(id, character(id));
}

const medical = content.structures["struct.medical"] as { healOffset?: number[] } | undefined;
registerModel("struct.housing", (ctx) => buildHabPod(ctx));
registerModel("struct.medical", (ctx) => buildMedBay(ctx, m2(medical?.healOffset, [0.93, 0])));
registerModel("struct.barracks", (ctx) => buildGuardPost(ctx));
registerModel("struct.training", (ctx) => buildGuardPost(ctx));
registerModel("struct.ranged_defense", (ctx) => buildTurret(ctx));
registerModel("struct.ranged_defense.t2", (ctx) => buildTurret({ ...ctx, level: Math.max(2, ctx.level) }));
registerModel("struct.landmark", (ctx) => buildLandmark(ctx));
registerModel("struct.depot", (ctx) => buildWarehouse(ctx), ["deposit", "pickup"]);
registerModel("store.depot", (ctx) => buildWarehouse(ctx), ["deposit", "pickup"]);
registerModel("struct.gate", (ctx) => buildGate(ctx));
registerModel("struct.conveyor", (ctx) => buildBelt(ctx));
registerModel("struct.barrier", (ctx) => buildWallPanel(ctx));
registerModel("struct.barrier.reinforced", (ctx) => buildWallPanel(ctx, false, true));
registerModel("struct.barrier.cracked", (ctx) => buildWallPanel(ctx, true));

registerModel("capture.recruit_container", (ctx) => buildStasisPod(ctx));
registerModel("capture.supply_crate", (ctx) => buildSupplyCrate(ctx));
registerModel("zone.blocked", (ctx) => buildRubble(ctx));
registerModel("zone.terrain", (ctx) => buildTerrain(ctx));
registerModel("zone.waiting", (ctx) => buildWaitingMarker(ctx));
registerModel("zone.prey", (ctx) => buildBurrow(ctx));
registerModel("barrier.line", (ctx) => buildBarrierDash(ctx));
registerModel("pad.hire", (ctx) => buildPadPlate(ctx), ["pad"]);
registerModel("pad.build", (ctx) => buildPadPlate(ctx), ["pad"]);
registerModel("event.hazard", (ctx) => buildStormPreset(ctx));
registerModel("hazard.event", (ctx) => buildStormPreset(ctx));

