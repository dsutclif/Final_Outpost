import { FP, createSim, forceBuildPad, type Sim, type State } from "@fo/sim";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { LOOK, content, contentBase, modelScaleFor } from "@fo/content";
import { BASE_BUILD_SCALE, GAME_PAD, GEN, GEN_CASHIER_BASE, LayoutError, applyLookScale, applyPlotLayout, buildLevel, computePlots, isSizedFootprint, knobsFor, templateById, type Built, type LayoutSnapshot } from "@fo/generator";
import { closure, sequenceRange } from "@fo/sequencer";
import { ART_M, PITCH_DEG, YAW_DEG, FOV_DEG, TEXT, VIEW_W, CHAR_K, createCamera, screenToWorld } from "@fo/render-3d";
import { Renderer3D, meshyBounds, meshyFor } from "@fo/render-3d/renderer";

// Layout sandbox (docs/BACKLOG-R4.md batch 0): rebuilds a sequenced level's layout with the real
// generator in the browser, with the spacing knobs from generator.json on sliders, completes
// every pad so the whole base shows, and draws it with the real 3D renderer. Dev tool only: it
// writes to the generator's and content's data objects in this page and nothing reaches a pack.
// "Aligned sizes" swaps look.json modelScale for alignedScale (buildings matched by doorways to
// the kiosk); Building size is the overall scale on top of either set.

// the generator's debug logging reads process.env (it normally runs under Node)
(globalThis as { process?: unknown }).process ??= { env: {} };

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LEVELS = 60;
const reqs = sequenceRange(1, LEVELS);
let aligned = params.get("al") !== "0";
// Plot layout (Doug's plot plan, 2026-10-25): starts as the game has it (look.json plotLayout)
let plots = params.has("pl") ? params.get("pl") !== "0" : !!LOOK.plotLayout?.on;
const scaleMap = (): Record<string, number> => (aligned ? LOOK.alignedScale : LOOK.modelScale);

interface Knob { key: string; label: string; min: number; max: number; step: number; def: number; rebuild: boolean }
const KNOBS: Knob[] = [
  { key: "gap", label: "Building gap", min: -10, max: 30, step: 1, def: GEN.spacing.footprintGap, rebuild: true },
  { key: "pull", label: "Pull to core", min: 0, max: 8, step: 0.1, def: GEN.spacing.corePull, rebuild: true },
  { key: "fpull", label: "Pull fields in", min: 0, max: 0.9, step: 0.05, def: GEN.spacing.fieldPull ?? 0, rebuild: true },
  { key: "char", label: "Character size", min: 0.5, max: 2.5, step: 0.05, def: CHAR_K, rebuild: true },
  { key: "size", label: "Building size", min: 0.3, max: 1.5, step: 0.05, def: LOOK.buildScale, rebuild: true },
  { key: "pad", label: "Pad size", min: 24, max: 50, step: 2, def: LOOK.plotLayout?.pad ?? 36, rebuild: true },
  { key: "zoom", label: "View width", min: 60, max: 600, step: 10, def: VIEW_W, rebuild: false },
  { key: "text", label: "Text size", min: 0.6, max: 1.8, step: 0.05, def: LOOK.textScale, rebuild: false },
];
const val: Record<string, number> = {};
for (const k of KNOBS) val[k.key] = params.has(k.key) ? Number(params.get(k.key)) : k.def;

// ---------------------------------------------------------------- controls

const levelSel = $<HTMLSelectElement>("level");
reqs.forEach((r, i) => levelSel.add(new Option(`L${i + 1} · ${r.family}${r.secondary ? "+" + r.secondary : ""} · ${r.template}`, String(i))));
levelSel.value = String(Math.max(0, Math.min(LEVELS - 1, Number(params.get("l") ?? 4) - 1)));

