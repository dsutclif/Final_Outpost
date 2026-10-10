import { content, type Manifest } from "@fo/content";
import { createSim } from "@fo/sim";
import { Renderer2D, createCamera, drawLabCell, labDrawable, labVariants } from "@fo/render-2d";
import { SKINS, canonicalIds, nameOf } from "@fo/skins";
import type { LevelSource } from "../levels.js";

// Dev-only asset lab (#lab): every canonical id in every skin, side by side, in each visual
// state the renderer knows, plus a button that renders every level at tick 0 and later and
// downloads PNGs (golden screenshots by hand; node has no canvas without a dependency).

const CELL = 92;

export async function mountLab(root: HTMLElement, source: LevelSource): Promise<void> {
  const metas = await source.list();
  const manifest: Manifest = await source.load(metas[0]!.id);
  const ids = canonicalIds(content);
  const skins = Object.values(SKINS);
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const cat = id.split(".")[0]!;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(id);
  }
  const showAll = new URLSearchParams(location.hash.split("?")[1] ?? "").has("all");
  root.innerHTML = `<div class="lab">
    <header class="lab-head">
      <a href="#" class="lab-back">&larr; Game</a>
      <h1>Asset lab</h1>
      <label><input type="checkbox" id="labAll" ${showAll ? "checked" : ""}> text-only ids</label>
      <button id="labSnap">Snapshot all levels</button>
      <span id="labMsg"></span>
    </header>
    <div class="lab-legend">${skins.map((s) => `<span>${s.name}</span>`).join("")}</div>
    <div id="labGrid"></div>
  </div>`;
  const style = document.createElement("style");
  style.textContent = LAB_CSS;
  document.head.appendChild(style);
  document.body.style.overflow = "auto";
  const grid = root.querySelector<HTMLElement>("#labGrid")!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const draws: (() => void)[] = [];
  for (const [cat, list] of groups) {
    const shown = list.filter((id) => showAll || labDrawable(id));
    if (!shown.length) continue;
    const sec = document.createElement("section");
    sec.innerHTML = `<h2>${cat}</h2>`;
    for (const id of shown) {
      const row = document.createElement("div");
      row.className = "lab-row";
      row.innerHTML = `<div class="lab-id"><code>${id}</code>${skins.map((s) => `<small>${s.name}: ${nameOf(s, id)}</small>`).join("")}</div>`;
      for (const skin of skins) {
        const cells = document.createElement("div");
        cells.className = "lab-cells";
        cells.style.background = skin.palette.ground;
        for (const variant of labVariants(id)) {
          const fig = document.createElement("figure");
          const c = document.createElement("canvas");
          c.width = CELL * dpr; c.height = CELL * dpr;
          c.style.width = c.style.height = `${CELL}px`;
          fig.appendChild(c);
          const cap = document.createElement("figcaption");
          cap.textContent = variant;
          fig.appendChild(cap);
          cells.appendChild(fig);
          draws.push(() => {
            const g = c.getContext("2d");
            if (!g) return;
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.clearRect(0, 0, CELL, CELL);
            drawLabCell(g, id, variant, CELL, CELL, { skin, manifest });
          });
        }
        row.appendChild(cells);
      }
      sec.appendChild(row);
    }
    grid.appendChild(sec);
  }
  for (const d of draws) d();
  root.querySelector<HTMLInputElement>("#labAll")!.addEventListener("change", (e) => {
    location.hash = (e.target as HTMLInputElement).checked ? "#lab?all" : "#lab";
    location.reload();
  });
  const msg = root.querySelector<HTMLElement>("#labMsg")!;
  root.querySelector<HTMLButtonElement>("#labSnap")!.addEventListener("click", () => {
    void snapshotAll(source, (s) => { msg.textContent = s; });
  });
}

/** Render each level at tick 0 and after 30 s of idle play, then download both as PNG. */
export async function snapshotAll(source: LevelSource, report: (s: string) => void, ticksLater = 900): Promise<number> {
  const metas = await source.list();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:375px;height:727px";
  document.body.appendChild(host);
  let n = 0;
  try {
    for (const meta of metas) {
      for (const skin of Object.values(SKINS)) {
        const m = await source.load(meta.id);
        const sim = createSim(m);
        let clock = 0;
        const r = new Renderer2D({ now: () => clock, dpr: () => 2 });
        r.init(sim.compiled.manifest, skin, host);
        const cam = createCamera();
        const shot = async (tag: string): Promise<void> => {
          clock += 1000;
          r.snapCamera();
          r.sync(sim.state, 0, cam);
          const canvas = host.querySelector("canvas")!;
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
          if (!blob) return;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${meta.id}-${skin.id}-${tag}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          n++;
          report(`${n} shots`);
        };
        await shot("t0");
        for (let i = 0; i < ticksLater; i++) for (const e of sim.step({ dx: 0, dy: 0 })) r.onEvent(e);
        await shot(`t${ticksLater}`);
        r.dispose();
      }
    }
  } finally {
    host.remove();
  }
  report(`done: ${n} PNGs`);
  return n;
}

const LAB_CSS = `
.lab { font: 13px/1.35 system-ui, sans-serif; color: #f3ece1; padding: 12px; background: #2a1a14; min-height: 100%; }
.lab-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; position: sticky; top: 0; background: #2a1a14; padding: 6px 0; z-index: 2; }
.lab-head h1 { font-size: 20px; margin: 0; }
.lab-head a { color: #4fd1ff; }
.lab-head button { min-height: 34px; font-size: 14px; }
.lab h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .1em; color: #ffcb3d; margin: 18px 0 6px; }
.lab-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; padding: 6px 0; border-top: 1px solid rgba(255,255,255,.08); }
.lab-id { width: 190px; display: grid; gap: 2px; }
.lab-id code { color: #fff; font-size: 12px; }
.lab-id small { color: #bba; }
.lab-cells { display: flex; gap: 4px; padding: 4px; border-radius: 8px; }
.lab-cells figure { margin: 0; display: grid; justify-items: center; }
.lab-cells figcaption { font-size: 10px; color: #fff; opacity: .8; }
.lab-legend { display: flex; gap: 10px; margin: 4px 0 0 198px; color: #bba; }
`;
