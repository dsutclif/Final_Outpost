import { CONTENT_VERSION, content as defaultContent, type Content, type Manifest } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";
import { planBot } from "@fo/bots";
import templatesData from "../data/templates.json";
import genData from "../data/generator.json";
import { flowModel, type Flow } from "./flow.js";
import { Placer, dist, type Pt, type Rect } from "./layout.js";
import { Rand, clamp01, lerp, round1, round2 } from "./rand.js";

// Stage 2-4 of the spec: layout from a template by constraint placement, economy parameters drawn
// from the knob ranges and balanced by the flow model, then goal and fail conditions. Every number
// comes from data (templates.json, generator.json, content); nothing names a level.

export interface Template {
  id: string;
  zones: string[];
  core: [number, number];
  start: [number, number];
  fields: { material: [number, number, number, number]; food: [number, number, number, number]; fuel: [number, number, number, number] };
  shop: [number, number];
  landmark: [number, number];
  prey: [number, number, number, number];
  depot: [number, number];
}
interface TemplatesFile {
  templates: Template[];
  north: { lassoLine: number; outerTop: number; outerGap: number; attackLine: number; band: number; pocket: number; insideTop: number };
  corner: { w: number; h: number };
  arrivals: { at: [number, number]; clearTop: number };
}
export const TEMPLATES = templatesData as unknown as TemplatesFile;
export const GEN = genData as unknown as {
  knobs: Record<string, [number, number]>;
  jitter: number;
  costs: Record<string, number>;
  spacing: { margin: number; standR: number; screen: [number, number] };
  search: { maxIterations: number; tolerance: number; funThreshold: number; quickSeeds: { ref: number; other: number }; fullSeeds: { ref: number; other: number }; layoutTries: number };
};

export const templateById = (id: string): Template => {
  const t = TEMPLATES.templates.find((x) => x.id === id);
  if (!t) throw new Error(`unknown template ${id}`);
  return t;
};

export type Knobs = Record<keyof typeof genData.knobs, number>;

/** Knob values at pressure p, each jittered by its own mutation offset (in pressure units). */
export function knobsFor(p: number, mut: Partial<Record<string, number>> = {}): Knobs {
  const out = {} as Record<string, number>;
  for (const [k, [a, b]] of Object.entries(GEN.knobs)) out[k] = lerp(a, b, clamp01(p + (mut[k] ?? 0)));
  return out as Knobs;
}

export interface BuildInput {
  id: string;
  seed: number;
  modules: string[];
  goalType: string;
  template: Template;
  knobs: Knobs;
  /** Measured good-bot time (s) to set the budget from, once known; else the flow estimate. */
  budgetRef?: number | undefined;
  content?: Content;
}

export interface Built { manifest: Manifest; flow: Flow; stations: Placer["stations"]; notes: string[] }

type Ent = Record<string, unknown> & { type: string };

