import { FP, createSim, type Sim, type State } from "@fo/sim";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { LOOK } from "@fo/content";
import { GEN, buildLevel, knobsFor, templateById, type Built } from "@fo/generator";
import { closure, sequenceRange } from "@fo/sequencer";
import { PITCH_DEG, YAW_DEG, FOV_DEG, VIEW_W, createCamera, screenToWorld } from "@fo/render-3d";
import { Renderer3D, setMeshyBrightness } from "@fo/render-3d/renderer";

// Layout sandbox (docs/BACKLOG-R4.md batch 0): rebuilds a sequenced level's layout with the real
// generator in the browser, with the data defaults, completes
// every pad so the whole base shows, and draws it with the real 3D renderer. Dev tool only: it
// writes to the generator's data objects in this page and nothing reaches a pack.

// the generator's debug logging reads process.env (it normally runs under Node)
(globalThis as { process?: unknown }).process ??= { env: {} };

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LEVELS = 60;
const reqs = sequenceRange(1, LEVELS);
const BRIGHT_DEF = LOOK.modelBrightness;
let bright = params.has("b") ? Number(params.get("b")) : BRIGHT_DEF;

// ---------------------------------------------------------------- controls

const levelSel = $<HTMLSelectElement>("level");
reqs.forEach((r, i) => levelSel.add(new Option(`L${i + 1} · ${r.family}${r.secondary ? "+" + r.secondary : ""} · ${r.template}`, String(i))));
levelSel.value = String(Math.max(0, Math.min(LEVELS - 1, Number(params.get("l") ?? 4) - 1)));

const bRow = document.createElement("div");
bRow.className = "row";
bRow.innerHTML = `<label>Model brightness</label><input type="range" min="0.5" max="3" step="0.05"><output></output>`;
const bInp = bRow.querySelector("input")!, bOut = bRow.querySelector("output")!;
bInp.value = String(bright);
bOut.textContent = String(bright);
bInp.oninput = () => { bright = Number(bInp.value); bOut.textContent = bInp.value; setMeshyBrightness(bright); syncUrl(); };
$("sliders").appendChild(bRow);

function syncUrl(): void {
  const q = new URLSearchParams({ l: String(Number(levelSel.value) + 1) });
  if (bright !== BRIGHT_DEF) q.set("b", String(bright));
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

levelSel.onchange = () => { syncUrl(); schedule(0); };
$("toggle").onclick = () => { const p = $("panel"); p.classList.toggle("hidden"); $("toggle").textContent = p.classList.contains("hidden") ? "Show" : "Hide"; };
$("vibeBtn").onclick = () => { $("vibe").classList.toggle("show"); $("vibeBtn").classList.toggle("on"); };
$("vibe").onclick = () => $("vibe").classList.toggle("big");
$("reset").onclick = () => {
  bright = BRIGHT_DEF; bInp.value = String(bright); bOut.textContent = String(bright);
  setMeshyBrightness(bright);
  syncUrl();
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
  const idx = Number(levelSel.value);
  built = layout(idx);
  if (!built) { status(`The generator could not fit this level with these values (${lastError}).`, true); return; }
  const m = built.manifest as unknown as { goal?: Record<string, unknown> };
  if (m.goal && "n" in m.goal && m.goal.n == null) m.goal.n = 10;
  try { sim = createSim(built.manifest); } catch (e) { status(`Could not start the level: ${(e as Error).message}`, true); return; }
  buildEverything(sim);
  renderer?.dispose();
  renderer = new Renderer3D({ quality: "medium" });
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
  if (renderer) renderer.camOverride = { pitch: PITCH_DEG, yaw: YAW_DEG, fov: FOV_DEG, viewW: VIEW_W };
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
  const k = VIEW_W / stage.clientWidth;
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

setMeshyBrightness(bright);
syncUrl();
rebuild();
requestAnimationFrame(frame);