const outs: Record<string, HTMLOutputElement> = {};
const inputs: Record<string, HTMLInputElement> = {};
for (const k of KNOBS) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<label>${k.label}</label><input type="range" min="${k.min}" max="${k.max}" step="${k.step}"><output></output>`;
  const inp = row.querySelector("input")!, out = row.querySelector("output")!;
  inp.value = String(val[k.key]);
  out.textContent = String(val[k.key]);
  inp.oninput = () => {
    val[k.key] = Number(inp.value);
    out.textContent = inp.value;
    syncUrl();
    if (k.rebuild) schedule(); else applyView();
  };
  outs[k.key] = out;
  inputs[k.key] = inp;
  $("sliders").appendChild(row);
}

function syncUrl(): void {
  const q = new URLSearchParams({ l: String(Number(levelSel.value) + 1) });
  if (!aligned) q.set("al", "0");
  if (plots !== !!LOOK.plotLayout?.on) q.set("pl", plots ? "1" : "0");
  if (mapShown) q.set("map", "1");
  for (const k of KNOBS) if (val[k.key] !== k.def) q.set(k.key, String(val[k.key]));
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

const setKnob = (key: string, v: number): void => { val[key] = v; inputs[key]!.value = String(v); outs[key]!.textContent = String(v); };

levelSel.onchange = () => { syncUrl(); schedule(0); };
$("toggle").onclick = () => { const p = $("panel"); p.classList.toggle("hidden"); $("toggle").textContent = p.classList.contains("hidden") ? "Show" : "Hide"; };
$("vibeBtn").onclick = () => { $("vibe").classList.toggle("show"); $("vibeBtn").classList.toggle("on"); };
$("vibe").onclick = () => $("vibe").classList.toggle("big");
$("reset").onclick = () => {
  for (const k of KNOBS) setKnob(k.key, k.def);
  syncUrl();
  schedule(0);
};
$("center").onclick = () => centre();
const alBtn = $("aligned");
const showAligned = (): void => { alBtn.classList.toggle("on", aligned); alBtn.textContent = aligned ? "Aligned sizes: on" : "Aligned sizes: off"; };
showAligned();
const plBtn = $("plotBtn");
const showPlots = (): void => { plBtn.classList.toggle("on", plots); plBtn.textContent = plots ? "Plot layout: on" : "Plot layout: off"; };
showPlots();
plBtn.onclick = () => { plots = !plots; showPlots(); syncUrl(); schedule(0); };
alBtn.onclick = () => {
  aligned = !aligned;
  showAligned();
  // the size slider's default follows the size set; a value moved off the old default stays
  const size = KNOBS.find((k) => k.key === "size")!;
  const wasDef = val.size === size.def;
  size.def = LOOK.buildScale;
  if (wasDef) setKnob("size", size.def);
  syncUrl();
  schedule(0);
};
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); status("Link copied: send it to Claude to lock these values."); }
  catch { status(location.href); }
};

const statusEl = $("status");
// a failed build leaves the last good base on screen: dim it so it is not mistaken for the new values
function status(t: string, err = false): void { statusEl.textContent = t; statusEl.classList.toggle("err", err); stage.style.opacity = err ? "0.35" : "1"; }

// ---------------------------------------------------------------- build

let timer = 0;
function schedule(ms = 300): void {
  clearTimeout(timer);
  status("Building…");
  timer = window.setTimeout(rebuild, ms);
}

function applyKnobs(): void {
  GEN.spacing.footprintGap = val.gap!;
  GEN.spacing.corePull = val.pull!;
  GEN.spacing.fieldPull = val.fpull!;
  applyLookScale(val.size!, scaleMap());
  applyPlots();
}

// ---------------------------------------------------------------- plot layout

// The sandbox works from the base content (no plot overrides) and lays its own spots over it each build, as the game's
// plot.json would for these slider values (this page only).
type Pair = [number, number];
const spotKeys = {
  converters: ["range", "operatorOffset", "pickupOffset"],
  "struct.depot": ["range", "dropOffset", "pickupOffsets"],
  "struct.medical": ["healOffset"],
  "sink.sales_point": ["registerOffset", "pileOffset", "queueOffset"],
} as const;
const mul = (p: readonly number[], k: number): Pair => [Math.round(p[0]! * k), Math.round(p[1]! * k)];
const set = (target: unknown, src: unknown, keys: readonly string[]): void => {
  const t = target as Record<string, unknown>, s = src as Record<string, unknown>;
  for (const k of keys) if (s[k] !== undefined) t[k] = structuredClone(s[k]);
};
let lastPlate: number | null = null, lastPad = GAME_PAD;

/**
 * Plot layout on: generator.computePlots (the game's own plot maths) for these sliders; its spots and pad reach
 * go over the content and its slots and footprints to the generator. Off: the game's old layout, with the base
 * spots scaled with each building from the base size.
 */
function applyPlots(): void {
  for (const id of Object.keys(contentBase.converters)) set(content.converters[id], contentBase.converters[id], spotKeys.converters);
  for (const id of ["struct.depot", "struct.medical"] as const) set(content.structures[id], contentBase.structures[id], spotKeys[id]);
  set(content.sinks["sink.sales_point"], contentBase.sinks["sink.sales_point"], spotKeys["sink.sales_point"]);
  content.defaults["pads.range"] = contentBase.defaults["pads.range"]!;
  content.defaults["pads.bigRange"] = contentBase.defaults["pads.bigRange"]!;
  if (!plots) {
    applyPlotLayout(null);
    const rel = (id: string): number => (val.size! * modelScaleFor(scaleMap(), id)) / BASE_BUILD_SCALE;
    for (const [id, b] of Object.entries(contentBase.converters) as [string, { range: number; operatorOffset: Pair; pickupOffset: Pair }][]) {
      const c = content.converters[id] as unknown as typeof b, k = rel(id);
      c.range = Math.round(b.range * k); c.operatorOffset = mul(b.operatorOffset, k); c.pickupOffset = mul(b.pickupOffset, k);
    }
    const dB = contentBase.structures["struct.depot"] as unknown as { range: number; dropOffset: Pair; pickupOffsets: Pair[] }, kd = rel("struct.depot");
    set(content.structures["struct.depot"], { range: Math.round(dB.range * kd), dropOffset: mul(dB.dropOffset, kd), pickupOffsets: dB.pickupOffsets.map((p) => mul(p, kd)) }, spotKeys["struct.depot"]);
    const mB = contentBase.structures["struct.medical"] as unknown as { healOffset: Pair };
    set(content.structures["struct.medical"], { healOffset: mul(mB.healOffset, rel("struct.medical")) }, spotKeys["struct.medical"]);
    lastPlate = null; lastPad = GAME_PAD;
    return;
  }
  const data = computePlots({
    buildScale: val.size!, modelScale: scaleMap(), pad: val.pad!, charScale: val.char!, plateK: LOOK.plotLayout?.plateK ?? 1.25,
    standR: GEN.spacing.standR, base: contentBase, cashierPads: GEN_CASHIER_BASE,
  });
  for (const [id, v] of Object.entries(data.content.converters)) set(content.converters[id], v, spotKeys.converters);
  set(content.structures["struct.depot"], data.content.structures["struct.depot"], spotKeys["struct.depot"]);
  set(content.structures["struct.medical"], data.content.structures["struct.medical"], spotKeys["struct.medical"]);
  set(content.sinks["sink.sales_point"], data.content.sinks["sink.sales_point"], spotKeys["sink.sales_point"]);
  content.defaults["pads.range"] = data.content.defaults["pads.range"];
  content.defaults["pads.bigRange"] = data.content.defaults["pads.bigRange"];
  applyPlotLayout(data.generator);
  lastPlate = data.render.plate; lastPad = data.render.pad;
}

let lastError = "";
let lastFailLayout: LayoutSnapshot | undefined;
function layout(idx: number): Built | null {
  const r = reqs[idx]!;
  lastFailLayout = undefined;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.5) }, salt);
    } catch (e) {
      // try the next layout salt, as the generator does; keep the first attempt's partial layout for the map
      lastError = (e as Error).message;
      if (e instanceof LayoutError && e.layout && !lastFailLayout) lastFailLayout = e.layout;
    }
  }
  return null;
}

// ---------------------------------------------------------------- map (top-down plan of the generator's layout)

const mapEl = $<HTMLCanvasElement>("map");
let mapShown = params.get("map") === "1";
let mapData: { snap: LayoutSnapshot; fail: string | null } | null = null;
const mapBtn = $("mapBtn");
const showMap = (on: boolean): void => {
  mapShown = on;
  mapEl.classList.toggle("show", on);
  mapBtn.classList.toggle("on", on);
  $("hint").style.display = on ? "none" : "";
  syncUrl();
  drawMap();
};
mapBtn.onclick = () => showMap(!mapShown);
mapEl.classList.toggle("show", mapShown);
mapBtn.classList.toggle("on", mapShown);
$("hint").style.display = mapShown ? "none" : "";

/** Plan view: lot grid, the on-screen limit round the core, walls, footprints (buildings filled, pads outlined), reach circles, and a failed search. */
function drawMap(): void {
  try { drawPlan(); } catch (e) { console.warn("map", e); }
}
function drawPlan(): void {
  if (!mapShown || !mapData) return;
  const { snap, fail } = mapData;
  const dpr = devicePixelRatio || 1, W = mapEl.clientWidth, H = mapEl.clientHeight - ($("panel").offsetHeight || 0);
  mapEl.width = Math.round(W * dpr); mapEl.height = Math.round(mapEl.clientHeight * dpr);
  const g = mapEl.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, mapEl.clientHeight);
  // fit the bounds, everything placed and the failed search regions
  let x0 = snap.bounds[0], y0 = snap.bounds[1], x1 = snap.bounds[0] + snap.bounds[2], y1 = snap.bounds[1] + snap.bounds[3];
  const grow = (x: number, y: number): void => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const s of snap.stations) { grow(s.x - s.r, s.y - s.r); grow(s.x + s.r, s.y + s.r); if (s.fp) { grow(s.fp[0], s.fp[1]); grow(s.fp[2], s.fp[3]); } }
  for (const r of snap.miss?.regions ?? []) { grow(r[0], r[1]); grow(r[0] + r[2], r[1] + r[3]); }
  // a short window (the panel taking most of it) still gets a drawable, if small, plan
  const pad = 24, top = 44, k = Math.max(0.05, Math.min((W - 2 * pad) / (x1 - x0), (Math.max(H, 160) - top - pad) / (y1 - y0)));
  const X = (x: number): number => pad + (x - x0) * k, Y = (y: number): number => top + (y - y0) * k;
  const rect = (a: number, b: number, c: number, d: number): void => g.rect(X(a), Y(b), (c - a) * k, (d - b) * k);
  // playable bounds
  g.fillStyle = "#23252b"; g.beginPath(); rect(snap.bounds[0], snap.bounds[1], snap.bounds[0] + snap.bounds[2], snap.bounds[1] + snap.bounds[3]); g.fill();
  // lot grid: buildings keep inside one lot along each axis they fit in
  if (snap.lots) {
    const P = snap.lots.block + snap.lots.street;
    g.strokeStyle = "#34373f"; g.lineWidth = 1; g.beginPath();
    for (const [c, lo, hi, vert] of [[snap.core[0], x0, x1, true], [snap.core[1], y0, y1, false]] as const) {
      const o = c + snap.lots.street / 2;
      for (let v = o + Math.floor((lo - o) / P) * P; v <= hi; v += P) for (const e of [v, v + snap.lots.block]) {
        if (vert) { g.moveTo(X(e), Y(y0)); g.lineTo(X(e), Y(y1)); } else { g.moveTo(X(x0), Y(e)); g.lineTo(X(x1), Y(e)); }
      }
    }
    g.stroke();
  }
  // key stations must stay inside this box and circle round the core (the camera's reach)
  g.setLineDash([6, 5]); g.strokeStyle = "#6c7a8f"; g.lineWidth = 1.5;
  g.beginPath(); rect(snap.core[0] - snap.screen[0], snap.core[1] - snap.screen[1], snap.core[0] + snap.screen[0], snap.core[1] + snap.screen[1]); g.stroke();
  if (snap.screen[2]) { g.beginPath(); g.arc(X(snap.core[0]), Y(snap.core[1]), snap.screen[2] * k, 0, Math.PI * 2); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = "rgba(200,80,80,0.25)";
  for (const b of snap.blocked) { g.beginPath(); rect(b[0], b[1], b[0] + b[2], b[1] + b[3]); g.fill(); }
  g.strokeStyle = "#9aa0a8"; g.lineWidth = 4;
  for (const [a, b] of snap.walls) { g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.stroke(); }
  // plots: each building with its slots (stations named "<id>:<slot>"), as one dashed outline
  g.setLineDash([4, 3]); g.strokeStyle = "#b39ddb"; g.lineWidth = 1.2;
  for (const s of snap.stations) {
    if (!s.fp || s.id.includes(":")) continue;
    const kids = snap.stations.filter((c) => c.id.startsWith(`${s.id}:`) && c.fp);
    if (!kids.length) continue;
    let b = [...s.fp];
    for (const c of kids) b = [Math.min(b[0]!, c.fp![0]), Math.min(b[1]!, c.fp![1]), Math.max(b[2]!, c.fp![2]), Math.max(b[3]!, c.fp![3])];
    g.beginPath(); rect(b[0]! - 3, b[1]! - 3, b[2]! + 3, b[3]! + 3); g.stroke();
  }
  g.setLineDash([]);
  // reach circles first, then footprints, then labels on top
  g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,0.10)";
  for (const s of snap.stations) { g.beginPath(); g.arc(X(s.x), Y(s.y), s.r * k, 0, Math.PI * 2); g.stroke(); }
  const isPad = (s: LayoutSnapshot["stations"][number]): boolean => !s.solid && !!s.fp;
  for (const s of snap.stations) {
    if (!s.fp) { g.fillStyle = "#6fae6a"; g.beginPath(); g.arc(X(s.x), Y(s.y), Math.max(3, 6 * k), 0, Math.PI * 2); g.fill(); continue; }
    g.beginPath(); rect(s.fp[0], s.fp[1], s.fp[2], s.fp[3]);
    if (isPad(s)) { g.strokeStyle = "#5fb7e8"; g.lineWidth = 1.5; g.stroke(); }
    else { g.fillStyle = s.tight ? "rgba(111,174,106,0.55)" : "rgba(224,162,90,0.55)"; g.fill(); g.strokeStyle = "#e0a25a"; g.lineWidth = 1; g.stroke(); }
  }
  // the drawn model's own ground box (Meshy fit x building scale): the slack between it and the footprint is reserved but empty
  g.strokeStyle = "#ffffff"; g.lineWidth = 1.5;
  for (const s of snap.stations) {
    if (!s.kind) continue;
    for (const lv of s.kind === "sink.core" ? [1, 3] : [1]) {
      const e = meshyFor(s.kind, lv), b = e && meshyBounds(e.file);
      if (!b) continue;
      const m = ART_M * (isSizedFootprint(s.kind) ? val.size! * modelScaleFor(scaleMap(), s.kind, lv) : 1);
      g.setLineDash(lv === 1 ? [] : [3, 3]);
      g.beginPath(); rect(s.x + b[0]! * m, s.y + b[2]! * m, s.x + b[3]! * m, s.y + b[5]! * m); g.stroke();
    }
  }
  g.setLineDash([]);
  g.fillStyle = "#e8eef4";
  for (const sp of snap.spots) { g.beginPath(); g.arc(X(sp.x), Y(sp.y), 2.5, 0, Math.PI * 2); g.fill(); }
  g.font = "11px system-ui, sans-serif"; g.textAlign = "center";
  for (const s of snap.stations) {
    if (s.tight) continue;
    const label = s.id.replace(/^(sink|conv|struct|node)\./, "");
    g.fillStyle = "rgba(0,0,0,0.6)"; const w = g.measureText(label).width + 6; g.fillRect(X(s.x) - w / 2, Y(s.y) - 7, w, 14);
    g.fillStyle = isPad(s) ? "#bfe6fb" : "#fff"; g.fillText(label, X(s.x), Y(s.y) + 4);
  }
  // the search that found no room: its region(s) and the footprint it had to fit
  const miss = snap.miss;
  if (fail && miss) {
    g.setLineDash([5, 4]); g.strokeStyle = "#ff6b5a"; g.lineWidth = 2; g.fillStyle = "rgba(255,107,90,0.12)";
    for (const r of miss.regions) { g.beginPath(); rect(r[0], r[1], r[0] + r[2], r[1] + r[3]); g.fill(); g.stroke(); }
    g.setLineDash([]);
    if (miss.fp) for (const r of miss.regions) {
      const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      g.strokeStyle = "#ff6b5a"; g.lineWidth = 2; g.beginPath(); rect(cx + miss.fp[0], cy + miss.fp[1], cx + miss.fp[2], cy + miss.fp[3]); g.stroke();
    }
  }
  // legend
  g.textAlign = "left"; g.font = "13px system-ui, sans-serif";
  g.fillStyle = fail ? "#ff8a7a" : "#d8d4cc";
  const fpTxt = miss?.fp ? ` · needs ${miss.fp[2] - miss.fp[0]}×${miss.fp[3] - miss.fp[1]}` : "";
  g.fillText(fail ? `Failed: ${fail}${miss ? ` (searched the red zone for ${miss.id}${fpTxt})` : ""}` : "Layout fits", 12, 18);
  g.fillStyle = "#9a978f"; g.font = "12px system-ui, sans-serif";
  g.fillText("orange: building footprint · green: gatherables · white: the drawn model (dashed: core L3) · blue outline: pad (any stage) · purple dashes: a plot · dashed box/circle: camera limit for key stations · grid: lots", 12, 34);
}
addEventListener("resize", drawMap);

/** The end state: stand on every pad with money until it completes, a few rounds deep, then force whatever is left (a layout preview, not play). */
function buildEverything(sim: Sim): void {
  const st = sim.state as State;
  for (const b of st.barriers) for (const sec of b.sections) { sec.built = true; sec.hp = sec.hpMax; sec.paid = b.costPerSection; }
  for (let round = 0; round < 8; round++) {
    let any = false;
    for (const pad of st.pads) {
      if (pad.done) continue;
      pad.visible = true;
      any = true;
      for (let i = 0; i < 240 && !pad.done && !st.over; i++) {
        st.currency = 999;
        pad.visible = true;
        st.player.pos = { ...pad.pos };
        sim.step({ dx: 0, dy: 0 });
      }
    }
    if (!any) break;
  }
  // then finish what paying could not reach (pads behind waves, manual-first hires, item costs, core level locks),
  // in unlock order, so the plan shows the level's end state
  const req = (id: string): string | undefined => (sim.compiled.entityById[id] as { requires?: { pad?: string } } | undefined)?.requires?.pad;
  const done = (id: string): boolean => st.pads.some((p) => p.id === id && p.done) || st.built.includes(id);
  for (let round = 0; round < 12; round++) {
    let any = false;
    for (const pad of st.pads) {
      const r = req(pad.id);
      if (pad.done || (r !== undefined && !done(r))) continue;
      forceBuildPad(st, sim.compiled, pad.id);
      any ||= pad.done;
      sim.step({ dx: 0, dy: 0 });
    }
    if (!any) break;
  }
}

const stage = $("stage");
let renderer: Renderer3D | null = null;
let sim: Sim | null = null;
let built: Built | null = null;
/** The level the camera was last centred on. */
let centredFor = -1;
const cam = createCamera();
cam.follow = false;

function rebuild(): void {
  const t0 = performance.now();
  applyKnobs();
  const idx = Number(levelSel.value);
  built = layout(idx);
  if (!built) {
    status(`The generator could not fit this level with these values (${lastError}). Loosen a slider; the map shows where it got stuck.`, true);
    if (lastFailLayout) { mapData = { snap: lastFailLayout, fail: lastError }; showMap(true); }
    return;
  }
  mapData = { snap: built.layout, fail: null };
  drawMap();
  const m = built.manifest as unknown as { goal?: Record<string, unknown> };
  if (m.goal && "n" in m.goal && m.goal.n == null) m.goal.n = 10;
  try { sim = createSim(built.manifest); } catch (e) { status(`Could not start the level: ${(e as Error).message}`, true); return; }
  buildEverything(sim);
  renderer?.dispose();
  renderer = new Renderer3D({ quality: "medium" });
  renderer.devBuildScale = val.size!;
  renderer.devModelScale = scaleMap();
  renderer.devPadScale = lastPad / GAME_PAD;
  renderer.devPlateSize = lastPlate;
  renderer.hudAnchor = () => ({ x: 40, y: 24 });
  renderer.init(sim.compiled.manifest, getSkin(DEFAULT_SKIN), stage);
  (window as unknown as { __sandbox: unknown }).__sandbox = { renderer, sim, built };
  applyView();
  // the view stays where it was dragged when a setting changes; only a new level (or the Centre button) recentres it
  if (idx !== centredFor) { centre(); centredFor = idx; }
  const core = built.manifest.entities.find((e) => (e as { type: string }).type === "sink.core") as { at?: [number, number] } | undefined;
  const c = core?.at ?? [240, 440];
  const spread = Math.max(0, ...built.stations.filter((s) => s.fp).map((s) => Math.hypot(s.x - c[0], s.y - c[1])));
  const left = sim.state.pads.filter((p) => !p.done).length;
  status(`${built.stations.filter((s) => s.fp).length} placed${left ? ` · ${left} pad${left === 1 ? "" : "s"} left unbuilt (hires with no free colonist)` : ""} · base reaches ${Math.round(spread)} units from the core · map ${built.manifest.map.w}×${built.manifest.map.h} · built in ${Math.round(performance.now() - t0)} ms`);
}

function applyView(): void {
  if (renderer) { renderer.camOverride = { pitch: PITCH_DEG, yaw: YAW_DEG, fov: FOV_DEG, viewW: val.zoom! }; renderer.devTextScale = val.text!; renderer.devCharScale = val.char!; }
  // the text slider reads as the main text size it gives (units.ts TEXT.main)
  if (outs.text) outs.text.textContent = String(Math.round(TEXT.main * val.text! * 10) / 10);
}

function centre(): void {
  if (!sim) return;
  cam.x = sim.state.core.pos.x / FP;
  cam.y = sim.state.core.pos.y / FP;
}

// ---------------------------------------------------------------- pan

let drag: { x: number; y: number } | null = null;
stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); });
stage.addEventListener("pointerup", () => { drag = null; });
stage.addEventListener("pointercancel", () => { drag = null; });
stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const k = val.zoom! / stage.clientWidth;
  const sin = Math.sin((PITCH_DEG * Math.PI) / 180);
  const w = screenToWorld(-(e.clientX - drag.x) * k, (-(e.clientY - drag.y) * k) / sin);
  cam.x += w.x;
  cam.y += w.y;
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener("resize", () => renderer?.resize(stage.clientWidth, stage.clientHeight));

function frame(): void {
  if (renderer && sim) renderer.sync(sim.state, 0, cam);
  requestAnimationFrame(frame);
}

syncUrl();
applyView();
rebuild();
requestAnimationFrame(frame);