/** Build one candidate manifest; throws a reason string (Error) when a constraint cannot be met. */
export function buildLevel(inp: BuildInput, layoutSalt = 0): Built {
  const c = inp.content ?? defaultContent;
  const K = inp.knobs;
  const mods = new Set(inp.modules);
  const has = (m: string) => mods.has(m);
  const tpl = inp.template;
  const N = TEMPLATES.north;
  const rand = new Rand((inp.seed ^ Math.imul(layoutSalt + 1, 0x9e3779b1)) >>> 0);
  const notes: string[] = [];
  const goal = inp.goalType;
  const arrivalsOn = has("housing");
  const bottom = arrivalsOn ? TEMPLATES.arrivals.clearTop : 884;
  const core: Pt = tpl.core;
  const S = GEN.spacing;
  const P = new Placer(rand.fork("place"), S.margin, S.standR, [16, N.insideTop, 448, bottom - N.insideTop], core, S.screen, c);
  const cost = (k: string) => Math.max(1, Math.round((GEN.costs[k] ?? 10) * K.costScale));
  const range = (k: "pads.range" | "pads.bigRange") => c.defaults[k]!;
  const R = { node: c.nodes["node.material_source"]!.range, fuel: c.nodes["node.fuel_deposit"]!.range, pad: range("pads.range"), big: range("pads.bigRange"),
    core: (c.sinks["sink.core"] as { range: number }).range, shop: (c.sinks["sink.sales_point"] as { range: number }).range, conv: c.converters["conv.food_processor"]!.range };
  const ents: Ent[] = [];
  const fail = (why: string): never => { throw new Error(why); };
  const placePad = (id: string, near: Pt, opts: { big?: boolean; region?: Rect; on?: string } = {}): Pt => {
    const r = opts.big ? R.big : R.pad;
    const region: Rect = opts.region ?? [near[0] - 110, near[1] - 110, 220, 220];
    const p = P.place(id, r, region, { near, key: true, ...(opts.on ? { on: opts.on } : {}) })
      ?? P.place(id, r, [16, N.insideTop, 448, bottom - N.insideTop], { near, key: true, samples: 240, ...(opts.on ? { on: opts.on } : {}) });
    return p ?? fail(`no room for pad ${id}`);
  };

  // ---------- north stack and blocked zones ----------
  const lassoOn = has("lasso");
  const defenseOn = has("defense");
  const blockedOn = has("blocked_zones");
  const bandMode = blockedOn ? (defenseOn ? "corner" : "north") : null;
  const bandY = N.insideTop - N.band - 4;
  let pocketTop = lassoOn ? N.lassoLine + 6 : bandY - N.pocket;

  P.add("core", core, R.core, { key: true });
  const startPt: Pt = [core[0] + tpl.start[0], core[1] + tpl.start[1]];
  P.spot("start", startPt, 18);
  if (arrivalsOn) P.spot("admit", [TEMPLATES.arrivals.at[0], TEMPLATES.arrivals.at[1] - 20], 22);

  let zoneRect: Rect | null = null;
  if (bandMode === "north") { zoneRect = [0, bandY, 480, N.band]; }
  else if (bandMode === "corner") {
    const left = rand.chance(0.5);
    zoneRect = [left ? 0 : 480 - TEMPLATES.corner.w, 900 - TEMPLATES.corner.h, TEMPLATES.corner.w, TEMPLATES.corner.h];
  }
  if (zoneRect) P.blocked.push(zoneRect);
  if (arrivalsOn && bandMode === "corner") P.blocked.push([180, 840, 120, 60]);

  // ---------- core, shop, fields ----------
  const level1Cap = (c.sinks["sink.core"] as { levels: { fuelCap: number }[] }).levels[0]!.fuelCap;
  ents.push({ type: "sink.core", id: "core", at: [...core], params: { fuel: Math.max(4, Math.round(level1Cap * K.fuel0)), level: 1 } });

  const shopReg = (c.sinks["sink.sales_point"] as { registerOffset: [number, number]; pileOffset: [number, number] });
  const shopAt = P.place("shop", R.shop, [tpl.shop[0] - 22, tpl.shop[1] - 22, 44, 44], {
    near: tpl.shop, key: true,
    spots: [{ id: "register", dx: shopReg.registerOffset[0], dy: shopReg.registerOffset[1] }, { id: "pile", dx: shopReg.pileOffset[0], dy: shopReg.pileOffset[1] }],
  }) ?? fail("no room for the sales point");
  const sells = ["res.food_raw_1"];
  // `sells` is filled in as modules add goods; the entity holds the same array.
  ents.push({ type: "sink.sales_point", id: "shop", at: [...shopAt], sells });

  const field = (r: [number, number, number, number]): Rect => r;
  const nMat = Math.round(K.materialNodes);
  const matAt: Pt[] = [];
  for (let i = 0; i < nMat; i++) {
    const p = P.place(`mat${i + 1}`, R.node, field(tpl.fields.material), { reach: { from: core, t: K.reach }, samples: 60 });
    if (p) matAt.push(p);
  }
  if (matAt.length < 3) fail("material field too crowded");
  matAt.forEach((p) => ents.push({ type: "node.material_source", at: [...p] }));
  const food1 = P.place("food1", R.node, field(tpl.fields.food), { reach: { from: shopAt, t: K.reach } }) ?? fail("no room for food");
  ents.push({ type: "node.food_source", id: "food1", at: [...food1] });

  const fuelOn = has("hazard_events") || (defenseOn && rand.chance(0.5));
  if (fuelOn) {
    const n = rand.int(1, 2);
    for (let i = 0; i < n; i++) {
      const p = P.place(`fuel${i + 1}`, R.fuel, field(tpl.fields.fuel), { reach: { from: core, t: K.reach } });
      if (p) ents.push({ type: "node.fuel_deposit", at: [...p] });
    }
  }

  // ---------- pads ----------
  const pads: Ent[] = [];
  const pad = (e: Ent) => { pads.push(e); return e; };
  const workers = has("workers");
  const toward = (a: Pt, b: Pt, t: number): Pt => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];
  const matC: Pt = [matAt.reduce((a, p) => a + p[0], 0) / matAt.length, matAt.reduce((a, p) => a + p[1], 0) / matAt.length];
  const register: Pt = [shopAt[0] + shopReg.registerOffset[0], shopAt[1] + shopReg.registerOffset[1]];
  let hireCashier: Ent | null = null;
  if (workers) {
    const a = placePad("hire_core", toward(core, matC, 0.5));
    pad({ type: "pad.hire", id: "hire_core", at: [...a], cost: { "res.currency": cost("hire.core") }, role: { role: "role.supplier", from: "node.material_source", to: "sink.core" } });
    const b = placePad("hire_food", toward(food1, shopAt, 0.4));
    pad({ type: "pad.hire", id: "hire_food", at: [...b], cost: { "res.currency": cost("hire.food") }, role: { role: "role.supplier", from: "node.food_source", to: "sink.sales_point", node: "food1" } });
    const cpos = placePad("hire_cashier", [register[0] - 80, register[1] + 20]);
    hireCashier = pad({ type: "pad.hire", id: "hire_cashier", at: [...cpos], cost: { "res.currency": cost("hire.cashier") }, role: { role: "role.cashier", to: "sink.sales_point" } });
  }

  // Chain: pads that must be bought, hung off the anchor through requires.pad (last element may carry its own requirement).
  const chainFront: Ent[] = [];
  let chainTail: Ent | null = null;

  if (has("source_gating")) {
    const f2 = P.place("food2", R.node, field(tpl.fields.food), { near: food1, samples: 120 }) ?? fail("no room for the gated food source");
    ents.push({ type: "node.food_source", id: "food2", at: [...f2], enabled: false });
    if (!P.ok("unlock_food2", f2, R.pad, { on: "food2" })) fail("unlock pad overlaps");
    P.add("unlock_food2", f2, R.pad, { key: true, on: "food2" });
    pad({ type: "pad.build", id: "unlock_food2", at: [...f2], cost: { "res.currency": cost("unlock") }, build: "node.enable", target: "food2", requires: { pad: "hire_food" } });
    const h2 = placePad("hire_food2", toward(f2, shopAt, 0.4));
    chainTail = pad({ type: "pad.hire", id: "hire_food2", at: [...h2], cost: { "res.currency": cost("hire.food2") }, role: { role: "role.supplier", from: "node.food_source", to: "sink.sales_point", node: "food2" }, requires: { pad: "unlock_food2" } });
  }

  // Converters.
  const convSpots = (k: string) => {
    const d = c.converters[k]!;
    return [{ id: "op", dx: d.operatorOffset[0], dy: d.operatorOffset[1] }, { id: "pick", dx: d.pickupOffset[0], dy: d.pickupOffset[1] }];
  };
  let grillOn = false, sawOn = false;
  if (has("converters")) {
    grillOn = true;
    const g = P.place("grill", R.pad, [shopAt[0] - 200, shopAt[1] - 150, 300, 260], { near: [shopAt[0] - 120, shopAt[1] - 20], key: true, spots: convSpots("conv.food_processor") })
      ?? fail("no room for the food processor");
    // The cook and the feeder are hired before the grill opens (grill requires feeder requires cook), so
    // prepared food is made from the moment customers can ask for it.
    pad({ type: "pad.build", id: "grill", at: [...g], cost: { "res.currency": cost("grill") }, build: "conv.food_processor", requires: { pad: "feeder" } });
    const op: Pt = [g[0] + c.converters["conv.food_processor"]!.operatorOffset[0], g[1] + c.converters["conv.food_processor"]!.operatorOffset[1]];
    const cook = placePad("cook", [op[0] - 70, op[1] + 10]);
    pad({ type: "pad.hire", id: "cook", at: [...cook], cost: { "res.currency": cost("hire.cook") }, role: { role: "role.operator", to: "conv.food_processor" } });
    const fd = placePad("feeder", toward(food1, g, 0.5));
    pad({ type: "pad.hire", id: "feeder", at: [...fd], cost: { "res.currency": cost("hire.feeder") }, role: { role: "role.supplier", from: "node.food_source", to: "conv.food_processor", node: "food1" }, requires: { pad: "cook" } });
    const sv = placePad("server", toward(g, shopAt, 0.5));
    pad({ type: "pad.hire", id: "server", at: [...sv], cost: { "res.currency": cost("hire.server") }, role: { role: "role.server", from: "conv.food_processor", to: "sink.sales_point" }, requires: { pad: "grill" } });
    sells.push("res.food_prepared");
    if (goal === "build" && rand.chance(0.6)) {
      sawOn = true;
      const s = P.place("saw", R.pad, [matC[0] - 150, matC[1] - 150, 300, 300], { near: toward(matC, core, 0.45), key: true, spots: convSpots("conv.material_processor") })
        ?? fail("no room for the material processor");
      pad({ type: "pad.build", id: "saw", at: [...s], cost: { "res.currency": cost("saw") }, build: "conv.material_processor" });
      const sop: Pt = [s[0] + c.converters["conv.material_processor"]!.operatorOffset[0], s[1] + c.converters["conv.material_processor"]!.operatorOffset[1]];
      const sw = placePad("sawyer", [sop[0] + 70, sop[1] + 10]);
      pad({ type: "pad.hire", id: "sawyer", at: [...sw], cost: { "res.currency": cost("hire.sawyer") }, role: { role: "role.operator", to: "conv.material_processor" }, requires: { pad: "saw" } });
    }
  }

  // Hunting.
  if (has("hunting")) {
    const pr = tpl.prey;
    ents.push({ type: "zone.prey", id: "prey", rect: [...pr], animal: "node.prey", n: 3 });
    const drops = Object.keys(c.animals["node.prey"]!.drops);
    for (const r of drops) if (!sells.includes(r) && (c.resources[r]?.price ?? 0) > 0) sells.push(r);
    const hp = placePad("hunter", toward([pr[0] + pr[2] / 2, pr[1] + pr[3] / 2], core, 0.45));
    const h = pad({ type: "pad.hire", id: "hunter", at: [...hp], cost: { "res.currency": cost("hire.hunter") },
      role: { role: "role.hunter", from: "node.prey", to: grillOn ? "conv.food_processor" : "sink.sales_point" }, ...(grillOn ? { requires: { pad: "grill" } } : {}) });
    if (!grillOn) chainFront.push(h);
  }

  // Core levels.
  let corePad: Ent | null = null;
  if (has("core_levels")) {
    const lp = placePad("core_level", [core[0] - 95, core[1] + 70]);
    corePad = pad({ type: "pad.build", id: "core_level", at: [...lp], cost: { "res.currency": cost("core.level") }, build: "sink.core.level" });
  }

  // Blocked zone and its clearing pad.
  let zonePad: Ent | null = null;
  if (zoneRect) {
    ents.push({ type: "zone.blocked", id: "rubble", rect: [...zoneRect] });
    const zr = zoneRect;
    const near: Pt = bandMode === "north" ? [core[0], zr[1] + zr[3] + 42] : [zr[0] + zr[2] / 2, zr[1] - 42];
    const zp = placePad("zone_pad", near, { region: bandMode === "north" ? [40, zr[1] + zr[3] + 30, 400, 40] : [zr[0], zr[1] - 75, zr[2], 50] });
    zonePad = pad({ type: "pad.build", id: "zone_pad", at: [...zp], cost: { "res.currency": cost("zone") }, build: "zone.clear", target: "rubble" });
    chainFront.unshift(zonePad);
  }

  // Lasso fence and containers.
  let containers = 0;
  if (lassoOn) {
    const y = N.lassoLine;
    const gx = Math.min(360, Math.max(120, core[0]));
    ents.push({ type: "barrier.line", id: "fence", res: "res.currency", costPerSection: 8, sections: [
      { a: [0, y], b: [gx - 80, y], prebuilt: true },
      { a: [gx - 80, y], b: [gx + 80, y], gate: true, prebuilt: true },
      { a: [gx + 80, y], b: [480, y], prebuilt: true },
    ] });
    const want = Math.round(K.containers);
    const at: Pt[] = [];
    for (let tries = 0; tries < 400 && at.length < want; tries++) {
      const p: Pt = [rand.int(60, 420), rand.int(N.outerTop, y - N.outerGap)];
      if (at.every((q) => dist(p, q) >= 95)) at.push(p);
    }
    at.forEach((p) => ents.push({ type: "capture.recruit_container", at: [...p] }));
    containers = at.length;
    if (containers < 2) fail("no room for containers");
    pocketTop = y + 6;
  }

  // Defense.
  let towers: Ent[] = [];
  const waves: { t: number; counts: Record<string, number> }[] = [];
  if (defenseOn) {
    const y = N.attackLine;
    const gx = Math.min(330, Math.max(150, core[0]));
    const nPre = has("medical") ? 0 : Math.round(K.prebuilt * 2);
    ents.push({ type: "barrier.line", id: "wall", res: "res.currency", costPerSection: Math.round(K.wallCost), sections: [
      { a: [0, y], b: [gx - 80, y], prebuilt: nPre >= 1 },
      { a: [gx - 80, y], b: [gx + 80, y], gate: true, prebuilt: nPre >= 1 && K.prebuilt > 0.5 },
      { a: [gx + 80, y], b: [480, y], prebuilt: nPre >= 2 },
    ] });
    const nT = Math.max(1, Math.round(K.towers));
    for (let k = 0; k < nT; k++) {
      const x = Math.round((480 * (k + 1)) / (nT + 1));
      const tp = placePad(`tower${k}`, [x, y + 80], { region: [x - 90, N.insideTop + 6, 180, 80] });
      towers.push(pad({ type: "pad.build", id: `tower${k}`, at: [...tp], cost: { "res.currency": cost("tower") }, build: "struct.ranged_defense" }));
    }
    const salvage = has("salvage_upgrades");
    if (salvage) {
      towers.forEach((t, k) => {
        const tp = t.at as Pt;
        const up = placePad(`towerup${k}`, [tp[0], tp[1] + 65]);
        pad({ type: "pad.build", id: `towerup${k}`, at: [...up], cost: { "res.salvage": GEN.costs["salvage.towerUp"]! }, build: "struct.ranged_defense.t2", target: t.id, requires: { pad: t.id } });
      });
      const rf = placePad("reinforce", [gx, y + 130]);
      pad({ type: "pad.build", id: "reinforce", at: [...rf], cost: { "res.salvage": GEN.costs["salvage.reinforce"]! }, build: "struct.barrier.reinforced" });
    }
    if (has("defenders")) {
      const bk = placePad("barracks", [core[0] - 110, core[1] + 120]);
      pad({ type: "pad.build", id: "barracks", at: [...bk], cost: { "res.currency": cost("barracks") }, build: "struct.barracks" });
      const tr = placePad("train", [bk[0], bk[1] + 75]);
      pad({ type: "pad.hire", id: "train", at: [...tr], cost: { "res.currency": cost("train") }, role: { role: "role.defender" }, repeatable: true, requires: { pad: "barracks" } });
    }
    if (has("medical")) {
      const md = placePad("medic", [core[0] + 100, core[1] + 140]);
      pad({ type: "pad.build", id: "medic", at: [...md], cost: { "res.currency": cost("medic") }, build: "struct.medical" });
    }
    // Medical needs injuries: an early probe wave reaches the base before any wall can be up.
    if (has("medical")) waves.push({ t: 20, counts: { "hostile.creature": 4 } });
    const nW = 3;
    for (let k = 0; k < nW; k++) {
      const counts: Record<string, number> = { "hostile.creature": Math.max(1, Math.round((3 + k) * K.waveScale)) };
      if (salvage) counts["hostile.raider_humanoid"] = Math.max(1, Math.round((1 + k) * K.waveScale * 0.7));
      waves.push({ t: Math.round(K.firstWave + k * K.waveGap), counts });
    }
    const creatureDrops = Object.keys(c.hostiles["hostile.creature"]!.drops);
    for (const r of creatureDrops) if (!sells.includes(r) && (c.resources[r]?.price ?? 0) > 0) sells.push(r);
  }

  // Supply routing.
  if (has("supply_routing")) {
    const dp = placePad("depot", tpl.depot);
    // The depot hangs off the anchor so the bot builds it on the way to the goal.
    chainFront.push(pad({ type: "pad.build", id: "depot", at: [...dp], cost: { "res.currency": cost("depot") }, build: "struct.depot" }));
    const hl = placePad("hauler", [dp[0] + 70, dp[1] + 30]);
    pad({ type: "pad.hire", id: "hauler", at: [...hl], cost: { "res.currency": cost("hire.hauler") }, role: { role: "role.hauler", from: "store.depot" }, requires: { pad: "depot" } });
    const ds = placePad("depot_supplier", toward(matC, dp, 0.5));
    pad({ type: "pad.hire", id: "depot_supplier", at: [...ds], cost: { "res.currency": cost("hire.depotSupplier") }, role: { role: "role.supplier", from: "node.material_source", to: "store.depot" }, requires: { pad: "depot" } });
  }

  // Housing and arrivals.
  let arrivals = 0;
  const housingPads: Ent[] = [];
  if (arrivalsOn) {
    arrivals = goal === "population" ? rand.int(3, 5) : rand.int(2, 4);
    ents.push({ type: "struct.gate", id: "gate", at: [...TEMPLATES.arrivals.at], arrivals: { every: Math.round(K.arrivalEvery), total: arrivals } });
  }

  // ---------- goal ----------
  let landmark: Ent | null = null;
  if (goal === "build") {
    let lp: Pt;
    if (bandMode === "north") {
      lp = [Math.min(400, Math.max(80, tpl.landmark[0])), Math.round((pocketTop + bandY) / 2)];
      P.add("landmark", lp, R.big, { key: true });
    } else lp = placePad("landmark", tpl.landmark, { big: true, region: [tpl.landmark[0] - 40, tpl.landmark[1] - 40, 80, 70] });
    landmark = pad({ type: "pad.build", id: "landmark", at: [...lp], cost: { "res.currency": 50 }, build: "struct.landmark", big: true });
  }

  // People: idle residents for every hire the plan will buy, plus spares.
  const housingSlotsPer = c.defaults["housing.perBuilding"]!;
  const people: { role: string }[] = [];
  let popN = 0;

  // Anchor: a pad certainly on the bot's plan, carrying the chain of pads the level needs bought.
  const anchor: Ent | null = landmark ?? (goal === "waves" ? towers[towers.length - 1] ?? null : null) ?? null;
  const chain = [...chainFront, ...(chainTail ? [chainTail] : [])];

  const finish = (landmarkCost: number, refined: number, currencyN: number, extraPeople: number): Manifest => {
    const ps: Ent[] = pads.map((p) => structuredClone(p));
    const byId = (id: string) => ps.find((p) => p.id === id)!;
    // Housing pads (population goals and recruits that would wait).
    let anchorId: string | null = anchor ? String(anchor.id) : null;
    const hp = housingPads.map((h) => structuredClone(h));
    for (const h of hp) ps.push(h);
    if (!anchorId && goal === "population" && hp.length > 0) anchorId = String(hp[0]!.id);
    if (!anchorId && hireCashier) anchorId = "hire_cashier";
    if (landmark) {
      const lm = byId("landmark");
      lm.cost = { "res.currency": landmarkCost, ...(refined > 0 ? { "res.material_refined": refined } : {}) };
    }
    // Requirement chain: anchor -> chain[0] -> chain[1] ...
    const naturallyPlanned = (e: Ent) => e.id === "zone_pad" && goal === "population" && lassoOn && bandMode === "north";
    const links = chain.filter((e) => !(naturallyPlanned(e) && chain.length === 1));
    let prev: string | null = anchorId;
    for (const e of links) {
      if (prev === null) break;
      if (prev === e.id) continue;
      const pe = byId(prev);
      pe.requires = { ...((pe.requires as object) ?? {}), pad: String(e.id) };
      prev = String(e.id);
    }
    if (anchorId === null && links.length > 0 && !links.every(naturallyPlanned)) notes.push("no anchor for the pad chain");
    if (corePad) {
      const target = zonePad ? byId("zone_pad") : anchorId ? byId(anchorId) : null;
      if (target) target.requires = { ...((target.requires as object) ?? {}), coreLevel: 2 };
    }
    const p0 = workers || has("medical") || arrivalsOn ? 0 : 0;
    void p0;
    const idle = extraPeople;
    for (let i = 0; i < idle; i++) people.push({ role: "idle" });
    const nPeople = people.length;
    let base: number;
    if (goal === "population") {
      popN = Math.max(nPeople + 1, nPeople + containers + arrivals - Math.round(K.recruitSlack));
      base = arrivalsOn && hp.length > 0 ? Math.max(nPeople, popN - housingSlotsPer * hp.length) : popN;
    } else {
      base = arrivalsOn ? nPeople + 1 : nPeople + containers + 2;
    }
    const params: Record<string, number> = {
      "start.currency": Math.round(K.startCurrency),
      "core.burn": round1(K.burn),
      "customers.spawn": round1(K.spawn),
      "customers.orderMin": 1,
      "customers.orderMax": Math.round(K.orderMax),
      "housing.base": Math.max(1, base),
    };
    if (has("customer_variety")) { params["customers.impatientShare"] = round2(K.impatient); params["customers.premiumShare"] = round2(K.premium); }
    if (defenseOn) params["meters.baseHealth"] = Math.round(K.baseHealth);
    const g: Manifest["goal"] = goal === "build" ? { type: "build", target: "landmark" }
      : goal === "population" ? { type: "population", n: popN }
      : goal === "waves" ? { type: "waves" }
      : goal === "serve_premium" ? { type: "serve_premium", n: Math.max(1, currencyN) }
      : { type: "currency", n: Math.max(5, currencyN) };
    const m = {
      id: inp.id, seed: inp.seed >>> 0, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION,
      map: { w: 480, h: 900, zones: [...tpl.zones] },
      modules: [...inp.modules].sort(),
      start: [...startPt],
      entities: [...ents, ...ps],
      people: people.splice(0),
      waves, events: [] as Manifest["events"],
      params, goal: g,
      fail: defenseOn ? ["meter.lifeline", "meter.base_health"] : ["meter.lifeline"],
      text: {},
    } as unknown as Manifest;
    return m;
  };

  // Housing pads: population goals need slots; elsewhere, recruits that would wait.
  if (arrivalsOn) {
    const nH = goal === "population" ? Math.max(1, Math.ceil(arrivals / housingSlotsPer)) : 1;
    for (let k = 0; k < nH; k++) {
      const hpos = placePad(`housing${k}`, [core[0] + (k % 2 === 0 ? 110 : -110), core[1] + 110 + 60 * Math.floor(k / 2)]);
      housingPads.push({ type: "pad.build", id: `housing${k}`, at: [...hpos], cost: { "res.currency": cost("housing") + 3 * k }, build: "struct.housing" });
    }
  }

  // Start must not stand on a pad.
  for (const s of P.stations) if (s.id !== "core" && dist([s.x, s.y], startPt) < s.r + 4) fail(`start overlaps ${s.id}`);

  // People count from a draft plan: one idle resident per hire step (repeats included), plus spares.
  const draft = finish(50, sawOn ? 6 : 0, 30, 0);
  const plan0 = planBot(draft, c);
  const hires = plan0.steps.filter((s) => s.kind === "hire" && s.when === "always" && !(c.roles[(pads.find((p) => p.id === s.pad)?.role as { role: string } | undefined)?.role ?? ""]?.behavior === "guard"))
    .reduce((a, s) => a + s.repeat, 0);
  let extra = workers ? hires + Math.round(K.spareIdle) : 0;
  if (has("defenders")) extra += 2 + Math.round(K.spareIdle);
  if (has("medical")) extra = Math.max(extra, 3);
  if (lassoOn && goal !== "population" && workers) extra = Math.max(extra, hires);

  // ---------- economy sizing ----------
  const budgetFor = (T: number) => Math.min(900, Math.max(90, Math.round((inp.budgetRef ?? T) / (1 - K.margin) / 10) * 10));
  const evalCost = (cst: number, n: number) => {
    const m = finish(cst, sawOn ? Math.round(6 + 6 * K.costScale) : 0, n, extra);
    const plan = planBot(m, c);
    const f = flowModel(m, plan, c, 1e9);
    return { m, f };
  };
  let chosen: { m: Manifest; f: Flow };
  const L = K.length;
  if (goal === "build" || goal === "currency" || goal === "serve_premium") {
    let lo = 10, hi = goal === "serve_premium" ? 30 : 600;
    for (let i = 0; i < 14; i++) {
      const mid = Math.round((lo + hi) / 2);
      const r = goal === "build" ? evalCost(mid, 30) : evalCost(50, mid);
      if (r.f.T < L) lo = mid; else hi = mid;
    }
    const v = Math.max(goal === "serve_premium" ? 2 : 15, lo);
    chosen = goal === "build" ? evalCost(v, 30) : evalCost(50, v);
  } else chosen = evalCost(50, 30);

  const m = chosen.m;
  const waveEnd = waves.length > 0 ? waves[waves.length - 1]!.t : 0;
  const budget = goal === "waves" ? Math.round((waveEnd + 60) / 10) * 10 : budgetFor(chosen.f.T);
  m.params["level.budgetSeconds"] = budget;
  if (has("hazard_events")) {
    const T = goal === "waves" ? waveEnd : Math.max(60, chosen.f.T);
    const start = Math.round(goal === "waves" ? (waves[0]!.t + waves[1]!.t) / 2 + 5 : T * 0.42);
    m.events = [{ type: "event.hazard", warnAt: Math.max(0, start - 8), start, end: start + 22 }];
  }
  const flow = flowModel(m, planBot(m, c), c, budget);
  if (!flow.ok) fail(`flow: ${flow.reason}`);
  return { manifest: m, flow, stations: P.stations, notes };
}
