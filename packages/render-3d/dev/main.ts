import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION, FP, TPS, createSim, type Input, type Sim, type State } from "@fo/sim";
import { DEFAULT_SKIN, SKINS, getSkin } from "@fo/skins";
import { WebGLRenderer } from "three";
import l1 from "../../../levels/golden/proto-L001.json";
import l2 from "../../../levels/golden/proto-L002.json";
import l3 from "../../../levels/golden/proto-L003.json";
import l4 from "../../../levels/golden/proto-L004.json";
import { createCamera } from "../src/contract.js";
import { buildAssetLab, type AssetLab } from "../src/lab.js";
import { Renderer3D } from "../src/renderer.js";
import type { QualityTier } from "../src/units.js";

// Standalone harness: plays a golden level on the real sim with keyboard input through the
// 3D renderer, and shows the asset lab. Query params: level=1..4, skin, q=low|medium|high,
// mode=lab, ff=<ticks> (fast-forward before rendering), stage=walls (dev-only: build every
// wall section so a wave can be framed against finished lines).

const LEVELS = [l1, l2, l3, l4].map((m) => ({ ...m, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION }));
const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const levelSel = $<HTMLSelectElement>("level");
LEVELS.forEach((m, i) => levelSel.add(new Option(`${i + 1} · ${m.id}`, String(i))));
levelSel.value = String(Math.max(0, Math.min(3, Number(params.get("level") ?? 1) - 1)));
const skinSel = $<HTMLSelectElement>("skin");
for (const s of Object.values(SKINS)) skinSel.add(new Option(s.name, s.id));
skinSel.value = params.get("skin") ?? DEFAULT_SKIN;
const qSel = $<HTMLSelectElement>("quality");
qSel.value = params.get("q") ?? "medium";
const ffIn = $<HTMLInputElement>("ff");
ffIn.value = params.get("ff") ?? "0";

if (params.get("full")) document.body.classList.add("full");
const stage = $("stage");
const info = $("info");
addEventListener("resize", () => { const r = stage.getBoundingClientRect(); renderer?.resize(r.width, r.height); });
const statsEl = $("stats");
const keys = { left: false, right: false, up: false, down: false };
const KEYMAP: Record<string, keyof typeof keys> = { arrowleft: "left", a: "left", arrowright: "right", d: "right", arrowup: "up", w: "up", arrowdown: "down", s: "down" };
addEventListener("keydown", (e) => { const k = KEYMAP[e.key.toLowerCase()]; if (k) { keys[k] = true; e.preventDefault(); } });
addEventListener("keyup", (e) => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys[k] = false; });
const input = (): Input => {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (!x && !y) return { dx: 0, dy: 0 };
  const m = Math.hypot(x, y);
  return { dx: Math.trunc((x / m) * FP), dy: Math.trunc((y / m) * FP) };
};

let sim: Sim;
let renderer: Renderer3D | null = null;
let cam = createCamera();
let acc = 0;
let last = performance.now();

function stageWalls(s: State): void {
  for (const b of s.barriers) for (const sec of b.sections) { sec.built = true; sec.hp = sec.hpMax; sec.paid = b.costPerSection; }
}

function start(): void {
  renderer?.dispose();
  const manifest = LEVELS[Number(levelSel.value)]!;
  sim = createSim(manifest);
  if (params.get("stage") === "walls") stageWalls(sim.state as State);
  const ff = Math.max(0, Number(ffIn.value) || 0);
  for (let i = 0; i < ff && !sim.state.over; i++) sim.step({ dx: 0, dy: 0 });
  renderer = new Renderer3D({ quality: qSel.value as QualityTier });
  renderer.hudAnchor = () => ({ x: 40, y: 24 });
  renderer.init(sim.compiled.manifest, getSkin(skinSel.value), stage);
  cam = createCamera();
  acc = 0;
  (window as unknown as { __fo: unknown }).__fo = { sim, renderer, cam, advance, keys };
}

// ---------------------------------------------------------------- asset lab

