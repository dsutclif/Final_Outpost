import { LOOK } from "@fo/content";
import { createAssetTable } from "@fo/render-3d/table";
import { createSim } from "@fo/sim";
import type { Manifest } from "@fo/content";
import { goldenLevelSource, storyLevelSource, type LevelSource } from "../levels.js";
import { CODE_CONSTANTS, fighterSections, type StatSection } from "./fighterStats.js";

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

// ---- Fighter stats (R6 N5b): real values only, from content data plus the picked level's params ----
const statsEl = $("stats");
const sources: LevelSource[] = [goldenLevelSource(), storyLevelSource()];
let statsLevel: Manifest | null = null;

const el = (tag: string, text?: string, cls?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

function leashOf(m: Manifest): string {
  try {
    const l = createSim(structuredClone(m)).compiled.guards.leash;
    return l === null ? "none (no wall)" : `${+(l / 1000).toFixed(1)} u past the wall`;
  } catch { return "n/a (level pinned to another engine)"; }
}

function renderStats(): void {
  statsEl.replaceChildren();
  const pick = el("select") as HTMLSelectElement;
  pick.append(new Option("Defaults (no level)", ""));
  statsEl.append(el("label", "Level params over defaults: "), pick);
  void Promise.all(sources.map((s) => s.list())).then((lists) => {
    for (const m of lists.flat()) pick.append(new Option(m.id, m.id));
    pick.value = statsLevel?.id ?? "";
  });
  pick.onchange = async () => {
    const id = pick.value;
    statsLevel = null;
    if (id) for (const s of sources) {
      try { statsLevel = await s.load(id); break; } catch { /* next source */ }
    }
    renderStats();
  };
  const secs: StatSection[] = fighterSections(statsLevel);
  if (statsLevel) {
    const g = secs.find((x) => x.id === "guard");
    g?.rows.push({ label: "Leash", value: leashOf(statsLevel), src: "systems/guards.ts leashLine (this level's wall and turret spots)", code: true });
  }
  for (const s of secs) {
    statsEl.append(el("h3", s.title));
    if (s.note) statsEl.append(el("p", s.note, "note"));
    const t = el("table");
    for (const r of s.rows) {
      const tr = el("tr", undefined, r.code ? "code" : "");
      tr.append(el("td", r.label), el("td", r.value, "v"), el("td", r.src, "s"));
      t.append(tr);
    }
    statsEl.append(t);
  }
  statsEl.append(el("h3", "Constants written into sim code"), el("p", "packages/sim/src; not in data files.", "note"));
  const ct = el("table");
  for (const c of CODE_CONSTANTS) {
    const tr = el("tr", undefined, "code");
    tr.append(el("td", c.what), el("td", c.value, "v"), el("td", c.where, "s"));
    ct.append(tr);
  }
  statsEl.append(ct);
}
$("statsBtn").onclick = () => {
  const open = statsEl.classList.toggle("open");
  if (open) renderStats();
};
