import { FP, createSim, type Sim, type State } from "@fo/sim";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { LOOK } from "@fo/content";
import { GEN, buildLevel, knobsFor, templateById, type Built } from "@fo/generator";
import { closure, sequenceRange } from "@fo/sequencer";
import { PITCH_DEG, YAW_DEG, FOV_DEG, TEXT, VIEW_W, CHAR_K, createCamera, screenToWorld } from "@fo/render-3d";
import { Renderer3D } from "@fo/render-3d/renderer";

// Layout sandbox (docs/BACKLOG-R4.md batch 0): rebuilds a sequenced level's layout with the real
// generator in the browser, with the spacing knobs from generator.json on sliders, completes
// every pad so the whole base shows, and draws it with the real 3D renderer. Dev tool only: it
// writes to the generator's data objects in this page and nothing reaches a pack.

// the generator's debug logging reads process.env (it normally runs under Node)
(globalThis as { process?: unknown }).process ??= { env: {} };

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LEVELS = 60;
const reqs = sequenceRange(1, LEVELS);
// the footprints in generator.json already carry GEN.buildScale; undo it so the slider is absolute
const sizedKey = (k: string) => /^(sink|conv|struct)\./.test(k) || k === "node.food_source";
const baseFootprints = Object.fromEntries(Object.entries(GEN.footprints).map(([k, b]) => [k, sizedKey(k) ? b.map((v) => v / LOOK.buildScale) : b])) as typeof GEN.footprints;

interface Knob { key: string; label: string; min: number; max: number; step: number; def: number; rebuild: boolean }
const KNOBS: Knob[] = [
  { key: "gap", label: "Building gap", min: -10, max: 30, step: 1, def: GEN.spacing.footprintGap, rebuild: true },
  { key: "pull", label: "Pull to core", min: 0, max: 8, step: 0.1, def: GEN.spacing.corePull, rebuild: true },
  { key: "fpull", label: "Pull fields in", min: 0, max: 0.9, step: 0.05, def: GEN.spacing.fieldPull ?? 0, rebuild: true },
  { key: "char", label: "Character size", min: 0.5, max: 2.5, step: 0.05, def: CHAR_K, rebuild: false },
  { key: "size", label: "Building size", min: 0.6, max: 1.5, step: 0.05, def: LOOK.buildScale, rebuild: true },
  { key: "zoom", label: "View width", min: 100, max: 450, step: 10, def: VIEW_W, rebuild: false },
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
  for (const k of KNOBS) if (val[k.key] !== k.def) q.set(k.key, String(val[k.key]));
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

levelSel.onchange = () => { syncUrl(); schedule(0); };
$("toggle").onclick = () => { const p = $("panel"); p.classList.toggle("hidden"); $("toggle").textContent = p.classList.contains("hidden") ? "Show" : "Hide"; };
$("vibeBtn").onclick = () => { $("vibe").classList.toggle("show"); $("vibeBtn").classList.toggle("on"); };
$("vibe").onclick = () => $("vibe").classList.toggle("big");
$("reset").onclick = () => {
  for (const k of KNOBS) { val[k.key] = k.def; inputs[k.key]!.value = String(k.def); outs[k.key]!.textContent = String(k.def); }
  syncUrl();
  schedule(0);
};
$("center").onclick = () => centre();
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
  const s = val.size!;
  for (const [k, b] of Object.entries(baseFootprints)) {
    GEN.footprints[k] = sizedKey(k) ? [Math.round(b[0] * s), Math.round(b[1] * s), Math.round(b[2] * s), Math.round(b[3] * s)] : [...b];
  }
}

let lastError = "";
function layout(idx: number): Built | null {
  const r = reqs[idx]!;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.5) }, salt);
    } catch (e) { lastError = (e as Error).message; /* try the next layout salt, as the generator does */ }
  }
  return null;
}

/** Stand on every pad with money until it completes, a few rounds deep; unlock gates are skipped (a layout preview, not play). */
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
}

const stage = $("stage");
let renderer: Renderer3D | null = null;
let sim: Sim | null = null;
let built: Built | null = null;
const cam = createCamera();
cam.follow = false;

function rebuild(): void {
  const t0 = performance.now();
  applyKnobs();
  const idx = Number(levelSel.value);
  built = layout(idx);
  if (!built) { status(`The generator could not fit this level with these values (${lastError}). Loosen a slider.`, true); return; }
  const m = built.manifest as unknown as { goal?: Record<string, unknown> };
  if (m.goal && "n" in m.goal && m.goal.n == null) m.goal.n = 10;
  try { sim = createSim(built.manifest); } catch (e) { status(`Could not start the level: ${(e as Error).message}`, true); return; }
  buildEverything(sim);
  renderer?.dispose();
  renderer = new Renderer3D({ quality: "medium" });
  renderer.devBuildScale = val.size!;
  renderer.hudAnchor = () => ({ x: 40, y: 24 });
  renderer.init(sim.compiled.manifest, getSkin(DEFAULT_SKIN), stage);
  (window as unknown as { __sandbox: unknown }).__sandbox = { renderer, sim, built };
  applyView();
  centre();
  const core = built.manifest.entities.find((e) => (e as { type: string }).type === "sink.core") as { at?: [number, number] } | undefined;
  const c = core?.at ?? [240, 440];
  const spread = Math.max(0, ...built.stations.filter((s) => s.fp).map((s) => Math.hypot(s.x - c[0], s.y - c[1])));
  status(`${built.stations.filter((s) => s.fp).length} placed · base reaches ${Math.round(spread)} units from the core · built in ${Math.round(performance.now() - t0)} ms`);
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
rebuild();
requestAnimationFrame(frame);