let lab: AssetLab | null = null;
let labGL: WebGLRenderer | null = null;
function openLab(): void {
  closeLab();
  const host = $("lab");
  const r = host.getBoundingClientRect();
  labGL = new WebGLRenderer({ antialias: true });
  labGL.setPixelRatio(Math.min(2, devicePixelRatio));
  labGL.setSize(r.width, r.height);
  host.appendChild(labGL.domElement);
  const make = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  lab = buildAssetLab(getSkin(skinSel.value), make, r.width / r.height);
  lab.setAnchors($<HTMLInputElement>("anchors").checked);
  const rows = lab.entries.map((e) => `${e.tris > e.budget ? "!!" : "  "} ${e.id.padEnd(30)} ${e.cls.padEnd(9)} ${String(e.tris).padStart(5)} / ${e.budget}${e.fallback ? "  (fallback)" : ""}`);
  info.textContent = `asset lab: ${lab.entries.length} ids\n\n${rows.join("\n")}`;
}
function closeLab(): void {
  lab?.dispose();
  lab = null;
  labGL?.domElement.remove();
  labGL?.dispose();
  labGL = null;
}

function setMode(m: "game" | "lab"): void {
  document.body.classList.toggle("mode-lab", m === "lab");
  $("mGame").classList.toggle("on", m === "game");
  $("mLab").classList.toggle("on", m === "lab");
  if (m === "lab") openLab(); else { closeLab(); info.textContent = ""; }
}

$("mGame").onclick = () => setMode("game");
$("mLab").onclick = () => setMode("lab");
$("restart").onclick = start;
levelSel.onchange = start;
skinSel.onchange = () => { start(); if (lab) openLab(); };
qSel.onchange = () => renderer?.setQuality(qSel.value as QualityTier);
$<HTMLInputElement>("anchors").onchange = (e) => lab?.setAnchors((e.target as HTMLInputElement).checked);

// ---------------------------------------------------------------- loop

function frame(now: number, loop = true): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (lab && labGL) {
    const r = $("lab").getBoundingClientRect();
    if (r.width > 0 && Math.abs(labGL.domElement.clientWidth - r.width) + Math.abs(labGL.domElement.clientHeight - r.height) > 1) {
      labGL.setSize(r.width, r.height);
      lab.camera.aspect = r.width / r.height;
      lab.camera.updateProjectionMatrix();
    }
    lab.update(dt);
    labGL.render(lab.scene, lab.camera);
  } else if (renderer) {
    acc += dt;
    const step = 1 / TPS;
    let n = 0;
    while (acc >= step && n < 8) {
      if (!sim.state.over) for (const e of sim.step(input())) renderer.onEvent(e);
      acc -= step;
      n++;
    }
    renderer.sync(sim.state, acc / step, cam);
    const s = renderer.stats();
    statsEl.textContent = `tick ${sim.state.tick} · ${s.drawCalls} calls (est ${s.estDrawCalls}) · ${(s.triangles / 1000).toFixed(1)}k tris (est ${(s.estTriangles / 1000).toFixed(1)}k) · ${s.fps} fps · ${s.quality}`;
    info.textContent = infoText(sim.state);
  }
  if (loop) requestAnimationFrame((t) => frame(t));
}

// a hidden or throttled pane may stall requestAnimationFrame: keep the sim moving anyway
setInterval(() => { if (performance.now() - last > 120) frame(performance.now(), false); }, 33);

/** Step the sim n ticks and render each one (screenshots in a throttled pane). */
function advance(n: number): void {
  if (!renderer) return;
  for (let i = 0; i < n && !sim.state.over; i++) {
    for (const e of sim.step(input())) renderer.onEvent(e);
    renderer.sync(sim.state, 0, cam);
  }
}

function infoText(s: State): string {
  return [
    `level ${sim.compiled.manifest.id}`,
    `tick ${s.tick} (${(s.tick / TPS).toFixed(1)} s)`,
    `currency ${s.currency}`,
    `core fuel ${s.core.fuel} level ${s.core.level}`,
    `lifeline ${(s.core.lifeline / 10000).toFixed(0)}%`,
    `stack ${s.player.stack.length}`,
    `residents ${s.residents.length}`,
    `hostiles ${s.hostiles.length}`,
    `wave ${s.waves.idx} ${s.waves.active ? "active" : ""}`,
    `hazard ${s.hazard.phase}`,
    s.over ? `OVER won=${s.won} ${s.reason}` : "",
    "",
    "arrows / WASD to move",
  ].join("\n");
}

start();
if (params.get("mode") === "lab") setMode("lab");
requestAnimationFrame((t) => frame(t));
