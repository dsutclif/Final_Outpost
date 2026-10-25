import { LOOK } from "@fo/content";
import { createAssetTable } from "@fo/render-3d/table";

// Asset table (dev tool): every built Meshy model on a ground plane, lit like the game, with a
// live "Model brightness" slider (URL param b). No level, generator or sim. Drag to pan.

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const BRIGHT_DEF = LOOK.modelBrightness;
const asNum = Number(params.get("b"));
let bright = params.has("b") && Number.isFinite(asNum) ? Math.max(0.5, Math.min(3, asNum)) : BRIGHT_DEF;

const stage = $("stage");
const table = createAssetTable(stage, bright);

const bInp = $<HTMLInputElement>("bright"), bOut = $("brightOut");
bInp.value = String(bright);
bOut.textContent = bright.toFixed(2);
bInp.oninput = () => {
  bright = Number(bInp.value);
  bOut.textContent = bright.toFixed(2);
  table.setBrightness(bright);
  syncUrl();
};

function syncUrl(): void {
  const q = new URLSearchParams();
  if (bright !== BRIGHT_DEF) q.set("b", String(bright));
  history.replaceState(null, "", `${location.pathname}${q.size ? "?" + q : ""}`);
}

const statusEl = $("status");
function status(t: string): void { statusEl.textContent = t; }

$("center").onclick = () => table.centre();
$("reset").onclick = () => {
  bright = BRIGHT_DEF; bInp.value = String(bright); bOut.textContent = bright.toFixed(2);
  table.setBrightness(bright);
  syncUrl();
};
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); status("Link copied: send it to Claude to lock this value."); }
  catch { status(location.href); }
};

let drag: { x: number; y: number } | null = null;
stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); });
stage.addEventListener("pointerup", () => { drag = null; });
stage.addEventListener("pointercancel", () => { drag = null; });
stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  table.pan(e.clientX - drag.x, e.clientY - drag.y);
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener("resize", () => table.resize());

syncUrl();
status("Loading models…");
const poll = window.setInterval(() => {
  if (table.status.placed > 0) { clearInterval(poll); status(`${table.status.placed} models · drag to pan`); }
}, 300);
(window as unknown as { __table: unknown }).__table = table;
